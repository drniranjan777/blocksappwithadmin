import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../../common/errors/app-error.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { type PostRow, type PostView, postInclude } from '../posts/post-view.js';
import { PostsService } from '../posts/posts.service.js';
import { ReelReader } from '../reels/reel-reader.service.js';
import { type ReelRow, type ReelView, reelInclude } from '../reels/reel-view.js';
import { notMutedBy, postVisibleTo, reelVisibleTo } from '../shared/visibility.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

export const FEED_SCOPES = ['following', 'local', 'state', 'national', 'global'] as const;
export type FeedScope = (typeof FEED_SCOPES)[number];

export type FeedItem = { kind: 'post'; post: PostView } | { kind: 'reel'; reel: ReelView };

/** Conditions that mean the same on a post and on a reel (place, reach, who wrote it). */
type ScopeWhere = Prisma.PostWhereInput & Prisma.ReelWhereInput;

/**
 * The feeds.
 *
 *   following   people I follow, and me
 *   local       posted from my district
 *   state       posted from my state
 *   national    reached the National rung of the Reach Ladder
 *   global      reached the Global rung
 *
 * "Local" and "state" are places (everything posted there); "national" and
 * "global" are earned (the Reach Engine moves a post up the ladder as people
 * outside its area engage with it). Within each, the order is newest first. A
 * ranking model is a later, separate piece of work; keeping the order simple and
 * explainable for now means "why am I seeing this?" has an honest answer.
 *
 * Posts and reels are one stream: both are ordered by when they were published, so a page
 * is the newest of the two together, and one cursor continues the whole stream. `reels` is
 * the same feed with only reels in it, for the vertical player.
 *
 * Every feed shares one visibility filter with profiles and single lookups, drops
 * people the viewer has muted, and (outside "following") leaves out the viewer's
 * own content.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly reels: ReelReader,
  ) {}

  private async scopeFilter(viewerId: string, scope: FeedScope): Promise<ScopeWhere | 'empty'> {
    if (scope === 'following') {
      return {
        OR: [
          { authorId: viewerId },
          { author: { followers: { some: { followerId: viewerId, status: 'ACCEPTED' } } } },
        ],
      };
    }
    const me = await this.prisma.profile.findUnique({
      where: { userId: viewerId },
      select: { country: true, state: true, district: true },
    });
    const base: ScopeWhere = { authorId: { not: viewerId } };
    switch (scope) {
      case 'local':
        return me?.district
          ? { ...base, country: me.country, state: me.state, district: me.district }
          : 'empty';
      case 'state':
        return me?.state ? { ...base, country: me.country, state: me.state } : 'empty';
      case 'national':
        return {
          ...base,
          country: me?.country ?? 'IN',
          reachLevel: { in: ['NATIONAL', 'GLOBAL'] },
        };
      case 'global':
        return { ...base, reachLevel: 'GLOBAL' };
    }
  }

  async feed(
    viewerId: string,
    scope: FeedScope,
    q: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    return this.scoped(viewerId, scope, q, { posts: true, reels: true });
  }

  /** Only reels, for the vertical player. Same scopes and rules as the feed. */
  async reelsFeed(
    viewerId: string,
    scope: FeedScope,
    q: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    return this.scoped(viewerId, scope, q, { posts: false, reels: true });
  }

  private async scoped(
    viewerId: string,
    scope: FeedScope,
    q: { cursor?: string | undefined; limit?: number | undefined },
    kinds: Kinds,
  ) {
    const filter = await this.scopeFilter(viewerId, scope);
    // No place set on the profile, so "local" and "state" have nothing to show yet.
    if (filter === 'empty') return new Page<FeedItem>([], null);
    return this.page(viewerId, [filter], q, kinds);
  }

  async byHashtag(
    viewerId: string,
    tag: string,
    q: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    const clean = tag.trim().replace(/^#/, '').toLowerCase();
    if (!/^[\p{L}\p{N}\p{M}_]{2,50}$/u.test(clean)) {
      throw Errors.validation([{ field: 'tag', reasons: ['invalid'] }]);
    }
    return this.page(viewerId, [{ hashtags: { has: clean } }], q, { posts: true, reels: false });
  }

  private async page(
    viewerId: string,
    extra: ScopeWhere[],
    q: { cursor?: string | undefined; limit?: number | undefined },
    kinds: Kinds,
  ) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const olderThanCursor = after
      ? [
          {
            OR: [
              { publishedAt: { lt: new Date(after.t) } },
              { publishedAt: new Date(after.t), id: { lt: after.id } },
            ],
          },
        ]
      : [];
    const order = [{ publishedAt: 'desc' as const }, { id: 'desc' as const }];
    const [posts, reels] = await Promise.all([
      kinds.posts
        ? this.prisma.post.findMany({
            where: {
              AND: [
                ...extra,
                postVisibleTo(viewerId),
                { author: notMutedBy(viewerId) },
                ...olderThanCursor,
              ],
            },
            include: postInclude,
            orderBy: order,
            take: limit + 1,
          })
        : Promise.resolve([] as PostRow[]),
      kinds.reels
        ? this.prisma.reel.findMany({
            where: {
              AND: [
                ...extra,
                reelVisibleTo(viewerId),
                { author: notMutedBy(viewerId) },
                // A reel still being made has no place in the stream yet, even your own.
                { publishedAt: { not: null } },
                ...olderThanCursor,
              ],
            },
            include: reelInclude,
            orderBy: order,
            take: limit + 1,
          })
        : Promise.resolve([] as ReelRow[]),
    ]);

    // One stream, newest first. The same (time, id) order as each query, so the cursor means
    // the same thing whichever kinds are in it.
    type Entry = { t: Date; id: string; post?: PostRow; reel?: ReelRow };
    const merged: Entry[] = [
      ...posts.map((post): Entry => ({ t: post.publishedAt, id: post.id, post })),
      ...reels.map((reel): Entry => ({ t: reel.publishedAt as Date, id: reel.id, reel })),
    ]
      .sort((a, b) => b.t.getTime() - a.t.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .slice(0, limit + 1);

    const shown = merged.slice(0, limit);
    const [postViews, reelViews] = await Promise.all([
      this.posts.hydrate(
        viewerId,
        shown.flatMap((e) => (e.post ? [e.post] : [])),
      ),
      this.reels.hydrate(
        viewerId,
        shown.flatMap((e) => (e.reel ? [e.reel] : [])),
      ),
    ]);
    const postById = new Map(postViews.map((v) => [v.id, v]));
    const reelById = new Map(reelViews.map((v) => [v.id, v]));
    return Page.fromRows(
      merged,
      limit,
      (e) => ({ t: e.t.toISOString(), id: e.id }),
      (e): FeedItem =>
        e.post
          ? { kind: 'post', post: postById.get(e.id) as PostView }
          : { kind: 'reel', reel: reelById.get(e.id) as ReelView },
    );
  }
}

interface Kinds {
  posts: boolean;
  reels: boolean;
}
