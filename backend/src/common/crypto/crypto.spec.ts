import { describe, expect, it } from 'vitest';
import { BlindIndex, FieldCipher, FieldCipherError } from './field-cipher.js';
import {
  maskAccountNumber,
  maskEmail,
  maskIdentifier,
  maskIp,
  maskName,
  maskPhone,
} from './mask.js';
import { PasswordHasher, checkPassword } from './password.js';
import {
  normalizeBackupCode,
  randomBackupCode,
  randomDigits,
  randomToken,
  safeEqual,
  sha256Hex,
} from './tokens.js';

const key = (b: number): string => Buffer.alloc(32, b).toString('base64');
const cipherWith = (active = 'k1'): FieldCipher =>
  new FieldCipher(JSON.stringify({ k1: key(1), k2: key(2) }), active);

describe('FieldCipher', () => {
  it('round-trips and never repeats a ciphertext', () => {
    const c = cipherWith();
    const a = c.encrypt('ABCDE1234F', 'kyc.pan:1');
    const b = c.encrypt('ABCDE1234F', 'kyc.pan:1');
    expect(a).not.toBe(b);
    expect(a).not.toContain('ABCDE1234F');
    expect(c.decrypt(a, 'kyc.pan:1')).toBe('ABCDE1234F');
    expect(c.decrypt(b, 'kyc.pan:1')).toBe('ABCDE1234F');
  });

  it('handles unicode and empty strings', () => {
    const c = cipherWith();
    expect(c.decrypt(c.encrypt('ఆరవ్ కుమార్ 🙂', 'x'), 'x')).toBe('ఆరవ్ కుమార్ 🙂');
    expect(c.decrypt(c.encrypt('', 'x'), 'x')).toBe('');
  });

  it('refuses a ciphertext moved to another row or column', () => {
    const c = cipherWith();
    const envelope = c.encrypt('123456789012', 'bank.account:row-1');
    expect(() => c.decrypt(envelope, 'bank.account:row-2')).toThrow(FieldCipherError);
    expect(() => c.decrypt(envelope, 'bank.holder:row-1')).toThrow(FieldCipherError);
  });

  it('detects tampering with any part', () => {
    const c = cipherWith();
    const [v, id, nonce, body, tag] = c.encrypt('secret', 'ctx').split('.') as [
      string,
      string,
      string,
      string,
      string,
    ];
    const flip = (s: string): string => (s.startsWith('A') ? 'B' : 'A') + s.slice(1);
    for (const broken of [
      [v, id, flip(nonce), body, tag],
      [v, id, nonce, flip(body), tag],
      [v, id, nonce, body, flip(tag)],
    ]) {
      expect(() => c.decrypt(broken.join('.'), 'ctx')).toThrow(FieldCipherError);
    }
    expect(() => c.decrypt('garbage', 'ctx')).toThrow(FieldCipherError);
  });

  it('rotates keys: old values stay readable, new ones use the active key', () => {
    const old = cipherWith('k1').encrypt('value', 'ctx');
    const rotated = cipherWith('k2');
    expect(rotated.needsRotation(old)).toBe(true);
    expect(rotated.decrypt(old, 'ctx')).toBe('value');
    const fresh = rotated.encrypt('value', 'ctx');
    expect(rotated.needsRotation(fresh)).toBe(false);
    // A deployment that lost k1 cannot read old values, and says so.
    const withoutK1 = new FieldCipher(JSON.stringify({ k2: key(2) }), 'k2');
    expect(() => withoutK1.decrypt(old, 'ctx')).toThrow(/no key "k1"/);
  });

  it('rejects bad key material', () => {
    expect(
      () => new FieldCipher(JSON.stringify({ k1: Buffer.alloc(16).toString('base64') }), 'k1'),
    ).toThrow(/32 bytes/);
    expect(() => new FieldCipher(JSON.stringify({ k1: key(1) }), 'missing')).toThrow(
      /not configured/,
    );
    expect(() => new FieldCipher(JSON.stringify({ 'a.b': key(1) }), 'a.b')).toThrow(
      /must not contain/,
    );
  });
});

describe('BlindIndex', () => {
  const index = new BlindIndex('k'.repeat(40));
  it('is deterministic for the same purpose and value', () => {
    expect(index.of('pan', 'ABCDE1234F')).toBe(index.of('pan', 'ABCDE1234F'));
    expect(index.of('pan', 'ABCDE1234F')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs by purpose, value and key', () => {
    expect(index.of('pan', 'ABCDE1234F')).not.toBe(index.of('bank', 'ABCDE1234F'));
    expect(index.of('pan', 'ABCDE1234F')).not.toBe(index.of('pan', 'ABCDE1234G'));
    expect(index.of('pan', 'x')).not.toBe(new BlindIndex('z'.repeat(40)).of('pan', 'x'));
  });
  it('cannot be fooled by values that run into the purpose', () => {
    expect(index.of('a', 'bc')).not.toBe(index.of('ab', 'c'));
  });
});

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('hashes with argon2id, salts, and verifies', async () => {
    const a = await hasher.hash('Correct-Horse-9!');
    const b = await hasher.hash('Correct-Horse-9!');
    // The parameters, in whatever order the library encodes them: argon2id, 19 MiB, 2 passes, 1 lane.
    expect(a).toMatch(/^\$argon2id\$v=19\$/);
    expect(a).toContain('m=19456');
    expect(a).toContain('t=2');
    expect(a).toContain('p=1');
    expect(a).not.toBe(b);
    expect(await hasher.verify(a, 'Correct-Horse-9!')).toBe(true);
    expect(await hasher.verify(a, 'correct-horse-9!')).toBe(false);
    expect(hasher.needsRehash(a)).toBe(false);
  });

  it('treats a malformed hash as a failed login, not a crash', async () => {
    expect(await hasher.verify('not-a-hash', 'x')).toBe(false);
    expect(await hasher.verify('', 'x')).toBe(false);
  });

  it('flags a hash made with weaker parameters', async () => {
    const argon2 = await import('argon2');
    const weak = await argon2.hash('x', {
      type: argon2.argon2id,
      memoryCost: 4096,
      timeCost: 1,
      parallelism: 1,
    });
    expect(hasher.needsRehash(weak)).toBe(true);
  });

  it('takes comparable time for an unknown account', async () => {
    const real = await hasher.hash('Some-Password-1!');
    const t = async (fn: () => Promise<unknown>): Promise<number> => {
      const s = performance.now();
      await fn();
      return performance.now() - s;
    };
    await hasher.verifyDummy('warm-up'); // build the dummy hash once
    const known = Math.min(
      await t(() => hasher.verify(real, 'wrong')),
      await t(() => hasher.verify(real, 'wrong')),
    );
    const unknown = Math.min(
      await t(() => hasher.verifyDummy('wrong')),
      await t(() => hasher.verifyDummy('wrong')),
    );
    // Same order of magnitude: the dummy path really does the work.
    expect(unknown).toBeGreaterThan(known * 0.5);
    expect(unknown).toBeLessThan(known * 2);
  });
});

