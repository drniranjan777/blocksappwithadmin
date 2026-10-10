import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Errors, type FieldIssue } from '../../common/errors/app-error.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { SystemSettingsService } from '../../common/settings/system-settings.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { MediaViews } from '../shared/media-views.js';
import { listedProfile } from '../shared/listed-profile.js';
import { MentionsService } from '../shared/mentions.service.js';
import { RelationshipsService } from '../shared/relationships.service.js';
import { cleanText } from '../shared/text.js';
import { postVisibleTo } from '../shared/visibility.js';
import type { CreatePostDto, UpdatePostDto } from './posts.dto.js';
import {
  type PostRow,
  type PostView,
  type ViewerState,
  postInclude,
  toPostView,
} from './post-view.js';
import { screenText } from './text-safety.js';
import { MAX_HASHTAGS, MAX_MENTIONS, extractHashtags, extractMentions } from './text-parsing.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

/** More than this in an hour is a script, not a person. */
export const POSTS_PER_HOUR = 30;

/** Setting key: an array of terms that send a post to review before it is public. */
export const BLOCKED_TERMS_SETTING = 'moderation.blocked_terms';

/**
 * Publishing text and photo posts.
 *
 * The server owns everything that is not an editorial choice: the reach level
 * and counters (the Reach Engine and the engagement endpoints set them), the
 * moderation state, the location (taken from the author's profile, so reach
 * cannot be gamed by claiming another place), and the time. A post whose text
 * the first-pass screen flags, or whose photos have not been cleared yet, is
 * saved but shown only to its author until a person reviews it.
 */
