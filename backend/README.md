# F1 Live Data Visualization - Backend

A robust Node.js backend service that connects to Formula 1's live timing API via SignalR and provides real-time data streaming through WebSocket connections, along with comprehensive RESTful API endpoints.

## Features

- **Real-time F1 Data Streaming**: Connects to Formula 1's official SignalR live timing API
- **WebSocket Server**: Provides real-time data to frontend clients via Socket.io
- **RESTful API**: Comprehensive endpoints for session, driver, and track data
- **Data Processing**: Intelligent data normalization and caching layer
- **Error Handling**: Robust error handling with automatic reconnection logic
- **Health Monitoring**: Built-in health checks and monitoring capabilities
- **Security**: CORS protection, rate limiting, and input validation
- **Logging**: Comprehensive logging with Winston

## Project Structure

```
backend/
├── src/
│   ├── config/           # Configuration management
│   ├── middleware/       # Express middleware (validation, error handling, logging)
│   ├── routes/           # API route handlers
│   │   ├── session.js    # Session-related endpoints
│   │   ├── drivers.js    # Driver-related endpoints
│   │   └── track.js      # Track-related endpoints
│   ├── services/         # Core services
│   │   ├── signalr/      # SignalR client service
│   │   ├── websocket/    # WebSocket server service
│   │   └── data/         # Data processing and caching
│   ├── utils/            # Utility functions
│   │   ├── logger.js     # Winston logging configuration
│   │   └── healthCheck.js # Health monitoring utilities
│   └── server.js         # Main server entry point
├── logs/                 # Application logs (created automatically)
├── package.json          # Dependencies and scripts
├── .env.example          # Environment variables template
├── .eslintrc.js          # ESLint configuration
├── nodemon.json          # Development server configuration
└── README.md             # This file
```

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager

### Installation

1. **Clone and navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Configuration**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Server Configuration
   PORT=3001
   NODE_ENV=development
   
   # F1 SignalR Configuration
   F1_SIGNALR_URL=https://livetiming.formula1.com/signalr
   F1_HUB_NAME=Streaming
   
   # CORS Configuration
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
   
   # Logging Configuration
   LOG_LEVEL=info
   LOG_FILE=logs/app.log
   ```

4. **Start the development server**:
   ```bash
   npm run dev
   ```

5. **Verify the server is running**:
   ```bash
   curl http://localhost:3001/health
   ```

## API Endpoints

### Health Check
- `GET /health` - Server health status and system information

### Session Endpoints
- `GET /api/session/current` - Current session information
- `GET /api/session/status` - Connection and session status
- `GET /api/session/history` - Session history with pagination
- `POST /api/session/subscribe` - Subscribe to specific data feeds (admin)

### Driver Endpoints
- `GET /api/drivers` - List of drivers with optional details and filtering
- `GET /api/drivers/:number` - Specific driver information and telemetry
- `GET /api/drivers/:number/telemetry` - Driver telemetry data over time
- `GET /api/drivers/standings` - Current session standings

### Track Endpoints
- `GET /api/track` - List of available tracks
- `GET /api/track/:id` - Specific track information and layout
- `GET /api/track/:id/layout` - Track layout coordinates and features
- `GET /api/track/:id/status` - Current track status and conditions
- `GET /api/track/:id/sectors` - Track sector information

## WebSocket Events

### Client to Server
- `subscribe` - Subscribe to specific data feeds
- `unsubscribe` - Unsubscribe from data feeds
- `ping` - Connection health check
- `request:session` - Request current session data
- `request:drivers` - Request current driver data
- `request:timing` - Request current timing data

### Server to Client
- `connection:established` - Connection confirmation with available feeds
- `connection:status` - SignalR connection status updates
- `feed:{feedName}` - Raw feed data (TimingData, CarData.z, etc.)
- `timing:update` - Processed timing data
- `driver:update` - Individual driver updates
- `session:update` - Session information changes
- `race:status` - Important race status changes (flags, safety car)
- `lap:completed` - Lap completion events
- `heartbeat` - Server heartbeat with connection count

## Development

### Available Scripts

```bash
# Development
npm run dev          # Start with nodemon (auto-restart)
npm start           # Start production server

# Code Quality
npm run lint        # Run ESLint
npm run lint:fix    # Fix ESLint issues automatically

# Testing
npm test           # Run tests (when implemented)
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment mode | `development` |
| `F1_SIGNALR_URL` | F1 SignalR endpoint | `https://livetiming.formula1.com/signalr` |
| `F1_HUB_NAME` | SignalR hub name | `Streaming` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:3000,http://localhost:3001` |
| `LOG_LEVEL` | Logging level | `info` |
| `LOG_FILE` | Log file path | `logs/app.log` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `900000` (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |

### Adding New Features

1. **New API Endpoints**: Add routes in the appropriate file under `src/routes/`
2. **Data Processing**: Extend the data processor in `src/services/data/processor.js`
3. **WebSocket Events**: Add event handlers in `src/services/websocket/index.js`
4. **Middleware**: Create new middleware in `src/middleware/`

### Error Handling

The backend uses a comprehensive error handling system:

- **Global Error Handler**: Catches and formats all errors consistently
- **Async Error Wrapper**: Automatically catches async errors in route handlers
- **Validation Errors**: Input validation with detailed error messages
- **SignalR Errors**: Specific handling for connection and data processing errors
- **WebSocket Errors**: Connection and message handling errors
- **Rate Limiting**: Automatic rate limiting with informative responses

### Logging

The application uses Winston for structured logging:

- **Console Output**: Colored output for development
- **File Logging**: Persistent logs in `logs/` directory
- **Log Levels**: Error, warn, info, debug
- **Request Logging**: All HTTP requests with timing and response codes
- **Error Context**: Detailed error information with request context

## Production Deployment

### Environment Setup

1. **Set production environment**:
   ```env
   NODE_ENV=production
   LOG_LEVEL=warn
   ```

2. **Security considerations**:
   - Configure proper CORS origins
   - Set up rate limiting appropriate for your traffic
   - Use environment-specific logging levels
   - Consider using a process manager like PM2

3. **Monitoring**:
   - Use the `/health` endpoint for health checks
   - Monitor log files for errors and performance issues
   - Set up alerts for connection failures

### Docker Support

A basic Dockerfile structure:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
EXPOSE 3001
CMD ["npm", "start"]
```

## Troubleshooting

### Common Issues

1. **SignalR Connection Failures**:
   - Check F1 session timing (API is only active during sessions)
   - Verify network connectivity to Formula1.com
   - Check logs for specific connection errors

2. **WebSocket Issues**:
   - Ensure CORS origins include your frontend URL
   - Check for firewall/proxy issues with WebSocket connections
   - Verify client-side WebSocket implementation

3. **High Memory Usage**:
   - Check data cache size and TTL settings
   - Monitor for memory leaks in long-running connections
   - Consider adjusting cache limits in production

4. **Performance Issues**:
   - Monitor event loop lag in health checks
   - Check database query performance (if using database)
   - Review log files for slow request warnings

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug
NODE_ENV=development
```

This provides detailed information about:
- SignalR connection attempts and data processing
- WebSocket connection management
- Data cache operations
- Request/response cycles

## Contributing

1. Follow the existing code style and ESLint rules
2. Add appropriate error handling and logging
3. Include input validation for new endpoints
4. Update documentation for new features
5. Test thoroughly in development environment

## License

This project is part of the F1 Live Data Visualization system and is intended for educational and development purposes.