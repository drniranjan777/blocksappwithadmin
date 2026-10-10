import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetServerEnvForTests } from '@/lib/server/env';
import { proxy } from '@/proxy';

const page = (path: string, cookies?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookies ? { cookie: cookies } : {} });

const directives = (csp: string) =>
  Object.fromEntries(
    csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => [d.split(' ')[0], d.split(' ').slice(1)]),
  );

beforeEach(() => {
  process.env.BLOCKS_API_URL = 'http://api.test:4000';
  delete process.env.UPLOAD_ORIGINS;
  delete process.env.MEDIA_ORIGINS;
  resetServerEnvForTests();
});
afterEach(() => resetServerEnvForTests());

describe('the door check', () => {
  it('sends someone with no session cookie to the sign-in page', () => {
    const res = proxy(page('/users'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/login');
  });

  it('lets the sign-in page itself through', () => {
    const res = proxy(page('/login'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('lets someone with a cookie reach the page (the API decides what they may do)', () => {
    expect(proxy(page('/users', 'blocks_rt=abc')).headers.get('location')).toBeNull();
    expect(proxy(page('/', 'blocks_at=abc')).headers.get('location')).toBeNull();
  });
});

describe('the content security policy', () => {
  const policy = (res: Response) => directives(res.headers.get('content-security-policy') ?? '');

  it('names a fresh one-time nonce for every request', () => {
    const a = proxy(page('/login')).headers.get('content-security-policy') ?? '';
    const b = proxy(page('/login')).headers.get('content-security-policy') ?? '';
    const nonce = (s: string) => /'nonce-([^']+)'/.exec(s)?.[1];
    expect(nonce(a)).toBeTruthy();
    expect(nonce(a)).not.toBe(nonce(b));
    expect(a).toContain(`'nonce-${nonce(a)}'`);
  });

  it("allows only this app's own scripts and the ones it marks, never inline script", () => {
    const p = policy(proxy(page('/login')));
    expect(p['script-src']).toContain("'self'");
    expect(p['script-src']).toContain("'strict-dynamic'");
    expect(p['script-src']).not.toContain("'unsafe-inline'");
    expect(p['style-src']).not.toContain("'unsafe-inline'");
    expect(p['style-src-attr']).toEqual(["'unsafe-inline'"]);
  });

  it('shuts the door on everything else a page could be turned to', () => {
    const p = policy(proxy(page('/login')));
    expect(p['default-src']).toEqual(["'self'"]);
    expect(p['object-src']).toEqual(["'none'"]);
    expect(p['frame-ancestors']).toEqual(["'none'"]);
    expect(p['base-uri']).toEqual(["'self'"]);
    expect(p['form-action']).toEqual(["'self'"]);
    expect(p['connect-src']).toEqual(["'self'"]);
  });

  it('lets media load from the API by default, and from the CDN when one is named', () => {
    expect(policy(proxy(page('/login')))['img-src']).toEqual(["'self'", 'http://api.test:4000', 'data:', 'blob:']);
    process.env.MEDIA_ORIGINS = 'https://cdn.example.com';
    resetServerEnvForTests();
    const p = policy(proxy(page('/login')));
    expect(p['img-src']).toEqual(["'self'", 'https://cdn.example.com', 'data:', 'blob:']);
    expect(p['media-src']).toEqual(["'self'", 'https://cdn.example.com']);
  });

  it('lets the browser send uploads only to the storage address that was named', () => {
    process.env.UPLOAD_ORIGINS = 'https://bucket.s3.ap-south-1.amazonaws.com';
    resetServerEnvForTests();
    expect(policy(proxy(page('/login')))['connect-src']).toEqual([
      "'self'",
      'https://bucket.s3.ap-south-1.amazonaws.com',
    ]);
  });

  it('also hands the nonce to the page being rendered', () => {
    const res = proxy(page('/login'));
    expect(res.headers.get('x-middleware-request-x-nonce')).toBeTruthy();
  });
});
