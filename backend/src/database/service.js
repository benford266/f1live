/**
 * F1 Database Service
 * High-level service for managing F1 data storage and retrieval
 */

const logger = require('../utils/logger');
const { getDatabaseInstance } = require('./connection');
const SessionRepository = require('./repositories/SessionRepository');
const DriverRepository = require('./repositories/DriverRepository');
const TimingRepository = require('./repositories/TimingRepository');
const TelemetryRepository = require('./repositories/TelemetryRepository');
const PositionRepository = require('./repositories/PositionRepository');
const WeatherRepository = require('./repositories/WeatherRepository');
const TrackStatusRepository = require('./repositories/TrackStatusRepository');
const RaceControlRepository = require('./repositories/RaceControlRepository');
const LapTimeRepository = require('./repositories/LapTimeRepository');
const GenericFeedRepository = require('./repositories/GenericFeedRepository');

class F1DatabaseService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.currentSession = null;
    this.sessionDriverMap = new Map(); // Maps session_id -> Map(driver_number -> driver_id)
    
    // Initialize repositories
    this.sessions = null;
    this.drivers = null;
    this.timing = null;
    this.telemetry = null;
    this.position = null;
    this.weather = null;
    this.trackStatus = null;
    this.raceControl = null;
    this.lapTimes = null;
    this.genericFeed = null;
  }

  /**
   * Initialize the database service
   */
  async initialize() {
    try {
      logger.info('Initializing F1 Database Service...');
      
      this.db = getDatabaseInstance();
      
      if (!this.db.isReady()) {
        throw new Error('Database not initialized. Initialize database connection first.');
      }

      // Initialize all repositories
      this.sessions = new SessionRepository(this.db);
      this.drivers = new DriverRepository(this.db);
      this.timing = new TimingRepository(this.db);
      this.telemetry = new TelemetryRepository(this.db);
      this.position = new PositionRepository(this.db);
      this.weather = new WeatherRepository(this.db);
      this.trackStatus = new TrackStatusRepository(this.db);
      this.raceControl = new RaceControlRepository(this.db);
      this.lapTimes = new LapTimeRepository(this.db);
      this.genericFeed = new GenericFeedRepository(this.db);

      this.isInitialized = true;
      logger.info('F1 Database Service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize F1 Database Service:', error);
      throw error;
    }
  }

  /**
   * Ensure service is initialized
   */
  _ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('Database service not initialized. Call initialize() first.');
    }
  }

  /**
   * Create or get current session based on session data
   * @param {Object} sessionData - Session information from F1 feed
   * @returns {Object} Session record
   */
  async ensureSession(sessionData) {
    this._ensureInitialized();

    try {
      // Generate session key for uniqueness
      const sessionKey = this.generateSessionKey(sessionData);
      
      // Try to get existing session
      let session = await this.sessions.findByKey(sessionKey);
      
      if (!session) {
        // Create new session
        const sessionRecord = {
          session_key: sessionKey,
          track_name: sessionData.location || sessionData.circuitName || 'Unknown Track',
          circuit_name: sessionData.circuitName || null,
          country_code: sessionData.countryCode || null,
          country_name: sessionData.countryName || null,
          session_name: sessionData.sessionName || 'Unknown Session',
          session_type: sessionData.sessionType || 'Unknown',
          meeting_name: sessionData.meetingName || null,
          year: sessionData.year || new Date().getFullYear(),
          start_time: sessionData.started ? new Date(sessionData.started) : new Date(),
          end_time: sessionData.ended ? new Date(sessionData.ended) : null,
          status: sessionData.sessionState || 'Unknown',
          total_laps: sessionData.totalLaps || null,
          current_lap: sessionData.currentLap || null,
          time_remaining: sessionData.timeRemaining || null
        };

        session = await this.sessions.create(sessionRecord);
        logger.info(`Created new session: ${sessionKey} (ID: ${session.id})`);
      } else {
        // Update existing session if needed
        const updates = {};
        if (sessionData.sessionState && sessionData.sessionState !== session.status) {
          updates.status = sessionData.sessionState;
        }
        if (sessionData.ended && !session.end_time) {
          updates.end_time = new Date(sessionData.ended);
        }
        if (sessionData.currentLap && sessionData.currentLap !== session.current_lap) {
          updates.current_lap = sessionData.currentLap;
        }
        if (sessionData.timeRemaining) {
          updates.time_remaining = sessionData.timeRemaining;
        }

        if (Object.keys(updates).length > 0) {
          session = await this.sessions.update(session.id, updates);
          logger.debug(`Updated session ${sessionKey} with:`, updates);
        }
      }

      this.currentSession = session;
      return session;

    } catch (error) {
      logger.error('Error ensuring session:', error);
      throw error;
    }
  }

  /**
   * Generate unique session key
   * @param {Object} sessionData - Session information
   * @returns {string} Unique session key
   */
  generateSessionKey(sessionData) {
    const year = sessionData.year || new Date().getFullYear();
    const track = (sessionData.location || sessionData.circuitName || 'Unknown')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '');
    const sessionType = (sessionData.sessionType || sessionData.sessionName || 'Unknown')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '');
    
    return `${year}_${track}_${sessionType}`.toLowerCase();
  }

  /**
   * Ensure driver exists for current session
   * @param {string} driverNumber - Driver number
   * @param {Object} driverData - Driver information
   * @returns {Object} Driver record
   */
  async ensureDriver(driverNumber, driverData = {}) {
    this._ensureInitialized();

    if (!this.currentSession) {
      throw new Error('No current session. Ensure session is created first.');
    }

    try {
      const sessionId = this.currentSession.id;
      
      // Check session driver cache
      if (!this.sessionDriverMap.has(sessionId)) {
        this.sessionDriverMap.set(sessionId, new Map());
      }
      
      const sessionDrivers = this.sessionDriverMap.get(sessionId);
      
      if (sessionDrivers.has(driverNumber)) {
        return { id: sessionDrivers.get(driverNumber) };
      }

      // Try to find existing driver
      let driver = await this.drivers.findBySessionAndNumber(sessionId, driverNumber);
      
      if (!driver) {
        // Create new driver
        const driverRecord = {
          session_id: sessionId,
          driver_number: driverNumber,
          broadcast_name: driverData.broadcastName || null,
          full_name: driverData.fullName || null,
          first_name: driverData.firstName || null,
          last_name: driverData.lastName || null,
          tla: driverData.tla || null,
          team_name: driverData.team || driverData.teamName || null,
          team_color: driverData.teamColor || null,
          reference: driverData.reference || null,
          headshot_url: driverData.headShotUrl || null
        };

        driver = await this.drivers.create(driverRecord);
        logger.debug(`Created driver ${driverNumber} for session ${sessionId}`);
      } else {
        // Update driver info if provided
        if (Object.keys(driverData).length > 0) {
          const updates = {};
          if (driverData.broadcastName) updates.broadcast_name = driverData.broadcastName;
          if (driverData.fullName) updates.full_name = driverData.fullName;
          if (driverData.firstName) updates.first_name = driverData.firstName;
          if (driverData.lastName) updates.last_name = driverData.lastName;
          if (driverData.tla) updates.tla = driverData.tla;
          if (driverData.team || driverData.teamName) updates.team_name = driverData.team || driverData.teamName;
          if (driverData.teamColor) updates.team_color = driverData.teamColor;
          if (driverData.reference) updates.reference = driverData.reference;
          if (driverData.headShotUrl) updates.headshot_url = driverData.headShotUrl;

          if (Object.keys(updates).length > 0) {
            driver = await this.drivers.update(driver.id, updates);
          }
        }
      }

      // Cache driver ID
      sessionDrivers.set(driverNumber, driver.id);
      return driver;

    } catch (error) {
      logger.error(`Error ensuring driver ${driverNumber}:`, error);
      throw error;
    }
  }

  /**
   * Log timing data from F1 feed
   * @param {Object} timingData - Processed timing data
   */
  async logTimingData(timingData) {
    this._ensureInitialized();

    if (!this.currentSession || !timingData.drivers) {
      return;
    }

    try {
      const sessionId = this.currentSession.id;
      const timestamp = new Date(timingData.timestamp);

      // Process each driver's timing data
      for (const [driverNumber, driverTiming] of Object.entries(timingData.drivers)) {
        const driver = await this.ensureDriver(driverNumber);
        
        // Log timing data
        await this.timing.create({
          session_id: sessionId,
          driver_id: driver.id,
          timestamp,
          lap_number: driverTiming.lapNumber,
          position: driverTiming.position,
          last_lap_time: driverTiming.lapTime,
          best_lap_time: driverTiming.bestLapTime,
          sector_1_time: driverTiming.sector1,
          sector_2_time: driverTiming.sector2,
          sector_3_time: driverTiming.sector3,
          gap_to_leader: driverTiming.gap,
          interval_to_ahead: driverTiming.interval,
          status: driverTiming.status,
          in_pit: driverTiming.inPit || false,
          retired: driverTiming.retired || false
        });

        // If lap is completed, also log to lap_times table
        if (driverTiming.lapTime && driverTiming.lapNumber) {
          await this.logLapTime({
            session_id: sessionId,
            driver_id: driver.id,
            lap_number: driverTiming.lapNumber,
            lap_time: driverTiming.lapTime,
            sector_1_time: driverTiming.sector1,
            sector_2_time: driverTiming.sector2,
            sector_3_time: driverTiming.sector3,
            position: driverTiming.position,
            gap_to_leader: driverTiming.gap,
            timestamp
          });
        }
      }

    } catch (error) {
      logger.error('Error logging timing data:', error);
    }
  }

  /**
   * Log car telemetry data
   * @param {Object} carData - Processed car telemetry data
   */
  async logCarTelemetry(carData) {
    this._ensureInitialized();

    if (!this.currentSession || !carData.drivers) {
      return;
    }

    try {
      const sessionId = this.currentSession.id;
      const timestamp = new Date(carData.timestamp);

      // Process each driver's telemetry
      for (const [driverNumber, telemetryData] of Object.entries(carData.drivers)) {
        const driver = await this.ensureDriver(driverNumber);
        
        await this.telemetry.create({
          session_id: sessionId,
          driver_id: driver.id,
          timestamp,
          speed: telemetryData.speed,
          rpm: telemetryData.rpm,
          gear: telemetryData.gear,
          throttle: telemetryData.throttle,
          brake: telemetryData.brake,
          drs: telemetryData.drs
        });
      }

    } catch (error) {
      logger.error('Error logging car telemetry:', error);
    }
  }

  /**
   * Log position data
   * @param {Object} positionData - Processed position data
   */
  async logPositionData(positionData) {
    this._ensureInitialized();

    if (!this.currentSession || !positionData.drivers) {
      return;
    }

    try {
      const sessionId = this.currentSession.id;
      const timestamp = new Date(positionData.timestamp);

      for (const [driverNumber, position] of Object.entries(positionData.drivers)) {
        const driver = await this.ensureDriver(driverNumber);
        
        await this.position.create({
          session_id: sessionId,
          driver_id: driver.id,
          timestamp,
          x: position.x,
          y: position.y,
          z: position.z,
          status: position.status
        });
      }

    } catch (error) {
      logger.error('Error logging position data:', error);
    }
  }

  /**
   * Log weather data
   * @param {Object} weatherData - Processed weather data
   */
  async logWeatherData(weatherData) {
    this._ensureInitialized();

    if (!this.currentSession) {
      return;
    }

    try {
      await this.weather.create({
        session_id: this.currentSession.id,
        timestamp: new Date(weatherData.timestamp),
        air_temp: weatherData.airTemp,
        humidity: weatherData.humidity,
        pressure: weatherData.pressure,
        rainfall: weatherData.rainfall,
        track_temp: weatherData.trackTemp,
        wind_direction: weatherData.windDirection,
        wind_speed: weatherData.windSpeed
      });

    } catch (error) {
      logger.error('Error logging weather data:', error);
    }
  }

  /**
   * Log track status data
   * @param {Object} trackStatusData - Processed track status data
   */
  async logTrackStatus(trackStatusData) {
    this._ensureInitialized();

    if (!this.currentSession) {
      return;
    }

    try {
      await this.trackStatus.create({
        session_id: this.currentSession.id,
        timestamp: new Date(trackStatusData.timestamp),
        status: trackStatusData.status,
        message: trackStatusData.message,
        flag_state: trackStatusData.flagState
      });

    } catch (error) {
      logger.error('Error logging track status:', error);
    }
  }

  /**
   * Log race control messages
   * @param {Object} raceControlData - Processed race control data
   */
  async logRaceControlMessages(raceControlData) {
    this._ensureInitialized();

    if (!this.currentSession || !raceControlData.messages) {
      return;
    }

    try {
      const sessionId = this.currentSession.id;

      for (const message of raceControlData.messages) {
        await this.raceControl.create({
          session_id: sessionId,
          timestamp: new Date(message.timestamp),
          category: message.category,
          message: message.message,
          flag: message.flag,
          scope: message.scope,
          sector: message.sector,
          mode: message.mode
        });
      }

    } catch (error) {
      logger.error('Error logging race control messages:', error);
    }
  }

  /**
   * Log lap time with analysis
   * @param {Object} lapData - Lap time data
   */
  async logLapTime(lapData) {
    try {
      // Check if this is fastest lap overall or personal best
      const fastestOverall = await this.lapTimes.getFastestLap(lapData.session_id);
      const personalBest = await this.lapTimes.getPersonalBest(lapData.session_id, lapData.driver_id);
      
      const lapTime = this.parseTimeToMs(lapData.lap_time);
      const isFastest = !fastestOverall || lapTime < this.parseTimeToMs(fastestOverall.lap_time);
      const isPersonalBest = !personalBest || lapTime < this.parseTimeToMs(personalBest.lap_time);

      // If this is the new fastest lap, update previous fastest
      if (isFastest && fastestOverall) {
        await this.lapTimes.update(fastestOverall.id, { is_fastest_lap: false });
      }

      // Create lap time record
      await this.lapTimes.create({
        ...lapData,
        is_fastest_lap: isFastest,
        is_personal_best: isPersonalBest
      });

    } catch (error) {
      logger.error('Error logging lap time:', error);
    }
  }

  /**
   * Log generic feed data
   * @param {string} feedName - Name of the feed
   * @param {Object} feedData - Feed data
   */
  async logGenericFeedData(feedName, feedData) {
    this._ensureInitialized();

    if (!this.currentSession) {
      return;
    }

    try {
      await this.genericFeed.create({
        session_id: this.currentSession.id,
        feed_name: feedName,
        timestamp: new Date(feedData.timestamp),
        data_json: JSON.stringify(feedData)
      });

    } catch (error) {
      logger.error(`Error logging generic feed data for ${feedName}:`, error);
    }
  }

  /**
   * Parse time string to milliseconds for comparison
   * @param {string} timeString - Time in format "1:23.456"
   * @returns {number} Time in milliseconds
   */
  parseTimeToMs(timeString) {
    if (!timeString) return Infinity;
    
    const parts = timeString.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return (minutes * 60 + seconds) * 1000;
    }
    
    return parseFloat(timeString) * 1000;
  }

  /**
   * Get current session information
   * @returns {Object|null} Current session
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * Get database statistics
   * @returns {Object} Database statistics
   */
  async getStats() {
    this._ensureInitialized();
    return this.db.getStats();
  }

  /**
   * Clear session cache
   */
  clearSessionCache() {
    this.sessionDriverMap.clear();
    this.currentSession = null;
    logger.debug('Session cache cleared');
  }
}

// Singleton instance
let databaseService = null;

/**
 * Get the singleton database service instance
 * @returns {F1DatabaseService} Database service instance
 */
function getDatabaseService() {
  if (!databaseService) {
    databaseService = new F1DatabaseService();
  }
  return databaseService;
}

module.exports = {
  F1DatabaseService,
  getDatabaseService
};