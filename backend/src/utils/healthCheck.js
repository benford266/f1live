const logger = require('./logger');
const config = require('../config');
const { getCacheService } = require('../services/cache');

class HealthChecker {
  constructor() {
    this.checks = new Map();
    this.lastResults = new Map();
    this.setupDefaultChecks();
  }

  setupDefaultChecks() {
    // Basic server health
    this.addCheck('server', async () => {
      return {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        pid: process.pid,
        memory: process.memoryUsage(),
        version: process.version
      };
    });

    // Environment check
    this.addCheck('environment', async () => {
      return {
        status: 'healthy',
        nodeEnv: config.nodeEnv,
        port: config.port,
        timestamp: new Date().toISOString()
      };
    });

    // Memory usage check
    this.addCheck('memory', async () => {
      const usage = process.memoryUsage();
      const totalMB = Math.round(usage.heapTotal / 1024 / 1024);
      const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
      const utilization = Math.round((usage.heapUsed / usage.heapTotal) * 100);

      const status = utilization > 90 ? 'unhealthy' : utilization > 70 ? 'warning' : 'healthy';

      return {
        status,
        heapTotal: `${totalMB}MB`,
        heapUsed: `${usedMB}MB`,
        utilization: `${utilization}%`,
        external: Math.round(usage.external / 1024 / 1024),
        timestamp: new Date().toISOString()
      };
    });

    // Event loop lag check
    this.addCheck('eventLoop', async () => {
      return new Promise((resolve) => {
        const start = process.hrtime();
        setImmediate(() => {
          const delta = process.hrtime(start);
          const lag = Math.round((delta[0] * 1e9 + delta[1]) / 1e6); // Convert to milliseconds
          
          const status = lag > 100 ? 'unhealthy' : lag > 50 ? 'warning' : 'healthy';
          
          resolve({
            status,
            lag: `${lag}ms`,
            threshold: '100ms',
            timestamp: new Date().toISOString()
          });
        });
      });
    });
  }

  addCheck(name, checkFunction) {
    if (typeof checkFunction !== 'function') {
      throw new Error('Health check must be a function');
    }
    
    this.checks.set(name, checkFunction);
    logger.debug(`Added health check: ${name}`);
  }

  removeCheck(name) {
    this.checks.delete(name);
    this.lastResults.delete(name);
    logger.debug(`Removed health check: ${name}`);
  }

  async runCheck(name) {
    const checkFunction = this.checks.get(name);
    
    if (!checkFunction) {
      throw new Error(`Health check '${name}' not found`);
    }

    try {
      const startTime = Date.now();
      const result = await checkFunction();
      const duration = Date.now() - startTime;

      const checkResult = {
        name,
        ...result,
        duration: `${duration}ms`,
        lastChecked: new Date().toISOString()
      };

      this.lastResults.set(name, checkResult);
      return checkResult;
      
    } catch (error) {
      const errorResult = {
        name,
        status: 'error',
        error: error.message,
        lastChecked: new Date().toISOString()
      };

      this.lastResults.set(name, errorResult);
      logger.error(`Health check '${name}' failed:`, error);
      return errorResult;
    }
  }

