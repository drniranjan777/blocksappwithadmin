import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../common/errors/app-error.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import {
  MediaToolError,
  type ToolPaths,
  audioArgs,
  audioDemuxerFor,
  demuxerFor,
  ffmpeg,
  imageArgs,
  probe,
} from '../media/processing/ffmpeg.js';
import { SNIFF_BYTES, sniffMime } from '../media/processing/sniff.js';
import { removeTempDir } from '../media/processing/temp-dir.js';
import { ObjectStorage, type PresignedRequest } from '../media/storage/object-storage.js';
import { MEDIA_BUCKET } from '../media/storage/storage.module.js';

export const AUDIO_MIMES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/flac',
  'audio/ogg',
] as const;
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MiB = 1024 * 1024;
const MAX_AUDIO_BYTES = 40 * MiB;
const MAX_COVER_BYTES = 5 * MiB;
const MIN_TRACK_MS = 5_000;
const MAX_TRACK_MS = 10 * 60_000;
export const PREVIEW_SECONDS = 30;

const DOC_MIMES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const MAX_DOC_BYTES = 10 * MiB;

export type MusicPart = 'audio' | 'cover';

/** Where a track's files live. */
export const keys = {
  source: (trackId: string, part: MusicPart) => `music/${trackId}/source-${part}`,
  full: (trackId: string) => `music/${trackId}/full.m4a`,
  preview: (trackId: string) => `music/${trackId}/preview.m4a`,
  cover: (trackId: string) => `music/${trackId}/cover.jpg`,
  /** The signed licence. Never under a served prefix: only reachable by a staff-only signed download. */
  licenceDocument: (licenceId: string) => `music-licences/${licenceId}/document`,
};

/**
 * The files behind a music track.
 *
 * Staff upload a source file straight to storage (the same signed-address design as
 * app uploads). When they say it is there, this checks it the way every upload is
 * checked (real type from the bytes, readable, sensible length) and produces what the
 * app uses: a cleaned **full** copy (only ever used server-side, to mix into reels),
 * a 30-second **preview** and a **cover**. The source is then deleted.
 */
@Injectable()
export class MusicAssetsService {
  tools: ToolPaths;

  constructor(
    private readonly storage: ObjectStorage,
    @Inject(ENV) private readonly env: Env,
    @Inject(MEDIA_BUCKET) private readonly bucket: string,
  ) {
    this.tools = { ffmpeg: env.FFMPEG_PATH, ffprobe: env.FFPROBE_PATH };
  }

  async presign(
    trackId: string,
    part: MusicPart,
    contentType: string,
    sizeBytes: number,
  ): Promise<PresignedRequest> {
    const mimes: readonly string[] = part === 'audio' ? AUDIO_MIMES : IMAGE_MIMES;
    const mime = contentType.trim().toLowerCase();
    if (!mimes.includes(mime))
      throw Errors.unsupportedMedia('That file type is not accepted.', { allowed: mimes });
    const max = part === 'audio' ? MAX_AUDIO_BYTES : MAX_COVER_BYTES;
    if (!Number.isInteger(sizeBytes) || sizeBytes < 1)
      throw Errors.validation([{ field: 'sizeBytes', reasons: ['invalid'] }]);
    if (sizeBytes > max)
      throw Errors.tooLarge('That file is larger than allowed.', { maxBytes: max });
    return this.storage.presignUpload({
      bucket: this.bucket,
      key: keys.source(trackId, part),
      contentType: mime,
      sizeBytes,
      ttlSeconds: this.env.UPLOAD_URL_TTL_SECONDS,
    });
  }

  private async withTemp<T>(work: (dir: string) => Promise<T>): Promise<T> {
    const dir = join(
      this.env.MEDIA_TEMP_DIR || join(tmpdir(), 'blocks-media'),
      `music-${randomBytes(6).toString('hex')}`,
    );
    await mkdir(dir, { recursive: true });
    try {
      return await work(dir);
    } finally {
      await removeTempDir(dir);
    }
  }

  private async fetchSource(
    trackId: string,
    part: MusicPart,
    allowed: readonly string[],
    max: number,
  ) {
    const key = keys.source(trackId, part);
    const info = await this.storage.head(this.bucket, key);
    if (!info) throw Errors.conflict('Nothing has been uploaded yet.');
    const bad = (message: string) => Errors.validation([{ field: part, reasons: [message] }]);
    if (info.sizeBytes > max) {
      await this.storage.delete(this.bucket, key).catch(() => undefined);
      throw bad('too_large');
    }
    const head = await this.storage.readRange(this.bucket, key, 0, SNIFF_BYTES - 1);
    const mime = await sniffMime(head);
    if (!mime || !allowed.includes(mime)) {
      await this.storage.delete(this.bucket, key).catch(() => undefined);
      throw bad('unsupported_file');
    }
    return { key, mime };
  }

  private rejectBad(error: unknown): never {
    if (error instanceof MediaToolError && error.permanent) {
      throw Errors.validation([{ field: 'file', reasons: ['unreadable'] }]);
    }
    throw error;
  }

