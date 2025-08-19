const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { validateDriverNumber, validateDriverQuery, validateTelemetryQuery } = require('../middleware/validation');

// Mock driver data - in a real implementation, this would come from the data cache
let currentDriverData = {
  drivers: {},
  lastUpdated: null,
  sessionActive: false
};

// Mock static driver information (would typically come from a database or API)
const staticDriverInfo = {
  '1': { 
    name: 'Max Verstappen', 
    team: 'Red Bull Racing', 
    number: 1, 
    tla: 'VER', 
    color: '#3671C6',
    country: 'Netherlands'
  },
  '44': { 
    name: 'Lewis Hamilton', 
    team: 'Mercedes', 
    number: 44, 
    tla: 'HAM', 
    color: '#6CD3BF',
    country: 'United Kingdom'
  },
  '16': { 
    name: 'Charles Leclerc', 
    team: 'Ferrari', 
    number: 16, 
    tla: 'LEC', 
    color: '#F91536',
    country: 'Monaco'
  }
  // Add more drivers as needed
};

// GET /api/drivers - Get list of drivers in current session
router.get('/', validateDriverQuery, async (req, res) => {
  try {
    const includeDetails = req.query.details === 'true';
    const onlyActive = req.query.active === 'true';
    
    logger.info(`Drivers data requested (details: ${includeDetails}, active: ${onlyActive})`);

    let driversData = {};

    // Merge static info with live data
    Object.keys(staticDriverInfo).forEach(driverNumber => {
      const staticInfo = staticDriverInfo[driverNumber];
      const liveData = currentDriverData.drivers[driverNumber] || {};
      
      // Skip inactive drivers if requested
      if (onlyActive && !liveData.position) {
        return;
      }

      driversData[driverNumber] = {
        driverNumber,
        name: staticInfo.name,
        team: staticInfo.team,
        tla: staticInfo.tla,
        color: staticInfo.color,
        country: staticInfo.country,
        ...(includeDetails && {
          position: liveData.position || null,
          lapTime: liveData.lapTime || null,
          lapNumber: liveData.lapNumber || null,
          gap: liveData.gap || null,
          interval: liveData.interval || null,
          status: liveData.status || 'UNKNOWN',
          inPit: liveData.inPit || false,
          bestLapTime: liveData.bestLapTime || null,
          lastSector1: liveData.sector1 || null,
          lastSector2: liveData.sector2 || null,
          lastSector3: liveData.sector3 || null
        })
      };
    });

    res.json({
      success: true,
      data: {
        drivers: driversData,
        count: Object.keys(driversData).length,
        sessionActive: currentDriverData.sessionActive,
        lastUpdated: currentDriverData.lastUpdated
      },
      meta: {
        timestamp: new Date().toISOString(),
        includeDetails,
        onlyActive
      }
    });

  } catch (error) {
    logger.error('Error fetching drivers data:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch drivers data',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/drivers/:number - Get specific driver information
router.get('/:number', validateDriverNumber, validateDriverQuery, async (req, res) => {
  try {
    const driverNumber = req.params.number;
    const includeHistory = req.query.history === 'true';
    
    logger.info(`Driver ${driverNumber} data requested (history: ${includeHistory})`);

    const staticInfo = staticDriverInfo[driverNumber];
    const liveData = currentDriverData.drivers[driverNumber] || {};

    if (!staticInfo) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Driver ${driverNumber} not found`,
        timestamp: new Date().toISOString()
      });
    }

    const driverData = {
      driverNumber,
      name: staticInfo.name,
      team: staticInfo.team,
      tla: staticInfo.tla,
      color: staticInfo.color,
      country: staticInfo.country,
      position: liveData.position || null,
      lapTime: liveData.lapTime || null,
      lapNumber: liveData.lapNumber || null,
      gap: liveData.gap || null,
      interval: liveData.interval || null,
      status: liveData.status || 'UNKNOWN',
      inPit: liveData.inPit || false,
      retired: liveData.retired || false,
      bestLapTime: liveData.bestLapTime || null,
      sectors: {
        sector1: liveData.sector1 || null,
        sector2: liveData.sector2 || null,
        sector3: liveData.sector3 || null
      },
      telemetry: {
        speed: liveData.speed || null,
        rpm: liveData.rpm || null,
        gear: liveData.gear || null,
        throttle: liveData.throttle || null,
        brake: liveData.brake || null,
        drs: liveData.drs || null
      }
    };

    if (includeHistory) {
      // Mock lap history - in a real implementation, this would come from stored data
      driverData.lapHistory = [
        { lapNumber: 1, lapTime: '1:32.123', sector1: '28.456', sector2: '35.789', sector3: '27.878' },
        { lapNumber: 2, lapTime: '1:31.987', sector1: '28.234', sector2: '35.567', sector3: '28.186' }
      ];
    }

    res.json({
      success: true,
      data: driverData,
      meta: {
        timestamp: new Date().toISOString(),
        includeHistory,
        lastUpdated: currentDriverData.lastUpdated
      }
    });

  } catch (error) {
    logger.error(`Error fetching driver ${req.params.number} data:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: `Failed to fetch driver ${req.params.number} data`,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/drivers/:number/telemetry - Get driver telemetry data
router.get('/:number/telemetry', validateDriverNumber, validateTelemetryQuery, async (req, res) => {
  try {
    const driverNumber = req.params.number;
    const duration = parseInt(req.query.duration) || 60; // seconds
    
    logger.info(`Driver ${driverNumber} telemetry requested for ${duration}s`);

    if (!staticDriverInfo[driverNumber]) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Driver ${driverNumber} not found`,
        timestamp: new Date().toISOString()
      });
    }

    // Mock telemetry data - in a real implementation, this would come from stored telemetry
    const telemetryData = {
      driverNumber,
      duration,
      samples: [], // Would contain time-series telemetry data
      summary: {
        avgSpeed: null,
        maxSpeed: null,
        avgRpm: null,
        maxRpm: null,
        brakingPoints: [],
        accelerationPoints: []
      },
      lastUpdated: currentDriverData.lastUpdated
    };

    res.json({
      success: true,
      data: telemetryData,
      meta: {
        timestamp: new Date().toISOString(),
        duration,
        sampleCount: telemetryData.samples.length
      }
    });

  } catch (error) {
    logger.error(`Error fetching driver ${req.params.number} telemetry:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: `Failed to fetch driver ${req.params.number} telemetry`,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/drivers/standings - Get current session standings
router.get('/standings', async (req, res) => {
  try {
    logger.info('Driver standings requested');

    // Create standings from current positions
    const standings = Object.entries(currentDriverData.drivers)
      .filter(([_, data]) => data.position !== null)
      .sort((a, b) => a[1].position - b[1].position)
      .map(([driverNumber, data]) => {
        const staticInfo = staticDriverInfo[driverNumber] || {};
        return {
          position: data.position,
          driverNumber,
          name: staticInfo.name || `Driver ${driverNumber}`,
          team: staticInfo.team || 'Unknown',
          tla: staticInfo.tla || '???',
          lapTime: data.lapTime,
          gap: data.gap,
          interval: data.interval,
          laps: data.lapNumber,
          status: data.status
        };
      });

    res.json({
      success: true,
      data: {
        standings,
        totalDrivers: standings.length,
        sessionActive: currentDriverData.sessionActive,
        lastUpdated: currentDriverData.lastUpdated
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error fetching driver standings:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch driver standings',
      timestamp: new Date().toISOString()
    });
  }
});

// Function to update driver data (would be called by the data processor)
function updateDriverData(driversData) {
  currentDriverData = {
    drivers: driversData || {},
    lastUpdated: new Date().toISOString(),
    sessionActive: Object.keys(driversData || {}).length > 0
  };
  
  logger.debug(`Driver data updated for ${Object.keys(currentDriverData.drivers).length} drivers`);
}

module.exports = { router, updateDriverData };