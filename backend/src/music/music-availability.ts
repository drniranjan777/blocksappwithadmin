import type { MusicRightsType, MusicStatus, MusicUse } from '../generated/prisma/client.js';

/** The part of a track the rights check needs. */
export interface TrackRights {
  status: MusicStatus;
  rightsType: MusicRightsType;
  /** ISO 3166-1 alpha-2 codes. An empty list means *nowhere*, never "everywhere". */
  allowedCountries: readonly string[];
  allowedUses: readonly MusicUse[];
  /**
   * When the newest active licence ends (a perpetual licence is recorded as year 9999).
   * Tracks licensed from someone else must have one; platform-owned music may leave it empty.
   */
  licenceExpiresAt: Date | null;
}

export type Unavailable = 'not_active' | 'country' | 'use' | 'licence_missing' | 'licence_expired';

export type Availability = { ok: true } | { ok: false; reason: Unavailable };

/** Rights types whose use depends on someone else's permission, and so on a live licence. */
const NEEDS_LICENCE: ReadonlySet<MusicRightsType> = new Set(['LICENSED', 'RESTRICTED']);

/**
 * May this track be offered to a person in `country` for `use`, right now?
 *
 * Every condition must hold; the first that fails is reported. The default is
 * **no**: an empty country list, a missing licence date or a draft status each
 * mean "not available", never "available to all". This is the one function that
 * decides, used both when listing music and when a reel tries to attach a track, so
 * a track cannot be used by going around the list.
 */
export function checkAvailability(
  track: TrackRights,
  ctx: { country: string; use: MusicUse; now?: Date },
): Availability {
  const now = ctx.now ?? new Date();
  if (track.status !== 'ACTIVE') return { ok: false, reason: 'not_active' };
  const country = ctx.country.toUpperCase();
  if (!track.allowedCountries.some((c) => c.toUpperCase() === country))
    return { ok: false, reason: 'country' };
  if (!track.allowedUses.includes(ctx.use)) return { ok: false, reason: 'use' };
  if (NEEDS_LICENCE.has(track.rightsType) && !track.licenceExpiresAt) {
    return { ok: false, reason: 'licence_missing' };
  }
  if (track.licenceExpiresAt && track.licenceExpiresAt <= now)
    return { ok: false, reason: 'licence_expired' };
  return { ok: true };
}

/** The far-future date that stands for "never expires" in `licenceExpiresAt`. */
export const PERPETUAL = new Date('9999-12-31T00:00:00.000Z');
