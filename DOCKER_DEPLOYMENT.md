# Docker Deployment Guide

## Quick Start

1. **Install Docker and Docker Compose**
   - Docker: https://docs.docker.com/get-docker/
   - Docker Compose: https://docs.docker.com/compose/install/

2. **Choose your deployment mode:**

   **With Redis (recommended for production):**
   ```bash
   ./deploy.sh
   ```

   **Without Redis (simpler, memory-only caching):**
   ```bash
   docker-compose -f docker-compose.no-redis.yml up --build -d
   ```

3. **Access your application:**
   - Frontend: http://localhost
   - Backend API: http://localhost:3001
   - Redis (if enabled): localhost:6379

## Manual Deployment

### Build and Run
```bash
# Build and start all services
docker-compose up --build -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

### Stop Services
```bash
docker-compose down
```

## Production Deployment

### For your domains (f1live.myfoodpal.food and f1backend.myfoodpal.food):

1. **IMPORTANT: Update JWT secrets** in `backend/.env.production`:
   ```bash
   # Generate secure random secrets (32+ characters each)
   JWT_SECRET=your-actual-secret-key-here
   JWT_REFRESH_SECRET=your-actual-refresh-secret-here
   ```

2. **Update other environment variables** in `backend/.env.production` if needed
3. **Deploy on your server:**
   ```bash
   # Copy files to your server
   scp -r . user@your-server:/path/to/f1-app/

   # On your server
   cd /path/to/f1-app/
   ./deploy.sh
   ```

3. **Configure reverse proxy** (nginx/Apache) to route:
   - `f1live.myfoodpal.food` → `localhost:80` (frontend)
   - `f1backend.myfoodpal.food` → `localhost:3001` (backend)

### Example Nginx Configuration

```nginx
# Frontend
server {
    listen 80;
    server_name f1live.myfoodpal.food;
    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Backend
server {
    listen 80;
    server_name f1backend.myfoodpal.food;
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Container Details

### Frontend Container
- **Base**: nginx:alpine
- **Port**: 80
- **Features**: Optimized React build, gzip compression, proper caching headers

### Backend Container
- **Base**: node:20-alpine
- **Port**: 3001
- **Features**: Non-root user, health checks, signal handling
- **Volumes**: 
  - `./backend/data` → `/app/data` (database persistence)
  - `./backend/logs` → `/app/logs` (log persistence)

## Useful Commands

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f f1-frontend
docker-compose logs -f f1-backend

# Restart a service
docker-compose restart f1-backend

# Update and redeploy
git pull
docker-compose up --build -d

# Clean up (removes containers, networks)
docker-compose down

# Clean up everything including volumes
docker-compose down -v

# Check resource usage
docker stats
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: 
   - Change ports in `docker-compose.yml` if 80 or 3001 are in use

2. **Permission errors**:
   ```bash
   sudo chown -R $USER:$USER ./backend/data ./backend/logs
   ```

3. **Build failures**:
   ```bash
   # Clean build
   docker-compose down
   docker system prune -a
   docker-compose up --build
   ```

4. **Check container health**:
   ```bash
   docker-compose ps
   ```

### Environment Variables

Frontend (`.env.production`):
- `REACT_APP_WEBSOCKET_URL`: WebSocket connection URL
- `REACT_APP_API_BASE_URL`: Backend API base URL

Backend:
- `NODE_ENV`: Set to 'production'
- `PORT`: Backend port (default 3001)

## Updates

To update the application:
1. Pull latest changes: `git pull`
2. Rebuild and restart: `docker-compose up --build -d`

## Backup

Important files to backup:
- `./backend/data/` - Database files
- `./backend/logs/` - Application logs
- Configuration files (`.env`, `docker-compose.yml`)