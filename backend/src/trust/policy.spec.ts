import { describe, expect, it } from 'vitest';
import { renderNotice } from '../notifications/templates.js';
import {
  ACCOUNT_ACTIONS,
  ACTION_PERMISSIONS,
  APPEALABLE_ACTIONS,
  CATEGORIES,
  CATEGORY_DEFAULTS,
  POLICY_RULES,
  REVERSIBLE_ACTIONS,
  STAFF_ACTIONS,
  SYSTEM_REASONS,
  actionAllowedOn,
  maxSeverity,
  priorityFor,
  reasonAllowedFor,
  reasonTitle,
  ruleByCode,
} from './policy.js';
import { ROLES, isPermissionKey } from '../admin/rbac/permission-catalog.js';

describe('moderation policy', () => {
  it('has a rule for every report category, with unique codes', () => {
    const codes = POLICY_RULES.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of CATEGORIES) {
      // Some rule (a specific one or a general one) can be cited for every category.
      expect(POLICY_RULES.some((r) => r.categories.includes(c))).toBe(true);
    }
    // The system's own reasons are never offered to a person.
    for (const code of Object.values(SYSTEM_REASONS)) expect(ruleByCode(code)).toBeUndefined();
  });

  it('keeps the safety-critical categories strict by default', () => {
    expect(CATEGORY_DEFAULTS.CHILD_SAFETY).toMatchObject({ severity: 'CRITICAL', slaHours: 1 });
    expect(CATEGORY_DEFAULTS.SELF_HARM).toMatchObject({ severity: 'CRITICAL', slaHours: 1 });
    // Self-harm content is not hidden by reports: a person may need to be reached.
    expect(CATEGORY_DEFAULTS.SELF_HARM.autoHoldAt).toBe(0);
    for (const c of CATEGORIES) {
      expect(CATEGORY_DEFAULTS[c].slaHours).toBeGreaterThan(0);
      expect(CATEGORY_DEFAULTS[c].autoHoldAt).toBeGreaterThanOrEqual(0);
    }
  });

  it('ranks by severity first, then by how many different people reported', () => {
    expect(priorityFor('LOW', 1)).toBe(0);
    expect(priorityFor('MEDIUM', 1)).toBe(20);
    expect(priorityFor('MEDIUM', 4)).toBe(23);
    // However many people report a low-severity item, it never outranks a lone medium one.
    expect(priorityFor('LOW', 1000)).toBeLessThan(priorityFor('MEDIUM', 1));
    expect(priorityFor('MEDIUM', 1000)).toBeLessThan(priorityFor('HIGH', 1));
    expect(priorityFor('HIGH', 1000)).toBeLessThan(priorityFor('CRITICAL', 1));
    // Nobody reporting (a staff flag) is treated as one.
    expect(priorityFor('HIGH', 0)).toBe(40);
  });

  it('finds the worse of two severities', () => {
    expect(maxSeverity('LOW', 'HIGH')).toBe('HIGH');
    expect(maxSeverity('CRITICAL', 'MEDIUM')).toBe('CRITICAL');
    expect(maxSeverity('MEDIUM', 'MEDIUM')).toBe('MEDIUM');
  });

  it('only lets a rule be cited for a decision it fits', () => {
    // Enforcement cites a rule that was broken.
    expect(reasonAllowedFor('REMOVE', 'harassment_bullying')).toBe(true);
    expect(reasonAllowedFor('REMOVE', 'no_violation')).toBe(false);
    expect(reasonAllowedFor('REMOVE', 'report_in_bad_faith')).toBe(false);
    expect(reasonAllowedFor('REMOVE', 'account_standing')).toBe(false);
    // Clearing something cites "no violation"; only a dismissal can cite bad faith.
    expect(reasonAllowedFor('APPROVE', 'no_violation')).toBe(true);
    expect(reasonAllowedFor('APPROVE', 'spam')).toBe(false);
    expect(reasonAllowedFor('APPROVE', 'report_in_bad_faith')).toBe(false);
    expect(reasonAllowedFor('DISMISS_REPORT', 'report_in_bad_faith')).toBe(true);
    expect(reasonAllowedFor('DISMISS_REPORT', 'no_violation')).toBe(true);
    // Decisions about the account may cite account standing.
    expect(reasonAllowedFor('SUSPEND_USER', 'account_standing')).toBe(true);
    expect(reasonAllowedFor('RESTRICT_USER', 'account_standing')).toBe(true);
    // Unknown and system-only codes are never allowed.
    for (const a of STAFF_ACTIONS) {
      expect(reasonAllowedFor(a, 'made_up')).toBe(false);
      expect(reasonAllowedFor(a, SYSTEM_REASONS.autoHold)).toBe(false);
    }
  });

  it('applies content actions to content only', () => {
    for (const a of ['APPROVE', 'RESTRICT', 'REMOVE'] as const) {
      expect(actionAllowedOn(a, 'POST')).toBe(true);
      expect(actionAllowedOn(a, 'COMMENT')).toBe(true);
      expect(actionAllowedOn(a, 'USER')).toBe(false);
      expect(actionAllowedOn(a, 'LIVE')).toBe(false);
    }
    for (const a of ['WARN', 'RESTRICT_USER', 'SUSPEND_USER', 'DISMISS_REPORT'] as const) {
      for (const t of ['POST', 'REEL', 'STORY', 'COMMENT', 'USER', 'LIVE'] as const) {
        expect(actionAllowedOn(a, t)).toBe(true);
      }
    }
  });

  it('asks for a real permission for every decision, and only seniors can act on accounts', () => {
    for (const perms of Object.values(ACTION_PERMISSIONS)) {
      for (const p of perms) expect(isPermissionKey(p)).toBe(true);
    }
    const role = (key: string) =>
      new Set(ROLES.find((r) => r.key === key)!.permissions as string[]);
    const can = (key: string, action: (typeof STAFF_ACTIONS)[number]) =>
      role(key).has('reports.resolve') && ACTION_PERMISSIONS[action].every((p) => role(key).has(p));
    expect(can('moderator', 'REMOVE')).toBe(true);
    expect(can('moderator', 'SUSPEND_USER')).toBe(false);
    expect(can('moderator', 'RESTRICT_USER')).toBe(false);
    expect(can('senior_moderator', 'SUSPEND_USER')).toBe(true);
    expect(can('support_agent', 'WARN')).toBe(false);
    expect(can('readonly_analyst', 'DISMISS_REPORT')).toBe(false);
  });

  it('keeps the appeal and reversal sets consistent', () => {
    // Everything that can be appealed can be taken back, and account decisions are among them.
    for (const a of APPEALABLE_ACTIONS) expect(REVERSIBLE_ACTIONS).toContain(a);
    for (const a of ACCOUNT_ACTIONS) expect(APPEALABLE_ACTIONS).toContain(a);
    // A dismissal or an approval is not a decision against anybody.
    expect(APPEALABLE_ACTIONS).not.toContain('DISMISS_REPORT');
    expect(APPEALABLE_ACTIONS).not.toContain('APPROVE');
  });

  it('names a decision’s reason for the person it affects', () => {
    expect(reasonTitle('harassment_bullying')).toBe('Harassment and bullying');
    expect(reasonTitle(SYSTEM_REASONS.autoHold)).toBe('Held for review');
    expect(reasonTitle('something_unknown')).toBe('something_unknown');
  });
});

