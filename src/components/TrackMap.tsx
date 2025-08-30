import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

interface Position {
  x: number;
  y: number;
  z: number;
  timestamp: string;
  status: string;
  ageMs?: number;
}

interface DriverPosition {
  [driverNumber: string]: Position;
}

interface TrackBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

interface TrackCoordinate {
  x: number;
  y: number;
  index: number;
  distance: number;
}

interface TrackSection {
  id: number;
  startIndex: number;
  endIndex: number;
  coordinates: TrackCoordinate[];
  type: 'straight' | 'slight_corner' | 'sharp_corner';
}

interface TrackFeature {
  type: 'left_corner' | 'right_corner';
  position: TrackCoordinate;
  curvature: number;
  index: number;
}

interface TrackMapData {
  trackName: string;
  bounds: TrackBounds;
  racingLine: TrackCoordinate[];
  sections: TrackSection[];
  features: TrackFeature[];
  metadata: {
    coordinateCount: number;
    generatedAt: string;
    trackLength: number;
  };
}

interface TrackMapResponse {
  trackMap: TrackMapData | null;
  driverPositions: DriverPosition;
  metadata: {
    hasPositionData: boolean;
    hasTrackData: boolean;
    lastUpdate: string;
  };
}

interface TrackStats {
  trackCoordinates: number;
  activeDrivers: number;
  trackBounds: TrackBounds | null;
  hasTrackData: boolean;
  hasPositionData: boolean;
  dataQuality: {
    sufficient: boolean;
    excellent: boolean;
  };
}

