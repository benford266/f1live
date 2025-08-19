const logger = require('../../utils/logger');

class DataCache {
  constructor(maxSize = 1000, ttl = 300000) { // Default TTL: 5 minutes
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl; // Time to live in milliseconds
    this.accessTimes = new Map();
    this.creationTimes = new Map();
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute
  }

  set(key, value) {
    const now = Date.now();
    
    // Remove oldest item if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    // Store the data
    this.cache.set(key, value);
    this.accessTimes.set(key, now);
    this.creationTimes.set(key, now);

    logger.debug(`Cache: Set data for key '${key}'`);
  }

  get(key) {
    const now = Date.now();
    const creationTime = this.creationTimes.get(key);
    
    // Check if item exists and is not expired
    if (this.cache.has(key) && (!creationTime || (now - creationTime) < this.ttl)) {
      this.accessTimes.set(key, now);
      const value = this.cache.get(key);
      logger.debug(`Cache: Retrieved data for key '${key}'`);
      return value;
    }

    // Item doesn't exist or is expired
    if (this.cache.has(key)) {
      this.delete(key);
      logger.debug(`Cache: Expired and removed key '${key}'`);
    }

    return null;
  }

  has(key) {
    const now = Date.now();
    const creationTime = this.creationTimes.get(key);
    
    if (this.cache.has(key) && (!creationTime || (now - creationTime) < this.ttl)) {
      return true;
    }

    // Clean up expired item
    if (this.cache.has(key)) {
      this.delete(key);
    }

    return false;
  }

  delete(key) {
    this.cache.delete(key);
    this.accessTimes.delete(key);
    this.creationTimes.delete(key);
    logger.debug(`Cache: Deleted key '${key}'`);
  }

  clear() {
    this.cache.clear();
    this.accessTimes.clear();
    this.creationTimes.clear();
    logger.info('Cache: Cleared all data');
  }

  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, accessTime] of this.accessTimes.entries()) {
      if (accessTime < oldestTime) {
        oldestTime = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      logger.debug(`Cache: Evicted oldest key '${oldestKey}'`);
    }
  }

  cleanup() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, creationTime] of this.creationTimes.entries()) {
      if (now - creationTime >= this.ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.delete(key));

    if (expiredKeys.length > 0) {
      logger.debug(`Cache: Cleaned up ${expiredKeys.length} expired items`);
    }
  }

  getAll() {
    const result = {};
    const now = Date.now();

    for (const [key, value] of this.cache.entries()) {
      const creationTime = this.creationTimes.get(key);
      
      if (!creationTime || (now - creationTime) < this.ttl) {
        result[key] = value;
      }
    }

    return result;
  }

  getStats() {
    const now = Date.now();
    let validItems = 0;
    let expiredItems = 0;

    for (const [key, creationTime] of this.creationTimes.entries()) {
      if (now - creationTime < this.ttl) {
        validItems++;
      } else {
        expiredItems++;
      }
    }

    return {
      totalItems: this.cache.size,
      validItems,
      expiredItems,
      maxSize: this.maxSize,
      ttl: this.ttl,
      memoryUsage: this.getMemoryUsage()
    };
  }

  getMemoryUsage() {
    // Rough estimation of memory usage
    let size = 0;
    
    for (const [key, value] of this.cache.entries()) {
      size += this.roughSizeOfObject(key) + this.roughSizeOfObject(value);
    }

    return {
      bytes: size,
      kb: Math.round(size / 1024 * 100) / 100,
      mb: Math.round(size / (1024 * 1024) * 100) / 100
    };
  }

  roughSizeOfObject(object) {
    const objectList = [];
    const stack = [object];
    let bytes = 0;

    while (stack.length) {
      const value = stack.pop();

      if (typeof value === 'boolean') {
        bytes += 4;
      } else if (typeof value === 'string') {
        bytes += value.length * 2;
      } else if (typeof value === 'number') {
        bytes += 8;
      } else if (typeof value === 'object' && objectList.indexOf(value) === -1) {
        objectList.push(value);

        if (value instanceof Array) {
          for (let i = 0; i < value.length; i++) {
            stack.push(value[i]);
          }
        } else {
          for (const key in value) {
            if (value.hasOwnProperty(key)) {
              bytes += key.length * 2;
              stack.push(value[key]);
            }
          }
        }
      }
    }

    return bytes;
  }

  // Get recently accessed items
  getRecentlyAccessed(limit = 10) {
    const sortedEntries = Array.from(this.accessTimes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return sortedEntries.map(([key, accessTime]) => ({
      key,
      accessTime: new Date(accessTime).toISOString(),
      data: this.cache.get(key)
    }));
  }

  // Get cache keys by pattern
  getKeysByPattern(pattern) {
    const regex = new RegExp(pattern);
    const matchingKeys = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        matchingKeys.push(key);
      }
    }

    return matchingKeys;
  }

  // Destroy cache and cleanup
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
    logger.info('Cache: Destroyed');
  }
}

module.exports = DataCache;