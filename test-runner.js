#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const config = {
  backend: {
    dir: path.join(__dirname, 'backend'),
    commands: {
      unit: 'npm run test:unit',
      integration: 'npm run test:integration',
      performance: 'npm run test:performance',
      coverage: 'npm run test:coverage',
      all: 'npm test'
    }
  },
  frontend: {
    dir: __dirname,
    commands: {
      unit: 'npm run test:ci',
      coverage: 'npm run test:coverage',
      all: 'npm run test:ci'
    }
  },
  e2e: {
    dir: path.join(__dirname, 'e2e'),
    commands: {
      all: 'npm test',
      headed: 'npm run test:headed',
      debug: 'npm run test:debug',
      ui: 'npm run test:ui'
    }
  }
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message, color = colors.white) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(60)}`, colors.cyan);
  log(`  ${title}`, colors.cyan);
  log(`${'='.repeat(60)}`, colors.cyan);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

// Execute command in specified directory
function runCommand(command, cwd, options = {}) {
  return new Promise((resolve, reject) => {
    log(`Running: ${command}`, colors.blue);
    log(`Directory: ${cwd}`, colors.blue);
    
    const child = spawn(command, [], {
      cwd,
      shell: true,
      stdio: options.silent ? 'pipe' : 'inherit',
      env: { ...process.env, CI: 'true', NODE_ENV: 'test' }
    });

    let stdout = '';
    let stderr = '';

    if (options.silent) {
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject({ stdout, stderr, code, command, cwd });
      }
    });

    child.on('error', (error) => {
      reject({ error, command, cwd });
    });
  });
}

// Check if dependencies are installed
async function checkDependencies() {
  logSection('Checking Dependencies');
  
  const checks = [
    { dir: config.backend.dir, name: 'Backend' },
    { dir: config.frontend.dir, name: 'Frontend' },
    { dir: config.e2e.dir, name: 'E2E' }
  ];

  for (const check of checks) {
    const nodeModulesPath = path.join(check.dir, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      logSuccess(`${check.name} dependencies installed`);
    } else {
      logWarning(`${check.name} dependencies not found. Run 'npm install' in ${check.dir}`);
    }
  }
}

// Install dependencies
async function installDependencies() {
  logSection('Installing Dependencies');
  
  const installations = [
    { dir: config.backend.dir, name: 'Backend' },
    { dir: config.frontend.dir, name: 'Frontend' },
    { dir: config.e2e.dir, name: 'E2E' }
  ];

  for (const install of installations) {
    try {
      logInfo(`Installing ${install.name} dependencies...`);
      await runCommand('npm install', install.dir);
      logSuccess(`${install.name} dependencies installed`);
    } catch (error) {
      logError(`Failed to install ${install.name} dependencies`);
      throw error;
    }
  }
}

// Run backend tests
async function runBackendTests(testType = 'all') {
  logSection('Backend Tests');
  
  const command = config.backend.commands[testType];
  if (!command) {
    throw new Error(`Unknown backend test type: ${testType}`);
  }

  try {
    await runCommand(command, config.backend.dir);
    logSuccess('Backend tests passed');
    return true;
  } catch (error) {
    logError('Backend tests failed');
    if (error.stdout) log(error.stdout, colors.red);
    if (error.stderr) log(error.stderr, colors.red);
    return false;
  }
}

// Run frontend tests
async function runFrontendTests(testType = 'all') {
  logSection('Frontend Tests');
  
  const command = config.frontend.commands[testType];
  if (!command) {
    throw new Error(`Unknown frontend test type: ${testType}`);
  }

  try {
    await runCommand(command, config.frontend.dir);
    logSuccess('Frontend tests passed');
    return true;
  } catch (error) {
    logError('Frontend tests failed');
    if (error.stdout) log(error.stdout, colors.red);
    if (error.stderr) log(error.stderr, colors.red);
    return false;
  }
}

// Run E2E tests
async function runE2ETests(testType = 'all') {
  logSection('E2E Tests');
  
  const command = config.e2e.commands[testType];
  if (!command) {
    throw new Error(`Unknown E2E test type: ${testType}`);
  }

  try {
    // Install Playwright browsers if needed
    try {
      await runCommand('npx playwright install', config.e2e.dir, { silent: true });
    } catch (installError) {
      logWarning('Playwright browser installation failed, continuing...');
    }

    await runCommand(command, config.e2e.dir);
    logSuccess('E2E tests passed');
    return true;
  } catch (error) {
    logError('E2E tests failed');
    if (error.stdout) log(error.stdout, colors.red);
    if (error.stderr) log(error.stderr, colors.red);
    return false;
  }
}

// Generate test report
function generateReport(results) {
  logSection('Test Results Summary');
  
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  log(`Total test suites: ${total}`, colors.white);
  log(`Passed: ${passed}`, passed > 0 ? colors.green : colors.white);
  log(`Failed: ${failed}`, failed > 0 ? colors.red : colors.white);

  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    const color = result.passed ? colors.green : colors.red;
    log(`${icon} ${result.name}`, color);
  });

  if (failed === 0) {
    log('\n🎉 All tests passed!', colors.green);
  } else {
    log('\n💥 Some tests failed!', colors.red);
  }

  return failed === 0;
}

// Main execution function
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';
  const testType = args[1] || 'all';

  log('F1 Live Data Visualization - Test Runner', colors.magenta);
  log('=====================================', colors.magenta);

  try {
    if (command === 'install') {
      await installDependencies();
      return;
    }

    if (command === 'check') {
      await checkDependencies();
      return;
    }

    const results = [];

    if (command === 'all' || command === 'backend') {
      const backendPassed = await runBackendTests(testType);
      results.push({ name: 'Backend Tests', passed: backendPassed });
    }

    if (command === 'all' || command === 'frontend') {
      const frontendPassed = await runFrontendTests(testType);
      results.push({ name: 'Frontend Tests', passed: frontendPassed });
    }

    if (command === 'all' || command === 'e2e') {
      const e2ePassed = await runE2ETests(testType);
      results.push({ name: 'E2E Tests', passed: e2ePassed });
    }

    if (results.length > 0) {
      const allPassed = generateReport(results);
      process.exit(allPassed ? 0 : 1);
    } else {
      logError(`Unknown command: ${command}`);
      showUsage();
      process.exit(1);
    }

  } catch (error) {
    logError('Test execution failed');
    console.error(error);
    process.exit(1);
  }
}

function showUsage() {
  log('\nUsage:', colors.cyan);
  log('  node test-runner.js [command] [test-type]', colors.white);
  log('\nCommands:', colors.cyan);
  log('  all      - Run all test suites (default)', colors.white);
  log('  backend  - Run only backend tests', colors.white);
  log('  frontend - Run only frontend tests', colors.white);
  log('  e2e      - Run only E2E tests', colors.white);
  log('  install  - Install all dependencies', colors.white);
  log('  check    - Check if dependencies are installed', colors.white);
  log('\nTest Types:', colors.cyan);
  log('  all         - Run all tests (default)', colors.white);
  log('  unit        - Run unit tests only', colors.white);
  log('  integration - Run integration tests only', colors.white);
  log('  coverage    - Run tests with coverage', colors.white);
  log('\nExamples:', colors.cyan);
  log('  node test-runner.js', colors.white);
  log('  node test-runner.js backend unit', colors.white);
  log('  node test-runner.js frontend coverage', colors.white);
  log('  node test-runner.js e2e headed', colors.white);
}

// Handle process signals
process.on('SIGINT', () => {
  log('\n\nTest execution interrupted', colors.yellow);
  process.exit(130);
});

process.on('SIGTERM', () => {
  log('\n\nTest execution terminated', colors.yellow);
  process.exit(143);
});

// Show usage if help is requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage();
  process.exit(0);
}

// Run the main function
main().catch(error => {
  logError('Unexpected error occurred');
  console.error(error);
  process.exit(1);
});