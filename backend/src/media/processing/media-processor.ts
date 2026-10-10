import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { MediaAsset, MediaJob, Prisma } from '../../generated/prisma/client.js';
import { MediaJobsService } from '../jobs/media-jobs.service.js';
import { ruleFor } from '../media-policy.js';
import { ObjectStorage } from '../storage/object-storage.js';
import { MEDIA_BUCKET } from '../storage/storage.module.js';
import { ContentReleaseService } from './content-release.service.js';
import { Rejected } from './job-errors.js';
import { ReelComposer } from './reel-composer.js';
import { removeTempDir } from './temp-dir.js';
import { MediaFilesService } from './media-files.service.js';
import { MediaModerationService } from './media-moderation.service.js';
import {
  MediaToolError,
  type ProbeResult,
  type ToolPaths,
  demuxerFor,
  encodeLimitMs,
  ffmpeg,
  imageArgs,
  posterArgs,
  probe,
  profilesFor,
  videoArgs,
} from './ffmpeg.js';
import { ModerationProvider } from './moderation.provider.js';
import { SNIFF_BYTES, compatibleTypes, sniffMime } from './sniff.js';

export { Deferred, Rejected } from './job-errors.js';

/** Why a file was refused, in the words a person can be told. */
export const REJECTION_CODES = [
  'UNSUPPORTED_FORMAT',
  'CORRUPT_MEDIA',
  'DURATION_LIMIT',
  'DIMENSIONS_LIMIT',
  'NO_VIDEO_STREAM',
  'MISSING_UPLOAD',
  'UNSUPPORTED_PURPOSE',
  'MODERATION_REJECTED',
] as const;

const MAX_PIXELS = 100_000_000;
const MAX_SIDE = 12_000;
const MAX_VIDEO_SIDE = 4096;
/** Originals are kept this long after processing (for reprocessing), then removed. */
export const ORIGINAL_RETENTION_DAYS = 30;

interface Rendition {
  profile: string;
  key: string;
  width: number;
  height: number;
  bitrateKbps?: number;
  bytes: number;
  contentType: string;
}

/**
 * Turns an uploaded original into something safe to show.
 *
 *   VALIDATE   Is it really what it says? Its type is read from the bytes, never taken
 *              from the name or the declared type; it must be on the allow-list for its
 *              purpose, readable, and within size/length limits.
 *   TRANSCODE  Re-encode into new files (several qualities, a poster, a thumbnail) with
 *              all metadata (EXIF, GPS, titles) removed. **Only the re-encoded copies are
 *              ever shown**, so whatever was hidden in the original goes no further.
 *   MODERATE   Ask the moderation provider about a still from it.
 *
 * Every external program is run with a time limit, a size ceiling and only local-file
 * access (see `ffmpeg.ts`).
 */
