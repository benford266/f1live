require('dotenv').config();

const config = {
  // Server Configuration
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // F1 SignalR Configuration
  f1: {
    signalrUrl: process.env.F1_SIGNALR_URL || 'https://livetiming.formula1.com/signalr',
    hubName: process.env.F1_HUB_NAME || 'Streaming',
    reconnectInterval: parseInt(process.env.SIGNALR_RECONNECT_INTERVAL, 10) || 5000,
    maxReconnectAttempts: parseInt(process.env.SIGNALR_MAX_RECONNECT_ATTEMPTS, 10) || 10,
  },
  
  // CORS Configuration
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS ? 
      process.env.ALLOWED_ORIGINS.split(',') : 
      ['http://localhost:3000', 'http://localhost:3001'],
    credentials: process.env.CORS_CREDENTIALS === 'true',
    maxAge: parseInt(process.env.CORS_MAX_AGE, 10) || 86400, // 24 hours
    optionsSuccessStatus: 200,
    preflightContinue: false,
  },
  
  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
    skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'true',
    standardHeaders: true,
    legacyHeaders: false,
    // Enhanced rate limiting per endpoint
    api: {
      windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS, 10) || 60000, // 1 minute
      maxRequests: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS, 10) || 30,
    },
    websocket: {
      connectionLimit: parseInt(process.env.WS_CONNECTION_LIMIT, 10) || 50,
      eventsPerMinute: parseInt(process.env.WS_EVENTS_PER_MINUTE, 10) || 120,
    },
  },
  
  // WebSocket Configuration
  websocket: {
    heartbeatInterval: parseInt(process.env.WEBSOCKET_HEARTBEAT_INTERVAL, 10) || 30000,
    maxConnections: parseInt(process.env.WEBSOCKET_MAX_CONNECTIONS, 10) || 100,
    connectionTimeout: parseInt(process.env.WEBSOCKET_CONNECTION_TIMEOUT, 10) || 60000,
    maxEventRate: parseInt(process.env.WEBSOCKET_MAX_EVENT_RATE, 10) || 30, // events per minute
  },

  // Security Configuration
  security: {
    apiKeyRequired: process.env.REQUIRE_API_KEY === 'true',
    trustedProxies: process.env.TRUSTED_PROXIES ? process.env.TRUSTED_PROXIES.split(',') : [],
    maxPayloadSize: process.env.MAX_PAYLOAD_SIZE || '10mb',
    sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-change-in-production',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
    jwtExpiry: process.env.JWT_EXPIRY || '1h',
  },

  // Performance Configuration
  performance: {
    dataThrottleInterval: parseInt(process.env.DATA_THROTTLE_INTERVAL, 10) || 100, // ms
    maxCacheSize: parseInt(process.env.MAX_CACHE_SIZE, 10) || 1000,
    compressionLevel: parseInt(process.env.COMPRESSION_LEVEL, 10) || 6,
  },

  // Redis Configuration
  redis: {
    // Connection Configuration
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    
    // Connection Pool Configuration
    family: parseInt(process.env.REDIS_FAMILY, 10) || 4, // 4 (IPv4) or 6 (IPv6)
    connectionName: process.env.REDIS_CONNECTION_NAME || 'f1-live-data',
    keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE, 10) || 30000,
    lazyConnect: process.env.REDIS_LAZY_CONNECT === 'true',
    
    // Retry Configuration
    retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY_FAILOVER, 10) || 100,
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST, 10) || 3,
    retryDelayOnClusterDown: parseInt(process.env.REDIS_RETRY_DELAY_CLUSTER_DOWN, 10) || 300,
    enableAutoPipelining: process.env.REDIS_ENABLE_AUTO_PIPELINING !== 'false',
    
    // Timeout Configuration
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT, 10) || 5000,
    
    // Cluster Configuration (for Redis Cluster)
    cluster: {
      enabled: process.env.REDIS_CLUSTER_ENABLED === 'true',
      nodes: process.env.REDIS_CLUSTER_NODES ? 
        process.env.REDIS_CLUSTER_NODES.split(',').map(node => {
          const [host, port] = node.split(':');
          return { host, port: parseInt(port, 10) || 6379 };
        }) : [{ host: 'localhost', port: 6379 }],
      enableReadyCheck: process.env.REDIS_CLUSTER_READY_CHECK !== 'false',
      redisOptions: {
        password: process.env.REDIS_PASSWORD || undefined,
      },
      maxRedirections: parseInt(process.env.REDIS_CLUSTER_MAX_REDIRECTIONS, 10) || 16,
      scaleReads: process.env.REDIS_CLUSTER_SCALE_READS || 'slave',
    },
    
    // Cache Configuration
    cache: {
      // TTL Configuration (in seconds)
      ttl: {
        default: parseInt(process.env.REDIS_TTL_DEFAULT, 10) || 300, // 5 minutes
        session: parseInt(process.env.REDIS_TTL_SESSION, 10) || 1800, // 30 minutes
        drivers: parseInt(process.env.REDIS_TTL_DRIVERS, 10) || 600, // 10 minutes
        timing: parseInt(process.env.REDIS_TTL_TIMING, 10) || 60, // 1 minute
        weather: parseInt(process.env.REDIS_TTL_WEATHER, 10) || 120, // 2 minutes
        track: parseInt(process.env.REDIS_TTL_TRACK, 10) || 30, // 30 seconds
        position: parseInt(process.env.REDIS_TTL_POSITION, 10) || 10, // 10 seconds
        telemetry: parseInt(process.env.REDIS_TTL_TELEMETRY, 10) || 5, // 5 seconds
      },
      
      // Key Prefixes
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'f1:',
      keyPrefixes: {
        session: process.env.REDIS_PREFIX_SESSION || 'session:',
        drivers: process.env.REDIS_PREFIX_DRIVERS || 'drivers:',
        timing: process.env.REDIS_PREFIX_TIMING || 'timing:',
        weather: process.env.REDIS_PREFIX_WEATHER || 'weather:',
        track: process.env.REDIS_PREFIX_TRACK || 'track:',
        position: process.env.REDIS_PREFIX_POSITION || 'position:',
        telemetry: process.env.REDIS_PREFIX_TELEMETRY || 'telemetry:',
        websocket: process.env.REDIS_PREFIX_WEBSOCKET || 'ws:',
        rate_limit: process.env.REDIS_PREFIX_RATE_LIMIT || 'rl:',
      },
      
      // Compression Configuration
      compression: {
        enabled: process.env.REDIS_COMPRESSION_ENABLED !== 'false',
        threshold: parseInt(process.env.REDIS_COMPRESSION_THRESHOLD, 10) || 1024, // bytes
        algorithm: process.env.REDIS_COMPRESSION_ALGORITHM || 'lz4', // lz4, gzip
      },
      
      // Memory Management
      maxMemoryPolicy: process.env.REDIS_MAX_MEMORY_POLICY || 'allkeys-lru',
      maxMemoryUsage: process.env.REDIS_MAX_MEMORY_USAGE || '256mb',
    },
    
    // Failover Configuration
    failover: {
      enabled: process.env.REDIS_FAILOVER_ENABLED !== 'false',
      fallbackToMemory: process.env.REDIS_FALLBACK_TO_MEMORY !== 'false',
      healthCheckInterval: parseInt(process.env.REDIS_HEALTH_CHECK_INTERVAL, 10) || 30000, // 30 seconds
      reconnectInterval: parseInt(process.env.REDIS_RECONNECT_INTERVAL, 10) || 5000, // 5 seconds
      maxReconnectAttempts: parseInt(process.env.REDIS_MAX_RECONNECT_ATTEMPTS, 10) || 10,
    },
    
    // Monitoring Configuration
    monitoring: {
      enabled: process.env.REDIS_MONITORING_ENABLED !== 'false',
      logSlowQueries: process.env.REDIS_LOG_SLOW_QUERIES !== 'false',
      slowQueryThreshold: parseInt(process.env.REDIS_SLOW_QUERY_THRESHOLD, 10) || 100, // ms
      collectMetrics: process.env.REDIS_COLLECT_METRICS !== 'false',
      metricsInterval: parseInt(process.env.REDIS_METRICS_INTERVAL, 10) || 60000, // 1 minute
    },
  },
};

module.exports = config;