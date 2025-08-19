const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { validateSessionQuery, validateSessionSubscription, validateContentType } = require('../middleware/validation');
const { getCacheService } = require('../services/cache');

// Mock data store - in a real implementation, this would come from the data cache
let currentSessionData = {
  sessionName: null,
  sessionType: null,
  sessionState: 'INACTIVE',
  timeRemaining: null,
  totalLaps: null,
  currentLap: null,
  started: null,
  ended: null,
  weather: null,
  trackStatus: 'Green',
  lastUpdated: null
};

// GET /api/session/current - Get current session information
router.get('/current', async (req, res) => {
  try {
    logger.info('Session current data requested');

    // Get data from cache service
    let sessionData = null;
    let source = 'cache';
    
    try {
      const cacheService = getCacheService();
      sessionData = await cacheService.getSessionData();
    } catch (cacheError) {
      logger.warn('Failed to get session data from cache:', cacheError);
    }

    // Fallback to mock data if no cached data available
    if (!sessionData) {
      sessionData = {
        ...currentSessionData,
        available: currentSessionData.lastUpdated !== null
      };
      source = 'fallback';
    }

    res.json({
      success: true,
      data: {
        ...sessionData,
        timestamp: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
        source: source,
        cached: source === 'cache'
      }
    });

  } catch (error) {
    logger.error('Error fetching current session data:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch current session data',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/session/status - Get session connection status
router.get('/status', async (req, res) => {
  try {
    // In a real implementation, you would get this from your SignalR service
    const connectionStatus = {
      connected: false, // This would be dynamically determined
      lastHeartbeat: null,
      subscriptions: [],
      reconnectAttempts: 0
    };

    res.json({
      success: true,
      data: {
        connectionStatus,
        dataAvailable: currentSessionData.lastUpdated !== null,
        lastDataUpdate: currentSessionData.lastUpdated,
        serverTime: new Date().toISOString()
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error fetching session status:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch session status',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/session/history - Get session history (last N sessions)
router.get('/history', validateSessionQuery, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    // Mock session history - in a real implementation, this would come from a database
    const sessions = [
      {
        id: 1,
        sessionName: 'Race',
        sessionType: 'Race',
        date: '2024-03-24',
        location: 'Bahrain International Circuit',
        completed: true
      },
      {
        id: 2,
        sessionName: 'Qualifying',
        sessionType: 'Qualifying',
        date: '2024-03-23',
        location: 'Bahrain International Circuit',
        completed: true
      }
    ];

    const paginatedSessions = sessions.slice(offset, offset + limit);

    res.json({
      success: true,
      data: {
        sessions: paginatedSessions,
        pagination: {
          total: sessions.length,
          limit,
          offset,
          hasMore: offset + limit < sessions.length
        }
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error fetching session history:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch session history',
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/session/subscribe - Subscribe to session updates (for admin)
router.post('/subscribe', validateContentType(), validateSessionSubscription, async (req, res) => {
  try {
    const { feeds } = req.body;
    
    if (!Array.isArray(feeds)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'feeds must be an array',
        timestamp: new Date().toISOString()
      });
    }

    // In a real implementation, you would interact with your SignalR service
    logger.info(`Session subscription request for feeds: ${feeds.join(', ')}`);

    res.json({
      success: true,
      data: {
        subscribedFeeds: feeds,
        subscriptionId: `sub_${Date.now()}`,
        message: 'Subscription request processed'
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error processing session subscription:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to process subscription request',
      timestamp: new Date().toISOString()
    });
  }
});

// Middleware to update current session data (would be called by SignalR service)
function updateSessionData(sessionData) {
  currentSessionData = {
    ...currentSessionData,
    ...sessionData,
    lastUpdated: new Date().toISOString()
  };
  
  logger.debug('Session data updated:', currentSessionData);
}

module.exports = { router, updateSessionData };