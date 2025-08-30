/**
 * Track Mapping API Routes
 * Provides endpoints for F1 track maps and driver positions
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// This will be injected by the main server
let trackMappingService = null;

/**
 * Set track mapping service instance
 * @param {TrackMappingService} service - Track mapping service instance
 */
function setTrackMappingService(service) {
  trackMappingService = service;
}

/**
 * Get current track map with driver positions
 * GET /api/track/map
 */
router.get('/map', async (req, res) => {
  try {
    if (!trackMappingService) {
      return res.status(503).json({
        success: false,
        error: 'Track mapping service not available',
        timestamp: new Date().toISOString()
      });
    }

    const trackData = trackMappingService.exportTrackMap();
    
    res.json({
      success: true,
      data: trackData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching track map:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch track map',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get only current driver positions
 * GET /api/track/positions
 */
router.get('/positions', async (req, res) => {
  try {
    if (!trackMappingService) {
      return res.status(503).json({
        success: false,
        error: 'Track mapping service not available',
        timestamp: new Date().toISOString()
      });
    }

    const driverPositions = trackMappingService.getCurrentDriverPositions();
    
    res.json({
      success: true,
      data: {
        positions: driverPositions,
        count: Object.keys(driverPositions).length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching driver positions:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch driver positions',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get track map without driver positions
 * GET /api/track/layout
 */
router.get('/layout', async (req, res) => {
  try {
    if (!trackMappingService) {
      return res.status(503).json({
        success: false,
        error: 'Track mapping service not available',
        timestamp: new Date().toISOString()
      });
    }

    const { trackName = 'Current Track' } = req.query;
    const trackMap = trackMappingService.generateTrackMap(trackName);
    
    if (!trackMap) {
      return res.status(404).json({
        success: false,
        error: 'Track map not available',
        message: 'Insufficient data to generate track map',
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      data: trackMap,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching track layout:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch track layout',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get track mapping statistics
 * GET /api/track/stats
 */
router.get('/stats', async (req, res) => {
  try {
    if (!trackMappingService) {
      return res.status(503).json({
        success: false,
        error: 'Track mapping service not available',
        timestamp: new Date().toISOString()
      });
    }

    const stats = {
      trackCoordinates: trackMappingService.trackCoordinates.size,
      activeDrivers: trackMappingService.driverPositions.size,
      trackBounds: trackMappingService.trackBounds,
      hasTrackData: trackMappingService.trackCoordinates.size > 0,
      hasPositionData: trackMappingService.driverPositions.size > 0,
      dataQuality: {
        sufficient: trackMappingService.trackCoordinates.size >= 100,
        excellent: trackMappingService.trackCoordinates.size >= 500
      }
    };
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching track stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch track statistics',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Clear track mapping data (for new session)
 * POST /api/track/clear
 */
router.post('/clear', async (req, res) => {
  try {
    if (!trackMappingService) {
      return res.status(503).json({
        success: false,
        error: 'Track mapping service not available',
        timestamp: new Date().toISOString()
      });
    }

    trackMappingService.clear();
    
    res.json({
      success: true,
      message: 'Track mapping data cleared',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error clearing track data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to clear track data',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = { router, setTrackMappingService };