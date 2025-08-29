/**
 * Lap Time Repository
 * Handles database operations for F1 lap times
 */

const BaseRepository = require('./BaseRepository');

class LapTimeRepository extends BaseRepository {
  constructor(database) {
    super(database, 'lap_times');
    this.prepareCustomStatements();
  }

  prepareCustomStatements() {
    this.findBySessionStmt = this.connection.prepare(`
      SELECT lt.*, d.driver_number, d.broadcast_name
      FROM lap_times lt
      JOIN drivers d ON lt.driver_id = d.id
      WHERE lt.session_id = ? 
      ORDER BY lt.lap_number DESC, lt.lap_time ASC
    `);

    this.findByDriverStmt = this.connection.prepare(`
      SELECT * FROM lap_times 
      WHERE driver_id = ? 
      ORDER BY lap_number DESC
    `);

    this.getFastestLapStmt = this.connection.prepare(`
      SELECT lt.*, d.driver_number, d.broadcast_name
      FROM lap_times lt
      JOIN drivers d ON lt.driver_id = d.id
      WHERE lt.session_id = ? AND lt.is_fastest_lap = 1
    `);

    this.getPersonalBestStmt = this.connection.prepare(`
      SELECT * FROM lap_times 
      WHERE session_id = ? AND driver_id = ?
      ORDER BY lap_time ASC 
      LIMIT 1
    `);

    this.getLapTimesForLapStmt = this.connection.prepare(`
      SELECT lt.*, d.driver_number, d.broadcast_name
      FROM lap_times lt
      JOIN drivers d ON lt.driver_id = d.id
      WHERE lt.session_id = ? AND lt.lap_number = ?
      ORDER BY lt.lap_time ASC
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
      throw new Error(`Error finding lap times by session: ${error.message}`);
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
      throw new Error(`Error finding lap times by driver: ${error.message}`);
    }
  }

  async getFastestLap(sessionId) {
    try {
      const lap = this.getFastestLapStmt.get(sessionId);
      return lap || null;
    } catch (error) {
      throw new Error(`Error getting fastest lap: ${error.message}`);
    }
  }

  async getPersonalBest(sessionId, driverId) {
    try {
      const lap = this.getPersonalBestStmt.get(sessionId, driverId);
      return lap || null;
    } catch (error) {
      throw new Error(`Error getting personal best: ${error.message}`);
    }
  }

  async getLapTimesForLap(sessionId, lapNumber) {
    try {
      return this.getLapTimesForLapStmt.all(sessionId, lapNumber);
    } catch (error) {
      throw new Error(`Error getting lap times for lap: ${error.message}`);
    }
  }

  async getBestLaps(sessionId, limit = 10) {
    try {
      const stmt = this.connection.prepare(`
        SELECT lt.*, d.driver_number, d.broadcast_name
        FROM lap_times lt
        JOIN drivers d ON lt.driver_id = d.id
        WHERE lt.session_id = ? AND lt.is_deleted = 0
        ORDER BY lt.lap_time ASC
        LIMIT ?
      `);

      return stmt.all(sessionId, limit);
    } catch (error) {
      throw new Error(`Error getting best laps: ${error.message}`);
    }
  }

  async getDriverProgression(sessionId, driverId) {
    try {
      const stmt = this.connection.prepare(`
        SELECT 
          lap_number,
          lap_time,
          position,
          gap_to_leader,
          is_personal_best,
          timestamp
        FROM lap_times 
        WHERE session_id = ? AND driver_id = ?
        ORDER BY lap_number ASC
      `);

      return stmt.all(sessionId, driverId);
    } catch (error) {
      throw new Error(`Error getting driver progression: ${error.message}`);
    }
  }

  async getLapStats(sessionId) {
    try {
      const stmt = this.connection.prepare(`
        SELECT 
          COUNT(*) as total_laps,
          COUNT(DISTINCT driver_id) as drivers_with_laps,
          AVG(CAST(SUBSTR(lap_time, 1, INSTR(lap_time, ':') - 1) AS INTEGER) * 60 + 
              CAST(SUBSTR(lap_time, INSTR(lap_time, ':') + 1) AS REAL)) as avg_lap_time_seconds,
          MIN(lap_time) as fastest_lap_time,
          MAX(lap_number) as max_lap_number
        FROM lap_times 
        WHERE session_id = ? AND is_deleted = 0
      `);

      return stmt.get(sessionId);
    } catch (error) {
      throw new Error(`Error getting lap stats: ${error.message}`);
    }
  }
}

module.exports = LapTimeRepository;