export const TrackMap: React.FC = () => {
  const [trackData, setTrackData] = useState<TrackMapResponse | null>(null);
  const [stats, setStats] = useState<TrackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimePositions, setRealtimePositions] = useState<DriverPosition>({});
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  
  const { socket } = useWebSocket();

  // Fetch track mapping data
  const fetchTrackData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [mapResponse, statsResponse] = await Promise.all([
        fetch('/api/mapping/map'),
        fetch('/api/mapping/stats')
      ]);

      if (!mapResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch track data');
      }

      const mapData = await mapResponse.json();
      const statsData = await statsResponse.json();

      if (mapData.success) {
        setTrackData(mapData.data);
      }
      
      if (statsData.success) {
        setStats(statsData.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load track data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for real-time position updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handlePositionUpdate = (data: { positions: DriverPosition; timestamp: string }) => {
      setRealtimePositions(data.positions);
    };

    socket.on('track:positions', handlePositionUpdate);

    return () => {
      socket?.off('track:positions', handlePositionUpdate);
    };
  }, [socket]);

  // Initial data fetch and periodic refresh
  useEffect(() => {
    fetchTrackData();
    const interval = setInterval(fetchTrackData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [fetchTrackData]);

  // Canvas drawing logic
  const drawTrack = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !trackData?.trackMap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { trackMap } = trackData;
    const { bounds, racingLine, sections, features } = trackMap;

    if (!bounds || racingLine.length === 0) return;

    // Calculate scale and offset to fit track in canvas
    const padding = 50;
    const scaleX = (canvas.width - padding * 2) / (bounds.maxX - bounds.minX);
    const scaleY = (canvas.height - padding * 2) / (bounds.maxY - bounds.minY);
    const scale = Math.min(scaleX, scaleY);

    const offsetX = padding + (canvas.width - padding * 2 - (bounds.maxX - bounds.minX) * scale) / 2;
    const offsetY = padding + (canvas.height - padding * 2 - (bounds.maxY - bounds.minY) * scale) / 2;

    // Transform coordinates
    const transform = (x: number, y: number) => ({
      x: (x - bounds.minX) * scale + offsetX,
      y: (y - bounds.minY) * scale + offsetY
    });

    // Draw track sections with different colors
    sections.forEach(section => {
      ctx.beginPath();
      ctx.strokeStyle = section.type === 'straight' ? '#4CAF50' : 
                       section.type === 'slight_corner' ? '#FF9800' : '#F44336';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      section.coordinates.forEach((coord, index) => {
        const point = transform(coord.x, coord.y);
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      ctx.stroke();
    });

    // Draw racing line
    ctx.beginPath();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    
    racingLine.forEach((coord, index) => {
      const point = transform(coord.x, coord.y);
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw track features (corners)
    features.forEach(feature => {
      const point = transform(feature.position.x, feature.position.y);
      
      ctx.beginPath();
      ctx.fillStyle = feature.type === 'left_corner' ? '#2196F3' : '#9C27B0';
      ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
      ctx.fill();
      
      // Add corner labels
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        feature.type === 'left_corner' ? 'L' : 'R', 
        point.x, 
        point.y + 3
      );
    });

    // Draw current driver positions
    Object.entries(realtimePositions).forEach(([driverNumber, position]) => {
      if (position.ageMs && position.ageMs > 10000) return; // Skip stale positions

      const point = transform(position.x, position.y);
      
      // Driver circle
      ctx.beginPath();
      ctx.fillStyle = '#FFD700'; // Gold color for active drivers
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.arc(point.x, point.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      
      // Driver number
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(driverNumber, point.x, point.y + 3);
    });

    // Draw legend
    drawLegend(ctx, canvas.width, canvas.height);
  }, [trackData, realtimePositions]);

  const drawLegend = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const legendX = 20;
    const legendY = height - 120;
    
    // Legend background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(legendX - 10, legendY - 10, 180, 100);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Track Legend', legendX, legendY);
    
    // Legend items
    const items = [
      { color: '#4CAF50', text: 'Straight', width: 20 },
      { color: '#FF9800', text: 'Slight Corner', width: 20 },
      { color: '#F44336', text: 'Sharp Corner', width: 20 },
      { color: '#FFD700', text: 'Driver Position', type: 'circle' }
    ];
    
    items.forEach((item, index) => {
      const y = legendY + 20 + index * 15;
      
      if (item.type === 'circle') {
        ctx.beginPath();
        ctx.fillStyle = item.color;
        ctx.arc(legendX + 10, y - 3, 5, 0, 2 * Math.PI);
        ctx.fill();
      } else {
        ctx.fillStyle = item.color;
        ctx.fillRect(legendX, y - 7, item.width || 15, 4);
      }
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px Arial';
      ctx.fillText(item.text, legendX + 25, y);
    });
  };

  // Animation loop
  useEffect(() => {
    const animate = () => {
      drawTrack();
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [drawTrack]);

  if (loading) {
    return (
      <div className="track-map-container">
        <div className="track-map-loading">
          <div className="loading-spinner"></div>
          <p>Loading track data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="track-map-container">
        <div className="track-map-error">
          <h3>Error loading track data</h3>
          <p>{error}</p>
          <button onClick={fetchTrackData} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="track-map-container">
      <div className="track-map-header">
        <h2>F1 Track Map</h2>
        <div className="track-map-stats">
          {stats && (
            <>
              <div className="stat-item">
                <span className="stat-label">Track Points:</span>
                <span className="stat-value">{stats.trackCoordinates}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Active Drivers:</span>
                <span className="stat-value">{stats.activeDrivers}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Data Quality:</span>
                <span className={`stat-value ${
                  stats.dataQuality.excellent ? 'excellent' :
                  stats.dataQuality.sufficient ? 'sufficient' : 'insufficient'
                }`}>
                  {stats.dataQuality.excellent ? 'Excellent' :
                   stats.dataQuality.sufficient ? 'Sufficient' : 'Insufficient'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="track-map-content">
        {trackData?.trackMap ? (
          <>
            <canvas 
              ref={canvasRef} 
              width={800} 
              height={600}
              className="track-canvas"
            />
            <div className="track-info">
              <h3>{trackData.trackMap.trackName}</h3>
              <p>Track Length: {trackData.trackMap.metadata.trackLength}m</p>
              <p>Data Points: {trackData.trackMap.metadata.coordinateCount}</p>
              <p>Generated: {new Date(trackData.trackMap.metadata.generatedAt).toLocaleString()}</p>
            </div>
          </>
        ) : (
          <div className="no-track-data">
            <h3>No Track Data Available</h3>
            <p>Track mapping requires live F1 session data with position information.</p>
            <div className="track-requirements">
              <h4>Requirements for track mapping:</h4>
              <ul>
                <li>Active F1 session (Practice, Qualifying, or Race)</li>
                <li>Position data from F1 live timing API</li>
                <li>Multiple cars generating coordinate data</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="realtime-positions">
        <h3>Real-time Driver Positions</h3>
        {Object.keys(realtimePositions).length > 0 ? (
          <div className="positions-grid">
            {Object.entries(realtimePositions).map(([driverNumber, position]) => (
              <div key={driverNumber} className="position-card">
                <div className="driver-number">#{driverNumber}</div>
                <div className="position-coords">
                  <div>X: {position.x.toFixed(1)}</div>
                  <div>Y: {position.y.toFixed(1)}</div>
                  <div>Z: {position.z.toFixed(1)}</div>
                </div>
                <div className="position-age">
                  {position.ageMs ? `${(position.ageMs / 1000).toFixed(1)}s ago` : 'Live'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="no-positions">No real-time position data available</p>
        )}
      </div>
    </div>
  );
};