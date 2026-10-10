import 'server-only';
import { serverEnv } from './env';
import { clientIp } from './client-ip';

/** What the BLOCKS API answered, with the body already read. */
export interface BackendReply {
  status: number;
  /** Parsed JSON, or `null` when the answer had no body or was not JSON. */
  body: unknown;
  /** The value of a `Retry-After` header, so a rate-limited person is told when to try again. */
  retryAfter: string | null;
  /** The raw bytes, when the answer was a file (a scanned document) rather than JSON. */
  file: { bytes: ArrayBuffer; contentType: string; disposition: string | null } | null;
}

export interface BackendCall {
  method: string;
  /** Path below `/api/v1`, starting with `/`, with any query string. */
  path: string;
  token?: string | undefined;
  /** An already-serialised JSON body. */
  body?: string | undefined;
  /** The incoming request's headers, for the person's address, browser name and idempotency key. */
  from?: Headers | undefined;
  signal?: AbortSignal | undefined;
}

const TIMEOUT_MS = 30_000;

/**
 * One call to the BLOCKS API. Errors from the network (the API is down, too slow) are returned as a
 * `503`/`504` reply in the API's own error format, so the page shows the same kind of message either way.
 */
export async function backend(call: BackendCall): Promise<BackendReply> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (call.token) headers['Authorization'] = `Bearer ${call.token}`;
  if (call.body !== undefined) headers['Content-Type'] = 'application/json';
  if (call.from) {
    const ip = clientIp(call.from);
    if (ip) headers['X-Forwarded-For'] = ip;
    const agent = call.from.get('user-agent');
    if (agent) headers['User-Agent'] = agent.slice(0, 400);
    const key = call.from.get('idempotency-key');
    if (key) headers['Idempotency-Key'] = key.slice(0, 100);
  }

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = call.signal ? AbortSignal.any([call.signal, timeout]) : timeout;
  try {
    const res = await fetch(`${serverEnv().apiUrl}/api/v1${call.path}`, {
      method: call.method,
      headers,
      body: call.body,
      signal,
      cache: 'no-store',
      redirect: 'manual',
    });
    const contentType = res.headers.get('content-type') ?? '';
    const retryAfter = res.headers.get('retry-after');
    if (res.ok && contentType && !contentType.includes('json')) {
      return {
        status: res.status,
        body: null,
        retryAfter,
        file: {
          bytes: await res.arrayBuffer(),
          contentType,
          disposition: res.headers.get('content-disposition'),
        },
      };
    }
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { status: res.status, body, retryAfter, file: null };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return {
      status: timedOut ? 504 : 503,
      body: {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: timedOut ? 'The server took too long to answer.' : 'The server cannot be reached right now.',
        },
      },
      retryAfter: null,
      file: null,
    };
  }
}

/** The error code in an API error body, if it has one. */
export function errorCode(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error?: { code?: unknown } }).error;
    return typeof e?.code === 'string' ? e.code : undefined;
  }
  return undefined;
}
