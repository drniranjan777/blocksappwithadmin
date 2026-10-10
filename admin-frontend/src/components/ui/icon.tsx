import type { SVGProps } from 'react';

/** Line icons in the style of the prototype: 24-unit grid, 1.9 stroke, round caps. */
const PATHS = {
  dashboard:
    '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.3-5 6.5-5s5.7 1.5 6.5 5M17 4.5a3.5 3.5 0 010 7M18 15c2 .6 3.2 2.2 3.5 5"/>',
  media: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 15l5-5 4 4 3-3 6 6"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  reach: '<path d="M4 20v-5M10 20v-9M16 20V8M22 20V3"/>',
  money: '<path d="M7 5h11M7 9h11M7 5c6 0 6 8-1 8h-.5L14 20"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  payout: '<path d="M3 7h18v10H3zM3 11h18M7 15h3"/>',
  identity:
    '<path d="M12 3l2.5 2 3.2-.3.9 3.1 2.7 1.8-1.1 3 1.1 3-2.7 1.8-.9 3.1-3.2-.3L12 21l-2.5-2-3.2.3-.9-3.1L2.7 14.4l1.1-3-1.1-3 2.7-1.8.9-3.1 3.2.3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  audit: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 8v5M12 16h.01"/>',
  staff: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-3.6 3.4-5.5 7-5.5s6.3 1.9 7 5.5"/>',
  roles: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  refresh: '<path d="M20 11a8 8 0 10-.5 4M20 5v6h-6"/>',
  logout: '<path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  note: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  appeal: '<path d="M12 3v18M5 7h14M5 7l-3 7a3.5 3.5 0 007 0zM19 7l-3 7a3.5 3.5 0 007 0zM8 21h8"/>',
  siren: '<path d="M7 18v-6a5 5 0 0110 0v6M5 18h14v3H5zM12 3v2M4.5 6.5L6 8M19.5 6.5L18 8"/>',
  live: '<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4M4.9 4.9a10 10 0 000 14.2M19.1 4.9a10 10 0 010 14.2"/>',
  policy: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/>',
  store: '<path d="M4 9l1.5-5h13L20 9M4 9h16M4 9v11h16V9M9 20v-6h6v6"/>',
  badge: '<circle cx="12" cy="10" r="6"/><path d="M8.5 15.5L7 21l5-2.5L17 21l-1.5-5.5M9.5 10l1.8 1.8L15 8.2"/>',
  megaphone: '<path d="M3 10v4h3l8 4V6L6 10H3zM18 9a4 4 0 010 6M7 14l1 6h3l-1-5"/>',
  campaign: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? 'size-[18px]'}
      // The markup comes from the constant PATHS table above, never from data.
      // oxlint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
      {...rest}
    />
  );
}

/** The BLOCKS mark: four rising bars in the four Reach-level colours. */
export function Logo({ size = 34 }: { size?: number }) {
  const bar = (h: number, colour: string, i: number) => (
    <i key={i} style={{ width: size * 0.15, height: size * h, background: colour, borderRadius: 2 }} />
  );
  return (
    <div
      aria-hidden="true"
      className="flex items-end justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: '#2A2A55',
        gap: size * 0.07,
        padding: size * 0.2,
      }}
    >
      {[
        [0.2, '#0FA39A'],
        [0.34, '#2F6BFF'],
        [0.48, '#F08A00'],
        [0.6, '#D6246E'],
      ].map(([h, c], i) => bar(h as number, c as string, i))}
    </div>
  );
}
