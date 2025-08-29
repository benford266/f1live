import React from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { LiveDataTable } from './components/LiveDataTable';
import { RaceHeader } from './components/RaceHeader';
import { ConnectionStatus } from './components/ConnectionStatus';
import { TrackStatusFlag } from './components/TrackStatusFlag';
import './styles/App.css';

const App: React.FC = () => {
  const { 
    drivers, 
    raceStatus, 
    trackStatus,
    connectionStatus, 
    retry 
  } = useWebSocket();

  return (
    <div className="app">
      <header className="app-header">
        <RaceHeader raceStatus={raceStatus} />
        <ConnectionStatus 
          status={connectionStatus} 
          onRetry={retry}
        />
      </header>

      <main className="app-main">
        <TrackStatusFlag trackStatus={trackStatus} />
        <LiveDataTable 
          drivers={drivers} 
          isConnected={connectionStatus.isConnected}
        />
      </main>

      <footer className="app-footer">
        <p>F1 Live Data Visualization - Real-time Formula 1 race data</p>
        {connectionStatus.lastUpdate && (
          <p className="last-update-footer">
            Last update: {connectionStatus.lastUpdate.toLocaleTimeString()}
          </p>
        )}
      </footer>
    </div>
  );
};

export default App;