import { NextResponse, type NextRequest } from 'next/server';
import { cookieNames } from '@/lib/server/cookies';
import { serverEnv } from '@/lib/server/env';

/**
 * Runs before every page request, for two jobs.
 *
 * 1. A fresh Content-Security-Policy with a one-time nonce: only scripts and styles this server
 *    produced for this request may run, so injected markup cannot execute. Pages are rendered per
 *    request for exactly this reason.
 * 2. A quick door check: someone with no session cookie at all is sent to the sign-in page instead of
 *    seeing an empty console. This is a convenience, not security: every call the console makes is
 *    checked again by the API against the person's real roles.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const names = cookieNames();
  const signedIn = request.cookies.has(names.access) || request.cookies.has(names.refresh);

  if (!signedIn && pathname !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV === 'development';
  const env = serverEnv();
  const connect = ["'self'", ...env.uploadOrigins].join(' ');
  // Photos and videos come from the CDN, or from the API itself when no CDN is configured.
  const media = ["'self'", ...(env.mediaOrigins.length ? env.mediaOrigins : [new URL(env.apiUrl).origin])].join(' ');
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // React sets style="" on elements (bar widths, chart sizes); that is not the same as allowing <style> blocks.
    "style-src-attr 'unsafe-inline'",
    `img-src ${media} data: blob:`,
    `media-src ${media}`,
    "font-src 'self'",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
