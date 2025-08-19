import React from 'react';
import { ConnectionStatus as ConnectionStatusType } from '../types/f1Data';

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  onRetry: () => void;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status, onRetry }) => {
  const getStatusColor = () => {
    if (status.error && status.error.trim()) return '#ef4444'; // red for error
    if (status.isConnected) return '#10b981'; // green
    if (status.isConnecting) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  const getStatusText = () => {
    if (status.error && status.error.trim()) return status.error;
    if (status.isConnected) return 'Connected';
    if (status.isConnecting) return 'Connecting...';
    return 'Disconnected';
  };

  const formatLastUpdate = (date?: Date) => {
    if (!date) return '';
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return date.toLocaleTimeString();
  };

  const getStatusClassName = () => {
    let className = 'connection-status';
    if (status.error && status.error.trim()) className += ' error';
    else if (status.isConnected) className += ' connected';
    else if (status.isConnecting) className += ' connecting';
    else className += ' disconnected';
    return className;
  };

  return (
    <div className="connection-status">
      <div 
        className={getStatusClassName()}
        role="status"
        aria-live="polite"
      >
        <div className="status-indicator">
          <div 
            className="status-dot"
            style={{ backgroundColor: getStatusColor() }}
          />
          <span className="status-text">{getStatusText()}</span>
        </div>
        
        {status.isConnected && status.lastUpdate && (
          <span className="last-update">
            Last update: {formatLastUpdate(status.lastUpdate)}
          </span>
        )}
        
        {status.error && status.error.trim() && (
          <div className="error-message">
            <button onClick={onRetry} className="retry-button">
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};