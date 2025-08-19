const logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log incoming request
  logger.info('Incoming request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    timestamp: new Date().toISOString()
  });

  // Override res.end to capture response details
  const originalEnd = res.end;
  const originalJson = res.json;

  let responseBody;
  
  // Capture JSON responses
  res.json = function(body) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  // Capture response when request ends
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;
    
    // Log response details
    logger.info('Request completed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      ip: req.ip,
      success: res.statusCode < 400,
      timestamp: new Date().toISOString()
    });

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        method: req.method,
        url: req.originalUrl,
        duration: `${duration}ms`,
        statusCode: res.statusCode,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
    }

    // Log error responses with more detail
    if (res.statusCode >= 400) {
      logger.warn('Error response', {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        responseBody: responseBody ? JSON.stringify(responseBody).substring(0, 500) : undefined,
        timestamp: new Date().toISOString()
      });
    }

    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

module.exports = requestLogger;