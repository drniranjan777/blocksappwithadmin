import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app.js';

describe('application foundation', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ CORS_ORIGINS: 'https://admin.blocks.test' });
  });
  afterAll(async () => {
    await t.close();
  });

  describe('health', () => {
    it('answers liveness without touching a dependency', async () => {
      const res = await t.http.get('/api/v1/health/live').expect(200);
      expect(res.body).toEqual({ data: { status: 'ok' } });
    });

    it('reports readiness with the database check', async () => {
      const res = await t.http.get('/api/v1/health/ready').expect(200);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.checks.database.ok).toBe(true);
      expect(typeof res.body.data.checks.database.latencyMs).toBe('number');
      // No REDIS_URL in this configuration.
      expect(res.body.data.checks.redis).toEqual({ ok: true, state: 'skipped' });
    });

    it('does not leak versions, hosts or errors', async () => {
      const res = await t.http.get('/api/v1/health').expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(
        /postgres|version|localhost|127\.0\.0\.1|password/i,
      );
    });
  });

  describe('security headers', () => {
    it('sets them and hides the framework', async () => {
      const res = await t.http.get('/api/v1/health/live');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    });
  });

  describe('request ids', () => {
    it('makes one when none is sent', async () => {
      const res = await t.http.get('/api/v1/health/live');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('keeps a well-formed one from the gateway', async () => {
      const res = await t.http.get('/api/v1/health/live').set('X-Request-Id', 'gateway-req-12345');
      expect(res.headers['x-request-id']).toBe('gateway-req-12345');
    });

    it('replaces a malformed one rather than echoing it (no header injection, no log forging)', async () => {
      const res = await t.http.get('/api/v1/health/live').set('X-Request-Id', 'x y;<script>');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('errors', () => {
    it('answers an unknown route with the standard envelope and the request id', async () => {
      const res = await t.http.get('/api/v1/nothing-here').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
      expect(res.body).not.toHaveProperty('data');
    });

    it('answers malformed JSON with INVALID_JSON, not a stack trace', async () => {
      const res = await t.http
        .post('/api/v1/health')
        .set('Content-Type', 'application/json')
        .send('{"broken":')
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_JSON');
      expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|at |node_modules/);
    });

    it('refuses an oversized JSON body', async () => {
      const big = JSON.stringify({ filler: 'x'.repeat(300_000) });
      const res = await t.http
        .post('/api/v1/health')
        .set('Content-Type', 'application/json')
        .send(big);
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('CORS', () => {
    it('allows a listed browser origin', async () => {
      const res = await t.http
        .get('/api/v1/health/live')
        .set('Origin', 'https://admin.blocks.test');
      expect(res.headers['access-control-allow-origin']).toBe('https://admin.blocks.test');
    });

    it('gives an unlisted origin no allow header', async () => {
      const res = await t.http.get('/api/v1/health/live').set('Origin', 'https://evil.test');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('never allows credentials', async () => {
      const res = await t.http
        .get('/api/v1/health/live')
        .set('Origin', 'https://admin.blocks.test');
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });

  describe('API documentation', () => {
    it('serves the OpenAPI document in development', async () => {
      const res = await t.http.get('/api/docs-json').expect(200);
      expect(res.body.openapi).toMatch(/^3\./);
      expect(Object.keys(res.body.paths)).toContain('/api/v1/health/live');
      expect(res.body.components.securitySchemes.user).toBeDefined();
      expect(res.body.components.securitySchemes.admin).toBeDefined();
    });
  });
});

describe('production switches', () => {
  // Booting a whole application takes ~20 s alone and several times that when the rest of the suite
  // is running beside it, so this test gets longer than the default.
  it('hides the API documentation when swagger is off', { timeout: 300_000 }, async () => {
    const t = await createTestApp({ SWAGGER_ENABLED: 'false' });
    try {
      await t.http.get('/api/docs-json').expect(404);
    } finally {
      await t.close();
    }
  });
});
