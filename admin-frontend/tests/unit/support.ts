import { NextRequest } from 'next/server';
import { vi } from 'vitest';

export interface ApiCall {
  method: string;
  /** Path and query below the API root, e.g. `/api/v1/admin/users?q=x`. */
  path: string;
  headers: Headers;
  body: string | undefined;
}

export interface FakeReply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** A raw file answer instead of JSON. */
  file?: { bytes: Uint8Array; contentType: string };
}

/**
 * Stands in for the BLOCKS API: every `fetch` the console makes is recorded and answered by `handler`.
 * Returns the recorded calls so a test can see exactly what was sent, and with which token.
 */
export function fakeApi(handler: (call: ApiCall) => FakeReply | Promise<FakeReply>) {
  const calls: ApiCall[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: ApiCall = {
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    calls.push(call);
    const reply = await handler(call);
    if (reply.file) {
      return new Response(reply.file.bytes as BodyInit, {
        status: reply.status ?? 200,
        headers: { 'content-type': reply.file.contentType, 'content-disposition': 'inline; filename="scan.pdf"' },
      });
    }
    const status = reply.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status,
      headers: { 'content-type': 'application/json', ...reply.headers },
    });
  });
  vi.stubGlobal('fetch', impl);
  return { calls, fetch: impl };
}

export const tokenReply = (suffix: string, extra: Record<string, unknown> = {}) => ({
  data: {
    nextStep: null,
    tokens: {
      accessToken: `AT-${suffix}`,
      refreshToken: `RT-${suffix}`,
      tokenType: 'Bearer',
      expiresIn: 900,
      expiresAt: '2030-01-01T00:00:00Z',
    },
    admin: { id: 'a1', name: 'Staff', permissions: ['users.read'] },
    ...extra,
  },
});

export const apiError = (code: string, message = code, details?: unknown) => ({
  error: { code, message, details, requestId: 'req-1' },
});

const ORIGIN = 'http://localhost:3000';

/** A request as this app's own page would make it, unless the test says otherwise. */
export function pageRequest(
  path: string,
  o: {
    method?: string;
    body?: unknown;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    sameOrigin?: boolean;
  } = {},
): NextRequest {
  const method = o.method ?? 'GET';
  const headers = new Headers(o.headers);
  if (o.sameOrigin !== false && method !== 'GET') {
    headers.set('origin', ORIGIN);
    headers.set('x-requested-with', 'blocks-console');
  }
  if (o.cookies)
    headers.set(
      'cookie',
      Object.entries(o.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
    );
  if (o.body !== undefined) headers.set('content-type', 'application/json');
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers,
    ...(o.body !== undefined ? { body: typeof o.body === 'string' ? o.body : JSON.stringify(o.body) } : {}),
  });
}

/** The `Set-Cookie` values of a response, by cookie name. */
export function setCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of res.headers.getSetCookie()) {
    const name = line.split('=')[0];
    if (name) out[name] = line;
  }
  return out;
}

export const params = <T extends Record<string, string[]>>(p: T) => ({ params: Promise.resolve(p) });
