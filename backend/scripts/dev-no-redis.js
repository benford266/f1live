#!/usr/bin/env node

/**
 * Development startup script that explicitly disables Redis
 * Use this when you want to run the backend without Redis dependency
 */

process.env.NODE_ENV = 'development';
process.env.REDIS_FAILOVER_ENABLED = 'false';
process.env.REDIS_FALLBACK_TO_MEMORY = 'true';

console.log('🚀 Starting F1 Backend Server in development mode (Redis disabled)');
console.log('📝 Cache: Memory-only mode (no Redis required)');
console.log('🔧 Environment: development');
console.log('');

const F1BackendServer = require('../src/server');

const server = new F1BackendServer();
server.start();