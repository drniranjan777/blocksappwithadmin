/**
 * GSTIN (India's goods and services tax number) format and check digit.
 *
 * This checks that a number is *well formed*: 15 characters, a real state code, a PAN-shaped
 * middle, and the right check character. It does not check that the number belongs to this
 * business or is registered; that needs the government's service (or a verification provider),
 * which is not connected. See docs/security.md.
 */

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SHAPE = /^(\d{2})([A-Z]{5}\d{4}[A-Z])([1-9A-Z])Z([0-9A-Z])$/;

/** State and union-territory codes in use (01 to 38, and 97/99 for other territories and centre). */
function stateCodeOk(code: string): boolean {
  const n = Number(code);
  return (n >= 1 && n <= 38) || n === 97 || n === 99;
}

/** The check character for the first 14 characters (a mod-36 Luhn-style sum). */
export function gstinCheckChar(first14: string): string {
  let factor = 2;
  let sum = 0;
  for (let i = first14.length - 1; i >= 0; i--) {
    const value = CHARS.indexOf(first14[i] as string);
    if (value < 0) throw new RangeError('not a GSTIN character');
    const product = factor * value;
    factor = factor === 2 ? 1 : 2;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] as string;
}

export function normaliseGstin(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function isValidGstin(raw: string): boolean {
  const gstin = normaliseGstin(raw);
  const m = SHAPE.exec(gstin);
  if (!m || !stateCodeOk(m[1] as string)) return false;
  return gstinCheckChar(gstin.slice(0, 14)) === gstin[14];
}
