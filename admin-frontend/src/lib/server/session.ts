import 'server-only';
import type { NextRequest } from 'next/server';
import { type BackendCall, type BackendReply, backend, errorCode } from './backend';
import { cookieNames, type TokenPair } from './cookies';

/** Pulls the token pair out of the API's sign-in style answer (`{ data: { tokens } }`). */
export function tokensFrom(body: unknown): TokenPair | null {
  const data = (body as { data?: { tokens?: Record<string, unknown> } } | null)?.data;
  const t = data?.tokens;
  if (
    t &&
    typeof t['accessToken'] === 'string' &&
    typeof t['refreshToken'] === 'string' &&
    typeof t['expiresIn'] === 'number'
  ) {
    return { accessToken: t['accessToken'], refreshToken: t['refreshToken'], expiresIn: t['expiresIn'] };
  }
  return null;
}

/**
 * Refresh tokens are single use: the API treats a second use of the same one as theft and ends the
 * session. A page that loads several things at once can send several requests that all notice the
 * expired access token together, so the first refresh is shared by all of them, and its answer is
 * kept for a short while for requests that were already on their way with the old cookie.
 *
 * This is per server process. Behind several instances, route a person's requests to the same one
 * (sticky sessions), or the rare simultaneous request on a second instance will be treated as reuse.
 */
const SHARE_FOR_MS = 20_000;
const refreshes = new Map<string, { result: Promise<TokenPair | null>; settledAt: number | null }>();

function forget(): void {
  const now = Date.now();
  for (const [key, entry] of refreshes) {
    if (entry.settledAt !== null && now - entry.settledAt > SHARE_FOR_MS) refreshes.delete(key);
  }
}

export function refreshTokens(refreshToken: string, from: Headers | undefined): Promise<TokenPair | null> {
  forget();
  const existing = refreshes.get(refreshToken);
  if (existing) return existing.result;
  const entry: { result: Promise<TokenPair | null>; settledAt: number | null } = {
    result: Promise.resolve(null),
    settledAt: null,
  };
  entry.result = backend({
    method: 'POST',
    path: '/admin/auth/refresh',
    body: JSON.stringify({ refreshToken }),
    from,
  })
    .then((reply) => (reply.status === 200 ? tokensFrom(reply.body) : null))
    .catch(() => null)
    .finally(() => {
      entry.settledAt = Date.now();
    });
  refreshes.set(refreshToken, entry);
  return entry.result;
}

export interface SessionReply {
  reply: BackendReply;
  /** New tokens, when the old ones had to be renewed: the caller must set them on its response. */
  renewed: TokenPair | null;
  /** The session is over (expired, ended elsewhere, or could not be renewed): clear the cookies. */
  signedOut: boolean;
}

const OVER = new Set(['SESSION_EXPIRED', 'SESSION_REVOKED']);

/**
 * One call to the API on behalf of the signed-in person, renewing their tokens first if needed.
 */
export async function callAsStaff(
  request: NextRequest,
  call: Omit<BackendCall, 'token' | 'from'>,
): Promise<SessionReply> {
  const names = cookieNames();
  let access = request.cookies.get(names.access)?.value;
  const refresh = request.cookies.get(names.refresh)?.value;
  let renewed: TokenPair | null = null;

  if (!access && !refresh) {
    return {
      reply: {
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } },
        retryAfter: null,
        file: null,
      },
      renewed: null,
      signedOut: true,
    };
  }

  const renew = async (): Promise<boolean> => {
    if (!refresh) return false;
    renewed = await refreshTokens(refresh, request.headers);
    if (!renewed) return false;
    access = renewed.accessToken;
    return true;
  };

  if (!access && !(await renew())) {
    return { reply: unauthenticated(), renewed: null, signedOut: true };
  }

  let reply = await backend({ ...call, token: access, from: request.headers });
  if (reply.status === 401 && !renewed && errorCode(reply.body) === 'TOKEN_EXPIRED') {
    if (!(await renew())) return { reply, renewed: null, signedOut: true };
    reply = await backend({ ...call, token: access, from: request.headers });
  }
  const over =
    reply.status === 401 && (OVER.has(errorCode(reply.body) ?? '') || errorCode(reply.body) === 'UNAUTHENTICATED');
  return { reply, renewed, signedOut: over };
}

function unauthenticated(): BackendReply {
  return {
    status: 401,
    body: { error: { code: 'UNAUTHENTICATED', message: 'Your session has ended. Sign in again.' } },
    retryAfter: null,
    file: null,
  };
}
