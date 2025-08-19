const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config');
const { AppError } = require('./errorHandler');

/**
 * JWT Authentication Middleware for Admin Endpoints
 * 
 * Provides secure authentication using JWT tokens instead of insecure IP-based access control.
 * Implements token validation, refresh logic, and role-based access control.
 */

// JWT configuration
const JWT_CONFIG = {
  secret: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
  adminSecret: process.env.JWT_ADMIN_SECRET || crypto.randomBytes(64).toString('hex'),
  algorithm: 'HS256',
  expiresIn: config.security.jwtExpiry || '1h',
  adminExpiresIn: process.env.JWT_ADMIN_EXPIRY || '30m',
  issuer: 'f1-backend',
  audience: 'f1-admin'
};

// Validate JWT secrets are properly configured
if (process.env.NODE_ENV === 'production' && 
    (!process.env.JWT_SECRET || !process.env.JWT_ADMIN_SECRET)) {
  logger.error('JWT secrets must be configured in production');
  throw new Error('JWT secrets not configured for production');
}

/**
 * Generate a secure JWT token for admin access
 * @param {Object} payload - User/admin data to include in token
 * @param {string} role - User role (admin, superadmin)
 * @returns {string} JWT token
 */
const generateAdminToken = (payload, role = 'admin') => {
  const tokenPayload = {
    ...payload,
    role,
    type: 'admin',
    iat: Math.floor(Date.now() / 1000),
    jti: crypto.randomUUID() // Unique token identifier for revocation
  };

  return jwt.sign(tokenPayload, JWT_CONFIG.adminSecret, {
    algorithm: JWT_CONFIG.algorithm,
    expiresIn: JWT_CONFIG.adminExpiresIn,
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience
  });
};

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token to verify
 * @param {boolean} isAdmin - Whether to use admin secret
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token, isAdmin = false) => {
  const secret = isAdmin ? JWT_CONFIG.adminSecret : JWT_CONFIG.secret;
  
  return jwt.verify(token, secret, {
    algorithms: [JWT_CONFIG.algorithm],
    issuer: JWT_CONFIG.issuer,
    audience: isAdmin ? JWT_CONFIG.audience : undefined
  });
};

/**
 * Extract token from request headers
 * @param {Object} req - Express request object
 * @returns {string|null} Extracted token or null
 */
const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Fallback to X-Auth-Token header
  return req.headers['x-auth-token'] || null;
};

/**
 * Main authentication middleware for admin endpoints
 * @param {Array} requiredRoles - Array of required roles (optional)
 * @returns {Function} Express middleware function
 */
const authenticateAdmin = (requiredRoles = ['admin']) => {
  return async (req, res, next) => {
    try {
      const token = extractToken(req);
      
      if (!token) {
        logger.warn('Admin access attempt without token', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          timestamp: new Date().toISOString()
        });
        
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Access token required for admin endpoints',
          timestamp: new Date().toISOString()
        });
      }

      // Verify token
      const decoded = verifyToken(token, true);
      
      // Validate token type and role
      if (decoded.type !== 'admin') {
        throw new AppError('Invalid token type for admin access', 401);
      }
      
      if (!requiredRoles.includes(decoded.role)) {
        logger.warn('Insufficient permissions for admin endpoint', {
          userRole: decoded.role,
          requiredRoles,
          userId: decoded.userId,
          ip: req.ip,
          path: req.path,
          timestamp: new Date().toISOString()
        });
        
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions for this admin endpoint',
          timestamp: new Date().toISOString()
        });
      }

      // Add admin info to request
      req.admin = {
        id: decoded.userId,
        role: decoded.role,
        email: decoded.email,
        tokenId: decoded.jti,
        issuedAt: decoded.iat,
        expiresAt: decoded.exp
      };

      // Log successful admin access
      logger.info('Admin endpoint access granted', {
        adminId: req.admin.id,
        role: req.admin.role,
        path: req.path,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      next();
      
    } catch (error) {
      logger.warn('Admin authentication failed', {
        error: error.message,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        timestamp: new Date().toISOString()
      });

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid access token',
          timestamp: new Date().toISOString()
        });
      }

      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'Access token has expired',
          timestamp: new Date().toISOString()
        });
      }

      next(error);
    }
  };
};

