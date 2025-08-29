/**
 * Telemetry Repository
 * Handles database operations for F1 car telemetry data
 */

const BaseRepository = require('./BaseRepository');

class TelemetryRepository extends BaseRepository {
  constructor(database) {
    super(database, 'car_telemetry');
    this.prepareCustomStatements();
  }

  prepareCustomStatements() {
    this.findBySessionStmt = this.connection.prepare(`
      SELECT * FROM car_telemetry 
      WHERE session_id = ? 
      ORDER BY timestamp DESC
    `);

    this.findByDriverStmt = this.connection.prepare(`
      SELECT * FROM car_telemetry 
      WHERE driver_id = ? 
      ORDER BY timestamp DESC
    `);

    this.getLatestTelemetryStmt = this.connection.prepare(`
      SELECT ct.*, d.driver_number 
      FROM car_telemetry ct
      JOIN drivers d ON ct.driver_id = d.id
      WHERE ct.session_id = ? 
        AND ct.timestamp = (
          SELECT MAX(timestamp) 
          FROM car_telemetry ct2 
          WHERE ct2.driver_id = ct.driver_id AND ct2.session_id = ?
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
      throw new Error(`Error finding telemetry by session: ${error.message}`);
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
      throw new Error(`Error finding telemetry by driver: ${error.message}`);
    }
  }

  async getLatestTelemetry(sessionId) {
    try {
      return this.getLatestTelemetryStmt.all(sessionId, sessionId);
    } catch (error) {
      throw new Error(`Error getting latest telemetry: ${error.message}`);
    }
  }

  async getMaxSpeed(sessionId, driverId = null) {
    try {
      let sql = `
        SELECT MAX(speed) as max_speed, driver_id, timestamp
        FROM car_telemetry 
        WHERE session_id = ? AND speed IS NOT NULL
      `;
      let params = [sessionId];

      if (driverId) {
        sql += ' AND driver_id = ?';
        params.push(driverId);
      }

      sql += ' GROUP BY driver_id ORDER BY max_speed DESC';

      const stmt = this.connection.prepare(sql);
      return driverId ? stmt.get(...params) : stmt.all(...params);
    } catch (error) {
      throw new Error(`Error getting max speed: ${error.message}`);
    }
  }
}

module.exports = TelemetryRepository;