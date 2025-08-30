/**
 * F1 Driver Mappings - Fallback when DriverList feed is unavailable
 * Updated for 2024/2025 F1 season
 */

const DRIVER_MAPPINGS = {
  // 2024-2025 F1 Driver Numbers and Names
  '1': {
    broadcastName: 'M VERSTAPPEN',
    fullName: 'Max Verstappen',
    firstName: 'Max',
    lastName: 'Verstappen',
    tla: 'VER',
    team: 'Red Bull Racing Honda RBPT',
    teamColor: '#3671C6'
  },
  '2': {
    broadcastName: 'L SARGEANT',
    fullName: 'Logan Sargeant',
    firstName: 'Logan',
    lastName: 'Sargeant',
    tla: 'SAR',
    team: 'Williams Mercedes',
    teamColor: '#64C4FF'
  },
  '3': {
    broadcastName: 'D RICCIARDO',
    fullName: 'Daniel Ricciardo',
    firstName: 'Daniel',
    lastName: 'Ricciardo',
    tla: 'RIC',
    team: 'RB Honda RBPT',
    teamColor: '#6692FF'
  },
  '4': {
    broadcastName: 'L NORRIS',
    fullName: 'Lando Norris',
    firstName: 'Lando',
    lastName: 'Norris',
    tla: 'NOR',
    team: 'McLaren Mercedes',
    teamColor: '#FF8000'
  },
  '10': {
    broadcastName: 'P GASLY',
    fullName: 'Pierre Gasly',
    firstName: 'Pierre',
    lastName: 'Gasly',
    tla: 'GAS',
    team: 'Alpine Renault',
    teamColor: '#0093CC'
  },
  '11': {
    broadcastName: 'S PEREZ',
    fullName: 'Sergio Pérez',
    firstName: 'Sergio',
    lastName: 'Pérez',
    tla: 'PER',
    team: 'Red Bull Racing Honda RBPT',
    teamColor: '#3671C6'
  },
  '14': {
    broadcastName: 'F ALONSO',
    fullName: 'Fernando Alonso',
    firstName: 'Fernando',
    lastName: 'Alonso',
    tla: 'ALO',
    team: 'Aston Martin Aramco Mercedes',
    teamColor: '#229971'
  },
  '16': {
    broadcastName: 'C LECLERC',
    fullName: 'Charles Leclerc',
    firstName: 'Charles',
    lastName: 'Leclerc',
    tla: 'LEC',
    team: 'Ferrari',
    teamColor: '#E8002D'
  },
  '18': {
    broadcastName: 'L STROLL',
    fullName: 'Lance Stroll',
    firstName: 'Lance',
    lastName: 'Stroll',
    tla: 'STR',
    team: 'Aston Martin Aramco Mercedes',
    teamColor: '#229971'
  },
  '20': {
    broadcastName: 'K MAGNUSSEN',
    fullName: 'Kevin Magnussen',
    firstName: 'Kevin',
    lastName: 'Magnussen',
    tla: 'MAG',
    team: 'Haas Ferrari',
    teamColor: '#B6BABD'
  },
  '22': {
    broadcastName: 'Y TSUNODA',
    fullName: 'Yuki Tsunoda',
    firstName: 'Yuki',
    lastName: 'Tsunoda',
    tla: 'TSU',
    team: 'RB Honda RBPT',
    teamColor: '#6692FF'
  },
  '23': {
    broadcastName: 'A ALBON',
    fullName: 'Alexander Albon',
    firstName: 'Alexander',
    lastName: 'Albon',
    tla: 'ALB',
    team: 'Williams Mercedes',
    teamColor: '#64C4FF'
  },
  '24': {
    broadcastName: 'G ZHOU',
    fullName: 'Guanyu Zhou',
    firstName: 'Guanyu',
    lastName: 'Zhou',
    tla: 'ZHO',
    team: 'Kick Sauber Ferrari',
    teamColor: '#52E252'
  },
  '27': {
    broadcastName: 'N HULKENBERG',
    fullName: 'Nico Hülkenberg',
    firstName: 'Nico',
    lastName: 'Hülkenberg',
    tla: 'HUL',
    team: 'Haas Ferrari',
    teamColor: '#B6BABD'
  },
  '31': {
    broadcastName: 'E OCON',
    fullName: 'Esteban Ocon',
    firstName: 'Esteban',
    lastName: 'Ocon',
    tla: 'OCO',
    team: 'Alpine Renault',
    teamColor: '#0093CC'
  },
  '44': {
    broadcastName: 'L HAMILTON',
    fullName: 'Lewis Hamilton',
    firstName: 'Lewis',
    lastName: 'Hamilton',
    tla: 'HAM',
    team: 'Mercedes',
    teamColor: '#27F4D2'
  },
  '55': {
    broadcastName: 'C SAINZ',
    fullName: 'Carlos Sainz',
    firstName: 'Carlos',
    lastName: 'Sainz',
    tla: 'SAI',
    team: 'Ferrari',
    teamColor: '#E8002D'
  },
  '63': {
    broadcastName: 'G RUSSELL',
    fullName: 'George Russell',
    firstName: 'George',
    lastName: 'Russell',
    tla: 'RUS',
    team: 'Mercedes',
    teamColor: '#27F4D2'
  },
  '77': {
    broadcastName: 'V BOTTAS',
    fullName: 'Valtteri Bottas',
    firstName: 'Valtteri',
    lastName: 'Bottas',
    tla: 'BOT',
    team: 'Kick Sauber Ferrari',
    teamColor: '#52E252'
  },
  '81': {
    broadcastName: 'O PIASTRI',
    fullName: 'Oscar Piastri',
    firstName: 'Oscar',
    lastName: 'Piastri',
    tla: 'PIA',
    team: 'McLaren Mercedes',
    teamColor: '#FF8000'
  }
};

