const socketIo = require('socket.io');
const config = require('../../config');
const logger = require('../../utils/logger');
const { sanitizeString, preventNoSqlInjection } = require('../../middleware/validation');
const { getCacheService } = require('../cache');

class WebSocketService {
  constructor(server) {
    this.io = socketIo(server, {
      cors: {
        origin: config.cors.allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: config.cors.credentials
      },
      pingTimeout: config.websocket.connectionTimeout,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
      maxHttpBufferSize: 1e6, // 1MB
      allowEIO3: false,
      path: '/socket.io',
      serveClient: false,
      connectTimeout: 45000,
    });

    this.connectedClients = new Map();
    this.roomSubscriptions = new Map();
    this.connectionLimiter = new Map(); // IP-based connection tracking
    this.eventRateLimiter = new Map(); // Event rate limiting per client
    this.cacheService = getCacheService();
    
    this.setupSecurityMiddleware();
    this.setupEventHandlers();
    this.startHeartbeat();
    this.startCleanupTask();
  }

  setupSecurityMiddleware() {
    // Authentication middleware
    this.io.use((socket, next) => {
      const clientIP = socket.handshake.address;
      
      // Check connection limits per IP
      const currentConnections = this.connectionLimiter.get(clientIP) || 0;
      if (currentConnections >= config.rateLimit.websocket.connectionLimit) {
        logger.warn(`Connection limit exceeded for IP: ${clientIP}`);
        return next(new Error('Connection limit exceeded'));
      }
      
      // Validate origin in production
      if (config.nodeEnv === 'production') {
        const origin = socket.handshake.headers.origin;
        if (!origin || !config.cors.allowedOrigins.includes(origin)) {
          logger.warn(`WebSocket connection rejected for origin: ${origin} from IP: ${clientIP}`);
          return next(new Error('Origin not allowed'));
        }
      }
      
      // Check for suspicious headers (relaxed for development)
      const userAgent = socket.handshake.headers['user-agent'];
      if (config.nodeEnv === 'production' && (!userAgent || userAgent.length < 5)) {
        logger.warn(`Suspicious WebSocket connection from ${clientIP}: invalid user agent`);
        return next(new Error('Invalid user agent'));
      }
      
      // Increment connection count
      this.connectionLimiter.set(clientIP, currentConnections + 1);
      
      next();
    });

    // Rate limiting middleware
    this.io.use((socket, next) => {
      socket.use((event, next) => {
        const clientId = socket.id;
        const now = Date.now();
        
        if (!this.eventRateLimiter.has(clientId)) {
          this.eventRateLimiter.set(clientId, { count: 0, resetTime: now + 60000 });
        }
        
        const limiter = this.eventRateLimiter.get(clientId);
        
        // Reset counter if window has passed
        if (now > limiter.resetTime) {
          limiter.count = 0;
          limiter.resetTime = now + 60000;
        }
        
        // Check rate limit
        if (limiter.count >= config.websocket.maxEventRate) {
          logger.warn(`Event rate limit exceeded for client: ${clientId}`);
          socket.emit('rate_limit_exceeded', {
            message: 'Too many events per minute',
            resetTime: limiter.resetTime
          });
          return next(new Error('Rate limit exceeded'));
        }
        
        limiter.count++;
        next();
      });
      next();
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const clientInfo = {
        id: socket.id,
        connectedAt: new Date(),
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        subscriptions: new Set(),
        lastPing: new Date()
      };

      this.connectedClients.set(socket.id, clientInfo);
      logger.info(`Client connected: ${socket.id} from ${clientInfo.ip}`);

      // Cache client session
      this.cacheClientConnection(socket.id, clientInfo).catch(error => {
        logger.warn(`Failed to cache client session for ${socket.id}:`, error);
      });

      // Send connection confirmation with cached data
      this.sendConnectionEstablished(socket);
      
      // Send mock data only if no live F1 data is available
      // For now, disable mock data to prioritize live F1 data
      // if (config.nodeEnv === 'development') {
      //   this.sendMockDriverData(socket);
      // }

      // Handle subscription requests with input validation
      socket.on('subscribe', (feedName) => {
        const sanitizedFeedName = sanitizeString(feedName);
        this.handleSubscription(socket, sanitizedFeedName);
      });

      socket.on('unsubscribe', (feedName) => {
        const sanitizedFeedName = sanitizeString(feedName);
        this.handleUnsubscription(socket, sanitizedFeedName);
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        clientInfo.lastPing = new Date();
        socket.emit('pong', { timestamp: clientInfo.lastPing.toISOString() });
      });

      // Handle client requests for current data with caching
      socket.on('request:session', () => {
        this.sendCachedSessionData(socket);
      });

      socket.on('request:drivers', () => {
        this.sendCachedDriverData(socket);
      });

      socket.on('request:timing', () => {
        this.sendCachedTimingData(socket);
      });

      socket.on('request:weather', () => {
        this.sendCachedWeatherData(socket);
      });

      socket.on('request:track', () => {
        this.sendCachedTrackData(socket);
      });

      socket.on('request:position', () => {
        this.sendCachedPositionData(socket);
      });

      // Handle client disconnect
      socket.on('disconnect', (reason) => {
        this.handleClientDisconnect(socket.id, reason, clientInfo.ip);
      });

      // Handle connection errors
      socket.on('error', (error) => {
        logger.error(`Socket error for client ${socket.id}:`, error);
      });

      // Update client count
      this.broadcastClientCount();
    });

    // Handle server-side errors
    this.io.engine.on('connection_error', (err) => {
      logger.error('WebSocket connection error:', {
        req: err.req,
        code: err.code,
        message: err.message,
        context: err.context
      });
    });
  }

