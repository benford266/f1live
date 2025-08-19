# Redis Configuration for Development

This document explains how to handle Redis in development and provides solutions for running the F1 Backend without Redis.

## Problem

The backend server crashes with Redis connection errors when Redis is not running locally:
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

## Solutions

### Option 1: Disable Redis Entirely (Recommended for Development)

The backend has a robust multi-level cache system that automatically falls back to memory-only caching when Redis is unavailable.

#### Method 1A: Environment Variables (Easiest)

Edit your `.env` file and set:
```bash
REDIS_FAILOVER_ENABLED=false
```

Then start the server normally:
```bash
npm run dev
```

#### Method 1B: Development Scripts (Recommended)

Use the pre-configured development scripts that automatically disable Redis:

```bash
# Start once
npm run dev:no-redis

# Start with automatic restart on file changes
npm run dev:no-redis:watch
```

#### Method 1C: Manual Environment Override

```bash
REDIS_FAILOVER_ENABLED=false npm run dev
```

### Option 2: Install and Run Redis Locally

If you want to use Redis for development (for testing Redis-specific functionality):

#### macOS (Homebrew)
```bash
brew install redis
brew services start redis
```

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### Docker
```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

### Option 3: Custom Configuration

You can customize Redis behavior with these environment variables:

```bash
# Disable Redis entirely
REDIS_FAILOVER_ENABLED=false

# Enable graceful fallback to memory cache
REDIS_FALLBACK_TO_MEMORY=true

# Reduce connection timeout for faster failover
REDIS_CONNECT_TIMEOUT=2000
REDIS_COMMAND_TIMEOUT=1000

# Custom Redis connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
```

## Architecture

The backend uses a sophisticated multi-level cache system:

### L1 Cache (Memory)
- Fast in-memory storage using Node.js Map
- Always available, no external dependencies
- Automatic TTL and LRU eviction
- Typical capacity: 1000 items

### L2 Cache (Redis)
- Persistent, shared cache across instances
- Optional - graceful degradation when unavailable
- Compression and advanced features
- Production-ready scalability

### Failover Behavior
1. **Healthy State**: L1 + L2 (memory + Redis)
2. **Redis Down**: Automatic failover to L1 only (memory)
3. **Recovery**: Automatic restoration when Redis comes back online

## Development Modes

### Memory-Only Mode (Default when Redis disabled)
```
✅ No external dependencies
✅ Fast startup
✅ All features work
❌ Cache not shared between restarts
❌ No persistence
```

### Full Mode (Redis enabled)
```
✅ Persistent cache
✅ Shared between instances
✅ Production-like behavior
❌ Requires Redis installation
❌ Additional complexity
```

## Verification

### Check Current Cache Mode

Visit the health endpoint to see cache status:
```bash
curl http://localhost:3001/health | jq '.checks.cache'
```

### Cache Statistics

For admin endpoints (localhost only):
```bash
curl http://localhost:3001/admin/cache/stats
curl http://localhost:3001/admin/cache/health
```

## Troubleshooting

### Server Still Crashes
1. Ensure `.env` file has `REDIS_FAILOVER_ENABLED=false`
2. Try using the development scripts: `npm run dev:no-redis`
3. Check for multiple Redis configurations in environment

### Cache Performance in Development
- Memory-only cache is actually faster for development
- Use production Redis setup for performance testing
- Monitor cache hit rates via admin endpoints

### Production Deployment
- Always enable Redis in production: `REDIS_FAILOVER_ENABLED=true`
- Configure Redis clustering for high availability
- Monitor cache performance and failover events

## Best Practices

1. **Development**: Use memory-only cache (Redis disabled)
2. **Testing**: Test both modes (with/without Redis)
3. **Staging**: Use Redis to match production
4. **Production**: Use Redis with clustering and monitoring

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_FAILOVER_ENABLED` | `true` | Enable/disable Redis entirely |
| `REDIS_FALLBACK_TO_MEMORY` | `true` | Graceful fallback to memory cache |
| `REDIS_HOST` | `localhost` | Redis server host |
| `REDIS_PORT` | `6379` | Redis server port |
| `REDIS_CONNECT_TIMEOUT` | `10000` | Connection timeout (ms) |
| `REDIS_COMMAND_TIMEOUT` | `5000` | Command timeout (ms) |

For a complete list, see `/Users/ben/Code/f1test/backend/src/config/index.js`.