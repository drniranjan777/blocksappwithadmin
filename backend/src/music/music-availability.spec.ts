import { describe, expect, it } from 'vitest';
import { PERPETUAL, type TrackRights, checkAvailability } from './music-availability.js';

const NOW = new Date('2026-10-09T10:00:00Z');
const later = new Date('2027-10-09T00:00:00Z');
const earlier = new Date('2026-01-01T00:00:00Z');

const track = (over: Partial<TrackRights> = {}): TrackRights => ({
  status: 'ACTIVE',
  rightsType: 'PLATFORM_OWNED',
  allowedCountries: ['IN'],
  allowedUses: ['REEL', 'STORY'],
  licenceExpiresAt: null,
  ...over,
});
const ask = (
  t: TrackRights,
  ctx: { country?: string; use?: 'REEL' | 'STORY' | 'POST' | 'ADVERTISING' } = {},
) => checkAvailability(t, { country: ctx.country ?? 'IN', use: ctx.use ?? 'REEL', now: NOW });

describe('when music may be used', () => {
  it('allows an active, platform-owned track in a listed country for a listed use', () => {
    expect(ask(track())).toEqual({ ok: true });
  });

  it('refuses anything that is not active', () => {
    for (const status of ['DRAFT', 'SUSPENDED', 'EXPIRED'] as const) {
      expect(ask(track({ status }))).toEqual({ ok: false, reason: 'not_active' });
    }
  });

  it('treats an empty country list as nowhere, and compares countries without regard to case', () => {
    expect(ask(track({ allowedCountries: [] }))).toEqual({ ok: false, reason: 'country' });
    expect(ask(track(), { country: 'US' })).toEqual({ ok: false, reason: 'country' });
    expect(ask(track({ allowedCountries: ['in'] }), { country: 'IN' })).toEqual({ ok: true });
    expect(ask(track({ allowedCountries: ['IN'] }), { country: 'in' })).toEqual({ ok: true });
  });

  it('refuses a use that was not granted', () => {
    expect(ask(track(), { use: 'ADVERTISING' })).toEqual({ ok: false, reason: 'use' });
    expect(ask(track({ allowedUses: [] }))).toEqual({ ok: false, reason: 'use' });
  });

  it('needs a live licence for music that belongs to someone else', () => {
    for (const rightsType of ['LICENSED', 'RESTRICTED'] as const) {
      expect(ask(track({ rightsType }))).toEqual({ ok: false, reason: 'licence_missing' });
      expect(ask(track({ rightsType, licenceExpiresAt: earlier }))).toEqual({
        ok: false,
        reason: 'licence_expired',
      });
      expect(ask(track({ rightsType, licenceExpiresAt: later }))).toEqual({ ok: true });
      expect(ask(track({ rightsType, licenceExpiresAt: PERPETUAL }))).toEqual({ ok: true });
    }
  });

  it('does not need one for music the platform owns, or that is free to use, unless a date was recorded', () => {
    for (const rightsType of ['PLATFORM_OWNED', 'ROYALTY_FREE', 'CREATOR_OWNED'] as const) {
      expect(ask(track({ rightsType }))).toEqual({ ok: true });
      expect(ask(track({ rightsType, licenceExpiresAt: later }))).toEqual({ ok: true });
      // A recorded end date is respected.
      expect(ask(track({ rightsType, licenceExpiresAt: earlier }))).toEqual({
        ok: false,
        reason: 'licence_expired',
      });
    }
  });

  it('stops at the exact moment a licence ends', () => {
    expect(
      ask(track({ rightsType: 'LICENSED', licenceExpiresAt: new Date(NOW.getTime() + 1) })),
    ).toEqual({ ok: true });
    expect(ask(track({ rightsType: 'LICENSED', licenceExpiresAt: NOW }))).toEqual({
      ok: false,
      reason: 'licence_expired',
    });
  });

  it('reports the first condition that fails, in a fixed order', () => {
    const bad = track({ status: 'DRAFT', allowedCountries: [], allowedUses: [] });
    expect(ask(bad)).toEqual({ ok: false, reason: 'not_active' });
    expect(ask({ ...bad, status: 'ACTIVE' })).toEqual({ ok: false, reason: 'country' });
  });
});
