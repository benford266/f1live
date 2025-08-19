// React Testing Library setup
import '@testing-library/jest-dom';
import 'whatwg-fetch';

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  disconnect() {}
  unobserve() {}
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {}
  disconnect() {}
  unobserve() {}
};

// Mock WebSocket
class MockWebSocket {
  url: string;
  readyState: number;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    
    // Simulate connection after a short delay
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // In tests, we can trigger message events manually
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code, reason }));
    }
  }

  // Method to simulate receiving a message (for testing)
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  // Method to simulate an error (for testing)
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

// Socket.IO client mocking is handled in individual test files

// Mock environment variables
process.env.REACT_APP_WEBSOCKET_URL = 'http://localhost:3001';

// Global test utilities
declare global {
  namespace globalThis {
    var testUtils: {
      createMockDriver: (overrides?: any) => any;
      createMockRaceStatus: (overrides?: any) => any;
      createMockConnectionStatus: (overrides?: any) => any;
      waitFor: (ms?: number) => Promise<void>;
      MockWebSocket: typeof MockWebSocket;
    };
  }
}

globalThis.testUtils = {
  // Helper to create mock driver data
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

  // Helper to create mock connection status
  createMockConnectionStatus: (overrides = {}) => ({
    isConnected: true,
    isConnecting: false,
    lastUpdate: new Date(),
    error: undefined,
    ...overrides
  }),

  // Helper to wait for async operations
  waitFor: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),

  // Export MockWebSocket for use in tests
  MockWebSocket
};

// Mock console methods to reduce noise in tests
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args: any[]) => {
    // Suppress React act() warnings and other test-related warnings
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render is no longer supported') ||
       args[0].includes('Warning: An invalid form control') ||
       args[0].includes('act(...)'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };

  console.warn = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning:')
    ) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection in tests:', error);
});

console.log('Frontend test setup completed');