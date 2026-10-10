import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../common/errors/app-error.js';
import { Page, clampLimit, decodeCursor } from '../common/pagination/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import type { MusicUse, Prisma } from '../generated/prisma/client.js';
import { MediaViews } from '../social/shared/media-views.js';
import { checkAvailability } from './music-availability.js';
import { CATEGORIES } from './dto/music.dto.js';

const cursorSchema = z.object({ c: z.number().int().min(0), id: z.string() });

const select = {
  id: true,
  title: true,
  artist: true,
  language: true,
  genre: true,
  durationMs: true,
  categories: true,
  status: true,
  rightsType: true,
  allowedCountries: true,
  allowedUses: true,
  licenceExpiresAt: true,
  coverKey: true,
  previewKey: true,
  audioKey: true,
  reelsCount: true,
} satisfies Prisma.MusicTrackSelect;

export type UsableTrack = Prisma.MusicTrackGetPayload<{ select: typeof select }>;

/**
 * The music library as people using the app see it.
 *
 * What a person sees is decided in one place, `checkAvailability`, from the track's
 * rights: its status, the person's country, what it may be used for and whether any
 * licence behind it is still running. The database query narrows to the same rules so
 * a page is not mostly empty, and each row is checked again in code, so a mistake in
 * one of the two cannot offer a track the other would refuse.
 *
 * A person never sees the rights details, the licence, or the full-length audio: only
 * a 30-second preview and a cover.
 */
@Injectable()
export class MusicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaViews,
  ) {}

  /** Where the person is, for deciding which tracks they may use. */
  async countryOf(userId: string): Promise<string> {
    const p = await this.prisma.profile.findUnique({
      where: { userId },
      select: { country: true },
    });
    return (p?.country ?? 'IN').toUpperCase();
  }

  categories() {
    return CATEGORIES.map((key) => ({ key }));
  }

  async list(
    userId: string,
    q: {
      use?: MusicUse | undefined;
      category?: string | undefined;
      q?: string | undefined;
      cursor?: string | undefined;
      limit?: number | undefined;
    },
  ) {
    const country = await this.countryOf(userId);
    const use = q.use ?? 'REEL';
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const now = new Date();
    const rows = await this.prisma.musicTrack.findMany({
      where: {
        AND: [
          this.offered(country, use, now),
          ...(q.category
            ? [{ categories: { has: q.category as (typeof CATEGORIES)[number] } }]
            : []),
          ...(q.q
            ? [
                {
                  OR: [
                    { title: { contains: q.q, mode: 'insensitive' as const } },
                    { artist: { contains: q.q, mode: 'insensitive' as const } },
                  ],
                },
              ]
            : []),
          ...(after
            ? [
                {
                  OR: [
                    { reelsCount: { lt: after.c } },
                    { reelsCount: after.c, id: { lt: after.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      select,
      // Most used first. The cursor carries the count it stopped at; a track whose count rises
      // between two requests can move ahead of the cursor and be missed on that scroll, which is
      // an acceptable cost for a "popular" list and would not be for a feed of someone's posts.
      orderBy: [{ reelsCount: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const offered = rows.filter((r) => checkAvailability(r, { country, use, now }).ok);
    return Page.fromRows(
      offered,
      limit,
      (r) => ({ c: r.reelsCount, id: r.id }),
      (r) => this.view(r),
    );
  }

  async get(userId: string, id: string) {
    const country = await this.countryOf(userId);
    const track = await this.prisma.musicTrack.findFirst({ where: { id }, select });
    if (!track || !checkAvailability(track, { country, use: 'REEL' }).ok) {
      throw Errors.notFound('Track');
    }
    return this.view(track);
  }

  /**
   * Is this person allowed to put this track on their `use`? Throws if not, and says
   * nothing about *why* (a track that exists but is not licensed for them is, to them,
   * simply not there). Used when a reel attaches music.
   */
  async assertUsable(userId: string, trackId: string, use: MusicUse): Promise<UsableTrack> {
    const country = await this.countryOf(userId);
    const track = await this.prisma.musicTrack.findUnique({ where: { id: trackId }, select });
    if (!track || !track.audioKey || !checkAvailability(track, { country, use }).ok) {
      throw Errors.validation([{ field: 'musicTrackId', reasons: ['not_available'] }]);
    }
    return track;
  }

  /** The same rules as `checkAvailability`, as a database filter. */
  private offered(country: string, use: MusicUse, now: Date): Prisma.MusicTrackWhereInput {
    return {
      status: 'ACTIVE',
      audioKey: { not: null },
      previewKey: { not: null },
      allowedCountries: { has: country },
      allowedUses: { has: use },
      OR: [
        { rightsType: { notIn: ['LICENSED', 'RESTRICTED'] }, licenceExpiresAt: null },
        { licenceExpiresAt: { gt: now } },
      ],
    };
  }

  private view(t: UsableTrack) {
    return {
      id: t.id,
      title: t.title,
      artist: t.artist,
      language: t.language,
      genre: t.genre || null,
      durationMs: t.durationMs,
      categories: t.categories,
      coverUrl: this.media.link(t.coverKey),
      previewUrl: this.media.link(t.previewKey),
      reelsCount: t.reelsCount,
    };
  }
}
