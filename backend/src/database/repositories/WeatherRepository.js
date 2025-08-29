/**
 * Weather Repository
 * Handles database operations for F1 weather data
 */

const BaseRepository = require('./BaseRepository');

class WeatherRepository extends BaseRepository {
  constructor(database) {
    super(database, 'weather_data');
    this.prepareCustomStatements();
  }

  prepareCustomStatements() {
    this.findBySessionStmt = this.connection.prepare(`
      SELECT * FROM weather_data 
      WHERE session_id = ? 
      ORDER BY timestamp DESC
    `);

    this.getLatestWeatherStmt = this.connection.prepare(`
      SELECT * FROM weather_data 
      WHERE session_id = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `);

    this.getWeatherTrendsStmt = this.connection.prepare(`
      SELECT 
        timestamp,
        air_temp,
        track_temp,
        humidity,
        wind_speed,
        rainfall
      FROM weather_data 
      WHERE session_id = ? 
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
      throw new Error(`Error finding weather data by session: ${error.message}`);
    }
  }

  async getLatest(sessionId) {
    try {
      const weather = this.getLatestWeatherStmt.get(sessionId);
      return weather || null;
    } catch (error) {
      throw new Error(`Error getting latest weather: ${error.message}`);
    }
  }

  async getWeatherTrends(sessionId) {
    try {
      return this.getWeatherTrendsStmt.all(sessionId);
    } catch (error) {
      throw new Error(`Error getting weather trends: ${error.message}`);
    }
  }

  async getAverageConditions(sessionId) {
    try {
      const stmt = this.connection.prepare(`
        SELECT 
          AVG(air_temp) as avg_air_temp,
          AVG(track_temp) as avg_track_temp,
          AVG(humidity) as avg_humidity,
          AVG(wind_speed) as avg_wind_speed,
          MAX(rainfall) as max_rainfall,
          MIN(air_temp) as min_air_temp,
          MAX(air_temp) as max_air_temp
        FROM weather_data 
        WHERE session_id = ?
      `);

      return stmt.get(sessionId);
    } catch (error) {
      throw new Error(`Error getting average conditions: ${error.message}`);
    }
  }
}

module.exports = WeatherRepository;