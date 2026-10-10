import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../../common/errors/app-error.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { listedProfile } from '../shared/listed-profile.js';
import { MediaViews } from '../shared/media-views.js';
import { RelationshipsService } from '../shared/relationships.service.js';
import { reelVisibleTo } from '../shared/visibility.js';
import {
  type ReelRow,
  type ReelView,
  type ReelViewerState,
  reelInclude,
  toReelView,
} from './reel-view.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

/**
 * Reading reels: one, a person's, or a page of them for a feed.
 *
 * Every read goes through `reelVisibleTo`, the same filter that guards posts, so a reel that
 * is still being made, is held for review, was removed, or belongs to someone who blocked
 * you is "not found" to everyone but its author.
 */
@Injectable()
export class ReelReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationships: RelationshipsService,
    private readonly media: MediaViews,
  ) {}

  async get(viewerId: string, id: string): Promise<ReelView> {
    const row = await this.prisma.reel.findFirst({
      where: { AND: [{ id }, reelVisibleTo(viewerId)] },
      include: reelInclude,
    });
    if (!row) throw Errors.notFound('Reel');
    return (await this.hydrate(viewerId, [row]))[0] as ReelView;
  }

  /** Reels into what the client shows, with the viewer's likes and saves fetched in two queries for the whole page. */
  async hydrate(viewerId: string, rows: ReelRow[]): Promise<ReelView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [likes, saves] = await Promise.all([
      this.prisma.like.findMany({
        where: { userId: viewerId, reelId: { in: ids } },
        select: { reelId: true },
      }),
      this.prisma.save.findMany({
        where: { userId: viewerId, reelId: { in: ids } },
        select: { reelId: true },
      }),
    ]);
    const state: ReelViewerState = {
      liked: new Set(likes.map((l) => l.reelId as string)),
      saved: new Set(saves.map((s) => s.reelId as string)),
    };
    return rows.map((r) => toReelView(r, viewerId, state, this.media));
  }

  /** A person's reels, newest first, as the viewer is allowed to see them. */
  async listByUser(
    viewerId: string,
    ref: string,
    q: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    const target = await listedProfile(this.prisma, this.relationships, viewerId, ref);
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.reel.findMany({
      where: {
        AND: [
          { authorId: target.id },
          reelVisibleTo(viewerId),
          ...(after
            ? [
                {
                  OR: [
                    { createdAt: { lt: new Date(after.t) } },
                    { createdAt: new Date(after.t), id: { lt: after.id } },
                  ],
                } satisfies Prisma.ReelWhereInput,
              ]
            : []),
        ],
      },
      include: reelInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const views = await this.hydrate(viewerId, rows.slice(0, limit));
    const byId = new Map(views.map((v) => [v.id, v]));
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => byId.get(r.id) as ReelView,
    );
  }
}
