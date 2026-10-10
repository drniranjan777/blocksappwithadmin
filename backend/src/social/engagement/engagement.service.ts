import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../../common/errors/app-error.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { type PostView, postInclude } from '../posts/post-view.js';
import { ReachEventsService } from '../../reach/reach-events.service.js';
import { PostsService } from '../posts/posts.service.js';
import { ReelReader } from '../reels/reel-reader.service.js';
import { type ReelView, reelInclude } from '../reels/reel-view.js';
import { postVisibleTo, reelVisibleTo } from '../shared/visibility.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

export type Target = { kind: 'post' | 'reel'; id: string };

/** A share by the same person of the same thing counts once a day. */
const SHARE_WINDOW_MS = 24 * 3_600_000;

/**
 * Likes, saves and shares of posts and reels.
 *
 * Each is "one row per person per thing", so the counters can only move when a
 * row is really created or removed, in the same transaction. Pressing like twice,
 * a retry, or ten phones at once leaves one like and a count that matches. Every
 * action first checks that the person may see the thing at all, by the same
 * visibility filter the feeds use, so you cannot like (or learn anything about) a
 * post you cannot open.
 */
@Injectable()
export class EngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly reels: ReelReader,
    private readonly reach: ReachEventsService,
    private readonly notifications: NotificationService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The thing, if the viewer may see it. Throws "not found" otherwise. */
  private async resolve(viewerId: string, target: Target) {
    if (target.kind === 'post') {
      const p = await this.prisma.post.findFirst({
        where: { AND: [{ id: target.id }, postVisibleTo(viewerId)] },
        select: {
          id: true,
          authorId: true,
          visibility: true,
          allowSharing: true,
          likesCount: true,
          savesCount: true,
          sharesCount: true,
          author: { select: { profile: { select: { isPrivate: true, displayName: true } } } },
        },
      });
      if (!p) throw Errors.notFound('Post');
      return p;
    }
    const r = await this.prisma.reel.findFirst({
      where: { AND: [{ id: target.id }, reelVisibleTo(viewerId)] },
      select: {
        id: true,
        authorId: true,
        visibility: true,
        allowSharing: true,
        likesCount: true,
        savesCount: true,
        sharesCount: true,
        author: { select: { profile: { select: { isPrivate: true, displayName: true } } } },
      },
    });
    if (!r) throw Errors.notFound('Reel');
    return r;
  }

  private where(userId: string, t: Target) {
    return t.kind === 'post' ? { userId, postId: t.id } : { userId, reelId: t.id };
  }

  private async bumpCounter(
    tx: Prisma.TransactionClient,
    t: Target,
    field: 'likesCount' | 'savesCount' | 'sharesCount',
    by: 1 | -1,
  ): Promise<number> {
    const inc = { increment: by };
    const data = { [field]: inc } as Record<typeof field, typeof inc>;
    const select = { likesCount: true, savesCount: true, sharesCount: true } as const;
    const row =
      t.kind === 'post'
        ? await tx.post.update({ where: { id: t.id }, data, select })
        : await tx.reel.update({ where: { id: t.id }, data, select });
    return row[field];
  }

  // ------------------------------------------------------------------ likes --

  async like(userId: string, t: Target): Promise<{ liked: true; likesCount: number }> {
    const thing = await this.resolve(userId, t);
    const { created, count } = await this.prisma.$transaction(async (tx) => {
      const res = await tx.like.createMany({
        data: [t.kind === 'post' ? { userId, postId: t.id } : { userId, reelId: t.id }],
        skipDuplicates: true,
      });
      if (res.count === 1)
        return { created: true, count: await this.bumpCounter(tx, t, 'likesCount', 1) };
      return { created: false, count: thing.likesCount };
    });
    if (created && thing.authorId !== userId) {
      const me = await this.prisma.profile.findUnique({
        where: { userId },
        select: { displayName: true },
      });
      await this.notifications
        .notify({
          userId: thing.authorId,
          type: 'LIKE',
          template: 'social_like',
          vars: { actor: me?.displayName ?? 'Someone', target: t.kind },
          severity: 'INFO',
          category: 'social',
          data: { [`${t.kind}Id`]: t.id, userId },
          // One notice per person per thing, however often they like and unlike.
          dedupeKey: `like:${t.kind}:${t.id}:${userId}`,
        })
        .catch(() => undefined);
    }
    await this.reach.recordEngagement({ viewerId: userId, kind: t.kind, id: t.id, type: 'LIKE' });
    return { liked: true, likesCount: count };
  }

  async unlike(userId: string, t: Target): Promise<{ liked: false; likesCount: number }> {
    // Unliking needs no visibility: you can always take back what you did.
    const count = await this.prisma.$transaction(async (tx) => {
      const res = await tx.like.deleteMany({ where: this.where(userId, t) });
      if (res.count === 1) return this.bumpCounter(tx, t, 'likesCount', -1);
      return this.currentCount(tx, t, 'likesCount');
    });
    return { liked: false, likesCount: count };
  }

  private async currentCount(
    tx: Prisma.TransactionClient,
    t: Target,
    field: 'likesCount' | 'savesCount' | 'sharesCount',
  ): Promise<number> {
    const select = { likesCount: true, savesCount: true, sharesCount: true } as const;
    const row =
      t.kind === 'post'
        ? await tx.post.findUnique({ where: { id: t.id }, select })
        : await tx.reel.findUnique({ where: { id: t.id }, select });
    return row?.[field] ?? 0;
  }

  // ------------------------------------------------------------------ saves --

  async save(userId: string, t: Target): Promise<{ saved: true; savesCount: number }> {
    const thing = await this.resolve(userId, t);
    const count = await this.prisma.$transaction(async (tx) => {
      const res = await tx.save.createMany({
        data: [t.kind === 'post' ? { userId, postId: t.id } : { userId, reelId: t.id }],
        skipDuplicates: true,
      });
      return res.count === 1 ? this.bumpCounter(tx, t, 'savesCount', 1) : thing.savesCount;
    });
    await this.reach.recordEngagement({ viewerId: userId, kind: t.kind, id: t.id, type: 'SAVE' });
    return { saved: true, savesCount: count };
  }

  async unsave(userId: string, t: Target): Promise<{ saved: false; savesCount: number }> {
    const count = await this.prisma.$transaction(async (tx) => {
      const res = await tx.save.deleteMany({ where: this.where(userId, t) });
      return res.count === 1
        ? this.bumpCounter(tx, t, 'savesCount', -1)
        : this.currentCount(tx, t, 'savesCount');
    });
    return { saved: false, savesCount: count };
  }

  /** What I saved (posts and reels), newest first, limited to what I can still see. */
  async saved(userId: string, q: { cursor?: string | undefined; limit?: number | undefined }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.save.findMany({
      where: {
        userId,
        AND: [
          {
            OR: [
              { postId: { not: null }, post: postVisibleTo(userId) },
              { reelId: { not: null }, reel: reelVisibleTo(userId) },
            ],
          },
          ...(after
            ? [
                {
                  OR: [
                    { createdAt: { lt: new Date(after.t) } },
                    { createdAt: new Date(after.t), id: { lt: after.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        createdAt: true,
        post: { include: postInclude },
        reel: { include: reelInclude },
      },
    });
    const shown = rows.slice(0, limit);
    const [postViews, reelViews] = await Promise.all([
      this.posts.hydrate(
        userId,
        shown.flatMap((r) => (r.post ? [r.post] : [])),
      ),
      this.reels.hydrate(
        userId,
        shown.flatMap((r) => (r.reel ? [r.reel] : [])),
      ),
    ]);
    const postById = new Map<string, PostView>(postViews.map((v) => [v.id, v]));
    const reelById = new Map<string, ReelView>(reelViews.map((v) => [v.id, v]));
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) =>
        r.reel
          ? {
              kind: 'reel' as const,
              savedAt: r.createdAt.toISOString(),
              reel: reelById.get(r.reel.id) as ReelView,
            }
          : {
              kind: 'post' as const,
              savedAt: r.createdAt.toISOString(),
              post: postById.get(r.post?.id ?? '') as PostView,
            },
    );
  }

  // ----------------------------------------------------------------- shares --

  /**
   * Records a share and returns the link to give out. A link is offered only for
   * content that anyone with the link could open (public, from an open account);
   * for the rest there is nothing useful to share, so `url` is null.
   */
  async share(
    userId: string,
    t: Target,
    channel: 'LINK' | 'MESSAGE' | 'EXTERNAL',
  ): Promise<{ sharesCount: number; url: string | null }> {
    const thing = await this.resolve(userId, t);
    if (!thing.allowSharing && thing.authorId !== userId) {
      throw Errors.forbidden('The author has turned sharing off for this.');
    }
    const recent = await this.prisma.share.findFirst({
      where: {
        ...this.where(userId, t),
        createdAt: { gt: new Date(Date.now() - SHARE_WINDOW_MS) },
      },
      select: { id: true },
    });
    let count = thing.sharesCount;
    if (!recent) {
      count = await this.prisma.$transaction(async (tx) => {
        await tx.share.create({
          data: {
            ...(t.kind === 'post' ? { userId, postId: t.id } : { userId, reelId: t.id }),
            channel,
          },
        });
        return this.bumpCounter(tx, t, 'sharesCount', 1);
      });
    }
    await this.reach.recordEngagement({ viewerId: userId, kind: t.kind, id: t.id, type: 'SHARE' });
    const open = thing.visibility === 'PUBLIC' && !thing.author.profile?.isPrivate;
    const base = this.env.PUBLIC_WEB_URL.replace(/\/$/, '');
    return {
      sharesCount: count,
      url: open ? `${base}/${t.kind === 'post' ? 'p' : 'r'}/${t.id}` : null,
    };
  }
}
