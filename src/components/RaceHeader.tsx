import React from 'react';
import { RaceStatus } from '../types/f1Data';

interface RaceHeaderProps {
  raceStatus: RaceStatus | null;
}

export const RaceHeader: React.FC<RaceHeaderProps> = ({ raceStatus }) => {
  const getFlagColor = (flag?: string) => {
    switch (flag) {
      case 'green': return '#10b981';
      case 'yellow': return '#f59e0b';
      case 'red': return '#ef4444';
      case 'checkered': return '#374151';
      case 'safety_car': return '#f59e0b';
      case 'virtual_safety_car': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const formatSessionType = (type: string) => {
    const typeMap: Record<string, string> = {
      'practice1': 'Practice 1',
      'practice2': 'Practice 2',
      'practice3': 'Practice 3',
      'qualifying': 'Qualifying',
      'race': 'Race'
    };
    return typeMap[type] || type;
  };

  const formatSessionStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      'inactive': 'Inactive',
      'active': 'Active',
      'finished': 'Finished',
      'suspended': 'Suspended'
    };
    return statusMap[status] || status;
  };

  if (!raceStatus) {
    return (
      <div className="race-header">
        <h1>F1 Live Data Visualization</h1>
        <div className="session-info">
          <span className="session-status">Waiting for session data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="race-header">
      <h1>F1 Live Data Visualization</h1>
      <div className="session-info">
        <div className="session-type">
          {formatSessionType(raceStatus.sessionType)}
        </div>
        <div className="session-status">
          Status: {formatSessionStatus(raceStatus.sessionStatus)}
        </div>
        
        {raceStatus.flagStatus && (
          <div className="flag-status">
            <div 
              className="flag-indicator"
              style={{ backgroundColor: getFlagColor(raceStatus.flagStatus) }}
            />
            <span>{raceStatus.flagStatus.replace('_', ' ').toUpperCase()}</span>
          </div>
        )}
        
        {raceStatus.currentLap && raceStatus.totalLaps && (
          <div className="lap-counter">
            Lap {raceStatus.currentLap} / {raceStatus.totalLaps}
          </div>
        )}
        
        {raceStatus.timeRemaining && (
          <div className="time-remaining">
            Time: {raceStatus.timeRemaining}
          </div>
        )}
      </div>
    </div>
  );
};