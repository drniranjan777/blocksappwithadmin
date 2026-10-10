import { Injectable } from '@nestjs/common';
import { Errors, type FieldIssue } from '../common/errors/app-error.js';
import { IdempotencyService } from '../common/idempotency/idempotency.service.js';
import { SystemSettingsService } from '../common/settings/system-settings.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { MediaAsset, Prisma } from '../generated/prisma/client.js';
import { MediaJobsService } from '../media/jobs/media-jobs.service.js';
import { MusicService } from '../music/music.service.js';
import { BLOCKED_TERMS_SETTING } from '../social/posts/posts.service.js';
import { screenText } from '../social/posts/text-safety.js';
import {
  MAX_HASHTAGS,
  MAX_MENTIONS,
  extractHashtags,
  extractMentions,
} from '../social/posts/text-parsing.js';
import { ReelReader } from '../social/reels/reel-reader.service.js';
import type { ReelView } from '../social/reels/reel-view.js';
import { MentionsService } from '../social/shared/mentions.service.js';
import { cleanLine, cleanText } from '../social/shared/text.js';
import { reelVisibleTo } from '../social/shared/visibility.js';
import {
  MAX_REEL_MS,
  MIN_CLIP_MS,
  MIN_REEL_MS,
  PHOTO_DEFAULT_MS,
  PHOTO_MAX_MS,
  PHOTO_MIN_MS,
  type CreateReelDto,
  type OverlayDto,
  type ReelClipDto,
  type UpdateReelDto,
} from './reels.dto.js';
import { NEUTRAL } from './reel-looks.js';

/** More than this in an hour is a script, not a person. */
export const REELS_PER_HOUR = 10;
/** How much of the sound under the clips the music takes, unless the creator says otherwise. */
export const DEFAULT_MUSIC_VOLUME = 0.8;
/** A trim may run this far past the length the server measured (containers round their lengths). */
const TRIM_SLACK_MS = 250;
const STICKER_ID = /^[a-z0-9_-]{1,40}$/;

type Asset = Pick<MediaAsset, 'id' | 'kind' | 'durationMs' | 'status' | 'moderationStatus'>;

/**
 * Making, editing and removing reels.
 *
 * A reel is described, not uploaded: the creator uploads clips and photos on their own (each
 * checked like any upload), then sends the edit (which parts, in what order, with which looks,
 * over which music). The server checks every part of that description, saves it, and queues the
 * rendering. What comes out is a video the server made itself, so nothing about the final file
 * (its codec, length, size, metadata) is in a client's hands.
 *
 * Everything that is not an editorial choice belongs to the server: reach level, counters,
 * moderation state, location (from the author's profile), timestamps, and whether the music may
 * be used (checked here against the viewer's country and the licence, and again when the video
 * is rendered).
 */
