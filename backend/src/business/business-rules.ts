/**
 * The fixed vocabulary of business pages. Closed lists, so a page cannot claim to be a category
 * that does not exist and a search can rely on the values.
 */

export const BUSINESS_CATEGORIES = [
  'Retail and shopping',
  'Food and restaurants',
  'Services',
  'Education and training',
  'Health and wellness',
  'Travel and hospitality',
  'Technology',
  'Media and publishing',
  'Real estate',
  'Arts and entertainment',
  'Non-profit',
  'Other',
] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

/** A page address: lower-case letters, digits and hyphens; 3 to 40 characters. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** Addresses that would look official or collide with the product's own paths. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'blocks',
  'blocksapp',
  'business',
  'help',
  'home',
  'login',
  'moderator',
  'official',
  'root',
  'security',
  'settings',
  'staff',
  'support',
  'system',
  'team',
  'verified',
]);

/** "Raju's Chai & Snacks!" -> "rajus-chai-snacks". May be too short or reserved: callers check. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export function slugProblem(slug: string): 'invalid' | 'reserved' | null {
  if (!SLUG_PATTERN.test(slug)) return 'invalid';
  if (RESERVED_SLUGS.has(slug)) return 'reserved';
  return null;
}

/** A web address a business may show: https only, no credentials, no odd ports, a real host name. */
export function safeWebUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  const host = url.hostname.toLowerCase();
  // A name with a dot, not an address: nothing that points back into a private network.
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) return null;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null;
  return url.toString();
}
