import { adminCall, staffSession, type StaffSession } from './admin.js';
import type { TestApp } from './app.js';
import { person, type Person } from './social.js';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type CallArgs = { body?: object; query?: Record<string, string | number | boolean> };

/** The staff a trust-and-safety test needs, signed in. */
export interface StaffRig {
  boss: StaffSession; // super_admin
  mod: StaffSession; // moderator
  mod2: StaffSession; // another moderator
  senior: StaffSession; // senior_moderator
  support: StaffSession; // support_agent: can read reports and appeals, nothing else
  analyst: StaffSession; // readonly_analyst: no moderation access at all
  /** Calls the staff API as one of them. */
  as(s: StaffSession): (method: Method, path: string, o?: CallArgs) => ReturnType<typeof adminCall>;
}

export async function staffRig(t: TestApp): Promise<StaffRig> {
  const [boss, mod, mod2, senior, support, analyst] = await Promise.all([
    staffSession(t, ['super_admin'], 'Boss'),
    staffSession(t, ['moderator'], 'Mina Moderator'),
    staffSession(t, ['moderator'], 'Moe Moderator'),
    staffSession(t, ['senior_moderator'], 'Sena Senior'),
    staffSession(t, ['support_agent'], 'Sunil Support'),
    staffSession(t, ['readonly_analyst'], 'Anya Analyst'),
  ]);
  return {
    boss,
    mod,
    mod2,
    senior,
    support,
    analyst,
    as:
      (s) =>
      (method, path, o = {}) =>
        adminCall(t, method, path, { token: s.accessToken, ...o }),
  };
}

/** `n` signed-in people (typed as a tuple for small `n`, so they destructure cleanly). */
export function people(t: TestApp, n: 1): Promise<[Person]>;
export function people(t: TestApp, n: 2): Promise<[Person, Person]>;
export function people(t: TestApp, n: 3): Promise<[Person, Person, Person]>;
export function people(t: TestApp, n: 4): Promise<[Person, Person, Person, Person]>;
export function people(t: TestApp, n: 5): Promise<[Person, Person, Person, Person, Person]>;
export function people(t: TestApp, n: number): Promise<Person[]>;
export function people(t: TestApp, n: number): Promise<Person[]> {
  return Promise.all(Array.from({ length: n }, () => person(t)));
}

/** A person reports something through the real endpoint. */
export function report(
  p: Person,
  target: { type: string; id: string },
  category = 'HARASSMENT',
  extra: Record<string, unknown> = {},
) {
  return p.api('post', '/reports', {
    body: { targetType: target.type, targetId: target.id, category, ...extra },
  });
}

/** What the moderation queue holds, as the console lists it. */
export const ACTIVE = ['OPEN', 'IN_REVIEW', 'ESCALATED'];
