/**
 * F1 Live Timing Database Schema
 * Comprehensive schema for storing all F1 data types organized by track and session
 */

const DATABASE_SCHEMA = {
  // Sessions table - stores information about F1 sessions
  sessions: `
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key TEXT UNIQUE NOT NULL,
      track_name TEXT NOT NULL,
      circuit_name TEXT,
      country_code TEXT,
      country_name TEXT,
      session_name TEXT NOT NULL,
      session_type TEXT NOT NULL,
      meeting_name TEXT,
      year INTEGER NOT NULL,
      start_time DATETIME,
      end_time DATETIME,
      status TEXT,
      total_laps INTEGER,
      current_lap INTEGER,
      time_remaining TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,

  // Drivers table - stores driver information for each session
  drivers: `
    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      driver_number TEXT NOT NULL,
      broadcast_name TEXT,
      full_name TEXT,
      first_name TEXT,
      last_name TEXT,
      tla TEXT,
      team_name TEXT,
      team_color TEXT,
      reference TEXT,
      headshot_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      UNIQUE(session_id, driver_number)
    )
  `,

  // Timing data table - stores lap times, sectors, positions, and gaps
  timing_data: `
    CREATE TABLE IF NOT EXISTS timing_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      driver_id INTEGER NOT NULL,
      timestamp DATETIME NOT NULL,
      lap_number INTEGER,
      position INTEGER,
      last_lap_time TEXT,
      best_lap_time TEXT,
      sector_1_time TEXT,
      sector_2_time TEXT,
      sector_3_time TEXT,
      gap_to_leader TEXT,
      interval_to_ahead TEXT,
      status TEXT,
      in_pit BOOLEAN DEFAULT 0,
      retired BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
    )
  `,

  // Car telemetry data - stores speed, RPM, throttle, brake, etc.
  car_telemetry: `
    CREATE TABLE IF NOT EXISTS car_telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      driver_id INTEGER NOT NULL,
      timestamp DATETIME NOT NULL,
      speed INTEGER,
      rpm INTEGER,
      gear INTEGER,
      throttle INTEGER,
      brake INTEGER,
      drs INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
    )
  `,

  // Position data - stores 3D coordinates and track position
  position_data: `
    CREATE TABLE IF NOT EXISTS position_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      driver_id INTEGER NOT NULL,
      timestamp DATETIME NOT NULL,
      x REAL,
      y REAL,
      z REAL,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
    )
  `,

  // Weather data - stores weather conditions during sessions
  weather_data: `
    CREATE TABLE IF NOT EXISTS weather_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      timestamp DATETIME NOT NULL,
      air_temp REAL,
      humidity REAL,
      pressure REAL,
      rainfall INTEGER,
      track_temp REAL,
      wind_direction INTEGER,
      wind_speed REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `,

  // Track status - stores flag states, safety car, etc.
  track_status: `
    CREATE TABLE IF NOT EXISTS track_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      timestamp DATETIME NOT NULL,
      status TEXT,
      message TEXT,
      flag_state TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `,

  // Race control messages - stores official race control communications
  race_control_messages: `
    CREATE TABLE IF NOT EXISTS race_control_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      timestamp DATETIME NOT NULL,
      category TEXT,
      message TEXT,
      flag TEXT,
      scope TEXT,
      sector INTEGER,
      mode TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `,

  // Lap times - dedicated table for completed laps with detailed timing
  lap_times: `
    CREATE TABLE IF NOT EXISTS lap_times (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      driver_id INTEGER NOT NULL,
      lap_number INTEGER NOT NULL,
      lap_time TEXT NOT NULL,
      sector_1_time TEXT,
      sector_2_time TEXT,
      sector_3_time TEXT,
      position INTEGER,
      gap_to_leader TEXT,
      is_fastest_lap BOOLEAN DEFAULT 0,
      is_personal_best BOOLEAN DEFAULT 0,
      is_deleted BOOLEAN DEFAULT 0,
      timestamp DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
      UNIQUE(session_id, driver_id, lap_number)
    )
  `,

  // Generic feed data - for any other feed types not covered above
  generic_feed_data: `
    CREATE TABLE IF NOT EXISTS generic_feed_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      feed_name TEXT NOT NULL,
      timestamp DATETIME NOT NULL,
      data_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `
};

// Database indexes for better query performance
const DATABASE_INDEXES = [
  // Sessions indexes
  'CREATE INDEX IF NOT EXISTS idx_sessions_session_key ON sessions(session_key)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_track ON sessions(track_name)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(session_type)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_year ON sessions(year)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(start_time)',

  // Drivers indexes
  'CREATE INDEX IF NOT EXISTS idx_drivers_session ON drivers(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_drivers_number ON drivers(driver_number)',
  'CREATE INDEX IF NOT EXISTS idx_drivers_session_number ON drivers(session_id, driver_number)',

  // Timing data indexes
  'CREATE INDEX IF NOT EXISTS idx_timing_session ON timing_data(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_timing_driver ON timing_data(driver_id)',
  'CREATE INDEX IF NOT EXISTS idx_timing_timestamp ON timing_data(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_timing_session_timestamp ON timing_data(session_id, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_timing_driver_timestamp ON timing_data(driver_id, timestamp)',

  // Car telemetry indexes
  'CREATE INDEX IF NOT EXISTS idx_telemetry_session ON car_telemetry(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_telemetry_driver ON car_telemetry(driver_id)',
  'CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON car_telemetry(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_telemetry_session_timestamp ON car_telemetry(session_id, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_telemetry_driver_timestamp ON car_telemetry(driver_id, timestamp)',

  // Position data indexes
  'CREATE INDEX IF NOT EXISTS idx_position_session ON position_data(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_position_driver ON position_data(driver_id)',
  'CREATE INDEX IF NOT EXISTS idx_position_timestamp ON position_data(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_position_session_timestamp ON position_data(session_id, timestamp)',

  // Weather data indexes
  'CREATE INDEX IF NOT EXISTS idx_weather_session ON weather_data(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_weather_timestamp ON weather_data(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_weather_session_timestamp ON weather_data(session_id, timestamp)',

  // Track status indexes
  'CREATE INDEX IF NOT EXISTS idx_track_status_session ON track_status(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_track_status_timestamp ON track_status(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_track_status_session_timestamp ON track_status(session_id, timestamp)',

  // Race control messages indexes
  'CREATE INDEX IF NOT EXISTS idx_race_control_session ON race_control_messages(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_race_control_timestamp ON race_control_messages(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_race_control_category ON race_control_messages(category)',

  // Lap times indexes
  'CREATE INDEX IF NOT EXISTS idx_lap_times_session ON lap_times(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_lap_times_driver ON lap_times(driver_id)',
  'CREATE INDEX IF NOT EXISTS idx_lap_times_lap_number ON lap_times(lap_number)',
  'CREATE INDEX IF NOT EXISTS idx_lap_times_session_driver ON lap_times(session_id, driver_id)',
  'CREATE INDEX IF NOT EXISTS idx_lap_times_fastest ON lap_times(is_fastest_lap) WHERE is_fastest_lap = 1',
  'CREATE INDEX IF NOT EXISTS idx_lap_times_personal_best ON lap_times(is_personal_best) WHERE is_personal_best = 1',

  // Generic feed data indexes
  'CREATE INDEX IF NOT EXISTS idx_generic_feed_session ON generic_feed_data(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_generic_feed_name ON generic_feed_data(feed_name)',
  'CREATE INDEX IF NOT EXISTS idx_generic_feed_timestamp ON generic_feed_data(timestamp)'
];

// Database triggers for auto-updating timestamps
const DATABASE_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS update_sessions_timestamp 
   AFTER UPDATE ON sessions 
   BEGIN 
     UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS update_drivers_timestamp 
   AFTER UPDATE ON drivers 
   BEGIN 
     UPDATE drivers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
   END`
];

module.exports = {
  DATABASE_SCHEMA,
  DATABASE_INDEXES,
  DATABASE_TRIGGERS
};