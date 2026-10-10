import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AGE_BANDS, BAND_RANGE, type Targeting } from './ads-rules.js';

/** The date of birth that makes someone exactly `years` old today, as a UTC calendar date. */
function bornOnOrBefore(years: number, now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()));
}

/**
 * How many people a campaign's targeting could reach, counted from accounts that are in good
 * standing. This is the only thing advertisers learn about their audience, and only after
 * rounding down (see `coarseAudience`); the rows themselves are never returned.
 *
 * It counts people with an active account whose profile matches the place and age bands. Whether
 * a person has agreed to be shown advertising is not yet recorded, so everyone counts: that is a
 * consent question for legal review before any campaign is delivered (docs/security.md).
 */
@Injectable()
export class AudienceService {
  constructor(private readonly prisma: PrismaService) {}

  where(t: Targeting, now = new Date()): Prisma.UserWhereInput {
    const profile: Prisma.ProfileWhereInput = {
      country: { in: t.countries, mode: 'insensitive' },
      ...(t.states.length
        ? { OR: t.states.map((s) => ({ state: { equals: s, mode: 'insensitive' as const } })) }
        : {}),
      ...(t.districts.length
        ? {
            AND: [
              {
                OR: t.districts.map((d) => ({
                  district: { equals: d, mode: 'insensitive' as const },
                })),
              },
            ],
          }
        : {}),
      // Adults only, whatever was asked for: people under 18 are never in an audience.
      dateOfBirth: { lte: bornOnOrBefore(18, now) },
    };
    if (t.ageBands.length && t.ageBands.length < AGE_BANDS.length) {
      const ranges = t.ageBands.map((b) => {
        const { from, to } = BAND_RANGE[b];
        // Age between `from` and `to` inclusive: born after the date that makes them `to + 1`, up to `from`.
        return {
          dateOfBirth: {
            lte: bornOnOrBefore(from, now),
            gt: bornOnOrBefore(to + 1, now),
          },
        };
      });
      profile.AND = [
        ...((profile.AND as Prisma.ProfileWhereInput[] | undefined) ?? []),
        { OR: ranges },
      ];
    }
    return { status: 'ACTIVE', deletedAt: null, profile: { is: profile } };
  }

  async count(t: Targeting, now = new Date()): Promise<number> {
    return this.prisma.user.count({ where: this.where(t, now) });
  }
}
