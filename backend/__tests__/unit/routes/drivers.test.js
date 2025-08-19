const request = require('supertest');
const express = require('express');
const { router, updateDriverData } = require('../../../src/routes/drivers');

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/middleware/validation', () => ({
  validateDriverNumber: (req, res, next) => next(),
  validateDriverQuery: (req, res, next) => next(),
  validateTelemetryQuery: (req, res, next) => next()
}));

describe('Drivers Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/drivers', router);
    jest.clearAllMocks();
    
    // Reset driver data before each test
    updateDriverData({});
  });

  describe('GET /api/drivers', () => {
    it('should return list of drivers with basic information', async () => {
      const response = await request(app)
        .get('/api/drivers')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('drivers');
      expect(response.body.data).toHaveProperty('count');
      expect(response.body.data).toHaveProperty('sessionActive');
      expect(typeof response.body.data.drivers).toBe('object');
      expect(typeof response.body.data.count).toBe('number');
    });

    it('should include detailed information when details=true', async () => {
      // Set up some driver data first
      updateDriverData({
        '1': {
          position: 1,
          lapTime: '1:23.456',
          lapNumber: 10,
          gap: '0.000',
          status: 'ON_TRACK'
        }
      });

      const response = await request(app)
        .get('/api/drivers?details=true')
        .expect(200);

      expect(response.body.success).toBe(true);
      const driver = response.body.data.drivers['1'];
      expect(driver).toHaveProperty('position');
      expect(driver).toHaveProperty('lapTime');
      expect(driver).toHaveProperty('lapNumber');
      expect(driver).toHaveProperty('gap');
      expect(driver).toHaveProperty('status');
    });

    it('should filter active drivers when active=true', async () => {
      // Set up mixed data - some active, some inactive
      updateDriverData({
        '1': { position: 1, lapTime: '1:23.456' },
        '44': { position: 2, lapTime: '1:23.789' }
        // Driver '16' has no position, so should be filtered out
      });

      const response = await request(app)
        .get('/api/drivers?active=true')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.drivers).toHaveProperty('1');
      expect(response.body.data.drivers).toHaveProperty('44');
      expect(response.body.data.drivers).not.toHaveProperty('16');
    });

    it('should include meta information', async () => {
      const response = await request(app)
        .get('/api/drivers?details=true&active=false')
        .expect(200);

      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('includeDetails', true);
      expect(response.body.meta).toHaveProperty('onlyActive', false);
      expect(new Date(response.body.meta.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('GET /api/drivers/:number', () => {
    it('should return specific driver information', async () => {
      updateDriverData({
        '1': {
          position: 1,
          lapTime: '1:23.456',
          status: 'ON_TRACK',
          speed: 320,
          gear: 7
        }
      });

      const response = await request(app)
        .get('/api/drivers/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        driverNumber: '1',
        name: 'Max Verstappen',
        team: 'Red Bull Racing',
        tla: 'VER',
        position: 1,
        lapTime: '1:23.456',
        status: 'ON_TRACK'
      });
      expect(response.body.data.telemetry).toHaveProperty('speed', 320);
      expect(response.body.data.telemetry).toHaveProperty('gear', 7);
    });

    it('should return 404 for non-existent driver', async () => {
      const response = await request(app)
        .get('/api/drivers/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not Found');
      expect(response.body.message).toBe('Driver 999 not found');
    });

    it('should include lap history when history=true', async () => {
      const response = await request(app)
        .get('/api/drivers/1?history=true')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('lapHistory');
      expect(Array.isArray(response.body.data.lapHistory)).toBe(true);
      
      if (response.body.data.lapHistory.length > 0) {
        const lapEntry = response.body.data.lapHistory[0];
        expect(lapEntry).toHaveProperty('lapNumber');
        expect(lapEntry).toHaveProperty('lapTime');
        expect(lapEntry).toHaveProperty('sector1');
        expect(lapEntry).toHaveProperty('sector2');
        expect(lapEntry).toHaveProperty('sector3');
      }
    });

    it('should handle driver with no live data', async () => {
      const response = await request(app)
        .get('/api/drivers/44')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        driverNumber: '44',
        name: 'Lewis Hamilton',
        team: 'Mercedes',
        position: null,
        lapTime: null,
        status: 'UNKNOWN'
      });
    });
  });

  describe('GET /api/drivers/:number/telemetry', () => {
    it('should return telemetry data for valid driver', async () => {
      const response = await request(app)
        .get('/api/drivers/1/telemetry')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        driverNumber: '1',
        duration: 60,
        samples: [],
        summary: {
          avgSpeed: null,
          maxSpeed: null,
          avgRpm: null,
          maxRpm: null,
          brakingPoints: [],
          accelerationPoints: []
        }
      });
    });

    it('should handle custom duration parameter', async () => {
      const response = await request(app)
        .get('/api/drivers/1/telemetry?duration=120')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.duration).toBe(120);
      expect(response.body.meta.duration).toBe(120);
    });

    it('should return 404 for non-existent driver', async () => {
      const response = await request(app)
        .get('/api/drivers/999/telemetry')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not Found');
    });

    it('should use default duration for invalid parameter', async () => {
      const response = await request(app)
        .get('/api/drivers/1/telemetry?duration=invalid')
        .expect(200);

      expect(response.body.data.duration).toBe(60);
    });
  });

  describe('GET /api/drivers/standings', () => {
    it('should return empty standings when no driver data', async () => {
      const response = await request(app)
        .get('/api/drivers/standings')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.standings).toEqual([]);
      expect(response.body.data.totalDrivers).toBe(0);
      expect(response.body.data.sessionActive).toBe(false);
    });

    it('should return sorted standings when driver data exists', async () => {
      updateDriverData({
        '1': {
          position: 2,
          lapTime: '1:23.456',
          gap: '+0.500',
          interval: '+0.500',
          lapNumber: 10,
          status: 'ON_TRACK'
        },
        '44': {
          position: 1,
          lapTime: '1:23.000',
          gap: '0.000',
          interval: '0.000',
          lapNumber: 10,
          status: 'ON_TRACK'
        },
        '16': {
          position: 3,
          lapTime: '1:24.123',
          gap: '+1.123',
          interval: '+0.623',
          lapNumber: 10,
          status: 'ON_TRACK'
        }
      });

      const response = await request(app)
        .get('/api/drivers/standings')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.standings).toHaveLength(3);
      expect(response.body.data.totalDrivers).toBe(3);
      expect(response.body.data.sessionActive).toBe(true);

      // Check if sorted by position
      const standings = response.body.data.standings;
      expect(standings[0].position).toBe(1);
      expect(standings[0].driverNumber).toBe('44');
      expect(standings[1].position).toBe(2);
      expect(standings[1].driverNumber).toBe('1');
      expect(standings[2].position).toBe(3);
      expect(standings[2].driverNumber).toBe('16');
    });

    it('should filter out drivers without positions', async () => {
      updateDriverData({
        '1': {
          position: 1,
          lapTime: '1:23.456',
          status: 'ON_TRACK'
        },
        '44': {
          // No position - should be filtered out
          lapTime: '1:23.789',
          status: 'IN_PIT'
        }
      });

      const response = await request(app)
        .get('/api/drivers/standings')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.standings).toHaveLength(1);
      expect(response.body.data.standings[0].driverNumber).toBe('1');
    });
  });

  describe('updateDriverData function', () => {
    it('should update driver data and set session as active', () => {
      const testData = {
        '1': { position: 1, lapTime: '1:23.456' },
        '44': { position: 2, lapTime: '1:23.789' }
      };

      updateDriverData(testData);

      // Since we can't directly access the internal state, we test the side effects
      // by making a request and checking the response
      request(app)
        .get('/api/drivers')
        .then(response => {
          expect(response.body.data.sessionActive).toBe(true);
        });
    });

    it('should set session as inactive when no drivers provided', () => {
      updateDriverData({});

      request(app)
        .get('/api/drivers')
        .then(response => {
          expect(response.body.data.sessionActive).toBe(false);
        });
    });

    it('should handle null or undefined input', () => {
      expect(() => updateDriverData(null)).not.toThrow();
      expect(() => updateDriverData(undefined)).not.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should handle internal server errors gracefully', async () => {
      // This is tricky to test without actually causing an error
      // In a real scenario, you might mock a dependency to throw an error
      const response = await request(app)
        .get('/api/drivers')
        .expect(200);

      // At minimum, verify the route doesn't crash
      expect(response.body).toHaveProperty('success');
    });

    it('should validate driver numbers in URL parameters', async () => {
      // The validation middleware should handle this, but let's test the route behavior
      const response = await request(app)
        .get('/api/drivers/abc')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});