/**
 * Get fallback driver information by driver number
 * @param {string} driverNumber - Driver racing number
 * @returns {Object|null} Driver information or null if not found
 */
function getFallbackDriverInfo(driverNumber) {
  return DRIVER_MAPPINGS[driverNumber] || null;
}

/**
 * Get all available driver mappings
 * @returns {Object} All driver mappings
 */
function getAllDriverMappings() {
  return DRIVER_MAPPINGS;
}

/**
 * Check if driver number exists in mappings
 * @param {string} driverNumber - Driver racing number
 * @returns {boolean} True if driver exists in mappings
 */
function hasDriverMapping(driverNumber) {
  return driverNumber in DRIVER_MAPPINGS;
}

/**
 * Get driver TLA (Three Letter Abbreviation) by number
 * @param {string} driverNumber - Driver racing number
 * @returns {string|null} Driver TLA or null if not found
 */
function getDriverTLA(driverNumber) {
  const driver = DRIVER_MAPPINGS[driverNumber];
  return driver ? driver.tla : null;
}

/**
 * Get driver full name by number
 * @param {string} driverNumber - Driver racing number
 * @returns {string|null} Driver full name or null if not found
 */
function getDriverFullName(driverNumber) {
  const driver = DRIVER_MAPPINGS[driverNumber];
  return driver ? driver.fullName : null;
}

/**
 * Get team name by driver number
 * @param {string} driverNumber - Driver racing number
 * @returns {string|null} Team name or null if not found
 */
function getTeamName(driverNumber) {
  const driver = DRIVER_MAPPINGS[driverNumber];
  return driver ? driver.team : null;
}

/**
 * Update driver mapping (for dynamic updates)
 * @param {string} driverNumber - Driver racing number
 * @param {Object} driverInfo - New driver information
 */
function updateDriverMapping(driverNumber, driverInfo) {
  DRIVER_MAPPINGS[driverNumber] = {
    ...DRIVER_MAPPINGS[driverNumber],
    ...driverInfo
  };
}

module.exports = {
  getFallbackDriverInfo,
  getAllDriverMappings,
  hasDriverMapping,
  getDriverTLA,
  getDriverFullName,
  getTeamName,
  updateDriverMapping,
  DRIVER_MAPPINGS
};