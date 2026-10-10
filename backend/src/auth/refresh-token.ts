import { isUuid } from '../common/ids.js';
import { randomToken, sha256Hex } from '../common/crypto/tokens.js';

/**
 * A refresh token is `<session id>.<secret>`.
 *
 *   - The session id lets the server find the row with a primary-key lookup
 *     instead of searching by token.
 *   - The secret is 256 random bits. Only its SHA-256 is stored, so a leaked
 *     database does not leak usable tokens. (A fast hash is right here: the input
 *     is already unguessable, unlike a password.)
 */
export interface IssuedRefreshToken {
  token: string;
  hash: string;
}

export function issueRefreshToken(sessionId: string): IssuedRefreshToken {
  const secret = randomToken(32);
  return { token: `${sessionId}.${secret}`, hash: sha256Hex(secret) };
}

export function parseRefreshToken(token: string): { sessionId: string; hash: string } | undefined {
  const dot = token.indexOf('.');
  if (dot !== 36) return undefined;
  const sessionId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!isUuid(sessionId) || secret.length < 32 || secret.length > 64) return undefined;
  return { sessionId, hash: sha256Hex(secret) };
}
