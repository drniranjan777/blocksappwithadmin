import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../../common/errors/app-error.js';
import { isUuid } from '../../common/ids.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { MediaViews } from '../shared/media-views.js';
import { type Relation, RelationshipsService } from '../shared/relationships.service.js';
import { type UserCard, toUserCard, userCardSelect } from '../shared/user-card.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

/** More than this in an hour is automation, not a person. */
export const FOLLOWS_PER_HOUR = 150;

export type FollowState = 'FOLLOWING' | 'REQUESTED' | 'NONE';

export interface PersonEntry extends UserCard {
  relation: Relation;
}

/**
 * Following people, and the requests that private accounts receive.
 *
 * Counters (`followers_count`, `following_count`) are changed in the same
 * transaction as the row that causes the change, and only when a row really was
 * created, accepted or deleted, so doing something twice (a retry, a double tap)
 * counts once. The database refuses a negative count as a last defence.
 */
@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationships: RelationshipsService,
    private readonly notifications: NotificationService,
    private readonly media: MediaViews,
  ) {}

  private async bump(
    tx: Prisma.TransactionClient,
    followerId: string,
    followeeId: string,
    by: 1 | -1,
  ): Promise<void> {
    await tx.profile.update({
      where: { userId: followeeId },
      data: { followersCount: { increment: by } },
    });
    await tx.profile.update({
      where: { userId: followerId },
      data: { followingCount: { increment: by } },
    });
  }

  // ---------------------------------------------------------------- follow --

  async follow(viewerId: string, targetId: string) {
    if (viewerId === targetId) {
      throw Errors.validation([{ field: 'userId', reasons: ['cannot_follow_yourself'] }]);
    }
    const target = await this.relationships.requireReachable(viewerId, targetId);
    const mine = await this.relationships.with(viewerId, targetId);
    if (mine.blocked) {
      throw Errors.conflict('Unblock this person before following them.', 'CONFLICT');
    }

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } },
      select: { status: true },
    });
    if (existing) return this.stateOf(existing.status, targetId);

    const recent = await this.prisma.follow.count({
      where: { followerId: viewerId, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= FOLLOWS_PER_HOUR) throw Errors.rateLimited(3600);

    const isPrivate = target.profile?.isPrivate ?? false;
    const created = await this.prisma.$transaction(async (tx) => {
      const res = await tx.follow.createMany({
        data: [
          {
            followerId: viewerId,
            followeeId: targetId,
            status: isPrivate ? 'PENDING' : 'ACCEPTED',
          },
        ],
        skipDuplicates: true,
      });
      // Lost a race with an identical request: it already did the work.
      if (res.count === 0) return false;
      if (!isPrivate) await this.bump(tx, viewerId, targetId, 1);
      return true;
    });

    if (created) await this.tell(viewerId, targetId, isPrivate ? 'request' : 'follow');
    const row = await this.prisma.follow.findUniqueOrThrow({
      where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } },
      select: { status: true },
    });
    return this.stateOf(row.status, targetId);
  }

  private async stateOf(status: 'ACCEPTED' | 'PENDING', targetId: string) {
    const p = await this.prisma.profile.findUnique({
      where: { userId: targetId },
      select: { followersCount: true },
    });
    return {
      state: (status === 'ACCEPTED' ? 'FOLLOWING' : 'REQUESTED') as FollowState,
      followersCount: p?.followersCount ?? 0,
    };
  }

  private async tell(
    actorId: string,
    userId: string,
    kind: 'follow' | 'request' | 'accepted',
  ): Promise<void> {
    const actor = await this.prisma.profile.findUnique({
      where: { userId: actorId },
      select: { displayName: true },
    });
    await this.notifications
      .notify({
        userId,
        type: kind === 'request' ? 'FOLLOW_REQUEST' : 'NEW_FOLLOWER',
        template:
          kind === 'request'
            ? 'social_follow_request'
            : kind === 'accepted'
              ? 'social_follow_accepted'
              : 'social_new_follower',
        vars: { actor: actor?.displayName ?? 'Someone' },
        severity: 'INFO',
        category: 'social',
        data: { userId: actorId },
        // One notice per person per kind: unfollowing and following again must not nag.
        dedupeKey: `${kind}:${actorId}`,
      })
      .catch(() => undefined);
  }

  async unfollow(viewerId: string, targetId: string): Promise<{ followersCount: number }> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.follow.findUnique({
        where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } },
        select: { status: true },
      });
      if (!row) return;
      const res = await tx.follow.deleteMany({
        where: { followerId: viewerId, followeeId: targetId },
      });
      if (res.count === 1 && row.status === 'ACCEPTED') await this.bump(tx, viewerId, targetId, -1);
    });
    const p = await this.prisma.profile.findUnique({
      where: { userId: targetId },
      select: { followersCount: true },
    });
    return { followersCount: p?.followersCount ?? 0 };
  }

  // -------------------------------------------------------------- requests --

  async requests(userId: string, q: { cursor?: string | undefined; limit?: number | undefined }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.follow.findMany({
      where: {
        followeeId: userId,
        status: 'PENDING',
        follower: { status: 'ACTIVE' },
        ...(after
          ? {
              OR: [
                { createdAt: { lt: new Date(after.t) } },
                { createdAt: new Date(after.t), followerId: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { followerId: 'desc' }],
      take: limit + 1,
      select: { createdAt: true, followerId: true, follower: { select: userCardSelect } },
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.followerId }),
      (r) => ({ ...toUserCard(r.follower, this.media), requestedAt: r.createdAt.toISOString() }),
    );
  }

  async approve(userId: string, requesterId: string) {
    const approved = await this.prisma.$transaction(async (tx) => {
      const res = await tx.follow.updateMany({
        where: { followerId: requesterId, followeeId: userId, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
      if (res.count === 1) await this.bump(tx, requesterId, userId, 1);
      return res.count === 1;
    });
    if (!approved) throw Errors.notFound('Follow request');
    await this.tell(userId, requesterId, 'accepted');
    return { approved: true };
  }

  async decline(userId: string, requesterId: string): Promise<void> {
    const res = await this.prisma.follow.deleteMany({
      where: { followerId: requesterId, followeeId: userId, status: 'PENDING' },
    });
    if (res.count === 0) throw Errors.notFound('Follow request');
  }

  /** Makes someone stop following me. */
  async removeFollower(userId: string, followerId: string): Promise<void> {
    await this.unfollow(followerId, userId);
  }

  // --------------------------------------------------------- close friends --

  async setCloseFriend(
    userId: string,
    followerId: string,
    on: boolean,
  ): Promise<{ closeFriend: boolean }> {
    const res = await this.prisma.follow.updateMany({
      where: { followerId, followeeId: userId, status: 'ACCEPTED' },
      data: { closeFriend: on },
    });
    if (res.count === 0) throw Errors.notFound('Follower');
    return { closeFriend: on };
  }

  async closeFriends(
    userId: string,
    q: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    return this.listPeople(userId, userId, 'followers', q, { closeFriend: true });
  }

  // ----------------------------------------------------------------- lists --

  /** Followers or following of a person, if the viewer may see the list. */
  async list(
    viewerId: string,
    ref: string,
    direction: 'followers' | 'following',
    q: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    const cleaned = ref.trim().replace(/^@/, '').toLowerCase();
    const target = await this.prisma.user.findFirst({
      where: isUuid(cleaned) ? { id: cleaned } : { username: cleaned },
      select: { id: true, status: true, profile: { select: { isPrivate: true } } },
    });
    if (!target || target.status !== 'ACTIVE') throw Errors.notFound('Profile');
    const rel = await this.relationships.with(viewerId, target.id);
    if (rel.blockedBy) throw Errors.notFound('Profile');
    const isMe = target.id === viewerId;
    if (!isMe && (target.profile?.isPrivate ?? false) && !rel.following) {
      throw Errors.forbidden('This account is private. Follow it to see who it follows.');
    }
    return this.listPeople(viewerId, target.id, direction, q);
  }

  private async listPeople(
    viewerId: string,
    targetId: string,
    direction: 'followers' | 'following',
    q: { cursor?: string | undefined; limit?: number | undefined },
    extra: Prisma.FollowWhereInput = {},
  ) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const otherSide = direction === 'followers' ? 'followerId' : 'followeeId';
    const rows = await this.prisma.follow.findMany({
      where: {
        ...(direction === 'followers' ? { followeeId: targetId } : { followerId: targetId }),
        status: 'ACCEPTED',
        ...extra,
        [direction === 'followers' ? 'follower' : 'followee']: {
          status: 'ACTIVE',
          // Do not list people who have blocked the viewer, or whom the viewer blocked.
          blocksReceived: { none: { blockerId: viewerId, kind: 'BLOCK' } },
          blocksMade: { none: { blockedId: viewerId, kind: 'BLOCK' } },
        },
        ...(after
          ? {
              OR: [
                { createdAt: { lt: new Date(after.t) } },
                { createdAt: new Date(after.t), [otherSide]: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { [otherSide]: 'desc' }],
      take: limit + 1,
      select: {
        createdAt: true,
        followerId: true,
        followeeId: true,
        follower: { select: userCardSelect },
        followee: { select: userCardSelect },
      },
    });
    const people = rows.map((r) => ({
      createdAt: r.createdAt,
      key: direction === 'followers' ? r.followerId : r.followeeId,
      user: direction === 'followers' ? r.follower : r.followee,
    }));
    const relations = await this.relationships.between(
      viewerId,
      people.slice(0, limit).map((p) => p.key),
    );
    return Page.fromRows(
      people,
      limit,
      (p) => ({ t: p.createdAt.toISOString(), id: p.key }),
      (p): PersonEntry => ({
        ...toUserCard(p.user, this.media),
        relation: relations.get(p.key) ?? {
          following: false,
          requested: false,
          followedBy: false,
          blocked: false,
          blockedBy: false,
          muted: false,
        },
      }),
    );
  }
}
