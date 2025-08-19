import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Driver, RaceStatus, ConnectionStatus } from '../types/f1Data';

const WEBSOCKET_URL = process.env.REACT_APP_WEBSOCKET_URL || 'http://localhost:3001';

export const useWebSocket = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [raceStatus, setRaceStatus] = useState<RaceStatus | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: false,
    isConnecting: false,
  });
  
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_INTERVAL = 3000;

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    setConnectionStatus(prev => ({ ...prev, isConnecting: true, error: undefined }));

    const socket = io(WEBSOCKET_URL, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: false, // We'll handle reconnection manually
    });

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      setConnectionStatus({
        isConnected: true,
        isConnecting: false,
        lastUpdate: new Date(),
      });
      reconnectAttemptsRef.current = 0;
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from WebSocket server:', reason);
      setConnectionStatus(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        error: `Disconnected: ${reason}`,
      }));
      
      // Attempt to reconnect if not manually disconnected
      if (reason !== 'io client disconnect' && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Reconnection attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
          connect();
        }, RECONNECT_INTERVAL);
      }
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setConnectionStatus(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        error: `Connection failed: ${error.message}`,
      }));
    });

    // Handle F1 data events
    socket.on('driver:update', (driver: Driver) => {
      setDrivers(prev => {
        const existingIndex = prev.findIndex(d => d.id === driver.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = { ...updated[existingIndex], ...driver };
          return updated.sort((a, b) => a.position - b.position);
        } else {
          return [...prev, driver].sort((a, b) => a.position - b.position);
        }
      });
      setConnectionStatus(prev => ({ ...prev, lastUpdate: new Date() }));
    });

    socket.on('drivers:all', (allDrivers: Driver[]) => {
      setDrivers(allDrivers.sort((a, b) => a.position - b.position));
      setConnectionStatus(prev => ({ ...prev, lastUpdate: new Date() }));
    });

    socket.on('race:status', (status: RaceStatus) => {
      setRaceStatus(status);
      setConnectionStatus(prev => ({ ...prev, lastUpdate: new Date() }));
    });

    socket.on('lap:completed', (lapData: { driverId: string; lapTime: string; lapNumber: number }) => {
      setDrivers(prev => 
        prev.map(driver => 
          driver.id === lapData.driverId 
            ? { 
                ...driver, 
                lastLapTime: lapData.lapTime,
                completedLaps: lapData.lapNumber,
                // Update best lap if this is faster
                bestLapTime: !driver.bestLapTime || lapData.lapTime < driver.bestLapTime 
                  ? lapData.lapTime 
                  : driver.bestLapTime
              }
            : driver
        )
      );
      setConnectionStatus(prev => ({ ...prev, lastUpdate: new Date() }));
    });

    socketRef.current = socket;
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    setConnectionStatus({
      isConnected: false,
      isConnecting: false,
    });
  }, []);

  const retry = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    disconnect();
    setTimeout(connect, 1000);
  }, [connect, disconnect]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    drivers,
    raceStatus,
    connectionStatus,
    retry,
    disconnect,
  };
};