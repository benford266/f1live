const { getCacheService, initializeCacheService } = require('../../src/services/cache');

// Mock Redis for testing
jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    flushall: jest.fn(),
    flushdb: jest.fn(),
    keys: jest.fn(),
    pipeline: jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exec: jest.fn(() => Promise.resolve([]))
    })),
    ping: jest.fn(() => Promise.resolve('PONG')),
    info: jest.fn(() => Promise.resolve('redis_version:6.0.0')),
    quit: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    off: jest.fn(),
    status: 'ready'
  };
  
  return jest.fn(() => mockRedis);
});

// Mock logger
jest.mock('../../src/utils/logger');

// Mock config
jest.mock('../../src/config', () => ({
  redis: {
    url: 'redis://localhost:6379',
    connectTimeout: 5000,
    lazyConnect: true,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  },
  cache: {
    ttl: {
      session: 300,
      drivers: 60,
      timing: 30,
      weather: 600,
      track: 120,
      position: 30
    },
    compression: {
      enabled: true,
      threshold: 1024
    }
  }
}));

describe('Cache Service Integration Tests', () => {
  let cacheService;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Initialize cache service for each test
    cacheService = await initializeCacheService();
  });

  afterEach(async () => {
    if (cacheService) {
      await cacheService.close();
    }
  });

  describe('Initialization', () => {
    it('should initialize cache service successfully', () => {
      expect(cacheService).toBeDefined();
      expect(typeof cacheService.cacheSessionData).toBe('function');
      expect(typeof cacheService.getSessionData).toBe('function');
    });

    it('should provide singleton instance', async () => {
      const instance1 = getCacheService();
      const instance2 = getCacheService();
      
      expect(instance1).toBe(instance2);
    });

    it('should handle Redis connection failures gracefully', async () => {
      // Mock Redis constructor to throw error
      const originalRedis = require('ioredis');
      require('ioredis').mockImplementation(() => {
        throw new Error('Connection failed');
      });

      // Should still initialize with memory fallback
      const fallbackService = await initializeCacheService();
      expect(fallbackService).toBeDefined();
      
      // Restore original mock
      require('ioredis').mockImplementation(() => originalRedis());
    });
  });

  describe('Session Data Caching', () => {
    it('should cache and retrieve session data', async () => {
      const sessionData = {
        sessionType: 'Race',
        sessionState: 'STARTED',
        trackName: 'Test Circuit',
        lapNumber: 10,
        totalLaps: 58
      };

      await cacheService.cacheSessionData(sessionData);
      const retrieved = await cacheService.getSessionData();

      expect(retrieved).toEqual(sessionData);
    });

    it('should handle session data updates', async () => {
      const initialData = {
        sessionType: 'Race',
        lapNumber: 5
      };

      const updatedData = {
        sessionType: 'Race',
        lapNumber: 10
      };

      await cacheService.cacheSessionData(initialData);
      await cacheService.cacheSessionData(updatedData);
      
      const retrieved = await cacheService.getSessionData();
      expect(retrieved.lapNumber).toBe(10);
    });

    it('should return null for non-existent session data', async () => {
      const retrieved = await cacheService.getSessionData();
      expect(retrieved).toBeNull();
    });
  });

  describe('Driver Data Caching', () => {
    it('should cache and retrieve individual driver data', async () => {
      const driverData = {
        name: 'Max Verstappen',
        position: 1,
        lapTime: '1:23.456',
        team: 'Red Bull Racing'
      };

      await cacheService.cacheDriverData('1', driverData);
      const retrieved = await cacheService.getDriverData('1');

      expect(retrieved).toEqual(driverData);
    });

    it('should cache and retrieve all driver data', async () => {
      const driversData = {
        '1': { name: 'Max Verstappen', position: 1 },
        '44': { name: 'Lewis Hamilton', position: 2 },
        '16': { name: 'Charles Leclerc', position: 3 }
      };

      await cacheService.cacheAllDriverData(driversData);
      const retrieved = await cacheService.getAllDriverData();

      expect(retrieved).toEqual(driversData);
    });

    it('should handle partial driver data updates', async () => {
      const initialData = {
        '1': { name: 'Max Verstappen', position: 1, lapTime: '1:23.456' },
        '44': { name: 'Lewis Hamilton', position: 2, lapTime: '1:23.789' }
      };

      const updateData = {
        position: 1,
        lapTime: '1:22.123' // Faster lap time
      };

      await cacheService.cacheAllDriverData(initialData);
      await cacheService.cacheDriverData('1', updateData);

      const retrieved = await cacheService.getDriverData('1');
      expect(retrieved.lapTime).toBe('1:22.123');
      expect(retrieved.name).toBe('Max Verstappen'); // Should preserve existing data
    });

    it('should return empty object for non-existent driver data', async () => {
      const retrieved = await cacheService.getAllDriverData();
      expect(retrieved).toEqual({});
    });
  });

  describe('Timing Data Caching', () => {
    it('should cache and retrieve timing data', async () => {
      const timingData = {
        currentLap: 25,
        bestLapTime: '1:22.123',
        lastLapTime: '1:23.456',
        sector1: '28.123',
        sector2: '35.456',
        sector3: '18.789'
      };

      await cacheService.cacheTimingData(timingData);
      const retrieved = await cacheService.getTimingData();

      expect(retrieved).toEqual(timingData);
    });

    it('should handle timing data for specific drivers', async () => {
      const driverTimingData = {
        driverId: '1',
        lapTime: '1:23.456',
        sector1: '28.123',
        sector2: '35.456',
        sector3: '18.789',
        lapNumber: 25
      };

      await cacheService.cacheDriverTimingData('1', driverTimingData);
      const retrieved = await cacheService.getDriverTimingData('1');

      expect(retrieved).toEqual(driverTimingData);
    });
  });

  describe('Weather Data Caching', () => {
    it('should cache and retrieve weather data', async () => {
      const weatherData = {
        temperature: 25,
        humidity: 60,
        pressure: 1013,
        windSpeed: 10,
        windDirection: 'NE',
        trackTemperature: 35
      };

      await cacheService.cacheWeatherData(weatherData);
      const retrieved = await cacheService.getWeatherData();

      expect(retrieved).toEqual(weatherData);
    });

    it('should handle weather data updates', async () => {
      const initialWeather = { temperature: 25, humidity: 60 };
      const updatedWeather = { temperature: 27, humidity: 65 };

      await cacheService.cacheWeatherData(initialWeather);
      await cacheService.cacheWeatherData(updatedWeather);

      const retrieved = await cacheService.getWeatherData();
      expect(retrieved.temperature).toBe(27);
      expect(retrieved.humidity).toBe(65);
    });
  });

  describe('Track Status Caching', () => {
    it('should cache and retrieve track status', async () => {
      const trackStatus = {
        status: 'Green',
        message: 'Track clear',
        timestamp: new Date().toISOString()
      };

      await cacheService.cacheTrackStatus(trackStatus);
      const retrieved = await cacheService.getTrackStatus();

      expect(retrieved).toEqual(trackStatus);
    });

    it('should handle track status changes', async () => {
      const greenFlag = { status: 'Green', message: 'Track clear' };
      const yellowFlag = { status: 'Yellow', message: 'Caution' };

      await cacheService.cacheTrackStatus(greenFlag);
      await cacheService.cacheTrackStatus(yellowFlag);

      const retrieved = await cacheService.getTrackStatus();
      expect(retrieved.status).toBe('Yellow');
      expect(retrieved.message).toBe('Caution');
    });
  });

  describe('Position Data Caching', () => {
    it('should cache and retrieve position data', async () => {
      const positionData = {
        '1': { x: 1500, y: 2000, z: 10 },
        '44': { x: 1400, y: 1950, z: 12 },
        '16': { x: 1300, y: 1900, z: 8 }
      };

      await cacheService.cachePositionData(positionData);
      const retrieved = await cacheService.getPositionData();

      expect(retrieved).toEqual(positionData);
    });

    it('should handle individual driver position updates', async () => {
      const initialPositions = {
        '1': { x: 1000, y: 1000, z: 10 },
        '44': { x: 900, y: 950, z: 12 }
      };

      const updatedPosition = { x: 1100, y: 1050, z: 10 };

      await cacheService.cachePositionData(initialPositions);
      await cacheService.cacheDriverPosition('1', updatedPosition);

      const retrieved = await cacheService.getPositionData();
      expect(retrieved['1']).toEqual(updatedPosition);
      expect(retrieved['44']).toEqual(initialPositions['44']);
    });
  });

  describe('Rate Limiting', () => {
    it('should track and increment rate limits', async () => {
      const identifier = 'test-client-123';
      const windowMs = 60000;

      const result1 = await cacheService.incrementRateLimit(identifier, windowMs);
      expect(result1.count).toBe(1);
      expect(result1.resetTime).toBeGreaterThan(Date.now());

      const result2 = await cacheService.incrementRateLimit(identifier, windowMs);
      expect(result2.count).toBe(2);
      expect(result2.resetTime).toBe(result1.resetTime);
    });

    it('should reset rate limits after window expires', async () => {
      const identifier = 'test-client-456';
      const windowMs = 100; // Short window for testing

      await cacheService.incrementRateLimit(identifier, windowMs);
      
      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const result = await cacheService.incrementRateLimit(identifier, windowMs);
      expect(result.count).toBe(1); // Should reset
    });
  });

  describe('Client Session Management', () => {
    it('should cache and retrieve client sessions', async () => {
      const clientId = 'socket-123';
      const sessionData = {
        id: clientId,
        connectedAt: new Date(),
        ip: '127.0.0.1',
        userAgent: 'test-browser',
        subscriptions: ['TimingData', 'WeatherData']
      };

      await cacheService.cacheClientSession(clientId, sessionData);
      const retrieved = await cacheService.getClientSession(clientId);

      expect(retrieved.id).toBe(sessionData.id);
      expect(retrieved.ip).toBe(sessionData.ip);
      expect(retrieved.subscriptions).toEqual(sessionData.subscriptions);
    });

    it('should delete client sessions', async () => {
      const clientId = 'socket-456';
      const sessionData = {
        id: clientId,
        connectedAt: new Date(),
        ip: '127.0.0.1'
      };

      await cacheService.cacheClientSession(clientId, sessionData);
      expect(await cacheService.getClientSession(clientId)).toBeDefined();

      await cacheService.deleteClientSession(clientId);
      expect(await cacheService.getClientSession(clientId)).toBeNull();
    });
  });

  describe('Cache Management', () => {
    it('should flush all cache data', async () => {
      // Add some test data
      await cacheService.cacheSessionData({ sessionType: 'Race' });
      await cacheService.cacheDriverData('1', { name: 'Test Driver' });

      // Verify data exists
      expect(await cacheService.getSessionData()).toBeDefined();
      expect(await cacheService.getDriverData('1')).toBeDefined();

      // Flush all
      const result = await cacheService.flushAll();
      expect(result).toBe(true);

      // Verify data is cleared
      expect(await cacheService.getSessionData()).toBeNull();
      expect(await cacheService.getDriverData('1')).toBeNull();
    });

    it('should flush cache by type', async () => {
      await cacheService.cacheSessionData({ sessionType: 'Race' });
      await cacheService.cacheDriverData('1', { name: 'Test Driver' });

      const result = await cacheService.flushType('session');
      expect(result).toBe(true);

      // Session data should be cleared
      expect(await cacheService.getSessionData()).toBeNull();
      // Driver data should remain
      expect(await cacheService.getDriverData('1')).toBeDefined();
    });

    it('should provide cache statistics', async () => {
      await cacheService.cacheSessionData({ sessionType: 'Race' });
      await cacheService.cacheDriverData('1', { name: 'Test Driver' });

      const stats = await cacheService.getStatistics();
      expect(stats).toHaveProperty('totalKeys');
      expect(stats).toHaveProperty('memoryUsage');
      expect(stats).toHaveProperty('failoverMode');
      expect(typeof stats.totalKeys).toBe('number');
      expect(typeof stats.failoverMode).toBe('boolean');
    });

    it('should perform health checks', async () => {
      const healthResult = await cacheService.performHealthCheck();
      
      expect(healthResult).toHaveProperty('status');
      expect(healthResult).toHaveProperty('responseTime');
      expect(healthResult).toHaveProperty('timestamp');
      expect(['healthy', 'unhealthy', 'degraded']).toContain(healthResult.status);
      expect(typeof healthResult.responseTime).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      // Mock Redis to throw errors
      const mockRedis = require('ioredis')();
      mockRedis.get.mockRejectedValue(new Error('Connection error'));

      // Should not throw, should use memory fallback
      const result = await cacheService.getSessionData();
      expect(result).toBeNull();
    });

    it('should handle data serialization errors', async () => {
      // Try to cache circular reference object
      const circularObj = {};
      circularObj.self = circularObj;

      // Should handle gracefully without throwing
      const result = await cacheService.cacheSessionData(circularObj);
      expect(typeof result).toBe('boolean');
    });

    it('should handle cache key conflicts', async () => {
      const data1 = { version: 1 };
      const data2 = { version: 2 };

      await cacheService.cacheSessionData(data1);
      await cacheService.cacheSessionData(data2);

      const retrieved = await cacheService.getSessionData();
      expect(retrieved.version).toBe(2); // Should use latest data
    });
  });

  describe('Performance', () => {
    it('should handle batch operations efficiently', async () => {
      const driversData = {};
      
      // Create large dataset
      for (let i = 1; i <= 20; i++) {
        driversData[i.toString()] = {
          name: `Driver ${i}`,
          position: i,
          lapTime: `1:2${i}.${Math.floor(Math.random() * 1000)}`
        };
      }

      const startTime = Date.now();
      await cacheService.cacheAllDriverData(driversData);
      const cacheTime = Date.now() - startTime;

      const retrieveStart = Date.now();
      const retrieved = await cacheService.getAllDriverData();
      const retrieveTime = Date.now() - retrieveStart;

      expect(retrieved).toEqual(driversData);
      expect(cacheTime).toBeLessThan(1000); // Should complete within 1 second
      expect(retrieveTime).toBeLessThan(500); // Should retrieve within 500ms
    });

    it('should handle concurrent operations safely', async () => {
      const operations = [];
      
      // Perform multiple concurrent cache operations
      for (let i = 0; i < 10; i++) {
        operations.push(
          cacheService.cacheDriverData(i.toString(), { 
            name: `Driver ${i}`, 
            position: i + 1 
          })
        );
      }

      // All operations should complete without error
      const results = await Promise.all(operations);
      results.forEach(result => {
        expect(typeof result).toBe('boolean');
      });

      // Verify all data was cached
      const allDrivers = await cacheService.getAllDriverData();
      expect(Object.keys(allDrivers).length).toBe(10);
    });
  });
});