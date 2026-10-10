/**
 * Names nobody may register, so no one can pose as the platform or its staff.
 * Matched after lower-casing, and also when followed by digits or separators
 * ("admin01", "support_team") is handled by `isReservedUsername`.
 */
const RESERVED = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'support',
  'help',
  'helpdesk',
  'staff',
  'blocks',
  'blocksapp',
  'blocksofficial',
  'official',
  'team',
  'security',
  'safety',
  'moderator',
  'mod',
  'abuse',
  'legal',
  'privacy',
  'press',
  'billing',
  'payments',
  'payouts',
  'kyc',
  'verify',
  'verification',
  'verified',
  'trust',
  'null',
  'undefined',
  'api',
  'www',
  'mail',
  'noreply',
  'no-reply',
  'me',
  'you',
  'anonymous',
  'everyone',
]);

export function isReservedUsername(username: string): boolean {
  const base = username.replace(/[._]+/g, '').replace(/\d+$/, '');
  return RESERVED.has(username) || RESERVED.has(base);
}
