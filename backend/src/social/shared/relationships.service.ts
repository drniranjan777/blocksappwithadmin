import { Injectable } from '@nestjs/common';
import { Errors } from '../../common/errors/app-error.js';
import { PrismaService } from '../../database/prisma.service.js';

/** How the viewer stands with another person. */
export interface Relation {
  /** The viewer follows them (accepted). */
  following: boolean;
  /** The viewer has asked to follow and is waiting for approval. */
  requested: boolean;
  /** They follow the viewer (accepted). */
  followedBy: boolean;
  /** The viewer has blocked them. */
  blocked: boolean;
  /** They have blocked the viewer. */
  blockedBy: boolean;
  /** The viewer has muted them. */
  muted: boolean;
}

export const NO_RELATION: Relation = {
  following: false,
  requested: false,
  followedBy: false,
  blocked: false,
  blockedBy: false,
  muted: false,
};

/**
 * Relationship look-ups, always in batches (one round trip for a whole page of
 * people, never one per row).
 */
@Injectable()
export class RelationshipsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The relation of `viewerId` to each of `targetIds`. */
  async between(viewerId: string, targetIds: readonly string[]): Promise<Map<string, Relation>> {
    const ids = [...new Set(targetIds)].filter((id) => id !== viewerId);
    const out = new Map<string, Relation>(ids.map((id) => [id, { ...NO_RELATION }]));
    if (ids.length === 0) return out;

    const [follows, blocks] = await Promise.all([
      this.prisma.follow.findMany({
        where: {
          OR: [
            { followerId: viewerId, followeeId: { in: ids } },
            { followeeId: viewerId, followerId: { in: ids } },
          ],
        },
        select: { followerId: true, followeeId: true, status: true },
      }),
      this.prisma.userBlock.findMany({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: { in: ids } },
            { blockedId: viewerId, blockerId: { in: ids } },
          ],
        },
        select: { blockerId: true, blockedId: true, kind: true },
      }),
    ]);

    for (const f of follows) {
      if (f.followerId === viewerId) {
        const r = out.get(f.followeeId);
        if (r) {
          if (f.status === 'ACCEPTED') r.following = true;
          else r.requested = true;
        }
      } else {
        const r = out.get(f.followerId);
        if (r && f.status === 'ACCEPTED') r.followedBy = true;
      }
    }
    for (const b of blocks) {
      if (b.blockerId === viewerId) {
        const r = out.get(b.blockedId);
        if (r) {
          if (b.kind === 'BLOCK') r.blocked = true;
          if (b.kind === 'MUTE') r.muted = true;
        }
      } else if (b.kind === 'BLOCK') {
        const r = out.get(b.blockerId);
        if (r) r.blockedBy = true;
      }
    }
    return out;
  }

  async with(viewerId: string, targetId: string): Promise<Relation> {
    if (viewerId === targetId) return { ...NO_RELATION };
    return (await this.between(viewerId, [targetId])).get(targetId) ?? { ...NO_RELATION };
  }

  /** True if either has blocked the other. */
  async blockedEitherWay(a: string, b: string): Promise<boolean> {
    const hit = await this.prisma.userBlock.findFirst({
      where: {
        kind: 'BLOCK',
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { blockerId: true },
    });
    return !!hit;
  }

  /**
   * Looks a person up for an action by `viewerId`. Someone who does not exist, is
   * not active, or has blocked the viewer is simply "not found": a block must not
   * be discoverable by trying things.
   */
  async requireReachable(viewerId: string, targetId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        username: true,
        status: true,
        profile: { select: { displayName: true, isPrivate: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE') throw Errors.notFound('User');
    if (viewerId !== targetId) {
      const blockedBy = await this.prisma.userBlock.findFirst({
        where: { blockerId: targetId, blockedId: viewerId, kind: 'BLOCK' },
        select: { blockerId: true },
      });
      if (blockedBy) throw Errors.notFound('User');
    }
    return user;
  }
}
