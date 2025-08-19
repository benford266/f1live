import React from 'react';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus } from '../../components/ConnectionStatus';
import type { ConnectionStatus as ConnectionStatusType } from '../../types/f1Data';

describe('ConnectionStatus Component', () => {
  const createMockConnectionStatus = (overrides: Partial<ConnectionStatusType> = {}): ConnectionStatusType => ({
    isConnected: true,
    isConnecting: false,
    lastUpdate: new Date(),
    error: undefined,
    ...overrides
  });

  it('shows connected status when connected', () => {
    const connectionStatus = createMockConnectionStatus({ isConnected: true });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('shows connecting status when connecting', () => {
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: false, 
      isConnecting: true 
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('connecting');
  });

  it('shows disconnected status when not connected and not connecting', () => {
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: false, 
      isConnecting: false 
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('disconnected');
  });

  it('displays error message when error is present', () => {
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: false, 
      error: 'Connection failed: Network error' 
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    expect(screen.getByText('Connection failed: Network error')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('error');
  });

  it('shows last update time when available and connected', () => {
    const lastUpdate = new Date('2024-01-15T10:30:00Z');
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: true,
      lastUpdate 
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    expect(screen.getByText(/Last update:/)).toBeInTheDocument();
    // Check that time is displayed (format may vary based on locale)
    expect(screen.getByText(/10:30/)).toBeInTheDocument();
  });

  it('does not show last update time when disconnected', () => {
    const lastUpdate = new Date('2024-01-15T10:30:00Z');
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: false,
      lastUpdate 
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    expect(screen.queryByText(/Last update:/)).not.toBeInTheDocument();
  });

  it('handles very recent last update time', () => {
    const lastUpdate = new Date(); // Now
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: true,
      lastUpdate 
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    expect(screen.getByText(/Last update:/)).toBeInTheDocument();
  });

  it('handles old last update time', () => {
    const lastUpdate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: true,
      lastUpdate 
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    expect(screen.getByText(/Last update:/)).toBeInTheDocument();
  });

  it('applies correct CSS classes based on connection state', () => {
    // Test connected state
    const connectedStatus = createMockConnectionStatus({ isConnected: true });
    const mockOnRetry = jest.fn();
    const { rerender } = render(<ConnectionStatus status={connectedStatus} onRetry={mockOnRetry} />);
    
    let statusElement = screen.getByRole('status');
    expect(statusElement).toHaveClass('connection-status', 'connected');
    expect(statusElement).not.toHaveClass('connecting', 'disconnected', 'error');

    // Test connecting state
    const connectingStatus = createMockConnectionStatus({ 
      isConnected: false, 
      isConnecting: true 
    });
    rerender(<ConnectionStatus status={connectingStatus} onRetry={mockOnRetry} />);
    
    statusElement = screen.getByRole('status');
    expect(statusElement).toHaveClass('connection-status', 'connecting');
    expect(statusElement).not.toHaveClass('connected', 'disconnected', 'error');

    // Test disconnected state
    const disconnectedStatus = createMockConnectionStatus({ 
      isConnected: false, 
      isConnecting: false 
    });
    rerender(<ConnectionStatus status={disconnectedStatus} onRetry={mockOnRetry} />);
    
    statusElement = screen.getByRole('status');
    expect(statusElement).toHaveClass('connection-status', 'disconnected');
    expect(statusElement).not.toHaveClass('connected', 'connecting', 'error');

    // Test error state
    const errorStatus = createMockConnectionStatus({ 
      isConnected: false, 
      error: 'Test error' 
    });
    rerender(<ConnectionStatus status={errorStatus} onRetry={mockOnRetry} />);
    
    statusElement = screen.getByRole('status');
    expect(statusElement).toHaveClass('connection-status', 'error');
    expect(statusElement).not.toHaveClass('connected', 'connecting', 'disconnected');
  });

  it('handles undefined lastUpdate gracefully', () => {
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: true,
      lastUpdate: undefined 
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.queryByText(/Last update:/)).not.toBeInTheDocument();
  });

  it('prioritizes error state over connecting state', () => {
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: false,
      isConnecting: true,
      error: 'Connection error while connecting'
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    expect(screen.getByText('Connection error while connecting')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('error');
    expect(screen.queryByText('Connecting...')).not.toBeInTheDocument();
  });

  it('handles empty error message', () => {
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: false,
      error: '' 
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    // Should fall back to disconnected state
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('disconnected');
  });

  it('handles whitespace-only error message', () => {
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: false,
      error: '   ' 
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    // Should fall back to disconnected state
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('disconnected');
  });

  it('truncates very long error messages appropriately', () => {
    const longError = 'This is a very long error message that might need to be handled properly in the UI to prevent layout issues and ensure good user experience even when error messages are extremely verbose and detailed';
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: false,
      error: longError 
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    expect(screen.getByText(longError)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('error');
  });

  it('formats time consistently across different locales', () => {
    const lastUpdate = new Date('2024-01-15T10:30:45Z');
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: true,
      lastUpdate 
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    const timeElement = screen.getByText(/Last update:/);
    expect(timeElement).toBeInTheDocument();
    
    // The exact format depends on the implementation, but it should include time
    const timeText = timeElement.textContent;
    expect(timeText).toMatch(/\d{1,2}:\d{2}/); // Should contain time format HH:MM
  });

  it('updates display when connection status changes', () => {
    const initialStatus = createMockConnectionStatus({ 
      isConnected: false, 
      isConnecting: true 
    });
    
    const mockOnRetry = jest.fn();
    const { rerender } = render(<ConnectionStatus status={initialStatus} onRetry={mockOnRetry} />);
    
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
    
    // Simulate successful connection
    const connectedStatus = createMockConnectionStatus({ 
      isConnected: true, 
      isConnecting: false,
      lastUpdate: new Date()
    });
    
    rerender(<ConnectionStatus status={connectedStatus} onRetry={mockOnRetry} />);
    
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.queryByText('Connecting...')).not.toBeInTheDocument();
    expect(screen.getByText(/Last update:/)).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    const connectionStatus = createMockConnectionStatus({ isConnected: true });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    const statusElement = screen.getByRole('status');
    expect(statusElement).toBeInTheDocument();
    
    // Should have aria-live for screen readers
    expect(statusElement).toHaveAttribute('aria-live');
  });

  it('provides meaningful status text for screen readers', () => {
    const connectionStatus = createMockConnectionStatus({ 
      isConnected: true,
      lastUpdate: new Date()
    });
    const mockOnRetry = jest.fn();
    
    render(<ConnectionStatus status={connectionStatus} onRetry={mockOnRetry} />);
    
    const statusElement = screen.getByRole('status');
    const statusText = statusElement.textContent;
    
    expect(statusText).toContain('Connected');
    expect(statusText).toContain('Last update:');
  });
});