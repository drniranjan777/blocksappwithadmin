/**
 * Indian identifiers, checked for shape before anything is stored or sent to a provider.
 *
 * Shape is not truth: a PAN that passes here still has to be verified by the KYC provider, and
 * an IFSC that passes still has to belong to a branch. These checks exist to turn typing
 * mistakes into immediate, specific errors, to keep garbage out of the database, and, in the
 * case of Aadhaar, to make sure the number is never accepted at all.
 */

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const ACCOUNT = /^[0-9]{9,18}$/;
const AADHAAR = /(?<![0-9])[2-9][0-9]{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}(?![0-9])/;

/** Spaces and dashes people type are not part of the identifier. */
const compact = (text: string): string => text.replace(/[\s-]/g, '').toUpperCase();

/**
 * The fourth character of a PAN says who holds it. An individual's is `P`; the others are
 * organisations. A sole proprietor trades on their personal PAN, so a business may use `P` too.
 */
const ORGANISATION_PAN_TYPES = new Set(['C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G']);

export function normalisePan(text: string, subject: 'INDIVIDUAL' | 'BUSINESS'): string | null {
  const pan = compact(text);
  if (!PAN.test(pan)) return null;
  const holder = pan[3] as string;
  if (subject === 'INDIVIDUAL') return holder === 'P' ? pan : null;
  return holder === 'P' || ORGANISATION_PAN_TYPES.has(holder) ? pan : null;
}

export function normaliseIfsc(text: string): string | null {
  const code = compact(text);
  return IFSC.test(code) ? code : null;
}

export function normaliseAccountNumber(text: string): string | null {
  const digits = text.replace(/[\s-]/g, '');
  return ACCOUNT.test(digits) ? digits : null;
}

const GST_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The check character GSTIN carries as its fifteenth, from the first fourteen. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < first14.length; i++) {
    const value = GST_ALPHABET.indexOf(first14[i] as string);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GST_ALPHABET[(36 - (sum % 36)) % 36] as string;
}

/**
 * A GSTIN: shape, a state code from 01 to 38, the check character, and (when given) the PAN
 * embedded in it matching the business's PAN. Whether it is registered is the provider's job.
 */
export function normaliseGstin(text: string, pan?: string): string | null {
  const gstin = compact(text);
  if (!GSTIN.test(gstin)) return null;
  const state = Number(gstin.slice(0, 2));
  if (state < 1 || state > 38) return null;
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) return null;
  if (pan && gstin.slice(2, 12) !== pan) return null;
  return gstin;
}

/**
 * Does this text contain a 12-digit number shaped like an Aadhaar number?
 *
 * BLOCKS never collects, stores or authenticates Aadhaar numbers. Anywhere a document number
 * or free text could carry one, it is refused, rather than stored and masked, because the
 * safest Aadhaar number to hold is one that was never received.
 */
export function looksLikeAadhaar(text: string): boolean {
  return AADHAAR.test(text);
}

// ------------------------------------------------------------------- names --

const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'shri', 'smt', 'sri', 'dr', 'md', 'late']);

/** Lower-case words with titles, dots and punctuation removed: "Dr. A. Kumar" -> ["a", "kumar"]. */
export function nameTokens(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !TITLES.has(t));
}

export type NameMatchResult = 'MATCH' | 'PARTIAL' | 'NO_MATCH';

/**
 * How well two names agree, for comparing the name on an identity case with the name the
 * bank holds. Word order and initials do not matter ("Kumar A" matches "Aarav Kumar"):
 *
 *   MATCH     every word of the shorter name is in the longer, as a word or an initial
 *   PARTIAL   at least half of them are, and at least one full word: a person must look
 *   NO_MATCH  anything less
 *
 * This is deliberately strict about the first two and never the last word of confidence: a
 * partial match is never paid out without a human decision.
 */
export function compareNames(a: string, b: string): NameMatchResult {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (left.length === 0 || right.length === 0) return 'NO_MATCH';
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  const pool = [...long];
  let full = 0;
  let initials = 0;
  for (const token of short) {
    const exact = pool.indexOf(token);
    if (exact >= 0) {
      pool.splice(exact, 1);
      full++;
      continue;
    }
    const initial =
      token.length === 1
        ? pool.findIndex((p) => p.startsWith(token))
        : pool.findIndex((p) => p.length === 1 && token.startsWith(p));
    if (initial >= 0) {
      pool.splice(initial, 1);
      initials++;
    }
  }
  const matched = full + initials;
  if (matched === short.length && full >= 1) return 'MATCH';
  if (full >= 1 && matched * 2 >= short.length) return 'PARTIAL';
  return 'NO_MATCH';
}
