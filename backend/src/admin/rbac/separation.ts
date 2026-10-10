import { type PermissionKey, permissionsForRoles } from './permission-catalog.js';

/**
 * Pairs of permissions that one person must never hold together, whatever roles
 * they were given. Each pair is a "maker/checker" split: the person who prepares
 * a sensitive step is not the person who approves it.
 *
 * `super_admin` is the one deliberate exception (a break-glass account that is
 * limited in number, needs two-step verification and is fully audited); see
 * `isExempt`.
 */
export const FORBIDDEN_COMBINATIONS: ReadonlyArray<{
  readonly a: PermissionKey;
  readonly b: PermissionKey;
  readonly why: string;
}> = [
  {
    a: 'reach.config.update',
    b: 'reach.config.activate',
    why: 'whoever drafts a Reach configuration must not also activate it',
  },
  {
    a: 'earnings.cycles.manage',
    b: 'earnings.cycles.finalize',
    why: 'whoever sets and closes a reward pool must not also release it into the ledger',
  },
  {
    a: 'earnings.cycles.finalize',
    b: 'payout.approve',
    why: 'whoever releases rewards must not also approve their payout',
  },
  {
    a: 'kyc.review',
    b: 'payout.approve',
    why: 'whoever clears identity must not also release the money',
  },
  {
    a: 'bank.review',
    b: 'payout.approve',
    why: 'whoever clears a bank account must not also release the money',
  },
  {
    a: 'earnings.adjust',
    b: 'payout.approve',
    why: 'whoever adjusts a balance must not also pay it out',
  },
  {
    a: 'admin.users.manage',
    b: 'audit.sensitive.read',
    why: 'whoever manages staff accounts must not also review the sensitive audit trail of them',
  },
  {
    a: 'music.licences.manage',
    b: 'music.manage',
    why: 'whoever records a licence must not also decide what is made available under it',
  },
];

export interface SeparationViolation {
  readonly a: PermissionKey;
  readonly b: PermissionKey;
  readonly why: string;
}

/** Every forbidden pair that `permissions` contains. */
export function findSeparationViolations(
  permissions: ReadonlySet<string> | readonly string[],
): SeparationViolation[] {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return FORBIDDEN_COMBINATIONS.filter((c) => set.has(c.a) && set.has(c.b));
}

/** Only the break-glass role is allowed to hold forbidden combinations. */
export function isExempt(roleKeys: readonly string[]): boolean {
  return roleKeys.includes('super_admin');
}

/** Whether giving someone exactly these roles would breach separation of duties. */
export function violationsForRoles(roleKeys: readonly string[]): SeparationViolation[] {
  return isExempt(roleKeys) ? [] : findSeparationViolations(permissionsForRoles(roleKeys));
}
