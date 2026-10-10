import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MediaToolError,
  VIDEO_PROFILES,
  demuxerFor,
  ffmpeg,
  imageArgs,
  posterArgs,
  probe,
  profilesFor,
  videoArgs,
} from '../../src/media/processing/ffmpeg.js';
import { TOOLS, makeImage, makeVideo, scratchDir } from '../support/tools.js';

const exec = promisify(execFile);
const MP4 = 'mov,mp4,m4a,3gp,3g2,mj2';

describe('media tools (real ffmpeg and ffprobe)', () => {
  const scratch = scratchDir();
  const p = (name: string) => join(scratch.dir, name);

  beforeAll(async () => {
    await makeVideo(p('land.mp4'), { width: 1280, height: 720, seconds: 2 });
    await makeVideo(p('portrait.mp4'), { width: 720, height: 1280, seconds: 2 });
    await makeVideo(p('tiny.mp4'), { width: 320, height: 180, seconds: 1, audio: false });
    await makeVideo(p('odd.mp4'), { width: 642, height: 362, seconds: 1 });
    await makeVideo(p('fast.mp4'), { width: 320, height: 180, seconds: 1, fps: 60 });
    await makeVideo(p('tagged.mp4'), {
      width: 320,
      height: 180,
      seconds: 1,
      title: 'PRIVATE-TITLE-123',
    });
    await makeImage(p('photo.jpg'), { width: 4000, height: 3000 });
    await makeImage(p('tall.jpg'), { width: 600, height: 2400 });
    await makeImage(p('shot.png'), { width: 300, height: 200 });
  }, 60_000);
  afterAll(() => scratch.remove());

  describe('probing', () => {
    it('reads the facts of a video', async () => {
      const r = await probe(TOOLS, p('land.mp4'), MP4);
      expect(r.video).toMatchObject({ codec: 'h264', width: 1280, height: 720 });
      expect(r.video?.fps).toBeCloseTo(25, 0);
      expect(r.audio?.codec).toBe('aac');
      expect(r.durationMs).toBeGreaterThan(1800);
      expect(r.durationMs).toBeLessThan(2400);
    });

    it('reads an image, and a video without sound', async () => {
      const img = await probe(TOOLS, p('photo.jpg'), 'image2');
      expect(img.video).toMatchObject({ width: 4000, height: 3000 });
      expect(img.audio).toBeNull();
      expect((await probe(TOOLS, p('tiny.mp4'), MP4)).audio).toBeNull();
    });

    it('calls a file that is not media corrupt, permanently', async () => {
      writeFileSync(p('text.mp4'), 'this is not a video, it is a sentence.');
      writeFileSync(p('empty.mp4'), '');
      for (const f of ['text.mp4', 'empty.mp4']) {
        await expect(probe(TOOLS, p(f), MP4)).rejects.toMatchObject({
          permanent: true,
          code: 'CORRUPT_MEDIA',
        });
      }
    });

    it('reports a missing program as temporary, not as a bad file', async () => {
      await expect(
        probe({ ...TOOLS, ffprobe: p('no-such-binary') }, p('land.mp4'), MP4),
      ).rejects.toMatchObject({
        permanent: false,
        code: 'TOOL_UNAVAILABLE',
      });
    });
  });

  describe('renditions', () => {
    it('chooses profiles by source size and never upscales', () => {
      expect(profilesFor(1280, 720).map((x) => x.key)).toEqual(['DATA_SAVER', 'BALANCED']);
      expect(profilesFor(1920, 1080).map((x) => x.key)).toEqual(['DATA_SAVER', 'BALANCED', 'HIGH']);
      expect(profilesFor(1080, 1920).map((x) => x.key)).toEqual(['DATA_SAVER', 'BALANCED', 'HIGH']);
      expect(profilesFor(320, 180).map((x) => x.key)).toEqual(['DATA_SAVER', 'BALANCED']);
    });

    async function render(
      input: string,
      key: 'DATA_SAVER' | 'BALANCED' | 'HIGH',
      o: { audio: boolean; capFps?: boolean } = { audio: true },
    ) {
      const profile = VIDEO_PROFILES.find((x) => x.key === key)!;
      const out = p(`${input}-${key}.mp4`);
      await ffmpeg(
        TOOLS,
        videoArgs(p(input), out, profile, {
          hasAudio: o.audio,
          forceFormat: MP4,
          capFps: !!o.capFps,
        }),
        60_000,
      );
      return probe(TOOLS, out, MP4);
    }

    it('fits a landscape video to the shorter side', async () => {
      const r = await render('land.mp4', 'DATA_SAVER');
      expect(r.video).toMatchObject({ codec: 'h264', width: 854, height: 480 });
      expect(r.audio?.codec).toBe('aac');
      expect(r.durationMs).toBeGreaterThan(1700);
    }, 60_000);

    it('fits a portrait video (a reel) to the shorter side', async () => {
      const r = await render('portrait.mp4', 'DATA_SAVER');
      expect(r.video).toMatchObject({ width: 480, height: 854 });
    }, 60_000);

    it('does not enlarge a small video, and keeps both sides even', async () => {
      const small = await render('tiny.mp4', 'BALANCED', { audio: false });
      expect(small.video).toMatchObject({ width: 320, height: 180 });
      expect(small.audio).toBeNull();
      const odd = await render('odd.mp4', 'BALANCED');
      expect((odd.video?.width ?? 1) % 2).toBe(0);
      expect((odd.video?.height ?? 1) % 2).toBe(0);
    }, 60_000);

    it('limits the frame rate when asked', async () => {
      const r = await render('fast.mp4', 'DATA_SAVER', { audio: true, capFps: true });
      expect(r.video?.fps).toBeLessThanOrEqual(30.5);
    }, 60_000);

    it('strips metadata the uploader embedded (titles, locations)', async () => {
      const src = await exec(TOOLS.ffprobe, [
        '-v',
        'error',
        '-show_format',
        '-of',
        'json',
        p('tagged.mp4'),
      ]);
      expect(src.stdout).toContain('PRIVATE-TITLE-123');
      await render('tagged.mp4', 'BALANCED');
      const out = await exec(TOOLS.ffprobe, [
        '-v',
        'error',
        '-show_format',
        '-show_streams',
        '-of',
        'json',
        p('tagged.mp4-BALANCED.mp4'),
      ]);
      expect(out.stdout).not.toContain('PRIVATE-TITLE-123');
      expect(out.stdout).not.toContain('17.3850');
    }, 60_000);

    it('puts the index first so playback can start before the download ends', async () => {
      await render('land.mp4', 'DATA_SAVER');
      const { readFileSync } = await import('node:fs');
      const head = readFileSync(p('land.mp4-DATA_SAVER.mp4')).subarray(0, 4096).toString('latin1');
      expect(head.indexOf('moov')).toBeGreaterThan(-1);
      const all = readFileSync(p('land.mp4-DATA_SAVER.mp4')).toString('latin1');
      expect(all.indexOf('moov')).toBeLessThan(all.indexOf('mdat'));
    }, 60_000);
  });

  describe('images', () => {
    it('shrinks a large photo to the long-side limit, as a clean JPEG', async () => {
      await ffmpeg(TOOLS, imageArgs(p('photo.jpg'), p('photo-main.jpg'), 1440, 'image2'), 30_000);
      const r = await probe(TOOLS, p('photo-main.jpg'), 'image2');
      expect(r.video).toMatchObject({ codec: 'mjpeg', width: 1440, height: 1080 });
    });

    it('handles a tall image, a PNG, and does not enlarge', async () => {
      await ffmpeg(TOOLS, imageArgs(p('tall.jpg'), p('tall-main.jpg'), 1440, 'image2'), 30_000);
      expect((await probe(TOOLS, p('tall-main.jpg'), 'image2')).video).toMatchObject({
        width: 360,
        height: 1440,
      });
      await ffmpeg(TOOLS, imageArgs(p('shot.png'), p('shot-main.jpg'), 1440, 'image2'), 30_000);
      expect((await probe(TOOLS, p('shot-main.jpg'), 'image2')).video).toMatchObject({
        codec: 'mjpeg',
        width: 300,
        height: 200,
      });
    });

    it('makes a poster frame from a video', async () => {
      await ffmpeg(TOOLS, posterArgs(p('land.mp4'), p('poster.jpg'), 0.5, 720, MP4), 30_000);
      expect((await probe(TOOLS, p('poster.jpg'), 'image2')).video).toMatchObject({
        codec: 'mjpeg',
        width: 720,
        height: 406,
      });
    });
  });

  describe('hostile input', () => {
    it('does not follow a playlist that points at the network', async () => {
      let hits = 0;
      const server = createServer((_req, res) => {
        hits++;
        res.end('x');
      });
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      const port = (server.address() as AddressInfo).port;
      try {
        const playlist = p('evil.m3u8');
        writeFileSync(
          playlist,
          `#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:1.0,\nhttp://127.0.0.1:${port}/segment.ts\n#EXT-X-ENDLIST\n`,
        );
        // 1. Insisting on the MP4 reader: a playlist is simply not an MP4.
        await expect(
          ffmpeg(
            TOOLS,
            videoArgs(playlist, p('evil-out.mp4'), VIDEO_PROFILES[0]!, {
              hasAudio: false,
              forceFormat: MP4,
              capFps: false,
            }),
            20_000,
          ),
        ).rejects.toBeInstanceOf(MediaToolError);
        // 2. Even if a playlist reader were somehow chosen, only local files may be opened.
        await expect(
          ffmpeg(
            TOOLS,
            videoArgs(playlist, p('evil-out2.mp4'), VIDEO_PROFILES[0]!, {
              hasAudio: false,
              forceFormat: 'hls',
              capFps: false,
            }),
            20_000,
          ),
        ).rejects.toBeInstanceOf(MediaToolError);
        expect(hits).toBe(0);
      } finally {
        await new Promise((done) => server.close(done));
      }
    }, 60_000);

    it('treats a corrupt video as the file’s fault, not as something to retry', async () => {
      writeFileSync(
        p('garbage.mp4'),
        Buffer.concat([
          Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
          Buffer.alloc(500, 7),
        ]),
      );
      await expect(
        ffmpeg(
          TOOLS,
          videoArgs(p('garbage.mp4'), p('garbage-out.mp4'), VIDEO_PROFILES[0]!, {
            hasAudio: false,
            forceFormat: MP4,
            capFps: false,
          }),
          20_000,
        ),
      ).rejects.toMatchObject({ permanent: true });
    }, 30_000);

    it('stops a run that takes too long', async () => {
      await expect(
        ffmpeg(
          TOOLS,
          videoArgs(p('land.mp4'), p('slow.mp4'), VIDEO_PROFILES[2]!, {
            hasAudio: true,
            forceFormat: MP4,
            capFps: false,
          }),
          1,
        ),
      ).rejects.toMatchObject({ permanent: false, code: 'PROCESSING_TIMEOUT' });
    });

    it('chooses the reader by the verified type, not by guessing', () => {
      expect(demuxerFor('image/jpeg')).toBe('image2');
      expect(demuxerFor('image/png')).toBe('image2');
      expect(demuxerFor('video/webm')).toBe('matroska,webm');
      expect(demuxerFor('video/mp4')).toBe(MP4);
      expect(demuxerFor('video/quicktime')).toBe(MP4);
    });
  });
});
