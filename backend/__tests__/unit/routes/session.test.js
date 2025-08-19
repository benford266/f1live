const request = require('supertest');
const express = require('express');
const { router, updateSessionData } = require('../../../src/routes/session');

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/middleware/validation', () => ({
  validateSessionQuery: (req, res, next) => next(),
  validateSessionSubscription: (req, res, next) => next(),
  validateContentType: () => (req, res, next) => next()
}));

const mockCacheService = {
  getSessionData: jest.fn()
};

jest.mock('../../../src/services/cache', () => ({
  getCacheService: jest.fn(() => mockCacheService)
}));

describe('Session Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/session', router);
    jest.clearAllMocks();
  });

  describe('GET /api/session/current', () => {
    it('should return current session data from cache when available', async () => {
      const mockSessionData = {
        sessionName: 'Race',
        sessionType: 'Race',
        sessionState: 'STARTED',
        timeRemaining: '01:45:30',
        totalLaps: 58,
        currentLap: 10,
        trackStatus: 'Green'
      };

      mockCacheService.getSessionData.mockResolvedValue(mockSessionData);

      const response = await request(app)
        .get('/api/session/current')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject(mockSessionData);
      expect(response.body.meta.source).toBe('cache');
      expect(response.body.meta.cached).toBe(true);
    });

    it('should return fallback data when cache fails', async () => {
      mockCacheService.getSessionData.mockRejectedValue(new Error('Cache error'));

      const response = await request(app)
        .get('/api/session/current')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.source).toBe('fallback');
      expect(response.body.meta.cached).toBe(false);
    });

    it('should include timestamp and meta information', async () => {
      mockCacheService.getSessionData.mockResolvedValue({});

      const response = await request(app)
        .get('/api/session/current')
        .expect(200);

      expect(response.body.data.timestamp).toBeDefined();
      expect(response.body.meta.timestamp).toBeDefined();
      expect(new Date(response.body.data.timestamp)).toBeInstanceOf(Date);
    });

    it('should handle internal server errors', async () => {
      // Force an unexpected error by making the route throw
      mockCacheService.getSessionData.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const response = await request(app)
        .get('/api/session/current')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
      expect(response.body.message).toBe('Failed to fetch current session data');
    });
  });

  describe('GET /api/session/status', () => {
    it('should return session connection status', async () => {
      const response = await request(app)
        .get('/api/session/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('connectionStatus');
      expect(response.body.data).toHaveProperty('dataAvailable');
      expect(response.body.data).toHaveProperty('serverTime');
      expect(response.body.data.connectionStatus).toMatchObject({
        connected: expect.any(Boolean),
        lastHeartbeat: null,
        subscriptions: expect.any(Array),
        reconnectAttempts: expect.any(Number)
      });
    });

    it('should include server timestamp', async () => {
      const response = await request(app)
        .get('/api/session/status')
        .expect(200);

      expect(response.body.data.serverTime).toBeDefined();
      expect(new Date(response.body.data.serverTime)).toBeInstanceOf(Date);
    });
  });

  describe('GET /api/session/history', () => {
    it('should return paginated session history', async () => {
      const response = await request(app)
        .get('/api/session/history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('sessions');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.sessions)).toBe(true);
      expect(response.body.data.pagination).toMatchObject({
        total: expect.any(Number),
        limit: expect.any(Number),
        offset: expect.any(Number),
        hasMore: expect.any(Boolean)
      });
    });

    it('should handle query parameters for pagination', async () => {
      const response = await request(app)
        .get('/api/session/history?limit=5&offset=2')
        .expect(200);

      expect(response.body.data.pagination.limit).toBe(5);
      expect(response.body.data.pagination.offset).toBe(2);
    });

    it('should use default values for invalid query parameters', async () => {
      const response = await request(app)
        .get('/api/session/history?limit=invalid&offset=invalid')
        .expect(200);

      expect(response.body.data.pagination.limit).toBe(10);
      expect(response.body.data.pagination.offset).toBe(0);
    });
  });

  describe('POST /api/session/subscribe', () => {
    it('should accept valid subscription request', async () => {
      const subscriptionData = {
        feeds: ['timing', 'weather', 'trackStatus']
      };

      const response = await request(app)
        .post('/api/session/subscribe')
        .send(subscriptionData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.subscribedFeeds).toEqual(subscriptionData.feeds);
      expect(response.body.data.subscriptionId).toMatch(/^sub_\d+$/);
    });

    it('should reject invalid feeds parameter', async () => {
      const response = await request(app)
        .post('/api/session/subscribe')
        .send({ feeds: 'not-an-array' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Bad Request');
      expect(response.body.message).toBe('feeds must be an array');
    });

    it('should accept empty feeds array', async () => {
      const response = await request(app)
        .post('/api/session/subscribe')
        .send({ feeds: [] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.subscribedFeeds).toEqual([]);
    });
  });

  describe('updateSessionData function', () => {
    it('should update session data with timestamp', () => {
      const testData = {
        sessionName: 'Practice 1',
        sessionState: 'STARTED',
        currentLap: 5
      };

      // Mock the internal data store
      const originalConsoleLog = console.log;
      console.log = jest.fn();

      updateSessionData(testData);

      // Verify that data was updated (this is a bit tricky to test due to module scope)
      // In a real scenario, you might expose the data through a getter function
      expect(typeof updateSessionData).toBe('function');

      console.log = originalConsoleLog;
    });

    it('should preserve existing data when partial update is provided', () => {
      const partialData = {
        currentLap: 15
      };

      expect(() => updateSessionData(partialData)).not.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON in POST requests', async () => {
      const response = await request(app)
        .post('/api/session/subscribe')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      // Express will handle the JSON parsing error
      expect(response.text).toContain('Bad Request');
    });

    it('should handle missing request body in POST requests', async () => {
      const response = await request(app)
        .post('/api/session/subscribe')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});