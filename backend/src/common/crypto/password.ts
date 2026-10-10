import * as argon2 from 'argon2';
import { randomToken } from './tokens.js';

/**
 * Password hashing (argon2id) and the password policy.
 *
 * Parameters follow the OWASP Password Storage Cheat Sheet for argon2id
 * (19 MiB, 2 iterations, 1 lane). They are tuned by measuring on the real
 * hardware; raise them when the sign-in latency budget allows.
 */

export type PasswordIssue =
  | 'too_short'
  | 'too_long'
  | 'no_uppercase'
  | 'no_lowercase'
  | 'no_digit'
  | 'no_special'
  | 'too_common'
  | 'contains_identifier';

export interface PasswordPolicy {
  readonly minLength: number;
  readonly maxLength: number;
  readonly requireUppercase: boolean;
  readonly requireLowercase: boolean;
  readonly requireDigit: boolean;
  readonly requireSpecial: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 10,
  // Bounds the work an attacker can force by sending a huge "password".
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: true,
};

/** Staff can reach other people's data, so their passwords are held to a higher bar. */
export const ADMIN_PASSWORD_POLICY: PasswordPolicy = { ...DEFAULT_PASSWORD_POLICY, minLength: 14 };

// A short list of the passwords people actually choose. A production deployment
// should also check against a breached-password service (k-anonymity range API);
// see docs/security.md.
const COMMON = new Set(
  [
    'password',
    'password1',
    'password123',
    'passw0rd',
    'p@ssw0rd',
    'qwerty',
    'qwerty123',
    'qwertyuiop',
    'letmein',
    'welcome',
    'welcome1',
    'admin',
    'admin123',
    'administrator',
    'iloveyou',
    'monkey',
    'dragon',
    'football',
    'baseball',
    'abc123',
    'abcd1234',
    '111111',
    '123456',
    '1234567',
    '12345678',
    '123456789',
    '1234567890',
    '123123',
    '000000',
    'sunshine',
    'princess',
    'master',
    'shadow',
    'superman',
    'batman',
    'trustno1',
    'changeme',
    'blocks',
    'blocks123',
    'india',
    'india123',
    'bharat',
    'bollywood',
    'cricket',
    'cricket123',
    'krishna',
    'shiva',
    'ganesh',
    'hanuman',
    'jaishriram',
    'mumbai',
    'delhi',
    'hyderabad',
    'bangalore',
    'chennai',
    'kolkata',
    'pune123',
    'test1234',
    'testtest',
    'default',
  ].map((p) => p.toLowerCase()),
);

const LEET: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '3': 'e',
  '1': 'i',
  '!': 'i',
  '0': 'o',
  $: 's',
  '5': 's',
  '7': 't',
  '+': 't',
};

/**
 * A common word dressed up the way people do: `Password123!`, `P@ssw0rd`,
 * `Welcome#2026`. Leading and trailing digits and symbols are stripped, then the
 * usual look-alike characters are mapped back to letters. Only an *exact* match
 * with the list counts, so a passphrase that merely contains "password" is fine.
 */
function isDressedCommon(password: string): boolean {
  const base = password.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (base.length < 4) return false;
  const lettersOnly = base.replace(/[^\p{L}]/gu, '');
  const unleeted = [...base]
    .map((ch) => LEET[ch] ?? ch)
    .join('')
    .replace(/[^\p{L}]/gu, '');
  return COMMON.has(lettersOnly) || COMMON.has(unleeted) || COMMON.has(base);
}

function isPatterned(password: string): boolean {
  const p = password.toLowerCase();
  if (/^(.)\1+$/.test(p)) return true; // aaaaaaaaaa
  if (/^(?:0123456789|1234567890|abcdefghij|qwertyuiop|asdfghjkl)/.test(p)) return true;
  return false;
}

export function checkPassword(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
  identifiers: readonly string[] = [],
): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < policy.minLength) issues.push('too_short');
  if (password.length > policy.maxLength) issues.push('too_long');
  if (policy.requireUppercase && !/\p{Lu}/u.test(password)) issues.push('no_uppercase');
  if (policy.requireLowercase && !/\p{Ll}/u.test(password)) issues.push('no_lowercase');
  if (policy.requireDigit && !/\p{Nd}/u.test(password)) issues.push('no_digit');
  if (policy.requireSpecial && !/[^\p{L}\p{N}\s]/u.test(password)) issues.push('no_special');
  if (COMMON.has(password.toLowerCase()) || isDressedCommon(password) || isPatterned(password)) {
    issues.push('too_common');
  }

  const lower = password.toLowerCase();
  for (const raw of identifiers) {
    const id = raw.toLowerCase().split('@')[0] ?? '';
    // Only meaningful identifiers: a 2-letter username would match everything.
    if (id.length >= 4 && lower.includes(id)) {
      issues.push('contains_identifier');
      break;
    }
  }
  return issues;
}

const PARAMS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, PARAMS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // A malformed stored hash is a failed verification, never a crash.
      return false;
    }
  }

  /** True when the stored hash was made with weaker parameters than today's. */
  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, PARAMS);
  }

  /**
   * Spends the same time as a real verification. Called when the account does
   * not exist, so a stranger cannot tell "no such user" from "wrong password"
   * by how long the answer takes.
   */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash(randomToken(16));
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
