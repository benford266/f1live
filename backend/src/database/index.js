/**
 * Database Module Entry Point
 * Exports database components and initialization functions
 */

const { initializeDatabase, getDatabaseInstance } = require('./connection');
const { getDatabaseService } = require('./service');
const logger = require('../utils/logger');

// Export all database components
module.exports = {
  // Connection management
  initializeDatabase,
  getDatabaseInstance,
  
  // Service layer
  getDatabaseService,
  
  // Repository classes (for direct use if needed)
  SessionRepository: require('./repositories/SessionRepository'),
  DriverRepository: require('./repositories/DriverRepository'),
  TimingRepository: require('./repositories/TimingRepository'),
  TelemetryRepository: require('./repositories/TelemetryRepository'),
  PositionRepository: require('./repositories/PositionRepository'),
  WeatherRepository: require('./repositories/WeatherRepository'),
  TrackStatusRepository: require('./repositories/TrackStatusRepository'),
  RaceControlRepository: require('./repositories/RaceControlRepository'),
  LapTimeRepository: require('./repositories/LapTimeRepository'),
  GenericFeedRepository: require('./repositories/GenericFeedRepository'),
  
  // Schema
  schema: require('./schema'),
  
  /**
   * Initialize the complete database system
   * @param {Object} options - Database configuration
   * @returns {Object} Initialized database service
   */
  async initialize(options = {}) {
    try {
      logger.info('Initializing F1 database system...');
      
      // Initialize database connection
      const db = await initializeDatabase(options);
      
      // Initialize database service
      const service = getDatabaseService();
      await service.initialize();
      
      logger.info('F1 database system initialized successfully');
      
      return {
        db,
        service,
        connection: db.getConnection()
      };
      
    } catch (error) {
      logger.error('Failed to initialize F1 database system:', error);
      throw error;
    }
  },
  
  /**
   * Get database system status
   * @returns {Object} System status
   */
  getStatus() {
    try {
      const db = getDatabaseInstance();
      const service = getDatabaseService();
      
      return {
        database: {
          initialized: db.isReady(),
          stats: db.isReady() ? db.getStats() : null
        },
        service: {
          initialized: service.isInitialized,
          currentSession: service.getCurrentSession()
        },
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        database: { initialized: false, error: error.message },
        service: { initialized: false, error: error.message },
        timestamp: new Date().toISOString()
      };
    }
  },
  
  /**
   * Perform database maintenance
   * @param {Object} options - Maintenance options
   */
  async maintenance(options = {}) {
    try {
      const db = getDatabaseInstance();
      
      if (!db.isReady()) {
        throw new Error('Database not ready');
      }
      
      logger.info('Starting database maintenance...');
      
      // Vacuum if requested
      if (options.vacuum) {
        logger.info('Vacuuming database...');
        db.vacuum();
      }
      
      // Optimize
      logger.info('Optimizing database...');
      db.optimize();
      
      // Backup if path provided
      if (options.backupPath) {
        logger.info(`Creating backup at: ${options.backupPath}`);
        await db.backup(options.backupPath);
      }
      
      logger.info('Database maintenance completed');
      
    } catch (error) {
      logger.error('Database maintenance failed:', error);
      throw error;
    }
  }
};