  async runAllChecks() {
    const results = {};
    const checkPromises = Array.from(this.checks.keys()).map(async (name) => {
      const result = await this.runCheck(name);
      results[name] = result;
    });

    await Promise.all(checkPromises);

    // Calculate overall health
    const overallStatus = this.calculateOverallStatus(results);
    
    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: results,
      summary: this.generateSummary(results)
    };
  }

  calculateOverallStatus(results) {
    const statuses = Object.values(results).map(r => r.status);
    
    if (statuses.some(s => s === 'error' || s === 'unhealthy')) {
      return 'unhealthy';
    }
    
    if (statuses.some(s => s === 'warning')) {
      return 'warning';
    }
    
    return 'healthy';
  }

  generateSummary(results) {
    const total = Object.keys(results).length;
    const healthy = Object.values(results).filter(r => r.status === 'healthy').length;
    const warning = Object.values(results).filter(r => r.status === 'warning').length;
    const unhealthy = Object.values(results).filter(r => r.status === 'unhealthy' || r.status === 'error').length;

    return {
      total,
      healthy,
      warning,
      unhealthy,
      healthyPercentage: Math.round((healthy / total) * 100)
    };
  }

  getLastResults() {
    return Object.fromEntries(this.lastResults);
  }

  async getDetailedStatus() {
    const allResults = await this.runAllChecks();
    
    return {
      ...allResults,
      server: {
        name: 'F1 Live Data Backend',
        version: process.env.npm_package_version || '1.0.0',
        environment: config.nodeEnv,
        startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        uptime: this.formatUptime(process.uptime())
      }
    };
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0) parts.push(`${secs}s`);

    return parts.join(' ') || '0s';
  }

  // Add SignalR-specific health check
  addSignalRCheck(signalRService) {
    this.addCheck('signalr', async () => {
      if (!signalRService) {
        return {
          status: 'error',
          message: 'SignalR service not initialized',
          connected: false
        };
      }

      const status = signalRService.getConnectionStatus();
      const isHealthy = status.connected && (status.clientState === 'connected' || status.state === 'Connected');

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        connected: status.connected,
        state: status.clientState || status.state,
        reconnectAttempts: status.reconnectAttempts,
        subscriptions: status.subscriptions.length,
        message: isHealthy ? 'Connected to F1 Live Timing' : 'Not connected to F1 Live Timing'
      };
    });
  }

  // Add WebSocket-specific health check
  addWebSocketCheck(wsService) {
    this.addCheck('websocket', async () => {
      if (!wsService || !wsService.io) {
        return {
          status: 'error',
          message: 'WebSocket service not initialized',
          connections: 0
        };
      }

      const connectedSockets = wsService.io.sockets.sockets.size;
      
      return {
        status: 'healthy',
        connections: connectedSockets,
        message: `${connectedSockets} WebSocket connections active`
      };
    });
  }

  // Add Redis cache health check
  addCacheCheck() {
    this.addCheck('cache', async () => {
      try {
        const cacheService = getCacheService();
        
        if (!cacheService || !cacheService.isInitialized) {
          return {
            status: 'warning',
            message: 'Cache service not initialized',
            initialized: false,
            memoryOnly: true
          };
        }

        // Perform cache health check
        const healthCheck = await cacheService.performHealthCheck();
        const stats = cacheService.getStatistics();
        
        let status = 'healthy';
        let message = 'Cache system operational';
        
        if (cacheService.failoverMode) {
          status = 'warning';
          message = 'Cache in failover mode (memory only)';
        } else if (!cacheService.redisAvailable) {
          status = 'warning';
          message = 'Redis unavailable, using memory cache';
        }
        
        return {
          status,
          message,
          initialized: cacheService.isInitialized,
          redisAvailable: cacheService.redisAvailable,
          failoverMode: cacheService.failoverMode,
          memory: healthCheck.memory,
          redis: healthCheck.redis,
          statistics: {
            hitRate: stats.hitRate,
            totalOperations: stats.totalOperations,
            l1Hits: stats.l1Hits,
            l2Hits: stats.l2Hits,
            misses: stats.misses,
            errors: stats.errors,
            failovers: stats.failovers
          }
        };
      } catch (error) {
        logger.error('Cache health check failed:', error);
        return {
          status: 'error',
          message: `Cache health check failed: ${error.message}`,
          error: error.message
        };
      }
    });
  }

  // Add Redis-specific health check
  addRedisCheck() {
    this.addCheck('redis', async () => {
      try {
        const cacheService = getCacheService();
        
        if (!cacheService || !cacheService.redisConnectionManager) {
          return {
            status: 'warning',
            message: 'Redis not configured or initialized',
            available: false
          };
        }

        const isConnected = cacheService.redisConnectionManager.isRedisConnected();
        const connectionStatus = cacheService.redisConnectionManager.getStatus();
        
        if (!isConnected) {
          return {
            status: 'unhealthy',
            message: 'Redis connection not available',
            available: false,
            connected: false,
            connectionStatus: connectionStatus.clientStatus,
            reconnectAttempts: connectionStatus.reconnectAttempts
          };
        }

        // Test Redis with a ping
        const healthCheckResult = await cacheService.redisConnectionManager.healthCheck();
        
        return {
          status: healthCheckResult ? 'healthy' : 'unhealthy',
          message: healthCheckResult ? 'Redis connection healthy' : 'Redis ping failed',
          available: true,
          connected: isConnected,
          connectionStatus: connectionStatus.clientStatus,
          metrics: connectionStatus.metrics,
          cluster: config.redis.cluster.enabled,
          compressionEnabled: config.redis.cache.compression.enabled
        };
      } catch (error) {
        logger.error('Redis health check failed:', error);
        return {
          status: 'error',
          message: `Redis health check failed: ${error.message}`,
          error: error.message,
          available: false
        };
      }
    });
  }

  // Add comprehensive cache monitoring
  addCacheMonitoringCheck() {
    this.addCheck('cacheMonitoring', async () => {
      try {
        const cacheService = getCacheService();
        
        if (!cacheService) {
          return {
            status: 'error',
            message: 'Cache service not available'
          };
        }

        const stats = cacheService.getStatistics();
        const memoryStats = stats.memoryCache;
        
        // Calculate health indicators
        const hitRate = stats.hitRate || 0;
        const errorRate = stats.totalOperations > 0 ? stats.errors / stats.totalOperations : 0;
        const memoryUtilization = memoryStats ? memoryStats.totalItems / memoryStats.maxSize : 0;
        
        let status = 'healthy';
        let warnings = [];
        
        if (hitRate < 0.5) {
          warnings.push('Low cache hit rate');
          status = 'warning';
        }
        
        if (errorRate > 0.05) {
          warnings.push('High cache error rate');
          status = 'warning';
        }
        
        if (memoryUtilization > 0.9) {
          warnings.push('High memory cache utilization');
          status = 'warning';
        }
        
        if (stats.failovers > 0 && stats.lastFailoverAt) {
          const timeSinceFailover = Date.now() - new Date(stats.lastFailoverAt).getTime();
          if (timeSinceFailover < 300000) { // 5 minutes
            warnings.push('Recent failover detected');
            status = 'warning';
          }
        }
        
        return {
          status,
          message: warnings.length > 0 ? warnings.join(', ') : 'Cache monitoring healthy',
          warnings,
          metrics: {
            hitRate: Math.round(hitRate * 100) + '%',
            errorRate: Math.round(errorRate * 100) + '%',
            memoryUtilization: Math.round(memoryUtilization * 100) + '%',
            totalOperations: stats.totalOperations,
            l1Hits: stats.l1Hits,
            l2Hits: stats.l2Hits,
            misses: stats.misses,
            errors: stats.errors,
            failovers: stats.failovers,
            failoverMode: stats.failoverMode,
            lastFailoverAt: stats.lastFailoverAt
          },
          thresholds: {
            minHitRate: '50%',
            maxErrorRate: '5%',
            maxMemoryUtilization: '90%'
          }
        };
      } catch (error) {
        logger.error('Cache monitoring check failed:', error);
        return {
          status: 'error',
          message: `Cache monitoring failed: ${error.message}`,
          error: error.message
        };
      }
    });
  }

  // Initialize all cache-related health checks
  initializeCacheHealthChecks() {
    this.addCacheCheck();
    this.addRedisCheck();
    this.addCacheMonitoringCheck();
    logger.info('Cache health checks initialized');
  }
}

// Singleton instance
const healthChecker = new HealthChecker();

module.exports = healthChecker;