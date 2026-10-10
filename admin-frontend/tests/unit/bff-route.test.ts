import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, POST, PUT } from '@/app/api/bff/[...path]/route';
import { resetServerEnvForTests } from '@/lib/server/env';
import { apiError, fakeApi, pageRequest, params, setCookies, tokenReply } from './support';

const ctx = (...path: string[]) => params({ path }) as unknown as Parameters<typeof GET>[1];
const signedIn = (n: string) => ({ cookies: { blocks_at: `AT-${n}`, blocks_rt: `RT-${n}` } });

beforeEach(() => {
  process.env.BLOCKS_API_URL = 'http://api.test';
  delete process.env.TRUSTED_PROXY_HOPS;
  resetServerEnvForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetServerEnvForTests();
});

describe("the console's pipe to the staff API", () => {
  it("forwards a read with the person's own token, and hands back the answer untouched", async () => {
    const api = fakeApi(() => ({ body: { data: [{ id: 'u1' }], meta: { hasMore: false } } }));
    const res = await GET(pageRequest('/api/bff/users?q=asha&limit=5', signedIn('one')), ctx('users'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ id: 'u1' }], meta: { hasMore: false } });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/admin/users?q=asha&limit=5' });
    expect(api.calls[0]?.headers.get('authorization')).toBe('Bearer AT-one');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(setCookies(res))).toEqual([]);
  });

  it('forwards a change with its body and the idempotency key', async () => {
    const api = fakeApi(() => ({ body: { data: { status: 'SUSPENDED' } } }));
    const req = pageRequest('/api/bff/users/abc/suspend', {
      method: 'POST',
      body: { reason: 'Repeated harassment reports' },
      headers: { 'idempotency-key': 'key-1234567890' },
      ...signedIn('one'),
    });
    const res = await POST(req, ctx('users', 'abc', 'suspend'));

    expect(res.status).toBe(200);
    expect(api.calls[0]).toMatchObject({
      method: 'POST',
      path: '/api/v1/admin/users/abc/suspend',
      body: '{"reason":"Repeated harassment reports"}',
    });
    expect(api.calls[0]?.headers.get('idempotency-key')).toBe('key-1234567890');
    expect(api.calls[0]?.headers.get('content-type')).toBe('application/json');
  });

  it('passes every error status and body through, including the request id', async () => {
    fakeApi(() => ({ status: 409, body: apiError('CONFLICT', 'Already suspended.') }));
    const res = await POST(
      pageRequest('/api/bff/users/abc/suspend', { method: 'POST', body: {}, ...signedIn('one') }),
      ctx('users', 'abc', 'suspend'),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'CONFLICT', requestId: 'req-1' } });
  });

  it('keeps Retry-After on a rate-limited answer', async () => {
    fakeApi(() => ({ status: 429, body: apiError('RATE_LIMITED'), headers: { 'retry-after': '30' } }));
    const res = await GET(pageRequest('/api/bff/users', signedIn('one')), ctx('users'));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');
  });

  it('returns a file byte for byte but locks it down so nothing in it can run', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45]);
    fakeApi(() => ({ file: { bytes, contentType: 'application/pdf' } }));
    const res = await GET(pageRequest('/api/bff/licences/x/doc', signedIn('one')), ctx('licences', 'x', 'doc'));
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it("forwards the person's own address only when a proxy is trusted", async () => {
    const api = fakeApi(() => ({ body: { data: [] } }));
    await GET(
      pageRequest('/api/bff/users', { ...signedIn('one'), headers: { 'x-forwarded-for': '203.0.113.9' } }),
      ctx('users'),
    );
    expect(api.calls[0]?.headers.get('x-forwarded-for')).toBeNull();

    process.env.TRUSTED_PROXY_HOPS = '1';
    resetServerEnvForTests();
    await GET(
      pageRequest('/api/bff/users', { ...signedIn('one'), headers: { 'x-forwarded-for': '10.9.9.9, 203.0.113.9' } }),
      ctx('users'),
    );
    expect(api.calls[1]?.headers.get('x-forwarded-for')).toBe('203.0.113.9');
  });

  it("reports an unreachable API in the API's own error format", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    );
    const res = await GET(pageRequest('/api/bff/users', signedIn('one')), ctx('users'));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
  });
});

