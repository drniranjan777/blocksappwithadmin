import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Errors, type FieldIssue } from '../../common/errors/app-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { SystemSettingsService } from '../../common/settings/system-settings.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { BLOCKED_TERMS_SETTING } from '../posts/posts.service.js';
import { MAX_MENTIONS, extractMentions } from '../posts/text-parsing.js';
import { screenText } from '../posts/text-safety.js';
import { MediaViews } from '../shared/media-views.js';
import { RelationshipsService } from '../shared/relationships.service.js';
import { cleanText } from '../shared/text.js';
import { type UserCard, toUserCard, userCardSelect } from '../shared/user-card.js';
import { ReachEventsService } from '../../reach/reach-events.service.js';
import { postVisibleTo, reelVisibleTo } from '../shared/visibility.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

/** More than this in an hour is flooding. */
export const COMMENTS_PER_HOUR = 120;

export type CommentTarget = { kind: 'post' | 'reel'; id: string };

const commentInclude = {
  author: { select: userCardSelect },
} satisfies Prisma.CommentInclude;
type CommentRow = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

export interface CommentView {
  id: string;
  body: string;
  author: UserCard;
  parentId: string | null;
  likesCount: number;
  repliesCount: number;
  viewer: { liked: boolean; isAuthor: boolean };
  /** Only the author of a comment sees this: it is held until a person has looked at it. */
  held?: boolean;
  createdAt: string;
}

