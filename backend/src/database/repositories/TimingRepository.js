/**
 * Timing Repository
 * Handles database operations for F1 timing data
 */

const BaseRepository = require('./BaseRepository');

class TimingRepository extends BaseRepository {
  constructor(database) {
    super(database, 'timing_data');
    this.prepareCustomStatements();
  }

  prepareCustomStatements() {
    this.findBySessionStmt = this.connection.prepare(`
      SELECT * FROM timing_data 
      WHERE session_id = ? 
      ORDER BY timestamp DESC
    `);

    this.findByDriverStmt = this.connection.prepare(`
      SELECT * FROM timing_data 
      WHERE driver_id = ? 
      ORDER BY timestamp DESC
    `);

    this.findLatestBySessionStmt = this.connection.prepare(`
      SELECT td.*, d.driver_number 
      FROM timing_data td
      JOIN drivers d ON td.driver_id = d.id
      WHERE td.session_id = ?
      ORDER BY td.timestamp DESC
      LIMIT 1
    `);

    this.getLatestPositionsStmt = this.connection.prepare(`
      SELECT DISTINCT 
        td.driver_id,
        d.driver_number,
        d.broadcast_name,
        td.position,
        td.last_lap_time,
        td.best_lap_time,
        td.gap_to_leader,
        td.interval_to_ahead,
        td.status,
        td.in_pit,
        td.timestamp
      FROM timing_data td
      JOIN drivers d ON td.driver_id = d.id
      WHERE td.session_id = ? 
        AND td.timestamp = (
          SELECT MAX(timestamp) 
          FROM timing_data td2 
          WHERE td2.driver_id = td.driver_id AND td2.session_id = ?
        )
      ORDER BY CAST(td.position AS INTEGER)
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
      throw new Error(`Error finding timing data by session: ${error.message}`);
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
      throw new Error(`Error finding timing data by driver: ${error.message}`);
    }
  }

  async getLatestPositions(sessionId) {
    try {
      return this.getLatestPositionsStmt.all(sessionId, sessionId);
    } catch (error) {
      throw new Error(`Error getting latest positions: ${error.message}`);
    }
  }

  async getBestLapTimes(sessionId, limit = 10) {
    try {
      const stmt = this.connection.prepare(`
        SELECT DISTINCT
          td.driver_id,
          d.driver_number,
          d.broadcast_name,
          td.best_lap_time,
          td.timestamp
        FROM timing_data td
        JOIN drivers d ON td.driver_id = d.id
        WHERE td.session_id = ? 
          AND td.best_lap_time IS NOT NULL
          AND td.timestamp = (
            SELECT MAX(timestamp) 
            FROM timing_data td2 
            WHERE td2.driver_id = td.driver_id 
              AND td2.session_id = ?
              AND td2.best_lap_time IS NOT NULL
          )
        ORDER BY td.best_lap_time ASC
        LIMIT ?
      `);

      return stmt.all(sessionId, sessionId, limit);
    } catch (error) {
      throw new Error(`Error getting best lap times: ${error.message}`);
    }
  }
}

module.exports = TimingRepository;