  /** Produces the full copy and the preview. Returns what to store on the track. */
  async processAudio(trackId: string, previewStartSeconds = 0) {
    const { key, mime } = await this.fetchSource(trackId, 'audio', AUDIO_MIMES, MAX_AUDIO_BYTES);
    return this.withTemp(async (dir) => {
      const local = join(dir, 'source');
      await this.storage.downloadTo(this.bucket, key, local);
      const demuxer = audioDemuxerFor(mime);
      try {
        const facts = await probe(this.tools, local, demuxer);
        if (!facts.audio) throw Errors.validation([{ field: 'audio', reasons: ['no_audio'] }]);
        if (facts.durationMs < MIN_TRACK_MS || facts.durationMs > MAX_TRACK_MS) {
          throw Errors.validation([{ field: 'audio', reasons: ['length_out_of_range'] }]);
        }
        const full = join(dir, 'full.m4a');
        const preview = join(dir, 'preview.m4a');
        await ffmpeg(this.tools, audioArgs(local, full, { demuxer, kbps: 160 }), 5 * 60_000);
        const start = Math.min(
          Math.max(0, previewStartSeconds),
          Math.max(0, facts.durationMs / 1000 - PREVIEW_SECONDS),
        );
        await ffmpeg(
          this.tools,
          audioArgs(local, preview, {
            demuxer,
            kbps: 96,
            startSeconds: start,
            seconds: PREVIEW_SECONDS,
            fadeOutSeconds: 2,
          }),
          2 * 60_000,
        );
        const made = await probe(this.tools, full, 'mov,mp4,m4a,3gp,3g2,mj2');
        await this.storage.uploadFrom({
          bucket: this.bucket,
          key: keys.full(trackId),
          path: full,
          contentType: 'audio/mp4',
        });
        await this.storage.uploadFrom({
          bucket: this.bucket,
          key: keys.preview(trackId),
          path: preview,
          contentType: 'audio/mp4',
        });
        await this.storage.delete(this.bucket, key).catch(() => undefined);
        return {
          audioKey: keys.full(trackId),
          previewKey: keys.preview(trackId),
          durationMs: made.durationMs,
        };
      } catch (error) {
        return this.rejectBad(error);
      }
    });
  }

  async processCover(trackId: string) {
    const { key, mime } = await this.fetchSource(trackId, 'cover', IMAGE_MIMES, MAX_COVER_BYTES);
    return this.withTemp(async (dir) => {
      const local = join(dir, 'source');
      await this.storage.downloadTo(this.bucket, key, local);
      const out = join(dir, 'cover.jpg');
      try {
        await probe(this.tools, local, demuxerFor(mime));
        await ffmpeg(this.tools, imageArgs(local, out, 600, demuxerFor(mime)), 60_000);
      } catch (error) {
        return this.rejectBad(error);
      }
      await this.storage.uploadFrom({
        bucket: this.bucket,
        key: keys.cover(trackId),
        path: out,
        contentType: 'image/jpeg',
      });
      await this.storage.delete(this.bucket, key).catch(() => undefined);
      return { coverKey: keys.cover(trackId) };
    });
  }

  async presignDocument(
    licenceId: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<PresignedRequest> {
    const mime = contentType.trim().toLowerCase();
    if (!(DOC_MIMES as readonly string[]).includes(mime)) {
      throw Errors.unsupportedMedia('Upload a PDF, JPEG or PNG.', { allowed: DOC_MIMES });
    }
    if (!Number.isInteger(sizeBytes) || sizeBytes < 1)
      throw Errors.validation([{ field: 'sizeBytes', reasons: ['invalid'] }]);
    if (sizeBytes > MAX_DOC_BYTES)
      throw Errors.tooLarge('That file is larger than allowed.', { maxBytes: MAX_DOC_BYTES });
    return this.storage.presignUpload({
      bucket: this.bucket,
      key: keys.licenceDocument(licenceId),
      contentType: mime,
      sizeBytes,
      ttlSeconds: this.env.UPLOAD_URL_TTL_SECONDS,
    });
  }

  /** Checks what arrived is really a PDF or image and not too big; removes it if not. */
  async acceptDocument(licenceId: string): Promise<{ documentKey: string }> {
    const key = keys.licenceDocument(licenceId);
    const info = await this.storage.head(this.bucket, key);
    if (!info) throw Errors.conflict('Nothing has been uploaded yet.');
    const reject = async (reason: string): Promise<never> => {
      await this.storage.delete(this.bucket, key).catch(() => undefined);
      throw Errors.validation([{ field: 'document', reasons: [reason] }]);
    };
    if (info.sizeBytes > MAX_DOC_BYTES) return reject('too_large');
    const mime = await sniffMime(
      await this.storage.readRange(this.bucket, key, 0, SNIFF_BYTES - 1),
    );
    if (!mime || !(DOC_MIMES as readonly string[]).includes(mime))
      return reject('unsupported_file');
    return { documentKey: key };
  }

  /** A short-lived address for staff who may read licences. */
  documentUrl(documentKey: string): Promise<string> {
    return this.storage.presignDownload(this.bucket, documentKey, 120);
  }

  /** Where the full copy is, as a local file, for mixing into a reel. */
  async downloadFull(trackId: string, path: string): Promise<void> {
    await this.storage.downloadTo(this.bucket, keys.full(trackId), path);
  }

  async remove(trackId: string): Promise<void> {
    for (const key of [
      keys.full(trackId),
      keys.preview(trackId),
      keys.cover(trackId),
      keys.source(trackId, 'audio'),
      keys.source(trackId, 'cover'),
    ]) {
      await this.storage.delete(this.bucket, key).catch(() => undefined);
    }
  }
}
