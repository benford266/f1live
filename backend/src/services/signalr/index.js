const WebSocket = require('ws');
const fetch = require('node-fetch');
const EventEmitter = require('events');
const config = require('../../config');
const logger = require('../../utils/logger');
const DataProcessor = require('../data/processor');
const { getCacheService } = require('../cache');

/**
 * Custom Legacy SignalR Client for F1 Live Timing
 * Implements the ASP.NET SignalR protocol (not SignalR Core)
 */
class LegacySignalRClient extends EventEmitter {
  constructor(url, hubNames) {
    super();
    this.url = url;
    this.hubNames = hubNames;
    this.websocket = null;
    this.connectionToken = null;
    this.connectionId = null;
    this.messageId = 0;
    this.groupsToken = null;
    this.connectionData = null;
    this.state = 'disconnected';
    this.keepAliveTimeout = null;
    this.reconnectTimeout = null;
    
    // Build connection data string for legacy SignalR
    this.connectionData = JSON.stringify(
      hubNames.map(name => ({ name: name }))
    );
  }

  /**
   * Start the connection to the legacy SignalR endpoint
   */
  async start() {
    try {
      this.state = 'connecting';
      logger.info('Starting legacy SignalR connection...');

      // Step 1: Negotiate connection
      await this.negotiate();

      // Step 2: Connect via WebSocket
      await this.connectWebSocket();

      // Step 3: Start the connection
      await this.startConnection();

    } catch (error) {
      this.state = 'disconnected';
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Negotiate connection with F1 SignalR server
   */
  async negotiate() {
    try {
      logger.debug('Negotiating SignalR connection...');
      
      const negotiateUrl = `${this.url}/negotiate?clientProtocol=1.5&connectionData=${encodeURIComponent(this.connectionData)}`;
      
      const response = await fetch(negotiateUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'F1-Live-Data-Client/1.0',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Negotiate failed: ${response.status} ${response.statusText}`);
      }

      const negotiateData = await response.json();
      
      this.connectionToken = negotiateData.ConnectionToken;
      this.connectionId = negotiateData.ConnectionId;
      this.keepAliveTimeout = negotiateData.KeepAliveTimeout * 1000; // Convert to ms
      
      logger.debug('Negotiation successful:', {
        connectionId: this.connectionId,
        keepAliveTimeout: this.keepAliveTimeout
      });

    } catch (error) {
      logger.error('Failed to negotiate SignalR connection:', error);
      throw error;
    }
  }

  /**
   * Connect via WebSocket using legacy SignalR protocol
   */
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        logger.debug('Connecting WebSocket...');

        const wsUrl = this.buildWebSocketUrl();
        
        this.websocket = new WebSocket(wsUrl);

        this.websocket.on('open', () => {
          logger.debug('WebSocket connection opened');
          resolve();
        });

        this.websocket.on('message', (data) => {
          this.handleMessage(data.toString());
        });

        this.websocket.on('close', (code, reason) => {
          logger.warn(`WebSocket connection closed: ${code} ${reason}`);
          this.state = 'disconnected';
          this.emit('disconnected');
        });

        this.websocket.on('error', (error) => {
          logger.error('WebSocket error:', error);
          this.state = 'disconnected';
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Build WebSocket URL for legacy SignalR
   */
  buildWebSocketUrl() {
    const baseWsUrl = this.url.replace(/^https?/, 'wss');
    const params = new URLSearchParams({
      transport: 'webSockets',
      clientProtocol: '1.5',
      connectionToken: this.connectionToken,
      connectionData: this.connectionData,
      tid: '10'
    });

    return `${baseWsUrl}/connect?${params.toString()}`;
  }

  /**
   * Start the connection after WebSocket is established
   */
  async startConnection() {
    try {
      logger.debug('Starting SignalR connection...');
      
      const startUrl = `${this.url}/start?transport=webSockets&clientProtocol=1.5&connectionToken=${encodeURIComponent(this.connectionToken)}&connectionData=${encodeURIComponent(this.connectionData)}`;
      
      const response = await fetch(startUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'F1-Live-Data-Client/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Start connection failed: ${response.status} ${response.statusText}`);
      }

      const startData = await response.json();
      
      if (startData.Response === 'started') {
        this.state = 'connected';
        this.emit('connected');
        logger.info('Legacy SignalR connection established successfully');
        
        // Start keep-alive mechanism
        this.setupKeepAlive();
      } else {
        throw new Error('Failed to start SignalR connection');
      }

    } catch (error) {
      logger.error('Failed to start SignalR connection:', error);
      throw error;
    }
  }

  /**
   * Handle incoming messages from SignalR
   */
  handleMessage(data) {
    try {
      // Legacy SignalR messages can be empty (keep-alive) or contain data
      if (!data || data === '') {
        logger.debug('Keep-alive message received');
        return;
      }

      const message = JSON.parse(data);
      
      // Handle different message types
      if (message.M) {
        // Hub method invocation
        message.M.forEach(hubMessage => {
          if (hubMessage.H && hubMessage.M && hubMessage.A) {
            const hubName = hubMessage.H;
            const methodName = hubMessage.M;
            const args = hubMessage.A;
            
            logger.debug(`Hub method called: ${hubName}.${methodName}`);
            this.emit(hubName, methodName, ...args);
          }
        });
      }

      if (message.C) {
        // Connection ID update
        this.connectionId = message.C;
        logger.debug('Connection ID updated:', this.connectionId);
      }

      if (message.S) {
        // Connection initialized
        logger.debug('SignalR connection initialized');
      }

    } catch (error) {
      logger.error('Error handling SignalR message:', error);
    }
  }

  /**
   * Call a hub method (legacy SignalR format)
   */
  async call(hubName, methodName, args = []) {
    return new Promise((resolve, reject) => {
      if (this.state !== 'connected') {
        reject(new Error('SignalR connection is not established'));
        return;
      }

      try {
        const callbackId = (++this.messageId).toString();
        
        const message = {
          H: hubName,
          M: methodName,
          A: args,
          I: callbackId
        };

        logger.debug(`Calling hub method: ${hubName}.${methodName}`, args);
        
        this.websocket.send(JSON.stringify(message));
        
        // For simplicity, resolve immediately since F1 doesn't seem to send responses
        // In a full implementation, you'd track callbacks by ID
        resolve();
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Set up keep-alive mechanism
   */
  setupKeepAlive() {
    if (this.keepAliveTimeout && this.keepAliveTimeout > 0) {
      setInterval(() => {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
          // Send empty message as keep-alive
          this.websocket.send('');
        }
      }, this.keepAliveTimeout / 2);
    }
  }

  /**
   * End the connection
   */
  end() {
    this.state = 'disconnected';
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    this.connectionToken = null;
    this.connectionId = null;
  }
}

/**
 * F1 SignalR Service for connecting to legacy ASP.NET SignalR endpoint
 * Handles connection to F1's live timing API and data distribution
 */
class F1SignalRService {
  constructor(io) {
    this.io = io;
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.dataProcessor = new DataProcessor();
    this.subscriptions = new Set();
    this.connectionRetryTimeout = null;
    this.maxReconnectAttempts = config.f1.maxReconnectAttempts;
    this.reconnectInterval = config.f1.reconnectInterval;
    this.cacheService = getCacheService();
    
    // Data buffering for disconnection resilience
    this.dataBuffer = new Map();
    this.bufferMaxSize = 1000;
    this.lastDataTimestamp = null;
  }

  /**
   * Initialize the SignalR connection to F1's legacy endpoint
   */
  async initialize() {
    try {
      logger.info('Initializing legacy SignalR connection to F1 Live Timing API');
      
      // Create custom legacy SignalR client
      this.client = new LegacySignalRClient(
        config.f1.signalrUrl,
        [config.f1.hubName]
      );

      this.setupConnectionEvents();
      this.setupDataHandlers();
      
      await this.connect();
      
    } catch (error) {
      logger.error('Failed to initialize legacy SignalR connection:', error);
      throw error;
    }
  }

  /**
   * Set up connection event handlers for legacy SignalR
   */
  setupConnectionEvents() {
    // Connection opened
    this.client.on('connected', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info('Successfully connected to F1 legacy SignalR hub');
      this.io.emit('connection:status', { connected: true });
      
      // Restore cached data to clients
      this.restoreCachedDataToClients().catch(error => {
        logger.warn('Failed to restore cached data to clients:', error);
      });
      
      // Subscribe to initial feeds after connection
      this.subscribeToFeeds().catch(error => {
        logger.error('Failed to subscribe to feeds after connection:', error);
      });
    });

    // Connection closed
    this.client.on('disconnected', () => {
      this.isConnected = false;
      logger.warn('Legacy SignalR connection closed');
      this.io.emit('connection:status', { connected: false });
      
      // Buffer current state for reconnection
      this.bufferCurrentState().catch(error => {
        logger.warn('Failed to buffer current state during disconnection:', error);
      });
      
      // Attempt reconnection if not intentionally disconnected
      this.attemptReconnection();
    });

    // Connection error
    this.client.on('error', (error) => {
      this.isConnected = false;
      logger.error('Legacy SignalR connection error:', error);
      this.io.emit('connection:status', { 
        connected: false, 
        error: error.message || 'Connection error' 
      });
      
      // Attempt reconnection on error
      this.attemptReconnection();
    });
  }

  /**
   * Set up data handlers for F1 feeds
   */
  setupDataHandlers() {
    // Handle feed data from the Streaming hub
    this.client.on('Streaming', (methodName, ...args) => {
      try {
        if (methodName === 'feed') {
          const [feedName, data, timestamp] = args;
          logger.debug(`Received feed data: ${feedName}`);
          
          const processedData = this.dataProcessor.processFeed(feedName, data, timestamp);
          
          if (processedData) {
            // Cache the processed data
            this.cacheProcessedData(feedName, processedData).catch(error => {
              logger.warn(`Failed to cache data for ${feedName}:`, error);
            });
            
            // Buffer data for resilience
            this.bufferData(feedName, processedData);
            
            // Emit to WebSocket clients
            this.io.emit(`feed:${feedName}`, processedData);
            
            // Handle specific data types
            this.handleFeedData(feedName, processedData);
          }
        } else if (methodName === 'heartbeat') {
          const [timestamp] = args;
          logger.debug(`Heartbeat received: ${timestamp}`);
          this.io.emit('heartbeat', { timestamp });
        } else {
          logger.debug(`Received hub method: ${methodName}`, args);
        }
      } catch (error) {
        logger.error(`Error processing hub method ${methodName}:`, error);
      }
    });
  }

  /**
   * Handle specific feed data types
   */
  handleFeedData(feedName, processedData) {
    switch (feedName) {
      case 'TimingData':
        this.handleTimingData(processedData);
        break;
      case 'CarData.z':
        this.handleCarData(processedData);
        break;
      case 'Position.z':
        this.handlePositionData(processedData);
        break;
      case 'SessionInfo':
        this.handleSessionInfo(processedData);
        break;
      case 'DriverList':
        this.handleDriverList(processedData);
        break;
      case 'WeatherData':
        this.handleWeatherData(processedData);
        break;
      case 'TrackStatus':
        this.handleTrackStatus(processedData);
        break;
      default:
        logger.debug(`Received unhandled feed: ${feedName}`);
    }
  }

  handleTimingData(data) {
    this.io.emit('timing:update', data);
    
    // Check for lap completions
    if (data.lapData) {
      Object.entries(data.lapData).forEach(([driverNumber, lapInfo]) => {
        if (lapInfo.lapCompleted) {
          this.io.emit('lap:completed', {
            driverNumber,
            lapTime: lapInfo.lapTime,
            lapNumber: lapInfo.lapNumber,
            timestamp: data.timestamp
          });
        }
      });
    }
  }

  handleCarData(data) {
    this.io.emit('car:update', data);
    
    // Emit individual driver updates
    Object.entries(data.drivers || {}).forEach(([driverNumber, driverData]) => {
      this.io.emit('driver:update', {
        driverNumber,
        ...driverData,
        timestamp: data.timestamp
      });
    });
  }

  handlePositionData(data) {
    this.io.emit('position:update', data);
  }

  handleSessionInfo(data) {
    this.io.emit('session:update', data);
    
    // Check for session state changes
    if (data.sessionState) {
      this.io.emit('session:state', {
        state: data.sessionState,
        timestamp: data.timestamp
      });
    }
  }

  handleDriverList(data) {
    this.io.emit('drivers:update', data);
  }

  handleWeatherData(data) {
    this.io.emit('weather:update', data);
  }

  handleTrackStatus(data) {
    this.io.emit('track:status', data);
    
    // Emit race status for important changes
    if (data.status && ['Red Flag', 'Yellow Flag', 'Safety Car'].includes(data.status)) {
      this.io.emit('race:status', {
        status: data.status,
        message: data.message,
        timestamp: data.timestamp
      });
    }
  }

  /**
   * Connect to the F1 SignalR endpoint
   */
  async connect() {
    try {
      logger.info('Connecting to F1 legacy SignalR hub...');
      await this.client.start();
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to connect to SignalR hub:', error);
      throw error;
    }
  }

  /**
   * Subscribe to F1 data feeds
   */
  async subscribeToFeeds() {
    const feeds = [
      'Heartbeat',
      'TimingData', 
      'CarData.z',
      'Position.z',
      'SessionInfo',
      'DriverList',
      'WeatherData',
      'TrackStatus',
      'SessionData',
      'RaceControlMessages'
    ];

    try {
      for (const feed of feeds) {
        await this.subscribeTo(feed);
        this.subscriptions.add(feed);
        logger.debug(`Subscribed to feed: ${feed}`);
      }
      
      logger.info(`Successfully subscribed to ${feeds.length} feeds`);
    } catch (error) {
      logger.error('Failed to subscribe to feeds:', error);
      throw error;
    }
  }

  /**
   * Subscribe to a specific feed
   */
  async subscribeTo(feedName) {
    if (!this.isConnected) {
      throw new Error('Legacy SignalR connection is not established');
    }

    try {
      await this.client.call('Streaming', 'Subscribe', [feedName]);
      logger.debug(`Successfully subscribed to ${feedName}`);
    } catch (error) {
      logger.error(`Failed to subscribe to ${feedName}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a specific feed
   */
  async unsubscribeFrom(feedName) {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.call('Streaming', 'Unsubscribe', [feedName]);
      this.subscriptions.delete(feedName);
      logger.debug(`Unsubscribed from ${feedName}`);
    } catch (error) {
      logger.error(`Failed to unsubscribe from ${feedName}:`, error);
    }
  }

  /**
   * Handle reconnection attempts with exponential backoff
   */
  attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      this.io.emit('connection:status', { 
        connected: false, 
        error: 'Max reconnection attempts reached' 
      });
      return;
    }

    if (this.connectionRetryTimeout) {
      clearTimeout(this.connectionRetryTimeout);
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    logger.info(`Attempting reconnection ${this.reconnectAttempts} in ${delay}ms...`);
    
    this.connectionRetryTimeout = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error('Reconnection attempt failed:', error);
        // The error handler will trigger another reconnection attempt
      }
    }, delay);
  }

  /**
   * Disconnect from the SignalR hub
   */
  async disconnect() {
    if (this.connectionRetryTimeout) {
      clearTimeout(this.connectionRetryTimeout);
      this.connectionRetryTimeout = null;
    }

    if (this.client && this.isConnected) {
      try {
        logger.info('Disconnecting from legacy SignalR hub...');
        
        // Unsubscribe from all feeds first
        const unsubscribePromises = Array.from(this.subscriptions).map(feed =>
          this.unsubscribeFrom(feed).catch(error => 
            logger.warn(`Failed to unsubscribe from ${feed} during disconnect:`, error)
          )
        );
        
        await Promise.allSettled(unsubscribePromises);

        // Close the connection
        this.client.end();
        this.isConnected = false;
        this.subscriptions.clear();
        
        logger.info('Legacy SignalR connection closed');
      } catch (error) {
        logger.error('Error disconnecting from legacy SignalR:', error);
      }
    }
  }

  /**
   * Cache processed data based on feed type
   */
  async cacheProcessedData(feedName, data) {
    try {
      this.lastDataTimestamp = Date.now();
      
      switch (feedName) {
        case 'SessionInfo':
          await this.cacheService.cacheSessionData(data);
          break;
          
        case 'DriverList':
          if (data.drivers) {
            await this.cacheService.cacheDriverData(data.drivers);
          }
          break;
          
        case 'TimingData':
          await this.cacheService.cacheTimingData(data);
          break;
          
        case 'WeatherData':
          await this.cacheService.cacheWeatherData(data);
          break;
          
        case 'TrackStatus':
          await this.cacheService.cacheTrackStatus(data);
          break;
          
        case 'Position.z':
          await this.cacheService.cachePositionData(data);
          break;
          
        case 'CarData.z':
          if (data.drivers) {
            // Cache telemetry data for each driver
            const telemetryPromises = Object.entries(data.drivers).map(([driverNumber, driverData]) =>
              this.cacheService.cacheTelemetryData(driverNumber, driverData)
            );
            await Promise.allSettled(telemetryPromises);
          }
          break;
          
        default:
          // Cache generic feed data
          await this.cacheService.set('feeds', feedName, data);
      }
      
      logger.debug(`Data cached for feed: ${feedName}`);
    } catch (error) {
      logger.error(`Failed to cache data for ${feedName}:`, error);
    }
  }

  /**
   * Buffer data in memory for disconnection resilience
   */
  bufferData(feedName, data) {
    try {
      if (this.dataBuffer.size >= this.bufferMaxSize) {
        // Remove oldest entry
        const firstKey = this.dataBuffer.keys().next().value;
        this.dataBuffer.delete(firstKey);
      }
      
      const bufferKey = `${feedName}:${Date.now()}`;
      this.dataBuffer.set(bufferKey, {
        feedName,
        data,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.warn(`Failed to buffer data for ${feedName}:`, error);
    }
  }

  /**
   * Buffer current state during disconnection
   */
  async bufferCurrentState() {
    try {
      // Get current cached data and store in buffer
      const sessionData = await this.cacheService.getSessionData();
      const timingData = await this.cacheService.getTimingData();
      const weatherData = await this.cacheService.getWeatherData();
      const trackStatus = await this.cacheService.getTrackStatus();
      const positionData = await this.cacheService.getPositionData();
      const allDriverData = await this.cacheService.getAllDriverData();
      
      const stateSnapshot = {
        session: sessionData,
        timing: timingData,
        weather: weatherData,
        track: trackStatus,
        position: positionData,
        drivers: allDriverData,
        timestamp: Date.now()
      };
      
      // Store snapshot for recovery
      await this.cacheService.set('recovery', 'last_state', stateSnapshot, { ttl: 3600 });
      
      logger.info('Current state buffered for recovery');
    } catch (error) {
      logger.error('Failed to buffer current state:', error);
    }
  }

  /**
   * Restore cached data to clients after reconnection
   */
  async restoreCachedDataToClients() {
    try {
      logger.info('Restoring cached data to clients...');
      
      // Get cached data
      const sessionData = await this.cacheService.getSessionData();
      const timingData = await this.cacheService.getTimingData();
      const weatherData = await this.cacheService.getWeatherData();
      const trackStatus = await this.cacheService.getTrackStatus();
      const positionData = await this.cacheService.getPositionData();
      const allDriverData = await this.cacheService.getAllDriverData();
      
      // Emit cached data to clients
      if (sessionData) {
        this.io.emit('session:update', { ...sessionData, cached: true });
      }
      
      if (timingData) {
        this.io.emit('timing:update', { ...timingData, cached: true });
      }
      
      if (weatherData) {
        this.io.emit('weather:update', { ...weatherData, cached: true });
      }
      
      if (trackStatus) {
        this.io.emit('track:status', { ...trackStatus, cached: true });
      }
      
      if (positionData) {
        this.io.emit('position:update', { ...positionData, cached: true });
      }
      
      if (allDriverData && Object.keys(allDriverData).length > 0) {
        this.io.emit('drivers:update', { drivers: allDriverData, cached: true });
        
        // Emit individual driver updates
        Object.entries(allDriverData).forEach(([driverNumber, driverData]) => {
          this.io.emit('driver:update', {
            driverNumber,
            ...driverData,
            cached: true,
            timestamp: new Date().toISOString()
          });
        });
      }
      
      // Emit restoration complete event
      this.io.emit('data:restored', {
        timestamp: new Date().toISOString(),
        restoredTypes: [
          sessionData ? 'session' : null,
          timingData ? 'timing' : null,
          weatherData ? 'weather' : null,
          trackStatus ? 'track' : null,
          positionData ? 'position' : null,
          allDriverData ? 'drivers' : null
        ].filter(Boolean)
      });
      
      logger.info('Cached data restored to clients');
    } catch (error) {
      logger.error('Failed to restore cached data to clients:', error);
    }
  }

  /**
   * Get cached data for API responses
   */
  async getCachedData(type) {
    try {
      switch (type) {
        case 'session':
          return await this.cacheService.getSessionData();
        case 'timing':
          return await this.cacheService.getTimingData();
        case 'weather':
          return await this.cacheService.getWeatherData();
        case 'track':
          return await this.cacheService.getTrackStatus();
        case 'position':
          return await this.cacheService.getPositionData();
        case 'drivers':
          return await this.cacheService.getAllDriverData();
        default:
          return await this.cacheService.get('feeds', type);
      }
    } catch (error) {
      logger.error(`Failed to get cached data for type ${type}:`, error);
      return null;
    }
  }

  /**
   * Clear cached data
   */
  async clearCache(type = null) {
    try {
      if (type) {
        await this.cacheService.flushType(type);
        logger.info(`Cache cleared for type: ${type}`);
      } else {
        await this.cacheService.flushAll();
        logger.info('All cache cleared');
      }
      return true;
    } catch (error) {
      logger.error(`Failed to clear cache${type ? ` for type ${type}` : ''}:`, error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    try {
      return await this.cacheService.getStatistics();
    } catch (error) {
      logger.error('Failed to get cache statistics:', error);
      return null;
    }
  }

  /**
   * Get current connection status including cache information
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: Array.from(this.subscriptions),
      clientState: this.client ? this.client.state : 'not_initialized',
      dataBuffer: {
        size: this.dataBuffer.size,
        maxSize: this.bufferMaxSize,
        lastDataTimestamp: this.lastDataTimestamp
      },
      cache: {
        available: this.cacheService.isInitialized,
        failoverMode: this.cacheService.failoverMode
      }
    };
  }
}

/**
 * Initialize the F1 SignalR service
 */
async function initializeSignalR(io) {
  const service = new F1SignalRService(io);
  await service.initialize();
  return service;
}

module.exports = { F1SignalRService, initializeSignalR };