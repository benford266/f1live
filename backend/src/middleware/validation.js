const Joi = require('joi');
const createDOMPurify = require('isomorphic-dompurify');
const { handleValidationError } = require('./errorHandler');
const logger = require('../utils/logger');

const DOMPurify = createDOMPurify();

// Enhanced validation middleware factory with sanitization
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    // Pre-sanitization for potential XSS attacks
    if (req[property] && typeof req[property] === 'object') {
      req[property] = sanitizeObject(req[property]);
    }

    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true,
      convert: true,
      presence: 'required'
    });

    if (error) {
      const validationError = handleValidationError(error.details);
      return next(validationError);
    }

    // Apply additional sanitization after validation
    const sanitizedValue = deepSanitize(value);
    
    // Replace the property with the validated and sanitized value
    req[property] = sanitizedValue;
    next();
  };
};

// Common validation schemas
const schemas = {
  // Query parameter schemas
  paginationQuery: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(10),
    offset: Joi.number().integer().min(0).default(0),
    page: Joi.number().integer().min(1).default(1)
  }),

  // Driver-related schemas
  driverNumber: Joi.object({
    number: Joi.string().pattern(/^\d{1,2}$/).required().messages({
      'string.pattern.base': 'Driver number must be 1-2 digits'
    })
  }),

  driverQuery: Joi.object({
    details: Joi.boolean().default(false),
    active: Joi.boolean().default(false),
    history: Joi.boolean().default(false)
  }),

  telemetryQuery: Joi.object({
    duration: Joi.number().integer().min(10).max(3600).default(60).messages({
      'number.min': 'Duration must be at least 10 seconds',
      'number.max': 'Duration cannot exceed 1 hour (3600 seconds)'
    })
  }),

  // Track-related schemas
  trackId: Joi.object({
    id: Joi.string().alphanum().lowercase().min(3).max(20).required().messages({
      'string.alphanum': 'Track ID must contain only letters and numbers',
      'string.min': 'Track ID must be at least 3 characters',
      'string.max': 'Track ID cannot exceed 20 characters'
    })
  }),

  trackQuery: Joi.object({
    layout: Joi.boolean().default(false),
    weather: Joi.boolean().default(false),
    detailed: Joi.boolean().default(false)
  }),

  // Session-related schemas
  sessionSubscription: Joi.object({
    feeds: Joi.array()
      .items(Joi.string().valid(
        'TimingData',
        'CarData.z',
        'Position.z',
        'SessionInfo',
        'DriverList',
        'WeatherData',
        'TrackStatus',
        'SessionData',
        'RaceControlMessages',
        'Heartbeat'
      ))
      .min(1)
      .max(10)
      .unique()
      .required()
      .messages({
        'array.min': 'At least one feed must be specified',
        'array.max': 'Cannot subscribe to more than 10 feeds at once',
        'array.unique': 'Feed names must be unique',
        'any.only': 'Invalid feed name'
      })
  }),

  sessionQuery: Joi.object({
    limit: Joi.number().integer().min(1).max(50).default(10),
    offset: Joi.number().integer().min(0).default(0)
  }),

  // WebSocket-related schemas
  websocketSubscription: Joi.object({
    action: Joi.string().valid('subscribe', 'unsubscribe').required(),
    feedName: Joi.string().valid(
      'TimingData',
      'CarData.z',
      'Position.z',
      'SessionInfo',
      'DriverList',
      'WeatherData',
      'TrackStatus',
      'SessionData',
      'RaceControlMessages',
      'heartbeat'
    ).required(),
    clientId: Joi.string().uuid().optional()
  }),

  // General utility schemas
  dateRange: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional()
  }),

  sortOrder: Joi.object({
    sortBy: Joi.string().valid('name', 'position', 'time', 'created', 'updated').default('created'),
    sortOrder: Joi.string().valid('asc', 'desc').default('asc')
  })
};

// Specific validation middleware functions
const validateDriverNumber = validate(schemas.driverNumber, 'params');
const validateDriverQuery = validate(schemas.driverQuery, 'query');
const validateTelemetryQuery = validate(schemas.telemetryQuery, 'query');
const validateTrackId = validate(schemas.trackId, 'params');
const validateTrackQuery = validate(schemas.trackQuery, 'query');
const validateSessionSubscription = validate(schemas.sessionSubscription, 'body');
const validateSessionQuery = validate(schemas.sessionQuery, 'query');
const validatePaginationQuery = validate(schemas.paginationQuery, 'query');

