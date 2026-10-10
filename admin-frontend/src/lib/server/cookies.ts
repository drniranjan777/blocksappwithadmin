import 'server-only';
import type { NextResponse } from 'next/server';
import { serverEnv } from './env';

/**
 * The staff session lives in two cookies the page's JavaScript can never read (`HttpOnly`):
 * a short-lived access token and the refresh token that renews it. Both are `SameSite=Strict`, so
 * another site cannot make the browser send them, and both are session cookies, so closing the
 * browser signs the person out (the API also ends sessions after 30 idle minutes and 8 hours).
 *
 * In production the `__Host-` prefix makes the browser refuse a cookie that was not set over HTTPS
 * from this exact host, which stops a look-alike sub-domain from planting one.
 */
export interface CookieNames {
  access: string;
  refresh: string;
}

export function cookieNames(): CookieNames {
  const prefix = serverEnv().cookieSecure ? '__Host-' : '';
  return { access: `${prefix}blocks_at`, refresh: `${prefix}blocks_rt` };
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Seconds the access token stays valid. */
  expiresIn: number;
}

interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  path: '/';
  maxAge?: number;
}

function base(): CookieOptions {
  return { httpOnly: true, secure: serverEnv().cookieSecure, sameSite: 'strict', path: '/' };
}

export function setSessionCookies(response: NextResponse, tokens: TokenPair): void {
  const names = cookieNames();
  // The cookie outlives the token slightly so the server can notice the expiry and refresh,
  // instead of the browser quietly dropping the cookie and the person seeing a sign-in page.
  response.cookies.set(names.access, tokens.accessToken, {
    ...base(),
    maxAge: Math.max(60, tokens.expiresIn + 60),
  });
  response.cookies.set(names.refresh, tokens.refreshToken, base());
}

export function clearSessionCookies(response: NextResponse): void {
  const names = cookieNames();
  for (const name of [names.access, names.refresh]) {
    response.cookies.set(name, '', { ...base(), maxAge: 0 });
  }
}
