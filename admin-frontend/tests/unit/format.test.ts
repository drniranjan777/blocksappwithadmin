import { describe, expect, it } from 'vitest';
import { avatarColour, formatAgo, formatNumber, formatRupees, humanize, initials } from '@/lib/client/format';

describe('formatRupees', () => {
  it('groups digits the Indian way and always shows two decimals', () => {
    expect(formatRupees('0')).toBe('₹0.00');
    expect(formatRupees('600')).toBe('₹600.00');
    expect(formatRupees('1000')).toBe('₹1,000.00');
    expect(formatRupees('100000.5')).toBe('₹1,00,000.50');
    expect(formatRupees('12345678.90')).toBe('₹1,23,45,678.90');
  });

  it('keeps the sign', () => {
    expect(formatRupees('-150.00')).toBe('-₹150.00');
    expect(formatRupees('-1234567.00')).toBe('-₹12,34,567.00');
  });

  it('is exact for amounts too big for a floating-point number', () => {
    expect(formatRupees('9007199254740993.01')).toBe('₹9,00,71,99,25,47,40,993.01');
  });

  it('shows what it cannot read, rather than guessing', () => {
    expect(formatRupees('about 5')).toBe('about 5');
    expect(formatRupees('1.234')).toBe('1.234');
  });

  it('shows a dash for nothing', () => {
    expect(formatRupees(null)).toBe('—');
    expect(formatRupees(undefined)).toBe('—');
    expect(formatRupees('')).toBe('—');
  });
});

describe('formatNumber', () => {
  it('groups the Indian way', () => {
    expect(formatNumber(1234567)).toBe('12,34,567');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(null)).toBe('—');
  });
});

describe('formatAgo', () => {
  const now = Date.parse('2026-10-09T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('says how long ago, in the unit that fits', () => {
    expect(formatAgo(ago(10_000), now)).toBe('just now');
    expect(formatAgo(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(formatAgo(ago(3 * 3_600_000), now)).toBe('3 h ago');
    expect(formatAgo(ago(2 * 86_400_000), now)).toBe('2 days ago');
    expect(formatAgo(ago(86_400_000), now)).toBe('1 day ago');
  });

  it('falls back to a date after a month, and copes with nothing', () => {
    expect(formatAgo(ago(90 * 86_400_000), now)).toMatch(/\d{4}/);
    expect(formatAgo(null, now)).toBe('never');
    expect(formatAgo('not a date', now)).toBe('—');
  });
});

describe('small text helpers', () => {
  it('humanises codes', () => {
    expect(humanize('UNDER_REVIEW')).toBe('Under review');
    expect(humanize('media.job_retried')).toBe('Media job retried');
    expect(humanize(null)).toBe('—');
  });

  it('makes initials from at most two words', () => {
    expect(initials('Console QA')).toBe('CQ');
    expect(initials('anjali')).toBe('A');
    expect(initials('A B C')).toBe('AB');
    expect(initials('   ')).toBe('?');
  });

  it('gives the same person the same colour every time', () => {
    expect(avatarColour('abc')).toBe(avatarColour('abc'));
    expect(avatarColour('abc')).toMatch(/^#[0-9A-F]{6}$/);
  });
});
