/**
 * Driver Repository
 * Handles database operations for F1 drivers
 */

const BaseRepository = require('./BaseRepository');

class DriverRepository extends BaseRepository {
  constructor(database) {
    super(database, 'drivers');
    this.prepareCustomStatements();
  }

  /**
   * Prepare driver-specific SQL statements
   */
  prepareCustomStatements() {
    this.findBySessionAndNumberStmt = this.connection.prepare(`
      SELECT * FROM drivers 
      WHERE session_id = ? AND driver_number = ?
    `);

    this.findBySessionStmt = this.connection.prepare(`
      SELECT * FROM drivers 
      WHERE session_id = ? 
      ORDER BY driver_number
    `);

    this.findByNumberStmt = this.connection.prepare(`
      SELECT * FROM drivers 
      WHERE driver_number = ? 
      ORDER BY created_at DESC
    `);

    this.findByTeamStmt = this.connection.prepare(`
      SELECT * FROM drivers 
      WHERE team_name = ? 
      ORDER BY driver_number
    `);
  }

  /**
   * Find driver by session ID and driver number
   * @param {number} sessionId - Session ID
   * @param {string} driverNumber - Driver number
   * @returns {Object|null} Driver record or null
   */
  async findBySessionAndNumber(sessionId, driverNumber) {
    try {
      const driver = this.findBySessionAndNumberStmt.get(sessionId, driverNumber);
      return driver || null;
    } catch (error) {
      throw new Error(`Error finding driver by session and number: ${error.message}`);
    }
  }

  /**
   * Find all drivers for a session
   * @param {number} sessionId - Session ID
   * @returns {Array} Array of driver records
   */
  async findBySession(sessionId) {
    try {
      return this.findBySessionStmt.all(sessionId);
    } catch (error) {
      throw new Error(`Error finding drivers by session: ${error.message}`);
    }
  }

  /**
   * Find all instances of a driver number across sessions
   * @param {string} driverNumber - Driver number
   * @returns {Array} Array of driver records
   */
  async findByNumber(driverNumber) {
    try {
      return this.findByNumberStmt.all(driverNumber);
    } catch (error) {
      throw new Error(`Error finding drivers by number: ${error.message}`);
    }
  }

  /**
   * Find drivers by team name
   * @param {string} teamName - Team name
   * @returns {Array} Array of driver records
   */
  async findByTeam(teamName) {
    try {
      return this.findByTeamStmt.all(teamName);
    } catch (error) {
      throw new Error(`Error finding drivers by team: ${error.message}`);
    }
  }

  /**
   * Get driver statistics for a session
   * @param {number} sessionId - Session ID
   * @returns {Object} Driver statistics
   */
  async getSessionStats(sessionId) {
    try {
      const stmt = this.connection.prepare(`
        SELECT 
          COUNT(*) as total_drivers,
          COUNT(DISTINCT team_name) as total_teams,
          COUNT(CASE WHEN full_name IS NOT NULL THEN 1 END) as drivers_with_names,
          COUNT(CASE WHEN team_name IS NOT NULL THEN 1 END) as drivers_with_teams
        FROM drivers 
        WHERE session_id = ?
      `);

      return stmt.get(sessionId);
    } catch (error) {
      throw new Error(`Error getting driver session stats: ${error.message}`);
    }
  }

  /**
   * Get team lineup for a session
   * @param {number} sessionId - Session ID
   * @returns {Object} Teams with their drivers
   */
  async getTeamLineup(sessionId) {
    try {
      const stmt = this.connection.prepare(`
        SELECT 
          team_name,
          driver_number,
          broadcast_name,
          full_name,
          tla
        FROM drivers 
        WHERE session_id = ? AND team_name IS NOT NULL
        ORDER BY team_name, driver_number
      `);

      const drivers = stmt.all(sessionId);
      
      // Group by team
      const teams = {};
      drivers.forEach(driver => {
        if (!teams[driver.team_name]) {
          teams[driver.team_name] = [];
        }
        teams[driver.team_name].push(driver);
      });

      return teams;
    } catch (error) {
      throw new Error(`Error getting team lineup: ${error.message}`);
    }
  }

