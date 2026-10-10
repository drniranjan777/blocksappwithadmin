import { Injectable } from '@nestjs/common';
import { Errors, type FieldIssue } from '../../common/errors/app-error.js';
import { isUuid } from '../../common/ids.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { canonicalState } from '../shared/geo.js';
import { MediaViews, mediaSelect } from '../shared/media-views.js';
import { type Relation, RelationshipsService } from '../shared/relationships.service.js';
import { cleanLine, cleanText, cleanUrl } from '../shared/text.js';
import type { UpdateProfileDto } from './profiles.dto.js';

const profileSelect = {
  id: true,
  username: true,
  status: true,
  accountType: true,
  createdAt: true,
  profile: {
    select: {
      displayName: true,
      bio: true,
      websiteUrl: true,
      country: true,
      state: true,
      district: true,
      city: true,
      gender: true,
      isPrivate: true,
      badge: true,
      followersCount: true,
      followingCount: true,
      postsCount: true,
      avatar: { select: mediaSelect },
    },
  },
} satisfies Prisma.UserSelect;

type Row = Prisma.UserGetPayload<{ select: typeof profileSelect }>;

/** Reading and editing profiles. */
@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationships: RelationshipsService,
    private readonly media: MediaViews,
  ) {}

  // ------------------------------------------------------------------ own --

  async mine(userId: string) {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: profileSelect,
    });
    return {
      ...this.shape(row),
      gender: row.profile?.gender ?? null,
      city: row.profile?.city ?? null,
    };
  }

  async update(userId: string, dto: UpdateProfileDto) {
    const data: Prisma.ProfileUpdateInput = {};
    const issues: FieldIssue[] = [];

    if (dto.displayName !== undefined) {
      const name = cleanLine(dto.displayName);
      if (name.length < 1) issues.push({ field: 'displayName', reasons: ['required'] });
      else data.displayName = name.slice(0, 80);
    }
    if (dto.bio !== undefined) {
      data.bio = dto.bio === null ? null : cleanText(dto.bio).slice(0, 300) || null;
    }
    if (dto.websiteUrl !== undefined) {
      if (dto.websiteUrl === null || dto.websiteUrl.trim() === '') data.websiteUrl = null;
      else {
        const url = cleanUrl(dto.websiteUrl);
        if (!url) issues.push({ field: 'websiteUrl', reasons: ['invalid_url'] });
        else data.websiteUrl = url;
      }
    }
    if (dto.state !== undefined) {
      if (dto.state === null || dto.state.trim() === '') {
        data.state = null;
        // A district without a state is meaningless.
        data.district = null;
      } else {
        const state = canonicalState(dto.state);
        if (!state) issues.push({ field: 'state', reasons: ['unknown_state'] });
        else data.state = state;
      }
    }
    if (dto.district !== undefined && !('district' in data)) {
      data.district = dto.district === null ? null : cleanLine(dto.district).slice(0, 80) || null;
    }
    if (dto.city !== undefined) {
      data.city = dto.city === null ? null : cleanLine(dto.city).slice(0, 80) || null;
    }
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.isPrivate !== undefined) data.isPrivate = dto.isPrivate;

    if (dto.avatarMediaId !== undefined) {
      if (dto.avatarMediaId === null) {
        data.avatar = { disconnect: true };
      } else {
        const asset = await this.prisma.mediaAsset.findFirst({
          where: {
            id: dto.avatarMediaId,
            ownerId: userId,
            kind: 'IMAGE',
            purpose: 'AVATAR',
            status: 'READY',
            moderationStatus: { in: ['APPROVED', 'PENDING'] },
            deletedAt: null,
          },
          select: { id: true, avatarFor: { select: { userId: true } } },
        });
        // Someone else's asset, one still processing, or the wrong kind all look the same.
        if (!asset || (asset.avatarFor && asset.avatarFor.userId !== userId)) {
          issues.push({ field: 'avatarMediaId', reasons: ['not_available'] });
        } else data.avatar = { connect: { id: asset.id } };
      }
    }
    if (issues.length) throw Errors.validation(issues);

    const before = await this.prisma.profile.findUniqueOrThrow({
      where: { userId },
      select: { isPrivate: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.profile.update({ where: { userId }, data });
      // Opening up an account lets in everyone who was waiting.
      if (before.isPrivate && dto.isPrivate === false) {
        const pending = await tx.follow.updateMany({
          where: { followeeId: userId, status: 'PENDING' },
          data: { status: 'ACCEPTED' },
        });
        if (pending.count > 0) {
          // Both sides are recounted from the rows rather than incremented, so the
          // counters cannot drift however many requests were waiting.
          await tx.$executeRaw`
            UPDATE profiles SET followers_count =
              (SELECT count(*) FROM follows WHERE followee_id = ${userId}::uuid AND status = 'ACCEPTED')
             WHERE user_id = ${userId}::uuid`;
          await tx.$executeRaw`
            UPDATE profiles p SET following_count =
              (SELECT count(*) FROM follows f WHERE f.follower_id = p.user_id AND f.status = 'ACCEPTED')
             WHERE p.user_id IN
               (SELECT follower_id FROM follows WHERE followee_id = ${userId}::uuid AND status = 'ACCEPTED')`;
        }
      }
    });
    return this.mine(userId);
  }

  // --------------------------------------------------------------- others --

  /** A profile by id or by username (with or without a leading @). */
  async view(viewerId: string, ref: string) {
    const cleaned = ref.trim().replace(/^@/, '').toLowerCase();
    const row = await this.prisma.user.findFirst({
      where: isUuid(cleaned) ? { id: cleaned } : { username: cleaned },
      select: profileSelect,
    });
    if (!row || row.status !== 'ACTIVE') throw Errors.notFound('Profile');

    const isMe = row.id === viewerId;
    const relation = isMe ? null : await this.relationships.with(viewerId, row.id);
    // Someone who blocked you does not exist, as far as you can tell.
    if (relation?.blockedBy) throw Errors.notFound('Profile');

    if (relation?.blocked) {
      // You blocked them: enough to show an "unblock" button, nothing else.
      const card = this.shape(row);
      return {
        id: card.id,
        username: card.username,
        displayName: card.displayName,
        avatarUrl: card.avatarUrl,
        badge: card.badge,
        isPrivate: card.isPrivate,
        isMe: false,
        relation,
        contentVisible: false,
        restricted: true as const,
      };
    }
    const contentVisible = isMe || !row.profile?.isPrivate || !!relation?.following;
    return { ...this.shape(row), isMe, relation, contentVisible, restricted: false as const };
  }

  private shape(row: Row) {
    const p = row.profile;
    return {
      id: row.id,
      username: row.username,
      displayName: p?.displayName ?? row.username,
      bio: p?.bio ?? null,
      websiteUrl: p?.websiteUrl ?? null,
      avatarUrl: this.media.avatarUrl(p?.avatar),
      badge: p?.badge ?? 'NONE',
      isPrivate: p?.isPrivate ?? false,
      accountType: row.accountType,
      location: {
        country: p?.country ?? 'IN',
        state: p?.state ?? null,
        district: p?.district ?? null,
      },
      counts: {
        followers: p?.followersCount ?? 0,
        following: p?.followingCount ?? 0,
        posts: p?.postsCount ?? 0,
      },
      joinedAt: row.createdAt.toISOString(),
    };
  }

  // --------------------------------------------------------------- search --

  /**
   * Finds people by part of a username or display name. Typeahead-sized: no
   * cursor, at most `limit` results. Blocked people (either way) and inactive
   * accounts never appear; exact and prefix matches come first, then the most
   * followed.
   */
  async search(viewerId: string, query: string, limit = 20) {
    const q = cleanLine(query).replace(/^@/, '').toLowerCase();
    if (q.length < 2) return [];
    const rows = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        id: { not: viewerId },
        blocksReceived: { none: { blockerId: viewerId, kind: 'BLOCK' } },
        blocksMade: { none: { blockedId: viewerId, kind: 'BLOCK' } },
        OR: [
          { username: { contains: q } },
          { profile: { displayName: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: profileSelect,
      orderBy: [{ profile: { followersCount: 'desc' } }, { id: 'asc' }],
      take: Math.min(limit, 20) * 3,
    });
    const rank = (r: Row): number =>
      r.username === q
        ? 0
        : r.username.startsWith(q)
          ? 1
          : (r.profile?.displayName ?? '').toLowerCase().startsWith(q)
            ? 2
            : 3;
    const relations = await this.relationships.between(
      viewerId,
      rows.map((r) => r.id),
    );
    return rows
      .map((r, i) => ({ r, i }))
      .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
      .slice(0, Math.min(limit, 20))
      .map(({ r }) => ({
        id: r.id,
        username: r.username,
        displayName: r.profile?.displayName ?? r.username,
        avatarUrl: this.media.avatarUrl(r.profile?.avatar),
        badge: r.profile?.badge ?? 'NONE',
        isPrivate: r.profile?.isPrivate ?? false,
        followers: r.profile?.followersCount ?? 0,
        relation: relations.get(r.id) as Relation,
      }));
  }
}
