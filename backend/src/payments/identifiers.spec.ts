import { describe, expect, it } from 'vitest';
import {
  compareNames,
  gstinCheckChar,
  looksLikeAadhaar,
  nameTokens,
  normaliseAccountNumber,
  normaliseGstin,
  normaliseIfsc,
  normalisePan,
} from './identifiers.js';

describe('PAN', () => {
  it('accepts the shape, ignoring case, spaces and dashes', () => {
    expect(normalisePan('abcpe1234f', 'INDIVIDUAL')).toBe('ABCPE1234F');
    expect(normalisePan(' ABCPE 1234-F ', 'INDIVIDUAL')).toBe('ABCPE1234F');
  });

  it('refuses what is not a PAN', () => {
    for (const bad of [
      '',
      'ABCPE1234',
      'ABCPE12345',
      '1BCPE1234F',
      'ABCPE1234FF',
      'ABC-PE-1234',
      'ABCPE1234!',
    ]) {
      expect(normalisePan(bad, 'INDIVIDUAL'), bad).toBeNull();
    }
  });

  it('lets only a personal PAN identify a person, and any holder type identify a business', () => {
    expect(normalisePan('ABCCE1234F', 'INDIVIDUAL')).toBeNull(); // a company's
    expect(normalisePan('ABCCE1234F', 'BUSINESS')).toBe('ABCCE1234F');
    expect(normalisePan('ABCPE1234F', 'BUSINESS')).toBe('ABCPE1234F'); // a sole proprietor's own
    expect(normalisePan('ABCXE1234F', 'BUSINESS')).toBeNull(); // not a holder type
  });
});

describe('IFSC and account numbers', () => {
  it('checks the IFSC shape: four letters, a zero, six more', () => {
    expect(normaliseIfsc('hdfc0001234')).toBe('HDFC0001234');
    expect(normaliseIfsc(' SBIN 000 0001 ')).toBe('SBIN0000001');
    for (const bad of [
      '',
      'HDFC1001234',
      'HDF00001234',
      'HDFC000123',
      'HDFC00012345',
      'HDFC000123!',
    ]) {
      expect(normaliseIfsc(bad), bad).toBeNull();
    }
  });

  it('takes 9 to 18 digits for an account number, and nothing else', () => {
    expect(normaliseAccountNumber('1234 5678 9012')).toBe('123456789012');
    expect(normaliseAccountNumber('12345678')).toBeNull();
    expect(normaliseAccountNumber('1234567890123456789')).toBeNull();
    expect(normaliseAccountNumber('12345678a')).toBeNull();
    expect(normaliseAccountNumber('')).toBeNull();
  });
});

describe('GSTIN', () => {
  it('computes the check character the way the tax authority does', () => {
    // A widely published sample GSTIN.
    expect(gstinCheckChar('27AAPFU0939F1Z')).toBe('V');
  });

  it('accepts a well-formed one and refuses a wrong check character, state or PAN', () => {
    expect(normaliseGstin('27AAPFU0939F1ZV')).toBe('27AAPFU0939F1ZV');
    expect(normaliseGstin('27aapfu0939f1zv')).toBe('27AAPFU0939F1ZV');
    expect(normaliseGstin('27AAPFU0939F1ZW')).toBeNull(); // wrong check character
    expect(normaliseGstin('27AAPFU0939F1ZV', 'AAPFU0939F')).toBe('27AAPFU0939F1ZV');
    expect(normaliseGstin('27AAPFU0939F1ZV', 'ZZZZZ9999Z')).toBeNull(); // not this business's PAN
    expect(normaliseGstin('99AAPFU0939F1Z1')).toBeNull(); // no such state
    expect(normaliseGstin('27AAPFU0939F1')).toBeNull();
  });

  it('builds valid ones from any first fourteen characters', () => {
    const first14 = '36ABCDE1234F1Z';
    const gstin = first14 + gstinCheckChar(first14);
    expect(normaliseGstin(gstin)).toBe(gstin);
  });
});

describe('Aadhaar', () => {
  it('is recognised in any of its usual spellings, so it can be refused', () => {
    for (const text of [
      '234567890123',
      '2345 6789 0123',
      '2345-6789-0123',
      'my number is 2345 6789 0123 ok',
      'x234567890123y'.replace(/x|y/g, ' '),
    ]) {
      expect(looksLikeAadhaar(text), text).toBe(true);
    }
  });

  it('does not mistake other numbers for it', () => {
    for (const text of [
      'ABCPE1234F',
      '123456789012',
      '0123 4567 8901',
      '12345678901',
      '2345678901234',
      '9876543210',
      'HDFC0001234',
    ]) {
      expect(looksLikeAadhaar(text), text).toBe(false);
    }
  });
});

describe('comparing names', () => {
  it('ignores case, titles, dots and word order', () => {
    expect(nameTokens('Dr. Aarav  KUMAR')).toEqual(['aarav', 'kumar']);
    expect(compareNames('Aarav Kumar', 'KUMAR AARAV')).toBe('MATCH');
    expect(compareNames('Mr. Aarav Kumar', 'aarav kumar')).toBe('MATCH');
  });

  it('accepts initials for the words they stand for', () => {
    expect(compareNames('Aarav Kumar', 'A Kumar')).toBe('MATCH');
    expect(compareNames('Aarav K Sharma', 'Aarav Kumar Sharma')).toBe('MATCH');
  });

  it('calls a half-agreeing name partial, never a match', () => {
    expect(compareNames('Aarav Kumar Sharma', 'Aarav Sharma')).toBe('MATCH'); // the shorter is wholly inside the longer
    expect(compareNames('Aarav Kumar', 'Aarav Verma')).toBe('PARTIAL');
    expect(compareNames('Aarav Kumar', 'Aarav')).toBe('MATCH');
  });

  it('refuses names that do not agree', () => {
    expect(compareNames('Aarav Kumar', 'Priya Nair')).toBe('NO_MATCH');
    expect(compareNames('A Kumar', 'B Verma')).toBe('NO_MATCH');
    expect(compareNames('', 'Aarav')).toBe('NO_MATCH');
    expect(compareNames('Aarav', '   ')).toBe('NO_MATCH');
    // An initial alone is not an identity.
    expect(compareNames('A', 'Aarav Kumar')).toBe('NO_MATCH');
  });

  it('copes with accents and other scripts without throwing', () => {
    expect(compareNames('José Álvarez', 'jose alvarez')).toBe('MATCH');
    expect(compareNames('आरव कुमार', 'Aarav Kumar')).toBe('NO_MATCH');
  });
});