@Injectable()
export class ReelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: ReelReader,
    private readonly music: MusicService,
    private readonly jobs: MediaJobsService,
    private readonly mentions: MentionsService,
    private readonly settings: SystemSettingsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  // ----------------------------------------------------------------- create --

  create(userId: string, dto: CreateReelDto, idempotencyKey?: string): Promise<ReelView> {
    return this.idempotency.run(
      { scope: `reel.create:${userId}`, key: idempotencyKey, request: dto },
      () => this.createNow(userId, dto),
    );
  }

  private async createNow(userId: string, dto: CreateReelDto): Promise<ReelView> {
    const caption = cleanText(dto.caption);
    const hashtags = extractHashtags(caption);
    const mentionNames = extractMentions(caption);
    const issues: FieldIssue[] = [];
    if (hashtags.length > MAX_HASHTAGS)
      issues.push({ field: 'caption', reasons: ['too_many_hashtags'] });
    if (mentionNames.length > MAX_MENTIONS)
      issues.push({ field: 'caption', reasons: ['too_many_mentions'] });
    if (dto.musicTrackId && dto.reusedAudioId) {
      issues.push({ field: 'reusedAudioId', reasons: ['one_sound_only'] });
    }
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
    const recent = await this.prisma.reel.count({
      where: { authorId: userId, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= REELS_PER_HOUR) throw Errors.rateLimited(3600);

    // ---- the timeline
    const assets = await this.loadClipAssets(userId, dto.clips);
    const clips = dto.clips.map((c, i) => this.planClip(c, i, assets.get(c.mediaId) as Asset));
    const totalMs = clips.reduce((sum, c) => sum + (c.endMs - c.startMs), 0);
    if (totalMs < MIN_REEL_MS) {
      throw Errors.validation([{ field: 'clips', reasons: ['too_short'] }]);
    }
    if (totalMs > MAX_REEL_MS) {
      throw Errors.validation([{ field: 'clips', reasons: ['too_long'] }]);
    }
    const overlays = this.planOverlays(dto.overlays ?? [], totalMs);

    // ---- the sound
    const sound = await this.planSound(userId, dto, totalMs);
    const coverMediaId = await this.checkCover(userId, dto.coverMediaId);
    const mentionedUserIds = await this.mentions.resolve(userId, mentionNames);

    const firstAssetId = clips[0]?.mediaAssetId as string;
    const reel = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reel.create({
        data: {
          authorId: userId,
          caption,
          visibility: dto.visibility ?? 'PUBLIC',
          hashtags,
          mentionedUserIds,
          country: author.profile?.country ?? 'IN',
          state: author.profile?.state ?? null,
          district: author.profile?.district ?? null,
          city: author.profile?.city ?? null,
          durationMs: totalMs,
          clipCount: clips.length,
          label: dto.label ?? 'ORIGINAL',
          allowComments: dto.allowComments ?? true,
          allowRemix: dto.allowRemix ?? true,
          allowSharing: dto.allowSharing ?? true,
          coverMediaId,
          ...sound.columns,
          editMetadata: {
            version: 1,
            overlays,
            // What was asked for, kept even where the renderer does something simpler.
            transitions: dto.clips.map((c) => c.transitionId ?? 'none'),
            musicVolume: sound.volume,
          } as unknown as Prisma.InputJsonValue,
          clips: { create: clips },
        },
        select: { id: true },
      });
      // Queued in the same transaction, so a saved reel always has its rendering queued and a
      // failed save leaves nothing behind. The job hangs off the first clip.
      await tx.mediaJob.create({
        data: {
          assetId: firstAssetId,
          type: 'COMPOSE',
          maxAttempts: 4,
          payload: { reelId: created.id },
        },
      });
      return created;
    });
    return this.reader.get(userId, reel.id);
  }

  /** The clips and photos named, if they are the caller's, are for reels, and have been looked at. */
  private async loadClipAssets(userId: string, clips: ReelClipDto[]): Promise<Map<string, Asset>> {
    const ids = [...new Set(clips.map((c) => c.mediaId))];
    const found = await this.prisma.mediaAsset.findMany({
      where: {
        id: { in: ids },
        ownerId: userId,
        purpose: 'REEL_CLIP',
        deletedAt: null,
        // Validated at least: the length of a video is known from then on.
        status: { in: ['PROCESSING', 'READY'] },
        moderationStatus: { not: 'REMOVED' },
      },
      select: { id: true, kind: true, durationMs: true, status: true, moderationStatus: true },
    });
    const byId = new Map(found.map((a) => [a.id, a]));
    // Someone else's, not uploaded yet, refused, or the wrong purpose: all the same answer.
    const issues = clips.flatMap((c, i) =>
      byId.has(c.mediaId) ? [] : [{ field: `clips.${i}.mediaId`, reasons: ['not_available'] }],
    );
    if (issues.length) throw Errors.validation(issues);
    return byId;
  }

  /** One clip, checked against the file it points at. */
  private planClip(c: ReelClipDto, index: number, asset: Asset) {
    const at = (field: string, reason: string) =>
      Errors.validation([{ field: `clips.${index}.${field}`, reasons: [reason] }]);
    const isPhoto = asset.kind === 'IMAGE';
    let startMs: number;
    let endMs: number;
    if (isPhoto) {
      if (c.startMs) throw at('startMs', 'not_allowed_for_photo');
      startMs = 0;
      endMs = c.endMs ?? PHOTO_DEFAULT_MS;
      if (endMs < PHOTO_MIN_MS || endMs > PHOTO_MAX_MS) throw at('endMs', 'out_of_range');
    } else if (asset.kind === 'VIDEO') {
      const sourceMs = asset.durationMs ?? 0;
      startMs = c.startMs ?? 0;
      endMs = Math.min(c.endMs ?? sourceMs, sourceMs);
      if (c.endMs && c.endMs > sourceMs + TRIM_SLACK_MS) throw at('endMs', 'beyond_clip');
      if (endMs - startMs < MIN_CLIP_MS) throw at('endMs', 'too_short');
    } else {
      throw at('mediaId', 'not_available');
    }
    const adjustments = { ...NEUTRAL, ...c.adjustments };
    const adjusted = Object.entries(adjustments).some(
      ([k, v]) => v !== NEUTRAL[k as keyof typeof NEUTRAL],
    );
    return {
      mediaAssetId: asset.id,
      position: index,
      isPhoto,
      startMs,
      endMs,
      volume: c.volume ?? 1,
      filterId: c.filterId && c.filterId !== 'original' ? c.filterId : null,
      filterIntensity: c.filterIntensity ?? 1,
      transitionId: c.transitionId && c.transitionId !== 'none' ? c.transitionId : null,
      adjustments: adjusted ? (adjustments as Prisma.InputJsonValue) : undefined,
    };
  }

  private planOverlays(overlays: OverlayDto[], totalMs: number) {
    return overlays.map((o, i) => {
      const at = (field: string, reason: string) =>
        Errors.validation([{ field: `overlays.${i}.${field}`, reasons: [reason] }]);
      if (o.endMs <= o.startMs) throw at('endMs', 'before_start');
      if (o.startMs >= totalMs) throw at('startMs', 'after_end');
      const content = o.type === 'text' ? cleanText(o.content) : cleanLine(o.content);
      if (!content) throw at('content', 'required');
      if (o.type === 'sticker' && !STICKER_ID.test(content)) throw at('content', 'invalid');
      return {
        type: o.type,
        content,
        startMs: o.startMs,
        endMs: Math.min(o.endMs, totalMs),
        x: o.x,
        y: o.y,
        scale: o.scale ?? 1,
        rotation: o.rotation ?? 0,
        ...(o.style ? { style: { ...o.style } } : {}),
      };
    });
  }

  /** The music or reused sound, if any, checked and turned into the columns to store. */
  private async planSound(userId: string, dto: CreateReelDto, totalMs: number) {
    const volume = dto.musicVolume ?? DEFAULT_MUSIC_VOLUME;
    const window = (sourceMs: number, field: string) => {
      const startMs = dto.musicStartMs ?? 0;
      const endMs = Math.min(dto.musicEndMs ?? startMs + totalMs, sourceMs);
      if (startMs >= sourceMs || endMs - startMs < 1000) {
        throw Errors.validation([{ field, reasons: ['out_of_range'] }]);
      }
      return { musicStartMs: startMs, musicEndMs: endMs };
    };

    if (dto.musicTrackId) {
      // The one check that decides whether this person may use this track: country, use, licence.
      const track = await this.music.assertUsable(userId, dto.musicTrackId, 'REEL');
      return {
        volume,
        columns: { musicTrackId: track.id, ...window(track.durationMs, 'musicStartMs') },
      };
    }
    if (dto.reusedAudioId) {
      const audio = await this.prisma.originalAudio.findFirst({
        where: {
          id: dto.reusedAudioId,
          reusable: true,
          // Reusable only while the reel it came from can still be seen by this person.
          sourceReel: {
            AND: [reelVisibleTo(userId), { publishStatus: 'PUBLISHED', allowRemix: true }],
          },
        },
        select: { id: true, durationMs: true },
      });
      if (!audio) throw Errors.validation([{ field: 'reusedAudioId', reasons: ['not_available'] }]);
      return {
        volume,
        columns: { reusedAudioId: audio.id, ...window(audio.durationMs, 'musicStartMs') },
      };
    }
    if (
      dto.musicStartMs !== undefined ||
      dto.musicEndMs !== undefined ||
      dto.musicVolume !== undefined
    ) {
      throw Errors.validation([
        { field: 'musicTrackId', reasons: ['required_for_music_settings'] },
      ]);
    }
    return { volume, columns: {} };
  }

  private async checkCover(userId: string, id: string | undefined): Promise<string | null> {
    if (!id) return null;
    const cover = await this.prisma.mediaAsset.findFirst({
      where: {
        id,
        ownerId: userId,
        purpose: 'REEL_COVER',
        kind: 'IMAGE',
        deletedAt: null,
        status: { in: ['PROCESSING', 'READY'] },
        moderationStatus: { not: 'REMOVED' },
        reelCovers: { none: {} },
      },
      select: { id: true },
    });
    if (!cover) throw Errors.validation([{ field: 'coverMediaId', reasons: ['not_available'] }]);
    return cover.id;
  }

  // ----------------------------------------------------------------- change --

  async update(userId: string, id: string, dto: UpdateReelDto): Promise<ReelView> {
    const reel = await this.prisma.reel.findFirst({
      where: { id, authorId: userId, deletedAt: null },
    });
    if (!reel) throw Errors.notFound('Reel');
    if (reel.publishStatus === 'REMOVED' || reel.moderationStatus === 'RESTRICTED') {
      throw Errors.forbidden(
        'This reel can no longer be edited. You can appeal the decision instead.',
      );
    }
    if (reel.publishStatus === 'FAILED') {
      throw Errors.conflict('This reel could not be made, so there is nothing to edit.');
    }

    const data: Prisma.ReelUpdateInput = {};
    let demote = false;
    if (dto.caption !== undefined) {
      const caption = cleanText(dto.caption);
      const hashtags = extractHashtags(caption);
      const names = extractMentions(caption);
      if (hashtags.length > MAX_HASHTAGS) {
        throw Errors.validation([{ field: 'caption', reasons: ['too_many_hashtags'] }]);
      }
      if (names.length > MAX_MENTIONS) {
        throw Errors.validation([{ field: 'caption', reasons: ['too_many_mentions'] }]);
      }
      if (caption !== reel.caption) {
        const blocked = await this.settings.get<string[]>(BLOCKED_TERMS_SETTING, []);
        demote = !screenText(caption, blocked).clean;
        data.caption = caption;
        data.hashtags = hashtags;
        data.mentionedUserIds = await this.mentions.resolve(userId, names);
      }
    }
    if (dto.visibility !== undefined) data.visibility = dto.visibility;
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.allowComments !== undefined) data.allowComments = dto.allowComments;
    if (dto.allowRemix !== undefined) data.allowRemix = dto.allowRemix;
    if (dto.allowSharing !== undefined) data.allowSharing = dto.allowSharing;
    // An edit can send a published reel back to review. It can never publish one.
    if (demote && reel.publishStatus === 'PUBLISHED') {
      data.publishStatus = 'MODERATION';
      data.moderationStatus = 'PENDING';
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.reel.update({ where: { id }, data });
      // Turning remixing off stops new reels reusing this reel's sound.
      if (dto.allowRemix === false) {
        await tx.originalAudio.updateMany({
          where: { sourceReelId: id },
          data: { reusable: false },
        });
      } else if (dto.allowRemix === true && reel.publishStatus === 'PUBLISHED') {
        await tx.originalAudio.updateMany({
          where: { sourceReelId: id },
          data: { reusable: true },
        });
      }
    });
    return this.reader.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const reel = await this.prisma.reel.findFirst({
      where: { id, authorId: userId },
      select: {
        id: true,
        deletedAt: true,
        publishStatus: true,
        musicTrackId: true,
        reusedAudioId: true,
        mediaAssetId: true,
      },
    });
    if (!reel) throw Errors.notFound('Reel');
    if (reel.deletedAt) return; // already gone is fine for the author

    const removed = await this.prisma.$transaction(async (tx) => {
      const res = await tx.reel.updateMany({
        where: { id, authorId: userId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (res.count !== 1) return false;
      // Counters moved when it was published, so they move back when it goes.
      if (reel.publishStatus === 'PUBLISHED') {
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
      // Nobody can reuse the sound of a reel that is gone.
      await tx.originalAudio.updateMany({ where: { sourceReelId: id }, data: { reusable: false } });
      return true;
    });
    // The finished video is no longer needed; its files are removed by the media queue.
    if (removed && reel.mediaAssetId) {
      await this.prisma.mediaAsset.updateMany({
        where: { id: reel.mediaAssetId, status: { not: 'DELETED' } },
        data: { status: 'DELETED', deletedAt: new Date() },
      });
      await this.jobs.enqueue(reel.mediaAssetId, 'DELETE');
    }
  }

  // ------------------------------------------------------------------ audio --

  /** A creator's original sound, if the viewer can see the reel it came from. */
  async getAudio(viewerId: string, id: string) {
    const audio = await this.prisma.originalAudio.findFirst({
      where: { id, sourceReel: reelVisibleTo(viewerId) },
      select: {
        id: true,
        title: true,
        durationMs: true,
        reusable: true,
        usesCount: true,
        sourceReelId: true,
        owner: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
      },
    });
    if (!audio) throw Errors.notFound('Audio');
    return {
      id: audio.id,
      title: audio.title,
      durationMs: audio.durationMs,
      reusable: audio.reusable,
      usesCount: audio.usesCount,
      reelId: audio.sourceReelId,
      owner: {
        id: audio.owner.id,
        username: audio.owner.username,
        displayName: audio.owner.profile?.displayName ?? audio.owner.username,
      },
    };
  }
}
