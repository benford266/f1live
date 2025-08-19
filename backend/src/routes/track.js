const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { validateTrackId, validateTrackQuery } = require('../middleware/validation');

// Mock track data - in a real implementation, this would come from a database or external API
const trackData = {
  'bahrain': {
    id: 'bahrain',
    name: 'Bahrain International Circuit',
    location: 'Sakhir, Bahrain',
    country: 'Bahrain',
    countryCode: 'BH',
    length: 5.412, // km
    turns: 15,
    drsZones: 3,
    lapRecord: {
      time: '1:31.447',
      driver: 'Pedro de la Rosa',
      year: 2005
    },
    sectors: [
      { sector: 1, length: 1.753, description: 'Technical opening section' },
      { sector: 2, length: 2.134, description: 'High-speed middle sector' },
      { sector: 3, length: 1.525, description: 'Tight final sector' }
    ],
    coordinates: [
      { turn: 1, x: 100, y: 200, type: 'corner', angle: 90 },
      { turn: 2, x: 150, y: 180, type: 'corner', angle: 45 },
      // ... more coordinate data would be here
    ],
    features: {
      drs: [
        { zone: 1, start: 1200, end: 1800, description: 'Main straight' },
        { zone: 2, start: 2800, end: 3200, description: 'Back straight' },
        { zone: 3, start: 4100, end: 4500, description: 'Final sector straight' }
      ],
      brakeZones: [
        { turn: 1, distance: 150, intensity: 'high' },
        { turn: 4, distance: 120, intensity: 'medium' },
        // ... more brake zones
      ]
    },
    weather: {
      typical: {
        temperature: { min: 25, max: 35 },
        humidity: { min: 45, max: 75 },
        rainfall: 'rare'
      }
    }
  },
  'silverstone': {
    id: 'silverstone',
    name: 'Silverstone Circuit',
    location: 'Silverstone, England',
    country: 'United Kingdom',
    countryCode: 'GB',
    length: 5.891,
    turns: 18,
    drsZones: 2,
    lapRecord: {
      time: '1:27.097',
      driver: 'Max Verstappen',
      year: 2020
    },
    sectors: [
      { sector: 1, length: 2.045, description: 'High-speed opening' },
      { sector: 2, length: 2.134, description: 'Technical middle section' },
      { sector: 3, length: 1.712, description: 'Fast final sector' }
    ],
    coordinates: [],
    features: {
      drs: [
        { zone: 1, start: 800, end: 1400, description: 'Hangar straight' },
        { zone: 2, start: 4200, end: 4800, description: 'Wellington straight' }
      ],
      brakeZones: []
    },
    weather: {
      typical: {
        temperature: { min: 15, max: 25 },
        humidity: { min: 60, max: 85 },
        rainfall: 'common'
      }
    }
  }
  // Add more tracks as needed
};

let currentTrackStatus = {
  trackId: null,
  status: 'Green',
  message: null,
  temperature: null,
  weather: null,
  session: null,
  lastUpdated: null
};

