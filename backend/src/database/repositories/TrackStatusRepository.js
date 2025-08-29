/**
 * Track Status Repository
 * Handles database operations for F1 track status data
 */

const BaseRepository = require('./BaseRepository');

class TrackStatusRepository extends BaseRepository {
  constructor(database) {
    super(database, 'track_status');
    this.prepareCustomStatements();
  }

  prepareCustomStatements() {
    this.findBySessionStmt = this.connection.prepare(`
      SELECT * FROM track_status 
      WHERE session_id = ? 
      ORDER BY timestamp DESC
    `);

    this.getLatestStatusStmt = this.connection.prepare(`
      SELECT * FROM track_status 
      WHERE session_id = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `);

    this.getFlagHistoryStmt = this.connection.prepare(`
      SELECT * FROM track_status 
      WHERE session_id = ? AND flag_state IS NOT NULL
      ORDER BY timestamp ASC
    `);
  }

  async findBySession(sessionId, options = {}) {
    try {
      let stmt = this.findBySessionStmt;
      let params = [sessionId];

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
      throw new Error(`Error finding track status by session: ${error.message}`);
    }
  }

  async getLatest(sessionId) {
    try {
      const status = this.getLatestStatusStmt.get(sessionId);
      return status || null;
    } catch (error) {
      throw new Error(`Error getting latest track status: ${error.message}`);
    }
  }

  async getFlagHistory(sessionId) {
    try {
      return this.getFlagHistoryStmt.all(sessionId);
    } catch (error) {
      throw new Error(`Error getting flag history: ${error.message}`);
    }
  }

  async getFlagStats(sessionId) {
    try {
      const stmt = this.connection.prepare(`
        SELECT 
          flag_state,
          COUNT(*) as count,
          MIN(timestamp) as first_occurrence,
          MAX(timestamp) as last_occurrence
        FROM track_status 
        WHERE session_id = ? AND flag_state IS NOT NULL
        GROUP BY flag_state
        ORDER BY count DESC
      `);

      return stmt.all(sessionId);
    } catch (error) {
      throw new Error(`Error getting flag statistics: ${error.message}`);
    }
  }
}

module.exports = TrackStatusRepository;