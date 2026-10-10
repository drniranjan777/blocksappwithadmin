import { describe, expect, it } from 'vitest';
import { AppError } from '../common/errors/app-error.js';
import {
  normalizeEmail,
  normalizePhone,
  normalizeUsername,
  parseIdentifier,
} from './identifier.js';
import {
  assessLogin,
  changedPasswordRecently,
  networkOf,
  type LoginSignals,
} from './login-risk.js';

describe('identifier parsing', () => {
  it('normalises e-mail to lower case and trims', () => {
    expect(normalizeEmail('  Priya.Rao@Example.COM ')).toBe('priya.rao@example.com');
    expect(normalizeEmail('no-at-sign')).toBeUndefined();
    expect(normalizeEmail('a@b')).toBeUndefined();
    expect(normalizeEmail(`${'x'.repeat(250)}@e.com`)).toBeUndefined();
  });

  it('turns the ways Indians write a mobile number into E.164', () => {
    for (const typed of [
      '+91 98765 43210',
      '+91-9876543210',
      '09876543210',
      '98765 43210',
      '919876543210',
      '(+91) 98765-43210',
    ]) {
      expect(normalizePhone(typed), typed).toBe('+919876543210');
    }
  });

  it('accepts other countries only with a +, and rejects nonsense', () => {
    expect(normalizePhone('+14155552671')).toBe('+14155552671');
    expect(normalizePhone('+44 7911 123456')).toBe('+447911123456');
    expect(normalizePhone('14155552671')).toBeUndefined();
    expect(normalizePhone('12345')).toBeUndefined();
    expect(normalizePhone('+0123456789')).toBeUndefined();
    expect(normalizePhone('5876543210')).toBeUndefined(); // an Indian mobile starts 6-9
  });

  it('normalises usernames and strips a leading @', () => {
    expect(normalizeUsername('@Aarav.Kumar')).toBe('aarav.kumar');
    expect(normalizeUsername('ab')).toBeUndefined();
    expect(normalizeUsername('has space')).toBeUndefined();
    expect(normalizeUsername('x'.repeat(31))).toBeUndefined();
  });

  it('tells what kind of thing was typed into the sign-in box', () => {
    expect(parseIdentifier('Aarav@Example.com')).toEqual({
      kind: 'email',
      value: 'aarav@example.com',
    });
    expect(parseIdentifier('98765 43210')).toEqual({ kind: 'phone', value: '+919876543210' });
    expect(parseIdentifier('@aarav.kumar')).toEqual({ kind: 'username', value: 'aarav.kumar' });
  });

  it('gives one answer, the generic credentials error, for anything unusable', () => {
    for (const bad of ['', '  ', 'a', 'not an email@', '!!!', '+12', '@@x']) {
      try {
        parseIdentifier(bad);
        expect.unreachable(bad);
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).code).toBe('INVALID_CREDENTIALS');
      }
    }
  });
});

describe('sign-in risk', () => {
  const ordinary: LoginSignals = {
    hasHistory: true,
    knownDevice: true,
    knownNetwork: true,
    knownLocation: true,
    recentFailures: 0,
    accountRisk: 'LOW',
    passwordChangedRecently: false,
  };

  it('lets an ordinary sign-in straight through', () => {
    expect(assessLogin(ordinary)).toEqual({ score: 0, decision: 'allow', reasons: [] });
  });

  it('does not call a first-ever sign-in unusual', () => {
    const r = assessLogin({
      ...ordinary,
      hasHistory: false,
      knownDevice: false,
      knownNetwork: false,
      knownLocation: false,
    });
    expect(r.decision).toBe('allow');
    expect(r.score).toBe(0);
  });

  it('only tells the owner about a new device on a familiar network', () => {
    const r = assessLogin({ ...ordinary, knownDevice: false });
    expect(r.decision).toBe('notify');
    expect(r.reasons).toEqual(['new_device']);
  });

  it('asks for verification when device, network and place are all new', () => {
    const r = assessLogin({
      ...ordinary,
      knownDevice: false,
      knownNetwork: false,
      knownLocation: false,
    });
    expect(r.score).toBe(70);
    expect(r.decision).toBe('verify');
    expect(r.reasons).toEqual(['new_device', 'new_network', 'new_location']);
  });

  it('does not penalise an unknown location it cannot work out', () => {
    const r = assessLogin({ ...ordinary, knownDevice: false, knownLocation: undefined });
    expect(r.reasons).not.toContain('new_location');
  });

  it('adds up failed attempts, capped', () => {
    expect(assessLogin({ ...ordinary, recentFailures: 1 }).score).toBe(8);
    expect(assessLogin({ ...ordinary, recentFailures: 2 }).score).toBe(16);
    expect(assessLogin({ ...ordinary, recentFailures: 50 }).score).toBe(24);
  });

  it('takes account risk and a fresh password change into account', () => {
    expect(assessLogin({ ...ordinary, accountRisk: 'HIGH' }).reasons).toContain(
      'account_flagged_high',
    );
    const tamper = assessLogin({ ...ordinary, knownDevice: false, passwordChangedRecently: true });
    expect(tamper.reasons).toContain('password_changed_recently');
    expect(tamper.score).toBe(45);
  });

  describe('"password changed recently"', () => {
    const at = (iso: string) => new Date(iso);

    it('is false when the password was never changed (as for a new account)', () => {
      expect(changedPasswordRecently(null)).toBe(false);
    });
    it('counts a change made earlier the same day', () => {
      expect(changedPasswordRecently(at('2026-10-05T09:00:00Z'), at('2026-10-05T20:00:00Z'))).toBe(
        true,
      );
    });
    it('stops counting after a day', () => {
      expect(changedPasswordRecently(at('2026-10-05T09:00:00Z'), at('2026-10-06T09:00:01Z'))).toBe(
        false,
      );
    });
  });

  it('never exceeds 100 and always escalates when everything is wrong', () => {
    const r = assessLogin({
      hasHistory: true,
      knownDevice: false,
      knownNetwork: false,
      knownLocation: false,
      recentFailures: 20,
      accountRisk: 'HIGH',
      passwordChangedRecently: true,
    });
    expect(r.score).toBe(100);
    expect(r.decision).toBe('verify');
  });

  it('is monotonic: more unusual signals never lower the score', () => {
    const steps: Partial<LoginSignals>[] = [
      {},
      { knownDevice: false },
      { knownNetwork: false },
      { knownLocation: false },
      { recentFailures: 3 },
      { accountRisk: 'MEDIUM' },
    ];
    let acc: LoginSignals = ordinary;
    let last = 0;
    for (const step of steps) {
      acc = { ...acc, ...step };
      const { score } = assessLogin(acc);
      expect(score).toBeGreaterThanOrEqual(last);
      last = score;
    }
  });

  it('reduces addresses to the network that identifies a place', () => {
    expect(networkOf('203.0.113.45')).toBe('203.0.113');
    expect(networkOf('::ffff:203.0.113.45')).toBe('203.0.113');
    expect(networkOf('2001:db8:1:2::5')).toBe('2001:db8:1');
    expect(networkOf(undefined)).toBeUndefined();
    expect(networkOf('garbage')).toBeUndefined();
  });
});
