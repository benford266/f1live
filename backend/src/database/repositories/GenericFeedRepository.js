/**
 * Generic Feed Repository
 * Handles database operations for generic F1 feed data
 */

const BaseRepository = require('./BaseRepository');

class GenericFeedRepository extends BaseRepository {
  constructor(database) {
    super(database, 'generic_feed_data');
    this.prepareCustomStatements();
  }

  prepareCustomStatements() {
    this.findBySessionStmt = this.connection.prepare(`
      SELECT * FROM generic_feed_data 
      WHERE session_id = ? 
      ORDER BY timestamp DESC
    `);

    this.findByFeedNameStmt = this.connection.prepare(`
      SELECT * FROM generic_feed_data 
      WHERE session_id = ? AND feed_name = ?
      ORDER BY timestamp DESC
    `);

    this.getFeedNamesStmt = this.connection.prepare(`
      SELECT DISTINCT feed_name, COUNT(*) as count
      FROM generic_feed_data 
      WHERE session_id = ?
      GROUP BY feed_name
      ORDER BY count DESC
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
      throw new Error(`Error finding generic feed data by session: ${error.message}`);
    }
  }

  async findByFeedName(sessionId, feedName, options = {}) {
    try {
      let stmt = this.findByFeedNameStmt;
      let params = [sessionId, feedName];

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
      throw new Error(`Error finding generic feed data by feed name: ${error.message}`);
    }
  }

  async getFeedNames(sessionId) {
    try {
      return this.getFeedNamesStmt.all(sessionId);
    } catch (error) {
      throw new Error(`Error getting feed names: ${error.message}`);
    }
  }

  async getLatestFeedData(sessionId, feedName) {
    try {
      const stmt = this.connection.prepare(`
        SELECT * FROM generic_feed_data 
        WHERE session_id = ? AND feed_name = ?
        ORDER BY timestamp DESC 
        LIMIT 1
      `);

      const data = stmt.get(sessionId, feedName);
      if (data && data.data_json) {
        data.data = JSON.parse(data.data_json);
        delete data.data_json;
      }
      return data || null;
    } catch (error) {
      throw new Error(`Error getting latest feed data: ${error.message}`);
    }
  }
}

module.exports = GenericFeedRepository;