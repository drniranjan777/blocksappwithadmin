import { Errors } from '../common/errors/app-error.js';

export type IdentifierKind = 'email' | 'phone' | 'username';

export interface Identifier {
  kind: IdentifierKind;
  /** Normalised: lower-case e-mail / username, E.164 phone. */
  value: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME = /^[a-z0-9._]{3,30}$/;

export function normalizeEmail(raw: string): string | undefined {
  const value = raw.trim().toLowerCase();
  return value.length <= 254 && EMAIL.test(value) ? value : undefined;
}

/**
 * E.164 from what people actually type: `+91 98765 43210`, `098765 43210`,
 * `9876543210` (a 10-digit Indian mobile number, which starts 6-9),
 * `919876543210`. Anything else must already start with `+`.
 */
export function normalizePhone(raw: string, defaultCountryCode = '91'): string | undefined {
  const compact = raw.replace(/[\s\-().]/g, '');
  let digits: string;
  if (compact.startsWith('+')) {
    digits = compact.slice(1);
  } else if (/^0\d{10}$/.test(compact) && defaultCountryCode === '91') {
    digits = `91${compact.slice(1)}`;
  } else if (/^[6-9]\d{9}$/.test(compact) && defaultCountryCode === '91') {
    digits = `91${compact}`;
  } else if (/^91[6-9]\d{9}$/.test(compact)) {
    digits = compact;
  } else {
    return undefined;
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : undefined;
}

export function normalizeUsername(raw: string): string | undefined {
  const value = raw.trim().replace(/^@/, '').toLowerCase();
  return USERNAME.test(value) ? value : undefined;
}

/** What the user typed into a "username, e-mail or phone" box. */
export function parseIdentifier(raw: string): Identifier {
  const text = raw.trim();
  if (text.includes('@') && !text.startsWith('@')) {
    const email = normalizeEmail(text);
    if (email) return { kind: 'email', value: email };
  } else if (/^[+\d][\d\s\-().+]*$/.test(text)) {
    const phone = normalizePhone(text);
    if (phone) return { kind: 'phone', value: phone };
  } else {
    const username = normalizeUsername(text);
    if (username) return { kind: 'username', value: username };
  }
  // The same answer whatever was wrong with it: no hint about what exists.
  throw Errors.invalidCredentials();
}
