const request = require('supertest');
const http = require('http');
const { performance } = require('perf_hooks');

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/cache', () => ({
  getCacheService: jest.fn(() => ({
    getSessionData: jest.fn(() => Promise.resolve(null)),
    getAllDriverData: jest.fn(() => Promise.resolve({})),
    cacheSessionData: jest.fn(() => Promise.resolve(true)),
    performHealthCheck: jest.fn(() => Promise.resolve({ status: 'healthy', responseTime: 5 }))
  }))
}));

const F1BackendServer = require('../../src/server');

describe('Performance Tests', () => {
  let server;
  let app;

  beforeAll(async () => {
    // Create server instance for testing
    server = new F1BackendServer();
    app = server.app;
  });

  afterAll(async () => {
    if (server && server.server) {
      await new Promise((resolve) => {
        server.server.close(resolve);
      });
    }
  });

  describe('API Response Times', () => {
    const RESPONSE_TIME_THRESHOLD = 200; // 200ms

    it('should handle health check requests under threshold', async () => {
      const start = performance.now();
      
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      const end = performance.now();
      const responseTime = end - start;

      expect(responseTime).toBeLessThan(RESPONSE_TIME_THRESHOLD);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should handle session current requests under threshold', async () => {
      const start = performance.now();
      
      const response = await request(app)
        .get('/api/session/current')
        .expect(200);
      
      const end = performance.now();
      const responseTime = end - start;

      expect(responseTime).toBeLessThan(RESPONSE_TIME_THRESHOLD);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should handle drivers list requests under threshold', async () => {
      const start = performance.now();
      
      const response = await request(app)
        .get('/api/drivers')
        .expect(200);
      
      const end = performance.now();
      const responseTime = end - start;

      expect(responseTime).toBeLessThan(RESPONSE_TIME_THRESHOLD);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should handle individual driver requests under threshold', async () => {
      const start = performance.now();
      
      const response = await request(app)
        .get('/api/drivers/1')
        .expect(200);
      
      const end = performance.now();
      const responseTime = end - start;

      expect(responseTime).toBeLessThan(RESPONSE_TIME_THRESHOLD);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent requests efficiently', async () => {
      const numberOfRequests = 50;
      const concurrentRequests = [];

      const start = performance.now();

      for (let i = 0; i < numberOfRequests; i++) {
        concurrentRequests.push(
          request(app)
            .get('/health')
            .expect(200)
        );
      }

      const responses = await Promise.all(concurrentRequests);
      const end = performance.now();
      const totalTime = end - start;
      const averageTime = totalTime / numberOfRequests;

      expect(responses).toHaveLength(numberOfRequests);
      expect(averageTime).toBeLessThan(100); // Average should be under 100ms
      expect(totalTime).toBeLessThan(5000); // Total should be under 5 seconds

      // All responses should be successful
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
      });
    });

    it('should handle mixed endpoint concurrent requests', async () => {
      const numberOfEachRequest = 20;
      const concurrentRequests = [];

      const endpoints = [
        '/health',
        '/api/session/current',
        '/api/session/status',
        '/api/drivers',
        '/api/drivers/1'
      ];

      const start = performance.now();

      endpoints.forEach(endpoint => {
        for (let i = 0; i < numberOfEachRequest; i++) {
          concurrentRequests.push(
            request(app)
              .get(endpoint)
              .expect(200)
          );
        }
      });

      const responses = await Promise.all(concurrentRequests);
      const end = performance.now();
      const totalTime = end - start;

      expect(responses).toHaveLength(numberOfEachRequest * endpoints.length);
      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds

      // All responses should be successful
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
      });
    });
  });

  describe('Memory Usage', () => {
    it('should not have significant memory leaks during repeated requests', async () => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage().heapUsed;

      // Make many requests to potentially trigger memory leaks
      for (let batch = 0; batch < 10; batch++) {
        const batchRequests = [];
        
        for (let i = 0; i < 50; i++) {
          batchRequests.push(
            request(app)
              .get('/api/drivers')
              .expect(200)
          );
        }

        await Promise.all(batchRequests);

        // Force garbage collection between batches
        if (global.gc) {
          global.gc();
        }
      }

      // Force final garbage collection
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreasePercentage = (memoryIncrease / initialMemory) * 100;

      // Memory should not increase by more than 50%
      expect(memoryIncreasePercentage).toBeLessThan(50);
    });
  });

  describe('Payload Size Handling', () => {
    it('should handle large JSON payloads efficiently', async () => {
      const largeData = {
        feeds: Array.from({ length: 100 }, (_, i) => `feed-${i}`)
      };

      const start = performance.now();

      const response = await request(app)
        .post('/api/session/subscribe')
        .send(largeData)
        .expect(400); // Should fail validation but still handle quickly

      const end = performance.now();
      const responseTime = end - start;

      expect(responseTime).toBeLessThan(500); // Should handle even invalid large payloads quickly
    });

    it('should reject oversized payloads gracefully', async () => {
      const oversizedData = {
        data: 'a'.repeat(100 * 1024 * 1024) // 100MB string
      };

      const start = performance.now();

      try {
        await request(app)
          .post('/api/session/subscribe')
          .send(oversizedData)
          .expect(413); // Payload too large
      } catch (error) {
        // Request might fail due to size limits, which is expected
        expect(error.status).toBe(413);
      }

      const end = performance.now();
      const responseTime = end - start;

      expect(responseTime).toBeLessThan(1000); // Should reject quickly
    });
  });

  describe('Database/Cache Performance', () => {
    it('should handle cache operations efficiently', async () => {
      const numberOfOperations = 100;
      const cacheOperations = [];

      const start = performance.now();

      for (let i = 0; i < numberOfOperations; i++) {
        cacheOperations.push(
          request(app)
            .get('/api/session/current')
            .expect(200)
        );
      }

      await Promise.all(cacheOperations);
      const end = performance.now();
      const totalTime = end - start;
      const averageTime = totalTime / numberOfOperations;

      expect(averageTime).toBeLessThan(50); // Average cache operation should be very fast
      expect(totalTime).toBeLessThan(3000); // Total time should be reasonable
    });
  });

  describe('Rate Limiting Performance', () => {
    it('should apply rate limiting without significant performance impact', async () => {
      const withinLimitRequests = 10; // Well within rate limit
      const requests = [];

      const start = performance.now();

      for (let i = 0; i < withinLimitRequests; i++) {
        requests.push(
          request(app)
            .get('/api/drivers')
            .expect(200)
        );
      }

      await Promise.all(requests);
      const end = performance.now();
      const totalTime = end - start;
      const averageTime = totalTime / withinLimitRequests;

      expect(averageTime).toBeLessThan(100); // Rate limiting shouldn't add significant overhead
    });

    it('should handle rate limit exceeded responses quickly', async () => {
      const manyRequests = 200; // Likely to trigger rate limiting
      const requests = [];

      for (let i = 0; i < manyRequests; i++) {
        requests.push(
          request(app)
            .get('/api/drivers')
        );
      }

      const start = performance.now();
      const responses = await Promise.allSettled(requests);
      const end = performance.now();
      const totalTime = end - start;

      expect(totalTime).toBeLessThan(10000); // Even with rate limiting, should complete reasonably fast

      // Some requests should succeed, some might be rate limited
      const successfulResponses = responses.filter(r => r.status === 'fulfilled' && r.value.status === 200);
      const rateLimitedResponses = responses.filter(r => r.status === 'fulfilled' && r.value.status === 429);

      expect(successfulResponses.length + rateLimitedResponses.length).toBe(manyRequests);
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle 404 errors efficiently', async () => {
      const numberOfRequests = 50;
      const requests = [];

      const start = performance.now();

      for (let i = 0; i < numberOfRequests; i++) {
        requests.push(
          request(app)
            .get('/api/nonexistent')
            .expect(404)
        );
      }

      await Promise.all(requests);
      const end = performance.now();
      const totalTime = end - start;
      const averageTime = totalTime / numberOfRequests;

      expect(averageTime).toBeLessThan(50); // Error handling should be fast
    });

    it('should handle validation errors efficiently', async () => {
      const numberOfRequests = 50;
      const requests = [];

      const start = performance.now();

      for (let i = 0; i < numberOfRequests; i++) {
        requests.push(
          request(app)
            .get('/api/drivers/invalid-number')
            .expect(404) // Invalid driver number
        );
      }

      await Promise.all(requests);
      const end = performance.now();
      const totalTime = end - start;
      const averageTime = totalTime / numberOfRequests;

      expect(averageTime).toBeLessThan(50); // Validation errors should be handled quickly
    });
  });
});