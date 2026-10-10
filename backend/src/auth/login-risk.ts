/**
 * Sign-in risk scoring.
 *
 * A pure function of what the server knows about this sign-in and the account's
 * history. It produces a score and a *decision*; the auth service applies the
 * decision (extra verification, a security event, an alert). Keeping it pure
 * makes the rules easy to read, change and test.
 *
 * What it does not do: it cannot tell an attacker from the owner, only an
 * unusual sign-in from a usual one. So the response to a high score is never
 * "block" (which would lock owners out when they travel or change phones) but
 * "ask for a second proof", and the owner is told either way.
 */

export interface LoginSignals {
  /** The account has signed in before (so "new" things are meaningful). */
  hasHistory: boolean;
  /** This device id was used on this account before. */
  knownDevice: boolean;
  /** This IP network (/24 or /48) was used before. */
  knownNetwork: boolean;
  /** This coarse location was used before. Undefined if it cannot be worked out. */
  knownLocation: boolean | undefined;
  /** Wrong passwords for this account in the last hour, before this success. */
  recentFailures: number;
  /** The account is flagged by trust & safety. */
  accountRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  /** The password was changed in the last 24 hours (attackers change it first). */
  passwordChangedRecently: boolean;
}

export type RiskDecision = 'allow' | 'notify' | 'verify';

export interface RiskAssessment {
  /** 0 (ordinary) to 100 (very unusual). */
  score: number;
  decision: RiskDecision;
  /** Human-readable reasons, for the security event and the audit trail. */
  reasons: string[];
}

/** Scores at or above this ask for extra verification. */
export const VERIFY_THRESHOLD = 60;
/** Scores at or above this tell the owner a new sign-in happened. */
export const NOTIFY_THRESHOLD = 25;

export function assessLogin(s: LoginSignals): RiskAssessment {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string): void => {
    score += points;
    reasons.push(reason);
  };

  // The first ever sign-in has nothing to compare with: do not call it unusual.
  if (s.hasHistory) {
    if (!s.knownDevice) add(30, 'new_device');
    if (!s.knownNetwork) add(15, 'new_network');
    if (s.knownLocation === false) add(25, 'new_location');
  }
  if (s.recentFailures > 0) add(Math.min(s.recentFailures * 8, 24), 'recent_failed_attempts');
  if (s.accountRisk === 'MEDIUM') add(10, 'account_flagged');
  if (s.accountRisk === 'HIGH') add(25, 'account_flagged_high');
  if (s.passwordChangedRecently && s.hasHistory && !s.knownDevice)
    add(15, 'password_changed_recently');

  score = Math.min(score, 100);
  const decision: RiskDecision =
    score >= VERIFY_THRESHOLD ? 'verify' : score >= NOTIFY_THRESHOLD ? 'notify' : 'allow';
  return { score, decision, reasons };
}

/**
 * Whether the password was *changed* in the last day. `changedAt` is empty until
 * the first change or reset: choosing a password at sign-up does not set it,
 * because counting that would flag every new account's first day, when the owner
 * is most likely to be switching phones and networks.
 */
export function changedPasswordRecently(changedAt: Date | null, now: Date = new Date()): boolean {
  return !!changedAt && now.getTime() - changedAt.getTime() < 86_400_000;
}

/** `203.0.113.45` -> `203.0.113`, `2001:db8:1:2::5` -> `2001:db8:1`. */
export function networkOf(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const clean = ip.replace(/^::ffff:/, '');
  if (clean.includes(':')) return clean.split(':').slice(0, 3).join(':');
  const parts = clean.split('.');
  return parts.length === 4 ? parts.slice(0, 3).join('.') : undefined;
}