// Custom validation functions
const validateApiKey = (req, res, next) => {
  const apiKey = req.header('X-API-Key');
  
  if (!apiKey && process.env.REQUIRE_API_KEY === 'true') {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'API key required',
      timestamp: new Date().toISOString()
    });
  }

  // In a real implementation, you would validate the API key against a database
  if (apiKey && !isValidApiKey(apiKey)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid API key',
      timestamp: new Date().toISOString()
    });
  }

  next();
};

const validateContentType = (expectedType = 'application/json') => {
  return (req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const contentType = req.get('Content-Type');
      
      if (!contentType || !contentType.includes(expectedType)) {
        return res.status(415).json({
          success: false,
          error: 'Unsupported Media Type',
          message: `Expected Content-Type: ${expectedType}`,
          received: contentType || 'none',
          timestamp: new Date().toISOString()
        });
      }
    }
    
    next();
  };
};

// Helper function to validate API key (mock implementation)
function isValidApiKey(apiKey) {
  // In a real implementation, this would check against a database or service
  const validKeys = [
    'dev-key-123456',
    'test-key-789012'
  ];
  
  return validKeys.includes(apiKey);
}

// Enhanced sanitization helpers with context-aware processing
const sanitizeString = (str, context = 'general') => {
  if (typeof str !== 'string') return str;
  
  // Context-specific DOMPurify configurations
  const contextConfigs = {
    general: {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
      ALLOW_DATA_ATTR: false,
      SANITIZE_DOM: true
    },
    url: {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
      ALLOW_DATA_ATTR: false,
      SANITIZE_DOM: true,
      ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp):\/\/)?[\w\-_.]+(:\d+)?(?:\/[\w\-_.~%!$&'()*+,;=:@\/]*)?(?:\?[\w\-_.~%!$&'()*+,;=:@\/]*)?(?:#[\w\-_.~%!$&'()*+,;=:@\/]*)?$/i
    },
    email: {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
      ALLOW_DATA_ATTR: false,
      SANITIZE_DOM: true
    },
    filename: {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
      ALLOW_DATA_ATTR: false,
      SANITIZE_DOM: true
    },
    numeric: {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
      ALLOW_DATA_ATTR: false,
      SANITIZE_DOM: true
    }
  };
  
  const config = contextConfigs[context] || contextConfigs.general;
  
  // Use DOMPurify with context-specific configuration
  let cleaned = DOMPurify.sanitize(str, config);
  
  // Context-specific additional cleaning
  switch (context) {
    case 'url':
      cleaned = sanitizeUrl(cleaned);
      break;
    case 'email':
      cleaned = sanitizeEmail(cleaned);
      break;
    case 'filename':
      cleaned = sanitizeFilename(cleaned);
      break;
    case 'numeric':
      cleaned = sanitizeNumeric(cleaned);
      break;
    default:
      cleaned = sanitizeGeneral(cleaned);
  }
  
  return cleaned;
};

// Context-specific sanitization functions
const sanitizeGeneral = (str) => {
  return str
    .trim()
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/style\s*=/gi, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/url\s*\(/gi, '')
    .replace(/import\s+/gi, '')
    .slice(0, 10000); // Prevent extremely long strings
};

const sanitizeUrl = (str) => {
  // Remove dangerous protocols and characters
  return str
    .trim()
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/file:/gi, '')
    .replace(/ftp:/gi, '')
    .replace(/[\s<>"']/g, '')
    .slice(0, 2048); // URLs shouldn't be extremely long
};

const sanitizeEmail = (str) => {
  // Basic email format validation and sanitization
  return str
    .trim()
    .toLowerCase()
    .replace(/[^\w@.-]/g, '')
    .slice(0, 254); // RFC 5321 email length limit
};

const sanitizeFilename = (str) => {
  // Remove dangerous filename characters
  return str
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    .slice(0, 255); // Filesystem filename length limit
};

const sanitizeNumeric = (str) => {
  // Keep only numeric characters and basic math symbols
  return str
    .trim()
    .replace(/[^\d.,\-+]/g, '')
    .slice(0, 50); // Reasonable number length
};

const sanitizeObject = (obj, keyContext = {}) => {
  if (obj === null || typeof obj !== 'object') {
    return typeof obj === 'string' ? sanitizeString(obj) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, keyContext));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Determine context based on key name
    const context = determineContextFromKey(key, keyContext);
    
    // Sanitize the key as well
    const cleanKey = sanitizeString(key, 'general');
    
    if (typeof value === 'string') {
      sanitized[cleanKey] = sanitizeString(value, context);
    } else {
      sanitized[cleanKey] = sanitizeObject(value, keyContext);
    }
  }
  
  return sanitized;
};

