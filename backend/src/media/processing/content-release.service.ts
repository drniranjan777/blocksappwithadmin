import { Injectable } from '@nestjs/common';
import { SystemSettingsService } from '../../common/settings/system-settings.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { BLOCKED_TERMS_SETTING, PostsService } from '../../social/posts/posts.service.js';
import { screenText } from '../../social/posts/text-safety.js';
import { MentionsService } from '../../social/shared/mentions.service.js';

/** Why a reel could not be made, in words a creator can act on. */
const REEL_FAILURE_REASONS: Record<string, string> = {
  CLIP_REFUSED: 'one of the clips did not pass our checks',
  CLIP_NOT_READY: 'one of the clips took too long to process',
  MUSIC_UNAVAILABLE: 'the music you chose can no longer be used',
  AUDIO_UNAVAILABLE: 'the sound you chose can no longer be used',
  INVALID_TRIM: 'one of the clips was trimmed to nothing',
  default: 'something went wrong while putting it together',
};

/**
 * What happens to a person's content when the decision about its media arrives.
 *
 * A post (or story) is saved straight away but held while its photos are being
 * checked. When the last one is cleared the content goes live, *if* its text is also
 * clean (a post held for its text needs a person, not just a cleared photo); when
 * one is refused the content is removed and its author told. Doing this in one place
 * means automated checks and a moderator's click lead to exactly the same outcome.
 *
 * A reel is the same story with more parts: it goes live when the video the server made from
 * the clips **and every clip it was made from** have been cleared (and its caption is clean).
 * If any one of them is refused, the reel is taken down, because the refused material is in it.
 */
