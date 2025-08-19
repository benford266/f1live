module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Root directories for tests and modules
  rootDir: './',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.spec.js',
    '**/?(*.)(test|spec).js'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  
  // Coverage configuration
  collectCoverage: false, // Enable via CLI flag
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js', // Exclude main server file
    '!src/config/**', // Exclude config files
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 75,
      statements: 75
    }
  },
  
  // Module handling
  moduleFileExtensions: ['js', 'json'],
  moduleDirectories: ['node_modules', 'src'],
  
  // Transform configuration
  transform: {},
  transformIgnorePatterns: [
    'node_modules/(?!(socket.io|socket.io-client)/)'
  ],
  
  // Test timeout
  testTimeout: 10000,
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Verbose output
  verbose: true,
  
  // Error handling
  bail: false,
  maxWorkers: '50%',
  
  // Reporter configuration
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-results',
        outputName: 'junit.xml'
      }
    ]
  ],
  
  // Global variables
  globals: {
    NODE_ENV: 'test'
  }
};