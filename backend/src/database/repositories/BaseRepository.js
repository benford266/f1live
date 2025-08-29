/**
 * Base Repository Class
 * Provides common database operations for all repositories
 */

const logger = require('../../utils/logger');

class BaseRepository {
  constructor(database, tableName) {
    if (!database || !database.isReady()) {
      throw new Error('Valid database instance required');
    }
    
    this.db = database;
    this.tableName = tableName;
    this.connection = database.getConnection();
    
    // Prepare common statements
    this.prepareStatements();
  }

  /**
   * Prepare commonly used SQL statements
   */
  prepareStatements() {
    try {
      // Basic CRUD operations
      this.insertStmt = null;
      this.updateStmt = null;
      this.deleteStmt = null;
      this.findByIdStmt = this.connection.prepare(
        `SELECT * FROM ${this.tableName} WHERE id = ?`
      );
      this.findAllStmt = this.connection.prepare(
        `SELECT * FROM ${this.tableName} ORDER BY created_at DESC`
      );
      this.countStmt = this.connection.prepare(
        `SELECT COUNT(*) as count FROM ${this.tableName}`
      );

    } catch (error) {
      logger.error(`Error preparing statements for ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Create a new record
   * @param {Object} data - Record data
   * @returns {Object} Created record with ID
   */
  async create(data) {
    try {
      if (!this.insertStmt) {
        this.prepareInsertStatement(data);
      }

      // Extract values in the same order as columns for proper parameter binding
      const columns = Object.keys(data);
      const values = columns.map((col, index) => {
        const value = data[col];
        try {
          // Convert undefined to null
          if (value === undefined) {
            return null;
          }
          // Ensure all values are valid SQLite types
          if (typeof value === 'function' || typeof value === 'symbol') {
            return null;
          }
          // Handle complex objects by JSON stringifying them
          if (value !== null && typeof value === 'object') {
            return JSON.stringify(value);
          }
          // Ensure strings aren't double-quoted
          if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
            try {
              return JSON.parse(value);
            } catch {
              return value;
            }
          }
          return value;
        } catch (error) {
          logger.error(`Error processing column ${col} at index ${index}:`, { value, error });
          return null;
        }
      });
      
      try {
        const result = this.insertStmt.run(...values);
        
        if (result.changes === 0) {
          throw new Error(`Failed to insert record into ${this.tableName}`);
        }

        const created = this.findByIdStmt.get(result.lastInsertRowid);
        logger.debug(`Created record in ${this.tableName} with ID: ${result.lastInsertRowid}`);
        
        return created;
      } catch (error) {
        logger.error(`SQL execution error for table ${this.tableName}:`, { 
          columns, 
          values: values.map((v, i) => ({ col: columns[i], value: v, type: typeof v })),
          error 
        });
        throw error;
      }

    } catch (error) {
      logger.error(`Error creating record in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Find record by ID
   * @param {number} id - Record ID
   * @returns {Object|null} Found record or null
   */
  async findById(id) {
    try {
      const record = this.findByIdStmt.get(id);
      return record || null;
    } catch (error) {
      logger.error(`Error finding record by ID in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Update record by ID
   * @param {number} id - Record ID
   * @param {Object} data - Update data
   * @returns {Object|null} Updated record or null
   */
  async update(id, data) {
    try {
      if (!this.updateStmt) {
        this.prepareUpdateStatement(data);
      }

      // Extract values in the same order as columns for proper parameter binding
      const columns = Object.keys(data);
      const values = columns.map(col => data[col]);
      values.push(id); // Add id as the last parameter for WHERE clause
      
      const result = this.updateStmt.run(...values);
      
      if (result.changes === 0) {
        return null;
      }

      const updated = this.findByIdStmt.get(id);
      logger.debug(`Updated record in ${this.tableName} with ID: ${id}`);
      
      return updated;

    } catch (error) {
      logger.error(`Error updating record in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Delete record by ID
   * @param {number} id - Record ID
   * @returns {boolean} True if deleted, false if not found
   */
  async delete(id) {
    try {
      if (!this.deleteStmt) {
        this.deleteStmt = this.connection.prepare(
          `DELETE FROM ${this.tableName} WHERE id = ?`
        );
      }

      const result = this.deleteStmt.run(id);
      const deleted = result.changes > 0;
      
      if (deleted) {
        logger.debug(`Deleted record from ${this.tableName} with ID: ${id}`);
      }
      
      return deleted;

    } catch (error) {
      logger.error(`Error deleting record from ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Find all records
   * @param {Object} options - Query options
   * @param {number} options.limit - Limit results
   * @param {number} options.offset - Offset for pagination
   * @returns {Array} Array of records
   */
  async findAll(options = {}) {
    try {
      let sql = `SELECT * FROM ${this.tableName} ORDER BY created_at DESC`;
      const params = [];

      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
        
        if (options.offset) {
          sql += ' OFFSET ?';
          params.push(options.offset);
        }
      }

      const stmt = this.connection.prepare(sql);
      const records = stmt.all(...params);
      
      return records;

    } catch (error) {
      logger.error(`Error finding all records in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Count total records
   * @param {Object} conditions - Optional where conditions
   * @returns {number} Total count
   */
  async count(conditions = {}) {
    try {
      let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
      const params = [];

      if (Object.keys(conditions).length > 0) {
        const whereClause = Object.keys(conditions).map(key => `${key} = ?`).join(' AND ');
        sql += ` WHERE ${whereClause}`;
        params.push(...Object.values(conditions));
      }

      const stmt = this.connection.prepare(sql);
      const result = stmt.get(...params);
      
      return result.count;

    } catch (error) {
      logger.error(`Error counting records in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Execute custom query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Array|Object} Query results
   */
  async query(sql, params = []) {
    try {
      const stmt = this.connection.prepare(sql);
      
      // Determine if it's a SELECT query
      if (sql.trim().toLowerCase().startsWith('select')) {
        return stmt.all(...params);
      } else {
        return stmt.run(...params);
      }

    } catch (error) {
      logger.error(`Error executing custom query in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Prepare INSERT statement dynamically
   * @param {Object} data - Sample data to determine columns
   */
  prepareInsertStatement(data) {
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    
    this.insertStmt = this.connection.prepare(sql);
  }

  /**
   * Prepare UPDATE statement dynamically
   * @param {Object} data - Sample data to determine columns
   */
  prepareUpdateStatement(data) {
    const columns = Object.keys(data);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    
    this.updateStmt = this.connection.prepare(sql);
  }

  /**
   * Begin transaction
   * @returns {Function} Transaction function
   */
  transaction() {
    return this.connection.transaction.bind(this.connection);
  }

  /**
   * Execute operations within a transaction
   * @param {Function} operations - Function containing operations to execute
   * @returns {any} Result of operations
   */
  async executeTransaction(operations) {
    try {
      const transaction = this.connection.transaction(operations);
      return transaction();
    } catch (error) {
      logger.error(`Transaction error in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Find records with custom conditions
   * @param {Object} conditions - Where conditions
   * @param {Object} options - Query options (limit, offset, orderBy)
   * @returns {Array} Matching records
   */
  async findWhere(conditions, options = {}) {
    try {
      let sql = `SELECT * FROM ${this.tableName}`;
      const params = [];

      // Add WHERE clause
      if (Object.keys(conditions).length > 0) {
        const whereClause = Object.keys(conditions).map(key => `${key} = ?`).join(' AND ');
        sql += ` WHERE ${whereClause}`;
        params.push(...Object.values(conditions));
      }

      // Add ORDER BY
      if (options.orderBy) {
        sql += ` ORDER BY ${options.orderBy}`;
      } else {
        sql += ` ORDER BY created_at DESC`;
      }

      // Add LIMIT and OFFSET
      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
        
        if (options.offset) {
          sql += ' OFFSET ?';
          params.push(options.offset);
        }
      }

      const stmt = this.connection.prepare(sql);
      return stmt.all(...params);

    } catch (error) {
      logger.error(`Error finding records with conditions in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Find one record with conditions
   * @param {Object} conditions - Where conditions
   * @returns {Object|null} Found record or null
   */
  async findOne(conditions) {
    try {
      const results = await this.findWhere(conditions, { limit: 1 });
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      logger.error(`Error finding one record in ${this.tableName}:`, error);
      throw error;
    }
  }
}

module.exports = BaseRepository;