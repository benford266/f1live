/**
 * Position Repository
 * Handles database operations for F1 position data
 */

const BaseRepository = require('./BaseRepository');

class PositionRepository extends BaseRepository {
  constructor(database) {
    super(database, 'position_data');
    this.prepareCustomStatements();
  }

  prepareCustomStatements() {
    this.findBySessionStmt = this.connection.prepare(`
      SELECT * FROM position_data 
      WHERE session_id = ? 
      ORDER BY timestamp DESC
    `);

    this.findByDriverStmt = this.connection.prepare(`
      SELECT * FROM position_data 
      WHERE driver_id = ? 
      ORDER BY timestamp DESC
    `);

    this.getLatestPositionsStmt = this.connection.prepare(`
      SELECT pd.*, d.driver_number 
      FROM position_data pd
      JOIN drivers d ON pd.driver_id = d.id
      WHERE pd.session_id = ? 
        AND pd.timestamp = (
          SELECT MAX(timestamp) 
          FROM position_data pd2 
          WHERE pd2.driver_id = pd.driver_id AND pd2.session_id = ?
        )
      ORDER BY d.driver_number
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
      throw new Error(`Error finding position data by session: ${error.message}`);
    }
  }

  async findByDriver(driverId, options = {}) {
    try {
      let stmt = this.findByDriverStmt;
      let params = [driverId];

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
      throw new Error(`Error finding position data by driver: ${error.message}`);
    }
  }

  async getLatestPositions(sessionId) {
    try {
      return this.getLatestPositionsStmt.all(sessionId, sessionId);
    } catch (error) {
      throw new Error(`Error getting latest positions: ${error.message}`);
    }
  }

  async getDriverTrack(sessionId, driverId) {
    try {
      const stmt = this.connection.prepare(`
        SELECT x, y, z, timestamp
        FROM position_data 
        WHERE session_id = ? AND driver_id = ?
        ORDER BY timestamp ASC
      `);

      return stmt.all(sessionId, driverId);
    } catch (error) {
      throw new Error(`Error getting driver track: ${error.message}`);
    }
  }
}

module.exports = PositionRepository;