describe('moderation notices', () => {
  it('never carries staff notes, only the rule and what to do', () => {
    for (const template of [
      'moderation_content_restricted',
      'moderation_content_restored',
      'moderation_warning',
      'moderation_account_action',
      'moderation_report_outcome',
      'moderation_appeal_received',
      'moderation_appeal_decided',
    ] as const) {
      const out = renderNotice(template, {
        target: 'post',
        rule: 'Spam',
        action: 'suspended',
        outcome: 'UPHELD',
      });
      expect(out.subject.length).toBeGreaterThan(5);
      expect(out.text.length).toBeGreaterThan(20);
      expect(out.text).not.toMatch(/undefined|\[object/);
    }
  });

  it('tells a reporter whether action was taken, without saying what', () => {
    const taken = renderNotice('moderation_report_outcome', { outcome: 'action_taken' }).text;
    const cleared = renderNotice('moderation_report_outcome', { outcome: 'no_violation' }).text;
    expect(taken).toMatch(/took action/);
    expect(cleared).toMatch(/does not break/);
    expect(taken).not.toMatch(/remov|suspend|warn|restrict/i);
  });

  it('describes each appeal outcome', () => {
    expect(renderNotice('moderation_appeal_decided', { outcome: 'OVERTURNED' }).text).toMatch(
      /reversed/,
    );
    expect(renderNotice('moderation_appeal_decided', { outcome: 'UPHELD' }).text).toMatch(/stands/);
    expect(renderNotice('moderation_appeal_decided', { outcome: 'REJECTED' }).text).toMatch(
      /could not/,
    );
  });
});
