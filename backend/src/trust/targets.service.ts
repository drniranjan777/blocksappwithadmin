import { Injectable } from '@nestjs/common';
import { Errors } from '../common/errors/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, ReportTargetType } from '../generated/prisma/client.js';
import { postVisibleTo, reelVisibleTo, storyVisibleTo } from '../social/shared/visibility.js';

/** What a piece of content is, in moderation's terms, whatever kind of thing it is. */
export type ContentState = 'APPROVED' | 'PENDING' | 'RESTRICTED' | 'REMOVED';
export type ContentTarget = Extract<ReportTargetType, 'POST' | 'REEL' | 'STORY' | 'COMMENT'>;

export const isContentTarget = (t: ReportTargetType): t is ContentTarget =>
  t === 'POST' || t === 'REEL' || t === 'STORY' || t === 'COMMENT';

/** The thing a report is about, as far as the person reporting it is concerned. */
export interface ReportedThing {
  /** The account responsible for it. */
  ownerId: string;
  ownerUsername: string;
  /** A short piece of its text, kept with the report in case it is edited or deleted afterwards. */
  excerpt: string | null;
}

/** What staff see when they open a report. */
export interface TargetView {
  type: ReportTargetType;
  id: string;
  /** False when it no longer exists or was deleted by its author. */
  available: boolean;
  state: ContentState | 'ACTIVE' | 'SUSPENDED' | 'RESTRICTED_ACCOUNT' | string | null;
  owner: { id: string; username: string; status: string } | null;
  excerpt: string | null;
  details: Record<string, unknown>;
}

const EXCERPT = 300;
const cut = (s: string | null | undefined): string | null =>
  s ? (s.length > EXCERPT ? `${s.slice(0, EXCERPT)}…` : s) : null;

const MEDIA_REFUSED = (a: { status: string; moderationStatus: string }) =>
  a.moderationStatus === 'REMOVED' || a.status === 'REJECTED' || a.status === 'FAILED';

/**
 * Finds the things people report, and changes their moderation state.
 *
 * One place knows how a post, a reel, a story and a comment each hold "approved / hidden /
 * removed", so a decision means the same thing on all of them and the counters that depend on it
 * stay right. Everything that changes state takes the caller's transaction.
 */