// Context determination based on key patterns
const determineContextFromKey = (key, customContext = {}) => {
  // Use custom context if provided
  if (customContext[key]) {
    return customContext[key];
  }
  
  const keyLower = key.toLowerCase();
  
  // URL-related fields
  if (keyLower.includes('url') || keyLower.includes('link') || keyLower.includes('href') || keyLower.includes('src')) {
    return 'url';
  }
  
  // Email fields
  if (keyLower.includes('email') || keyLower.includes('mail')) {
    return 'email';
  }
  
  // Filename fields
  if (keyLower.includes('file') || keyLower.includes('filename') || keyLower.includes('path')) {
    return 'filename';
  }
  
  // Numeric fields
  if (keyLower.includes('number') || keyLower.includes('count') || keyLower.includes('id') || 
      keyLower.includes('port') || keyLower.includes('size') || keyLower.includes('length')) {
    return 'numeric';
  }
  
  return 'general';
};

const deepSanitize = (value) => {
  return sanitizeObject(value);
};

const sanitizeQuery = (query) => {
  return sanitizeObject(query);
};

const sanitizeBody = (body) => {
  return sanitizeObject(body);
};

// SQL injection prevention for string fields
const preventSqlInjection = (str) => {
  if (typeof str !== 'string') return str;
  
  const sqlKeywords = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
    'EXEC', 'EXECUTE', 'UNION', 'SCRIPT', 'DECLARE', 'CAST', 'CONVERT'
  ];
  
  let cleaned = str;
  sqlKeywords.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  });
  
  // Remove common SQL injection patterns
  cleaned = cleaned
    .replace(/['";\\]/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .replace(/xp_/gi, '')
    .replace(/sp_/gi, '');
    
  return cleaned;
};

// NoSQL injection prevention
const preventNoSqlInjection = (value) => {
  if (typeof value === 'string') {
    return value.replace(/[${}]/g, '');
  }
  
  if (typeof value === 'object' && value !== null) {
    const cleaned = {};
    for (const [key, val] of Object.entries(value)) {
      // Prevent MongoDB operator injection
      if (!key.startsWith('$')) {
        cleaned[key] = preventNoSqlInjection(val);
      }
    }
    return cleaned;
  }
  
  return value;
};

// Additional security middleware
const validateSecureHeaders = (req, res, next) => {
  // Check for suspicious headers
  const suspiciousHeaders = ['x-forwarded-host', 'x-real-ip'];
  const clientIP = req.ip || req.connection.remoteAddress;
  
  for (const header of suspiciousHeaders) {
    if (req.headers[header] && req.headers[header] !== req.headers.host) {
      logger.warn(`Suspicious header detected: ${header} from ${clientIP}`);
    }
  }
  
  // Validate User-Agent
  const userAgent = req.headers['user-agent'];
  if (!userAgent || userAgent.length < 10 || userAgent.length > 1000) {
    logger.warn(`Suspicious User-Agent from ${clientIP}: ${userAgent}`);
  }
  
  next();
};

const validateRequestSize = (req, res, next) => {
  const contentLength = req.headers['content-length'];
  if (contentLength && parseInt(contentLength, 10) > 50 * 1024 * 1024) { // 50MB
    return res.status(413).json({
      success: false,
      error: 'Payload Too Large',
      message: 'Request payload exceeds maximum allowed size',
      timestamp: new Date().toISOString(),
    });
  }
  next();
};

module.exports = {
  validate,
  schemas,
  validateDriverNumber,
  validateDriverQuery,
  validateTelemetryQuery,
  validateTrackId,
  validateTrackQuery,
  validateSessionSubscription,
  validateSessionQuery,
  validatePaginationQuery,
  validateApiKey,
  validateContentType,
  validateSecureHeaders,
  validateRequestSize,
  sanitizeQuery,
  sanitizeBody,
  sanitizeString,
  sanitizeObject,
  deepSanitize,
  preventSqlInjection,
  preventNoSqlInjection,
  // Context-aware sanitization functions
  sanitizeUrl,
  sanitizeEmail,
  sanitizeFilename,
  sanitizeNumeric,
  sanitizeGeneral,
  determineContextFromKey
};