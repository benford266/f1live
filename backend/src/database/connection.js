/**
 * Database Connection Manager
 * Handles SQLite database connection, initialization, and management
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { DATABASE_SCHEMA, DATABASE_INDEXES, DATABASE_TRIGGERS } = require('./schema');

class DatabaseConnection {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.dbPath = null;
  }

  /**
   * Initialize the database connection
   * @param {Object} options - Database configuration options
   * @param {string} options.path - Database file path
   * @param {boolean} options.verbose - Enable verbose logging
   * @param {boolean} options.memory - Use in-memory database for testing
   */
  async initialize(options = {}) {
    try {
      const {
        path: dbPath = path.join(process.cwd(), 'data', 'f1_timing.db'),
        verbose = false,
        memory = false
      } = options;

      logger.info('Initializing F1 database connection...');

      // Create data directory if it doesn't exist
      if (!memory) {
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
          logger.info(`Created database directory: ${dbDir}`);
        }
        this.dbPath = dbPath;
      }

      // Create database connection
      this.db = new Database(memory ? ':memory:' : dbPath, {
        verbose: verbose ? logger.debug : null,
        fileMustExist: false
      });

      // Configure database for better performance
      this.configureDatabase();

      // Initialize schema
      await this.initializeSchema();

      this.isInitialized = true;
      logger.info(`Database initialized successfully${memory ? ' (in-memory)' : ` at ${dbPath}`}`);

    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Configure database settings for optimal performance
   */
  configureDatabase() {
    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL');
    
    // Set synchronous mode to NORMAL for better performance
    this.db.pragma('synchronous = NORMAL');
    
    // Increase cache size (negative value = KB)
    this.db.pragma('cache_size = -64000'); // 64MB cache
    
    // Enable foreign key constraints
    this.db.pragma('foreign_keys = ON');
    
    // Set temp store to memory
    this.db.pragma('temp_store = memory');
    
    // Optimize for fast writes
    this.db.pragma('optimize');

    logger.debug('Database configuration applied');
  }

  /**
   * Initialize database schema, indexes, and triggers
   */
  async initializeSchema() {
    try {
      logger.info('Initializing database schema...');

      // Create all tables
      for (const [tableName, createSQL] of Object.entries(DATABASE_SCHEMA)) {
        this.db.exec(createSQL);
        logger.debug(`Created table: ${tableName}`);
      }

      // Create all indexes
      for (const indexSQL of DATABASE_INDEXES) {
        this.db.exec(indexSQL);
      }
      logger.debug(`Created ${DATABASE_INDEXES.length} indexes`);

      // Create all triggers
      for (const triggerSQL of DATABASE_TRIGGERS) {
        this.db.exec(triggerSQL);
      }
      logger.debug(`Created ${DATABASE_TRIGGERS.length} triggers`);

      logger.info('Database schema initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize database schema:', error);
      throw error;
    }
  }

  /**
   * Get the database connection instance
   * @returns {Database} Better-sqlite3 database instance
   */
  getConnection() {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Check if database is initialized
   * @returns {boolean} True if database is ready
   */
  isReady() {
    return this.isInitialized && this.db && this.db.open;
  }

  /**
   * Execute a transaction safely
   * @param {Function} callback - Function to execute within transaction
   * @returns {any} Result of the callback function
   */
  transaction(callback) {
    if (!this.isReady()) {
      throw new Error('Database not ready');
    }

    const transaction = this.db.transaction(callback);
    return transaction();
  }

  /**
   * Prepare a statement for reuse
   * @param {string} sql - SQL statement to prepare
   * @returns {Statement} Prepared statement
   */
  prepare(sql) {
    if (!this.isReady()) {
      throw new Error('Database not ready');
    }

    return this.db.prepare(sql);
  }

  /**
   * Execute SQL directly
   * @param {string} sql - SQL to execute
   * @returns {RunResult} Execution result
   */
  exec(sql) {
    if (!this.isReady()) {
      throw new Error('Database not ready');
    }

    return this.db.exec(sql);
  }

  /**
   * Get database statistics
   * @returns {Object} Database statistics
   */
  getStats() {
    if (!this.isReady()) {
      return { ready: false };
    }

    try {
      const stats = {
        ready: true,
        path: this.dbPath,
        memory: this.db.memory,
        readonly: this.db.readonly,
        open: this.db.open,
        inTransaction: this.db.inTransaction,
        pragmas: {
          journal_mode: this.db.pragma('journal_mode', { simple: true }),
          synchronous: this.db.pragma('synchronous', { simple: true }),
          cache_size: this.db.pragma('cache_size', { simple: true }),
          foreign_keys: this.db.pragma('foreign_keys', { simple: true })
        }
      };

      // Get table counts
      const tables = [
        'sessions', 'drivers', 'timing_data', 'car_telemetry',
        'position_data', 'weather_data', 'track_status',
        'race_control_messages', 'lap_times', 'generic_feed_data'
      ];

      stats.tables = {};
      for (const table of tables) {
        try {
          const result = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
          stats.tables[table] = result.count;
        } catch (error) {
          stats.tables[table] = 'error';
        }
      }

      return stats;
    } catch (error) {
      logger.error('Error getting database stats:', error);
      return { ready: true, error: error.message };
    }
  }

  /**
   * Backup the database to a file
   * @param {string} backupPath - Path for backup file
   */
  async backup(backupPath) {
    if (!this.isReady()) {
      throw new Error('Database not ready');
    }

    try {
      const backup = this.db.backup(backupPath);
      
      // Wait for backup to complete
      return new Promise((resolve, reject) => {
        backup.on('progress', ({ totalPages, remainingPages }) => {
          logger.debug(`Backup progress: ${totalPages - remainingPages}/${totalPages} pages`);
        });

        backup.on('done', () => {
          logger.info(`Database backup completed: ${backupPath}`);
          resolve(backupPath);
        });

        backup.on('error', (error) => {
          logger.error('Database backup failed:', error);
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Failed to create database backup:', error);
      throw error;
    }
  }

  /**
   * Vacuum the database to reclaim space
   */
  vacuum() {
    if (!this.isReady()) {
      throw new Error('Database not ready');
    }

    try {
      logger.info('Vacuuming database...');
      this.db.exec('VACUUM');
      logger.info('Database vacuum completed');
    } catch (error) {
      logger.error('Database vacuum failed:', error);
      throw error;
    }
  }

  /**
   * Optimize the database
   */
  optimize() {
    if (!this.isReady()) {
      throw new Error('Database not ready');
    }

    try {
      logger.debug('Optimizing database...');
      this.db.exec('PRAGMA optimize');
      logger.debug('Database optimization completed');
    } catch (error) {
      logger.error('Database optimization failed:', error);
      throw error;
    }
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db && this.db.open) {
      try {
        // Run optimize before closing
        this.optimize();
        
        this.db.close();
        logger.info('Database connection closed');
      } catch (error) {
        logger.error('Error closing database:', error);
      }
    }

    this.db = null;
    this.isInitialized = false;
    this.dbPath = null;
  }

  /**
   * Handle graceful shutdown
   */
  async gracefulShutdown() {
    if (this.isReady()) {
      logger.info('Performing graceful database shutdown...');
      
      try {
        // Wait for any pending transactions
        if (this.db.inTransaction) {
          logger.warn('Database has pending transaction during shutdown');
        }
        
        // Optimize and close
        this.optimize();
        this.close();
        
        logger.info('Database shutdown completed');
      } catch (error) {
        logger.error('Error during database shutdown:', error);
        throw error;
      }
    }
  }
}

// Singleton instance
let databaseInstance = null;

/**
 * Get the singleton database instance
 * @returns {DatabaseConnection} Database connection instance
 */
function getDatabaseInstance() {
  if (!databaseInstance) {
    databaseInstance = new DatabaseConnection();
  }
  return databaseInstance;
}

/**
 * Initialize the database with configuration
 * @param {Object} options - Database configuration options
 */
async function initializeDatabase(options = {}) {
  const db = getDatabaseInstance();
  await db.initialize(options);
  return db;
}

module.exports = {
  DatabaseConnection,
  getDatabaseInstance,
  initializeDatabase
};