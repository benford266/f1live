import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocket } from '../../hooks/useWebSocket';
import type { Driver, RaceStatus } from '../../types/f1Data';
import { io } from 'socket.io-client';

// Mock socket.io-client
const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  connected: false,
  id: 'mock-socket-id'
};

const mockIo = jest.mocked(io);

// Mock socket.io-client at the module level
jest.mock('socket.io-client', () => ({
  io: jest.fn()
}));

// Mock environment variable
process.env.REACT_APP_WEBSOCKET_URL = 'http://localhost:3001';

describe('useWebSocket Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket.connected = false;
    
    // Set up mock implementation
    mockIo.mockReturnValue(mockSocket as any);
    
    // Reset mock implementations
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
    mockSocket.emit.mockClear();
    mockSocket.disconnect.mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useWebSocket());

    expect(result.current.drivers).toEqual([]);
    expect(result.current.raceStatus).toBeNull();
    expect(result.current.connectionStatus.isConnected).toBe(false);
    expect(result.current.connectionStatus.isConnecting).toBe(true); // Starts connecting on mount
    expect(typeof result.current.retry).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
  });

  it('attempts to connect on mount', () => {
    renderHook(() => useWebSocket());

    expect(mockIo).toHaveBeenCalledWith('http://localhost:3001', {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: false
    });
  });

  it('sets up event listeners on connection', () => {
    renderHook(() => useWebSocket());

    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('driver:update', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('drivers:all', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('race:status', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('lap:completed', expect.any(Function));
  });

  it('updates connection status on connect', async () => {
    const { result } = renderHook(() => useWebSocket());

    // Simulate connect event
    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')?.[1];
    
    act(() => {
      connectHandler?.();
    });

    await waitFor(() => {
      expect(result.current.connectionStatus.isConnected).toBe(true);
      expect(result.current.connectionStatus.isConnecting).toBe(false);
      expect(result.current.connectionStatus.lastUpdate).toBeInstanceOf(Date);
    });
  });

  it('updates connection status on disconnect', async () => {
    const { result } = renderHook(() => useWebSocket());

    // First connect
    const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')?.[1];
    act(() => {
      connectHandler?.();
    });

    // Then disconnect
    const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')?.[1];
    
    act(() => {
      disconnectHandler?.('transport close');
    });

    await waitFor(() => {
      expect(result.current.connectionStatus.isConnected).toBe(false);
      expect(result.current.connectionStatus.isConnecting).toBe(false);
      expect(result.current.connectionStatus.error).toBe('Disconnected: transport close');
    });
  });

  it('handles connection errors', async () => {
    const { result } = renderHook(() => useWebSocket());

    const errorHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect_error')?.[1];
    const error = new Error('Connection failed');
    
    act(() => {
      errorHandler?.(error);
    });

    await waitFor(() => {
      expect(result.current.connectionStatus.isConnected).toBe(false);
      expect(result.current.connectionStatus.error).toBe('Connection failed: Connection failed');
    });
  });

  it('updates drivers on driver:update event', async () => {
    const { result } = renderHook(() => useWebSocket());

    const driverUpdateHandler = mockSocket.on.mock.calls.find(call => call[0] === 'driver:update')?.[1];
    const mockDriver: Driver = globalThis.testUtils.createMockDriver({
      id: '1',
      name: 'Max Verstappen',
      position: 1
    });

    act(() => {
      driverUpdateHandler?.(mockDriver);
    });

    await waitFor(() => {
      expect(result.current.drivers).toHaveLength(1);
      expect(result.current.drivers[0]).toEqual(mockDriver);
      expect(result.current.connectionStatus.lastUpdate).toBeInstanceOf(Date);
    });
  });

  it('updates existing driver on driver:update event', async () => {
    const { result } = renderHook(() => useWebSocket());

    const driverUpdateHandler = mockSocket.on.mock.calls.find(call => call[0] === 'driver:update')?.[1];
    
    const initialDriver: Driver = globalThis.testUtils.createMockDriver({
      id: '1',
      name: 'Max Verstappen',
      position: 1,
      lastLapTime: '1:23.456'
    });

    // Add initial driver
    act(() => {
      driverUpdateHandler?.(initialDriver);
    });

    // Update driver with new lap time
    const updatedDriver = {
      id: '1',
      lastLapTime: '1:22.123'
    };

    act(() => {
      driverUpdateHandler?.(updatedDriver);
    });

    await waitFor(() => {
      expect(result.current.drivers).toHaveLength(1);
      expect(result.current.drivers[0].lastLapTime).toBe('1:22.123');
      expect(result.current.drivers[0].name).toBe('Max Verstappen'); // Should preserve existing data
    });
  });

  it('replaces all drivers on drivers:all event', async () => {
    const { result } = renderHook(() => useWebSocket());

    const driversAllHandler = mockSocket.on.mock.calls.find(call => call[0] === 'drivers:all')?.[1];
    const mockDrivers: Driver[] = [
      globalThis.testUtils.createMockDriver({ id: '1', position: 1 }),
      globalThis.testUtils.createMockDriver({ id: '44', position: 2 }),
      globalThis.testUtils.createMockDriver({ id: '16', position: 3 })
    ];

    act(() => {
      driversAllHandler?.(mockDrivers);
    });

    await waitFor(() => {
      expect(result.current.drivers).toHaveLength(3);
      expect(result.current.drivers).toEqual(mockDrivers);
    });
  });

  it('sorts drivers by position', async () => {
    const { result } = renderHook(() => useWebSocket());

    const driversAllHandler = mockSocket.on.mock.calls.find(call => call[0] === 'drivers:all')?.[1];
    const unsortedDrivers: Driver[] = [
      globalThis.testUtils.createMockDriver({ id: '16', position: 3 }),
      globalThis.testUtils.createMockDriver({ id: '1', position: 1 }),
      globalThis.testUtils.createMockDriver({ id: '44', position: 2 })
    ];

    act(() => {
      driversAllHandler?.(unsortedDrivers);
    });

    await waitFor(() => {
      expect(result.current.drivers[0].position).toBe(1);
      expect(result.current.drivers[1].position).toBe(2);
      expect(result.current.drivers[2].position).toBe(3);
    });
  });

  it('updates race status on race:status event', async () => {
    const { result } = renderHook(() => useWebSocket());

    const raceStatusHandler = mockSocket.on.mock.calls.find(call => call[0] === 'race:status')?.[1];
    const mockRaceStatus: RaceStatus = globalThis.testUtils.createMockRaceStatus({
      sessionType: 'Race',
      lapNumber: 25
    });

    act(() => {
      raceStatusHandler?.(mockRaceStatus);
    });

    await waitFor(() => {
      expect(result.current.raceStatus).toEqual(mockRaceStatus);
      expect(result.current.connectionStatus.lastUpdate).toBeInstanceOf(Date);
    });
  });

  it('handles lap completed events', async () => {
    const { result } = renderHook(() => useWebSocket());

    // First add a driver
    const driverUpdateHandler = mockSocket.on.mock.calls.find(call => call[0] === 'driver:update')?.[1];
    const mockDriver: Driver = globalThis.testUtils.createMockDriver({
      id: '1',
      lastLapTime: '1:25.000',
      bestLapTime: '1:24.000',
      completedLaps: 10
    });

    act(() => {
      driverUpdateHandler?.(mockDriver);
    });

    // Then handle lap completed
    const lapCompletedHandler = mockSocket.on.mock.calls.find(call => call[0] === 'lap:completed')?.[1];
    const lapData = {
      driverId: '1',
      lapTime: '1:23.456',
      lapNumber: 11
    };

    act(() => {
      lapCompletedHandler?.(lapData);
    });

    await waitFor(() => {
      const driver = result.current.drivers[0];
      expect(driver.lastLapTime).toBe('1:23.456');
      expect(driver.completedLaps).toBe(11);
      expect(driver.bestLapTime).toBe('1:23.456'); // Should update best lap
    });
  });

  it('does not update best lap time if new lap is slower', async () => {
    const { result } = renderHook(() => useWebSocket());

    // Add driver with existing best lap
    const driverUpdateHandler = mockSocket.on.mock.calls.find(call => call[0] === 'driver:update')?.[1];
    const mockDriver: Driver = globalThis.testUtils.createMockDriver({
      id: '1',
      bestLapTime: '1:22.000',
      completedLaps: 10
    });

    act(() => {
      driverUpdateHandler?.(mockDriver);
    });

    // Complete a slower lap
    const lapCompletedHandler = mockSocket.on.mock.calls.find(call => call[0] === 'lap:completed')?.[1];
    const lapData = {
      driverId: '1',
      lapTime: '1:25.000', // Slower than best
      lapNumber: 11
    };

    act(() => {
      lapCompletedHandler?.(lapData);
    });

    await waitFor(() => {
      const driver = result.current.drivers[0];
      expect(driver.lastLapTime).toBe('1:25.000');
      expect(driver.bestLapTime).toBe('1:22.000'); // Should keep existing best
    });
  });

  it('implements automatic reconnection with backoff', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useWebSocket());

    const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')?.[1];

    // Simulate disconnect
    act(() => {
      disconnectHandler?.('transport error');
    });

    // Should attempt reconnection after delay
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockIo).toHaveBeenCalledTimes(2); // Initial + reconnect attempt
  });

  it('limits reconnection attempts', async () => {
    jest.useFakeTimers();
    renderHook(() => useWebSocket());

    const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')?.[1];

    // Simulate multiple disconnects
    for (let i = 0; i < 6; i++) {
      act(() => {
        disconnectHandler?.('transport error');
      });
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });
    }

    // Should stop after max attempts (5)
    expect(mockIo).toHaveBeenCalledTimes(6); // Initial + 5 reconnect attempts
  });

  it('does not reconnect on manual disconnect', async () => {
    jest.useFakeTimers();
    renderHook(() => useWebSocket());

    const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')?.[1];

    // Simulate manual disconnect
    act(() => {
      disconnectHandler?.('io client disconnect');
    });

    // Should not attempt reconnection
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockIo).toHaveBeenCalledTimes(1); // Only initial connection
  });

  it('provides retry function that resets reconnection attempts', async () => {
    const { result } = renderHook(() => useWebSocket());

    // Wait for initial connection
    await waitFor(() => {
      expect(mockIo).toHaveBeenCalledTimes(1);
    });

    // Manually trigger retry
    act(() => {
      result.current.retry();
    });

    // Should disconnect and reconnect
    expect(mockSocket.disconnect).toHaveBeenCalled();
    
    // Wait for the retry delay and reconnection
    await waitFor(() => {
      expect(mockIo).toHaveBeenCalledTimes(2); // Initial + manual retry
    }, { timeout: 2000 });
  });

  it('provides disconnect function', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      result.current.disconnect();
    });

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket());

    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('handles driver updates for non-existent drivers gracefully', async () => {
    const { result } = renderHook(() => useWebSocket());

    const lapCompletedHandler = mockSocket.on.mock.calls.find(call => call[0] === 'lap:completed')?.[1];
    const lapData = {
      driverId: 'non-existent',
      lapTime: '1:23.456',
      lapNumber: 11
    };

    act(() => {
      lapCompletedHandler?.(lapData);
    });

    // Should not crash or add invalid drivers
    expect(result.current.drivers).toHaveLength(0);
  });

  it('uses environment variable for WebSocket URL', () => {
    renderHook(() => useWebSocket());

    expect(mockIo).toHaveBeenCalledWith('http://localhost:3001', expect.any(Object));
  });

  it('falls back to default URL when environment variable is not set', () => {
    const originalEnv = process.env.REACT_APP_WEBSOCKET_URL;
    delete process.env.REACT_APP_WEBSOCKET_URL;

    renderHook(() => useWebSocket());

    expect(mockIo).toHaveBeenCalledWith('http://localhost:3001', expect.any(Object));

    // Restore environment variable
    process.env.REACT_APP_WEBSOCKET_URL = originalEnv;
  });

  it('handles rapid driver updates efficiently', async () => {
    const { result } = renderHook(() => useWebSocket());

    const driverUpdateHandler = mockSocket.on.mock.calls.find(call => call[0] === 'driver:update')?.[1];

    // Send rapid updates for the same driver
    for (let i = 0; i < 10; i++) {
      act(() => {
        driverUpdateHandler?.({
          id: '1',
          position: 1,
          lastLapTime: `1:2${i}.${String(i).padStart(3, '0')}`
        });
      });
    }

    await waitFor(() => {
      expect(result.current.drivers).toHaveLength(1);
      expect(result.current.drivers[0].lastLapTime).toBe('1:29.009');
    });
  });
});