@Injectable()
export class ContentReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly notifications: NotificationService,
    private readonly settings: SystemSettingsService,
    private readonly mentions: MentionsService,
  ) {}

  async onAssetModerated(assetId: string): Promise<void> {
    const blocked = await this.settings.get<string[]>(BLOCKED_TERMS_SETTING, []);
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { ownerId: true, moderationStatus: true, status: true },
    });
    if (!asset) return;
    const refused =
      asset.moderationStatus === 'REMOVED' ||
      asset.status === 'REJECTED' ||
      asset.status === 'FAILED';

    // --- posts ---------------------------------------------------------------------
    const posts = await this.prisma.post.findMany({
      where: {
        media: { some: { mediaAssetId: assetId } },
        deletedAt: null,
        moderationStatus: 'PENDING',
      },
      select: {
        id: true,
        authorId: true,
        caption: true,
        media: { select: { mediaAsset: { select: { moderationStatus: true, status: true } } } },
      },
    });
    for (const post of posts) {
      const states = post.media.map((m) => m.mediaAsset);
      if (
        refused ||
        states.some(
          (s) =>
            s.moderationStatus === 'REMOVED' || s.status === 'REJECTED' || s.status === 'FAILED',
        )
      ) {
        await this.prisma.post.update({
          where: { id: post.id },
          data: { moderationStatus: 'REMOVED' },
        });
        await this.tell(post.authorId, 'post', post.id);
      } else if (
        states.every((s) => s.moderationStatus === 'APPROVED') &&
        screenText(post.caption, blocked).clean
      ) {
        const released = await this.prisma.post.updateMany({
          where: { id: post.id, moderationStatus: 'PENDING' },
          data: { moderationStatus: 'APPROVED' },
        });
        if (released.count === 1) await this.posts.announceApproved(post.id);
      }
    }

    // --- stories ---------------------------------------------------------------------
    const stories = await this.prisma.story.findMany({
      where: { mediaAssetId: assetId, deletedAt: null, moderationStatus: 'PENDING' },
      select: { id: true, authorId: true, caption: true },
    });
    for (const story of stories) {
      if (refused) {
        await this.prisma.story.update({
          where: { id: story.id },
          data: { moderationStatus: 'REMOVED' },
        });
        await this.tell(story.authorId, 'story', story.id);
      } else if (
        asset.moderationStatus === 'APPROVED' &&
        (!story.caption || screenText(story.caption, blocked).clean)
      ) {
        await this.prisma.story.updateMany({
          where: { id: story.id, moderationStatus: 'PENDING' },
          data: { moderationStatus: 'APPROVED' },
        });
      }
    }

    // --- reels: the finished video, or any clip or cover it uses -------------------------------
    if (refused) {
      // A refused cover is just dropped; the reel can still go out with a still from its video.
      await this.prisma.reel.updateMany({
        where: { coverMediaId: assetId },
        data: { coverMediaId: null },
      });
    }
    const reels = await this.prisma.reel.findMany({
      where: {
        deletedAt: null,
        publishStatus: { in: ['PROCESSING', 'MODERATION', 'PUBLISHED'] },
        OR: [{ mediaAssetId: assetId }, { clips: { some: { mediaAssetId: assetId } } }],
      },
      select: { id: true },
    });
    for (const r of reels) await this.settleReel(r.id);

    // --- profile pictures ---------------------------------------------------------------
    if (refused) {
      await this.prisma.profile.updateMany({
        where: { avatarMediaId: assetId },
        data: { avatarMediaId: null },
      });
    }
  }

  /**
   * The finished video of a reel is ready (transcoded). From here the reel waits only for
   * decisions, so it is "in moderation" and no longer "processing".
   */
  async onAssetReady(assetId: string): Promise<void> {
    const reels = await this.prisma.reel.findMany({
      where: { mediaAssetId: assetId, deletedAt: null, publishStatus: 'PROCESSING' },
      select: { id: true },
    });
    for (const r of reels) await this.settleReel(r.id);
  }

  /** Rendering could not be done: nothing is published, and the author is told why. */
  async failReel(reelId: string, code: string): Promise<void> {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      select: { authorId: true },
    });
    if (!reel) return;
    const res = await this.prisma.reel.updateMany({
      where: { id: reelId, deletedAt: null, publishStatus: { in: ['PROCESSING', 'MODERATION'] } },
      data: { publishStatus: 'FAILED', failureCode: code.slice(0, 60) },
    });
    if (res.count !== 1) return;
    await this.notifications
      .notify({
        userId: reel.authorId,
        type: 'SYSTEM',
        template: 'social_reel_failed',
        vars: { reason: REEL_FAILURE_REASONS[code] ?? REEL_FAILURE_REASONS['default'] ?? '' },
        severity: 'INFO',
        category: 'social',
        data: { reelId },
        dedupeKey: `failed:reel:${reelId}`,
      })
      .catch(() => undefined);
  }

  /**
   * Decides what a reel's state should be, from the state of everything it is made of.
   * Safe to call at any time and as often as needed: it only moves a reel forward.
   */
  private async settleReel(reelId: string): Promise<void> {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      include: {
        video: { select: { status: true, moderationStatus: true } },
        clips: {
          select: { mediaAsset: { select: { id: true, status: true, moderationStatus: true } } },
        },
        author: { select: { profile: { select: { displayName: true } } } },
      },
    });
    if (!reel || reel.deletedAt) return;
    if (reel.publishStatus === 'REMOVED' || reel.publishStatus === 'FAILED') return;

    const parts = [reel.video, ...reel.clips.map((c) => c.mediaAsset)].filter(
      (a): a is NonNullable<typeof a> => !!a,
    );
    const isRefused = (a: { status: string; moderationStatus: string }) =>
      a.moderationStatus === 'REMOVED' || ['REJECTED', 'FAILED', 'DELETED'].includes(a.status);

    // Something in it was refused: the reel comes down, wherever it had got to.
    if (parts.some(isRefused)) {
      const wasPublished = reel.publishStatus === 'PUBLISHED';
      const removed = await this.prisma.$transaction(async (tx) => {
        const res = await tx.reel.updateMany({
          where: { id: reel.id, deletedAt: null, publishStatus: { not: 'REMOVED' } },
          data: { publishStatus: 'REMOVED', moderationStatus: 'REMOVED' },
        });
        if (res.count !== 1) return false;
        if (wasPublished) await this.releaseCounters(tx, reel);
        await tx.originalAudio.updateMany({
          where: { sourceReelId: reel.id },
          data: { reusable: false },
        });
        return true;
      });
      if (removed) await this.tell(reel.authorId, 'reel', reel.id);
      return;
    }
    if (reel.publishStatus === 'PUBLISHED') return;
    // Still being rendered or transcoded: nothing to decide yet.
    if (!reel.video || reel.video.status !== 'READY') return;

    const blocked = await this.settings.get<string[]>(BLOCKED_TERMS_SETTING, []);
    const cleared = parts.every((a) => a.status === 'READY' && a.moderationStatus === 'APPROVED');
    if (cleared && screenText(reel.caption, blocked).clean) {
      await this.publishReel(reel);
    } else if (reel.publishStatus === 'PROCESSING') {
      await this.prisma.reel.updateMany({
        where: { id: reel.id, publishStatus: 'PROCESSING' },
        data: { publishStatus: 'MODERATION' },
      });
    }
  }

  private async publishReel(reel: {
    id: string;
    authorId: string;
    visibility: string;
    mentionedUserIds: string[];
    musicTrackId: string | null;
    reusedAudioId: string | null;
    durationMs: number;
    allowRemix: boolean;
    editMetadata: unknown;
    author: { profile: { displayName: string } | null };
  }): Promise<void> {
    const published = await this.prisma.$transaction(async (tx) => {
      const res = await tx.reel.updateMany({
        where: {
          id: reel.id,
          deletedAt: null,
          publishStatus: { in: ['PROCESSING', 'MODERATION'] },
        },
        data: { publishStatus: 'PUBLISHED', moderationStatus: 'APPROVED', publishedAt: new Date() },
      });
      if (res.count !== 1) return false;
      // Counters move in the same transaction as the state change they describe.
      if (reel.musicTrackId) {
        await tx.musicTrack.update({
          where: { id: reel.musicTrackId },
          data: { reelsCount: { increment: 1 } },
        });
      }
      if (reel.reusedAudioId) {
        await tx.originalAudio.update({
          where: { id: reel.reusedAudioId },
          data: { usesCount: { increment: 1 } },
        });
      }
      // A reel with its own sound (no track, no reused sound) makes that sound available to others.
      const own = (reel.editMetadata as { hasOwnSound?: boolean } | null)?.hasOwnSound === true;
      if (!reel.musicTrackId && !reel.reusedAudioId && own) {
        await tx.originalAudio.upsert({
          where: { sourceReelId: reel.id },
          create: {
            ownerId: reel.authorId,
            sourceReelId: reel.id,
            title: `Original audio · ${reel.author.profile?.displayName ?? 'creator'}`.slice(
              0,
              120,
            ),
            durationMs: reel.durationMs,
            reusable: reel.allowRemix,
          },
          update: {},
        });
      }
      return true;
    });
    if (published) {
      await this.mentions.announce({
        kind: 'reel',
        id: reel.id,
        authorId: reel.authorId,
        visibility: reel.visibility,
        mentioned: reel.mentionedUserIds,
      });
    }
  }

  /** Undoes what publishing counted, when a published reel is taken down. */
  private async releaseCounters(
    tx: Pick<Prisma.TransactionClient, 'musicTrack' | 'originalAudio'>,
    reel: { musicTrackId: string | null; reusedAudioId: string | null },
  ): Promise<void> {
    if (reel.musicTrackId) {
      await tx.musicTrack.updateMany({
        where: { id: reel.musicTrackId, reelsCount: { gt: 0 } },
        data: { reelsCount: { decrement: 1 } },
      });
    }
    if (reel.reusedAudioId) {
      await tx.originalAudio.updateMany({
        where: { id: reel.reusedAudioId, usesCount: { gt: 0 } },
        data: { usesCount: { decrement: 1 } },
      });
    }
  }

  private async tell(userId: string, target: string, id: string): Promise<void> {
    await this.notifications
      .notify({
        userId,
        type: 'MODERATION_DECISION',
        template: 'social_content_removed',
        vars: { target },
        severity: 'INFO',
        category: 'social',
        data: { [`${target}Id`]: id },
        dedupeKey: `removed:${target}:${id}`,
      })
      .catch(() => undefined);
  }
}