  handleSubscription(socket, feedName) {
    const clientInfo = this.connectedClients.get(socket.id);
    
    if (!clientInfo) {
      logger.warn(`Subscription request from unknown client: ${socket.id}`);
      return;
    }

    if (!this.isValidFeed(feedName)) {
      socket.emit('subscription:error', { 
        feedName, 
        error: 'Invalid feed name' 
      });
      return;
    }

    // Add to room for this feed
    socket.join(`feed:${feedName}`);
    clientInfo.subscriptions.add(feedName);

    // Track room subscriptions
    if (!this.roomSubscriptions.has(feedName)) {
      this.roomSubscriptions.set(feedName, new Set());
    }
    this.roomSubscriptions.get(feedName).add(socket.id);

    logger.debug(`Client ${socket.id} subscribed to ${feedName}`);
    
    socket.emit('subscription:confirmed', { 
      feedName, 
      subscribedAt: new Date().toISOString() 
    });

    // Send initial data if available
    this.sendInitialFeedData(socket, feedName);
  }

  handleUnsubscription(socket, feedName) {
    const clientInfo = this.connectedClients.get(socket.id);
    
    if (!clientInfo) {
      return;
    }

    socket.leave(`feed:${feedName}`);
    clientInfo.subscriptions.delete(feedName);

    // Update room subscriptions
    const roomSubs = this.roomSubscriptions.get(feedName);
    if (roomSubs) {
      roomSubs.delete(socket.id);
      if (roomSubs.size === 0) {
        this.roomSubscriptions.delete(feedName);
      }
    }

    logger.debug(`Client ${socket.id} unsubscribed from ${feedName}`);
    
    socket.emit('unsubscription:confirmed', { 
      feedName, 
      unsubscribedAt: new Date().toISOString() 
    });
  }

  handleClientDisconnect(clientId, reason, clientIP) {
    const clientInfo = this.connectedClients.get(clientId);
    
    if (clientInfo) {
      logger.info(`Client disconnected: ${clientId} (reason: ${reason})`);
      
      // Clean up room subscriptions
      for (const feedName of clientInfo.subscriptions) {
        const roomSubs = this.roomSubscriptions.get(feedName);
        if (roomSubs) {
          roomSubs.delete(clientId);
          if (roomSubs.size === 0) {
            this.roomSubscriptions.delete(feedName);
          }
        }
      }
      
      // Decrement connection count for IP
      const currentConnections = this.connectionLimiter.get(clientIP) || 0;
      if (currentConnections > 1) {
        this.connectionLimiter.set(clientIP, currentConnections - 1);
      } else {
        this.connectionLimiter.delete(clientIP);
      }
      
      // Clean up rate limiter
      this.eventRateLimiter.delete(clientId);
      
      // Clean up cached client session
      this.cleanupClientSession(clientId).catch(error => {
        logger.warn(`Failed to cleanup cached session for ${clientId}:`, error);
      });
      
      this.connectedClients.delete(clientId);
      this.broadcastClientCount();
    }
  }

