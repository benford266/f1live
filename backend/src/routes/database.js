/**
 * Database API Routes
 * Provides endpoints for accessing F1 timing data from the database
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { getDatabaseService } = require('../database');

/**
 * Get all sessions with optional filtering
 * GET /api/database/sessions?track=Monaco&year=2024&type=Race
 */
router.get('/sessions', async (req, res) => {
  try {
    const dbService = getDatabaseService();
    if (!dbService.isInitialized) {
      return res.status(503).json({
        success: false,
        error: 'Database service not available',
        timestamp: new Date().toISOString()
      });
    }

    const { track, year, type, limit = 50, offset = 0 } = req.query;
    
    const filters = {};
    if (track) filters.track = track;
    if (year) filters.year = parseInt(year);
    if (type) filters.type = type;

    const sessions = await dbService.sessions.findWithFilters(filters, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total = await dbService.sessions.count(filters);

    res.json({
      success: true,
      data: {
        sessions,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: total > (parseInt(offset) + sessions.length)
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch sessions',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get session by ID with basic info
 * GET /api/database/sessions/:id
 */
router.get('/sessions/:id', async (req, res) => {
  try {
    const dbService = getDatabaseService();
    if (!dbService.isInitialized) {
      return res.status(503).json({
        success: false,
        error: 'Database service not available',
        timestamp: new Date().toISOString()
      });
    }

    const { id } = req.params;
    const session = await dbService.sessions.findById(parseInt(id));

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        timestamp: new Date().toISOString()
      });
    }

    // Get session drivers
    const drivers = await dbService.drivers.findBySession(session.id);

    res.json({
      success: true,
      data: {
        session,
        drivers: drivers.length,
        driversList: drivers
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching session:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch session',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get timing data for a session
 * GET /api/database/sessions/:id/timing?limit=100
 */
router.get('/sessions/:id/timing', async (req, res) => {
  try {
    const dbService = getDatabaseService();
    if (!dbService.isInitialized) {
      return res.status(503).json({
        success: false,
        error: 'Database service not available',
        timestamp: new Date().toISOString()
      });
    }

    const { id } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const timingData = await dbService.timing.findBySession(parseInt(id), {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        sessionId: parseInt(id),
        timingData,
        count: timingData.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching timing data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch timing data',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get lap times for a session
 * GET /api/database/sessions/:id/laptimes?limit=20
 */
router.get('/sessions/:id/laptimes', async (req, res) => {
  try {
    const dbService = getDatabaseService();
    if (!dbService.isInitialized) {
      return res.status(503).json({
        success: false,
        error: 'Database service not available',
        timestamp: new Date().toISOString()
      });
    }

    const { id } = req.params;
    const { limit = 20 } = req.query;

    const lapTimes = await dbService.lapTimes.getBestLaps(parseInt(id), parseInt(limit));
    const fastestLap = await dbService.lapTimes.getFastestLap(parseInt(id));

    res.json({
      success: true,
      data: {
        sessionId: parseInt(id),
        bestLaps: lapTimes,
        fastestLap,
        count: lapTimes.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching lap times:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch lap times',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get telemetry data for a session
 * GET /api/database/sessions/:id/telemetry?limit=50
 */
router.get('/sessions/:id/telemetry', async (req, res) => {
  try {
    const dbService = getDatabaseService();
    if (!dbService.isInitialized) {
      return res.status(503).json({
        success: false,
        error: 'Database service not available',
        timestamp: new Date().toISOString()
      });
    }

    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const telemetryData = await dbService.telemetry.findBySession(parseInt(id), {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        sessionId: parseInt(id),
        telemetryData,
        count: telemetryData.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching telemetry data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch telemetry data',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get driver data for a session
 * GET /api/database/sessions/:id/drivers
 */
router.get('/sessions/:id/drivers', async (req, res) => {
  try {
    const dbService = getDatabaseService();
    if (!dbService.isInitialized) {
      return res.status(503).json({
        success: false,
        error: 'Database service not available',
        timestamp: new Date().toISOString()
      });
    }

    const { id } = req.params;
    
    const drivers = await dbService.drivers.findBySession(parseInt(id));
    const teamLineup = await dbService.drivers.getTeamLineup(parseInt(id));

    res.json({
      success: true,
      data: {
        sessionId: parseInt(id),
        drivers,
        teamLineup,
        count: drivers.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching drivers:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch drivers',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get available tracks
 * GET /api/database/tracks
 */
router.get('/tracks', async (req, res) => {
  try {
    const dbService = getDatabaseService();
    if (!dbService.isInitialized) {
      return res.status(503).json({
        success: false,
        error: 'Database service not available',
        timestamp: new Date().toISOString()
      });
    }

    const tracks = await dbService.sessions.getUniqueTrackNames();

    res.json({
      success: true,
      data: {
        tracks,
        count: tracks.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching tracks:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch tracks',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get database statistics
 * GET /api/database/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const dbService = getDatabaseService();
    if (!dbService.isInitialized) {
      return res.status(503).json({
        success: false,
        error: 'Database service not available',
        timestamp: new Date().toISOString()
      });
    }

    const stats = await dbService.getStats();
    const sessionStats = await dbService.sessions.getStats();

    res.json({
      success: true,
      data: {
        database: stats,
        sessions: sessionStats
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching database stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch database statistics',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = { router };