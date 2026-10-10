import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../../common/errors/app-error.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { BlockKind, Prisma } from '../../generated/prisma/client.js';
import { MediaViews } from '../shared/media-views.js';
import { toUserCard, userCardSelect } from '../shared/user-card.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

/**
 * Blocking and muting.
 *
 * A **block** is mutual in effect: neither person can see the other's profile,
 * content, followers or comments, and any follow between them (and any pending
 * request) is removed, counters included. It is silent: the blocked person is
 * never told, and simply cannot find the other.
 *
 * A **mute** is one-sided and invisible: the muter stops seeing the other's
 * content in feeds; the other is not told and nothing else changes.
 */
@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaViews,
  ) {}

  private async requireExists(targetId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { status: true },
    });
    if (!user || user.status === 'DELETED') throw Errors.notFound('User');
  }

  async block(viewerId: string, targetId: string): Promise<{ blocked: true }> {
    if (viewerId === targetId) {
      throw Errors.validation([{ field: 'userId', reasons: ['cannot_block_yourself'] }]);
    }
    await this.requireExists(targetId);

    await this.prisma.$transaction(async (tx) => {
      await tx.userBlock.createMany({
        data: [{ blockerId: viewerId, blockedId: targetId, kind: 'BLOCK' }],
        skipDuplicates: true,
      });
      // Cut every follow between them, in both directions, fixing the counts.
      for (const [followerId, followeeId] of [
        [viewerId, targetId],
        [targetId, viewerId],
      ] as const) {
        const row = await tx.follow.findUnique({
          where: { followerId_followeeId: { followerId, followeeId } },
          select: { status: true },
        });
        if (!row) continue;
        const res = await tx.follow.deleteMany({ where: { followerId, followeeId } });
        if (res.count === 1 && row.status === 'ACCEPTED') {
          await tx.profile.update({
            where: { userId: followeeId },
            data: { followersCount: { increment: -1 } },
          });
          await tx.profile.update({
            where: { userId: followerId },
            data: { followingCount: { increment: -1 } },
          });
        }
      }
    });
    return { blocked: true };
  }

  async unblock(viewerId: string, targetId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId: viewerId, blockedId: targetId, kind: 'BLOCK' },
    });
  }

  async mute(viewerId: string, targetId: string): Promise<{ muted: true }> {
    if (viewerId === targetId) {
      throw Errors.validation([{ field: 'userId', reasons: ['cannot_mute_yourself'] }]);
    }
    await this.requireExists(targetId);
    await this.prisma.userBlock.createMany({
      data: [{ blockerId: viewerId, blockedId: targetId, kind: 'MUTE' }],
      skipDuplicates: true,
    });
    return { muted: true };
  }

  async unmute(viewerId: string, targetId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId: viewerId, blockedId: targetId, kind: 'MUTE' },
    });
  }

  async list(
    viewerId: string,
    kind: BlockKind,
    q: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const where: Prisma.UserBlockWhereInput = {
      blockerId: viewerId,
      kind,
      blocked: { status: { not: 'DELETED' } },
      ...(after
        ? {
            OR: [
              { createdAt: { lt: new Date(after.t) } },
              { createdAt: new Date(after.t), blockedId: { lt: after.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.userBlock.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { blockedId: 'desc' }],
      take: limit + 1,
      select: { createdAt: true, blockedId: true, blocked: { select: userCardSelect } },
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.blockedId }),
      (r) => ({ ...toUserCard(r.blocked, this.media), since: r.createdAt.toISOString() }),
    );
  }
}