  startHeartbeat() {
    setInterval(() => {
      const now = new Date();
      
      // Check for stale connections
      for (const [clientId, clientInfo] of this.connectedClients.entries()) {
        const timeSinceLastPing = now - clientInfo.lastPing;
        
        if (timeSinceLastPing > config.websocket.heartbeatInterval * 2) {
          logger.warn(`Stale connection detected: ${clientId}`);
          // Connection will be handled by socket.io's built-in timeout
        }
      }

      // Broadcast heartbeat to all connected clients
      this.io.emit('heartbeat', {
        timestamp: now.toISOString(),
        connectedClients: this.connectedClients.size
      });

    }, config.websocket.heartbeatInterval);
  }

  startCleanupTask() {
    // Clean up stale connections and rate limiters every 5 minutes
    setInterval(() => {
      const now = Date.now();
      
      // Clean up expired rate limiters
      for (const [clientId, limiter] of this.eventRateLimiter.entries()) {
        if (now > limiter.resetTime + 60000) { // 1 minute grace period
          this.eventRateLimiter.delete(clientId);
        }
      }
      
      // Clean up orphaned connection limiters
      const activeIPs = new Set();
      for (const clientInfo of this.connectedClients.values()) {
        activeIPs.add(clientInfo.ip);
      }
      
      for (const ip of this.connectionLimiter.keys()) {
        if (!activeIPs.has(ip)) {
          this.connectionLimiter.delete(ip);
        }
      }
      
      logger.debug(`Cleanup completed: ${this.eventRateLimiter.size} rate limiters, ${this.connectionLimiter.size} IP limiters`);
    }, 5 * 60 * 1000); // 5 minutes
  }

  // Enhanced data broadcasting methods with throttling
  broadcastToFeed(feedName, data) {
    // Sanitize data before broadcasting
    const sanitizedData = preventNoSqlInjection(data);
    
    // Check if there are subscribers
    const subscribers = this.roomSubscriptions.get(feedName);
    if (!subscribers || subscribers.size === 0) {
      return;
    }
    
    this.io.to(`feed:${feedName}`).emit(`feed:${feedName}`, {
      ...sanitizedData,
      timestamp: new Date().toISOString(),
      feedName
    });
  }

  broadcastToAll(event, data) {
    const sanitizedData = preventNoSqlInjection(data);
    this.io.emit(event, {
      ...sanitizedData,
      timestamp: new Date().toISOString()
    });
  }

  sendToClient(clientId, event, data) {
    const sanitizedData = preventNoSqlInjection(data);
    this.io.to(clientId).emit(event, {
      ...sanitizedData,
      timestamp: new Date().toISOString()
    });
  }

  // Throttled broadcast for high-frequency data
  throttledBroadcast(feedName, data, throttleMs = config.performance.dataThrottleInterval) {
    if (!this.lastBroadcast) {
      this.lastBroadcast = new Map();
    }
    
    const now = Date.now();
    const lastTime = this.lastBroadcast.get(feedName) || 0;
    
    if (now - lastTime >= throttleMs) {
      this.broadcastToFeed(feedName, data);
      this.lastBroadcast.set(feedName, now);
    }
  }

  /**
   * Cache client connection information
   */
  async cacheClientConnection(clientId, clientInfo) {
    try {
      const sessionData = {
        id: clientInfo.id,
        connectedAt: clientInfo.connectedAt,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        subscriptions: Array.from(clientInfo.subscriptions),
        lastPing: clientInfo.lastPing
      };

      await this.cacheService.cacheClientSession(clientId, sessionData);
      logger.debug(`Client session cached: ${clientId}`);
    } catch (error) {
      logger.error(`Failed to cache client session for ${clientId}:`, error);
    }
  }

