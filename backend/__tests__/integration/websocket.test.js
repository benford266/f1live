const http = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const { WebSocketService } = require('../../src/services/websocket');

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/config', () => ({
  cors: {
    allowedOrigins: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
  },
  websocket: {
    connectionTimeout: 5000,
    heartbeatInterval: 30000,
    maxEventRate: 60
  },
  rateLimit: {
    websocket: {
      connectionLimit: 10
    }
  },
  performance: {
    dataThrottleInterval: 100
  },
  nodeEnv: 'test'
}));

const mockCacheService = {
  cacheClientSession: jest.fn(() => Promise.resolve()),
  deleteClientSession: jest.fn(() => Promise.resolve()),
  getSessionData: jest.fn(() => Promise.resolve(null)),
  getTimingData: jest.fn(() => Promise.resolve(null)),
  getAllDriverData: jest.fn(() => Promise.resolve({})),
  getWeatherData: jest.fn(() => Promise.resolve(null)),
  getTrackStatus: jest.fn(() => Promise.resolve(null)),
  getPositionData: jest.fn(() => Promise.resolve(null)),
  incrementRateLimit: jest.fn(() => Promise.resolve({ count: 1, resetTime: Date.now() + 60000 })),
  get: jest.fn(() => Promise.resolve(null)),
  getStatistics: jest.fn(() => Promise.resolve({ 
    totalKeys: 0, 
    memoryUsage: '0MB',
    failoverMode: false 
  }))
};

jest.mock('../../src/services/cache', () => ({
  getCacheService: jest.fn(() => mockCacheService)
}));

