import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Errors, type FieldIssue } from '../../common/errors/app-error.js';
import { isUuid } from '../../common/ids.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { SystemSettingsService } from '../../common/settings/system-settings.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { BLOCKED_TERMS_SETTING } from '../posts/posts.service.js';
import { screenText } from '../posts/text-safety.js';
import { MediaViews, mediaSelect } from '../shared/media-views.js';
import { RelationshipsService } from '../shared/relationships.service.js';
import { cleanLine } from '../shared/text.js';
import { type UserCard, toUserCard, userCardSelect } from '../shared/user-card.js';
import { notMutedBy, storyVisibleTo } from '../shared/visibility.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

/** Setting key: how many hours a story stays up. */
export const STORY_TTL_SETTING = 'stories.ttl_hours';
const DEFAULT_TTL_HOURS = 24;
/** More than this in a day is a script. */
export const STORIES_PER_DAY = 100;

const storyInclude = {
  mediaAsset: { select: mediaSelect },
  author: { select: userCardSelect },
} satisfies Prisma.StoryInclude;
type StoryRow = Prisma.StoryGetPayload<{ include: typeof storyInclude }>;

export interface StoryView {
  id: string;
  media: ReturnType<MediaViews['view']>;
  caption: string | null;
  visibility: string;
  author: UserCard;
  viewsCount?: number;
  viewer: { seen: boolean; isAuthor: boolean };
  moderation?: { status: string; held: boolean };
  createdAt: string;
  expiresAt: string;
}

/**
 * Stories: a photo or short video that disappears.
 *
 * "Gone" is enforced when reading (`expires_at > now()` is part of the shared
 * visibility filter), not by a clean-up job: a story is invisible the moment it
 * expires, even if the job is late. The rows are kept a while for the author's
 * insights and moderation and removed later by housekeeping.
 */
