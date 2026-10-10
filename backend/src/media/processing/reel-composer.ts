import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { uuidv7 } from '../../common/ids.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { MediaAsset, MediaJob, Prisma } from '../../generated/prisma/client.js';
import { checkAvailability } from '../../music/music-availability.js';
import { MusicAssetsService } from '../../music/music-assets.service.js';
import {
  type ComposeClip,
  type ComposeMusic,
  OUT_HEIGHT,
  OUT_WIDTH,
  composeArgs,
} from '../../reels/reel-compose.js';
import {
  ADJUSTMENT_RANGES,
  type Adjustments,
  NEUTRAL,
  lookMatrix,
  renderedTransition,
} from '../../reels/reel-looks.js';
import { MIN_CLIP_MS } from '../../reels/reels.dto.js';
import { ObjectStorage } from '../storage/object-storage.js';
import { MEDIA_BUCKET } from '../storage/storage.module.js';
import { MediaToolError, type ToolPaths, demuxerFor, ffmpeg, probe } from './ffmpeg.js';
import { Deferred, Rejected } from './job-errors.js';
import { removeTempDir } from './temp-dir.js';

const MP4 = 'mov,mp4,m4a,3gp,3g2,mj2';
/** A clip that is still not ready this long after the reel was made is not going to be. */
const CLIP_WAIT_LIMIT_MS = 30 * 60_000;
const CLIP_RECHECK_SECONDS = 10;
const DEFAULT_MUSIC_VOLUME = 0.8;
/** How far the finished video's length may differ from the plan (frame rounding, encoder padding). */
const LENGTH_TOLERANCE_MS = 1500;

interface StoredRendition {
  key?: string;
  width?: number;
  height?: number;
}

const refused = (a: Pick<MediaAsset, 'status' | 'moderationStatus'>): boolean =>
  a.moderationStatus === 'REMOVED' || ['REJECTED', 'FAILED', 'DELETED'].includes(a.status);

/** The largest processed copy of an asset: what to cut from. */
function bestRendition(asset: MediaAsset): { key: string } | null {
  const list = Array.isArray(asset.renditions) ? (asset.renditions as StoredRendition[]) : [];
  const sorted = list
    .filter((r): r is StoredRendition & { key: string } => !!r.key)
    .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
  return sorted[0] ?? null;
}

/** Numbers from stored JSON, held to the allowed ranges again (never trust what is read back). */
function readAdjustments(raw: unknown): Adjustments {
  const out = { ...NEUTRAL };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(NEUTRAL) as Array<keyof Adjustments>) {
      const v = (raw as Record<string, unknown>)[key];
      const [lo, hi] = ADJUSTMENT_RANGES[key];
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(Math.max(v, lo), hi);
    }
  }
  return out;
}

/**
 * Renders a reel: the COMPOSE job.
 *
 * The creator's clips have each been checked, re-encoded and looked at on their own. This
 * waits until they all are, cuts and joins their processed copies according to the saved
 * edit (see `composeArgs`), mixes in the music, and stores the result as a **new video the
 * server made**. That video then goes through the ordinary transcode (renditions, poster,
 * thumbnail) and moderation steps like any other; the reel is published when it and every
 * clip it was made from have been cleared (see `ContentReleaseService`).
 *
 * Music rights are checked again here, at the moment of rendering: a track that was taken
 * down or whose licence ended between "make" and "render" fails the reel instead of being
 * baked into a video.
 */
