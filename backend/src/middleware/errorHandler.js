const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg.match(/(["'])(?:(?=(\\?))\2.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = () =>
  new AppError('Your token has expired! Please log in again.', 401);

// Utility functions for secure error handling
const generateErrorId = () => {
  return crypto.randomUUID();
};

const sanitizeErrorMessage = (message) => {
  if (!message || typeof message !== 'string') {
    return 'An error occurred';
  }
  
  // Remove potentially sensitive information patterns
  const sensitivePatterns = [
    /password/gi,
    /token/gi,
    /secret/gi,
    /key/gi,
    /authorization/gi,
    /credential/gi,
    /session/gi,
    /cookie/gi,
    /\b\d{4,}\b/g, // Remove long numbers (potential IDs)
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Remove email addresses
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, // Remove IP addresses
    /file:\/\/|\/[a-zA-Z0-9_\-\/\.]+/g, // Remove file paths
    /Error: /g, // Remove "Error: " prefix
  ];
  
  let sanitized = message;
  sensitivePatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });
  
  // Limit message length to prevent information disclosure
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 197) + '...';
  }
  
  return sanitized.trim() || 'An error occurred';
};

const sendErrorDev = (err, res) => {
  logger.error('Development Error:', {
    error: err.message,
    stack: err.stack,
    status: err.status,
    statusCode: err.statusCode
  });

  // Even in development, be cautious about exposing stack traces to client
  // Only include stack trace if explicitly enabled via environment variable
  const includeStack = process.env.EXPOSE_ERROR_STACK === 'true';
  
  const errorResponse = {
    success: false,
    error: err.status,
    message: err.message,
    timestamp: new Date().toISOString(),
    environment: 'development'
  };
  
  if (includeStack) {
    errorResponse.stack = err.stack;
    errorResponse.warning = 'Stack trace included - disable EXPOSE_ERROR_STACK in production';
  }

  res.status(err.statusCode).json(errorResponse);
};

const sendErrorProd = (err, res) => {
  // Log comprehensive error details for debugging (server-side only)
  logger.error('Production Error:', {
    error: err.message,
    status: err.status,
    statusCode: err.statusCode,
    isOperational: err.isOperational,
    stack: err.stack, // Log stack trace server-side for debugging
    errorId: err.errorId || generateErrorId(),
    timestamp: new Date().toISOString()
  });

  // Operational, trusted error: send sanitized message to client
  if (err.isOperational) {
    // Sanitize error message to prevent information disclosure
    const sanitizedMessage = sanitizeErrorMessage(err.message);
    
    res.status(err.statusCode).json({
      success: false,
      error: err.status,
      message: sanitizedMessage,
      errorId: err.errorId || generateErrorId(),
      timestamp: new Date().toISOString()
    });
  } else {
    // Programming or other unknown error: never leak error details
    const errorId = generateErrorId();
    
    logger.error('Unexpected Error (Critical):', {
      errorId,
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      error: 'error',
      message: 'An internal server error occurred. Please try again later.',
      errorId,
      timestamp: new Date().toISOString()
    });
  }
};

const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log the error with request context
  logger.error('Error occurred:', {
    error: err.message,
    statusCode: err.statusCode,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  if (config.nodeEnv === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // Handle specific error types
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, res);
  }
};

// Async error catcher utility
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Handle unhandled routes
const handleNotFound = (req, res, next) => {
  const err = new AppError(`Can't find ${req.originalUrl} on this server!`, 404);
  next(err);
};

// Graceful shutdown handlers
const handleUncaughtException = () => {
  process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION! Shutting down...', {
      error: err.message,
      stack: err.stack
    });
    process.exit(1);
  });
};

const handleUnhandledRejection = (server) => {
  process.on('unhandledRejection', (err) => {
    logger.error('UNHANDLED REJECTION! Shutting down...', {
      error: err.message,
      stack: err.stack
    });
    
    if (server) {
      server.close(() => {
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  });
};

// SignalR specific error handlers
const handleSignalRConnectionError = (error) => {
  logger.error('SignalR Connection Error:', {
    error: error.message,
    type: 'SignalR',
    timestamp: new Date().toISOString()
  });
  
  return new AppError('Failed to connect to F1 Live Timing service', 503);
};

const handleSignalRDataError = (error, feedName) => {
  logger.error('SignalR Data Processing Error:', {
    error: error.message,
    feedName,
    type: 'SignalR Data',
    timestamp: new Date().toISOString()
  });
  
  return new AppError(`Failed to process ${feedName} data feed`, 500);
};

// WebSocket error handlers
const handleWebSocketError = (error, socketId) => {
  logger.error('WebSocket Error:', {
    error: error.message,
    socketId,
    type: 'WebSocket',
    timestamp: new Date().toISOString()
  });
};

// Rate limiting error handler
const handleRateLimitError = (req, res) => {
  logger.warn('Rate limit exceeded:', {
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  res.status(429).json({
    success: false,
    error: 'Too Many Requests',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes',
    timestamp: new Date().toISOString()
  });
};

// Validation error handler
const handleValidationError = (errors) => {
  const formattedErrors = errors.map(error => ({
    field: error.context?.key || error.path?.[0],
    message: error.message,
    value: error.context?.value
  }));

  return new AppError(`Validation failed: ${formattedErrors.map(e => e.message).join(', ')}`, 400);
};

module.exports = {
  AppError,
  globalErrorHandler,
  catchAsync,
  handleNotFound,
  handleUncaughtException,
  handleUnhandledRejection,
  handleSignalRConnectionError,
  handleSignalRDataError,
  handleWebSocketError,
  handleRateLimitError,
  handleValidationError,
  generateErrorId,
  sanitizeErrorMessage
};