@Injectable()
export class MediaProcessor {
  private readonly logger = new Logger('MediaProcessor');
  /** The programs to run. Public so tests can point at others; configuration sets them at start-up. */
  tools: ToolPaths;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
    private readonly jobs: MediaJobsService,
    private readonly moderation: ModerationProvider,
    private readonly release: ContentReleaseService,
    private readonly files: MediaFilesService,
    private readonly decisions: MediaModerationService,
    private readonly composer: ReelComposer,
    @Inject(ENV) private readonly env: Env,
    @Inject(MEDIA_BUCKET) private readonly bucket: string,
  ) {
    this.tools = { ffmpeg: env.FFMPEG_PATH, ffprobe: env.FFPROBE_PATH };
  }

  // -------------------------------------------------------------- dispatch --

  async process(job: MediaJob): Promise<void> {
    switch (job.type) {
      case 'VALIDATE':
        return this.validate(job);
      case 'TRANSCODE':
        return this.transcode(job);
      case 'MODERATE':
        return this.moderate(job);
      case 'DELETE':
        return this.deleteFiles(job);
      case 'COMPOSE':
        return this.composer.compose(job);
      case 'THUMBNAIL':
        return; // thumbnails are produced with the renditions
      default:
        throw new Rejected('UNSUPPORTED_PURPOSE', `no handler for ${job.type}`);
    }
  }

  /** A job that will not be retried: say so on the asset, and clean up. */
  async onGivenUp(job: MediaJob, error: unknown): Promise<void> {
    const rejected =
      error instanceof Rejected || (error instanceof MediaToolError && error.permanent);
    const code =
      error instanceof Rejected
        ? error.code
        : error instanceof MediaToolError
          ? error.code
          : 'PROCESSING_FAILED';
    // Putting a reel together failed. The asset the job hangs off is the creator's first clip,
    // which is fine and must not be touched: only the reel is marked.
    if (job.type === 'COMPOSE') {
      const reelId = (job.payload as { reelId?: unknown } | null)?.reelId;
      const code =
        error instanceof Rejected
          ? error.code
          : error instanceof MediaToolError
            ? error.code
            : 'PROCESSING_FAILED';
      if (typeof reelId === 'string') await this.release.failReel(reelId, code);
      return;
    }
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: job.assetId } });
    if (!asset || asset.status === 'DELETED') return;
    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: rejected ? 'REJECTED' : 'FAILED',
        failureCode: code,
        failureDetail: (error as Error).message.slice(0, 500),
        // A file we refused is never shown, so its approval is moot.
        ...(rejected ? { moderationStatus: 'REMOVED' as const } : {}),
        processedAt: new Date(),
      },
    });
    if (rejected) {
      await this.files.removeAll(asset);
      await this.release.onAssetModerated(asset.id);
    }
  }

  // ------------------------------------------------------------ validation --

  private async validate(job: MediaJob): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: job.assetId } });
    if (!asset || (asset.status !== 'UPLOADED' && asset.status !== 'VALIDATING')) return;
    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: 'VALIDATING' },
    });

    const rule = ruleFor(asset.purpose, asset.kind);
    if (!rule)
      throw new Rejected('UNSUPPORTED_PURPOSE', 'this purpose does not accept this kind of file');

    const info = await this.storage.head(asset.bucket, asset.storageKey);
    if (!info) throw new Rejected('MISSING_UPLOAD', 'the uploaded file is gone');
    if (info.sizeBytes > rule.maxBytes)
      throw new Rejected('UNSUPPORTED_FORMAT', 'larger than allowed');

    // The real type, from the first bytes.
    const head = await this.storage.readRange(asset.bucket, asset.storageKey, 0, SNIFF_BYTES - 1);
    const detected = await sniffMime(head);
    const kindOf = (mime: string | undefined) =>
      mime?.startsWith('image/') ? 'IMAGE' : mime?.startsWith('video/') ? 'VIDEO' : undefined;
    if (
      !detected ||
      !rule.mimes.includes(detected) ||
      kindOf(detected) !== asset.kind ||
      !compatibleTypes(asset.declaredMime, detected)
    ) {
      throw new Rejected(
        'UNSUPPORTED_FORMAT',
        `the file is not an allowed ${asset.kind.toLowerCase()}`,
      );
    }

    await this.withTemp(job, async (dir) => {
      const local = join(dir, 'original');
      await this.storage.downloadTo(asset.bucket, asset.storageKey, local);
      const sha256 = await hashFile(local);
      const facts = await probe(this.tools, local, demuxerFor(detected));

      if (!facts.video) throw new Rejected('NO_VIDEO_STREAM', 'no picture found in the file');
      const rotated = facts.video.rotation === 90 || facts.video.rotation === 270;
      const width = rotated ? facts.video.height : facts.video.width;
      const height = rotated ? facts.video.width : facts.video.height;
      if (
        width < 16 ||
        height < 16 ||
        width > MAX_SIDE ||
        height > MAX_SIDE ||
        width * height > MAX_PIXELS
      ) {
        throw new Rejected('DIMENSIONS_LIMIT', 'the picture is too small or too large');
      }
      if (asset.kind === 'VIDEO') {
        if (
          Math.max(width, height) > MAX_VIDEO_SIDE ||
          facts.video.fps > 120 ||
          facts.streamCount > 8
        ) {
          throw new Rejected('DIMENSIONS_LIMIT', 'the video is outside the supported range');
        }
        if (facts.durationMs < 100) throw new Rejected('CORRUPT_MEDIA', 'the video has no length');
        if (rule.maxDurationMs && facts.durationMs > rule.maxDurationMs + 500) {
          throw new Rejected('DURATION_LIMIT', `longer than ${rule.maxDurationMs / 1000} seconds`);
        }
      }

      await this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: 'PROCESSING',
          detectedMime: detected,
          sha256,
          width,
          height,
          durationMs: asset.kind === 'VIDEO' ? facts.durationMs : null,
          probe: summary(facts) as Prisma.InputJsonValue,
        },
      });
    });
    await this.jobs.enqueue(asset.id, 'TRANSCODE');
  }

  // ------------------------------------------------------------- transcode --

  private async transcode(job: MediaJob): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: job.assetId } });
    if (!asset || asset.status !== 'PROCESSING' || !asset.detectedMime) return;

    await this.withTemp(job, async (dir) => {
      const local = join(dir, 'original');
      await this.storage.downloadTo(asset.bucket, asset.storageKey, local);
      const demuxer = demuxerFor(asset.detectedMime as string);
      const facts = await probe(this.tools, local, demuxer);
      const base = `pub/${asset.id}`;
      const renditions: Rendition[] = [];
      let thumbnailKey: string;
      let posterKey: string | null = null;

      if (asset.kind === 'IMAGE') {
        const outputs: Array<[string, string, number, string]> = [
          ['BALANCED', 'main', 1440, 'main.jpg'],
          ['DATA_SAVER', 'small', 640, 'small.jpg'],
        ];
        for (const [profile, , longSide, name] of outputs) {
          const out = join(dir, name);
          await ffmpeg(this.tools, imageArgs(local, out, longSide, demuxer), 60_000);
          renditions.push(await this.publish(asset, `${base}/${name}`, out, 'image/jpeg', profile));
        }
        const thumb = join(dir, 'thumb.jpg');
        await ffmpeg(this.tools, imageArgs(local, thumb, 320, demuxer), 60_000);
        await this.storage.uploadFrom({
          bucket: asset.bucket,
          key: `${base}/thumb.jpg`,
          path: thumb,
          contentType: 'image/jpeg',
        });
        thumbnailKey = `${base}/thumb.jpg`;
      } else {
        const video = facts.video;
        if (!video) throw new Rejected('NO_VIDEO_STREAM', 'no picture found in the file');
        for (const profile of profilesFor(
          asset.width ?? video.width,
          asset.height ?? video.height,
        )) {
          const out = join(dir, `${profile.key}.mp4`);
          await ffmpeg(
            this.tools,
            videoArgs(local, out, profile, {
              hasAudio: !!facts.audio,
              forceFormat: demuxer,
              capFps: video.fps > 30.5,
            }),
            encodeLimitMs(facts.durationMs),
          );
          const made = await probe(this.tools, out, 'mov,mp4,m4a,3gp,3g2,mj2');
          renditions.push(
            await this.publish(
              asset,
              `${base}/${profile.key.toLowerCase()}.mp4`,
              out,
              'video/mp4',
              profile.key,
              made,
            ),
          );
        }
        const poster = join(dir, 'poster.jpg');
        await ffmpeg(
          this.tools,
          posterArgs(local, poster, Math.min(1, facts.durationMs / 2000), 720, demuxer),
          60_000,
        );
        await this.storage.uploadFrom({
          bucket: asset.bucket,
          key: `${base}/poster.jpg`,
          path: poster,
          contentType: 'image/jpeg',
        });
        posterKey = `${base}/poster.jpg`;
        const thumb = join(dir, 'thumb.jpg');
        await ffmpeg(this.tools, imageArgs(poster, thumb, 320, 'image2'), 60_000);
        await this.storage.uploadFrom({
          bucket: asset.bucket,
          key: `${base}/thumb.jpg`,
          path: thumb,
          contentType: 'image/jpeg',
        });
        thumbnailKey = `${base}/thumb.jpg`;
      }

      // The balanced rendition leads: clients that take the first one get a sensible default.
      const order = ['BALANCED', 'DATA_SAVER', 'HIGH'];
      renditions.sort((a, b) => order.indexOf(a.profile) - order.indexOf(b.profile));
      await this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: 'READY',
          profile: 'BALANCED',
          renditions: renditions as unknown as Prisma.InputJsonValue,
          thumbnailKey,
          posterKey,
          processedAt: new Date(),
          deleteAfter: new Date(Date.now() + ORIGINAL_RETENTION_DAYS * 86_400_000),
          failureCode: null,
          failureDetail: null,
        },
      });
    });
    await this.jobs.enqueue(asset.id, 'MODERATE');
    // A finished reel video moves from "being made" to "waiting for decisions".
    if (asset.purpose === 'REEL_VIDEO') await this.release.onAssetReady(asset.id);
  }

  private async publish(
    asset: MediaAsset,
    key: string,
    path: string,
    contentType: string,
    profile: string,
    made?: ProbeResult,
  ): Promise<Rendition> {
    await this.storage.uploadFrom({ bucket: asset.bucket, key, path, contentType });
    const bytes = (await stat(path)).size;
    const facts =
      made ??
      (await probe(
        this.tools,
        path,
        contentType.startsWith('image/') ? 'image2' : 'mov,mp4,m4a,3gp,3g2,mj2',
      ));
    return {
      profile,
      key,
      width: facts.video?.width ?? 0,
      height: facts.video?.height ?? 0,
      ...(facts.bitrateKbps ? { bitrateKbps: facts.bitrateKbps } : {}),
      bytes,
      contentType,
    };
  }

  // ------------------------------------------------------------ moderation --

  private async moderate(job: MediaJob): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: job.assetId } });
    if (!asset || asset.status !== 'READY') return;
    const still = asset.posterKey ?? asset.thumbnailKey;
    if (!still) throw new Rejected('CORRUPT_MEDIA', 'nothing to look at');

    const assessment = await this.withTemp(job, async (dir) => {
      const local = join(dir, 'still.jpg');
      await this.storage.downloadTo(asset.bucket, still, local);
      return this.moderation.assess({ localPath: local, mime: 'image/jpeg' });
    });

    // REVIEW leaves it PENDING for a person to decide; the others are applied now.
    if (assessment.decision === 'APPROVE') await this.decisions.decide(asset.id, 'APPROVE');
    else if (assessment.decision === 'REJECT')
      await this.decisions.decide(asset.id, 'REJECT', { labels: assessment.labels });
    this.logger.log(`Asset ${asset.id} checked by ${this.moderation.name}: ${assessment.decision}`);
  }

  // ---------------------------------------------------------------- deletion --

  private async deleteFiles(job: MediaJob): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: job.assetId } });
    if (!asset) return;
    await this.files.removeAll(asset);
  }

  // ----------------------------------------------------------------- helpers --

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

function summary(p: ProbeResult) {
  return {
    container: p.format,
    durationMs: p.durationMs,
    bitrateKbps: p.bitrateKbps,
    video: p.video,
    audio: p.audio,
    streams: p.streamCount,
  };
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}
