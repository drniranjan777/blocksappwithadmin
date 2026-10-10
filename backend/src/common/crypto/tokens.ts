import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** A URL-safe random token with `bytes` bytes of entropy (default 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacHex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/**
 * Compares two strings in time that does not depend on where they differ.
 * Used for every secret comparison (token hashes, OTP hashes).
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    // Still do a comparison of equal-length buffers so timing does not reveal
    // the length mismatch more than the early return already does.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** A zero-padded numeric code, drawn with a CSPRNG (never Math.random). */
export function randomDigits(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String(randomInt(0, 10));
  return out;
}

/** Ten-character backup codes, grouped for readability: `ABCD-EFGH-JK`. */
const BACKUP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
export function randomBackupCode(): string {
  let raw = '';
  for (let i = 0; i < 10; i++) raw += BACKUP_ALPHABET[randomInt(0, BACKUP_ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/**
 * A temporary password for a new staff account: 18 characters with every class
 * the staff policy needs, no look-alikes (so it can be read off an e-mail), and
 * drawn with a CSPRNG. It works once, until the person sets their own.
 */
export function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const symbol = '#$%&*+=?@';
  const all = upper + lower + digit + symbol;
  const pick = (set: string): string => set[randomInt(0, set.length)] as string;
  const chars = [
    pick(upper),
    pick(upper),
    pick(lower),
    pick(lower),
    pick(digit),
    pick(digit),
    pick(symbol),
  ];
  while (chars.length < 18) chars.push(pick(all));
  // Fisher-Yates, so the guaranteed characters are not always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
}

export function normalizeBackupCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}
