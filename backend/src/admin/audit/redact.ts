/**
 * Strips anything that looks like a secret or a full personal identifier from a
 * value before it goes into the audit log.
 *
 * The audit log is read by many people and kept for years, so it must never
 * hold what would let someone impersonate a user or move money. Callers are
 * expected to pass already-minimal snapshots; this is the safety net for the day
 * one forgets.
 *
 * Keys are matched by whole *words* (`refreshToken` -> refresh, token), not by
 * substring, so `company` is not mistaken for `pan` and `hashtags` for `hash`.
 */
const SECRET_WORDS = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'hash',
  'otp',
  'code',
  'pin',
  'cvv',
  'jwt',
  'authorization',
  'cookie',
  'aadhaar',
  'aadhar',
  'pan',
  'ifsc',
  'upi',
  'card',
  'dob',
]);

/** Multi-word names whose parts are harmless alone. */
const SECRET_PHRASES = ['private_key', 'api_key', 'account_number', 'date_of_birth', 'birth_date'];

export const REDACTED = '[redacted]';

const MAX_DEPTH = 6;
const MAX_STRING = 2_000;
const MAX_KEYS = 60;

function words(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 ? w.replace(/s$/, '') : w));
}

export function isSecretKey(key: string): boolean {
  const parts = words(key);
  if (parts.some((w) => SECRET_WORDS.has(w))) return true;
  const joined = `_${parts.join('_')}_`;
  return SECRET_PHRASES.some((phrase) => joined.includes(`_${phrase}_`));
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > MAX_DEPTH) return '[truncated]';
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS)) {
      out[key] = isSecretKey(key) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}