@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relationships: RelationshipsService,
    private readonly media: MediaViews,
    private readonly mentions: MentionsService,
    private readonly settings: SystemSettingsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  // ----------------------------------------------------------------- create --

  async create(userId: string, dto: CreatePostDto, idempotencyKey?: string): Promise<PostView> {
    return this.idempotency.run(
      { scope: `post.create:${userId}`, key: idempotencyKey, request: dto },
      () => this.createNow(userId, dto),
    );
  }

  private async createNow(userId: string, dto: CreatePostDto): Promise<PostView> {
    const caption = cleanText(dto.caption);
    const mediaIds = dto.mediaIds ?? [];
    const issues: FieldIssue[] = [];

    if (dto.type === 'TEXT') {
      if (caption.length === 0) issues.push({ field: 'caption', reasons: ['required'] });
      if (mediaIds.length > 0)
        issues.push({ field: 'mediaIds', reasons: ['not_allowed_on_text_post'] });
    } else if (mediaIds.length === 0) {
      issues.push({ field: 'mediaIds', reasons: ['required'] });
    }
    const hashtags = extractHashtags(caption);
    const mentionNames = extractMentions(caption);
    if (hashtags.length > MAX_HASHTAGS)
      issues.push({ field: 'caption', reasons: ['too_many_hashtags'] });
    if (mentionNames.length > MAX_MENTIONS)
      issues.push({ field: 'caption', reasons: ['too_many_mentions'] });
    if (issues.length) throw Errors.validation(issues);

    const author = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        status: true,
        profile: { select: { country: true, state: true, district: true, city: true } },
      },
    });
    if (author.status !== 'ACTIVE') {
      throw Errors.forbidden('Cancel the scheduled account deletion to post.');
    }

    // Posting as a page: it must be the poster's own, and published.
    if (dto.businessPageId) {
      const page = await this.prisma.businessPage.findFirst({
        where: { id: dto.businessPageId, ownerId: userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!page) throw Errors.validation([{ field: 'businessPageId', reasons: ['not_available'] }]);
    }

    const recent = await this.prisma.post.count({
      where: { authorId: userId, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= POSTS_PER_HOUR) throw Errors.rateLimited(3600);

    const assets = await this.loadAssets(userId, mediaIds);
    const mentionedUserIds = await this.resolveMentions(userId, mentionNames);

    const blocked = await this.settings.get<string[]>(BLOCKED_TERMS_SETTING, []);
    const screening = screenText(caption, blocked);
    const mediaCleared = assets.every((a) => a.moderationStatus === 'APPROVED');
    const moderationStatus = screening.clean && mediaCleared ? 'APPROVED' : 'PENDING';

    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          authorId: userId,
          businessPageId: dto.businessPageId ?? null,
          type: dto.type,
          caption,
          visibility: dto.visibility ?? 'PUBLIC',
          hashtags,
          mentionedUserIds,
          country: author.profile?.country ?? 'IN',
          state: author.profile?.state ?? null,
          district: author.profile?.district ?? null,
          city: author.profile?.city ?? null,
          label: dto.label ?? 'ORIGINAL',
          moderationStatus,
          allowComments: dto.allowComments ?? true,
          allowSharing: dto.allowSharing ?? true,
          media: { create: mediaIds.map((id, position) => ({ mediaAssetId: id, position })) },
        },
        select: { id: true },
      });
      await tx.profile.update({ where: { userId }, data: { postsCount: { increment: 1 } } });
      return created;
    });

    if (moderationStatus === 'APPROVED') {
      await this.notifyMentions(userId, post.id, dto.visibility ?? 'PUBLIC', mentionedUserIds);
    }
    return this.get(userId, post.id);
  }

  private async loadAssets(userId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        id: { in: ids },
        ownerId: userId,
        kind: 'IMAGE',
        purpose: 'POST_IMAGE',
        status: 'READY',
        deletedAt: null,
        moderationStatus: { in: ['APPROVED', 'PENDING'] },
        postLinks: { none: {} },
      },
      select: { id: true, moderationStatus: true },
    });
    // Someone else's, still processing, already used or the wrong kind: all the same answer.
    if (assets.length !== new Set(ids).size) {
      throw Errors.validation([{ field: 'mediaIds', reasons: ['not_available'] }]);
    }
    return assets;
  }

  private resolveMentions(authorId: string, names: string[]): Promise<string[]> {
    return this.mentions.resolve(authorId, names);
  }

  /** After a held post is approved: tell the people it mentions (they were not told while it was held). */
  async announceApproved(postId: string): Promise<void> {
    const p = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, visibility: true, mentionedUserIds: true },
    });
    if (p) await this.notifyMentions(p.authorId, postId, p.visibility, p.mentionedUserIds);
  }

  /** Tells mentioned people, but only those who could actually open the post. */
  private notifyMentions(
    authorId: string,
    postId: string,
    visibility: string,
    mentioned: string[],
  ): Promise<void> {
    return this.mentions.announce({ kind: 'post', id: postId, authorId, visibility, mentioned });
  }

  // ------------------------------------------------------------------- read --

  async get(viewerId: string, id: string): Promise<PostView> {
    const row = await this.prisma.post.findFirst({
      where: { AND: [{ id }, postVisibleTo(viewerId)] },
      include: postInclude,
    });
    // Missing, deleted, held for review, private, or from someone who blocked you: all "not found".
    if (!row) throw Errors.notFound('Post');
    return (await this.hydrate(viewerId, [row]))[0] as PostView;
  }

  /** Posts into what the client shows, with the viewer's likes and saves fetched in two queries for the whole page. */
  async hydrate(viewerId: string, rows: PostRow[]): Promise<PostView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [likes, saves] = await Promise.all([
      this.prisma.like.findMany({
        where: { userId: viewerId, postId: { in: ids } },
        select: { postId: true },
      }),
      this.prisma.save.findMany({
        where: { userId: viewerId, postId: { in: ids } },
        select: { postId: true },
      }),
    ]);
    const state: ViewerState = {
      liked: new Set(likes.map((l) => l.postId as string)),
      saved: new Set(saves.map((s) => s.postId as string)),
    };
    return rows.map((r) => toPostView(r, viewerId, state, this.media));
  }

  /** A person's posts, as the viewer is allowed to see them. */
  async listByUser(
    viewerId: string,
    ref: string,
    q: {
      cursor?: string | undefined;
      limit?: number | undefined;
      type?: 'TEXT' | 'PHOTO' | undefined;
    },
  ) {
    const target = await listedProfile(this.prisma, this.relationships, viewerId, ref);

    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.post.findMany({
      where: {
        AND: [
          { authorId: target.id, ...(q.type ? { type: q.type } : {}) },
          postVisibleTo(viewerId),
          ...(after
            ? [
                {
                  OR: [
                    { publishedAt: { lt: new Date(after.t) } },
                    { publishedAt: new Date(after.t), id: { lt: after.id } },
                  ],
                } satisfies Prisma.PostWhereInput,
              ]
            : []),
        ],
      },
      include: postInclude,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const views = await this.hydrate(viewerId, rows.slice(0, limit));
    const byId = new Map(views.map((v) => [v.id, v]));
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.publishedAt.toISOString(), id: r.id }),
      (r) => byId.get(r.id) as PostView,
    );
  }

  // ----------------------------------------------------------------- change --

  async update(userId: string, id: string, dto: UpdatePostDto): Promise<PostView> {
    const post = await this.prisma.post.findFirst({
      where: { id, authorId: userId, deletedAt: null },
    });
    if (!post) throw Errors.notFound('Post');
    if (post.moderationStatus === 'REMOVED' || post.moderationStatus === 'RESTRICTED') {
      throw Errors.forbidden(
        'This post can no longer be edited. You can appeal the decision instead.',
      );
    }

    const data: Prisma.PostUpdateInput = {};
    let demote = false;
    if (dto.caption !== undefined) {
      const caption = cleanText(dto.caption);
      if (post.type === 'TEXT' && caption.length === 0) {
        throw Errors.validation([{ field: 'caption', reasons: ['required'] }]);
      }
      const hashtags = extractHashtags(caption);
      const names = extractMentions(caption);
      if (hashtags.length > MAX_HASHTAGS) {
        throw Errors.validation([{ field: 'caption', reasons: ['too_many_hashtags'] }]);
      }
      if (names.length > MAX_MENTIONS) {
        throw Errors.validation([{ field: 'caption', reasons: ['too_many_mentions'] }]);
      }
      if (caption !== post.caption) {
        const blocked = await this.settings.get<string[]>(BLOCKED_TERMS_SETTING, []);
        demote = !screenText(caption, blocked).clean;
        data.caption = caption;
        data.hashtags = hashtags;
        data.mentionedUserIds = await this.resolveMentions(userId, names);
        data.editedAt = new Date();
      }
    }
    if (dto.visibility !== undefined) data.visibility = dto.visibility;
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.allowComments !== undefined) data.allowComments = dto.allowComments;
    if (dto.allowSharing !== undefined) data.allowSharing = dto.allowSharing;
    // An edit can send an approved post back to review. It can never approve one.
    if (demote && post.moderationStatus === 'APPROVED') data.moderationStatus = 'PENDING';

    await this.prisma.post.update({ where: { id }, data });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const removed = await this.prisma.$transaction(async (tx) => {
      const res = await tx.post.updateMany({
        where: { id, authorId: userId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (res.count === 1) {
        await tx.profile.update({ where: { userId }, data: { postsCount: { increment: -1 } } });
      }
      return res.count === 1;
    });
    if (removed) return;
    // Already gone is fine for the author; someone else's post is "not found".
    const mine = await this.prisma.post.count({ where: { id, authorId: userId } });
    if (mine === 0) throw Errors.notFound('Post');
  }
}