/**
 * Comments and replies on posts and reels.
 *
 * Replies go one level deep: answering a reply attaches to the comment above it,
 * as people expect. A comment's counters (on the post and on its parent) count
 * only what is visible, are changed in the transaction that changes the rows, and
 * are never trusted from a client. Text goes through the same first-pass screen
 * as posts; a flagged comment is kept but shown only to its writer.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationships: RelationshipsService,
    private readonly notifications: NotificationService,
    private readonly settings: SystemSettingsService,
    private readonly idempotency: IdempotencyService,
    private readonly media: MediaViews,
    private readonly reach: ReachEventsService,
  ) {}

  // ------------------------------------------------------------------ guards --

  /** The commented-on thing, if the viewer can see it and comments are allowed for them. */
  private async openTarget(viewerId: string, t: CommentTarget, forWriting: boolean) {
    const select = {
      id: true,
      authorId: true,
      allowComments: true,
      author: {
        select: {
          profile: { select: { displayName: true } },
          settings: { select: { whoCanComment: true } },
        },
      },
    } as const;
    const row =
      t.kind === 'post'
        ? await this.prisma.post.findFirst({
            where: { AND: [{ id: t.id }, postVisibleTo(viewerId)] },
            select,
          })
        : await this.prisma.reel.findFirst({
            where: { AND: [{ id: t.id }, reelVisibleTo(viewerId)] },
            select,
          });
    if (!row) throw Errors.notFound(t.kind === 'post' ? 'Post' : 'Reel');
    if (forWriting && row.authorId !== viewerId) {
      if (!row.allowComments) throw Errors.forbidden('Comments are turned off here.');
      const who = row.author.settings?.whoCanComment ?? 'everyone';
      if (who === 'nobody') throw Errors.forbidden('Comments are turned off here.');
      if (who === 'followers') {
        const rel = await this.relationships.with(viewerId, row.authorId);
        if (!rel.following) throw Errors.forbidden('Only followers can comment here.');
      }
    }
    return row;
  }

  /** Comments I may see: not removed, not held (unless mine), and not from anyone on either side of a block. */
  private visibleComments(viewerId: string): Prisma.CommentWhereInput {
    return {
      deletedAt: null,
      OR: [{ status: 'VISIBLE' }, { authorId: viewerId }],
      author: {
        status: 'ACTIVE',
        blocksReceived: { none: { blockerId: viewerId, kind: 'BLOCK' } },
        blocksMade: { none: { blockedId: viewerId, kind: 'BLOCK' } },
      },
    };
  }

  // ------------------------------------------------------------------ create --

  async create(
    userId: string,
    t: CommentTarget,
    input: { body: string; parentId?: string | undefined },
    idempotencyKey?: string,
  ): Promise<CommentView> {
    return this.idempotency.run(
      { scope: `comment.create:${userId}`, key: idempotencyKey, request: { t, ...input } },
      () => this.createNow(userId, t, input),
    );
  }

  private async createNow(
    userId: string,
    t: CommentTarget,
    input: { body: string; parentId?: string | undefined },
  ): Promise<CommentView> {
    const body = cleanText(input.body);
    const issues: FieldIssue[] = [];
    if (body.length === 0) issues.push({ field: 'body', reasons: ['required'] });
    const names = extractMentions(body);
    if (names.length > MAX_MENTIONS) issues.push({ field: 'body', reasons: ['too_many_mentions'] });
    if (issues.length) throw Errors.validation(issues);

    const target = await this.openTarget(userId, t, true);

    const recent = await this.prisma.comment.count({
      where: { authorId: userId, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= COMMENTS_PER_HOUR) throw Errors.rateLimited(3600);

    // A reply to a reply attaches to the comment it hangs from.
    let parent: { id: string; authorId: string } | null = null;
    if (input.parentId) {
      const found = await this.prisma.comment.findFirst({
        where: {
          AND: [
            { id: input.parentId, ...(t.kind === 'post' ? { postId: t.id } : { reelId: t.id }) },
            this.visibleComments(userId),
          ],
        },
        select: { id: true, authorId: true, parentId: true },
      });
      if (!found) throw Errors.validation([{ field: 'parentId', reasons: ['not_found'] }]);
      parent = found.parentId
        ? await this.prisma.comment.findUniqueOrThrow({
            where: { id: found.parentId },
            select: { id: true, authorId: true },
          })
        : { id: found.id, authorId: found.authorId };
    }

    const blocked = await this.settings.get<string[]>(BLOCKED_TERMS_SETTING, []);
    const held = !screenText(body, blocked).clean;

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          authorId: userId,
          body,
          status: held ? 'HIDDEN' : 'VISIBLE',
          parentId: parent?.id ?? null,
          ...(t.kind === 'post' ? { postId: t.id } : { reelId: t.id }),
        },
        include: commentInclude,
      });
      if (!held) {
        const inc = { commentsCount: { increment: 1 } };
        if (t.kind === 'post') await tx.post.update({ where: { id: t.id }, data: inc });
        else await tx.reel.update({ where: { id: t.id }, data: inc });
        if (parent) {
          await tx.comment.update({
            where: { id: parent.id },
            data: { repliesCount: { increment: 1 } },
          });
        }
      }
      return created;
    });

    if (!held) {
      await this.tellPeople(userId, t, target.authorId, parent, comment.id, names);
      // A comment held for review is not conversation yet; only released ones can count (and only
      // meaningful ones are kept, see the Reach rules).
      await this.reach.recordEngagement({
        viewerId: userId,
        kind: t.kind,
        id: t.id,
        type: 'COMMENT',
        text: body,
      });
    }
    return this.toView(comment, userId, new Set());
  }

  private async tellPeople(
    actorId: string,
    t: CommentTarget,
    contentAuthorId: string,
    parent: { id: string; authorId: string } | null,
    commentId: string,
    mentionNames: string[],
  ): Promise<void> {
    const actor = await this.prisma.profile.findUnique({
      where: { userId: actorId },
      select: { displayName: true },
    });
    const name = actor?.displayName ?? 'Someone';
    const told = new Set<string>([actorId]);
    const tell = async (
      userId: string,
      type: 'COMMENT' | 'MENTION',
      template: 'social_comment' | 'social_reply' | 'social_mention',
    ) => {
      if (told.has(userId)) return;
      told.add(userId);
      await this.notifications
        .notify({
          userId,
          type,
          template,
          vars: { actor: name, target: t.kind },
          severity: 'INFO',
          category: 'social',
          data: { [`${t.kind}Id`]: t.id, commentId, userId: actorId },
          dedupeKey: `${template}:${commentId}`,
        })
        .catch(() => undefined);
    };
    // The most specific reason wins, and nobody is told twice for one comment.
    if (parent) await tell(parent.authorId, 'COMMENT', 'social_reply');
    await tell(contentAuthorId, 'COMMENT', 'social_comment');
    if (mentionNames.length > 0) {
      const people = await this.prisma.user.findMany({
        where: {
          username: { in: mentionNames },
          status: 'ACTIVE',
          blocksReceived: { none: { blockerId: actorId, kind: 'BLOCK' } },
          blocksMade: { none: { blockedId: actorId, kind: 'BLOCK' } },
        },
        select: { id: true },
      });
      for (const p of people) await tell(p.id, 'MENTION', 'social_mention');
    }
  }

  // -------------------------------------------------------------------- read --

  async listForTarget(
    viewerId: string,
    t: CommentTarget,
    q: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    await this.openTarget(viewerId, t, false);
    return this.page(
      viewerId,
      {
        ...(t.kind === 'post' ? { postId: t.id } : { reelId: t.id }),
        parentId: null,
      },
      q,
      'desc',
    );
  }

  async listReplies(
    viewerId: string,
    commentId: string,
    q: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    await this.requireVisible(viewerId, commentId);
    return this.page(viewerId, { parentId: commentId }, q, 'asc');
  }

  private async page(
    viewerId: string,
    base: Prisma.CommentWhereInput,
    q: { cursor?: string | undefined; limit?: number | undefined },
    order: 'asc' | 'desc',
  ) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const op = order === 'desc' ? 'lt' : 'gt';
    const rows = await this.prisma.comment.findMany({
      where: {
        AND: [
          base,
          this.visibleComments(viewerId),
          ...(after
            ? [
                {
                  OR: [
                    { createdAt: { [op]: new Date(after.t) } },
                    { createdAt: new Date(after.t), id: { [op]: after.id } },
                  ],
                } as Prisma.CommentWhereInput,
              ]
            : []),
        ],
      },
      include: commentInclude,
      orderBy: [{ createdAt: order }, { id: order }],
      take: limit + 1,
    });
    const liked = await this.likedSet(
      viewerId,
      rows.slice(0, limit).map((r) => r.id),
    );
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => this.toView(r, viewerId, liked),
    );
  }

  /** The comment, only if the viewer can see it *and* the thing it is on. */
  async requireVisible(viewerId: string, commentId: string) {
    const c = await this.prisma.comment.findFirst({
      where: { AND: [{ id: commentId }, this.visibleComments(viewerId)] },
      select: { id: true, postId: true, reelId: true, authorId: true, parentId: true },
    });
    if (!c) throw Errors.notFound('Comment');
    const target: CommentTarget = c.postId
      ? { kind: 'post', id: c.postId }
      : { kind: 'reel', id: c.reelId as string };
    const content = await this.openTarget(viewerId, target, false);
    return { ...c, target, contentAuthorId: content.authorId };
  }

  private async likedSet(viewerId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const likes = await this.prisma.like.findMany({
      where: { userId: viewerId, commentId: { in: ids } },
      select: { commentId: true },
    });
    return new Set(likes.map((l) => l.commentId as string));
  }

  private toView(c: CommentRow, viewerId: string, liked: Set<string>): CommentView {
    return {
      id: c.id,
      body: c.body,
      author: toUserCard(c.author, this.media),
      parentId: c.parentId,
      likesCount: c.likesCount,
      repliesCount: c.repliesCount,
      viewer: { liked: liked.has(c.id), isAuthor: c.authorId === viewerId },
      ...(c.status === 'HIDDEN' && c.authorId === viewerId ? { held: true } : {}),
      createdAt: c.createdAt.toISOString(),
    };
  }

  // ------------------------------------------------------------------ delete --

  /** The comment's writer, or the owner of what it is on, may remove it (and its replies). */
  async remove(userId: string, commentId: string): Promise<void> {
    const c = await this.prisma.comment.findFirst({
      where: { id: commentId, deletedAt: null },
      select: {
        id: true,
        authorId: true,
        parentId: true,
        postId: true,
        reelId: true,
        status: true,
      },
    });
    if (!c) return; // already gone: deleting is repeatable
    const contentAuthor = c.postId
      ? (await this.prisma.post.findUnique({ where: { id: c.postId }, select: { authorId: true } }))
          ?.authorId
      : (
          await this.prisma.reel.findUnique({
            where: { id: c.reelId as string },
            select: { authorId: true },
          })
        )?.authorId;
    if (c.authorId !== userId && contentAuthor !== userId) throw Errors.notFound('Comment');

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // Replies go with their parent; held (hidden) ones were never counted.
      const replies = c.parentId
        ? []
        : await tx.comment.findMany({
            where: { parentId: c.id, deletedAt: null },
            select: { id: true, status: true },
          });
      const gone = await tx.comment.updateMany({
        where: { id: { in: [c.id, ...replies.map((r) => r.id)] }, deletedAt: null },
        data: { status: 'REMOVED', deletedAt: now },
      });
      if (gone.count === 0) return;
      const counted =
        (c.status === 'VISIBLE' ? 1 : 0) + replies.filter((r) => r.status === 'VISIBLE').length;
      if (counted > 0) {
        const dec = { commentsCount: { increment: -counted } };
        if (c.postId) await tx.post.update({ where: { id: c.postId }, data: dec });
        else await tx.reel.update({ where: { id: c.reelId as string }, data: dec });
      }
      if (c.parentId && c.status === 'VISIBLE') {
        await tx.comment.update({
          where: { id: c.parentId },
          data: { repliesCount: { increment: -1 } },
        });
      }
    });
  }

  // -------------------------------------------------------------------- likes --

  async like(userId: string, commentId: string): Promise<{ liked: true; likesCount: number }> {
    const c = await this.requireVisible(userId, commentId);
    const count = await this.prisma.$transaction(async (tx) => {
      const res = await tx.like.createMany({ data: [{ userId, commentId }], skipDuplicates: true });
      if (res.count === 1) {
        return (
          await tx.comment.update({
            where: { id: commentId },
            data: { likesCount: { increment: 1 } },
            select: { likesCount: true },
          })
        ).likesCount;
      }
      return (
        await tx.comment.findUniqueOrThrow({
          where: { id: commentId },
          select: { likesCount: true },
        })
      ).likesCount;
    });
    void c;
    return { liked: true, likesCount: count };
  }

  async unlike(userId: string, commentId: string): Promise<{ liked: false; likesCount: number }> {
    const count = await this.prisma.$transaction(async (tx) => {
      const res = await tx.like.deleteMany({ where: { userId, commentId } });
      if (res.count === 1) {
        return (
          await tx.comment.update({
            where: { id: commentId },
            data: { likesCount: { increment: -1 } },
            select: { likesCount: true },
          })
        ).likesCount;
      }
      return (
        (await tx.comment.findUnique({ where: { id: commentId }, select: { likesCount: true } }))
          ?.likesCount ?? 0
      );
    });
    return { liked: false, likesCount: count };
  }
}
