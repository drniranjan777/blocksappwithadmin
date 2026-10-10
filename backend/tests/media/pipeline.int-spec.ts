import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SystemSettingsService } from '../../src/common/settings/system-settings.service.js';
import { probe } from '../../src/media/processing/ffmpeg.js';
import { MediaModerationService } from '../../src/media/processing/media-moderation.service.js';
import { MediaRetentionService } from '../../src/media/processing/media-retention.service.js';
import { MediaProcessor } from '../../src/media/processing/media-processor.js';
import { MediaWorker } from '../../src/media/processing/media-worker.js';
import { LocalObjectStorage } from '../../src/media/storage/local-object-storage.js';
import { ObjectStorage } from '../../src/media/storage/object-storage.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV } from '../support/auth.js';
import { pathOf, putBytes, storageEnv } from '../support/media.js';
import { makeImage, makeVideo, scratchDir, TOOLS } from '../support/tools.js';
import { makePost, person, type Person } from '../support/social.js';

const exec = promisify(execFile);
const MP4 = 'mov,mp4,m4a,3gp,3g2,mj2';

describe('the media pipeline (real ffmpeg, real files)', () => {
  let t: TestApp;
  let worker: MediaWorker;
  let storage: LocalObjectStorage;
  const fixtures = scratchDir('blocks-fixtures-');
  const f = (name: string) => join(fixtures.dir, name);
  const read = (name: string) => readFileSync(f(name));

  beforeAll(async () => {
    const env = storageEnv();
    t = await createTestApp({
      ...AUTH_TEST_ENV,
      ...env,
      MEDIA_TEMP_DIR: scratchDir('blocks-work-').dir,
      FFMPEG_PATH: TOOLS.ffmpeg,
      FFPROBE_PATH: TOOLS.ffprobe,
    });
    worker = t.app.get(MediaWorker);
    storage = t.app.get(ObjectStorage, { strict: false }) as LocalObjectStorage;

    await makeImage(f('photo.jpg'), { width: 1600, height: 1200 });
    await makeImage(f('shot.png'), { width: 300, height: 200 });
    await makeImage(f('wide.jpg'), { width: 12500, height: 20 });
    await makeVideo(f('reel.mp4'), {
      width: 720,
      height: 1280,
      seconds: 2,
      title: 'SECRET-LOCATION-TITLE',
    });
    await makeVideo(f('long.mp4'), { width: 160, height: 90, seconds: 62, audio: false });
    writeFileSync(
      f('page.jpg'),
      '<!DOCTYPE html><html><body><script>alert(document.cookie)</script></body></html>',
    );
    writeFileSync(f('anim.gif'), Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(80)]));
    writeFileSync(
      f('broken.mp4'),
      Buffer.concat([
        Buffer.from([
          0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f,
          0x6d, 0x6d, 0x70, 0x34, 0x31,
        ]),
        Buffer.alloc(800, 7),
      ]),
    );
  }, 120_000);
  afterAll(async () => {
    fixtures.remove();
    await t.close();
  });

  const asset = async (id: string) =>
    (await t.db.query<Record<string, any>>('SELECT * FROM media_assets WHERE id = $1', [id]))
      .rows[0]!;
  const jobs = async (id: string) =>
    (
      await t.db.query<{ type: string; status: string; attempts: number }>(
        'SELECT type, status, attempts FROM media_jobs WHERE asset_id = $1 ORDER BY queued_at',
        [id],
      )
    ).rows;
  const setting = async (key: string, value: unknown) => {
    await t.db.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
    t.app.get(SystemSettingsService, { strict: false }).invalidate();
  };
  const clearSetting = async (key: string) => {
    await t.db.prisma.systemSetting.deleteMany({ where: { key } });
    t.app.get(SystemSettingsService, { strict: false }).invalidate();
  };

  /** Announce, send and finish an upload of a real file; returns the asset id. */
  async function upload(
    p: Person,
    file: string,
    o: { purpose?: string; kind?: 'IMAGE' | 'VIDEO'; contentType?: string } = {},
  ): Promise<string> {
    const bytes = read(file);
    const start = await p
      .api('post', '/media/uploads', {
        body: {
          purpose: o.purpose ?? 'POST_IMAGE',
          kind: o.kind ?? 'IMAGE',
          contentType: o.contentType ?? 'image/jpeg',
          sizeBytes: bytes.length,
        },
      })
      .expect(201);
    await putBytes(t, start.body.data.upload, bytes).expect(200);
    await p
      .api('post', `/media/uploads/${start.body.data.sessionId}/complete`, { body: {} })
      .expect(200);
    return start.body.data.assetId as string;
  }
  const processed = async (p: Person, file: string, o?: Parameters<typeof upload>[2]) => {
    const id = await upload(p, file, o);
    await worker.drain();
    return id;
  };

  describe('photos', () => {
    it('are checked, re-encoded in two sizes with a thumbnail, and cleared', async () => {
      const me = await person(t);
      const id = await processed(me, 'photo.jpg');
      const row = await asset(id);
      expect(row).toMatchObject({
        status: 'READY',
        detected_mime: 'image/jpeg',
        width: 1600,
        height: 1200,
        moderation_status: 'APPROVED',
        profile: 'BALANCED',
        failure_code: null,
      });
      expect(row.sha256).toBe(createHash('sha256').update(read('photo.jpg')).digest('hex'));
      expect(row.probe).toMatchObject({
        container: expect.any(String),
        video: { width: 1600, height: 1200 },
      });

      const renditions = row.renditions as Array<{
        profile: string;
        key: string;
        width: number;
        height: number;
        bytes: number;
      }>;
      expect(renditions.map((r) => r.profile)).toEqual(['BALANCED', 'DATA_SAVER']);
      expect(renditions[0]).toMatchObject({ width: 1440, height: 1080 });
      expect(renditions[1]).toMatchObject({ width: 640, height: 480 });
      for (const r of renditions) {
        expect(r.key).toMatch(new RegExp(`^pub/${id}/`));
        expect((await storage.head(row.bucket, r.key))?.sizeBytes).toBe(r.bytes);
      }
      expect(row.thumbnail_key).toBe(`pub/${id}/thumb.jpg`);
      expect(await storage.head(row.bucket, row.thumbnail_key)).not.toBeNull();
      // Originals are kept for a while, then removed.
      expect(new Date(row.delete_after).getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
      expect(await storage.head(row.bucket, row.storage_key)).not.toBeNull();

      const jobList = await jobs(id);
      expect(jobList.map((j) => [j.type, j.status])).toEqual([
        ['VALIDATE', 'SUCCEEDED'],
        ['TRANSCODE', 'SUCCEEDED'],
        ['MODERATE', 'SUCCEEDED'],
      ]);
      const status = await me.api('get', `/media/${id}`).expect(200);
      expect(status.body.data).toMatchObject({
        ready: true,
        status: 'READY',
        moderation: 'APPROVED',
        width: 1600,
      });
    }, 60_000);

    it('accept a PNG, and strip it down to a plain JPEG', async () => {
      const me = await person(t);
      const id = await processed(me, 'shot.png', { contentType: 'image/png' });
      const row = await asset(id);
      expect(row).toMatchObject({ status: 'READY', detected_mime: 'image/png' });
      const main = (row.renditions as Array<{ key: string }>)[0]!;
      const local = join(fixtures.dir, 'rendition-from-png.jpg');
      await storage.downloadTo(row.bucket, main.key, local);
      expect((await probe(TOOLS, local, 'image2')).video?.codec).toBe('mjpeg');
    }, 60_000);

    it('are shown to others through signed links that deliver the processed copy, not the original', async () => {
      const author = await person(t);
      const viewer = await person(t);
      const id = await processed(author, 'photo.jpg');
      const post = await makePost(author, { type: 'PHOTO', caption: 'view me', mediaIds: [id] });
      const seen = (await viewer.api('get', `/posts/${post.id}`).expect(200)).body.data.media[0];
      expect(seen).toMatchObject({ id, kind: 'IMAGE', width: 1600, height: 1200 });
      expect(seen.variants.map((v: { profile: string }) => v.profile)).toEqual([
        'BALANCED',
        'DATA_SAVER',
      ]);
      expect(seen.posterUrl).toBeNull();

      const res = await t.http
        .get(pathOf(seen.url))
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect((res.body as Buffer).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      // It is the 1440-wide copy, not the 1600-wide original.
      const local = join(fixtures.dir, 'delivered.jpg');
      writeFileSync(local, res.body as Buffer);
      expect((await probe(TOOLS, local, 'image2')).video?.width).toBe(1440);
      const row = await asset(id);
      expect(res.body.length).not.toBe(read('photo.jpg').length);
      expect(row.storage_key).toMatch(/^orig\//);
    }, 60_000);

    it('cannot be fetched with a changed, expired, or borrowed link, and originals are never reachable', async () => {
      const author = await person(t);
      const id = await processed(author, 'photo.jpg');
      const row = await asset(id);
      const post = await makePost(author, { type: 'PHOTO', caption: 'p', mediaIds: [id] });
      const link = pathOf(
        (await author.api('get', `/posts/${post.id}`).expect(200)).body.data.media[0].url,
      );
      await t.http.get(link).expect(200);
      await t.http.get(link.replace(/s=[\w-]+$/, 's=AAAA')).expect(403);
      await t.http.get(link.replace(/e=\d+/, 'e=1')).expect(403);
      await t.http.get(link.replace('main.jpg', 'small.jpg')).expect(403);
      // Even a correctly signed link to an original is refused: only processed output is served.
      const { MediaLinks } = await import('../../src/media/delivery/media-links.js');
      const { hmacHex } = await import('../../src/common/crypto/tokens.js');
      const forger = new MediaLinks(hmacHex(t.env.JWT_SECRET, 'blocks:media:link'));
      const { e, s } = forger.sign(row.storage_key);
      await t.http.get(`/api/v1/media/f/${row.storage_key}?e=${e}&s=${s}`).expect(404);
      await t.http.get('/api/v1/media/f/pub/not-a-uuid/main.jpg?e=1&s=x').expect(404);
      await t.http.get('/api/v1/media/f/pub/../../etc/passwd?e=1&s=x').expect(404);
    }, 60_000);
  });

  describe('videos', () => {
    it('become several qualities with a poster and thumbnail, without the uploader’s metadata', async () => {
      const me = await person(t);
      const id = await processed(me, 'reel.mp4', {
        purpose: 'STORY',
        kind: 'VIDEO',
        contentType: 'video/mp4',
      });
      const row = await asset(id);
      expect(row).toMatchObject({
        status: 'READY',
        detected_mime: 'video/mp4',
        width: 720,
        height: 1280,
        moderation_status: 'APPROVED',
      });
      expect(row.duration_ms).toBeGreaterThan(1800);
      expect(row.duration_ms).toBeLessThan(2400);

      const renditions = row.renditions as Array<{
        profile: string;
        key: string;
        width: number;
        height: number;
        contentType: string;
      }>;
      expect(renditions.map((r) => r.profile)).toEqual(['BALANCED', 'DATA_SAVER']);
      expect(renditions[0]).toMatchObject({ width: 720, height: 1280, contentType: 'video/mp4' });
      expect(renditions[1]).toMatchObject({ width: 480, height: 854 });
      expect(row.poster_key).toBe(`pub/${id}/poster.jpg`);
      expect(row.thumbnail_key).toBe(`pub/${id}/thumb.jpg`);

      for (const r of renditions) {
        const local = join(fixtures.dir, `${id}-${r.profile}.mp4`);
        await storage.downloadTo(row.bucket, r.key, local);
        const facts = await probe(TOOLS, local, MP4);
        expect(facts.video?.codec).toBe('h264');
        expect(facts.audio?.codec).toBe('aac');
        const raw = await exec(TOOLS.ffprobe, [
          '-v',
          'error',
          '-show_format',
          '-show_streams',
          '-of',
          'json',
          local,
        ]);
        expect(raw.stdout).not.toContain('SECRET-LOCATION-TITLE');
        expect(raw.stdout).not.toContain('GPS');
      }
      const original = join(fixtures.dir, 'original-check.mp4');
      await storage.downloadTo(row.bucket, row.storage_key, original);
      expect(
        (await exec(TOOLS.ffprobe, ['-v', 'error', '-show_format', '-of', 'json', original]))
          .stdout,
      ).toContain('SECRET-LOCATION-TITLE');
    }, 120_000);

    it('are served with byte ranges so players can seek', async () => {
      const me = await person(t);
      const viewer = await person(t);
      const id = await processed(me, 'reel.mp4', {
        purpose: 'STORY',
        kind: 'VIDEO',
        contentType: 'video/mp4',
      });
      await me.api('post', '/stories', { body: { mediaId: id } }).expect(201);
      await viewer.api('post', `/users/${me.id}/follow`).expect(200);
      const story = (await viewer.api('get', `/profiles/${me.username}/stories`).expect(200)).body
        .data[0];
      expect(story.media).toMatchObject({ kind: 'VIDEO', durationMs: expect.any(Number) });
      expect(story.media.posterUrl).toMatch(/poster\.jpg\?e=/);
      const link = pathOf(story.media.url);
      const part = await t.http.get(link).set('Range', 'bytes=0-99');
      expect(part.status).toBe(206);
      expect(part.headers['content-type']).toBe('video/mp4');
      expect(part.headers['content-range']).toMatch(/^bytes 0-99\/\d+$/);
      const poster = await t.http.get(pathOf(story.media.posterUrl));
      expect(poster.status).toBe(200);
      expect(poster.headers['content-type']).toBe('image/jpeg');
    }, 120_000);
  });

  describe('files that are not what they claim', () => {
    const refused = async (
      p: Person,
      file: string,
      o: Parameters<typeof upload>[2],
      code: string,
      status: 'REJECTED' | 'FAILED' = 'REJECTED',
    ) => {
      const id = await processed(p, file, o);
      const row = await asset(id);
      expect(row, `${file}`).toMatchObject({ status, failure_code: code });
      // Nothing is kept or shown.
      expect(await storage.head(row.bucket, row.storage_key)).toBeNull();
      const js = await jobs(id);
      expect(js.filter((j) => j.type === 'TRANSCODE')).toEqual([]);
      expect(js[0]).toMatchObject({ type: 'VALIDATE', status: 'FAILED', attempts: 1 });
      const status2 = await p.api('get', `/media/${id}`).expect(200);
      expect(status2.body.data).toMatchObject({ ready: false, failureCode: code });
      return id;
    };

    it('an HTML page named like a photo is refused, and is never retried', async () => {
      await refused(await person(t), 'page.jpg', {}, 'UNSUPPORTED_FORMAT');
    }, 60_000);

    it('a GIF is refused even when declared as a PNG', async () => {
      await refused(
        await person(t),
        'anim.gif',
        { contentType: 'image/png' },
        'UNSUPPORTED_FORMAT',
      );
    }, 60_000);

    it('a PNG declared as a JPEG is refused: the claim and the bytes must agree', async () => {
      await refused(
        await person(t),
        'shot.png',
        { contentType: 'image/jpeg' },
        'UNSUPPORTED_FORMAT',
      );
    }, 60_000);

    it('a video declared as a photo is refused', async () => {
      await refused(
        await person(t),
        'reel.mp4',
        { contentType: 'image/jpeg' },
        'UNSUPPORTED_FORMAT',
      );
    }, 60_000);

    it('a damaged video is refused as corrupt', async () => {
      await refused(
        await person(t),
        'broken.mp4',
        { purpose: 'STORY', kind: 'VIDEO', contentType: 'video/mp4' },
        'CORRUPT_MEDIA',
      );
    }, 60_000);

    it('a video longer than the limit is refused', async () => {
      await refused(
        await person(t),
        'long.mp4',
        { purpose: 'STORY', kind: 'VIDEO', contentType: 'video/mp4' },
        'DURATION_LIMIT',
      );
    }, 60_000);

    it('an absurdly wide picture is refused', async () => {
      await refused(await person(t), 'wide.jpg', {}, 'DIMENSIONS_LIMIT');
    }, 60_000);

    it('a refused photo cannot be put in a post', async () => {
      const me = await person(t);
      const id = await processed(me, 'page.jpg');
      const res = await me
        .api('post', '/posts', { body: { type: 'PHOTO', caption: 'x', mediaIds: [id] } })
        .expect(400);
      expect(JSON.stringify(res.body.error.details)).toContain('not_available');
    }, 60_000);
  });

  describe('retrying', () => {
    it('retries a tool that is temporarily unavailable, with a delay, and then succeeds', async () => {
      const processor = t.app.get(MediaProcessor);
      const good = processor.tools;
      processor.tools = { ...good, ffprobe: join(fixtures.dir, 'no-such-ffprobe') };
      try {
        const me = await person(t);
        const id = await upload(me, 'photo.jpg');
        await worker.drain();
        let js = await jobs(id);
        expect(js).toEqual([{ type: 'VALIDATE', status: 'RETRYING', attempts: 1 }]);
        expect((await asset(id)).status).toBe('VALIDATING');
        // Not due yet: another run leaves it alone.
        expect(await worker.drain()).toBe(0);

        processor.tools = good;
        await t.db.query('UPDATE media_jobs SET run_after = now() WHERE asset_id = $1', [id]);
        await worker.drain();
        js = await jobs(id);
        expect(js[0]).toMatchObject({ type: 'VALIDATE', status: 'SUCCEEDED', attempts: 2 });
        expect((await asset(id)).status).toBe('READY');
      } finally {
        processor.tools = good;
      }
    }, 90_000);

    it('gives up after the attempts run out, and marks the file as failed (not refused)', async () => {
      const processor = t.app.get(MediaProcessor);
      const good = processor.tools;
      processor.tools = { ...good, ffprobe: join(fixtures.dir, 'no-such-ffprobe') };
      try {
        const me = await person(t);
        const id = await upload(me, 'photo.jpg');
        for (let i = 0; i < 3; i++) {
          await worker.drain();
          await t.db.query(
            "UPDATE media_jobs SET run_after = now() WHERE asset_id = $1 AND status = 'RETRYING'",
            [id],
          );
        }
        const js = await jobs(id);
        expect(js[0]).toMatchObject({ type: 'VALIDATE', status: 'FAILED', attempts: 3 });
        expect(await asset(id)).toMatchObject({
          status: 'FAILED',
          failure_code: 'TOOL_UNAVAILABLE',
        });
        const status = await me.api('get', `/media/${id}`).expect(200);
        expect(status.body.data).toMatchObject({ ready: false, status: 'FAILED' });
      } finally {
        processor.tools = good;
      }
    }, 90_000);

    it('picks up a job whose worker died', async () => {
      const me = await person(t);
      const id = await upload(me, 'photo.jpg');
      await t.db.query(
        "UPDATE media_jobs SET status = 'RUNNING', attempts = 1, started_at = now() - interval '30 minutes' WHERE asset_id = $1",
        [id],
      );
      await worker.drain();
      expect((await asset(id)).status).toBe('READY');
    }, 60_000);

    it('lets two workers share the queue without doing anything twice', async () => {
      const people = await Promise.all([person(t), person(t), person(t), person(t)]);
      const ids = [];
      for (const p of people) ids.push(await upload(p, 'shot.png', { contentType: 'image/png' }));
      await Promise.all([worker.drain(), worker.drain()]);
      for (const id of ids) {
        expect((await asset(id)).status).toBe('READY');
        const js = await jobs(id);
        expect(js.map((j) => j.type)).toEqual(['VALIDATE', 'TRANSCODE', 'MODERATE']);
        expect(js.every((j) => j.attempts === 1 && j.status === 'SUCCEEDED')).toBe(true);
      }
    }, 120_000);
  });

  describe('retention', () => {
    it('removes the original after its retention, keeps the processed copies, and does not touch recent ones', async () => {
      const me = await person(t);
      const old = await processed(me, 'photo.jpg');
      const fresh = await processed(me, 'shot.png', { contentType: 'image/png' });
      await t.db.query(
        "UPDATE media_assets SET delete_after = now() - interval '1 day' WHERE id = $1",
        [old],
      );
      const before = await asset(old);

      const retention = t.app.get(MediaRetentionService);
      expect(await retention.purgeOriginals()).toBeGreaterThanOrEqual(1);
      expect(await storage.head(before.bucket, before.storage_key)).toBeNull();
      for (const r of before.renditions as Array<{ key: string }>)
        expect(await storage.head(before.bucket, r.key)).not.toBeNull();
      expect(await asset(old)).toMatchObject({ status: 'READY', delete_after: null });
      // The newer one still has its original, and a second run changes nothing.
      const kept = await asset(fresh);
      expect(await storage.head(kept.bucket, kept.storage_key)).not.toBeNull();
      expect(await retention.purgeOriginals()).toBe(0);
    }, 90_000);
  });

  describe('moderation', () => {
    afterAll(() => clearSetting('moderation.dev_decision'));

    it('holds a post while its photo awaits a person, then releases it and tells the people it mentions', async () => {
      await setting('moderation.dev_decision', 'REVIEW');
      const author = await person(t);
      const friend = await person(t);
      const viewer = await person(t);
      const id = await processed(author, 'photo.jpg');
      expect(await asset(id)).toMatchObject({ status: 'READY', moderation_status: 'PENDING' });

      const post = await makePost(author, {
        type: 'PHOTO',
        caption: `hello @${friend.username}`,
        mediaIds: [id],
      });
      expect(post.body.moderation).toEqual({ status: 'PENDING', held: true });
      await viewer.api('get', `/posts/${post.id}`).expect(404);
      expect((await friend.api('get', '/notifications').expect(200)).body.data).toEqual([]);

      await t.app.get(MediaModerationService).decide(id, 'APPROVE', { by: 'test moderator' });
      expect(
        (await viewer.api('get', `/posts/${post.id}`).expect(200)).body.data.moderation,
      ).toBeUndefined();
      expect(
        (await author.api('get', `/posts/${post.id}`).expect(200)).body.data.moderation,
      ).toEqual({ status: 'APPROVED', held: false });
      const told = (await friend.api('get', '/notifications').expect(200)).body.data.filter(
        (n: { type: string }) => n.type === 'MENTION',
      );
      expect(told).toHaveLength(1);
    }, 90_000);

    it('keeps a post held when only its photo is cleared but its words need a person', async () => {
      await setting('moderation.dev_decision', 'REVIEW');
      await setting('moderation.blocked_terms', ['flaggedword']);
      try {
        const author = await person(t);
        const viewer = await person(t);
        const id = await processed(author, 'photo.jpg');
        const post = await makePost(author, {
          type: 'PHOTO',
          caption: 'this has flaggedword in it',
          mediaIds: [id],
        });
        await t.app.get(MediaModerationService).decide(id, 'APPROVE');
        await viewer.api('get', `/posts/${post.id}`).expect(404);
        expect(
          (await author.api('get', `/posts/${post.id}`).expect(200)).body.data.moderation.held,
        ).toBe(true);
      } finally {
        await clearSetting('moderation.blocked_terms');
      }
    }, 90_000);

    it('removes the content and tells its author when a moderator rejects the photo', async () => {
      await setting('moderation.dev_decision', 'REVIEW');
      const author = await person(t);
      const viewer = await person(t);
      const id = await processed(author, 'photo.jpg');
      const row = await asset(id);
      const post = await makePost(author, {
        type: 'PHOTO',
        caption: 'will be removed',
        mediaIds: [id],
      });
      await author.api('patch', '/users/me/profile', { body: { avatarMediaId: null } }).expect(200);

      await t.app.get(MediaModerationService).decide(id, 'REJECT', { labels: ['test'] });
      expect(await asset(id)).toMatchObject({
        status: 'REJECTED',
        moderation_status: 'REMOVED',
        failure_code: 'MODERATION_REJECTED',
      });
      // Every stored copy is gone.
      expect(await storage.head(row.bucket, row.storage_key)).toBeNull();
      for (const r of row.renditions as Array<{ key: string }>)
        expect(await storage.head(row.bucket, r.key)).toBeNull();
      await viewer.api('get', `/posts/${post.id}`).expect(404);
      expect(
        (await author.api('get', `/posts/${post.id}`).expect(200)).body.data.moderation.status,
      ).toBe('REMOVED');
      const notes = (await author.api('get', '/notifications').expect(200)).body.data;
      expect(
        notes.some(
          (n: { type: string; title: string }) =>
            n.type === 'MODERATION_DECISION' && /removed/i.test(n.title),
        ),
      ).toBe(true);
    }, 90_000);

    it('removes a rejected profile picture from the profile', async () => {
      await setting('moderation.dev_decision', 'REVIEW');
      const me = await person(t);
      const id = await processed(me, 'photo.jpg', { purpose: 'AVATAR' });
      await me.api('patch', '/users/me/profile', { body: { avatarMediaId: id } }).expect(200);
      expect(
        (await me.api('get', '/users/me/profile').expect(200)).body.data.avatarUrl,
      ).not.toBeNull();
      await t.app.get(MediaModerationService).decide(id, 'REJECT');
      expect((await me.api('get', '/users/me/profile').expect(200)).body.data.avatarUrl).toBeNull();
    }, 90_000);

    it('refuses an automatically rejected photo straight away, before anyone can post it', async () => {
      await setting('moderation.dev_decision', 'REJECT');
      const me = await person(t);
      const id = await processed(me, 'photo.jpg');
      expect(await asset(id)).toMatchObject({
        status: 'REJECTED',
        failure_code: 'MODERATION_REJECTED',
      });
      await me
        .api('post', '/posts', { body: { type: 'PHOTO', caption: 'x', mediaIds: [id] } })
        .expect(400);
    }, 90_000);

    it('cannot approve media that is not ready, or that does not exist', async () => {
      const me = await person(t);
      const id = await upload(me, 'photo.jpg'); // not processed yet
      const decisions = t.app.get(MediaModerationService);
      await expect(decisions.decide(id, 'APPROVE')).rejects.toMatchObject({ status: 409 });
      await expect(
        decisions.decide('01990000-0000-7000-8000-000000000001', 'APPROVE'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