  /**
   * Clean up cached client session
   */
  async cleanupClientSession(clientId) {
    try {
      await this.cacheService.deleteClientSession(clientId);
      logger.debug(`Client session cleaned up: ${clientId}`);
    } catch (error) {
      logger.error(`Failed to cleanup client session for ${clientId}:`, error);
    }
  }

  /**
   * Send connection established with cached data
   */
  async sendConnectionEstablished(socket) {
    try {
      // Get cached data availability
      const [sessionData, timingData, driversData, weatherData, trackData] = await Promise.all([
        this.cacheService.getSessionData(),
        this.cacheService.getTimingData(),
        this.cacheService.getAllDriverData(),
        this.cacheService.getWeatherData(),
        this.cacheService.getTrackStatus()
      ]);

      socket.emit('connection:established', {
        clientId: socket.id,
        serverTime: new Date().toISOString(),
        availableFeeds: this.getAvailableFeeds(),
        cachedData: {
          session: !!sessionData,
          timing: !!timingData,
          drivers: !!driversData && Object.keys(driversData).length > 0,
          weather: !!weatherData,
          track: !!trackData
        }
      });

      logger.debug(`Connection established for ${socket.id} with cache status`);
    } catch (error) {
      logger.error(`Failed to send connection established to ${socket.id}:`, error);
      
      // Fallback to basic connection confirmation
      socket.emit('connection:established', {
        clientId: socket.id,
        serverTime: new Date().toISOString(),
        availableFeeds: this.getAvailableFeeds(),
        cachedData: {}
      });
    }
  }

