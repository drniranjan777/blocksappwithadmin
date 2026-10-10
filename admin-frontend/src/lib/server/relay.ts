import 'server-only';
import { NextResponse } from 'next/server';
import { clearSessionCookies, setSessionCookies } from './cookies';
import type { SessionReply } from './session';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** An error in the same shape the API uses, for problems found before the API is asked. */
export function problem(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}

/**
 * Turns what the API said into this app's answer to the browser: the same status and body, with the
 * session cookies renewed or cleared if that is what happened along the way. A file (a scanned
 * identity document) is passed on byte for byte but locked down so nothing in it can run.
 */
export function relay({ reply, renewed, signedOut }: SessionReply): NextResponse {
  let response: NextResponse;
  if (reply.file) {
    response = new NextResponse(reply.file.bytes, {
      status: reply.status,
      headers: {
        ...NO_STORE,
        'Content-Type': reply.file.contentType,
        'Content-Disposition': reply.file.disposition ?? 'attachment',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } else if (reply.status === 204) {
    response = new NextResponse(null, { status: 204, headers: NO_STORE });
  } else {
    const body = reply.body ?? {
      error: { code: 'INTERNAL', message: 'The server gave an answer that could not be read.' },
    };
    response = NextResponse.json(body, {
      status: reply.body === null && reply.status < 400 ? 502 : reply.status,
      headers: NO_STORE,
    });
  }
  if (reply.retryAfter) response.headers.set('Retry-After', reply.retryAfter);
  if (renewed) setSessionCookies(response, renewed);
  if (signedOut) clearSessionCookies(response);
  return response;
}
