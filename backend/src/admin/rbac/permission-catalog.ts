/**
 * The permission catalogue and the built-in roles.
 *
 * This file is the source of truth. The database holds a copy so roles can
 * reference permissions by foreign key, and `prisma/seed.ts` writes it there,
 * but a permission that is not in this list does not exist: the guards check
 * keys against it, not against whatever happens to be in a table.
 *
 * Principles
 *   - Least privilege: a role gets only what its job needs.
 *   - Reading masked data and reading the raw data are different permissions
 *     (`kyc.read` vs `kyc.documents.view`, `users.read` vs `users.read_contact`).
 *   - Dangerous steps are split so one person cannot complete them alone:
 *     whoever drafts a Reach configuration cannot activate it, and a large payout
 *     needs two different approvers (enforced in the payout service).
 *   - There is no permission that marks identity or a bank account "verified"
 *     by hand. A reviewer records a decision; the decision is audited.
 */

export interface PermissionDef {
  readonly key: string;
  readonly module: string;
  readonly description: string;
}

const p = (key: string, description: string): PermissionDef => ({
  key,
  module: key.split('.')[0] ?? key,
  description,
});

export const PERMISSIONS = [
  // --- users -------------------------------------------------------------
  p('users.read', 'View user accounts (contact details masked)'),
  p('users.read_contact', "See a user's full e-mail address and phone number"),
  p('users.update', "Edit a user's profile fields on their behalf"),
  p('users.suspend', 'Suspend a user account'),
  p('users.restore', 'Reactivate a suspended or restricted account'),
  p('users.restrict', 'Restrict a user account'),
  p('users.sessions.revoke', 'Sign a user out of one or all devices'),
  p('users.notes.read', 'Read internal notes about a user'),
  p('users.notes.write', 'Write internal notes about a user'),
  // --- content -----------------------------------------------------------
  p('content.read', 'View posts, reels, stories and comments'),
  p('content.moderate', 'Restrict or remove content'),
  p('content.restore', 'Restore content that was restricted or removed'),
  p('content.label', 'Apply or change a content label'),
  // --- reports, appeals, safety -------------------------------------------
  p('reports.read', 'View reports and the moderation queue'),
  p('reports.assign', 'Assign a report to a moderator'),
  p('reports.resolve', 'Resolve or dismiss a report'),
  p('reports.escalate', 'Escalate a report to senior review'),
  p('appeals.read', 'View appeals'),
  p('appeals.decide', 'Decide an appeal'),
  p('safety.incidents.read', 'View safety incidents'),
  p('safety.incidents.write', 'Create or update a safety incident'),
  p('live.read', 'View live sessions'),
  p('live.terminate', 'End a live session immediately'),
  p('policy.read', 'View policy configuration'),
  p('policy.update', 'Change policy configuration'),
  // --- creators, reach, earnings -------------------------------------------
  p('creators.read', 'View creator profiles and analytics'),
  p('creators.monetization.update', "Suspend or restore a creator's monetisation"),
  p('reach.read', 'View reach scores and the Reach Ladder'),
  p('reach.config.read', 'View Reach Engine configuration versions'),
  p('reach.config.update', 'Draft a Reach Engine configuration version'),
  p('reach.config.activate', 'Activate a Reach Engine configuration version'),
  p('earnings.read', 'View creator earnings'),
  p('earnings.adjust', 'Post a reward adjustment to the ledger'),
  p('earnings.cycles.manage', 'Create reward cycles, set their pool and close them'),
  p('earnings.cycles.finalize', 'Release a closed reward cycle into the ledger'),
  // --- identity, bank, payouts --------------------------------------------
  p('kyc.read', 'View KYC cases (identifiers masked)'),
  p('kyc.documents.view', 'View submitted identity documents (every view is logged)'),
  p('kyc.review', 'Record a KYC review decision'),
  p('bank.read', 'View payout accounts (account numbers masked)'),
  p('bank.review', 'Record a bank-account review decision'),
  p('payout.read', 'View payout requests'),
  p('payout.approve', 'Approve a payout request'),
  p('payout.reject', 'Reject a payout request'),
  p('payout.hold', 'Place a payout on hold'),
  p('payout.retry', 'Retry a failed payout'),
  p('ledger.read', 'View ledger journals and entries'),
  // --- business and advertising --------------------------------------------
  p('business.read', 'View business pages'),
  p('business.manage', 'Edit or suspend a business page'),
  p('business.verify', 'Decide a verification request'),
  p('ads.read', 'View advertising campaigns'),
  p('ads.manage', 'Approve, reject, pause or flag a campaign'),
  p('ads.billing.read', 'View campaign billing status'),
  // --- media and music ------------------------------------------------------
  p('media.read', 'View media processing status and failures'),
  p('media.retry', 'Retry a failed media job'),
  p('media.delete', 'Delete a media asset'),
  p('music.read', 'View the music library'),
  p('music.manage', 'Edit track metadata and availability'),
  p('music.licences.read', 'View licence records and documents'),
  p('music.licences.manage', 'Create or change a licence record'),
  // --- system ---------------------------------------------------------------
  p('settings.read', 'View system settings'),
  p('settings.update', 'Change system settings'),
  p('notifications.read', 'View notification delivery logs'),
  p('notifications.send', 'Send a system notification'),
  p('system.health.read', 'View system health'),
  p('analytics.read', 'View dashboards and aggregate analytics'),
  // --- administration ---------------------------------------------------------
  p('admin.users.read', 'View staff accounts'),
  p('admin.users.manage', 'Invite, disable or change staff accounts'),
  p('admin.roles.read', 'View roles and permissions'),
  p('admin.roles.manage', 'Create or change roles'),
  p('admin.sessions.revoke', 'Sign a staff member out'),
  p('audit.read', 'View the audit log'),
  p('audit.sensitive.read', 'View audit entries about access to protected data'),
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map((x) => x.key);

const known = new Set<string>(ALL_PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return known.has(value);
}

export interface RoleDef {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly PermissionKey[];
}

const moderator: readonly PermissionKey[] = [
  'users.read',
  'content.read',
  'content.moderate',
  'reports.read',
  'reports.assign',
  'reports.resolve',
  'appeals.read',
  'safety.incidents.read',
  'safety.incidents.write',
  'live.read',
  'media.read',
];

export const ROLES: readonly RoleDef[] = [
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Every permission. Reserved for a very small number of people.',
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    key: 'user_operations',
    name: 'User Operations',
    description: 'Manages user accounts, sessions and internal notes.',
    permissions: [
      'users.read',
      'users.update',
      'users.suspend',
      'users.restore',
      'users.restrict',
      'users.sessions.revoke',
      'users.notes.read',
      'users.notes.write',
      'reports.read',
      'analytics.read',
    ],
  },
  {
    key: 'moderator',
    name: 'Moderator',
    description: 'Reviews reports and restricts or removes content.',
    permissions: moderator,
  },
  {
    key: 'senior_moderator',
    name: 'Senior Moderator',
    description: 'Moderator plus restoring content, escalations, appeals and live termination.',
    permissions: [
      ...moderator,
      'content.restore',
      'content.label',
      'reports.escalate',
      'appeals.decide',
      'live.terminate',
      'users.suspend',
      'users.restore',
      'users.restrict',
      'policy.read',
    ],
  },
  {
    key: 'creator_operations',
    name: 'Creator Operations',
    description: 'Looks after creators, the Reach Ladder and monetisation eligibility.',
    permissions: [
      'users.read',
      'creators.read',
      'creators.monetization.update',
      'reach.read',
      'reach.config.read',
      'earnings.read',
      'earnings.cycles.manage',
      'appeals.read',
      'analytics.read',
    ],
  },
  {
    key: 'kyc_reviewer',
    name: 'KYC Reviewer',
    description: 'Reviews identity and bank-account verification. Cannot touch payouts.',
    permissions: [
      'users.read',
      'kyc.read',
      'kyc.documents.view',
      'kyc.review',
      'bank.read',
      'bank.review',
    ],
  },
  {
    key: 'finance_operator',
    name: 'Finance / Payout Operator',
    description: 'Approves and handles payouts. Sees masked identity data only.',
    permissions: [
      'users.read',
      'payout.read',
      'payout.approve',
      'payout.reject',
      'payout.hold',
      'payout.retry',
      'ledger.read',
      'earnings.read',
      'bank.read',
      'kyc.read',
    ],
  },
  {
    key: 'business_operations',
    name: 'Business Operations',
    description: 'Business pages, verification and advertising review.',
    permissions: [
      'users.read',
      'business.read',
      'business.manage',
      'business.verify',
      'ads.read',
      'ads.manage',
      'ads.billing.read',
    ],
  },
  {
    key: 'support_agent',
    name: 'Support Agent',
    description: 'Helps users with accounts and sessions.',
    permissions: [
      'users.read',
      'users.sessions.revoke',
      'users.notes.read',
      'users.notes.write',
      'reports.read',
      'appeals.read',
      'notifications.read',
    ],
  },
  {
    key: 'auditor',
    name: 'Auditor',
    description: 'Read-only access across the platform, including the audit log.',
    permissions: [
      'audit.read',
      'audit.sensitive.read',
      'ledger.read',
      'users.read',
      'kyc.read',
      'bank.read',
      'payout.read',
      'earnings.read',
      'settings.read',
      'reach.config.read',
      'admin.users.read',
      'admin.roles.read',
    ],
  },
  {
    key: 'readonly_analyst',
    name: 'Read-only Analyst',
    description: 'Dashboards and aggregate analytics only.',
    permissions: ['analytics.read', 'creators.read', 'reach.read', 'media.read', 'music.read'],
  },
];

export function roleByKey(key: string): RoleDef | undefined {
  return ROLES.find((r) => r.key === key);
}

/** Every permission granted by any of the given roles. */
export function permissionsForRoles(roleKeys: readonly string[]): Set<PermissionKey> {
  const out = new Set<PermissionKey>();
  for (const k of roleKeys) {
    for (const permission of roleByKey(k)?.permissions ?? []) out.add(permission);
  }
  return out;
}