  /**
   * Send cached session data
   */
  async sendCachedSessionData(socket) {
    try {
      const sessionData = await this.cacheService.getSessionData();
      
      if (sessionData) {
        socket.emit('session:current', {
          ...sessionData,
          cached: true,
          timestamp: new Date().toISOString()
        });
        logger.debug(`Sent cached session data to ${socket.id}`);
      } else {
        socket.emit('session:current', {
          timestamp: new Date().toISOString(),
          message: 'No session data available',
          cached: false
        });
      }
    } catch (error) {
      logger.error(`Failed to send cached session data to ${socket.id}:`, error);
      socket.emit('session:error', {
        error: 'Failed to retrieve session data',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Send cached driver data
   */
  async sendCachedDriverData(socket) {
    try {
      const driversData = await this.cacheService.getAllDriverData();
      
      if (driversData && Object.keys(driversData).length > 0) {
        socket.emit('drivers:current', {
          drivers: driversData,
          cached: true,
          timestamp: new Date().toISOString()
        });
        logger.debug(`Sent cached driver data to ${socket.id} (${Object.keys(driversData).length} drivers)`);
      } else {
        socket.emit('drivers:current', {
          drivers: {},
          timestamp: new Date().toISOString(),
          message: 'No driver data available',
          cached: false
        });
      }
    } catch (error) {
      logger.error(`Failed to send cached driver data to ${socket.id}:`, error);
      socket.emit('drivers:error', {
        error: 'Failed to retrieve driver data',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Send cached timing data
   */
  async sendCachedTimingData(socket) {
    try {
      const timingData = await this.cacheService.getTimingData();
      
      if (timingData) {
        socket.emit('timing:current', {
          ...timingData,
          cached: true,
          timestamp: new Date().toISOString()
        });
        logger.debug(`Sent cached timing data to ${socket.id}`);
      } else {
        socket.emit('timing:current', {
          timestamp: new Date().toISOString(),
          message: 'No timing data available',
          cached: false
        });
      }
    } catch (error) {
      logger.error(`Failed to send cached timing data to ${socket.id}:`, error);
      socket.emit('timing:error', {
        error: 'Failed to retrieve timing data',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Send cached weather data
   */
  async sendCachedWeatherData(socket) {
    try {
      const weatherData = await this.cacheService.getWeatherData();
      
      if (weatherData) {
        socket.emit('weather:current', {
          ...weatherData,
          cached: true,
          timestamp: new Date().toISOString()
        });
        logger.debug(`Sent cached weather data to ${socket.id}`);
      } else {
        socket.emit('weather:current', {
          timestamp: new Date().toISOString(),
          message: 'No weather data available',
          cached: false
        });
      }
    } catch (error) {
      logger.error(`Failed to send cached weather data to ${socket.id}:`, error);
      socket.emit('weather:error', {
        error: 'Failed to retrieve weather data',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Send cached track data
   */
  async sendCachedTrackData(socket) {
    try {
      const trackData = await this.cacheService.getTrackStatus();
      
      if (trackData) {
        socket.emit('track:current', {
          ...trackData,
          cached: true,
          timestamp: new Date().toISOString()
        });
        logger.debug(`Sent cached track data to ${socket.id}`);
      } else {
        socket.emit('track:current', {
          timestamp: new Date().toISOString(),
          message: 'No track data available',
          cached: false
        });
      }
    } catch (error) {
      logger.error(`Failed to send cached track data to ${socket.id}:`, error);
      socket.emit('track:error', {
        error: 'Failed to retrieve track data',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Send cached position data
   */
  async sendCachedPositionData(socket) {
    try {
      const positionData = await this.cacheService.getPositionData();
      
      if (positionData) {
        socket.emit('position:current', {
          ...positionData,
          cached: true,
          timestamp: new Date().toISOString()
        });
        logger.debug(`Sent cached position data to ${socket.id}`);
      } else {
        socket.emit('position:current', {
          timestamp: new Date().toISOString(),
          message: 'No position data available',
          cached: false
        });
      }
    } catch (error) {
      logger.error(`Failed to send cached position data to ${socket.id}:`, error);
      socket.emit('position:error', {
        error: 'Failed to retrieve position data',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Mock data method for testing purposes
  sendMockDriverData(socket) {
    const mockDrivers = [
      {
        id: '1',
        number: 1,
        name: 'Max Verstappen',
        team: 'Red Bull Racing',
        position: 1,
        gapToLeader: '0',
        lastLapTime: '1:31.456',
        bestLapTime: '1:31.234',
        speed: 315
      },
      {
        id: '44',
        number: 44,
        name: 'Lewis Hamilton',
        team: 'Mercedes',
        position: 2,
        gapToLeader: '+5.234',
        lastLapTime: '1:31.678',
        bestLapTime: '1:31.456',
        speed: 312
      }
    ];

    logger.debug(`Sending mock driver data to client: ${socket.id}`);
    socket.emit('drivers:all', mockDrivers);
    
    socket.emit('race:status', {
      sessionType: 'Race',
      sessionName: 'Formula 1 Test Session',
      trackName: 'Zandvoort Circuit',
      lapNumber: 25,
      totalLaps: 57
    });
    
    // Send updated data every 2 seconds
    const mockInterval = setInterval(() => {
      if (!socket.connected) {
        clearInterval(mockInterval);
        return;
      }
      
      const updatedDrivers = mockDrivers.map(driver => ({
        ...driver,
        speed: Math.floor(Math.random() * 20) + 300,
        lastLapTime: `1:3${Math.floor(Math.random() * 9)}.${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`
      }));
      
      socket.emit('drivers:all', updatedDrivers);
      updatedDrivers.forEach(driver => {
        socket.emit('driver:update', driver);
      });
    }, 2000);
    
    socket.on('disconnect', () => clearInterval(mockInterval));
  }

  sendInitialFeedData(socket, feedName) {
    // Send any cached initial data for the feed
    logger.debug(`Sending initial data for feed: ${feedName}`);
  }

  // Utility methods
  isValidFeed(feedName) {
    const validFeeds = this.getAvailableFeeds();
    return validFeeds.includes(feedName);
  }

  getAvailableFeeds() {
    return [
      'TimingData',
      'CarData.z',
      'Position.z',
      'SessionInfo',
      'DriverList',
      'WeatherData',
      'TrackStatus',
      'SessionData',
      'RaceControlMessages',
      'heartbeat'
    ];
  }

  broadcastClientCount() {
    this.io.emit('clients:count', {
      count: this.connectedClients.size,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Enhanced rate limiting with Redis
   */
  async checkRateLimit(identifier, windowMs = 60000, maxRequests = 30) {
    try {
      const rateLimitData = await this.cacheService.incrementRateLimit(identifier, windowMs);
      return {
        allowed: rateLimitData.count <= maxRequests,
        count: rateLimitData.count,
        resetTime: rateLimitData.resetTime,
        remaining: Math.max(0, maxRequests - rateLimitData.count)
      };
    } catch (error) {
      logger.warn(`Rate limit check failed for ${identifier}, allowing request:`, error);
      return { allowed: true, count: 0, resetTime: Date.now() + windowMs, remaining: maxRequests };
    }
  }

  /**
   * Send initial feed data with caching
   */
  async sendInitialFeedData(socket, feedName) {
    try {
      logger.debug(`Sending initial cached data for feed: ${feedName}`);
      
      // Map feed names to cache methods
      switch (feedName) {
        case 'SessionInfo':
          await this.sendCachedSessionData(socket);
          break;
        case 'TimingData':
          await this.sendCachedTimingData(socket);
          break;
        case 'DriverList':
          await this.sendCachedDriverData(socket);
          break;
        case 'WeatherData':
          await this.sendCachedWeatherData(socket);
          break;
        case 'TrackStatus':
          await this.sendCachedTrackData(socket);
          break;
        case 'Position.z':
          await this.sendCachedPositionData(socket);
          break;
        default:
          // Try to get generic cached feed data
          const cachedData = await this.cacheService.get('feeds', feedName);
          if (cachedData) {
            socket.emit(`feed:${feedName}`, {
              ...cachedData,
              cached: true,
              timestamp: new Date().toISOString()
            });
          }
      }
    } catch (error) {
      logger.warn(`Failed to send initial cached data for ${feedName}:`, error);
    }
  }

  // Admin/monitoring methods with cache integration
  async getConnectionStats() {
    const stats = {
      totalConnections: this.connectedClients.size,
      activeFeeds: this.roomSubscriptions.size,
      connectionLimiters: this.connectionLimiter.size,
      eventRateLimiters: this.eventRateLimiter.size,
      connections: [],
      cache: null
    };

    for (const [clientId, clientInfo] of this.connectedClients.entries()) {
      stats.connections.push({
        id: clientId,
        connectedAt: clientInfo.connectedAt,
        ip: clientInfo.ip,
        subscriptions: Array.from(clientInfo.subscriptions),
        lastPing: clientInfo.lastPing
      });
    }

    // Add cache statistics
    try {
      stats.cache = await this.cacheService.getStatistics();
    } catch (error) {
      logger.warn('Failed to get cache statistics for connection stats:', error);
      stats.cache = { error: 'Cache statistics unavailable' };
    }

    return stats;
  }

  getSecurityStats() {
    const ipConnections = {};
    for (const [ip, count] of this.connectionLimiter.entries()) {
      ipConnections[ip] = count;
    }

    return {
      connectionLimitsByIP: ipConnections,
      totalUniqueIPs: this.connectionLimiter.size,
      rateLimitedClients: this.eventRateLimiter.size,
      maxConnectionsPerIP: config.rateLimit.websocket.connectionLimit,
      maxEventsPerMinute: config.websocket.maxEventRate,
    };
  }

  getFeedStats() {
    const feedStats = {};
    
    for (const [feedName, subscribers] of this.roomSubscriptions.entries()) {
      feedStats[feedName] = {
        subscriberCount: subscribers.size,
        subscribers: Array.from(subscribers)
      };
    }

    return feedStats;
  }
}

function setupWebSocket(server) {
  const wsService = new WebSocketService(server);
  logger.info('WebSocket service initialized');
  return wsService.io;
}

module.exports = { WebSocketService, setupWebSocket };