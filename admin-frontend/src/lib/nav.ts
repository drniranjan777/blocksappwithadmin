import type { IconName } from '@/components/ui/icon';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Shown to people who hold **any one** of these permissions. Empty = every signed-in staff member. */
  anyOf: readonly string[];
  /** A key in the dashboard's `queues`: the number waiting for a person, shown as a badge. */
  queue?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: readonly NavItem[];
}

/**
 * The console's menu. The prototype's groups, with only the modules that exist behind a working
 * API: ads and business pages come with the services they need.
 * Hiding an item is a courtesy; every call is checked again by the API.
 */
export const NAV: readonly NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ href: '/', label: 'Dashboard', icon: 'dashboard', anyOf: [] }],
  },
  {
    id: 'operate',
    label: 'Operate',
    items: [
      { href: '/users', label: 'Users', icon: 'users', anyOf: ['users.read'] },
      {
        href: '/media',
        label: 'Media review',
        icon: 'media',
        anyOf: ['content.moderate', 'media.read'],
        queue: 'mediaAwaitingReview',
      },
      { href: '/music', label: 'Music library', icon: 'music', anyOf: ['music.read'], queue: 'licencesEndingSoon' },
    ],
  },
  {
    id: 'safety',
    label: 'Trust & safety',
    items: [
      {
        href: '/moderation',
        label: 'Moderation queue',
        icon: 'flag',
        anyOf: ['reports.read'],
        queue: 'reportsOpen',
      },
      { href: '/appeals', label: 'Appeals', icon: 'appeal', anyOf: ['appeals.read'], queue: 'appealsOpen' },
      {
        href: '/safety',
        label: 'Safety incidents',
        icon: 'siren',
        anyOf: ['safety.incidents.read'],
        queue: 'incidentsOpen',
      },
      { href: '/live', label: 'Live monitoring', icon: 'live', anyOf: ['live.read'] },
      { href: '/policy', label: 'Policy configuration', icon: 'policy', anyOf: ['policy.read'] },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    items: [
      { href: '/business', label: 'Business pages', icon: 'store', anyOf: ['business.read'] },
      {
        href: '/verification',
        label: 'Business verification',
        icon: 'badge',
        anyOf: ['business.read'],
        queue: 'verificationsPending',
      },
      { href: '/advertisers', label: 'Advertisers', icon: 'megaphone', anyOf: ['ads.read'] },
      {
        href: '/campaigns',
        label: 'Campaigns',
        icon: 'campaign',
        anyOf: ['ads.read'],
        queue: 'campaignsInReview',
      },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    items: [
      { href: '/reach', label: 'Reach engine', icon: 'reach', anyOf: ['reach.config.read'] },
      { href: '/earnings', label: 'Earnings', icon: 'money', anyOf: ['earnings.read'] },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    items: [
      {
        href: '/identity',
        label: 'Identity checks',
        icon: 'identity',
        anyOf: ['kyc.read'],
        queue: 'identityUnderReview',
      },
      {
        href: '/bank-accounts',
        label: 'Bank accounts',
        icon: 'bank',
        anyOf: ['bank.read'],
        queue: 'bankAccountsToReview',
      },
      { href: '/payouts', label: 'Payouts', icon: 'payout', anyOf: ['payout.read'], queue: 'payoutsToReview' },
    ],
  },
  {
    id: 'govern',
    label: 'Govern',
    items: [
      { href: '/staff', label: 'Staff', icon: 'staff', anyOf: ['admin.users.read'] },
      { href: '/roles', label: 'Roles & permissions', icon: 'roles', anyOf: ['admin.roles.read'] },
      { href: '/audit', label: 'Audit log', icon: 'audit', anyOf: ['audit.read'] },
      { href: '/settings', label: 'Settings', icon: 'settings', anyOf: ['settings.read'] },
    ],
  },
];

/** The menu a person may see: items they can use, and no group left empty. */
export function visibleNav(can: (...permissions: string[]) => boolean): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(...i.anyOf)) })).filter((g) => g.items.length > 0);
}

/** The menu entry that owns a path, so `/users/123` still highlights "Users". */
export function activeItem(pathname: string): NavItem | undefined {
  const all = NAV.flatMap((g) => g.items);
  return (
    all.find((i) => i.href === pathname) ??
    all.filter((i) => i.href !== '/').find((i) => pathname.startsWith(`${i.href}/`))
  );
}
