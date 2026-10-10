import { describe, expect, it } from 'vitest';
import { RESERVED_SLUGS, safeWebUrl, slugProblem, slugify } from './business-rules.js';
import { gstinCheckChar, isValidGstin, normaliseGstin } from './gstin.js';

describe('page addresses', () => {
  it('makes a readable address from a name', () => {
    expect(slugify("Raju's Chai & Snacks!")).toBe('rajus-chai-snacks');
    expect(slugify('  Café  Délice  ')).toBe('cafe-delice');
    expect(slugify('Hyderabad Biryani House')).toBe('hyderabad-biryani-house');
    expect(slugify('---a---b---')).toBe('a-b');
  });

  it('cuts a long name to 40 characters without ending on a hyphen', () => {
    const slug = slugify('A very long business name that goes on and on and on forever');
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('gives nothing usable for a name with no Latin letters or digits', () => {
    expect(slugify('చాయ్ దుకాణం')).toBe('');
    expect(slugProblem(slugify('చాయ్ దుకాణం'))).toBe('invalid');
  });

  it('refuses addresses that are malformed or look official', () => {
    expect(slugProblem('my-shop')).toBeNull();
    expect(slugProblem('a')).toBe('invalid');
    expect(slugProblem('ab')).toBe('invalid');
    expect(slugProblem('abc')).toBeNull();
    expect(slugProblem('-bad-start')).toBe('invalid');
    expect(slugProblem('bad-end-')).toBe('invalid');
    expect(slugProblem('Upper')).toBe('invalid');
    expect(slugProblem('has space')).toBe('invalid');
    expect(slugProblem('x'.repeat(41))).toBe('invalid');
    for (const reserved of RESERVED_SLUGS) {
      expect(slugProblem(reserved.length >= 3 ? reserved : `${reserved}00`)).toBe(
        reserved.length >= 3 ? 'reserved' : null,
      );
    }
  });
});

describe('web addresses shown on a page', () => {
  it('accepts a plain https address', () => {
    expect(safeWebUrl('https://example.com')).toBe('https://example.com/');
    expect(safeWebUrl('https://shop.example.co.in/menu?x=1')).toBe(
      'https://shop.example.co.in/menu?x=1',
    );
    expect(safeWebUrl('  https://example.com:443/a  ')).toBe('https://example.com/a');
  });

  it('refuses everything that could point somewhere it should not', () => {
    for (const bad of [
      'http://example.com',
      'ftp://example.com',
      'javascript:alert(1)',
      'data:text/html,hi',
      'https://user:pass@example.com',
      'https://example.com:8443',
      'https://localhost',
      'https://127.0.0.1',
      'https://10.0.0.1/admin',
      'https://[::1]/',
      'https://intranet',
      'https://printer.local',
      'https://db.internal',
      'not a url',
      '',
    ]) {
      expect(safeWebUrl(bad), bad).toBeNull();
    }
  });
});

describe('GSTIN', () => {
  // A well-known sample number from public GST documentation.
  const SAMPLE = '27AAPFU0939F1ZV';

  it('accepts a well-formed number with the right check character', () => {
    expect(isValidGstin(SAMPLE)).toBe(true);
    expect(gstinCheckChar(SAMPLE.slice(0, 14))).toBe('V');
  });

  it('ignores case and spaces', () => {
    expect(isValidGstin('27 aapfu0939f1zv')).toBe(true);
    expect(normaliseGstin(' 27aapfu0939f1zv ')).toBe(SAMPLE);
  });

  it('refuses a wrong check character, shape or state', () => {
    expect(isValidGstin('27AAPFU0939F1ZW')).toBe(false);
    expect(isValidGstin('27AAPFU0939F1XV')).toBe(false); // the 14th character must be Z
    expect(isValidGstin('27AAPFU0939F0ZV')).toBe(false); // entity code starts at 1
    expect(isValidGstin('00AAPFU0939F1ZV')).toBe(false);
    expect(isValidGstin('50AAPFU0939F1ZV')).toBe(false);
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isValidGstin('')).toBe(false);
  });

  it('accepts a number made up with a computed check character, for any valid state', () => {
    for (const state of ['01', '09', '19', '27', '29', '33', '36', '37', '38', '97', '99']) {
      const first14 = `${state}ABCDE1234F1Z`;
      expect(isValidGstin(first14 + gstinCheckChar(first14)), state).toBe(true);
    }
    // One digit changed anywhere breaks it.
    const base = '29ABCDE1234F1Z';
    const good = base + gstinCheckChar(base);
    const tampered = `29ABCDE1235F1Z${good[14]}`;
    expect(isValidGstin(tampered)).toBe(false);
  });
});
