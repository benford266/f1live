/**
 * Session Repository
 * Handles database operations for F1 sessions
 */

const BaseRepository = require('./BaseRepository');

class SessionRepository extends BaseRepository {
  constructor(database) {
    super(database, 'sessions');
    this.prepareCustomStatements();
  }

  /**
   * Prepare session-specific SQL statements
   */
  prepareCustomStatements() {
    this.findByKeyStmt = this.connection.prepare(
      `SELECT * FROM sessions WHERE session_key = ?`
    );

    this.findByTrackStmt = this.connection.prepare(
      `SELECT * FROM sessions WHERE track_name = ? ORDER BY created_at DESC`
    );

    this.findByYearStmt = this.connection.prepare(
      `SELECT * FROM sessions WHERE year = ? ORDER BY created_at DESC`
    );

    this.findByTypeStmt = this.connection.prepare(
      `SELECT * FROM sessions WHERE session_type = ? ORDER BY created_at DESC`
    );

    this.findActiveSessionsStmt = this.connection.prepare(
      `SELECT * FROM sessions WHERE status IN ('Started', 'Active', 'Running') ORDER BY created_at DESC`
    );

    this.getSessionStatsStmt = this.connection.prepare(`
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(DISTINCT track_name) as unique_tracks,
        COUNT(DISTINCT year) as years_covered,
        MIN(start_time) as earliest_session,
        MAX(start_time) as latest_session
      FROM sessions
    `);
  }

  /**
   * Find session by session key
   * @param {string} sessionKey - Unique session key
   * @returns {Object|null} Session record or null
   */
  async findByKey(sessionKey) {
    try {
      const session = this.findByKeyStmt.get(sessionKey);
      return session || null;
    } catch (error) {
      throw new Error(`Error finding session by key: ${error.message}`);
    }
  }

  /**
   * Find sessions by track name
   * @param {string} trackName - Track name
   * @param {Object} options - Query options
   * @returns {Array} Array of session records
   */
  async findByTrack(trackName, options = {}) {
    try {
      let stmt = this.findByTrackStmt;
      let params = [trackName];

      if (options.limit) {
        const sql = `${stmt.source} LIMIT ? ${options.offset ? 'OFFSET ?' : ''}`;
        stmt = this.connection.prepare(sql);
        params.push(options.limit);
        if (options.offset) {
          params.push(options.offset);
        }
      }

      return stmt.all(...params);
    } catch (error) {
      throw new Error(`Error finding sessions by track: ${error.message}`);
    }
  }

  /**
   * Find sessions by year
   * @param {number} year - Year
   * @param {Object} options - Query options
   * @returns {Array} Array of session records
   */
  async findByYear(year, options = {}) {
    try {
      let stmt = this.findByYearStmt;
      let params = [year];

      if (options.limit) {
        const sql = `${stmt.source} LIMIT ? ${options.offset ? 'OFFSET ?' : ''}`;
        stmt = this.connection.prepare(sql);
        params.push(options.limit);
        if (options.offset) {
          params.push(options.offset);
        }
      }

      return stmt.all(...params);
    } catch (error) {
      throw new Error(`Error finding sessions by year: ${error.message}`);
    }
  }

  /**
   * Find sessions by type
   * @param {string} sessionType - Session type (Practice, Qualifying, Race, etc.)
   * @param {Object} options - Query options
   * @returns {Array} Array of session records
   */
  async findByType(sessionType, options = {}) {
    try {
      let stmt = this.findByTypeStmt;
      let params = [sessionType];

      if (options.limit) {
        const sql = `${stmt.source} LIMIT ? ${options.offset ? 'OFFSET ?' : ''}`;
        stmt = this.connection.prepare(sql);
        params.push(options.limit);
        if (options.offset) {
          params.push(options.offset);
        }
      }

      return stmt.all(...params);
    } catch (error) {
      throw new Error(`Error finding sessions by type: ${error.message}`);
    }
  }

  /**
   * Find currently active sessions
   * @returns {Array} Array of active session records
   */
  async findActiveSessions() {
    try {
      return this.findActiveSessionsStmt.all();
    } catch (error) {
      throw new Error(`Error finding active sessions: ${error.message}`);
    }
  }