// GET /api/track - Get list of all available tracks
router.get('/', async (req, res) => {
  try {
    logger.info('Track list requested');

    const tracks = Object.values(trackData).map(track => ({
      id: track.id,
      name: track.name,
      location: track.location,
      country: track.country,
      countryCode: track.countryCode,
      length: track.length,
      turns: track.turns,
      lapRecord: track.lapRecord
    }));

    res.json({
      success: true,
      data: {
        tracks,
        count: tracks.length,
        currentTrack: currentTrackStatus.trackId
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error fetching track list:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch track list',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/track/:id - Get specific track information and layout
router.get('/:id', validateTrackId, validateTrackQuery, async (req, res) => {
  try {
    const trackId = req.params.id.toLowerCase();
    const includeLayout = req.query.layout === 'true';
    const includeWeather = req.query.weather === 'true';
    
    logger.info(`Track ${trackId} data requested (layout: ${includeLayout}, weather: ${includeWeather})`);

    const track = trackData[trackId];

    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Track '${trackId}' not found`,
        availableTracks: Object.keys(trackData),
        timestamp: new Date().toISOString()
      });
    }

    let responseData = {
      ...track,
      status: currentTrackStatus.trackId === trackId ? currentTrackStatus : null
    };

    // Remove layout data if not requested
    if (!includeLayout) {
      delete responseData.coordinates;
      delete responseData.features;
    }

    // Remove weather data if not requested
    if (!includeWeather) {
      delete responseData.weather;
    }

    res.json({
      success: true,
      data: responseData,
      meta: {
        timestamp: new Date().toISOString(),
        includeLayout,
        includeWeather,
        isCurrentTrack: currentTrackStatus.trackId === trackId
      }
    });

  } catch (error) {
    logger.error(`Error fetching track ${req.params.id} data:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: `Failed to fetch track ${req.params.id} data`,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/track/:id/layout - Get track layout coordinates
router.get('/:id/layout', validateTrackId, validateTrackQuery, async (req, res) => {
  try {
    const trackId = req.params.id.toLowerCase();
    const detailed = req.query.detailed === 'true';
    
    logger.info(`Track ${trackId} layout requested (detailed: ${detailed})`);

    const track = trackData[trackId];

    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Track '${trackId}' not found`,
        timestamp: new Date().toISOString()
      });
    }

    let layoutData = {
      trackId,
      name: track.name,
      length: track.length,
      coordinates: track.coordinates || [],
      sectors: track.sectors
    };

    if (detailed) {
      layoutData.features = track.features;
      layoutData.turns = track.turns;
      layoutData.drsZones = track.drsZones;
    }

    res.json({
      success: true,
      data: layoutData,
      meta: {
        timestamp: new Date().toISOString(),
        detailed,
        coordinateCount: layoutData.coordinates.length
      }
    });

  } catch (error) {
    logger.error(`Error fetching track ${req.params.id} layout:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: `Failed to fetch track ${req.params.id} layout`,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/track/:id/status - Get current track status
router.get('/:id/status', validateTrackId, async (req, res) => {
  try {
    const trackId = req.params.id.toLowerCase();
    
    logger.info(`Track ${trackId} status requested`);

    if (!trackData[trackId]) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Track '${trackId}' not found`,
        timestamp: new Date().toISOString()
      });
    }

    const isCurrentTrack = currentTrackStatus.trackId === trackId;
    const statusData = isCurrentTrack ? currentTrackStatus : {
      trackId,
      status: 'Unknown',
      message: 'No active session on this track',
      temperature: null,
      weather: null,
      session: null,
      lastUpdated: null
    };

    res.json({
      success: true,
      data: {
        ...statusData,
        isActive: isCurrentTrack
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error(`Error fetching track ${req.params.id} status:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: `Failed to fetch track ${req.params.id} status`,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/track/:id/sectors - Get track sector information
router.get('/:id/sectors', validateTrackId, async (req, res) => {
  try {
    const trackId = req.params.id.toLowerCase();
    
    logger.info(`Track ${trackId} sectors requested`);

    const track = trackData[trackId];

    if (!track) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Track '${trackId}' not found`,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        trackId,
        name: track.name,
        sectors: track.sectors,
        totalLength: track.length,
        sectorCount: track.sectors.length
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error(`Error fetching track ${req.params.id} sectors:`, error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: `Failed to fetch track ${req.params.id} sectors`,
      timestamp: new Date().toISOString()
    });
  }
});

// Function to update track status (would be called by the data processor)
function updateTrackStatus(trackId, status) {
  currentTrackStatus = {
    trackId,
    ...status,
    lastUpdated: new Date().toISOString()
  };
  
  logger.debug(`Track status updated for ${trackId}:`, currentTrackStatus);
}

// Function to get track data by ID (for internal use)
function getTrackById(trackId) {
  return trackData[trackId.toLowerCase()] || null;
}

module.exports = { 
  router, 
  updateTrackStatus, 
  getTrackById,
  trackData 
};