@Injectable()
export class ReelComposer {
  private readonly logger = new Logger('ReelComposer');
  /** The programs to run. Public so tests can point at others; configuration sets them at start-up. */
  tools: ToolPaths;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
    private readonly musicAssets: MusicAssetsService,
    @Inject(ENV) private readonly env: Env,
    @Inject(MEDIA_BUCKET) private readonly bucket: string,
  ) {
    this.tools = { ffmpeg: env.FFMPEG_PATH, ffprobe: env.FFPROBE_PATH };
  }

  async compose(job: MediaJob): Promise<void> {
    const reelId = (job.payload as { reelId?: unknown } | null)?.reelId;
    if (typeof reelId !== 'string') throw new Rejected('PROCESSING_FAILED', 'no reel to render');

    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      include: {
        clips: { orderBy: { position: 'asc' }, include: { mediaAsset: true } },
        music: true,
        author: { select: { profile: { select: { country: true } } } },
      },
    });
    // Gone, taken down, or already rendered (a retry after the work was done): nothing to do.
    if (!reel || reel.deletedAt || reel.mediaAssetId || reel.publishStatus !== 'PROCESSING') return;

    const assets = reel.clips.map((c) => c.mediaAsset);
    if (assets.some(refused)) {
      throw new Rejected('CLIP_REFUSED', 'a clip did not pass the checks');
    }
    if (assets.some((a) => a.status !== 'READY')) {
      if (Date.now() - reel.createdAt.getTime() > CLIP_WAIT_LIMIT_MS) {
        throw new Rejected('CLIP_NOT_READY', 'a clip was not processed in time');
      }
      throw new Deferred(CLIP_RECHECK_SECONDS, 'clips are still being processed');
    }

    const meta = (reel.editMetadata ?? {}) as { musicVolume?: unknown };

    await this.withTemp(job, async (dir) => {
      // ---- the clips: each processed copy is fetched once, however often it is used
      const local = new Map<
        string,
        { path: string; width: number; height: number; hasAudio: boolean; durationMs: number }
      >();
      for (const [i, asset] of [...new Map(assets.map((a) => [a.id, a])).values()].entries()) {
        const rendition = bestRendition(asset);
        if (!rendition) throw new Rejected('CORRUPT_MEDIA', 'a clip has no processed copy');
        const path = join(dir, `clip${i}.${asset.kind === 'IMAGE' ? 'jpg' : 'mp4'}`);
        await this.storage.downloadTo(asset.bucket, rendition.key, path);
        const facts = await probe(this.tools, path, asset.kind === 'IMAGE' ? 'image2' : MP4);
        if (!facts.video) throw new Rejected('NO_VIDEO_STREAM', 'a clip has no picture');
        local.set(asset.id, {
          path,
          width: facts.video.width,
          height: facts.video.height,
          hasAudio: !!facts.audio,
          durationMs: facts.durationMs,
        });
      }

      const clips: ComposeClip[] = reel.clips.map((c) => {
        const file = local.get(c.mediaAssetId) as NonNullable<ReturnType<typeof local.get>>;
        const adjustments = readAdjustments(c.adjustments);
        const startMs = c.isPhoto ? 0 : c.startMs;
        // The measured length wins over what was asked, so a trim past the end becomes "to the end".
        const endMs = c.isPhoto ? c.endMs : Math.min(c.endMs, file.durationMs);
        if (endMs - startMs < MIN_CLIP_MS)
          throw new Rejected('INVALID_TRIM', 'a clip has no length');
        return {
          path: file.path,
          demuxer: c.isPhoto ? demuxerFor('image/jpeg') : MP4,
          isPhoto: c.isPhoto,
          width: file.width,
          height: file.height,
          hasAudio: file.hasAudio,
          startMs,
          endMs,
          volume: Number(c.volume),
          matrix: lookMatrix(c.filterId, Number(c.filterIntensity), adjustments),
          sharpness: adjustments.sharpness,
          vignette: adjustments.vignette,
          transitionOut: renderedTransition(c.transitionId),
        };
      });

      // ---- the sound
      const music = await this.prepareSound(
        reel,
        dir,
        typeof meta.musicVolume === 'number' ? meta.musicVolume : DEFAULT_MUSIC_VOLUME,
      );

      // ---- the render
      const output = join(dir, 'reel.mp4');
      const { args, durationMs: plannedMs } = composeArgs({ clips, music }, output);
      await ffmpeg(this.tools, args, Math.max(5 * 60_000, plannedMs * 4));
      const made = await probe(this.tools, output, MP4);
      if (
        !made.video ||
        made.video.width !== OUT_WIDTH ||
        made.video.height !== OUT_HEIGHT ||
        !made.audio ||
        Math.abs(made.durationMs - plannedMs) > LENGTH_TOLERANCE_MS
      ) {
        // Our own output is not what was planned: a fault in the render, not in the creator's files.
        throw new MediaToolError(
          'the rendered video is not what was planned',
          false,
          'PROCESSING_FAILED',
        );
      }

      // ---- store it as a new video of the author's, and send it on to transcoding
      const assetId = uuidv7();
      const now = new Date();
      const key = [
        'orig',
        now.getUTCFullYear(),
        String(now.getUTCMonth() + 1).padStart(2, '0'),
        `${assetId}.mp4`,
      ].join('/');
      const bytes = (await stat(output)).size;
      const sha256 = await hashFile(output);
      await this.storage.uploadFrom({
        bucket: this.bucket,
        key,
        path: output,
        contentType: 'video/mp4',
      });

      const hasOwnSound = clips.some((c) => !c.isPhoto && c.hasAudio && c.volume > 0.05);
      await this.prisma.$transaction(async (tx) => {
        await tx.mediaAsset.create({
          data: {
            id: assetId,
            ownerId: reel.authorId,
            kind: 'VIDEO',
            purpose: 'REEL_VIDEO',
            status: 'PROCESSING',
            bucket: this.bucket,
            storageKey: key,
            declaredMime: 'video/mp4',
            declaredSizeBytes: bytes,
            detectedMime: 'video/mp4',
            sizeBytes: bytes,
            sha256,
            durationMs: made.durationMs,
            width: OUT_WIDTH,
            height: OUT_HEIGHT,
            probe: {
              container: made.format,
              durationMs: made.durationMs,
              video: made.video,
              audio: made.audio,
              streams: made.streamCount,
              composed: true,
            } as unknown as Prisma.InputJsonValue,
            uploadedAt: now,
          },
        });
        await tx.reel.update({
          where: { id: reel.id },
          data: {
            mediaAssetId: assetId,
            durationMs: made.durationMs,
            editMetadata: {
              ...(reel.editMetadata as object),
              hasOwnSound,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.mediaJob.create({ data: { assetId, type: 'TRANSCODE' } });
      });
      this.logger.log(`Reel ${reel.id} rendered: ${made.durationMs} ms, ${bytes} bytes`);
    });
  }

  /** Fetches the sound under the reel, after checking the person may still use it. */
  private async prepareSound(
    reel: {
      musicTrackId: string | null;
      musicStartMs: number | null;
      musicEndMs: number | null;
      reusedAudioId: string | null;
      music: {
        id: string;
        status: Parameters<typeof checkAvailability>[0]['status'];
        rightsType: Parameters<typeof checkAvailability>[0]['rightsType'];
        allowedCountries: string[];
        allowedUses: Parameters<typeof checkAvailability>[0]['allowedUses'];
        licenceExpiresAt: Date | null;
      } | null;
      author: { profile: { country: string } | null };
      durationMs: number;
    },
    dir: string,
    volume: number,
  ): Promise<ComposeMusic | undefined> {
    const startMs = reel.musicStartMs ?? 0;
    const endMs = reel.musicEndMs ?? startMs + reel.durationMs;
    if (reel.musicTrackId) {
      const track = reel.music;
      const verdict = track
        ? checkAvailability(track, { country: reel.author.profile?.country ?? 'IN', use: 'REEL' })
        : { ok: false as const };
      if (!track || !verdict.ok) {
        throw new Rejected('MUSIC_UNAVAILABLE', 'the chosen track can no longer be used');
      }
      const path = join(dir, 'music.m4a');
      await this.musicAssets.downloadFull(track.id, path);
      return { path, startMs, endMs, volume };
    }
    if (reel.reusedAudioId) {
      const audio = await this.prisma.originalAudio.findUnique({
        where: { id: reel.reusedAudioId },
        include: { sourceReel: { include: { video: true } } },
      });
      const source = audio?.sourceReel;
      const rendition = source?.video ? bestRendition(source.video) : null;
      if (
        !audio?.reusable ||
        !source ||
        source.deletedAt ||
        source.publishStatus !== 'PUBLISHED' ||
        source.video?.status !== 'READY' ||
        !rendition
      ) {
        throw new Rejected('AUDIO_UNAVAILABLE', 'the chosen sound can no longer be used');
      }
      const path = join(dir, 'reused.mp4');
      await this.storage.downloadTo(source.video.bucket, rendition.key, path);
      if (!(await probe(this.tools, path, MP4)).audio) {
        throw new Rejected('AUDIO_UNAVAILABLE', 'the chosen sound has no audio');
      }
      return { path, startMs, endMs, volume };
    }
    return undefined;
  }

  private async withTemp<T>(job: MediaJob, work: (dir: string) => Promise<T>): Promise<T> {
    const base = this.env.MEDIA_TEMP_DIR || join(tmpdir(), 'blocks-media');
    const dir = join(base, `${job.id}-${randomBytes(4).toString('hex')}`);
    await mkdir(dir, { recursive: true });
    try {
      return await work(dir);
    } finally {
      await removeTempDir(dir);
    }
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}
