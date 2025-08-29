import React from 'react';
import { TrackStatus } from '../types/f1Data';

interface TrackStatusFlagProps {
  trackStatus: TrackStatus | null;
}

export const TrackStatusFlag: React.FC<TrackStatusFlagProps> = ({ trackStatus }) => {
  if (!trackStatus) {
    return null;
  }

  const getFlagColor = (flagState: string): string => {
    switch (flagState.toLowerCase()) {
      case 'green':
        return '#10b981'; // Green flag - racing conditions
      case 'yellow':
        return '#fbbf24'; // Yellow flag - caution/danger
      case 'red':
        return '#ef4444'; // Red flag - session stopped
      case 'safety car':
        return '#f97316'; // Orange for safety car
      case 'virtual safety car':
        return '#a855f7'; // Purple for virtual safety car
      case 'checkered':
        return '#6b7280'; // Gray for checkered flag
      default:
        return '#6b7280'; // Default gray
    }
  };

  const getFlagIcon = (flagState: string): string => {
    switch (flagState.toLowerCase()) {
      case 'green':
        return '🏁';
      case 'yellow':
        return '⚠️';
      case 'red':
        return '🚫';
      case 'safety car':
        return '🚗';
      case 'virtual safety car':
        return '🔄';
      case 'checkered':
        return '🏁';
      default:
        return '🏁';
    }
  };

  const flagColor = getFlagColor(trackStatus.flagState);
  const flagIcon = getFlagIcon(trackStatus.flagState);
  const isActiveFlag = trackStatus.flagState.toLowerCase() !== 'green';

  return (
    <div className={`track-status-flag ${isActiveFlag ? 'active' : ''}`}>
      <div className="flag-container">
        <div 
          className="flag-indicator"
          style={{ backgroundColor: flagColor }}
        />
        <div className="flag-content">
          <span className="flag-icon">{flagIcon}</span>
          <div className="flag-details">
            <span className="flag-state">{trackStatus.flagState}</span>
            <span className="flag-message">{trackStatus.message}</span>
          </div>
        </div>
      </div>
      {trackStatus.timestamp && (
        <div className="flag-timestamp">
          Updated: {new Date(trackStatus.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};