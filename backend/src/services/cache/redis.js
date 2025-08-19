const Redis = require('ioredis');
const EventEmitter = require('events');
const lz4 = require('lz4');
const zlib = require('zlib');
const config = require('../../config');
const logger = require('../../utils/logger');

/**
 * Redis Connection Manager with clustering support and failover
 */
class RedisConnectionManager extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.subscriber = null;
    this.isConnected = false;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.metrics = {
      commands: 0,
      errors: 0,
      slowQueries: 0,
      bytesRead: 0,
      bytesWritten: 0,
      connectionCount: 0,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
    };
    this.healthCheckInterval = null;
    this.metricsInterval = null;
  }

  /**
   * Initialize Redis connection with clustering support
   */
  async initialize() {
    try {
      logger.info('Initializing Redis connection...');
      
      await this.createConnection();
      this.startHealthCheck();
      this.startMetricsCollection();
      
      logger.info('Redis connection manager initialized successfully');
    } catch (error) {
      // In development mode, provide more helpful error messages
      if (config.nodeEnv === 'development' && error.message.includes('ECONNREFUSED')) {
        logger.warn('Redis connection failed - this is expected in development if Redis is not running.');
        logger.info('To disable Redis entirely, set REDIS_FAILOVER_ENABLED=false in your .env file.');
        logger.info('The application will continue with memory-only caching.');
      } else {
        logger.error('Failed to initialize Redis connection:', error);
      }
      throw error;
    }
  }

  /**
   * Create Redis connection (cluster or standalone)
   */
  async createConnection() {
    const redisConfig = config.redis;
    
    try {
      // Create connection options with proper error handling
      const baseOptions = {
        connectTimeout: redisConfig.connectTimeout,
        commandTimeout: redisConfig.commandTimeout,
        retryDelayOnFailover: redisConfig.retryDelayOnFailover,
        maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
        enableAutoPipelining: redisConfig.enableAutoPipelining,
        family: redisConfig.family,
        keepAlive: redisConfig.keepAlive,
        connectionName: redisConfig.connectionName,
        lazyConnect: true, // Always use lazy connect for better error handling
        maxRetriesPerRequest: 0, // Disable automatic retries to handle errors gracefully
        retryStrategy: null, // Disable built-in retry strategy
      };

      if (redisConfig.cluster.enabled) {
        logger.info('Creating Redis cluster connection...');
        this.client = new Redis.Cluster(redisConfig.cluster.nodes, {
          enableReadyCheck: redisConfig.cluster.enableReadyCheck,
          redisOptions: {
            ...redisConfig.cluster.redisOptions,
            ...baseOptions,
          },
          maxRedirections: redisConfig.cluster.maxRedirections,
          scaleReads: redisConfig.cluster.scaleReads,
          retryDelayOnClusterDown: redisConfig.retryDelayOnClusterDown,
        });
      } else {
        logger.info('Creating Redis standalone connection...');
        this.client = new Redis({
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
          db: redisConfig.db,
          ...baseOptions,
        });
      }

      // Create separate subscriber client for pub/sub
      if (!redisConfig.cluster.enabled) {
        this.subscriber = this.client.duplicate();
      }

      // Set up event handlers before attempting connection
      this.setupEventHandlers();

      // Attempt to connect with timeout - catch connection errors
      try {
        await this.connectWithTimeout(redisConfig.connectTimeout);
      } catch (connectionError) {
        // Clean up and re-throw with more context
        if (this.client) {
          this.client.disconnect();
          this.client = null;
        }
        if (this.subscriber) {
          this.subscriber.disconnect();
          this.subscriber = null;
        }
        throw new Error(`Redis connection failed: ${connectionError.message}`);
      }

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.metrics.connectionCount++;
      this.metrics.lastConnectedAt = new Date();
      
      logger.info('Redis connection established successfully');
      this.emit('connected');

    } catch (error) {
      this.isConnected = false;
      this.metrics.errors++;
      logger.error('Failed to create Redis connection:', error);
      
      // Clean up client if it exists
      if (this.client) {
        this.client.disconnect();
        this.client = null;
      }
      if (this.subscriber) {
        this.subscriber.disconnect();
        this.subscriber = null;
      }
      
      throw error;
    }
  }

  /**
   * Connect to Redis with timeout
   */
  async connectWithTimeout(timeout = 10000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Redis connection timeout after ${timeout}ms`));
      }, timeout);

      this.client.connect().then(() => {
        clearTimeout(timeoutId);
        resolve();
      }).catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Set up Redis event handlers
   */
  setupEventHandlers() {
    if (!this.client) return;

    // Connection events
    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
      this.emit('connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.emit('ready');
    });

    this.client.on('error', (error) => {
      this.metrics.errors++;
      // Log error but don't throw to prevent unhandled errors
      if (error.code === 'ECONNREFUSED') {
        logger.warn(`Redis connection refused: ${error.message}`);
      } else if (error.code === 'ETIMEDOUT') {
        logger.warn(`Redis connection timeout: ${error.message}`);
      } else {
        logger.error('Redis client error:', error);
      }
      this.emit('error', error);
    });

    this.client.on('close', () => {
      this.isConnected = false;
      this.metrics.lastDisconnectedAt = new Date();
      logger.warn('Redis connection closed');
      this.emit('disconnected');
    });

    this.client.on('reconnecting', (delay) => {
      this.isReconnecting = true;
      this.reconnectAttempts++;
      logger.info(`Redis reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      this.emit('reconnecting', { delay, attempts: this.reconnectAttempts });
    });

    this.client.on('end', () => {
      this.isConnected = false;
      logger.warn('Redis connection ended');
      this.emit('ended');
    });

    // Monitor slow queries
    if (config.redis.monitoring.logSlowQueries) {
      this.client.on('command', (command) => {
        const start = Date.now();
        
        command.promise.finally(() => {
          const duration = Date.now() - start;
          this.metrics.commands++;
          
          if (duration > config.redis.monitoring.slowQueryThreshold) {
            this.metrics.slowQueries++;
            logger.warn(`Slow Redis query detected: ${command.name} took ${duration}ms`);
          }
        });
      });
    }

    // Cluster specific events
    if (this.client.mode === 'cluster') {
      this.client.on('node error', (error, address) => {
        logger.error(`Redis cluster node error at ${address}:`, error);
      });

      this.client.on('+node', (address) => {
        logger.info(`Redis cluster node added: ${address}`);
      });

      this.client.on('-node', (address) => {
        logger.warn(`Redis cluster node removed: ${address}`);
      });
    }
  }

  /**
   * Start health check monitoring
   */
  startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        logger.error('Redis health check failed:', error);
      }
    }, config.redis.failover.healthCheckInterval);
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    if (!config.redis.monitoring.collectMetrics) return;

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    this.metricsInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        logger.error('Failed to collect Redis metrics:', error);
      }
    }, config.redis.monitoring.metricsInterval);
  }

  /**
   * Perform health check
   */
  async healthCheck() {
    if (!this.client) return false;

    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      this.emit('healthCheck', { 
        status: 'healthy', 
        latency,
        timestamp: new Date().toISOString() 
      });
      
      return true;
    } catch (error) {
      this.emit('healthCheck', { 
        status: 'unhealthy', 
        error: error.message,
        timestamp: new Date().toISOString() 
      });
      
      return false;
    }
  }

  /**
   * Collect Redis metrics
   */
  async collectMetrics() {
    if (!this.client || !this.isConnected) return;

    try {
      const info = await this.client.info('memory');
      const memoryInfo = this.parseRedisInfo(info);
      
      const metrics = {
        ...this.metrics,
        memory: memoryInfo,
        timestamp: new Date().toISOString(),
      };

      this.emit('metrics', metrics);
      
      if (config.redis.monitoring.enabled) {
        logger.debug('Redis metrics collected:', {
          commands: metrics.commands,
          errors: metrics.errors,
          slowQueries: metrics.slowQueries,
          memoryUsage: memoryInfo.used_memory_human,
        });
      }
    } catch (error) {
      logger.error('Failed to collect Redis metrics:', error);
    }
  }

  /**
   * Parse Redis INFO response
   */
  parseRedisInfo(info) {
    const lines = info.split('\r\n');
    const result = {};
    
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value !== undefined) {
          result[key] = isNaN(value) ? value : Number(value);
        }
      }
    }
    
    return result;
  }

  /**
   * Get Redis client
   */
  getClient() {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  /**
   * Get subscriber client
   */
  getSubscriber() {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not initialized');
    }
    return this.subscriber;
  }

  /**
   * Check if Redis is connected
   */
  isRedisConnected() {
    return this.isConnected && this.client && this.client.status === 'ready';
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      reconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
      clientStatus: this.client ? this.client.status : 'not_initialized',
      metrics: this.metrics,
    };
  }

  /**
   * Close Redis connections
   */
  async close() {
    logger.info('Closing Redis connections...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    try {
      if (this.subscriber) {
        await this.subscriber.quit();
        this.subscriber = null;
      }

      if (this.client) {
        await this.client.quit();
        this.client = null;
      }

      this.isConnected = false;
      logger.info('Redis connections closed successfully');
    } catch (error) {
      logger.error('Error closing Redis connections:', error);
      throw error;
    }
  }
}