  /**
   * Get session statistics
   * @returns {Object} Session statistics
   */
  async getStats() {
    try {
      return this.getSessionStatsStmt.get();
    } catch (error) {
      throw new Error(`Error getting session stats: ${error.message}`);
    }
  }

  /**
   * Find sessions with optional filters
   * @param {Object} filters - Filter options
   * @param {string} filters.track - Track name
   * @param {number} filters.year - Year
   * @param {string} filters.type - Session type
   * @param {string} filters.status - Session status
   * @param {Object} options - Query options
   * @returns {Array} Filtered session records
   */
  async findWithFilters(filters = {}, options = {}) {
    try {
      let sql = 'SELECT * FROM sessions';
      const conditions = [];
      const params = [];

      // Build WHERE clause
      if (filters.track) {
        conditions.push('track_name = ?');
        params.push(filters.track);
      }

      if (filters.year) {
        conditions.push('year = ?');
        params.push(filters.year);
      }

      if (filters.type) {
        conditions.push('session_type = ?');
        params.push(filters.type);
      }

      if (filters.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      // Add ordering
      sql += ' ORDER BY ';
      if (options.orderBy) {
        sql += options.orderBy;
      } else {
        sql += 'created_at DESC';
      }

      // Add pagination
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
      throw new Error(`Error finding sessions with filters: ${error.message}`);
    }
  }

  /**
   * Get unique track names
   * @returns {Array} Array of unique track names
   */
  async getUniqueTrackNames() {
    try {
      const stmt = this.connection.prepare(`
        SELECT DISTINCT track_name 
        FROM sessions 
        WHERE track_name IS NOT NULL 
        ORDER BY track_name
      `);
      
      const results = stmt.all();
      return results.map(row => row.track_name);
    } catch (error) {
      throw new Error(`Error getting unique track names: ${error.message}`);
    }
  }

  /**
   * Get session types for a specific track
   * @param {string} trackName - Track name
   * @returns {Array} Array of session types
   */
  async getSessionTypesForTrack(trackName) {
    try {
      const stmt = this.connection.prepare(`
        SELECT DISTINCT session_type 
        FROM sessions 
        WHERE track_name = ? AND session_type IS NOT NULL
        ORDER BY session_type
      `);
      
      const results = stmt.all(trackName);
      return results.map(row => row.session_type);
    } catch (error) {
      throw new Error(`Error getting session types for track: ${error.message}`);
    }
  }

  /**
   * Get latest session for a track
   * @param {string} trackName - Track name
   * @returns {Object|null} Latest session record or null
   */
  async getLatestSessionForTrack(trackName) {
    try {
      const stmt = this.connection.prepare(`
        SELECT * FROM sessions 
        WHERE track_name = ? 
        ORDER BY start_time DESC, created_at DESC 
        LIMIT 1
      `);
      
      const session = stmt.get(trackName);
      return session || null;
    } catch (error) {
      throw new Error(`Error getting latest session for track: ${error.message}`);
    }
  }

  /**
   * Mark session as completed
   * @param {number} sessionId - Session ID
   * @param {Date} endTime - End time
   * @returns {Object|null} Updated session or null
   */
  async markCompleted(sessionId, endTime = new Date()) {
    try {
      return await this.update(sessionId, {
        status: 'Completed',
        end_time: endTime
      });
    } catch (error) {
      throw new Error(`Error marking session as completed: ${error.message}`);
    }
  }

  /**
   * Delete old sessions (cleanup)
   * @param {number} daysOld - Delete sessions older than this many days
   * @returns {number} Number of deleted sessions
   */
  async deleteOldSessions(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const stmt = this.connection.prepare(`
        DELETE FROM sessions 
        WHERE created_at < ? AND status IN ('Completed', 'Ended', 'Finished')
      `);

      const result = stmt.run(cutoffDate.toISOString());
      return result.changes;
    } catch (error) {
      throw new Error(`Error deleting old sessions: ${error.message}`);
    }
  }
}

module.exports = SessionRepository;