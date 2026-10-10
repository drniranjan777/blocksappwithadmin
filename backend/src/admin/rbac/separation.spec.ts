import { describe, expect, it } from 'vitest';
import { ROLES, isPermissionKey } from './permission-catalog.js';
import {
  FORBIDDEN_COMBINATIONS,
  findSeparationViolations,
  isExempt,
  violationsForRoles,
} from './separation.js';

describe('separation of duties', () => {
  it('only names permissions that exist', () => {
    for (const c of FORBIDDEN_COMBINATIONS) {
      expect(isPermissionKey(c.a), c.a).toBe(true);
      expect(isPermissionKey(c.b), c.b).toBe(true);
      expect(c.why.length).toBeGreaterThan(10);
    }
  });

  it('is breached by no built-in role except the break-glass one', () => {
    for (const role of ROLES) {
      const breaches = findSeparationViolations(role.permissions);
      if (role.key === 'super_admin') expect(breaches.length).toBeGreaterThan(0);
      else expect(breaches, role.key).toEqual([]);
    }
  });

  it('is breached by combining roles that are each fine alone', () => {
    expect(violationsForRoles(['kyc_reviewer']).length).toBe(0);
    expect(violationsForRoles(['finance_operator']).length).toBe(0);
    const both = violationsForRoles(['kyc_reviewer', 'finance_operator']);
    expect(both.map((v) => `${v.a}+${v.b}`)).toContain('kyc.review+payout.approve');
  });

  it('exempts only the super admin', () => {
    expect(isExempt(['super_admin'])).toBe(true);
    expect(isExempt(['moderator', 'super_admin'])).toBe(true);
    expect(isExempt(['senior_moderator'])).toBe(false);
    expect(violationsForRoles(['super_admin'])).toEqual([]);
  });

  it('accepts a plain list or a set', () => {
    expect(findSeparationViolations(['reach.config.update', 'reach.config.activate'])).toHaveLength(
      1,
    );
    expect(findSeparationViolations(new Set(['reach.config.update']))).toHaveLength(0);
  });
});
