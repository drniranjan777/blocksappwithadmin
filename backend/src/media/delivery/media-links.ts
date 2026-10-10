import { createHmac, timingSafeEqual } from 'node:crypto';

/** A link stays good for between one and two windows; it is the same text for the whole window. */
export const LINK_WINDOW_SECONDS = 6 * 3600;

/**
 * Signed, expiring links to processed media.
 *
 * The API turns a stored key into a link a phone can load with no password:
 *
 *     /api/v1/media/f/pub/<asset>/main.jpg?e=<expiry>&s=<signature>
 *
 * The signature covers the key and the expiry, so neither can be changed; the
 * expiry means a link copied out of the app stops working. The expiry is rounded to a
 * window so the **same text** comes back for several hours: that matters because
 * image caches key on the address, and a link that changed on every request would
 * defeat them and re-download every picture on every visit.
 */
export class MediaLinks {
  constructor(private readonly secret: string) {}

  private mac(key: string, expiry: number): Buffer {
    return createHmac('sha256', this.secret).update(`${key}\n${expiry}`).digest();
  }

  /** The expiry (epoch seconds) for a link made at `nowMs`: the end of the *next* window. */
  expiryFor(nowMs: number, windowSeconds = LINK_WINDOW_SECONDS): number {
    return (Math.floor(nowMs / 1000 / windowSeconds) + 2) * windowSeconds;
  }

  sign(key: string, nowMs = Date.now()): { e: number; s: string } {
    const e = this.expiryFor(nowMs);
    return { e, s: this.mac(key, e).toString('base64url') };
  }

  /** True if `sig` is the signature for exactly this key and expiry, and the expiry has not passed. */
  verify(key: string, e: unknown, s: unknown, nowMs = Date.now()): boolean {
    const expiry = typeof e === 'string' ? Number(e) : typeof e === 'number' ? e : NaN;
    if (!Number.isInteger(expiry) || expiry * 1000 < nowMs || typeof s !== 'string') return false;
    const given = Buffer.from(s, 'base64url');
    const expected = this.mac(key, expiry);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}
