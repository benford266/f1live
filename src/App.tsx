import React, { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { LiveDataTable } from './components/LiveDataTable';
import { RaceHeader } from './components/RaceHeader';
import { ConnectionStatus } from './components/ConnectionStatus';
import { TrackStatusFlag } from './components/TrackStatusFlag';
import { TrackMap } from './components/TrackMap';
import './styles/App.css';
import './styles/TrackMap.css';

type ViewType = 'live-data' | 'track-map';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('live-data');
  
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

      <nav className="app-navigation">
        <button 
          className={`nav-button ${activeView === 'live-data' ? 'active' : ''}`}
          onClick={() => setActiveView('live-data')}
        >
          📊 Live Timing Data
        </button>
        <button 
          className={`nav-button ${activeView === 'track-map' ? 'active' : ''}`}
          onClick={() => setActiveView('track-map')}
        >
          🏁 Track Map
        </button>
      </nav>

      <main className="app-main">
        <TrackStatusFlag trackStatus={trackStatus} />
        
        {activeView === 'live-data' && (
          <LiveDataTable 
            drivers={drivers} 
            isConnected={connectionStatus.isConnected}
          />
        )}
        
        {activeView === 'track-map' && (
          <TrackMap />
        )}
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