/**
 * Admin login endpoint to obtain JWT tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const adminLogin = async (req, res, next) => {
  try {
    const { email, password, totpCode } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Email and password are required',
        timestamp: new Date().toISOString()
      });
    }

    // In a real implementation, validate credentials against database
    // This is a simplified example - implement proper authentication
    const adminCredentials = {
      'admin@f1backend.com': {
        password: process.env.ADMIN_PASSWORD || 'change-this-password-in-production',
        role: 'admin',
        id: 'admin-001',
        requiresTotp: process.env.ADMIN_REQUIRES_TOTP === 'true'
      }
    };

    const admin = adminCredentials[email];
    if (!admin || admin.password !== password) {
      logger.warn('Failed admin login attempt', {
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
      
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid credentials',
        timestamp: new Date().toISOString()
      });
    }

    // TOTP validation (if enabled)
    if (admin.requiresTotp && !totpCode) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'TOTP code required',
        timestamp: new Date().toISOString()
      });
    }

    // Generate JWT token
    const token = generateAdminToken({
      userId: admin.id,
      email,
      role: admin.role
    }, admin.role);

    logger.info('Admin login successful', {
      adminId: admin.id,
      email,
      role: admin.role,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        token,
        expiresIn: JWT_CONFIG.adminExpiresIn,
        role: admin.role,
        user: {
          id: admin.id,
          email,
          role: admin.role
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Admin login error', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    next(error);
  }
};

/**
 * Admin token refresh endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const refreshAdminToken = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Access token required for refresh',
        timestamp: new Date().toISOString()
      });
    }

    // Verify existing token (even if expired)
    const decoded = jwt.verify(token, JWT_CONFIG.adminSecret, {
      algorithms: [JWT_CONFIG.algorithm],
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
      ignoreExpiration: true // Allow expired tokens for refresh
    });

    // Check if token is too old to refresh (max 24 hours)
    const tokenAge = Date.now() / 1000 - decoded.iat;
    if (tokenAge > 24 * 60 * 60) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Token too old for refresh, please login again',
        timestamp: new Date().toISOString()
      });
    }

    // Generate new token
    const newToken = generateAdminToken({
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role
    }, decoded.role);

    logger.info('Admin token refreshed', {
      adminId: decoded.userId,
      role: decoded.role,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        token: newToken,
        expiresIn: JWT_CONFIG.adminExpiresIn,
        role: decoded.role
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.warn('Admin token refresh failed', {
      error: error.message,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid token for refresh',
        timestamp: new Date().toISOString()
      });
    }

    next(error);
  }
};

/**
 * Rate limiting middleware specifically for auth endpoints
 */
const authRateLimit = (maxAttempts = 5, windowMinutes = 15) => {
  const attempts = new Map();
  
  return (req, res, next) => {
    const clientId = req.ip + req.get('User-Agent');
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    
    if (!attempts.has(clientId)) {
      attempts.set(clientId, { count: 1, firstAttempt: now });
      return next();
    }
    
    const clientData = attempts.get(clientId);
    
    if (now - clientData.firstAttempt > windowMs) {
      // Reset window
      attempts.set(clientId, { count: 1, firstAttempt: now });
      return next();
    }
    
    if (clientData.count >= maxAttempts) {
      logger.warn('Auth rate limit exceeded', {
        ip: req.ip,
        attempts: clientData.count,
        path: req.path,
        timestamp: new Date().toISOString()
      });
      
      return res.status(429).json({
        success: false,
        error: 'Too Many Requests',
        message: 'Too many authentication attempts, please try again later',
        retryAfter: Math.ceil(windowMs / 1000),
        timestamp: new Date().toISOString()
      });
    }
    
    clientData.count++;
    next();
  };
};

module.exports = {
  authenticateAdmin,
  adminLogin,
  refreshAdminToken,
  generateAdminToken,
  verifyToken,
  extractToken,
  authRateLimit,
  JWT_CONFIG
};