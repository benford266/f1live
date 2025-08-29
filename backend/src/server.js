const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

const config = require('./config');
const logger = require('./utils/logger');
const healthChecker = require('./utils/healthCheck');
const { setupWebSocket } = require('./services/websocket');
const { initializeSignalR } = require('./services/signalr');
const { initializeCacheService } = require('./services/cache');
const { initialize: initializeDatabase } = require('./database');
const { globalErrorHandler } = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const { validateSecureHeaders, validateRequestSize } = require('./middleware/validation');
const { authenticateAdmin, adminLogin, refreshAdminToken, authRateLimit } = require('./middleware/auth');

// Import routes
const { router: sessionRoutes } = require('./routes/session');
const { router: driversRoutes } = require('./routes/drivers');
const { router: trackRoutes } = require('./routes/track');
const { router: databaseRoutes } = require('./routes/database');

class F1BackendServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.io = null;
    this.signalRService = null;
    this.cacheService = null;
    this.databaseService = null;
  }

  setupMiddleware() {
    // Trust proxy if behind load balancer
    if (config.security.trustedProxies.length > 0) {
      this.app.set('trust proxy', config.security.trustedProxies);
    } else if (config.nodeEnv === 'production') {
      this.app.set('trust proxy', 1);
    }

    // Security middleware with enhanced configuration
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:", "https://livetiming.formula1.com"],
          fontSrc: ["'self'", "https:", "data:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
        reportOnly: config.nodeEnv === 'development',
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: config.nodeEnv === 'production',
      },
      noSniff: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      permittedCrossDomainPolicies: false,
    }));

    // Compression with security considerations
    this.app.use(compression({
      level: config.performance.compressionLevel,
      threshold: 1024,
      filter: (req, res) => {
        // Don't compress if the request is from a potentially malicious source
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
    }));

    // Enhanced CORS configuration
    this.app.use(cors({
      origin: (origin, callback) => {
        // In production, be strict about origins
        if (config.nodeEnv === 'production' && !origin) {
          return callback(new Error('CORS policy: Origin header required'), false);
        }
        
        // Allow requests with no origin in development (mobile apps, postman, etc.)
        if (!origin && config.nodeEnv === 'development') {
          return callback(null, true);
        }
        
        if (config.cors.allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        
        logger.warn(`CORS rejection for origin: ${origin}`);
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      },
      credentials: config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
      exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
      maxAge: config.cors.maxAge,
      optionsSuccessStatus: config.cors.optionsSuccessStatus,
      preflightContinue: config.cors.preflightContinue,
    }));

    // Enhanced rate limiting with IP-based throttling
    const createRateLimiter = (windowMs, max, message) => rateLimit({
      windowMs,
      max,
      message: {
        success: false,
        error: 'Rate limit exceeded',
        message,
        retryAfter: Math.ceil(windowMs / 1000),
        timestamp: new Date().toISOString(),
      },
      standardHeaders: config.rateLimit.standardHeaders,
      legacyHeaders: config.rateLimit.legacyHeaders,
      skipSuccessfulRequests: config.rateLimit.skipSuccessfulRequests,
      skipFailedRequests: config.rateLimit.skipFailedRequests,
      keyGenerator: (req) => {
        // Use forwarded IP if behind proxy, otherwise use connection IP
        return req.ip || req.connection.remoteAddress;
      },
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health';
      },
      handler: (req, res) => {
        logger.warn(`Rate limit exceeded for IP: ${req.ip} on ${req.path}`);
        const response = {
          success: false,
          error: 'Rate limit exceeded',
          message,
          retryAfter: Math.ceil(windowMs / 1000),
          timestamp: new Date().toISOString(),
        };
        res.status(429).json(response);
      },
    });

    // Global rate limiter
    const globalLimiter = createRateLimiter(
      config.rateLimit.windowMs,
      config.rateLimit.maxRequests,
      'Too many requests from this IP, please try again later.'
    );

    // API-specific rate limiter (more restrictive)
    const apiLimiter = createRateLimiter(
      config.rateLimit.api.windowMs,
      config.rateLimit.api.maxRequests,
      'Too many API requests from this IP, please slow down.'
    );

    // Speed limiter for progressive delays
    const speedLimiter = slowDown({
      windowMs: config.rateLimit.api.windowMs,
      delayAfter: Math.floor(config.rateLimit.api.maxRequests * 0.5),
      delayMs: () => 500,
      maxDelayMs: 5000,
      skipSuccessfulRequests: true,
      validate: { delayMs: false },
    });

    // Apply rate limiting
    this.app.use(globalLimiter);
    this.app.use('/api', apiLimiter);
    this.app.use('/api', speedLimiter);

    // Body parsing with security considerations
    this.app.use(express.json({ 
      limit: config.security.maxPayloadSize,
      verify: (req, res, buf) => {
        // Store raw body for signature verification if needed
        req.rawBody = buf;
      },
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: config.security.maxPayloadSize,
      parameterLimit: 100,
    }));

    // Security validation middleware
    this.app.use(validateSecureHeaders);
    this.app.use(validateRequestSize);

    // Request logging
    this.app.use(requestLogger);
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const healthStatus = await healthChecker.getDetailedStatus();
        const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
        
        res.status(statusCode).json({
          success: healthStatus.status === 'healthy',
          ...healthStatus
        });
      } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
          success: false,
          status: 'error',
          message: 'Health check failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Admin authentication endpoints
    this.app.post('/admin/auth/login', authRateLimit(5, 15), adminLogin);
    this.app.post('/admin/auth/refresh', authRateLimit(10, 5), refreshAdminToken);

    // Security monitoring endpoint (JWT protected)
    this.app.get('/admin/security-stats', authenticateAdmin(['admin', 'superadmin']), (req, res) => {
      try {
        const securityStats = {
          server: {
            environment: config.nodeEnv,
            rateLimiting: {
              globalWindowMs: config.rateLimit.windowMs,
              globalMaxRequests: config.rateLimit.maxRequests,
              apiWindowMs: config.rateLimit.api.windowMs,
              apiMaxRequests: config.rateLimit.api.maxRequests,
            },
            cors: {
              allowedOrigins: config.cors.allowedOrigins,
              credentialsEnabled: config.cors.credentials,
            },
            security: {
              apiKeyRequired: config.security.apiKeyRequired,
              trustedProxies: config.security.trustedProxies.length,
              maxPayloadSize: config.security.maxPayloadSize,
              jwtEnabled: true
            }
          },
          websocket: this.io?.engine?.getSecurityStats ? this.io.engine.getSecurityStats() : null,
          adminInfo: {
            role: req.admin.role,
            accessTime: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        };

        res.json({
          success: true,
          data: securityStats
        });
      } catch (error) {
        logger.error('Security stats failed:', error);
        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: 'Failed to retrieve security statistics',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Database management endpoints (JWT protected)
    this.app.get('/admin/database/stats', authenticateAdmin(['admin', 'superadmin']), async (req, res) => {
      try {
        const { getStatus } = require('./database');
        const status = getStatus();
        
        logger.info('Database stats accessed', {
          adminId: req.admin.id,
          role: req.admin.role,
          timestamp: new Date().toISOString()
        });
        
        res.json({
          success: true,
          data: status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Database stats error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: 'Failed to retrieve database statistics',
          timestamp: new Date().toISOString()
        });
      }
    });

    this.app.post('/admin/database/backup', authenticateAdmin(['admin', 'superadmin']), async (req, res) => {
      try {
        const { maintenance } = require('./database');
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const backupPath = `./data/backups/f1_timing_backup_${timestamp}.db`;
        
        await maintenance({ backupPath });
        
        logger.warn('Database backup created', {
          adminId: req.admin.id,
          role: req.admin.role,
          backupPath,
          timestamp: new Date().toISOString()
        });

        res.json({
          success: true,
          message: `Database backup created successfully`,
          backupPath,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Database backup error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: 'Failed to create database backup',
          timestamp: new Date().toISOString()
        });
      }
    });

    this.app.post('/admin/database/optimize', authenticateAdmin(['admin', 'superadmin']), async (req, res) => {
      try {
        const { maintenance } = require('./database');
        const { vacuum } = req.body;
        
        await maintenance({ vacuum: !!vacuum });
        
        logger.warn('Database optimization performed', {
          adminId: req.admin.id,
          role: req.admin.role,
          vacuum: !!vacuum,
          timestamp: new Date().toISOString()
        });

        res.json({
          success: true,
          message: `Database optimization completed${vacuum ? ' with vacuum' : ''}`,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Database optimization error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: 'Failed to optimize database',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Cache management endpoints (JWT protected)
    this.app.get('/admin/cache/stats', authenticateAdmin(['admin', 'superadmin']), async (req, res) => {
      try {
        const { getCacheService } = require('./services/cache');
        const cacheService = getCacheService();
        if (!cacheService) {
          return res.status(503).json({
            success: false,
            error: 'Cache service not available',
            timestamp: new Date().toISOString()
          });
        }

        const stats = await cacheService.getStatistics();
        logger.info('Cache stats accessed', {
          adminId: req.admin.id,
          role: req.admin.role,
          timestamp: new Date().toISOString()
        });
        
        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Cache stats error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: 'Failed to retrieve cache statistics',
          timestamp: new Date().toISOString()
        });
      }
    });

    this.app.post('/admin/cache/flush/:type?', authenticateAdmin(['admin', 'superadmin']), async (req, res) => {
      try {
        const { getCacheService } = require('./services/cache');
        const cacheService = getCacheService();
        if (!cacheService) {
          return res.status(503).json({
            success: false,
            error: 'Cache service not available',
            timestamp: new Date().toISOString()
          });
        }

        const { type } = req.params;
        const result = type ? 
          await cacheService.flushType(type) : 
          await cacheService.flushAll();

        logger.warn('Cache flush executed', {
          adminId: req.admin.id,
          role: req.admin.role,
          flushType: type || 'all',
          result,
          timestamp: new Date().toISOString()
        });

        res.json({
          success: result,
          message: `Cache ${type ? `type '${type}'` : 'all data'} flushed successfully`,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Cache flush error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: 'Failed to flush cache',
          timestamp: new Date().toISOString()
        });
      }
    });

    this.app.get('/admin/cache/health', authenticateAdmin(['admin', 'superadmin']), async (req, res) => {
      try {
        const { getCacheService } = require('./services/cache');
        const cacheService = getCacheService();
        if (!cacheService) {
          return res.status(503).json({
            success: false,
            error: 'Cache service not available',
            timestamp: new Date().toISOString()
          });
        }

        const health = await cacheService.performHealthCheck();
        res.json({
          success: true,
          data: health,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Cache health check error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal Server Error',
          message: 'Failed to check cache health',
          timestamp: new Date().toISOString()
        });
      }
    });

    // API routes
    this.app.use('/api/session', sessionRoutes);
    this.app.use('/api/drivers', driversRoutes);
    this.app.use('/api/track', trackRoutes);
    this.app.use('/api/database', databaseRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
      });
    });
  }

  setupErrorHandling() {
    this.app.use(globalErrorHandler);
  }

  // DEPRECATED: Legacy method - replaced with JWT authentication
  // Keeping for backward compatibility during migration period
  async handleAdminRequest(req, res, handler) {
    logger.warn('DEPRECATED: handleAdminRequest method called - migrate to JWT authentication', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
    
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'This endpoint has been migrated to JWT authentication. Please use proper authentication tokens.',
      timestamp: new Date().toISOString()
    });
  }

  async start() {
    try {
      // Initialize database service first
      try {
        const dbSystem = await initializeDatabase({
          path: process.env.DATABASE_PATH || './data/f1_timing.db'
        });
        this.databaseService = dbSystem.service;
        logger.info('Database service initialized');
      } catch (dbError) {
        logger.warn('Database service initialization failed, continuing without database logging:', dbError.message);
        this.databaseService = null;
      }

      // Initialize cache service (required by other services)
      try {
        this.cacheService = await initializeCacheService();
        logger.info('Cache service initialized');
        healthChecker.initializeCacheHealthChecks();
      } catch (cacheError) {
        logger.warn('Cache service initialization failed, continuing with memory-only cache:', cacheError.message);
        this.cacheService = null;
      }

      // Initialize WebSocket server
      this.io = setupWebSocket(this.server);
      logger.info('WebSocket server initialized');

      // Initialize SignalR service (with error handling)
      try {
        this.signalRService = await initializeSignalR(this.io);
        logger.info('SignalR service initialized');
        healthChecker.addSignalRCheck(this.signalRService);
      } catch (signalRError) {
        logger.warn('SignalR initialization failed, continuing without live F1 data:', signalRError.message);
        this.signalRService = null;
      }

      // Add health checks for services
      healthChecker.addWebSocketCheck({ io: this.io });

      // Start HTTP server
      this.server.listen(config.port, () => {
        logger.info(`F1 Backend Server running on port ${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`Health check available at: http://localhost:${config.port}/health`);
        
        // Log cache status
        if (this.cacheService) {
          const cacheStats = this.cacheService.getStatistics();
          logger.info(`Cache system: ${cacheStats.failoverMode ? 'Memory only (failover mode)' : 'Redis + Memory (full mode)'}`);
        }
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown();
      
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      try {
        // Close SignalR connection
        if (this.signalRService) {
          await this.signalRService.disconnect();
          logger.info('SignalR connection closed');
        }

        // Close database service
        if (this.databaseService && this.databaseService.db) {
          await this.databaseService.db.gracefulShutdown();
          logger.info('Database service closed');
        }

        // Close cache service
        if (this.cacheService) {
          await this.cacheService.close();
          logger.info('Cache service closed');
        }

        // Close WebSocket server
        if (this.io) {
          this.io.close();
          logger.info('WebSocket server closed');
        }

        // Close HTTP server
        this.server.close(() => {
          logger.info('HTTP server closed');
          process.exit(0);
        });

        // Force close after 10 seconds
        setTimeout(() => {
          logger.error('Could not close connections in time, forcefully shutting down');
          process.exit(1);
        }, 10000);

      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// Start the server
if (require.main === module) {
  const server = new F1BackendServer();
  server.start();
}

module.exports = F1BackendServer;