@Injectable()
export class TargetsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- reporting --

  /**
   * The thing, if it exists and `viewerId` could have seen it. `viewerId` null means staff, who see
   * everything that exists. Not found and "not yours to see" look the same.
   */
  async forReport(
    viewerId: string | null,
    type: ReportTargetType,
    id: string,
  ): Promise<ReportedThing> {
    const owner = { select: { id: true, username: true } } as const;
    switch (type) {
      case 'POST': {
        const p = await this.prisma.post.findFirst({
          where: viewerId ? { id, AND: [postVisibleTo(viewerId)] } : { id, deletedAt: null },
          select: { caption: true, author: owner },
        });
        if (!p) throw Errors.notFound('That post');
        return { ownerId: p.author.id, ownerUsername: p.author.username, excerpt: cut(p.caption) };
      }
      case 'REEL': {
        const r = await this.prisma.reel.findFirst({
          where: viewerId ? { id, AND: [reelVisibleTo(viewerId)] } : { id, deletedAt: null },
          select: { caption: true, author: owner },
        });
        if (!r) throw Errors.notFound('That reel');
        return { ownerId: r.author.id, ownerUsername: r.author.username, excerpt: cut(r.caption) };
      }
      case 'STORY': {
        const s = await this.prisma.story.findFirst({
          where: viewerId ? { id, AND: [storyVisibleTo(viewerId)] } : { id, deletedAt: null },
          select: { caption: true, author: owner },
        });
        if (!s) throw Errors.notFound('That story');
        return { ownerId: s.author.id, ownerUsername: s.author.username, excerpt: cut(s.caption) };
      }
      case 'COMMENT': {
        const c = await this.prisma.comment.findFirst({
          where: {
            id,
            deletedAt: null,
            ...(viewerId
              ? {
                  status: 'VISIBLE',
                  OR: [{ post: postVisibleTo(viewerId) }, { reel: reelVisibleTo(viewerId) }],
                }
              : {}),
          },
          select: { body: true, author: owner },
        });
        if (!c) throw Errors.notFound('That comment');
        return { ownerId: c.author.id, ownerUsername: c.author.username, excerpt: cut(c.body) };
      }
      case 'USER': {
        const u = await this.prisma.user.findFirst({
          where: {
            id,
            deletedAt: null,
            ...(viewerId
              ? {
                  blocksReceived: { none: { blockerId: viewerId, kind: 'BLOCK' } },
                  blocksMade: { none: { blockedId: viewerId, kind: 'BLOCK' } },
                }
              : {}),
          },
          select: { id: true, username: true, profile: { select: { bio: true } } },
        });
        if (!u) throw Errors.notFound('That account');
        return { ownerId: u.id, ownerUsername: u.username, excerpt: cut(u.profile?.bio) };
      }
      case 'LIVE': {
        const l = await this.prisma.liveSession.findFirst({
          where: { id },
          select: { title: true, host: owner },
        });
        if (!l) throw Errors.notFound('That live session');
        return { ownerId: l.host.id, ownerUsername: l.host.username, excerpt: cut(l.title) };
      }
      case 'MESSAGE':
        throw Errors.validation([{ field: 'targetType', reasons: ['not_available_yet'] }]);
    }
  }

  // ------------------------------------------------------------------ staff view --

  async describe(type: ReportTargetType, id: string): Promise<TargetView> {
    const owner = { select: { id: true, username: true, status: true } } as const;
    const gone = (details: Record<string, unknown> = {}): TargetView => ({
      type,
      id,
      available: false,
      state: null,
      owner: null,
      excerpt: null,
      details,
    });
    switch (type) {
      case 'POST': {
        const p = await this.prisma.post.findUnique({
          where: { id },
          select: {
            caption: true,
            type: true,
            visibility: true,
            moderationStatus: true,
            deletedAt: true,
            publishedAt: true,
            likesCount: true,
            commentsCount: true,
            viewsCount: true,
            author: owner,
            media: { select: { mediaAssetId: true }, orderBy: { position: 'asc' } },
          },
        });
        if (!p) return gone();
        return {
          type,
          id,
          available: !p.deletedAt,
          state: p.moderationStatus,
          owner: p.author,
          excerpt: p.caption,
          details: {
            postType: p.type,
            visibility: p.visibility,
            publishedAt: p.publishedAt.toISOString(),
            deleted: !!p.deletedAt,
            likes: p.likesCount,
            comments: p.commentsCount,
            views: p.viewsCount,
            mediaAssetIds: p.media.map((m) => m.mediaAssetId),
          },
        };
      }
      case 'REEL': {
        const r = await this.prisma.reel.findUnique({
          where: { id },
          select: {
            caption: true,
            visibility: true,
            moderationStatus: true,
            publishStatus: true,
            deletedAt: true,
            publishedAt: true,
            durationMs: true,
            likesCount: true,
            commentsCount: true,
            viewsCount: true,
            mediaAssetId: true,
            author: owner,
          },
        });
        if (!r) return gone();
        return {
          type,
          id,
          available: !r.deletedAt,
          state: r.moderationStatus,
          owner: r.author,
          excerpt: r.caption,
          details: {
            visibility: r.visibility,
            publishStatus: r.publishStatus,
            publishedAt: r.publishedAt?.toISOString() ?? null,
            deleted: !!r.deletedAt,
            durationMs: r.durationMs,
            likes: r.likesCount,
            comments: r.commentsCount,
            views: r.viewsCount,
            mediaAssetIds: r.mediaAssetId ? [r.mediaAssetId] : [],
          },
        };
      }
      case 'STORY': {
        const s = await this.prisma.story.findUnique({
          where: { id },
          select: {
            caption: true,
            visibility: true,
            moderationStatus: true,
            deletedAt: true,
            expiresAt: true,
            viewsCount: true,
            mediaAssetId: true,
            author: owner,
          },
        });
        if (!s) return gone();
        return {
          type,
          id,
          available: !s.deletedAt,
          state: s.moderationStatus,
          owner: s.author,
          excerpt: s.caption,
          details: {
            visibility: s.visibility,
            expiresAt: s.expiresAt.toISOString(),
            expired: s.expiresAt <= new Date(),
            deleted: !!s.deletedAt,
            views: s.viewsCount,
            mediaAssetIds: [s.mediaAssetId],
          },
        };
      }
      case 'COMMENT': {
        const c = await this.prisma.comment.findUnique({
          where: { id },
          select: {
            body: true,
            status: true,
            deletedAt: true,
            postId: true,
            reelId: true,
            parentId: true,
            createdAt: true,
            author: owner,
          },
        });
        if (!c) return gone();
        return {
          type,
          id,
          available: !c.deletedAt,
          state: commentToState(c.status),
          owner: c.author,
          excerpt: c.body,
          details: {
            onPostId: c.postId,
            onReelId: c.reelId,
            replyToId: c.parentId,
            postedAt: c.createdAt.toISOString(),
            deleted: !!c.deletedAt,
          },
        };
      }
      case 'USER': {
        const u = await this.prisma.user.findUnique({
          where: { id },
          select: {
            id: true,
            username: true,
            status: true,
            deletedAt: true,
            createdAt: true,
            profile: {
              select: { displayName: true, bio: true, followersCount: true, postsCount: true },
            },
          },
        });
        if (!u) return gone();
        return {
          type,
          id,
          available: !u.deletedAt,
          state: u.status,
          owner: { id: u.id, username: u.username, status: u.status },
          excerpt: u.profile?.bio ?? null,
          details: {
            displayName: u.profile?.displayName ?? u.username,
            joinedAt: u.createdAt.toISOString(),
            followers: u.profile?.followersCount ?? 0,
            posts: u.profile?.postsCount ?? 0,
          },
        };
      }
      case 'LIVE': {
        const l = await this.prisma.liveSession.findUnique({
          where: { id },
          select: {
            title: true,
            status: true,
            startedAt: true,
            endedAt: true,
            peakViewers: true,
            host: owner,
          },
        });
        if (!l) return gone();
        return {
          type,
          id,
          available: true,
          state: l.status,
          owner: l.host,
          excerpt: l.title,
          details: {
            startedAt: l.startedAt?.toISOString() ?? null,
            endedAt: l.endedAt?.toISOString() ?? null,
            peakViewers: l.peakViewers,
          },
        };
      }
      case 'MESSAGE':
        return gone({ note: 'Messages are not reportable yet.' });
    }
  }

  // ------------------------------------------------------------------- changing --

  /**
   * Moves content to `to` and returns where it was. `changed` is false when nothing needed doing
   * (already there, or still being put together by the media pipeline, whose call it is).
   *
   * Restoring checks that the media was not itself refused: a moderator restoring a post whose
   * picture media review rejected would otherwise put a refused file back in front of people.
   */
  async setState(
    tx: Prisma.TransactionClient,
    type: ContentTarget,
    id: string,
    to: Exclude<ContentState, 'PENDING'>,
    opts: { expectFrom?: ContentState } = {},
  ): Promise<{ from: ContentState; changed: boolean; ownerId: string }> {
    const same = (from: ContentState, ownerId: string) => ({ from, changed: false, ownerId });
    const restoring = to === 'APPROVED';
    // Undoing a decision is only right if the content is still as that decision left it.
    const expected = (from: ContentState) => {
      if (opts.expectFrom && from !== opts.expectFrom) throw changedSince();
    };
    // A decision about something still being processed is not ours to undo.
    const skip = (from: ContentState) => restoring && from !== 'RESTRICTED' && from !== 'REMOVED';

    switch (type) {
      case 'POST': {
        const p = await tx.post.findFirst({
          where: { id, deletedAt: null },
          select: {
            authorId: true,
            moderationStatus: true,
            media: { select: { mediaAsset: { select: { status: true, moderationStatus: true } } } },
          },
        });
        if (!p) throw Errors.conflict('The author has already deleted this post.');
        const from = p.moderationStatus;
        expected(from);
        if (from === to || skip(from)) return same(from, p.authorId);
        if (restoring && p.media.some((m) => MEDIA_REFUSED(m.mediaAsset)))
          throw Errors.conflict('Media review refused its picture, so it cannot be restored here.');
        const res = await tx.post.updateMany({
          where: { id, moderationStatus: from, deletedAt: null },
          data: { moderationStatus: to },
        });
        if (res.count !== 1) throw changedByOther();
        return { from, changed: true, ownerId: p.authorId };
      }
      case 'REEL': {
        const r = await tx.reel.findFirst({
          where: { id, deletedAt: null },
          select: {
            authorId: true,
            moderationStatus: true,
            publishStatus: true,
            publishedAt: true,
            video: { select: { status: true, moderationStatus: true } },
          },
        });
        if (!r) throw Errors.conflict('The author has already deleted this reel.');
        const from = r.moderationStatus;
        expected(from);
        if (from === to || skip(from)) return same(from, r.authorId);
        if (restoring && r.video && MEDIA_REFUSED(r.video))
          throw Errors.conflict('Media review refused its video, so it cannot be restored here.');
        const res = await tx.reel.updateMany({
          where: { id, moderationStatus: from, deletedAt: null },
          data: {
            moderationStatus: to,
            ...(to === 'REMOVED'
              ? { publishStatus: 'REMOVED' as const }
              : r.publishStatus === 'REMOVED' && r.publishedAt
                ? { publishStatus: 'PUBLISHED' as const }
                : {}),
          },
        });
        if (res.count !== 1) throw changedByOther();
        return { from, changed: true, ownerId: r.authorId };
      }
      case 'STORY': {
        const s = await tx.story.findFirst({
          where: { id, deletedAt: null },
          select: { authorId: true, moderationStatus: true },
        });
        if (!s) throw Errors.conflict('The author has already deleted this story.');
        const from = s.moderationStatus;
        expected(from);
        if (from === to || skip(from)) return same(from, s.authorId);
        const res = await tx.story.updateMany({
          where: { id, moderationStatus: from, deletedAt: null },
          data: { moderationStatus: to },
        });
        if (res.count !== 1) throw changedByOther();
        return { from, changed: true, ownerId: s.authorId };
      }
      case 'COMMENT':
        return this.setCommentState(tx, id, to, opts.expectFrom);
    }
  }

  /**
   * A comment is `VISIBLE`, `HIDDEN` (held) or `REMOVED`; only visible ones are counted on the post
   * or reel and on the comment they reply to. Removing a top-level comment removes its replies too,
   * as when its author deletes it; restoring brings back only the comment itself.
   */
  private async setCommentState(
    tx: Prisma.TransactionClient,
    id: string,
    to: Exclude<ContentState, 'PENDING'>,
    expectFrom: ContentState | undefined,
  ): Promise<{ from: ContentState; changed: boolean; ownerId: string }> {
    const c = await tx.comment.findFirst({
      where: { id },
      select: {
        authorId: true,
        status: true,
        deletedAt: true,
        parentId: true,
        postId: true,
        reelId: true,
      },
    });
    if (!c) throw Errors.conflict('This comment is already gone.');
    const from = commentToState(c.status);
    if (expectFrom && from !== expectFrom) throw changedSince();
    const target = to === 'APPROVED' ? 'VISIBLE' : to === 'RESTRICTED' ? 'HIDDEN' : 'REMOVED';
    if (from === to) return { from, changed: false, ownerId: c.authorId };
    // Hiding or removing what its author has already deleted: nothing left to do.
    // (An undo names the state it expects, so a removal it is undoing is known to be ours.)
    if (c.deletedAt && to !== 'APPROVED' && !expectFrom)
      throw Errors.conflict('This comment is already gone.');

    const wasCounted = c.status === 'VISIBLE';
    const willCount = target === 'VISIBLE';
    let removedReplies: string[] = [];
    if (target === 'REMOVED' && !c.parentId) {
      const replies = await tx.comment.findMany({
        where: { parentId: id, deletedAt: null },
        select: { id: true, status: true },
      });
      removedReplies = replies.filter((r) => r.status === 'VISIBLE').map((r) => r.id);
      await tx.comment.updateMany({
        where: { parentId: id, deletedAt: null },
        data: { status: 'REMOVED', deletedAt: new Date() },
      });
    }
    const res = await tx.comment.updateMany({
      where: { id, status: c.status },
      data: {
        status: target,
        deletedAt: target === 'REMOVED' ? new Date() : null,
      },
    });
    if (res.count !== 1) throw changedByOther();

    const delta = (willCount ? 1 : 0) - (wasCounted ? 1 : 0) - removedReplies.length;
    if (delta !== 0) {
      const data = { commentsCount: { increment: delta } };
      if (c.postId) await tx.post.update({ where: { id: c.postId }, data });
      else if (c.reelId) await tx.reel.update({ where: { id: c.reelId }, data });
    }
    if (c.parentId && wasCounted !== willCount) {
      await tx.comment.update({
        where: { id: c.parentId },
        data: { repliesCount: { increment: willCount ? 1 : -1 } },
      });
    }
    return { from, changed: true, ownerId: c.authorId };
  }
}

function commentToState(status: 'VISIBLE' | 'HIDDEN' | 'REMOVED'): ContentState {
  return status === 'VISIBLE' ? 'APPROVED' : status === 'HIDDEN' ? 'RESTRICTED' : 'REMOVED';
}

const changedByOther = () =>
  Errors.conflict('Someone else changed this just now. Reload and look again.');

const changedSince = () =>
  Errors.conflict('This has changed since that decision, so it cannot be undone automatically.');
