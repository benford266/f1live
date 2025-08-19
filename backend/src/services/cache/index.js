const EventEmitter = require('events');
const { RedisConnectionManager, RedisCache } = require('./redis');
const DataCache = require('../data/cache'); // In-memory cache
const config = require('../../config');
const logger = require('../../utils/logger');

/**
 * Multi-Level Cache Service with Redis L2 and Memory L1
 * Provides failover, performance optimization, and intelligent caching
 */
class MultiLevelCacheService extends EventEmitter {
  constructor() {
    super();
    
    // Cache layers
    this.redisConnectionManager = null;
    this.redisCache = null;
    this.memoryCache = null;
    
    // State management
    this.isInitialized = false;
    this.redisAvailable = false;
    this.failoverMode = false;
    
    // Performance tracking
    this.stats = {
      l1Hits: 0,
      l2Hits: 0,
      misses: 0,
      writes: 0,
      errors: 0,
      failovers: 0,
      lastFailoverAt: null,
      totalOperations: 0,
    };
    
    // Background tasks
    this.syncInterval = null;
    this.statsInterval = null;
    this.healthCheckInterval = null;
  }

  /**
   * Initialize the multi-level cache system
   */
  async initialize() {
    try {
      logger.info('Initializing multi-level cache service...');
      
      // Initialize memory cache (L1) - this should never fail
      this.initializeMemoryCache();
      
      // Initialize Redis cache (L2) with failover - this might fail gracefully
      await this.initializeRedisCache();
      
      // Start background tasks
      this.startBackgroundTasks();
      
      this.isInitialized = true;
      
      const mode = this.redisAvailable ? 'Redis + Memory (full mode)' : 'Memory only (failover mode)';
      logger.info(`Multi-level cache service initialized successfully in ${mode}`);
      this.emit('initialized');
      
    } catch (error) {
      logger.error('Failed to initialize cache service:', error);
      
      // If we at least have memory cache, continue in failover mode
      if (this.memoryCache) {
        this.enableFailoverMode('Initialization error');
        this.isInitialized = true;
        logger.info('Cache service initialized in failover mode (memory-only)');
        this.emit('initialized');
        return;
      }
      
      // If we can't even initialize memory cache, this is a critical error
      throw error;
    }
  }

  /**
   * Initialize memory cache (L1)
   */
  initializeMemoryCache() {
    const maxSize = config.performance.maxCacheSize;
    const ttl = config.redis.cache.ttl.default * 1000; // Convert to milliseconds
    
    this.memoryCache = new DataCache(maxSize, ttl);
    logger.info(`Memory cache (L1) initialized with max size: ${maxSize}, TTL: ${ttl}ms`);
  }

  /**
   * Initialize Redis cache (L2)
   */
  async initializeRedisCache() {
    if (!config.redis.failover.enabled) {
      if (config.nodeEnv === 'development') {
        logger.info('Redis disabled for development - using memory-only cache');
      } else {
        logger.info('Redis failover disabled, skipping Redis initialization');
      }
      return;
    }

    try {
      this.redisConnectionManager = new RedisConnectionManager();
      await this.redisConnectionManager.initialize();
      
      this.redisCache = new RedisCache(this.redisConnectionManager);
      this.redisAvailable = true;
      
      // Set up Redis event handlers
      this.setupRedisEventHandlers();
      
      logger.info('Redis cache (L2) initialized successfully');
    } catch (error) {
      if (config.nodeEnv === 'development') {
        logger.info('Redis not available in development - continuing with memory-only cache');
        logger.info('This is normal for local development. To install Redis: brew install redis && brew services start redis');
      } else {
        logger.warn('Redis cache initialization failed, continuing with memory-only mode:', error.message);
      }
      
      this.enableFailoverMode('Redis initialization failed');
      
      // Clean up any partial initialization
      if (this.redisConnectionManager) {
        try {
          await this.redisConnectionManager.close();
        } catch (closeError) {
          logger.debug('Error cleaning up Redis connection manager:', closeError.message);
        }
        this.redisConnectionManager = null;
      }
      this.redisCache = null;
      this.redisAvailable = false;
      
      // Don't throw error - let the service continue with memory-only mode
      return;
    }
  }

