#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🏎️  Setting up F1 Live Data Backend...\n');

// Create logs directory
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log('✅ Created logs directory');
} else {
  console.log('✅ Logs directory already exists');
}

// Check if .env exists
const envFile = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envFile)) {
  console.log('⚠️  .env file not found');
  console.log('   Please copy .env.example to .env and configure your settings');
} else {
  console.log('✅ Environment configuration found');
}

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion >= 18) {
  console.log(`✅ Node.js version ${nodeVersion} is compatible`);
} else {
  console.log(`⚠️  Node.js version ${nodeVersion} detected`);
  console.log('   This application requires Node.js 18.0.0 or higher');
  console.log('   Please update your Node.js installation');
}

console.log('\n🚀 Setup complete!');
console.log('\nNext steps:');
console.log('1. Install dependencies: npm install');
console.log('2. Configure .env file if needed');
console.log('3. Start development server: npm run dev');
console.log('4. Visit http://localhost:3001/health to verify setup');

console.log('\n📚 Available commands:');
console.log('  npm run dev     - Start development server with auto-reload');
console.log('  npm start       - Start production server');
console.log('  npm run lint    - Run code quality checks');
console.log('  npm run lint:fix - Fix code quality issues');

console.log('\n📡 API Endpoints:');
console.log('  GET  /health              - Health check');
console.log('  GET  /api/session/current - Current session info');
console.log('  GET  /api/drivers         - Driver list');
console.log('  GET  /api/track           - Available tracks');

console.log('\n🔗 WebSocket Connection:');
console.log('  Connect to: ws://localhost:3001');
console.log('  Events: connection, feed:*, timing:update, driver:update');

console.log('\n📖 For full documentation, see README.md\n');