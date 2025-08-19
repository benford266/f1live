const { jest } = require('@jest/globals');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port for tests
process.env.REDIS_URL = 'redis://localhost:6379/15'; // Use test database
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Mock external dependencies globally
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }))
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    printf: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

// Mock F1 SignalR connection (external service)
jest.mock('../src/services/signalr', () => ({
  initializeSignalR: jest.fn(() => Promise.resolve({
    isConnected: jest.fn(() => true),
    disconnect: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    off: jest.fn()
  }))
}));

// Global test utilities
global.testUtils = {
  // Helper to create mock drivers data
  createMockDriver: (overrides = {}) => ({
    id: 'driver-1',
    number: '1',
    name: 'Test Driver',
    team: 'Test Team',
    position: 1,
    gapToLeader: '0',
    lastLapTime: '1:23.456',
    bestLapTime: '1:22.123',
    completedLaps: 10,
    speed: 320,
    isRetired: false,
    isPitStop: false,
    teamColor: '#FF0000',
    ...overrides
  }),

  // Helper to create mock race status
  createMockRaceStatus: (overrides = {}) => ({
    sessionType: 'Race',
    sessionState: 'Started',
    trackStatus: 'Green',
    lapNumber: 10,
    totalLaps: 58,
    timeRemaining: '01:45:30',
    weatherConditions: {
      temperature: 25,
      humidity: 60,
      pressure: 1013,
      windSpeed: 10,
      trackTemperature: 35
    },
    ...overrides
  }),

  // Helper to wait for async operations
  waitFor: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),

  // Helper to create mock WebSocket
  createMockSocket: () => ({
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    connected: true,
    id: 'mock-socket-id'
  })
};

// Cleanup function to run after each test
afterEach(async () => {
  jest.clearAllMocks();
  
  // Clean up any running timers
  jest.clearAllTimers();
  
  // Reset modules
  jest.resetModules();
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection in tests:', error);
});

console.log('Test setup completed');