  /**
   * Set up Redis event handlers for monitoring and failover
   */
  setupRedisEventHandlers() {
    if (!this.redisConnectionManager) return;

    this.redisConnectionManager.on('connected', () => {
      this.redisAvailable = true;
      if (this.failoverMode) {
        logger.info('Redis reconnected, exiting failover mode');
        this.disableFailoverMode();
      }
    });

    this.redisConnectionManager.on('disconnected', () => {
      this.redisAvailable = false;
      this.enableFailoverMode('Redis disconnected');
    });

    this.redisConnectionManager.on('error', (error) => {
      this.stats.errors++;
      // Handle error gracefully - don't log as error if we're already in failover mode
      if (!this.failoverMode) {
        logger.warn('Redis connection error, enabling failover mode:', error.message);
        this.enableFailoverMode('Redis error occurred');
      } else {
        logger.debug('Redis error in failover mode (expected):', error.message);
      }
    });

    this.redisConnectionManager.on('metrics', (metrics) => {
      this.emit('redis-metrics', metrics);
    });

    this.redisConnectionManager.on('healthCheck', (status) => {
      this.emit('redis-health', status);
    });
  }

  /**
   * Enable failover mode (memory-only)
   */
  enableFailoverMode(reason) {
    if (this.failoverMode) return;
    
    this.failoverMode = true;
    this.redisAvailable = false;
    this.stats.failovers++;
    this.stats.lastFailoverAt = new Date();
    
    logger.warn(`Entering failover mode: ${reason}`);
    this.emit('failover-enabled', { reason, timestamp: new Date() });
  }

  /**
   * Disable failover mode (Redis restored)
   */
  disableFailoverMode() {
    if (!this.failoverMode) return;
    
    this.failoverMode = false;
    this.redisAvailable = true;
    
    logger.info('Exiting failover mode: Redis restored');
    this.emit('failover-disabled', { timestamp: new Date() });
    
    // Optionally sync memory cache to Redis
    this.syncMemoryToRedis().catch(error => {
      logger.warn('Failed to sync memory cache to Redis after failover:', error);
    });
  }

