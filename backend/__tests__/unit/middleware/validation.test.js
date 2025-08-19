const {
  validateDriverNumber,
  validateDriverQuery,
  validateTelemetryQuery,
  validateContentType,
  validateApiKey,
  validateSecureHeaders,
  validateRequestSize,
  sanitizeString,
  sanitizeObject,
  preventSqlInjection,
  preventNoSqlInjection
} = require('../../../src/middleware/validation');

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/middleware/errorHandler', () => ({
  handleValidationError: jest.fn((details) => {
    const error = new Error('Validation failed');
    error.status = 400;
    error.details = details;
    return error;
  })
}));

describe('Validation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      params: {},
      query: {},
      body: {},
      headers: {},
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' }
    };
    res = {
      status: jest.fn(() => res),
      json: jest.fn(() => res)
    };
    next = jest.fn();
  });

  describe('validateDriverNumber', () => {
    it('should accept valid driver numbers', () => {
      req.params = { number: '1' };
      validateDriverNumber(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.params.number).toBe('1');
    });

    it('should accept two-digit driver numbers', () => {
      req.params = { number: '44' };
      validateDriverNumber(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.params.number).toBe('44');
    });

    it('should reject invalid driver numbers', () => {
      req.params = { number: 'abc' };
      validateDriverNumber(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject numbers with more than 2 digits', () => {
      req.params = { number: '123' };
      validateDriverNumber(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject empty driver numbers', () => {
      req.params = { number: '' };
      validateDriverNumber(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('validateDriverQuery', () => {
    it('should accept valid query parameters', () => {
      req.query = { details: 'true', active: 'false', history: 'true' };
      validateDriverQuery(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.query.details).toBe(true);
      expect(req.query.active).toBe(false);
      expect(req.query.history).toBe(true);
    });

    it('should set default values for missing parameters', () => {
      req.query = {};
      validateDriverQuery(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.query.details).toBe(false);
      expect(req.query.active).toBe(false);
      expect(req.query.history).toBe(false);
    });

    it('should convert string booleans to actual booleans', () => {
      req.query = { details: 'true', active: 'false' };
      validateDriverQuery(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(typeof req.query.details).toBe('boolean');
      expect(typeof req.query.active).toBe('boolean');
    });

    it('should strip unknown query parameters', () => {
      req.query = { details: 'true', unknown: 'value' };
      validateDriverQuery(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.query).not.toHaveProperty('unknown');
    });
  });

  describe('validateTelemetryQuery', () => {
    it('should accept valid duration', () => {
      req.query = { duration: '120' };
      validateTelemetryQuery(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.query.duration).toBe(120);
    });

    it('should set default duration when not provided', () => {
      req.query = {};
      validateTelemetryQuery(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.query.duration).toBe(60);
    });

    it('should reject duration below minimum', () => {
      req.query = { duration: '5' };
      validateTelemetryQuery(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject duration above maximum', () => {
      req.query = { duration: '4000' };
      validateTelemetryQuery(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should convert string numbers to integers', () => {
      req.query = { duration: '300' };
      validateTelemetryQuery(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(typeof req.query.duration).toBe('number');
      expect(req.query.duration).toBe(300);
    });
  });

  describe('validateContentType', () => {
    it('should accept correct content type for POST requests', () => {
      req.method = 'POST';
      req.headers['content-type'] = 'application/json';
      const middleware = validateContentType('application/json');
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject incorrect content type for POST requests', () => {
      req.method = 'POST';
      req.headers['content-type'] = 'text/plain';
      req.get = jest.fn(() => 'text/plain');
      
      const middleware = validateContentType('application/json');
      middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(415);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Unsupported Media Type'
      }));
    });

    it('should skip validation for GET requests', () => {
      req.method = 'GET';
      const middleware = validateContentType('application/json');
      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject POST requests without content type', () => {
      req.method = 'POST';
      req.get = jest.fn(() => undefined);
      
      const middleware = validateContentType('application/json');
      middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(415);
    });
  });

  describe('validateApiKey', () => {
    beforeEach(() => {
      // Reset environment variable
      delete process.env.REQUIRE_API_KEY;
    });

    it('should pass when API key not required', () => {
      process.env.REQUIRE_API_KEY = 'false';
      validateApiKey(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject when API key required but not provided', () => {
      process.env.REQUIRE_API_KEY = 'true';
      validateApiKey(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Unauthorized',
        message: 'API key required'
      }));
    });

    it('should accept valid API key', () => {
      req.header = jest.fn(() => 'dev-key-123456');
      validateApiKey(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject invalid API key', () => {
      req.header = jest.fn(() => 'invalid-key');
      validateApiKey(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid API key'
      }));
    });
  });

  describe('validateSecureHeaders', () => {
    it('should pass with normal headers', () => {
      req.headers = {
        'user-agent': 'Mozilla/5.0 (compatible test browser)',
        'host': 'localhost:3001'
      };
      validateSecureHeaders(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should warn about suspicious headers but continue', () => {
      req.headers = {
        'user-agent': 'Mozilla/5.0 (compatible test browser)',
        'host': 'localhost:3001',
        'x-forwarded-host': 'malicious.com'
      };
      validateSecureHeaders(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should warn about suspicious user agent', () => {
      req.headers = {
        'user-agent': 'short',
        'host': 'localhost:3001'
      };
      validateSecureHeaders(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should warn about missing user agent', () => {
      req.headers = {
        'host': 'localhost:3001'
      };
      validateSecureHeaders(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('validateRequestSize', () => {
    it('should accept normal sized requests', () => {
      req.headers['content-length'] = '1024';
      validateRequestSize(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject oversized requests', () => {
      req.headers['content-length'] = (60 * 1024 * 1024).toString(); // 60MB
      validateRequestSize(req, res, next);
      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Payload Too Large'
      }));
    });

    it('should pass when no content-length header', () => {
      validateRequestSize(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Sanitization Functions', () => {
    describe('sanitizeString', () => {
      it('should remove HTML tags', () => {
        const result = sanitizeString('<script>alert("xss")</script>Hello');
        expect(result).toBe('Hello');
      });

      it('should remove JavaScript protocols', () => {
        const result = sanitizeString('javascript:alert("xss")');
        expect(result).toBe('alert("xss")');
      });

      it('should handle non-string inputs', () => {
        expect(sanitizeString(123)).toBe(123);
        expect(sanitizeString(null)).toBe(null);
        expect(sanitizeString(undefined)).toBe(undefined);
      });

      it('should trim whitespace', () => {
        const result = sanitizeString('  hello world  ');
        expect(result).toBe('hello world');
      });

      it('should limit string length', () => {
        const longString = 'a'.repeat(20000);
        const result = sanitizeString(longString);
        expect(result.length).toBe(10000);
      });
    });

    describe('sanitizeObject', () => {
      it('should sanitize nested objects', () => {
        const input = {
          name: '<script>alert("xss")</script>John',
          data: {
            description: 'javascript:void(0)'
          }
        };
        const result = sanitizeObject(input);
        expect(result.name).toBe('John');
        expect(result.data.description).toBe('void(0)');
      });

      it('should sanitize arrays', () => {
        const input = ['<script>test</script>', 'normal string'];
        const result = sanitizeObject(input);
        expect(result[0]).toBe('test');
        expect(result[1]).toBe('normal string');
      });

      it('should handle null and primitive values', () => {
        expect(sanitizeObject(null)).toBe(null);
        expect(sanitizeObject(123)).toBe(123);
        expect(sanitizeObject(true)).toBe(true);
      });

      it('should sanitize object keys', () => {
        const input = { '<script>key</script>': 'value' };
        const result = sanitizeObject(input);
        expect(result['key']).toBe('value');
        expect(result['<script>key</script>']).toBeUndefined();
      });
    });

    describe('preventSqlInjection', () => {
      it('should remove SQL keywords', () => {
        const result = preventSqlInjection('SELECT * FROM users WHERE id = 1');
        expect(result.toLowerCase()).not.toContain('select');
        expect(result.toLowerCase()).not.toContain('from');
      });

      it('should remove SQL injection patterns', () => {
        const result = preventSqlInjection("'; DROP TABLE users; --");
        expect(result).not.toContain("'");
        expect(result).not.toContain(';');
        expect(result).not.toContain('--');
      });

      it('should handle non-string inputs', () => {
        expect(preventSqlInjection(123)).toBe(123);
        expect(preventSqlInjection(null)).toBe(null);
      });

      it('should remove stored procedure prefixes', () => {
        const result = preventSqlInjection('xp_cmdshell and sp_executesql');
        expect(result.toLowerCase()).not.toContain('xp_');
        expect(result.toLowerCase()).not.toContain('sp_');
      });
    });

    describe('preventNoSqlInjection', () => {
      it('should remove MongoDB operators from strings', () => {
        const result = preventNoSqlInjection('$where: function() { return true; }');
        expect(result).not.toContain('$');
        expect(result).not.toContain('{');
        expect(result).not.toContain('}');
      });

      it('should remove MongoDB operators from objects', () => {
        const input = {
          username: 'admin',
          $where: 'function() { return true; }',
          password: { $ne: null }
        };
        const result = preventNoSqlInjection(input);
        expect(result).toHaveProperty('username', 'admin');
        expect(result).not.toHaveProperty('$where');
        expect(result).toHaveProperty('password');
        expect(typeof result.password).toBe('object');
      });

      it('should handle nested objects', () => {
        const input = {
          user: {
            $gt: '',
            name: 'test'
          }
        };
        const result = preventNoSqlInjection(input);
        expect(result.user).not.toHaveProperty('$gt');
        expect(result.user).toHaveProperty('name', 'test');
      });

      it('should handle non-object inputs', () => {
        expect(preventNoSqlInjection('test')).toBe('test');
        expect(preventNoSqlInjection(123)).toBe(123);
        expect(preventNoSqlInjection(null)).toBe(null);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should combine multiple validation steps', () => {
      req.params = { number: '1' };
      req.query = { details: 'true' };
      
      validateDriverNumber(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      
      validateDriverQuery(req, res, next);
      expect(next).toHaveBeenCalledTimes(2);
      
      expect(req.params.number).toBe('1');
      expect(req.query.details).toBe(true);
    });

    it('should handle validation errors gracefully', () => {
      req.params = { number: 'invalid' };
      validateDriverNumber(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0]).toHaveProperty('status', 400);
    });
  });
});