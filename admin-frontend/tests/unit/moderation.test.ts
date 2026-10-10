import { describe, expect, it } from 'vitest';
import {
  ACTION_INFO,
  CATEGORIES,
  CATEGORY_LABEL,
  DECISION_LABEL,
  REVERSIBLE,
  hoursLabel,
  rulesFor,
} from '@/lib/moderation';
import { NAV, activeItem, visibleNav } from '@/lib/nav';
import type { StaffAction } from '@/lib/types';

const RULES = [
  { code: 'harassment_bullying' },
  { code: 'account_standing' },
  { code: 'no_violation' },
  { code: 'report_in_bad_faith' },
];
const codes = (a: StaffAction) => rulesFor(a, RULES).map((r) => r.code);

describe('which rules fit a decision', () => {
  it('offers a rule that was broken for enforcement, never "no violation"', () => {
    expect(codes('REMOVE')).toEqual(['harassment_bullying']);
    expect(codes('RESTRICT')).toEqual(['harassment_bullying']);
  });

  it('offers account standing for decisions about the account, and a warning', () => {
    expect(codes('SUSPEND_USER')).toEqual(['harassment_bullying', 'account_standing']);
    expect(codes('RESTRICT_USER')).toEqual(['harassment_bullying', 'account_standing']);
    expect(codes('WARN')).toEqual(['harassment_bullying', 'account_standing']);
  });

  it('offers "no violation" for clearing something, and bad faith only for a dismissal', () => {
    expect(codes('APPROVE')).toEqual(['no_violation']);
    expect(codes('DISMISS_REPORT')).toEqual(['no_violation', 'report_in_bad_faith']);
  });
});

describe('plain words', () => {
  it('describes every decision a moderator can take', () => {
    for (const a of Object.keys(ACTION_INFO) as StaffAction[]) {
      expect(ACTION_INFO[a].label.length).toBeGreaterThan(3);
      expect(ACTION_INFO[a].effect.length).toBeGreaterThan(10);
    }
  });

  it('names every report category and every decision on record', () => {
    expect(CATEGORIES).toHaveLength(12);
    for (const c of CATEGORIES) expect(CATEGORY_LABEL[c]).not.toMatch(/_/);
    for (const a of ['APPROVE', 'REMOVE', 'RESTORE', 'REACTIVATE_USER', 'ESCALATE']) {
      expect(DECISION_LABEL[a]).toBeTruthy();
    }
  });

  it('only allows taking back decisions that can be taken back', () => {
    expect([...REVERSIBLE].sort()).toEqual(['REMOVE', 'RESTRICT', 'RESTRICT_USER', 'SUSPEND_USER', 'WARN']);
  });

  it('says how long in the words people use', () => {
    expect(hoursLabel(0)).toBe('under an hour');
    expect(hoursLabel(1)).toBe('1 hour');
    expect(hoursLabel(8)).toBe('8 hours');
    expect(hoursLabel(48)).toBe('2 days');
    expect(hoursLabel(72)).toBe('3 days');
  });
});

describe('the trust-and-safety menu', () => {
  const nav = (...perms: string[]) =>
    visibleNav((...wanted) => wanted.length === 0 || wanted.some((p) => perms.includes(p)));
  const hrefs = (...perms: string[]) =>
    nav(...perms)
      .find((g) => g.id === 'safety')
      ?.items.map((i) => i.href) ?? [];

  it('shows a moderator the queue, appeals, incidents and live sessions, but not the policy', () => {
    expect(hrefs('reports.read', 'appeals.read', 'safety.incidents.read', 'live.read')).toEqual([
      '/moderation',
      '/appeals',
      '/safety',
      '/live',
    ]);
  });

  it('shows a support agent only what their role reads', () => {
    expect(hrefs('reports.read', 'appeals.read')).toEqual(['/moderation', '/appeals']);
  });

  it('shows the policy to those who may read it', () => {
    expect(hrefs('policy.read')).toEqual(['/policy']);
  });

  it('leaves the whole group out for someone with none of it', () => {
    expect(nav('analytics.read').some((g) => g.id === 'safety')).toBe(false);
  });

  it('gives each item a unique address and a badge from the dashboard where there is a count', () => {
    const items = NAV.flatMap((g) => g.items);
    expect(new Set(items.map((i) => i.href)).size).toBe(items.length);
    const queues = Object.fromEntries(items.filter((i) => i.queue).map((i) => [i.href, i.queue]));
    expect(queues['/moderation']).toBe('reportsOpen');
    expect(queues['/appeals']).toBe('appealsOpen');
    expect(queues['/safety']).toBe('incidentsOpen');
  });

  it('keeps the menu entry highlighted below a page', () => {
    expect(activeItem('/moderation')?.label).toBe('Moderation queue');
    expect(activeItem('/safety')?.label).toBe('Safety incidents');
  });
});
