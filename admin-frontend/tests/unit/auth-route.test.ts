import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/auth/[...action]/route';
import { resetServerEnvForTests } from '@/lib/server/env';
import { apiError, fakeApi, pageRequest, params, setCookies, tokenReply } from './support';

const ctx = (...action: string[]) => params({ action }) as unknown as Parameters<typeof GET>[1];

beforeEach(() => {
  process.env.BLOCKS_API_URL = 'http://api.test';
  resetServerEnvForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetServerEnvForTests();
});

describe('signing in', () => {
  it('puts the tokens in HttpOnly cookies and never in what the page receives', async () => {
    const api = fakeApi(() => ({ body: tokenReply('login', { nextStep: 'two_factor' }) }));
    const res = await POST(
      pageRequest('/api/auth/login', { method: 'POST', body: { email: 'a@blocks.test', password: 'x' } }),
      ctx('login'),
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('AT-login');
    expect(text).not.toContain('RT-login');
    expect(JSON.parse(text)).toEqual({
      data: { nextStep: 'two_factor', admin: { id: 'a1', name: 'Staff', permissions: ['users.read'] } },
    });

    const cookies = setCookies(res);
    expect(cookies['blocks_at']).toMatch(/^blocks_at=AT-login;/);
    expect(cookies['blocks_at']).toMatch(/HttpOnly/i);
    expect(cookies['blocks_at']).toMatch(/SameSite=strict/i);
    expect(cookies['blocks_rt']).toMatch(/^blocks_rt=RT-login;.*HttpOnly/i);
    expect(api.calls[0]).toMatchObject({ method: 'POST', path: '/api/v1/admin/auth/login' });
    // Signing in sends no token: there is none yet.
    expect(api.calls[0]?.headers.get('authorization')).toBeNull();
  });

  it('sets no cookie when the details are wrong, and says so without saying which was wrong', async () => {
    fakeApi(() => ({ status: 401, body: apiError('INVALID_CREDENTIALS', 'The e-mail or password is not right.') }));
    const res = await POST(
      pageRequest('/api/auth/login', { method: 'POST', body: { email: 'a@blocks.test', password: 'wrong' } }),
      ctx('login'),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    expect(Object.keys(setCookies(res))).toEqual([]);
  });

  it("keeps a locked account's status and Retry-After", async () => {
    fakeApi(() => ({ status: 423, body: apiError('ACCOUNT_LOCKED'), headers: { 'retry-after': '600' } }));
    const res = await POST(
      pageRequest('/api/auth/login', { method: 'POST', body: { email: 'a@blocks.test', password: 'x' } }),
      ctx('login'),
    );
    expect(res.status).toBe(423);
    expect(res.headers.get('retry-after')).toBe('600');
  });

  it("uses the half-finished sign-in's own cookie for each later step, and replaces the cookies with what comes back", async () => {
    const api = fakeApi(() => ({ body: tokenReply('verified') }));
    const res = await POST(
      pageRequest('/api/auth/verify', {
        method: 'POST',
        body: { method: 'totp', code: '123456' },
        cookies: { blocks_at: 'AT-enrol', blocks_rt: 'RT-enrol' },
      }),
      ctx('verify'),
    );
    expect(res.status).toBe(200);
    expect(api.calls[0]?.path).toBe('/api/v1/admin/auth/login/verify');
    expect(api.calls[0]?.headers.get('authorization')).toBe('Bearer AT-enrol');
    expect(setCookies(res)['blocks_at']).toMatch(/^blocks_at=AT-verified;/);
  });

  it('shows the backup codes once, in the answer, and still keeps the tokens out of it', async () => {
    fakeApi(() => ({ body: tokenReply('enrolled', { backupCodes: ['AAAA-BBBB-CC', 'DDDD-EEEE-FF'] }) }));
    const res = await POST(
      pageRequest('/api/auth/two-factor/confirm', {
        method: 'POST',
        body: { code: '123456' },
        cookies: { blocks_at: 'AT-enrol', blocks_rt: 'RT-enrol' },
      }),
      ctx('two-factor', 'confirm'),
    );
    const body = await res.json();
    expect(body.data.backupCodes).toEqual(['AAAA-BBBB-CC', 'DDDD-EEEE-FF']);
    expect(JSON.stringify(body)).not.toMatch(/AT-enrolled|RT-enrolled/);
  });

  it('hands back the one-time secret for a new authenticator without touching the cookies', async () => {
    fakeApi(() => ({ body: { data: { secret: 'ABCDEF', otpauthUri: 'otpauth://totp/x?secret=ABCDEF' } } }));
    const res = await POST(
      pageRequest('/api/auth/two-factor/setup', {
        method: 'POST',
        body: {},
        cookies: { blocks_at: 'AT-enrol', blocks_rt: 'RT-enrol' },
      }),
      ctx('two-factor', 'setup'),
    );
    expect((await res.json()).data.secret).toBe('ABCDEF');
    expect(Object.keys(setCookies(res))).toEqual([]);
  });

  it('answers who is signed in, and says not signed in with a 401 when no cookie is present', async () => {
    const api = fakeApi(() => ({ body: { data: { nextStep: null, admin: { id: 'a1' } } } }));
    const ok = await GET(
      pageRequest('/api/auth/session', { cookies: { blocks_at: 'AT-live', blocks_rt: 'RT-live' } }),
      ctx('session'),
    );
    expect(ok.status).toBe(200);
    expect(api.calls[0]?.path).toBe('/api/v1/admin/auth/me');

    const none = await GET(pageRequest('/api/auth/session'), ctx('session'));
    expect(none.status).toBe(401);
    expect(api.calls).toHaveLength(1);
  });
});

describe('signing out', () => {
  it('clears both cookies and ends the session at the API', async () => {
    const api = fakeApi(() => ({ status: 204 }));
    const res = await POST(
      pageRequest('/api/auth/logout', {
        method: 'POST',
        body: {},
        cookies: { blocks_at: 'AT-live', blocks_rt: 'RT-live' },
      }),
      ctx('logout'),
    );
    expect(res.status).toBe(204);
    const cookies = setCookies(res);
    expect(cookies['blocks_at']).toMatch(/Max-Age=0/);
    expect(cookies['blocks_rt']).toMatch(/Max-Age=0/);
    expect(api.calls[0]).toMatchObject({ method: 'POST', path: '/api/v1/admin/auth/logout' });
  });

  it('still clears the cookies when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    );
    const res = await POST(
      pageRequest('/api/auth/logout', {
        method: 'POST',
        body: {},
        cookies: { blocks_at: 'AT-live', blocks_rt: 'RT-live' },
      }),
      ctx('logout'),
    );
    expect(res.status).toBe(204);
    expect(setCookies(res)['blocks_rt']).toMatch(/Max-Age=0/);
  });
});

describe('what it refuses', () => {
  it('actions that do not exist, and the wrong method for one that does', async () => {
    const api = fakeApi(() => ({}));
    expect((await POST(pageRequest('/api/auth/admin', { method: 'POST', body: {} }), ctx('admin'))).status).toBe(404);
    expect((await GET(pageRequest('/api/auth/login'), ctx('login'))).status).toBe(404);
    expect((await POST(pageRequest('/api/auth/session', { method: 'POST', body: {} }), ctx('session'))).status).toBe(
      404,
    );
    expect(api.calls).toHaveLength(0);
  });

  it("a sign-in attempt that does not come from this app's own login page", async () => {
    const api = fakeApi(() => ({ body: tokenReply('x') }));
    const res = await POST(
      pageRequest('/api/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' }, sameOrigin: false }),
      ctx('login'),
    );
    expect(res.status).toBe(403);
    expect(api.calls).toHaveLength(0);
  });

  it('an oversized body', async () => {
    const api = fakeApi(() => ({}));
    const res = await POST(pageRequest('/api/auth/login', { method: 'POST', body: 'x'.repeat(20_000) }), ctx('login'));
    expect(res.status).toBe(413);
    expect(api.calls).toHaveLength(0);
  });
});
