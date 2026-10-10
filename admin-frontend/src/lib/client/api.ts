/**
 * The console's one way of talking to the staff API: through this app's own server (`/api/bff`),
 * which holds the session. Nothing here ever sees a token.
 */

export interface PageMeta {
  nextCursor?: string | null;
  hasMore?: boolean;
}

export interface Envelope<T> {
  data: T;
  meta?: PageMeta;
}

export interface FieldProblem {
  field: string;
  reasons: string[];
}

/** A failed request, in the API's own error shape. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: FieldProblem[] | undefined;
  readonly requestId: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    extra: { details?: FieldProblem[]; requestId?: string; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = extra.details;
    this.requestId = extra.requestId;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }
}

/** The marker every request carries so the server can tell it came from this app's own pages. */
const MARKER = { 'X-Requested-With': 'blocks-console' } as const;

type Query = Record<string, string | number | boolean | null | undefined>;

/** `?a=1&b=x`, leaving out anything empty. */
export function queryString(params: Query = {}): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

let onSignedOut: (() => void) | undefined;

/** Registered once by the signed-in shell: what to do when the server says the session is over. */
export function setSignedOutHandler(handler: (() => void) | undefined): void {
  onSignedOut = handler;
}

async function read(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toError(res: Response, body: unknown): ApiError {
  const e = (body as { error?: Record<string, unknown> } | null)?.error;
  const retry = Number(res.headers.get('retry-after'));
  return new ApiError(
    res.status,
    typeof e?.['code'] === 'string' ? e['code'] : 'UNKNOWN',
    typeof e?.['message'] === 'string' ? e['message'] : 'Something went wrong. Please try again.',
    {
      ...(Array.isArray(e?.['details']) ? { details: e['details'] as FieldProblem[] } : {}),
      ...(typeof e?.['requestId'] === 'string' ? { requestId: e['requestId'] } : {}),
      ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: retry } : {}),
    },
  );
}

async function send<T>(
  url: string,
  method: string,
  body: unknown,
  options: { idempotencyKey?: string; signal?: AbortSignal; sessionEndsOn401?: boolean } = {},
): Promise<Envelope<T>> {
  const headers: Record<string, string> = { ...MARKER, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK', 'You appear to be offline, or the console cannot be reached.');
  }

  const parsed = await read(res);
  if (!res.ok) {
    const failure = toError(res, parsed);
    if (res.status === 401 && options.sessionEndsOn401 !== false) onSignedOut?.();
    throw failure;
  }
  return (parsed ?? { data: null }) as Envelope<T>;
}

export const api = {
  get: <T>(path: string, options?: { signal?: AbortSignal }) => send<T>(`/api/bff/${path}`, 'GET', undefined, options),
  post: <T>(path: string, body?: unknown, options?: { idempotencyKey?: string }) =>
    send<T>(`/api/bff/${path}`, 'POST', body ?? {}, options),
  put: <T>(path: string, body: unknown) => send<T>(`/api/bff/${path}`, 'PUT', body),
  patch: <T>(path: string, body: unknown) => send<T>(`/api/bff/${path}`, 'PATCH', body),
  delete: <T>(path: string) => send<T>(`/api/bff/${path}`, 'DELETE', undefined),
};

/** The sign-in steps. A 401 here is a wrong answer, not an ended session, so it does not sign out. */
export const authApi = {
  call: <T>(action: string, body?: unknown, method: 'GET' | 'POST' = 'POST') =>
    send<T>(`/api/auth/${action}`, method, method === 'POST' ? (body ?? {}) : undefined, {
      sessionEndsOn401: false,
    }),
};

/** A fresh key for one attempt at something that must not happen twice. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
