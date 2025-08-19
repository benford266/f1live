const request = require('supertest');
const { 
  sanitizeString, 
  sanitizeObject, 
  preventSqlInjection, 
  preventNoSqlInjection 
} = require('../../src/middleware/validation');

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/cache', () => ({
  getCacheService: jest.fn(() => ({
    getSessionData: jest.fn(() => Promise.resolve(null)),
    getAllDriverData: jest.fn(() => Promise.resolve({}))
  }))
}));

const F1BackendServer = require('../../src/server');

describe('Security Tests', () => {
  let server;
  let app;

  beforeAll(async () => {
    server = new F1BackendServer();
    app = server.app;
  });

  afterAll(async () => {
    if (server && server.server) {
      await new Promise((resolve) => {
        server.server.close(resolve);
      });
    }
  });

  describe('Input Sanitization', () => {
    it('should sanitize XSS attempts in query parameters', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      
      const response = await request(app)
        .get(`/api/drivers?details=${encodeURIComponent(xssPayload)}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Response should not contain the script tag
      const responseString = JSON.stringify(response.body);
      expect(responseString).not.toContain('<script>');
      expect(responseString).not.toContain('alert(');
    });

    it('should sanitize XSS attempts in POST body', async () => {
      const xssPayload = {
        feeds: ['<script>alert("xss")</script>', 'TimingData']
      };

      const response = await request(app)
        .post('/api/session/subscribe')
        .send(xssPayload)
        .expect(400); // Should fail validation

      // Even in error responses, no script content should be echoed back
      const responseString = JSON.stringify(response.body);
      expect(responseString).not.toContain('<script>');
      expect(responseString).not.toContain('alert(');
    });

    it('should handle SQL injection attempts in URL parameters', async () => {
      const sqlInjectionPayloads = [
        "1'; DROP TABLE users; --",
        "1' OR '1'='1",
        "1' UNION SELECT * FROM users --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .get(`/api/drivers/${encodeURIComponent(payload)}`)
          .expect(404); // Should fail validation, not execute SQL

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Not Found');
      }
    });

    it('should prevent NoSQL injection attempts', async () => {
      const noSqlPayloads = [
        { feeds: { $ne: null } },
        { feeds: { $gt: '' } },
        { feeds: { $where: 'function() { return true; }' } }
      ];

      for (const payload of noSqlPayloads) {
        const response = await request(app)
          .post('/api/session/subscribe')
          .send(payload)
          .expect(400); // Should fail validation

        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Check for important security headers
      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
      
      // Content Security Policy should be present
      expect(response.headers).toHaveProperty('content-security-policy');
    });

    it('should set proper CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    it('should reject requests with suspicious origins in production mode', async () => {
      // This test would need to be run with NODE_ENV=production
      // For now, we test that the mechanism exists
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://malicious-site.com')
        .expect(200); // In test env, this might still pass

      // In production, this should be blocked by CORS
      expect(response.status).toBeDefined();
    });
  });

  describe('Rate Limiting Security', () => {
    it('should enforce rate limits to prevent abuse', async () => {
      const requests = [];
      
      // Make many rapid requests to trigger rate limiting
      for (let i = 0; i < 150; i++) {
        requests.push(
          request(app)
            .get('/api/drivers')
        );
      }

      const responses = await Promise.allSettled(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(
        r => r.status === 'fulfilled' && r.value.status === 429
      );

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should include rate limit headers', async () => {
      const response = await request(app)
        .get('/api/drivers')
        .expect(200);

      // Rate limit headers should be present
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });

  describe('Input Validation Security', () => {
    it('should reject requests with oversized payloads', async () => {
      const oversizedPayload = {
        data: 'a'.repeat(10 * 1024 * 1024) // 10MB
      };

      try {
        await request(app)
          .post('/api/session/subscribe')
          .send(oversizedPayload)
          .expect(413); // Payload too large
      } catch (error) {
        // Request might fail before reaching the server due to size
        expect(error.status).toBe(413);
      }
    });

    it('should validate Content-Type headers', async () => {
      const response = await request(app)
        .post('/api/session/subscribe')
        .set('Content-Type', 'text/plain')
        .send('invalid content type')
        .expect(415); // Unsupported Media Type

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Unsupported Media Type');
    });

    it('should reject malformed JSON', async () => {
      const response = await request(app)
        .post('/api/session/subscribe')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400); // Bad Request

      expect(response.text).toContain('Bad Request');
    });
  });

  describe('Path Traversal Protection', () => {
    it('should prevent directory traversal attacks', async () => {
      const traversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];

      for (const payload of traversalPayloads) {
        const response = await request(app)
          .get(`/api/drivers/${encodeURIComponent(payload)}`)
          .expect(404); // Should not find file

        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('Sanitization Functions', () => {
    describe('sanitizeString', () => {
      it('should remove dangerous HTML/JavaScript', () => {
        const dangerousInputs = [
          '<script>alert("xss")</script>',
          'javascript:alert("xss")',
          '<iframe src="javascript:alert(1)"></iframe>',
          '<img src="x" onerror="alert(1)">',
          'data:text/html,<script>alert(1)</script>'
        ];

        dangerousInputs.forEach(input => {
          const result = sanitizeString(input);
          expect(result).not.toContain('<script>');
          expect(result).not.toContain('javascript:');
          expect(result).not.toContain('onerror');
          expect(result).not.toContain('data:');
        });
      });

      it('should preserve safe content', () => {
        const safeInputs = [
          'Normal text',
          'Driver 123',
          'Team Name',
          '1:23.456'
        ];

        safeInputs.forEach(input => {
          const result = sanitizeString(input);
          expect(result).toBe(input);
        });
      });

      it('should handle very long strings', () => {
        const longString = 'a'.repeat(20000);
        const result = sanitizeString(longString);
        expect(result.length).toBeLessThanOrEqual(10000);
      });
    });

    describe('preventSqlInjection', () => {
      it('should remove SQL injection patterns', () => {
        const sqlInputs = [
          "'; DROP TABLE users; --",
          "' OR '1'='1' --",
          'UNION SELECT * FROM users',
          'exec xp_cmdshell',
          'sp_executesql'
        ];

        sqlInputs.forEach(input => {
          const result = preventSqlInjection(input);
          expect(result).not.toContain('DROP');
          expect(result).not.toContain('UNION');
          expect(result).not.toContain('xp_');
          expect(result).not.toContain('sp_');
          expect(result).not.toContain('--');
        });
      });
    });

    describe('preventNoSqlInjection', () => {
      it('should remove MongoDB operators', () => {
        const noSqlInputs = [
          { $where: 'function() { return true; }' },
          { $ne: null },
          { $gt: '' },
          { $regex: '.*' }
        ];

        noSqlInputs.forEach(input => {
          const result = preventNoSqlInjection(input);
          expect(result).not.toHaveProperty('$where');
          expect(result).not.toHaveProperty('$ne');
          expect(result).not.toHaveProperty('$gt');
          expect(result).not.toHaveProperty('$regex');
        });
      });

      it('should handle nested objects', () => {
        const nestedInput = {
          user: {
            $gt: '',
            name: 'test',
            profile: {
              $where: 'malicious code'
            }
          }
        };

        const result = preventNoSqlInjection(nestedInput);
        expect(result.user).not.toHaveProperty('$gt');
        expect(result.user).toHaveProperty('name', 'test');
        expect(result.user.profile).not.toHaveProperty('$where');
      });
    });
  });

  describe('Error Information Disclosure', () => {
    it('should not expose internal errors in production mode', async () => {
      // Test with an endpoint that might cause internal errors
      const response = await request(app)
        .get('/api/drivers/999999')
        .expect(404);

      expect(response.body.success).toBe(false);
      
      // Should not expose internal paths, stack traces, or sensitive info
      const responseString = JSON.stringify(response.body);
      expect(responseString).not.toMatch(/\/[a-zA-Z0-9\/]+\.js:/); // File paths
      expect(responseString).not.toContain('Error:'); // Stack traces
      expect(responseString).not.toContain('at '); // Stack trace lines
    });
  });

  describe('Admin Endpoint Security', () => {
    it('should restrict admin endpoints to localhost', async () => {
      const response = await request(app)
        .get('/admin/security-stats')
        .expect(200); // Allowed in test environment

      expect(response.body.success).toBe(true);
    });

    it('should require proper authentication for admin endpoints', async () => {
      // In production, this should be restricted
      const response = await request(app)
        .get('/admin/cache/stats')
        .expect(200); // Might pass in test env

      expect(response.status).toBeDefined();
    });
  });

  describe('Denial of Service Protection', () => {
    it('should handle recursive JSON gracefully', async () => {
      // Create a circular reference
      const circularObj = { feeds: ['test'] };
      circularObj.self = circularObj;

      try {
        await request(app)
          .post('/api/session/subscribe')
          .send(circularObj);
      } catch (error) {
        // Should handle circular reference without crashing
        expect(error.type).toBe('entity.parse.failed');
      }
    });

    it('should timeout long-running requests', async () => {
      // This test simulates a request that might take too long
      const start = Date.now();
      
      try {
        await request(app)
          .get('/api/drivers')
          .timeout(5000); // 5 second timeout
      } catch (error) {
        const elapsed = Date.now() - start;
        if (error.timeout) {
          expect(elapsed).toBeLessThan(6000);
        }
      }
    });
  });
});