@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationships: RelationshipsService,
    private readonly media: MediaViews,
    private readonly settings: SystemSettingsService,
  ) {}

  // ------------------------------------------------------------------ create --

  async create(
    userId: string,
    input: {
      mediaId: string;
      caption?: string | undefined;
      visibility?: 'PUBLIC' | 'FOLLOWERS' | 'CLOSE_FRIENDS' | undefined;
    },
  ): Promise<StoryView> {
    const caption = input.caption === undefined ? null : cleanLine(input.caption) || null;
    const issues: FieldIssue[] = [];
    if (caption && caption.length > 200) issues.push({ field: 'caption', reasons: ['too_long'] });
    if (issues.length) throw Errors.validation(issues);

    const author = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true },
    });
    if (author.status !== 'ACTIVE')
      throw Errors.forbidden('Cancel the scheduled account deletion to post.');

    const today = await this.prisma.story.count({
      where: { authorId: userId, createdAt: { gt: new Date(Date.now() - 24 * 3_600_000) } },
    });
    if (today >= STORIES_PER_DAY) throw Errors.rateLimited(3600);

    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: input.mediaId,
        ownerId: userId,
        purpose: 'STORY',
        kind: { in: ['IMAGE', 'VIDEO'] },
        status: 'READY',
        deletedAt: null,
        moderationStatus: { in: ['APPROVED', 'PENDING'] },
        stories: { none: {} },
      },
      select: { id: true, moderationStatus: true },
    });
    if (!asset) throw Errors.validation([{ field: 'mediaId', reasons: ['not_available'] }]);

    const blocked = await this.settings.get<string[]>(BLOCKED_TERMS_SETTING, []);
    const cleanText = !caption || screenText(caption, blocked).clean;
    const hours = await this.settings.get<number>(STORY_TTL_SETTING, DEFAULT_TTL_HOURS);
    const story = await this.prisma.story.create({
      data: {
        authorId: userId,
        mediaAssetId: asset.id,
        caption,
        visibility: input.visibility ?? 'FOLLOWERS',
        moderationStatus:
          cleanText && asset.moderationStatus === 'APPROVED' ? 'APPROVED' : 'PENDING',
        expiresAt: new Date(Date.now() + Math.min(Math.max(hours, 1), 48) * 3_600_000),
      },
      include: storyInclude,
    });
    return this.toView(story, userId, new Set());
  }

  // -------------------------------------------------------------------- read --

  /** The stories bar: people with something to watch, unseen first. */
  async tray(viewerId: string) {
    const stories = await this.prisma.story.findMany({
      where: {
        AND: [
          storyVisibleTo(viewerId),
          { author: notMutedBy(viewerId) },
          {
            OR: [
              { authorId: viewerId },
              { author: { followers: { some: { followerId: viewerId, status: 'ACCEPTED' } } } },
            ],
          },
        ],
      },
      include: storyInclude,
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    const seen = await this.seenSet(
      viewerId,
      stories.map((s) => s.id),
    );

    const byAuthor = new Map<string, StoryRow[]>();
    for (const s of stories) byAuthor.set(s.authorId, [...(byAuthor.get(s.authorId) ?? []), s]);
    const rows = [...byAuthor.entries()].map(([authorId, list]) => {
      const author = (list[0] as StoryRow).author;
      return {
        author: toUserCard(author, this.media),
        isMe: authorId === viewerId,
        count: list.length,
        hasUnseen: list.some((s) => !seen.has(s.id)),
        latestAt: (list[list.length - 1] as StoryRow).createdAt.toISOString(),
      };
    });
    // Me first, then people with something new, then the most recent.
    return rows
      .sort(
        (a, b) =>
          Number(b.isMe) - Number(a.isMe) ||
          Number(b.hasUnseen) - Number(a.hasUnseen) ||
          b.latestAt.localeCompare(a.latestAt),
      )
      .slice(0, 50);
  }

  /** One person's stories, oldest first so they play in order. */
  async ofUser(viewerId: string, ref: string): Promise<StoryView[]> {
    const cleaned = ref.trim().replace(/^@/, '').toLowerCase();
    const target = await this.prisma.user.findFirst({
      where: isUuid(cleaned) ? { id: cleaned } : { username: cleaned },
      select: { id: true, status: true },
    });
    if (!target || target.status !== 'ACTIVE') throw Errors.notFound('Profile');
    const rel = await this.relationships.with(viewerId, target.id);
    if (rel.blockedBy || rel.blocked) throw Errors.notFound('Profile');

    const stories = await this.prisma.story.findMany({
      where: { AND: [{ authorId: target.id }, storyVisibleTo(viewerId)] },
      include: storyInclude,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    const seen = await this.seenSet(
      viewerId,
      stories.map((s) => s.id),
    );
    return stories.map((s) => this.toView(s, viewerId, seen));
  }

  private async seenSet(viewerId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.storyView.findMany({
      where: { viewerId, storyId: { in: ids } },
      select: { storyId: true },
    });
    return new Set(rows.map((r) => r.storyId));
  }

  private toView(s: StoryRow, viewerId: string, seen: Set<string>): StoryView {
    const isAuthor = s.authorId === viewerId;
    return {
      id: s.id,
      media: this.media.view(s.mediaAsset),
      caption: s.caption,
      visibility: s.visibility,
      author: toUserCard(s.author, this.media),
      // Only the author sees how many have watched.
      ...(isAuthor ? { viewsCount: s.viewsCount } : {}),
      viewer: { seen: seen.has(s.id), isAuthor },
      ...(isAuthor
        ? { moderation: { status: s.moderationStatus, held: s.moderationStatus !== 'APPROVED' } }
        : {}),
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    };
  }

  // -------------------------------------------------------------- views, delete --

  /** Marks a story as watched. Your own, and repeats, count for nothing. */
  async view(viewerId: string, storyId: string): Promise<{ seen: true }> {
    const story = await this.prisma.story.findFirst({
      where: { AND: [{ id: storyId }, storyVisibleTo(viewerId)] },
      select: { id: true, authorId: true },
    });
    if (!story) throw Errors.notFound('Story');
    if (story.authorId !== viewerId) {
      await this.prisma.$transaction(async (tx) => {
        const res = await tx.storyView.createMany({
          data: [{ storyId, viewerId }],
          skipDuplicates: true,
        });
        if (res.count === 1) {
          await tx.story.update({ where: { id: storyId }, data: { viewsCount: { increment: 1 } } });
        }
      });
    }
    return { seen: true };
  }

  /** Who watched my story. */
  async viewers(
    userId: string,
    storyId: string,
    q: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    const story = await this.prisma.story.findFirst({
      where: { id: storyId, authorId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!story) throw Errors.notFound('Story');
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.storyView.findMany({
      where: {
        storyId,
        viewer: {
          status: 'ACTIVE',
          blocksReceived: { none: { blockerId: userId, kind: 'BLOCK' } },
          blocksMade: { none: { blockedId: userId, kind: 'BLOCK' } },
        },
        ...(after
          ? {
              OR: [
                { viewedAt: { lt: new Date(after.t) } },
                { viewedAt: new Date(after.t), viewerId: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ viewedAt: 'desc' }, { viewerId: 'desc' }],
      take: limit + 1,
      select: { viewedAt: true, viewerId: true, viewer: { select: userCardSelect } },
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.viewedAt.toISOString(), id: r.viewerId }),
      (r) => ({ ...toUserCard(r.viewer, this.media), viewedAt: r.viewedAt.toISOString() }),
    );
  }

  async remove(userId: string, storyId: string): Promise<void> {
    const res = await this.prisma.story.updateMany({
      where: { id: storyId, authorId: userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) {
      const mine = await this.prisma.story.count({ where: { id: storyId, authorId: userId } });
      if (mine === 0) throw Errors.notFound('Story');
    }
  }

  /** Housekeeping: forget stories that expired more than a week ago. Run by the worker. */
  async purgeExpired(olderThanDays = 7): Promise<number> {
    const res = await this.prisma.story.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - olderThanDays * 86_400_000) } },
    });
    return res.count;
  }
}
