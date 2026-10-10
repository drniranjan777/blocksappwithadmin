import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cookieNames, clearSessionCookies, setSessionCookies } from '@/lib/server/cookies';
import { crossSiteProblem } from '@/lib/server/csrf';
import { clientIp } from '@/lib/server/client-ip';
import { resetServerEnvForTests, serverEnv } from '@/lib/server/env';

const ENV_KEYS = [
  'BLOCKS_API_URL',
  'ALLOWED_ORIGINS',
  'UPLOAD_ORIGINS',
  'MEDIA_ORIGINS',
  'COOKIE_SECURE',
  'TRUSTED_PROXY_HOPS',
  'NODE_ENV',
] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) if (k !== 'NODE_ENV') delete process.env[k];
  resetServerEnvForTests();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = saved[k];
  }
  resetServerEnvForTests();
});

const post = (headers: Record<string, string>, method = 'POST') =>
  new Request('http://localhost:3000/api/bff/users/x/suspend', { method, headers });
const OWN = { origin: 'http://localhost:3000', 'x-requested-with': 'blocks-console' };

describe('cross-site request protection', () => {
  it('lets reads through without any marker', () => {
    expect(crossSiteProblem(post({}, 'GET'))).toBeNull();
    expect(crossSiteProblem(post({}, 'HEAD'))).toBeNull();
  });

  it("accepts a change that comes from this app's own pages", () => {
    expect(crossSiteProblem(post(OWN))).toBeNull();
    expect(crossSiteProblem(post({ ...OWN, 'sec-fetch-site': 'same-origin' }))).toBeNull();
  });

  it('refuses a change with no origin at all', () => {
    expect(crossSiteProblem(post({ 'x-requested-with': 'blocks-console' }))).toBe('missing origin');
  });

  it('refuses a change from another site, even with the marker', () => {
    expect(crossSiteProblem(post({ ...OWN, origin: 'https://evil.example' }))).toBe('origin not allowed');
  });

  it("refuses a change without the marker header that only this app's scripts can add", () => {
    expect(crossSiteProblem(post({ origin: OWN.origin }))).toBe('missing request marker');
    expect(crossSiteProblem(post({ origin: OWN.origin, 'x-requested-with': 'XMLHttpRequest' }))).toBe(
      'missing request marker',
    );
  });

  it('refuses what the browser itself labels as cross-site', () => {
    expect(crossSiteProblem(post({ ...OWN, 'sec-fetch-site': 'cross-site' }))).toBe('cross-site request');
    expect(crossSiteProblem(post({ ...OWN, 'sec-fetch-site': 'same-site' }))).toBe('cross-site request');
  });

  it('accepts an extra origin only when it was listed', () => {
    process.env.ALLOWED_ORIGINS = 'https://console.example.com';
    resetServerEnvForTests();
    expect(crossSiteProblem(post({ ...OWN, origin: 'https://console.example.com' }))).toBeNull();
    expect(crossSiteProblem(post({ ...OWN, origin: 'https://console.example.com.evil.test' }))).toBe(
      'origin not allowed',
    );
  });
});

describe('the client address', () => {
  it('ignores X-Forwarded-For unless a proxy is trusted: anyone can send it', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.9' });
    expect(clientIp(h)).toBeUndefined();
  });

  it('believes only what the outermost trusted proxy added', () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    resetServerEnvForTests();
    // The caller claimed 10.0.0.1; our own proxy appended the address it really saw.
    expect(clientIp(new Headers({ 'x-forwarded-for': '10.0.0.1, 203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientIp(new Headers())).toBeUndefined();
  });

  it('counts back from the right with more hops', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    resetServerEnvForTests();
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9, 198.51.100.4' }))).toBe('203.0.113.9');
  });

  it('does not accept an absurdly long value', () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    resetServerEnvForTests();
    expect(clientIp(new Headers({ 'x-forwarded-for': 'x'.repeat(100) }))).toBeUndefined();
  });
});

describe('session cookies', () => {
  const tokens = { accessToken: 'at-123', refreshToken: 'rt-456', expiresIn: 900 };

  it('are HttpOnly, SameSite=Strict, site-wide, and not stored past the browser session (refresh)', () => {
    const res = NextResponse.json({});
    setSessionCookies(res, tokens);
    const names = cookieNames();
    const access = res.cookies.get(names.access);
    const refresh = res.cookies.get(names.refresh);
    expect(access).toMatchObject({ value: 'at-123', httpOnly: true, sameSite: 'strict', path: '/' });
    expect(refresh).toMatchObject({ value: 'rt-456', httpOnly: true, sameSite: 'strict', path: '/' });
    expect(refresh?.maxAge).toBeUndefined();
    expect(access?.maxAge).toBeGreaterThan(900);
  });

  it('use the __Host- prefix and Secure when secure cookies are on', () => {
    process.env.COOKIE_SECURE = 'true';
    resetServerEnvForTests();
    expect(cookieNames()).toEqual({ access: '__Host-blocks_at', refresh: '__Host-blocks_rt' });
    const res = NextResponse.json({});
    setSessionCookies(res, tokens);
    expect(res.cookies.get('__Host-blocks_at')?.secure).toBe(true);
  });

  it('are Secure by default only in production', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    resetServerEnvForTests();
    expect(serverEnv().cookieSecure).toBe(true);
    (process.env as Record<string, string>).NODE_ENV = 'development';
    resetServerEnvForTests();
    expect(serverEnv().cookieSecure).toBe(false);
  });

  it('are cleared by expiring both', () => {
    const res = NextResponse.json({});
    clearSessionCookies(res);
    const names = cookieNames();
    expect(res.cookies.get(names.access)).toMatchObject({ value: '', maxAge: 0 });
    expect(res.cookies.get(names.refresh)).toMatchObject({ value: '', maxAge: 0 });
  });
});

describe('server settings', () => {
  it('refuse an API address that is not a web address', () => {
    process.env.BLOCKS_API_URL = 'not a url';
    resetServerEnvForTests();
    expect(() => serverEnv()).toThrow(/full address/);
    process.env.BLOCKS_API_URL = 'ftp://api.example.com';
    resetServerEnvForTests();
    expect(() => serverEnv()).toThrow(/http/);
  });

  it('require https for a remote API in production, but allow localhost', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.BLOCKS_API_URL = 'http://api.example.com';
    resetServerEnvForTests();
    expect(() => serverEnv()).toThrow(/https/);
    process.env.BLOCKS_API_URL = 'http://localhost:4000';
    resetServerEnvForTests();
    expect(serverEnv().apiUrl).toBe('http://localhost:4000');
  });

  it('strip a trailing slash from the API address', () => {
    process.env.BLOCKS_API_URL = 'https://api.example.com///';
    resetServerEnvForTests();
    expect(serverEnv().apiUrl).toBe('https://api.example.com');
  });

  it("check every listed origin, so a typo cannot widen the page's security policy", () => {
    process.env.UPLOAD_ORIGINS = 'https://bucket.s3.amazonaws.com, nonsense';
    resetServerEnvForTests();
    expect(() => serverEnv()).toThrow(/UPLOAD_ORIGINS/);
    process.env.UPLOAD_ORIGINS = 'https://bucket.s3.amazonaws.com/some/path';
    resetServerEnvForTests();
    expect(serverEnv().uploadOrigins).toEqual(['https://bucket.s3.amazonaws.com']);
  });

  it('keep the proxy count within bounds', () => {
    process.env.TRUSTED_PROXY_HOPS = '9';
    resetServerEnvForTests();
    expect(() => serverEnv()).toThrow(/TRUSTED_PROXY_HOPS/);
  });
});