describe('what the pipe refuses before the API is asked', () => {
  it("a change that does not come from this app's own pages", async () => {
    const api = fakeApi(() => ({}));
    for (const req of [
      pageRequest('/api/bff/users/abc/suspend', { method: 'POST', body: {}, sameOrigin: false, ...signedIn('one') }),
      pageRequest('/api/bff/users/abc/suspend', {
        method: 'POST',
        body: {},
        sameOrigin: false,
        headers: { origin: 'https://evil.example', 'x-requested-with': 'blocks-console' },
        ...signedIn('one'),
      }),
      pageRequest('/api/bff/users/abc/suspend', {
        method: 'DELETE',
        sameOrigin: false,
        headers: { origin: 'http://localhost:3000' },
        ...signedIn('one'),
      }),
    ]) {
      const res = await (req.method === 'DELETE' ? DELETE : POST)(req, ctx('users', 'abc', 'suspend'));
      expect(res.status).toBe(403);
    }
    expect(api.calls).toHaveLength(0);
  });

  it('paths that climb out of /admin or reach the sign-in routes', async () => {
    const api = fakeApi(() => ({}));
    for (const path of [
      ['..', 'auth', 'login'],
      ['users', '..', '..', 'health'],
      ['.'],
      ['auth', 'me'],
      ['users', 'a b'],
      ['users', 'x?y=1'],
      ['users', '%2e%2e'],
      ['users', 'a/b'],
    ]) {
      const res = await GET(pageRequest('/api/bff/x', signedIn('one')), ctx(...path));
      expect(res.status, path.join('/')).toBe(404);
    }
    expect(api.calls).toHaveLength(0);
  });

  it('a body that is too large', async () => {
    const api = fakeApi(() => ({}));
    const res = await PUT(
      pageRequest('/api/bff/settings/x', { method: 'PUT', body: 'x'.repeat(1_100_000), ...signedIn('one') }),
      ctx('settings', 'x'),
    );
    expect(res.status).toBe(413);
    expect(api.calls).toHaveLength(0);
  });

  it('a request with no session at all, clearing any leftovers', async () => {
    const api = fakeApi(() => ({}));
    const res = await GET(pageRequest('/api/bff/users'), ctx('users'));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    expect(setCookies(res)['blocks_at']).toMatch(/Max-Age=0/);
    expect(api.calls).toHaveLength(0);
  });
});

describe('keeping a person signed in', () => {
  it('renews an expired access token once and repeats the call with the new one', async () => {
    const api = fakeApi((call) => {
      if (call.path === '/api/v1/admin/auth/refresh') return { body: tokenReply('two') };
      return call.headers.get('authorization') === 'Bearer AT-two'
        ? { body: { data: ['ok'] } }
        : { status: 401, body: apiError('TOKEN_EXPIRED') };
    });
    const res = await GET(pageRequest('/api/bff/users', signedIn('one-a')), ctx('users'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: ['ok'] });
    expect(api.calls.map((c) => c.path)).toEqual([
      '/api/v1/admin/users',
      '/api/v1/admin/auth/refresh',
      '/api/v1/admin/users',
    ]);
    expect(JSON.parse(api.calls[1]?.body ?? '{}')).toEqual({ refreshToken: 'RT-one-a' });
    const cookies = setCookies(res);
    expect(cookies['blocks_at']).toMatch(/^blocks_at=AT-two;.*HttpOnly/i);
    expect(cookies['blocks_rt']).toMatch(/^blocks_rt=RT-two;/);
  });

  it('refreshes once, however many requests notice the expiry together (a refresh token works only once)', async () => {
    const api = fakeApi(async (call) => {
      if (call.path === '/api/v1/admin/auth/refresh') {
        await new Promise((r) => setTimeout(r, 25));
        return { body: tokenReply('shared-new') };
      }
      return call.headers.get('authorization') === 'Bearer AT-shared-new'
        ? { body: { data: [] } }
        : { status: 401, body: apiError('TOKEN_EXPIRED') };
    });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        GET(pageRequest(`/api/bff/users?n=${i}`, signedIn('shared-old')), ctx('users')),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(api.calls.filter((c) => c.path === '/api/v1/admin/auth/refresh')).toHaveLength(1);
    for (const r of results) expect(setCookies(r)['blocks_at']).toContain('AT-shared-new');
  });

  it('refreshes at once when the browser dropped the access cookie but still has the refresh token', async () => {
    const api = fakeApi((call) =>
      call.path.endsWith('/auth/refresh') ? { body: tokenReply('three') } : { body: { data: [] } },
    );
    const res = await GET(pageRequest('/api/bff/users', { cookies: { blocks_rt: 'RT-only' } }), ctx('users'));
    expect(res.status).toBe(200);
    expect(api.calls[0]?.path).toBe('/api/v1/admin/auth/refresh');
    expect(api.calls[1]?.headers.get('authorization')).toBe('Bearer AT-three');
  });

  it('signs the person out, clearing the cookies, when the refresh is refused', async () => {
    fakeApi((call) =>
      call.path.endsWith('/auth/refresh')
        ? { status: 401, body: apiError('SESSION_REVOKED') }
        : { status: 401, body: apiError('TOKEN_EXPIRED') },
    );
    const res = await GET(pageRequest('/api/bff/users', signedIn('dead')), ctx('users'));
    expect(res.status).toBe(401);
    const cookies = setCookies(res);
    expect(cookies['blocks_at']).toMatch(/Max-Age=0/);
    expect(cookies['blocks_rt']).toMatch(/Max-Age=0/);
  });

  it('signs the person out when the API says the session was ended elsewhere', async () => {
    fakeApi(() => ({ status: 401, body: apiError('SESSION_REVOKED') }));
    const res = await GET(pageRequest('/api/bff/users', signedIn('revoked')), ctx('users'));
    expect(res.status).toBe(401);
    expect(setCookies(res)['blocks_rt']).toMatch(/Max-Age=0/);
  });

  it('does not sign anyone out for an ordinary refusal', async () => {
    fakeApi(() => ({ status: 403, body: apiError('FORBIDDEN', 'You do not have permission to do that.') }));
    const res = await GET(pageRequest('/api/bff/settings', signedIn('limited')), ctx('settings'));
    expect(res.status).toBe(403);
    expect(Object.keys(setCookies(res))).toEqual([]);
  });
});
