export const CATEGORIES = [
  'TRENDING',
  'POPULAR',
  'NEW_RELEASES',
  'HINDI',
  'TELUGU',
  'TAMIL',
  'BENGALI',
  'MARATHI',
  'PUNJABI',
  'KANNADA',
  'MALAYALAM',
  'INSTRUMENTAL',
  'DEVOTIONAL',
  'TRAVEL',
  'FITNESS',
  'ROMANTIC',
  'COMEDY',
] as const;

export const USES = [
  { value: 'REEL', label: 'Reels' },
  { value: 'STORY', label: 'Stories' },
  { value: 'POST', label: 'Posts' },
  { value: 'ADVERTISING', label: 'Advertising' },
] as const;

export const RIGHTS = [
  { value: 'PLATFORM_OWNED', label: 'Owned by BLOCKS', needsLicence: false },
  { value: 'LICENSED', label: 'Licensed from someone else', needsLicence: true },
  { value: 'CREATOR_OWNED', label: 'Owned by the creator', needsLicence: false },
  { value: 'ROYALTY_FREE', label: 'Royalty-free', needsLicence: false },
  { value: 'RESTRICTED', label: 'Restricted (not to be offered)', needsLicence: true },
] as const;

export const rightsLabel = (value: string) => RIGHTS.find((r) => r.value === value)?.label ?? value;

/** Two-letter country codes typed as "IN, US, GB" (or one per line) -> `['IN','US','GB']`; `null` if any is not a code. */
export function parseCountries(text: string): string[] | null {
  const parts = text
    .split(/[\s,;]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  if (parts.some((p) => !/^[A-Z]{2}$/.test(p))) return null;
  return [...new Set(parts)];
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
