# F1 Live Data Visualization Frontend

A modern React application for visualizing real-time Formula 1 race data with WebSocket connectivity.

## Features

- **Real-time Data Updates**: Live connection to F1 data backend via WebSocket
- **Live Data Table**: Driver positions, lap times, gaps, and telemetry
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Connection Management**: Automatic reconnection with status indicators
- **Race Status Display**: Session type, flags, lap counter, and timing information
- **Modern UI**: Clean, professional interface optimized for race viewing

## Technology Stack

- **React 18** with TypeScript
- **Socket.IO Client** for real-time WebSocket communication
- **Axios** for HTTP requests
- **CSS3** with modern responsive design
- **React Hooks** for state management

## Quick Start

### Prerequisites

- Node.js 16+ and npm
- F1 data backend server running on port 3001

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure WebSocket URL (optional):
   - Edit `.env` file to change `REACT_APP_WEBSOCKET_URL` if your backend runs on a different port

3. Start the development server:
```bash
npm start
```

The application will open at `http://localhost:3000` and automatically connect to the WebSocket server.

### Available Scripts

- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App (use with caution)

## Architecture

### Components

- **App**: Main application component with WebSocket integration
- **LiveDataTable**: Real-time driver standings and telemetry display
- **RaceHeader**: Session information and race status
- **ConnectionStatus**: WebSocket connection status and controls

### Hooks

- **useWebSocket**: Manages WebSocket connection and real-time data updates

### WebSocket Events

The application handles these WebSocket events from the backend:

- `driver:update` - Individual driver data updates
- `drivers:all` - Complete driver list refresh
- `race:status` - Race session status updates
- `lap:completed` - Lap completion notifications

## Configuration

### Environment Variables

- `REACT_APP_WEBSOCKET_URL` - Backend WebSocket server URL (default: http://localhost:3001)

### Backend Integration

The frontend expects a WebSocket server that emits the following data structures:

```typescript
interface Driver {
  id: string;
  name: string;
  number: number;
  position: number;
  team: string;
  currentLapTime?: string;
  bestLapTime?: string;
  gapToLeader?: string;
  completedLaps: number;
  // ... additional telemetry fields
}

interface RaceStatus {
  sessionType: 'practice1' | 'practice2' | 'practice3' | 'qualifying' | 'race';
  sessionStatus: 'inactive' | 'active' | 'finished' | 'suspended';
  flagStatus?: 'green' | 'yellow' | 'red' | 'checkered' | 'safety_car';
  // ... additional race information
}
```

## Performance

- Optimized for smooth real-time updates without flickering
- Efficient React rendering with proper dependency management
- Responsive design with CSS Grid and Flexbox
- Automatic connection recovery and error handling

## Browser Support

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## Development

### Project Structure

```
src/
├── components/          # React components
│   ├── LiveDataTable.tsx
│   ├── RaceHeader.tsx
│   └── ConnectionStatus.tsx
├── hooks/              # Custom React hooks
│   └── useWebSocket.ts
├── types/              # TypeScript type definitions
│   └── f1Data.ts
├── styles/             # CSS stylesheets
│   ├── App.css
│   └── index.css
├── App.tsx             # Main App component
└── index.tsx           # Application entry point
```

### Adding New Features

1. Update TypeScript types in `src/types/f1Data.ts`
2. Modify WebSocket hook in `src/hooks/useWebSocket.ts` for new events
3. Create or update components in `src/components/`
4. Add responsive styles in `src/styles/`

## Troubleshooting

### Connection Issues

- Verify backend server is running on the configured port
- Check browser console for WebSocket connection errors
- Ensure firewall allows WebSocket connections
- Try the retry button in the connection status indicator

### Performance Issues

- Check browser developer tools for rendering performance
- Verify WebSocket data frequency is not overwhelming the UI
- Consider data throttling if updates are too frequent

## License

Private project for F1 data visualization.