/**
 * Redis Cache Operations Service
 */
class RedisCache {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    this.config = config.redis.cache;
  }

  /**
   * Build cache key with prefix
   */
  buildKey(type, key) {
    const prefix = this.config.keyPrefix;
    const typePrefix = this.config.keyPrefixes[type] || '';
    return `${prefix}${typePrefix}${key}`;
  }

  /**
   * Compress data if enabled and threshold is met
   */
  async compressData(data) {
    if (!this.config.compression.enabled) {
      return { data: JSON.stringify(data), compressed: false };
    }

    const jsonString = JSON.stringify(data);
    const sizeInBytes = Buffer.byteLength(jsonString, 'utf8');

    if (sizeInBytes < this.config.compression.threshold) {
      return { data: jsonString, compressed: false };
    }

    try {
      let compressed;
      if (this.config.compression.algorithm === 'lz4') {
        compressed = lz4.encode(Buffer.from(jsonString, 'utf8'));
      } else {
        compressed = await new Promise((resolve, reject) => {
          zlib.gzip(jsonString, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
      }

      return { data: compressed.toString('base64'), compressed: true };
    } catch (error) {
      logger.warn('Failed to compress data, storing uncompressed:', error);
      return { data: jsonString, compressed: false };
    }
  }

  /**
   * Decompress data if needed
   */
  async decompressData(data, compressed) {
    if (!compressed) {
      return JSON.parse(data);
    }

    try {
      const buffer = Buffer.from(data, 'base64');
      let decompressed;

      if (this.config.compression.algorithm === 'lz4') {
        decompressed = lz4.decode(buffer);
      } else {
        decompressed = await new Promise((resolve, reject) => {
          zlib.gunzip(buffer, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
      }

      return JSON.parse(decompressed.toString('utf8'));
    } catch (error) {
      logger.error('Failed to decompress data:', error);
      throw error;
    }
  }

  /**
   * Set cache value with TTL
   */
  async set(type, key, value, ttl = null) {
    if (!this.connectionManager.isRedisConnected()) {
      throw new Error('Redis not connected');
    }

    try {
      const cacheKey = this.buildKey(type, key);
      const cacheTtl = ttl || this.config.ttl[type] || this.config.ttl.default;
      
      const { data, compressed } = await this.compressData(value);
      const cacheValue = { data, compressed, timestamp: Date.now() };

      const client = this.connectionManager.getClient();
      await client.setex(cacheKey, cacheTtl, JSON.stringify(cacheValue));

      logger.debug(`Cache set: ${cacheKey} (TTL: ${cacheTtl}s, Compressed: ${compressed})`);
      return true;
    } catch (error) {
      logger.error(`Failed to set cache for ${type}:${key}:`, error);
      throw error;
    }
  }

  /**
   * Get cache value
   */
  async get(type, key) {
    if (!this.connectionManager.isRedisConnected()) {
      throw new Error('Redis not connected');
    }

    try {
      const cacheKey = this.buildKey(type, key);
      const client = this.connectionManager.getClient();
      const result = await client.get(cacheKey);

      if (!result) {
        return null;
      }

      const cacheValue = JSON.parse(result);
      const data = await this.decompressData(cacheValue.data, cacheValue.compressed);

      logger.debug(`Cache hit: ${cacheKey}`);
      return data;
    } catch (error) {
      logger.error(`Failed to get cache for ${type}:${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if cache key exists
   */
  async exists(type, key) {
    if (!this.connectionManager.isRedisConnected()) {
      throw new Error('Redis not connected');
    }

    try {
      const cacheKey = this.buildKey(type, key);
      const client = this.connectionManager.getClient();
      const result = await client.exists(cacheKey);
      return result === 1;
    } catch (error) {
      logger.error(`Failed to check cache existence for ${type}:${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete cache value
   */
  async delete(type, key) {
    if (!this.connectionManager.isRedisConnected()) {
      throw new Error('Redis not connected');
    }

    try {
      const cacheKey = this.buildKey(type, key);
      const client = this.connectionManager.getClient();
      const result = await client.del(cacheKey);
      
      logger.debug(`Cache deleted: ${cacheKey}`);
      return result === 1;
    } catch (error) {
      logger.error(`Failed to delete cache for ${type}:${key}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple cache values
   */
  async mget(type, keys) {
    if (!this.connectionManager.isRedisConnected()) {
      throw new Error('Redis not connected');
    }

    try {
      const cacheKeys = keys.map(key => this.buildKey(type, key));
      const client = this.connectionManager.getClient();
      const results = await client.mget(...cacheKeys);

      const data = {};
      for (let i = 0; i < keys.length; i++) {
        if (results[i]) {
          try {
            const cacheValue = JSON.parse(results[i]);
            data[keys[i]] = await this.decompressData(cacheValue.data, cacheValue.compressed);
          } catch (error) {
            logger.warn(`Failed to parse cache value for ${keys[i]}:`, error);
          }
        }
      }

      return data;
    } catch (error) {
      logger.error(`Failed to get multiple cache values for ${type}:`, error);
      throw error;
    }
  }

  /**
   * Set multiple cache values
   */
  async mset(type, keyValuePairs, ttl = null) {
    if (!this.connectionManager.isRedisConnected()) {
      throw new Error('Redis not connected');
    }

    try {
      const client = this.connectionManager.getClient();
      const cacheTtl = ttl || this.config.ttl[type] || this.config.ttl.default;
      
      const pipeline = client.pipeline();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const cacheKey = this.buildKey(type, key);
        const { data, compressed } = await this.compressData(value);
        const cacheValue = { data, compressed, timestamp: Date.now() };
        
        pipeline.setex(cacheKey, cacheTtl, JSON.stringify(cacheValue));
      }

      await pipeline.exec();
      logger.debug(`Cache mset: ${Object.keys(keyValuePairs).length} keys for type ${type}`);
      return true;
    } catch (error) {
      logger.error(`Failed to set multiple cache values for ${type}:`, error);
      throw error;
    }
  }

  /**
   * Delete cache keys by pattern
   */
  async deletePattern(type, pattern) {
    if (!this.connectionManager.isRedisConnected()) {
      throw new Error('Redis not connected');
    }

    try {
      const searchPattern = this.buildKey(type, pattern);
      const client = this.connectionManager.getClient();
      
      const keys = await client.keys(searchPattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await client.del(...keys);
      logger.debug(`Cache pattern delete: ${result} keys deleted for pattern ${searchPattern}`);
      return result;
    } catch (error) {
      logger.error(`Failed to delete cache pattern ${type}:${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.connectionManager.isRedisConnected()) {
      throw new Error('Redis not connected');
    }

    try {
      const client = this.connectionManager.getClient();
      const info = await client.info('keyspace');
      const memory = await client.info('memory');
      
      return {
        keyspace: this.connectionManager.parseRedisInfo(info),
        memory: this.connectionManager.parseRedisInfo(memory),
        connection: this.connectionManager.getStatus(),
      };
    } catch (error) {
      logger.error('Failed to get cache statistics:', error);
      throw error;
    }
  }

  /**
   * Flush cache by type
   */
  async flushType(type) {
    if (!this.connectionManager.isRedisConnected()) {
      throw new Error('Redis not connected');
    }

    try {
      const pattern = this.buildKey(type, '*');
      return await this.deletePattern(type, '*');
    } catch (error) {
      logger.error(`Failed to flush cache type ${type}:`, error);
      throw error;
    }
  }

  /**
   * Flush all cache
   */
  async flushAll() {
    if (!this.connectionManager.isRedisConnected()) {
      throw new Error('Redis not connected');
    }

    try {
      const client = this.connectionManager.getClient();
      await client.flushdb();
      logger.info('All cache flushed');
      return true;
    } catch (error) {
      logger.error('Failed to flush all cache:', error);
      throw error;
    }
  }
}

module.exports = { RedisConnectionManager, RedisCache };