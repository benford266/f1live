import React, { useMemo } from 'react';
import { Driver } from '../types/f1Data';

interface LiveDataTableProps {
  drivers: Driver[];
  isConnected: boolean;
}

export const LiveDataTable: React.FC<LiveDataTableProps> = ({ drivers, isConnected }) => {
  const sortedDrivers = useMemo(() => {
    return [...drivers].sort((a, b) => {
      // Sort by position, handling retired drivers
      if (a.isRetired && !b.isRetired) return 1;
      if (!a.isRetired && b.isRetired) return -1;
      return a.position - b.position;
    });
  }, [drivers]);

  const formatTime = (time?: string) => {
    if (!time) return '-';
    // Handle different time formats
    if (time.includes(':')) return time;
    // Convert milliseconds to lap time format if needed
    const ms = parseFloat(time);
    if (!isNaN(ms)) {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(3);
      return `${minutes}:${seconds.padStart(6, '0')}`;
    }
    return time;
  };

  const formatGap = (gap?: string) => {
    if (!gap || gap === '0' || gap === '0.000') return 'LEADER';
    if (gap.includes('LAP')) return gap;
    if (gap.startsWith('+')) return gap;
    return `+${gap}`;
  };

  const getTeamColor = (driver: Driver) => {
    // Default team colors - you can expand this based on actual F1 teams
    const teamColors: Record<string, string> = {
      'Red Bull Racing': '#1e40af',
      'Ferrari': '#dc2626',
      'Mercedes': '#06b6d4',
      'McLaren': '#ea580c',
      'Alpine': '#ec4899',
      'AlphaTauri': '#374151',
      'Aston Martin': '#059669',
      'Williams': '#3730a3',
      'Alfa Romeo': '#7c2d12',
      'Haas': '#6b7280'
    };
    
    return driver.teamColor || teamColors[driver.team] || '#6b7280';
  };

  const getRowClassName = (driver: Driver) => {
    let className = 'driver-row';
    if (driver.isRetired) className += ' retired';
    if (driver.isPitStop) className += ' pit-stop';
    if (!isConnected) className += ' disconnected';
    return className;
  };

  if (drivers.length === 0) {
    return (
      <div className="live-data-table">
        <div className="table-header">
          <h2>Driver Standings</h2>
        </div>
        <div className="no-data">
          {isConnected ? 'Waiting for driver data...' : 'No connection to race data'}
        </div>
      </div>
    );
  }

  return (
    <div className="live-data-table">
      <div className="table-header">
        <h2>Driver Standings</h2>
        <span className="driver-count">{drivers.length} drivers</span>
      </div>
      
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th className="pos">Pos</th>
              <th className="driver">Driver</th>
              <th className="team">Team</th>
              <th className="gap">Gap</th>
              <th className="last-lap">Last Lap</th>
              <th className="best-lap">Best Lap</th>
              <th className="laps">Laps</th>
              <th className="speed">Speed</th>
            </tr>
          </thead>
          <tbody>
            {sortedDrivers.map((driver) => (
              <tr key={driver.id} className={getRowClassName(driver)}>
                <td className="pos">
                  <span className="position-number">{driver.position}</span>
                </td>
                <td className="driver">
                  <div className="driver-info">
                    <span className="driver-number">#{driver.number}</span>
                    <span className="driver-name">{driver.name}</span>
                  </div>
                </td>
                <td className="team">
                  <div className="team-info">
                    <div 
                      className="team-color" 
                      style={{ backgroundColor: getTeamColor(driver) }}
                    />
                    <span className="team-name">{driver.team}</span>
                  </div>
                </td>
                <td className="gap">
                  <span className={`gap-time ${driver.gapToLeader === '0' ? 'leader' : ''}`}>
                    {formatGap(driver.gapToLeader)}
                  </span>
                </td>
                <td className="last-lap">
                  {formatTime(driver.lastLapTime || driver.currentLapTime)}
                </td>
                <td className="best-lap">
                  <span className={`best-time ${driver.bestLapTime ? 'has-time' : ''}`}>
                    {formatTime(driver.bestLapTime)}
                  </span>
                </td>
                <td className="laps">{driver.completedLaps}</td>
                <td className="speed">
                  {driver.speed ? `${Math.round(driver.speed)} km/h` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {!isConnected && (
        <div className="connection-warning">
          Live data updates paused - connection lost
        </div>
      )}
    </div>
  );
};