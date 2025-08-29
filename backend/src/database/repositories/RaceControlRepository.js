/**
 * Race Control Repository
 * Handles database operations for F1 race control messages
 */

const BaseRepository = require('./BaseRepository');

class RaceControlRepository extends BaseRepository {
  constructor(database) {
    super(database, 'race_control_messages');
    this.prepareCustomStatements();
  }

  prepareCustomStatements() {
    this.findBySessionStmt = this.connection.prepare(`
      SELECT * FROM race_control_messages 
      WHERE session_id = ? 
      ORDER BY timestamp DESC
    `);

    this.findByCategoryStmt = this.connection.prepare(`
      SELECT * FROM race_control_messages 
      WHERE session_id = ? AND category = ?
      ORDER BY timestamp DESC
    `);

    this.getLatestMessagesStmt = this.connection.prepare(`
      SELECT * FROM race_control_messages 
      WHERE session_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
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
      throw new Error(`Error finding race control messages by session: ${error.message}`);
    }
  }

  async findByCategory(sessionId, category, options = {}) {
    try {
      let stmt = this.findByCategoryStmt;
      let params = [sessionId, category];

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
      throw new Error(`Error finding race control messages by category: ${error.message}`);
    }
  }

  async getLatestMessages(sessionId, limit = 10) {
    try {
      return this.getLatestMessagesStmt.all(sessionId, limit);
    } catch (error) {
      throw new Error(`Error getting latest messages: ${error.message}`);
    }
  }

  async getMessageCategories(sessionId) {
    try {
      const stmt = this.connection.prepare(`
        SELECT DISTINCT category, COUNT(*) as count
        FROM race_control_messages 
        WHERE session_id = ? AND category IS NOT NULL
        GROUP BY category
        ORDER BY count DESC
      `);

      return stmt.all(sessionId);
    } catch (error) {
      throw new Error(`Error getting message categories: ${error.message}`);
    }
  }
}

module.exports = RaceControlRepository;