  /**
   * Start background tasks
   */
  startBackgroundTasks() {
    // Cache synchronization (memory -> Redis)
    if (config.redis.failover.enabled) {
      this.syncInterval = setInterval(() => {
        this.performBackgroundSync().catch(error => {
          logger.warn('Background cache sync failed:', error);
        });
      }, 30000); // Sync every 30 seconds
    }

    // Statistics collection
    this.statsInterval = setInterval(() => {
      this.emitStatistics();
    }, 60000); // Emit stats every minute

    // Health check
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck().catch(error => {
        logger.warn('Cache health check failed:', error);
      });
    }, config.redis.failover.healthCheckInterval || 30000);
  }

  /**
   * Set cache value with multi-level storage
   */
  async set(type, key, value, options = {}) {
    this.stats.totalOperations++;
    this.stats.writes++;

    try {
      const ttl = options.ttl || config.redis.cache.ttl[type] || config.redis.cache.ttl.default;
      const forceMemoryOnly = options.memoryOnly || false;

      // Always store in memory cache (L1)
      const memoryCacheKey = `${type}:${key}`;
      this.memoryCache.set(memoryCacheKey, value);

      // Store in Redis (L2) if available and not forced memory-only
      if (this.redisAvailable && !forceMemoryOnly && !this.failoverMode) {
        try {
          await this.redisCache.set(type, key, value, ttl);
        } catch (error) {
          logger.warn(`Failed to set Redis cache for ${type}:${key}, continuing with memory-only:`, error);
          this.enableFailoverMode('Redis write failed');
        }
      }

      logger.debug(`Cache set: ${type}:${key} (L1: true, L2: ${this.redisAvailable && !forceMemoryOnly && !this.failoverMode})`);
      return true;

    } catch (error) {
      this.stats.errors++;
      logger.error(`Failed to set cache for ${type}:${key}:`, error);
      throw error;
    }
  }

  /**
   * Get cache value with multi-level lookup
   */
  async get(type, key) {
    this.stats.totalOperations++;

    try {
      const memoryCacheKey = `${type}:${key}`;

      // Check memory cache first (L1)
      const memoryValue = this.memoryCache.get(memoryCacheKey);
      if (memoryValue !== null) {
        this.stats.l1Hits++;
        logger.debug(`Cache L1 hit: ${type}:${key}`);
        return memoryValue;
      }

      // Check Redis cache (L2) if available
      if (this.redisAvailable && !this.failoverMode) {
        try {
          const redisValue = await this.redisCache.get(type, key);
          if (redisValue !== null) {
            this.stats.l2Hits++;
            
            // Back-fill memory cache
            this.memoryCache.set(memoryCacheKey, redisValue);
            
            logger.debug(`Cache L2 hit: ${type}:${key}`);
            return redisValue;
          }
        } catch (error) {
          logger.warn(`Failed to get Redis cache for ${type}:${key}:`, error);
          this.enableFailoverMode('Redis read failed');
        }
      }

      // Cache miss
      this.stats.misses++;
      logger.debug(`Cache miss: ${type}:${key}`);
      return null;

    } catch (error) {
      this.stats.errors++;
      logger.error(`Failed to get cache for ${type}:${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if cache key exists
   */
  async exists(type, key) {
    try {
      const memoryCacheKey = `${type}:${key}`;

      // Check memory cache first
      if (this.memoryCache.has(memoryCacheKey)) {
        return true;
      }

      // Check Redis cache if available
      if (this.redisAvailable && !this.failoverMode) {
        try {
          return await this.redisCache.exists(type, key);
        } catch (error) {
          logger.warn(`Failed to check Redis cache existence for ${type}:${key}:`, error);
          this.enableFailoverMode('Redis exists check failed');
        }
      }

      return false;
    } catch (error) {
      logger.error(`Failed to check cache existence for ${type}:${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete cache value from both layers
   */
  async delete(type, key) {
    try {
      const memoryCacheKey = `${type}:${key}`;

      // Delete from memory cache
      this.memoryCache.delete(memoryCacheKey);

      // Delete from Redis cache if available
      if (this.redisAvailable && !this.failoverMode) {
        try {
          await this.redisCache.delete(type, key);
        } catch (error) {
          logger.warn(`Failed to delete Redis cache for ${type}:${key}:`, error);
          this.enableFailoverMode('Redis delete failed');
        }
      }

      logger.debug(`Cache deleted: ${type}:${key}`);
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error(`Failed to delete cache for ${type}:${key}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple cache values
   */
  async mget(type, keys) {
    try {
      const results = {};
      const redisKeys = [];

      // Check memory cache for all keys first
      for (const key of keys) {
        const memoryCacheKey = `${type}:${key}`;
        const memoryValue = this.memoryCache.get(memoryCacheKey);
        if (memoryValue !== null) {
          results[key] = memoryValue;
          this.stats.l1Hits++;
        } else {
          redisKeys.push(key);
        }
      }

      // Get remaining keys from Redis
      if (redisKeys.length > 0 && this.redisAvailable && !this.failoverMode) {
        try {
          const redisResults = await this.redisCache.mget(type, redisKeys);
          
          for (const [key, value] of Object.entries(redisResults)) {
            results[key] = value;
            this.stats.l2Hits++;
            
            // Back-fill memory cache
            const memoryCacheKey = `${type}:${key}`;
            this.memoryCache.set(memoryCacheKey, value);
          }
        } catch (error) {
          logger.warn(`Failed to get multiple Redis cache values for ${type}:`, error);
          this.enableFailoverMode('Redis mget failed');
        }
      }

      // Count misses
      const foundKeys = Object.keys(results).length;
      this.stats.misses += keys.length - foundKeys;

      return results;
    } catch (error) {
      this.stats.errors++;
      logger.error(`Failed to get multiple cache values for ${type}:`, error);
      throw error;
    }
  }

  /**
   * Set multiple cache values
   */
  async mset(type, keyValuePairs, options = {}) {
    try {
      // Set in memory cache
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const memoryCacheKey = `${type}:${key}`;
        this.memoryCache.set(memoryCacheKey, value);
      }

      // Set in Redis cache if available
      if (this.redisAvailable && !this.failoverMode && !options.memoryOnly) {
        try {
          await this.redisCache.mset(type, keyValuePairs, options.ttl);
        } catch (error) {
          logger.warn(`Failed to set multiple Redis cache values for ${type}:`, error);
          this.enableFailoverMode('Redis mset failed');
        }
      }

      this.stats.writes += Object.keys(keyValuePairs).length;
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error(`Failed to set multiple cache values for ${type}:`, error);
      throw error;
    }
  }

  /**
   * Cache specific F1 data types with optimized TTL
   */
  async cacheSessionData(sessionData) {
    return this.set('session', 'current', sessionData, {
      ttl: config.redis.cache.ttl.session
    });
  }

  async cacheDriverData(driverData) {
    const promises = Object.entries(driverData).map(([driverNumber, data]) =>
      this.set('drivers', driverNumber, data, {
        ttl: config.redis.cache.ttl.drivers
      })
    );
    
    await Promise.allSettled(promises);
    return true;
  }

  async cacheTimingData(timingData) {
    return this.set('timing', 'current', timingData, {
      ttl: config.redis.cache.ttl.timing
    });
  }

  async cacheWeatherData(weatherData) {
    return this.set('weather', 'current', weatherData, {
      ttl: config.redis.cache.ttl.weather
    });
  }

  async cacheTrackStatus(trackStatus) {
    return this.set('track', 'status', trackStatus, {
      ttl: config.redis.cache.ttl.track
    });
  }

  async cachePositionData(positionData) {
    return this.set('position', 'current', positionData, {
      ttl: config.redis.cache.ttl.position
    });
  }

  async cacheTelemetryData(driverNumber, telemetryData) {
    return this.set('telemetry', driverNumber, telemetryData, {
      ttl: config.redis.cache.ttl.telemetry
    });
  }

  /**
   * Get cached F1 data
   */
  async getSessionData() {
    return this.get('session', 'current');
  }

  async getDriverData(driverNumber) {
    return this.get('drivers', driverNumber);
  }

  async getAllDriverData() {
    // Get from memory cache first
    const memoryDrivers = this.memoryCache.getKeysByPattern('drivers:.*');
    const drivers = {};
    
    for (const key of memoryDrivers) {
      const driverNumber = key.split(':')[1];
      const data = this.memoryCache.get(key);
      if (data) {
        drivers[driverNumber] = data;
      }
    }

    return drivers;
  }

  async getTimingData() {
    return this.get('timing', 'current');
  }

  async getWeatherData() {
    return this.get('weather', 'current');
  }

  async getTrackStatus() {
    return this.get('track', 'status');
  }

  async getPositionData() {
    return this.get('position', 'current');
  }

  async getTelemetryData(driverNumber) {
    return this.get('telemetry', driverNumber);
  }

  /**
   * WebSocket client session management
   */
  async cacheClientSession(clientId, sessionData) {
    return this.set('websocket', `client:${clientId}`, sessionData, {
      ttl: 3600, // 1 hour
      memoryOnly: true // Keep client sessions in memory only
    });
  }

  async getClientSession(clientId) {
    return this.get('websocket', `client:${clientId}`);
  }

  async deleteClientSession(clientId) {
    return this.delete('websocket', `client:${clientId}`);
  }

  /**
   * Rate limiting support
   */
  async incrementRateLimit(identifier, windowMs = 60000) {
    const key = `rate_limit:${identifier}`;
    const current = await this.get('rate_limit', key) || { count: 0, resetTime: Date.now() + windowMs };
    
    if (Date.now() > current.resetTime) {
      current.count = 1;
      current.resetTime = Date.now() + windowMs;
    } else {
      current.count++;
    }

    await this.set('rate_limit', key, current, { ttl: Math.ceil(windowMs / 1000) });
    return current;
  }

  /**
   * Sync memory cache to Redis (background task)
   */
  async performBackgroundSync() {
    if (!this.redisAvailable || this.failoverMode) return;

    try {
      // This is a simplified sync - in a full implementation,
      // you might want to track dirty keys and only sync those
      logger.debug('Performing background cache synchronization');
      
      // For now, just log that sync would happen
      // In a real implementation, you'd sync recent/dirty memory entries to Redis
      
    } catch (error) {
      logger.warn('Background cache sync failed:', error);
    }
  }

  /**
   * Sync all memory cache to Redis
   */
  async syncMemoryToRedis() {
    if (!this.redisAvailable || this.failoverMode) {
      logger.warn('Cannot sync to Redis: not available or in failover mode');
      return;
    }

    try {
      logger.info('Syncing memory cache to Redis...');
      
      const allData = this.memoryCache.getAll();
      const syncPromises = [];
      
      for (const [key, value] of Object.entries(allData)) {
        const [type, ...keyParts] = key.split(':');
        const cacheKey = keyParts.join(':');
        
        syncPromises.push(
          this.redisCache.set(type, cacheKey, value).catch(error => {
            logger.warn(`Failed to sync ${key} to Redis:`, error);
          })
        );
      }

      await Promise.allSettled(syncPromises);
      logger.info(`Synced ${syncPromises.length} items to Redis`);
      
    } catch (error) {
      logger.error('Failed to sync memory cache to Redis:', error);
      throw error;
    }
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    const health = {
      memory: {
        available: true,
        stats: this.memoryCache.getStats()
      },
      redis: {
        available: this.redisAvailable,
        connected: this.redisConnectionManager ? this.redisConnectionManager.isRedisConnected() : false,
        status: this.redisConnectionManager ? this.redisConnectionManager.getStatus() : null
      },
      service: {
        initialized: this.isInitialized,
        failoverMode: this.failoverMode,
        stats: this.stats
      }
    };

    this.emit('health-check', health);
    return health;
  }

  /**
   * Emit statistics
   */
  emitStatistics() {
    const stats = {
      ...this.stats,
      memoryCache: this.memoryCache.getStats(),
      redisAvailable: this.redisAvailable,
      failoverMode: this.failoverMode,
      hitRate: this.stats.totalOperations > 0 ? 
        (this.stats.l1Hits + this.stats.l2Hits) / this.stats.totalOperations : 0,
      timestamp: new Date().toISOString()
    };

    this.emit('statistics', stats);
    logger.debug('Cache statistics:', {
      hitRate: (stats.hitRate * 100).toFixed(2) + '%',
      l1Hits: stats.l1Hits,
      l2Hits: stats.l2Hits,
      misses: stats.misses,
      failoverMode: stats.failoverMode
    });
  }

  /**
   * Get current statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      memoryCache: this.memoryCache.getStats(),
      redisAvailable: this.redisAvailable,
      failoverMode: this.failoverMode,
      hitRate: this.stats.totalOperations > 0 ? 
        (this.stats.l1Hits + this.stats.l2Hits) / this.stats.totalOperations : 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Flush all caches
   */
  async flushAll() {
    try {
      // Clear memory cache
      this.memoryCache.clear();

      // Clear Redis cache if available
      if (this.redisAvailable && !this.failoverMode) {
        await this.redisCache.flushAll();
      }

      logger.info('All caches flushed');
      return true;
    } catch (error) {
      logger.error('Failed to flush all caches:', error);
      throw error;
    }
  }

  /**
   * Flush cache by type
   */
  async flushType(type) {
    try {
      // Clear from memory cache
      const pattern = `${type}:*`;
      const keys = this.memoryCache.getKeysByPattern(pattern);
      keys.forEach(key => this.memoryCache.delete(key));

      // Clear from Redis cache if available
      if (this.redisAvailable && !this.failoverMode) {
        await this.redisCache.flushType(type);
      }

      logger.info(`Cache type '${type}' flushed`);
      return true;
    } catch (error) {
      logger.error(`Failed to flush cache type '${type}':`, error);
      throw error;
    }
  }

  /**
   * Close the cache service
   */
  async close() {
    logger.info('Closing cache service...');

    // Clear intervals
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Close Redis connection
    if (this.redisConnectionManager) {
      await this.redisConnectionManager.close();
    }

    // Clear memory cache
    if (this.memoryCache) {
      this.memoryCache.destroy();
    }

    this.isInitialized = false;
    logger.info('Cache service closed');
  }
}

// Singleton instance
let cacheServiceInstance = null;

/**
 * Get or create cache service instance
 */
function getCacheService() {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new MultiLevelCacheService();
  }
  return cacheServiceInstance;
}

/**
 * Initialize cache service
 */
async function initializeCacheService() {
  const cacheService = getCacheService();
  if (!cacheService.isInitialized) {
    await cacheService.initialize();
  }
  return cacheService;
}

module.exports = {
  MultiLevelCacheService,
  getCacheService,
  initializeCacheService
};