describe('password policy', () => {
  const ok = 'Tr1cky-Monsoon!';
  it('accepts a strong password', () => {
    expect(checkPassword(ok)).toEqual([]);
  });
  it('reports each rule that fails', () => {
    expect(checkPassword('Short1!')).toContain('too_short');
    expect(checkPassword('alllowercase1!')).toContain('no_uppercase');
    expect(checkPassword('ALLUPPERCASE1!')).toContain('no_lowercase');
    expect(checkPassword('NoDigitsHere!!')).toContain('no_digit');
    expect(checkPassword('NoSpecial12345')).toContain('no_special');
    expect(checkPassword('x'.repeat(129))).toContain('too_long');
  });
  it('rejects common and patterned passwords whatever they contain', () => {
    expect(checkPassword('Password123')).toContain('too_common');
    expect(checkPassword('aaaaaaaaaaaa')).toContain('too_common');
    expect(checkPassword('1234567890')).toContain('too_common');
  });
  it('sees through the usual disguises of a common word', () => {
    for (const disguised of [
      'Password123!',
      'P@ssw0rd!!',
      'Welcome#2026',
      'LETMEIN2026!',
      'Qwerty!2026',
      'Cricket-99!',
    ]) {
      expect(checkPassword(disguised), disguised).toContain('too_common');
    }
  });
  it('does not mind a long passphrase that merely contains a common word', () => {
    expect(checkPassword('Correct-Horse-Password-Battery-9!')).toEqual([]);
    expect(checkPassword('Sunrise!Pass-2026')).toEqual([]);
  });
  it("rejects a password built from the user's own identifiers", () => {
    expect(checkPassword('Aarav.kumar-1990!', undefined, ['aarav.kumar'])).toContain(
      'contains_identifier',
    );
    expect(checkPassword('Priya-Rocks-99!', undefined, ['priya@example.com'])).toContain(
      'contains_identifier',
    );
    // A very short identifier would match everything, so it is ignored.
    expect(checkPassword(ok, undefined, ['to'])).toEqual([]);
  });
  it('counts non-Latin letters as letters', () => {
    expect(checkPassword('మాటలేదు-Pass-9!')).toEqual([]);
  });
});

describe('tokens', () => {
  it('generates long, unique, URL-safe tokens', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(Array.from({ length: 200 }, () => randomToken())).size).toBe(200);
  });
  it('generates digit codes of the right length, including leading zeros', () => {
    for (let i = 0; i < 200; i++) expect(randomDigits(6)).toMatch(/^\d{6}$/);
    expect(Array.from({ length: 2000 }, () => randomDigits(6)).some((c) => c.startsWith('0'))).toBe(
      true,
    );
  });
  it('compares secrets safely', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
  it('hashes with SHA-256', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('makes readable backup codes that survive being typed sloppily', () => {
    const code = randomBackupCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$/);
    expect(code).not.toMatch(/[IO01]/);
    expect(normalizeBackupCode(` ${code.toLowerCase()} `)).toBe(code.replace(/-/g, ''));
  });
});

describe('masking', () => {
  it('masks e-mail, phone, names and identifiers', () => {
    expect(maskEmail('rohit.sharma@example.com')).toBe('r***@example.com');
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskPhone('+919876543210')).toBe('+91 ••••• •3210');
    expect(maskPhone('123')).toBe('***');
    expect(maskName('Aarav Kumar')).toBe('A**** K****');
    expect(maskIdentifier('ABCDE1234F')).toBe('XXXXXX234F');
    expect(maskIdentifier('2345 6789 4821')).toBe('XXXXXXXX4821');
    expect(maskIdentifier('123')).toBe('XXX');
    expect(maskAccountNumber('123456784821')).toBe('•••• 4821');
  });
  it('masks IP addresses', () => {
    expect(maskIp('203.0.113.45')).toBe('203.0.113.x');
    expect(maskIp('2001:db8:1::5')).toBe('2001:db8:1:…');
    expect(maskIp('garbage')).toBe('***');
  });
  it('never returns the input for sensitive values', () => {
    for (const v of ['ABCDE1234F', '123456784821', 'rohit@example.com', '+919876543210']) {
      for (const fn of [maskIdentifier, maskAccountNumber, maskEmail, maskPhone]) {
        expect(fn(v)).not.toBe(v);
      }
    }
  });
});