describe('WebSocket Integration Tests', () => {
  let server, wsService, clientSocket, serverAddress;

  beforeEach(async () => {
    // Create HTTP server
    server = http.createServer();
    
    // Start server on random port
    await new Promise((resolve) => {
      server.listen(0, () => {
        serverAddress = `http://localhost:${server.address().port}`;
        resolve();
      });
    });

    // Initialize WebSocket service
    wsService = new WebSocketService(server);
    
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up client connections
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    
    // Close server
    if (wsService && wsService.io) {
      wsService.io.close();
    }
    
    await new Promise((resolve) => {
      server.close(resolve);
    });

    // Clear any timers
    jest.clearAllTimers();
  });

  describe('Connection Management', () => {
    it('should accept valid client connections', (done) => {
      clientSocket = Client(serverAddress, {
        transports: ['websocket']
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        expect(wsService.connectedClients.size).toBe(1);
        done();
      });

      clientSocket.on('connect_error', done);
    });

    it('should send connection established event with cache status', (done) => {
      clientSocket = Client(serverAddress);

      clientSocket.on('connection:established', (data) => {
        expect(data).toHaveProperty('clientId');
        expect(data).toHaveProperty('serverTime');
        expect(data).toHaveProperty('availableFeeds');
        expect(data).toHaveProperty('cachedData');
        expect(Array.isArray(data.availableFeeds)).toBe(true);
        expect(typeof data.cachedData).toBe('object');
        done();
      });

      clientSocket.on('connect_error', done);
    });

    it('should handle client disconnection gracefully', (done) => {
      clientSocket = Client(serverAddress);

      clientSocket.on('connect', () => {
        expect(wsService.connectedClients.size).toBe(1);
        
        clientSocket.disconnect();
        
        // Wait for cleanup
        setTimeout(() => {
          expect(wsService.connectedClients.size).toBe(0);
          done();
        }, 100);
      });
    });

    it('should track multiple client connections', (done) => {
      const clients = [];
      let connectedCount = 0;

      for (let i = 0; i < 3; i++) {
        const client = Client(serverAddress);
        clients.push(client);

        client.on('connect', () => {
          connectedCount++;
          if (connectedCount === 3) {
            expect(wsService.connectedClients.size).toBe(3);
            
            // Clean up
            clients.forEach(c => c.disconnect());
            done();
          }
        });
      }
    });
  });

  describe('Feed Subscription Management', () => {
    beforeEach((done) => {
      clientSocket = Client(serverAddress);
      clientSocket.on('connect', done);
    });

    it('should handle valid feed subscriptions', (done) => {
      const feedName = 'TimingData';

      clientSocket.on('subscription:confirmed', (data) => {
        expect(data.feedName).toBe(feedName);
        expect(data.subscribedAt).toBeDefined();
        
        const clientInfo = wsService.connectedClients.get(clientSocket.id);
        expect(clientInfo.subscriptions.has(feedName)).toBe(true);
        done();
      });

      clientSocket.emit('subscribe', feedName);
    });

    it('should reject invalid feed subscriptions', (done) => {
      const invalidFeedName = 'InvalidFeed';

      clientSocket.on('subscription:error', (data) => {
        expect(data.feedName).toBe(invalidFeedName);
        expect(data.error).toBe('Invalid feed name');
        done();
      });

      clientSocket.emit('subscribe', invalidFeedName);
    });

    it('should handle feed unsubscription', (done) => {
      const feedName = 'TimingData';

      clientSocket.on('subscription:confirmed', () => {
        // Now unsubscribe
        clientSocket.emit('unsubscribe', feedName);
      });

      clientSocket.on('unsubscription:confirmed', (data) => {
        expect(data.feedName).toBe(feedName);
        expect(data.unsubscribedAt).toBeDefined();
        
        const clientInfo = wsService.connectedClients.get(clientSocket.id);
        expect(clientInfo.subscriptions.has(feedName)).toBe(false);
        done();
      });

      clientSocket.emit('subscribe', feedName);
    });

    it('should broadcast data to subscribed clients only', (done) => {
      const feedName = 'TimingData';
      const testData = { lapTime: '1:23.456', driver: 'HAM' };
      
      clientSocket.on('subscription:confirmed', () => {
        // Broadcast data to the feed
        wsService.broadcastToFeed(feedName, testData);
      });

      clientSocket.on(`feed:${feedName}`, (data) => {
        expect(data.lapTime).toBe(testData.lapTime);
        expect(data.driver).toBe(testData.driver);
        expect(data.timestamp).toBeDefined();
        expect(data.feedName).toBe(feedName);
        done();
      });

      clientSocket.emit('subscribe', feedName);
    });
  });

  describe('Data Request Handling', () => {
    beforeEach((done) => {
      clientSocket = Client(serverAddress);
      clientSocket.on('connect', done);
    });

    it('should handle session data requests', (done) => {
      const mockSessionData = {
        sessionType: 'Race',
        sessionState: 'STARTED',
        trackName: 'Test Circuit'
      };

      mockCacheService.getSessionData.mockResolvedValueOnce(mockSessionData);

      clientSocket.on('session:current', (data) => {
        expect(data.sessionType).toBe(mockSessionData.sessionType);
        expect(data.cached).toBe(true);
        expect(data.timestamp).toBeDefined();
        done();
      });

      clientSocket.emit('request:session');
    });

    it('should handle driver data requests', (done) => {
      const mockDriverData = {
        '1': { name: 'Max Verstappen', position: 1 },
        '44': { name: 'Lewis Hamilton', position: 2 }
      };

      mockCacheService.getAllDriverData.mockResolvedValueOnce(mockDriverData);

      clientSocket.on('drivers:current', (data) => {
        expect(data.drivers).toEqual(mockDriverData);
        expect(data.cached).toBe(true);
        expect(data.timestamp).toBeDefined();
        done();
      });

      clientSocket.emit('request:drivers');
    });

    it('should handle empty cache gracefully', (done) => {
      mockCacheService.getSessionData.mockResolvedValueOnce(null);

      clientSocket.on('session:current', (data) => {
        expect(data.message).toBe('No session data available');
        expect(data.cached).toBe(false);
        expect(data.timestamp).toBeDefined();
        done();
      });

      clientSocket.emit('request:session');
    });
  });

  describe('Ping/Pong Mechanism', () => {
    beforeEach((done) => {
      clientSocket = Client(serverAddress);
      clientSocket.on('connect', done);
    });

    it('should respond to ping with pong', (done) => {
      clientSocket.on('pong', (data) => {
        expect(data.timestamp).toBeDefined();
        expect(new Date(data.timestamp)).toBeInstanceOf(Date);
        done();
      });

      clientSocket.emit('ping');
    });

    it('should update last ping time on ping', (done) => {
      const originalTime = new Date();
      
      clientSocket.on('pong', () => {
        const clientInfo = wsService.connectedClients.get(clientSocket.id);
        expect(clientInfo.lastPing).toBeInstanceOf(Date);
        expect(clientInfo.lastPing.getTime()).toBeGreaterThanOrEqual(originalTime.getTime());
        done();
      });

      setTimeout(() => {
        clientSocket.emit('ping');
      }, 10);
    });
  });

  describe('Heartbeat System', () => {
    beforeEach((done) => {
      clientSocket = Client(serverAddress);
      clientSocket.on('connect', done);
    });

    it('should receive heartbeat messages', (done) => {
      // Mock shorter heartbeat interval for testing
      const originalHeartbeatInterval = require('../../src/config').websocket.heartbeatInterval;
      require('../../src/config').websocket.heartbeatInterval = 100;

      clientSocket.on('heartbeat', (data) => {
        expect(data.timestamp).toBeDefined();
        expect(data.connectedClients).toBe(1);
        
        // Restore original interval
        require('../../src/config').websocket.heartbeatInterval = originalHeartbeatInterval;
        done();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', (done) => {
      // Try to connect to invalid port
      const invalidClient = Client('http://localhost:99999', {
        timeout: 1000,
        transports: ['websocket']
      });

      invalidClient.on('connect_error', (error) => {
        expect(error).toBeDefined();
        invalidClient.close();
        done();
      });
    });

    it('should handle cache errors gracefully', (done) => {
      clientSocket = Client(serverAddress);

      clientSocket.on('connect', () => {
        mockCacheService.getSessionData.mockRejectedValueOnce(new Error('Cache error'));

        clientSocket.on('session:error', (data) => {
          expect(data.error).toBe('Failed to retrieve session data');
          expect(data.timestamp).toBeDefined();
          done();
        });

        clientSocket.emit('request:session');
      });
    });
  });

  describe('Security Features', () => {
    it('should sanitize subscription feed names', (done) => {
      clientSocket = Client(serverAddress);

      clientSocket.on('connect', () => {
        clientSocket.on('subscription:error', (data) => {
          expect(data.error).toBe('Invalid feed name');
          done();
        });

        // Try to subscribe with malicious feed name
        clientSocket.emit('subscribe', '<script>alert("xss")</script>');
      });
    });

    it('should handle rapid event rate gracefully', (done) => {
      clientSocket = Client(serverAddress);

      clientSocket.on('connect', () => {
        let rateLimitHit = false;

        clientSocket.on('rate_limit_exceeded', (data) => {
          expect(data.message).toBe('Too many events per minute');
          expect(data.resetTime).toBeDefined();
          rateLimitHit = true;
        });

        // Send many rapid events
        for (let i = 0; i < 70; i++) {
          clientSocket.emit('ping');
        }

        setTimeout(() => {
          if (rateLimitHit) {
            done();
          } else {
            done(new Error('Rate limit was not triggered'));
          }
        }, 100);
      });
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach((done) => {
      clientSocket = Client(serverAddress);
      clientSocket.on('connect', done);
    });

    it('should provide connection statistics', async () => {
      const stats = await wsService.getConnectionStats();
      
      expect(stats).toHaveProperty('totalConnections', 1);
      expect(stats).toHaveProperty('activeFeeds');
      expect(stats).toHaveProperty('connections');
      expect(Array.isArray(stats.connections)).toBe(true);
      expect(stats.connections[0]).toHaveProperty('id', clientSocket.id);
    });

    it('should provide security statistics', () => {
      const securityStats = wsService.getSecurityStats();
      
      expect(securityStats).toHaveProperty('connectionLimitsByIP');
      expect(securityStats).toHaveProperty('totalUniqueIPs');
      expect(securityStats).toHaveProperty('rateLimitedClients');
      expect(securityStats).toHaveProperty('maxConnectionsPerIP');
    });

    it('should provide feed statistics', (done) => {
      clientSocket.on('subscription:confirmed', () => {
        const feedStats = wsService.getFeedStats();
        
        expect(feedStats).toHaveProperty('TimingData');
        expect(feedStats.TimingData.subscriberCount).toBe(1);
        expect(feedStats.TimingData.subscribers).toContain(clientSocket.id);
        done();
      });

      clientSocket.emit('subscribe', 'TimingData');
    });
  });

  describe('Throttled Broadcasting', () => {
    beforeEach((done) => {
      clientSocket = Client(serverAddress);
      clientSocket.on('connect', () => {
        clientSocket.emit('subscribe', 'TimingData');
        clientSocket.on('subscription:confirmed', done);
      });
    });

    it('should throttle high-frequency broadcasts', (done) => {
      const feedName = 'TimingData';
      const testData = { lapTime: '1:23.456' };
      let messageCount = 0;

      clientSocket.on(`feed:${feedName}`, () => {
        messageCount++;
      });

      // Send multiple rapid broadcasts
      for (let i = 0; i < 5; i++) {
        wsService.throttledBroadcast(feedName, testData, 50);
      }

      setTimeout(() => {
        // Should receive fewer messages due to throttling
        expect(messageCount).toBeLessThan(5);
        expect(messageCount).toBeGreaterThan(0);
        done();
      }, 200);
    });
  });
});