  /**
   * Get unique teams across all sessions
   * @returns {Array} Array of unique team names
   */
  async getUniqueTeams() {
    try {
      const stmt = this.connection.prepare(`
        SELECT DISTINCT team_name 
        FROM drivers 
        WHERE team_name IS NOT NULL 
        ORDER BY team_name
      `);

      const results = stmt.all();
      return results.map(row => row.team_name);
    } catch (error) {
      throw new Error(`Error getting unique teams: ${error.message}`);
    }
  }

  /**
   * Get driver history across sessions
   * @param {string} driverNumber - Driver number
   * @returns {Array} Driver history with session info
   */
  async getDriverHistory(driverNumber) {
    try {
      const stmt = this.connection.prepare(`
        SELECT 
          d.*,
          s.session_key,
          s.track_name,
          s.session_type,
          s.start_time
        FROM drivers d
        JOIN sessions s ON d.session_id = s.id
        WHERE d.driver_number = ?
        ORDER BY s.start_time DESC
      `);

      return stmt.all(driverNumber);
    } catch (error) {
      throw new Error(`Error getting driver history: ${error.message}`);
    }
  }

  /**
   * Update driver information across all sessions
   * @param {string} driverNumber - Driver number
   * @param {Object} updates - Data to update
   * @returns {number} Number of records updated
   */
  async updateDriverInfo(driverNumber, updates) {
    try {
      const updateFields = Object.keys(updates);
      const setClause = updateFields.map(field => `${field} = ?`).join(', ');
      
      const stmt = this.connection.prepare(`
        UPDATE drivers 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE driver_number = ?
      `);

      const params = [...Object.values(updates), driverNumber];
      const result = stmt.run(...params);
      
      return result.changes;
    } catch (error) {
      throw new Error(`Error updating driver info: ${error.message}`);
    }
  }

  /**
   * Get driver's latest information
   * @param {string} driverNumber - Driver number
   * @returns {Object|null} Latest driver information
   */
  async getLatestDriverInfo(driverNumber) {
    try {
      const stmt = this.connection.prepare(`
        SELECT d.* 
        FROM drivers d
        JOIN sessions s ON d.session_id = s.id
        WHERE d.driver_number = ?
        ORDER BY s.start_time DESC, d.updated_at DESC
        LIMIT 1
      `);

      const driver = stmt.get(driverNumber);
      return driver || null;
    } catch (error) {
      throw new Error(`Error getting latest driver info: ${error.message}`);
    }
  }

  /**
   * Bulk create drivers for a session
   * @param {number} sessionId - Session ID
   * @param {Array} driversData - Array of driver data
   * @returns {Array} Created driver records
   */
  async bulkCreate(sessionId, driversData) {
    try {
      const transaction = this.connection.transaction((drivers) => {
        const results = [];
        
        for (const driverData of drivers) {
          const data = {
            session_id: sessionId,
            ...driverData
          };
          
          if (!this.insertStmt) {
            this.prepareInsertStatement(data);
          }
          
          const result = this.insertStmt.run(data);
          const created = this.findByIdStmt.get(result.lastInsertRowid);
          results.push(created);
        }
        
        return results;
      });

      return transaction(driversData);
    } catch (error) {
      throw new Error(`Error bulk creating drivers: ${error.message}`);
    }
  }

  /**
   * Delete drivers for a session
   * @param {number} sessionId - Session ID
   * @returns {number} Number of deleted drivers
   */
  async deleteBySession(sessionId) {
    try {
      const stmt = this.connection.prepare(`
        DELETE FROM drivers WHERE session_id = ?
      `);

      const result = stmt.run(sessionId);
      return result.changes;
    } catch (error) {
      throw new Error(`Error deleting drivers by session: ${error.message}`);
    }
  }
}

module.exports = DriverRepository;