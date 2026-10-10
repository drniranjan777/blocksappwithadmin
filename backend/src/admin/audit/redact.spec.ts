import { describe, expect, it } from 'vitest';
import { REDACTED, redact } from './redact.js';

describe('audit redaction', () => {
  it('hides secrets by key name, at any depth', () => {
    const out = redact({
      email: 'a@b.test',
      password: 'hunter2',
      nested: { refreshToken: 'abc', otpCode: '123456', ok: 1, deeper: { apiKey: 'k' } },
      list: [{ secret: 's', name: 'n' }],
    }) as Record<string, any>;
    expect(out.email).toBe('a@b.test');
    expect(out.password).toBe(REDACTED);
    expect(out.nested.refreshToken).toBe(REDACTED);
    expect(out.nested.otpCode).toBe(REDACTED);
    expect(out.nested.ok).toBe(1);
    expect(out.nested.deeper.apiKey).toBe(REDACTED);
    expect(out.list[0].secret).toBe(REDACTED);
    expect(out.list[0].name).toBe('n');
  });

  it('hides financial and identity identifiers', () => {
    const out = redact({
      accountNumber: '123456789012',
      ifsc: 'HDFC0001234',
      pan: 'ABCDE1234F',
      aadhaarNumber: '1234 5678 9012',
      upiId: 'a@upi',
      dateOfBirth: '1999-01-01',
      state: 'Telangana',
    }) as Record<string, unknown>;
    for (const k of ['accountNumber', 'ifsc', 'pan', 'aadhaarNumber', 'upiId', 'dateOfBirth']) {
      expect(out[k], k).toBe(REDACTED);
    }
    expect(out['state']).toBe('Telangana');
  });

  it('matches whole words, not fragments of harmless names', () => {
    const out = redact({
      company: 'Acme',
      hashtags: ['#a'],
      expand: true,
      pinned: true,
      discard: 1,
      barcode: 'x',
      description: 'd',
      backupCodes: ['a'],
      access_token_hash: 'h',
      PAN: 'ABCDE1234F',
      privateKey: 'k',
      birthDate: '2000-01-01',
    }) as Record<string, unknown>;
    for (const harmless of ['company', 'hashtags', 'expand', 'pinned', 'discard', 'description']) {
      expect(out[harmless], harmless).not.toBe(REDACTED);
    }
    for (const secret of ['backupCodes', 'access_token_hash', 'PAN', 'privateKey', 'birthDate']) {
      expect(out[secret], secret).toBe(REDACTED);
    }
  });

  it('bounds size and depth so a huge value cannot bloat the log', () => {
    const long = redact('x'.repeat(10_000)) as string;
    expect(long.length).toBeLessThan(2_100);
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 20; i++) deep = { next: deep };
    expect(JSON.stringify(redact(deep))).toContain('[truncated]');
    const many = redact(
      Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, i])),
    ) as object;
    expect(Object.keys(many).length).toBe(60);
  });

  it('keeps dates, nulls and primitives', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeNull();
    expect(redact(5)).toBe(5);
    expect(redact(true)).toBe(true);
    expect(redact(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01T00:00:00.000Z');
    expect(redact(10n)).toBe('10');
  });
});
