import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemSettingsService } from '../../src/common/settings/system-settings.service.js';
import { probe } from '../../src/media/processing/ffmpeg.js';
import { MediaModerationService } from '../../src/media/processing/media-moderation.service.js';
import { MediaWorker } from '../../src/media/processing/media-worker.js';
import { ObjectStorage } from '../../src/media/storage/object-storage.js';
import { MEDIA_BUCKET } from '../../src/media/storage/storage.module.js';
import { REELS_PER_HOUR } from '../../src/reels/reels.service.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV } from '../support/auth.js';
import { putBytes, storageEnv } from '../support/media.js';
import { person, type Person } from '../support/social.js';
import { makeAudio, makeImage, makeVideo, scratchDir, TOOLS } from '../support/tools.js';

// Each of these renders and transcodes real video. One reel takes up to about 90 seconds on a development machine with the
// ffmpeg that is installed from npm, so the default 120 s limit is too close to be reliable when the machine is busy.
vi.setConfig({ testTimeout: 300_000 });
const MP4 = 'mov,mp4,m4a,3gp,3g2,mj2';
// Built at run time so this file never contains an invisible character itself.
const ZWSP = String.fromCharCode(0x200b);

describe('reels (real uploads, real rendering)', () => {
  let t: TestApp;
  let worker: MediaWorker;
  let storage: ObjectStorage;
  let bucket: string;
  let ana: Person; // makes reels
  let ben: Person; // watches
  const fixtures = scratchDir('blocks-reels-');
  const f = (name: string) => join(fixtures.dir, name);
  const read = (name: string) => readFileSync(f(name));
  let counter = 0;

  beforeAll(async () => {
    t = await createTestApp({
      ...AUTH_TEST_ENV,
      LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
      ...storageEnv(),
      MEDIA_TEMP_DIR: scratchDir('blocks-work-').dir,
      FFMPEG_PATH: TOOLS.ffmpeg,
      FFPROBE_PATH: TOOLS.ffprobe,
    });
    worker = t.app.get(MediaWorker);
    storage = t.app.get(ObjectStorage, { strict: false });
    bucket = t.app.get<string>(MEDIA_BUCKET, { strict: false });
    await makeVideo(f('portrait.mp4'), {
      width: 720,
      height: 1280,
      seconds: 4,
      audio: true,
      title: 'SECRET-LOCATION-TITLE',
    });
    await makeVideo(f('wide.mp4'), { width: 1280, height: 720, seconds: 3, audio: false });
    await makeImage(f('photo.jpg'), { width: 800, height: 600 });
    await makeImage(f('cover.jpg'), { width: 600, height: 1000 });
    await makeAudio(f('song.m4a'), 12);
    ben = await person(t);
  }, 180_000);
  // A fresh creator for every test (the hourly limit on making reels is real), followed by ben.
  beforeEach(async () => {
    ana = await person(t);
    await ben.api('post', `/users/${ana.id}/follow`).expect(200);
  }, 60_000);
  afterAll(async () => {
    fixtures.remove();
    await t.close();
  });

  // ---------------------------------------------------------------- helpers --

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
  const row = async (sql: string, args: unknown[] = []) =>
    (await t.db.query<Record<string, any>>(sql, args)).rows;
  const reelRow = async (id: string) => (await row('SELECT * FROM reels WHERE id = $1', [id]))[0]!;
  const assetRow = async (id: string) =>
    (await row('SELECT * FROM media_assets WHERE id = $1', [id]))[0]!;

  async function upload(
    p: Person,
    file: string,
    o: { purpose?: string; kind?: 'IMAGE' | 'VIDEO'; contentType?: string } = {},
  ) {
    const bytes = read(file);
    const start = await p
      .api('post', '/media/uploads', {
        body: {
          purpose: o.purpose ?? 'REEL_CLIP',
          kind: o.kind ?? 'VIDEO',
          contentType: o.contentType ?? 'video/mp4',
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
  /** Uploaded and run through validation, transcoding and moderation. */
  async function ready(p: Person, file: string, o?: Parameters<typeof upload>[2]) {
    const id = await upload(p, file, o);
    await worker.drain();
    return id;
  }
  const video = (p: Person) => ready(p, 'portrait.mp4');
  const wide = (p: Person) => ready(p, 'wide.mp4');
  const photo = (p: Person) => ready(p, 'photo.jpg', { kind: 'IMAGE', contentType: 'image/jpeg' });

  /** A track in the library that this app's users (in India) may use for reels. */
  async function track(over: Record<string, unknown> = {}) {
    const created = await t.db.prisma.musicTrack.create({
      data: {
        title: `Track ${++counter}`,
        artist: 'The Band',
        language: 'Hindi',
        durationMs: 12_000,
        rightsType: 'PLATFORM_OWNED',
        status: 'ACTIVE',
        allowedCountries: ['IN'],
        allowedUses: ['REEL'],
        audioKey: 'pending',
        previewKey: 'pending',
        ...over,
      },
    });
    const full = `music/${created.id}/full.m4a`;
    await storage.uploadFrom({ bucket, key: full, path: f('song.m4a'), contentType: 'audio/mp4' });
    return t.db.prisma.musicTrack.update({
      where: { id: created.id },
      data: { audioKey: full, previewKey: `music/${created.id}/preview.m4a` },
    });
  }

  const makeReel = (p: Person, body: Record<string, unknown>, key?: string) =>
    p.api('post', '/reels', {
      body: { caption: `Reel ${++counter} #blocks`, ...body },
      ...(key ? { headers: { 'Idempotency-Key': key } } : {}),
    } as never);

  /** Makes a reel from a fresh portrait clip and runs the pipeline to the end. */
  async function published(p: Person, over: Record<string, unknown> = {}) {
    const clip = await video(p);
    const res = await makeReel(p, { clips: [{ mediaId: clip, endMs: 2000 }], ...over }).expect(201);
    await worker.drain();
    return res.body.data.id as string;
  }

  const get = (p: Person, id: string) => p.api('get', `/reels/${id}`);

  // ------------------------------------------------------------- the whole way --

  describe('from clips to a published reel', () => {
    it('renders the edit, checks the result, and publishes it with the right counts', async () => {
      const [a, b, c] = [await video(ana), await wide(ana), await photo(ana)];
      const song = await track();
      const cover = await ready(ana, 'cover.jpg', {
        purpose: 'REEL_COVER',
        kind: 'IMAGE',
        contentType: 'image/jpeg',
      });
      const res = await makeReel(ana, {
        clips: [
          {
            mediaId: a,
            startMs: 500,
            endMs: 3500,
            filterId: 'warm',
            filterIntensity: 0.7,
            transitionId: 'slide',
            adjustments: { contrast: 0.2, vignette: 0.3, sharpness: 0.4 },
          },
          { mediaId: b, filterId: 'bw', transitionId: 'fade' },
          { mediaId: c, endMs: 2000, volume: 0 },
        ],
        musicTrackId: song.id,
        musicStartMs: 1000,
        musicEndMs: 9000,
        musicVolume: 0.6,
        coverMediaId: cover,
        overlays: [
          {
            type: 'text',
            content: `Hello${ZWSP} Hyderabad`,
            startMs: 0,
            endMs: 4000,
            x: 0.5,
            y: 0.2,
            style: { bold: true, align: 'center' },
          },
        ],
        caption: 'Charminar morning #hyderabad #blocks',
        visibility: 'PUBLIC',
      }).expect(201);

      // Straight away: accepted, being made, and visible to nobody else.
      const made = res.body.data;
      expect(made).toMatchObject({
        durationMs: 8000,
        clipCount: 3,
        video: null,
        hashtags: ['hyderabad', 'blocks'],
        music: { id: song.id, title: song.title },
        status: { publish: 'PROCESSING', held: true, failureCode: null },
        viewer: { isAuthor: true },
      });
      expect(made.overlays[0]).toMatchObject({
        type: 'text',
        content: 'Hello Hyderabad',
        scale: 1,
      });
      await get(ben, made.id).expect(404);

      await worker.drain();

      // Published: the video the server made, in a ladder of qualities.
      const live = (await get(ana, made.id).expect(200)).body.data;
      expect(live.status).toMatchObject({ publish: 'PUBLISHED', held: false });
      expect(live.video).toMatchObject({ kind: 'VIDEO', width: 1080, height: 1920 });
      expect(live.video.variants.map((v: any) => v.profile)).toEqual([
        'BALANCED',
        'DATA_SAVER',
        'HIGH',
      ]);
      expect(live.video.durationMs).toBeGreaterThan(7800);
      expect(live.video.durationMs).toBeLessThan(8300);
      expect(live.coverUrl).toBeTruthy();
      expect(live.publishedAt).toBeTruthy();

      const viewed = (await get(ben, made.id).expect(200)).body.data;
      expect(viewed.status).toBeUndefined();
      expect(viewed.viewer).toMatchObject({ isAuthor: false, liked: false, saved: false });
      expect(JSON.stringify(viewed)).not.toMatch(
        /storageKey|storage_key|orig\/|full\.m4a|audioKey/,
      );

      // What is stored matches: a finished video the server made, cleared by moderation.
      const reel = await reelRow(made.id);
      const asset = await assetRow(reel.media_asset_id);
      expect(asset).toMatchObject({
        purpose: 'REEL_VIDEO',
        kind: 'VIDEO',
        status: 'READY',
        moderation_status: 'APPROVED',
        owner_id: ana.id,
      });
      expect(reel).toMatchObject({
        publish_status: 'PUBLISHED',
        moderation_status: 'APPROVED',
        country: 'IN',
      });
      expect(
        (await row('SELECT reels_count FROM music_tracks WHERE id = $1', [song.id]))[0]!
          .reels_count,
      ).toBe(1);
      // Its clips are untouched, and each is still its own cleared asset.
      for (const id of [a, b, c])
        expect(await assetRow(id)).toMatchObject({
          status: 'READY',
          moderation_status: 'APPROVED',
        });
      expect(
        await row(
          'SELECT position, is_photo, start_ms, end_ms FROM reel_clips WHERE reel_id = $1 ORDER BY position',
          [made.id],
        ),
      ).toEqual([
        { position: 0, is_photo: false, start_ms: 500, end_ms: 3500 },
        { position: 1, is_photo: false, start_ms: 0, end_ms: 3000 },
        { position: 2, is_photo: true, start_ms: 0, end_ms: 2000 },
      ]);

      // The delivered file really is 9:16, the planned length, with sound (the music), and no metadata.
      const balanced = (asset.renditions as Array<{ profile: string; key: string }>).find(
        (r) => r.profile === 'BALANCED',
      )!;
      const local = join(fixtures.dir, 'balanced.mp4');
      await storage.downloadTo(bucket, balanced.key, local);
      const facts = await probe(TOOLS, local, MP4);
      expect(facts.video).toMatchObject({ width: 720, height: 1280 });
      expect(facts.audio).toBeTruthy();
      expect(Math.abs(facts.durationMs - 8000)).toBeLessThan(300);
      expect(read('balanced.mp4').includes(Buffer.from('SECRET-LOCATION-TITLE'))).toBe(false);

      // It is on the way into every place a reel should appear.
      const feed = (await ben.api('get', '/feed', { query: { scope: 'following' } }).expect(200))
        .body.data;
      expect(feed.find((i: any) => i.kind === 'reel')?.reel.id).toBe(made.id);
      const reelsFeed = (
        await ben.api('get', '/feed/reels', { query: { scope: 'following' } }).expect(200)
      ).body.data;
      expect(reelsFeed.every((i: any) => i.kind === 'reel')).toBe(true);
      expect(reelsFeed.map((i: any) => i.reel.id)).toContain(made.id);
      const profile = (await ben.api('get', `/profiles/${ana.username}/reels`).expect(200)).body
        .data;
      expect(profile.map((r: any) => r.id)).toContain(made.id);

      // And engagement works on it, including the saved list.
      await ben.api('post', `/reels/${made.id}/like`).expect(200);
      await ben.api('post', `/reels/${made.id}/save`).expect(200);
      const saved = (await ben.api('get', '/users/me/saved').expect(200)).body.data;
      expect(saved[0]).toMatchObject({
        kind: 'reel',
        reel: { id: made.id, viewer: { liked: true, saved: true } },
      });
    });

    // Makes two reels from scratch (render + transcode each), so on a busy machine it needs room.
    it(
      'keeps the stream in order when posts and reels are mixed, and pages through it',
      { timeout: 300_000 },
      async () => {
        const first = await published(ana);
        const post = (
          await ana
            .api('post', '/posts', { body: { type: 'TEXT', caption: 'a post between reels' } })
            .expect(201)
        ).body.data.id;
        const last = await published(ana);

        const all = (
          await ben.api('get', '/feed', { query: { scope: 'following', limit: 50 } }).expect(200)
        ).body.data;
        const order = all.map((i: any) => (i.kind === 'post' ? i.post.id : i.reel.id));
        expect(order.indexOf(last)).toBeLessThan(order.indexOf(post));
        expect(order.indexOf(post)).toBeLessThan(order.indexOf(first));

        // One at a time, the same stream with no repeats and no gaps.
        const seen: string[] = [];
        let cursor: string | undefined;
        for (let i = 0; i < 40; i++) {
          const page = await ben
            .api('get', '/feed', {
              query: { scope: 'following', limit: 2, ...(cursor ? { cursor } : {}) },
            })
            .expect(200);
          seen.push(...page.body.data.map((x: any) => (x.kind === 'post' ? x.post.id : x.reel.id)));
          if (!page.body.meta.hasMore) break;
          cursor = page.body.meta.nextCursor;
        }
        expect(seen).toEqual(order);
      },
    );

    it('is not published until the video and every clip it was made from are cleared', async () => {
      try {
        await setting('moderation.dev_decision', 'REVIEW');
        const clip = await video(ana); // READY, but waiting for a person
        expect((await assetRow(clip)).moderation_status).toBe('PENDING');
        const res = await makeReel(ana, { clips: [{ mediaId: clip, endMs: 2000 }] }).expect(201);
        await worker.drain();

        const reel = await reelRow(res.body.data.id);
        expect(reel.publish_status).toBe('MODERATION');
        await get(ben, res.body.data.id).expect(404);
        expect((await get(ana, res.body.data.id).expect(200)).body.data.status).toMatchObject({
          publish: 'MODERATION',
          held: true,
        });

        const decide = t.app.get(MediaModerationService, { strict: false });
        // Approving the finished video alone is not enough...
        await decide.decide(reel.media_asset_id, 'APPROVE');
        expect((await reelRow(res.body.data.id)).publish_status).toBe('MODERATION');
        // ...the clip it was cut from must be cleared too.
        await decide.decide(clip, 'APPROVE');
        expect((await reelRow(res.body.data.id)).publish_status).toBe('PUBLISHED');
        await get(ben, res.body.data.id).expect(200);
      } finally {
        await clearSetting('moderation.dev_decision');
      }
    });

    it('takes the whole reel down if any clip in it is refused, and tells the author', async () => {
      try {
        await setting('moderation.dev_decision', 'REVIEW');
        const [a, b] = [await video(ana), await wide(ana)];
        const res = await makeReel(ana, {
          clips: [
            { mediaId: a, endMs: 2000 },
            { mediaId: b, endMs: 2000 },
          ],
        }).expect(201);
        await worker.drain();
        const id = res.body.data.id as string;
        const decide = t.app.get(MediaModerationService, { strict: false });
        await decide.decide(a, 'APPROVE');
        await decide.decide((await reelRow(id)).media_asset_id, 'APPROVE');
        await decide.decide(b, 'REJECT', { labels: ['test'] });

        expect(await reelRow(id)).toMatchObject({
          publish_status: 'REMOVED',
          moderation_status: 'REMOVED',
        });
        await get(ben, id).expect(404);
        const notices = (await ana.api('get', '/notifications').expect(200)).body.data as Array<{
          data?: Record<string, string>;
        }>;
        expect(notices.some((n) => n.data?.['reelId'] === id)).toBe(true);
      } finally {
        await clearSetting('moderation.dev_decision');
      }
    });

    it('holds a reel whose caption trips the screen for a person, even when the media is cleared', async () => {
      try {
        await setting('moderation.blocked_terms', ['forbiddenword']);
        const clip = await video(ana);
        const res = await makeReel(ana, {
          clips: [{ mediaId: clip, endMs: 2000 }],
          caption: 'this has a forbiddenword in it',
        }).expect(201);
        await worker.drain();
        expect((await reelRow(res.body.data.id)).publish_status).toBe('MODERATION');
        await get(ben, res.body.data.id).expect(404);
      } finally {
        await clearSetting('moderation.blocked_terms');
      }
    });

    it('waits for clips that are still being processed instead of failing', async () => {
      const clip = await video(ana);
      await t.db.query("UPDATE media_assets SET status = 'PROCESSING' WHERE id = $1", [clip]);
      const res = await makeReel(ana, { clips: [{ mediaId: clip, endMs: 2000 }] }).expect(201);
      const id = res.body.data.id as string;

      await worker.drain();
      let jobs = await row(
        "SELECT status, attempts, run_after > now() AS later FROM media_jobs WHERE type = 'COMPOSE' AND payload->>'reelId' = $1",
        [id],
      );
      expect(jobs).toEqual([{ status: 'RETRYING', attempts: 0, later: true }]); // not a failed attempt
      expect((await reelRow(id)).publish_status).toBe('PROCESSING');

      await t.db.query("UPDATE media_assets SET status = 'READY' WHERE id = $1", [clip]);
      await t.db.query(
        "UPDATE media_jobs SET run_after = now() WHERE type = 'COMPOSE' AND payload->>'reelId' = $1",
        [id],
      );
      await worker.drain();
      jobs = await row(
        "SELECT status FROM media_jobs WHERE type = 'COMPOSE' AND payload->>'reelId' = $1",
        [id],
      );
      expect(jobs).toEqual([{ status: 'SUCCEEDED' }]);
      expect((await reelRow(id)).publish_status).toBe('PUBLISHED');
    });
  });

  // ------------------------------------------------------------ what is refused --

  describe('what is refused', () => {
    it('clips that are not yours, not for reels, not uploaded or refused', async () => {
      const mine = await video(ana);
      const theirs = await video(ben);
      const asPost = await ready(ana, 'photo.jpg', {
        purpose: 'POST_IMAGE',
        kind: 'IMAGE',
        contentType: 'image/jpeg',
      });
      const pending = await upload(ana, 'portrait.mp4'); // announced and sent, not yet looked at
      for (const mediaId of [theirs, asPost, pending, '00000000-0000-4000-8000-000000000000']) {
        const res = await makeReel(ana, {
          clips: [{ mediaId: mine, endMs: 1500 }, { mediaId }],
        }).expect(400);
        expect(res.body.error.details).toEqual([
          { field: 'clips.1.mediaId', reasons: ['not_available'] },
        ]);
      }
      await t.db.query("UPDATE media_assets SET moderation_status = 'REMOVED' WHERE id = $1", [
        mine,
      ]);
      await makeReel(ana, { clips: [{ mediaId: mine }] }).expect(400);
      await worker.drain();
    });

    it('trims that make no sense, and photos given a trim start', async () => {
      const clip = await video(ana);
      const pic = await photo(ana);
      const bad = async (clips: object[]) =>
        (await makeReel(ana, { clips }).expect(400)).body.error.details as Array<{
          field: string;
          reasons: string[];
        }>;
      expect(await bad([{ mediaId: clip, startMs: 3000, endMs: 3100 }])).toEqual([
        { field: 'clips.0.endMs', reasons: ['too_short'] },
      ]);
      expect(await bad([{ mediaId: clip, startMs: 2000, endMs: 1000 }])).toEqual([
        { field: 'clips.0.endMs', reasons: ['too_short'] },
      ]);
      expect(await bad([{ mediaId: clip, endMs: 90_000 }])).toEqual([
        { field: 'clips.0.endMs', reasons: ['beyond_clip'] },
      ]);
      expect(await bad([{ mediaId: pic, startMs: 100, endMs: 2000 }])).toEqual([
        { field: 'clips.0.startMs', reasons: ['not_allowed_for_photo'] },
      ]);
      expect(await bad([{ mediaId: pic, endMs: 100 }])).toEqual([
        { field: 'clips.0.endMs', reasons: ['out_of_range'] },
      ]);
      expect(await bad([{ mediaId: pic, endMs: 20_000 }])).toEqual([
        { field: 'clips.0.endMs', reasons: ['out_of_range'] },
      ]);
      // A reel that would be too short or too long.
      expect(await bad([{ mediaId: pic, endMs: 500 }])).toEqual([
        { field: 'clips', reasons: ['too_short'] },
      ]);
      expect(
        await bad(Array.from({ length: 13 }, () => ({ mediaId: pic, endMs: 15_000 }))),
      ).toEqual([{ field: 'clips', reasons: ['too_long'] }]);
      await worker.drain();
    });

    it('anything the server owns, a hand-made colour matrix, and values outside their range', async () => {
      const clip = await video(ana);
      const ok = { mediaId: clip, endMs: 1500 };
      const refuse = (body: Record<string, unknown>) =>
        makeReel(ana, { clips: [ok], ...body }).expect(400);
      await refuse({ reachLevel: 'GLOBAL' });
      await refuse({ publishStatus: 'PUBLISHED' });
      await refuse({ moderationStatus: 'APPROVED' });
      await refuse({ likesCount: 1_000_000 });
      await refuse({ mediaAssetId: clip });
      await refuse({ state: 'Kerala' });
      await makeReel(ana, { clips: [{ ...ok, matrix: [1, 0, 0, 0, 0] }] }).expect(400);
      await makeReel(ana, { clips: [{ ...ok, filterId: 'nonexistent' }] }).expect(400);
      await makeReel(ana, { clips: [{ ...ok, filterIntensity: 1.5 }] }).expect(400);
      await makeReel(ana, { clips: [{ ...ok, volume: 9 }] }).expect(400);
      await makeReel(ana, { clips: [{ ...ok, transitionId: 'explode' }] }).expect(400);
      await makeReel(ana, { clips: [{ ...ok, adjustments: { brightness: 5 } }] }).expect(400);
      await makeReel(ana, { clips: [{ ...ok, adjustments: { exposure: 0.5 } }] }).expect(400);
      await makeReel(ana, { clips: [] }).expect(400);
      await makeReel(ana, { clips: Array.from({ length: 21 }, () => ok) }).expect(400);
      await makeReel(ana, { clips: [ok], caption: 'x'.repeat(2201) }).expect(400);
      await makeReel(ana, { clips: [ok], visibility: 'EVERYONE' }).expect(400);
      await makeReel(ana, { clips: [ok], label: 'VERIFIED_PUBLISHER' }).expect(400);
      await worker.drain();
    });

    it('overlays that are out of bounds or not what they claim to be', async () => {
      const clip = await video(ana);
      const withOverlay = (o: object) =>
        makeReel(ana, { clips: [{ mediaId: clip, endMs: 2000 }], overlays: [o] });
      const base = { type: 'text', content: 'hi', startMs: 0, endMs: 1000, x: 0.5, y: 0.5 };
      await withOverlay({ ...base, endMs: 0 }).expect(400);
      await withOverlay({ ...base, x: 2 }).expect(400);
      await withOverlay({ ...base, startMs: 5000, endMs: 6000 }).expect(400); // starts after the reel ends
      await withOverlay({ ...base, content: '   ' }).expect(400);
      await withOverlay({ ...base, type: 'sticker', content: '<script>' }).expect(400);
      await withOverlay({ ...base, style: { fontId: '../../etc/passwd' } }).expect(400);
      await withOverlay({ ...base, html: '<b>x</b>' }).expect(400);
      await makeReel(ana, {
        clips: [{ mediaId: clip, endMs: 2000 }],
        overlays: Array.from({ length: 21 }, () => base),
      }).expect(400);
      await worker.drain();
    });

    it('a cover that is not yours or not a cover', async () => {
      const clip = await video(ana);
      const theirs = await ready(ben, 'cover.jpg', {
        purpose: 'REEL_COVER',
        kind: 'IMAGE',
        contentType: 'image/jpeg',
      });
      const wrongKind = await photo(ana);
      for (const coverMediaId of [theirs, wrongKind]) {
        await makeReel(ana, { clips: [{ mediaId: clip, endMs: 1500 }], coverMediaId }).expect(400);
      }
      await worker.drain();
    });

    it('is limited in how fast reels can be made', async () => {
      const spammer = await person(t);
      const clip = await video(spammer);
      for (let i = 0; i < REELS_PER_HOUR; i++) {
        await t.db.prisma.reel.create({
          data: { authorId: spammer.id, caption: 'x', durationMs: 5000 },
        });
      }
      const res = await makeReel(spammer, { clips: [{ mediaId: clip, endMs: 1500 }] }).expect(429);
      expect(res.headers['retry-after']).toBeTruthy();
    });

    it('is safe to retry: the same Idempotency-Key makes one reel', async () => {
      const clip = await video(ana);
      const body = { clips: [{ mediaId: clip, endMs: 1500 }], caption: 'retry me' };
      const key = `reel-${Date.now()}-abcdef`;
      const first = await makeReel(ana, body, key).expect(201);
      const second = await makeReel(ana, body, key).expect(201);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(
        (
          await row(
            "SELECT count(*)::int AS n FROM reels WHERE author_id = $1 AND caption = 'retry me'",
            [ana.id],
          )
        )[0]!.n,
      ).toBe(1);
      expect(
        (
          await row(
            "SELECT count(*)::int AS n FROM media_jobs WHERE type = 'COMPOSE' AND payload->>'reelId' = $1",
            [first.body.data.id],
          )
        )[0]!.n,
      ).toBe(1);
      // The same key with a different edit is refused.
      await makeReel(ana, { ...body, caption: 'something else' }, key).expect(409);
      await worker.drain();
    });
  });

  // ----------------------------------------------------------------- the music --

  describe('music and sound', () => {
    it('only lets people use tracks they are licensed for, and says nothing about why not', async () => {
      const clip = await video(ana);
      const use = (musicTrackId: string) =>
        makeReel(ana, { clips: [{ mediaId: clip, endMs: 2000 }], musicTrackId });
      const refusal = { field: 'musicTrackId', reasons: ['not_available'] };
      const ok = await track();
      const wrongCountry = await track({ allowedCountries: ['US'] });
      const noReels = await track({ allowedUses: ['STORY'] });
      const suspended = await track({ status: 'SUSPENDED' });
      const draft = await track({ status: 'DRAFT', audioKey: null, previewKey: null });
      const expired = await track({
        rightsType: 'LICENSED',
        licenceExpiresAt: new Date(Date.now() - 60_000),
      });
      const noLicence = await track({ rightsType: 'LICENSED' });
      for (const bad of [wrongCountry, noReels, suspended, draft, expired, noLicence]) {
        expect((await use(bad.id).expect(400)).body.error.details).toEqual([refusal]);
      }
      expect(
        (await use('00000000-0000-4000-8000-000000000000').expect(400)).body.error.details,
      ).toEqual([refusal]);
      await use(ok.id).expect(201);
      await worker.drain();
    });

    it('checks the part of the track used, and rejects music settings without music', async () => {
      const clip = await video(ana);
      const song = await track();
      const body = (over: object) =>
        makeReel(ana, { clips: [{ mediaId: clip, endMs: 2000 }], ...over });
      await body({ musicTrackId: song.id, musicStartMs: 20_000 }).expect(400); // starts after the track ends
      await body({ musicTrackId: song.id, musicStartMs: 5000, musicEndMs: 5100 }).expect(400); // too short
      await body({ musicTrackId: song.id, musicVolume: 2 }).expect(400);
      await body({ musicStartMs: 0 }).expect(400); // a window with no track
      await body({
        musicTrackId: song.id,
        reusedAudioId: '00000000-0000-4000-8000-000000000000',
      }).expect(400);
      // Ending past the track is fine: it is cut to the track.
      await body({ musicTrackId: song.id, musicStartMs: 2000, musicEndMs: 60_000 }).expect(201);
      await worker.drain();
    });

    it('fails the reel, not the clips, if the track stops being available before it is rendered', async () => {
      const clip = await video(ana);
      const song = await track();
      const res = await makeReel(ana, {
        clips: [{ mediaId: clip, endMs: 2000 }],
        musicTrackId: song.id,
      }).expect(201);
      // Licensing takes it down between "make" and "render".
      await t.db.query("UPDATE music_tracks SET status = 'SUSPENDED' WHERE id = $1", [song.id]);
      await worker.drain();

      const failed = (await get(ana, res.body.data.id).expect(200)).body.data;
      expect(failed.status).toMatchObject({ publish: 'FAILED', failureCode: 'MUSIC_UNAVAILABLE' });
      expect(failed.video).toBeNull();
      await get(ben, res.body.data.id).expect(404);
      // The clip is still the creator's own, ready to be used again.
      expect(await assetRow(clip)).toMatchObject({
        status: 'READY',
        moderation_status: 'APPROVED',
      });
      expect(
        (await row('SELECT reels_count FROM music_tracks WHERE id = $1', [song.id]))[0]!
          .reels_count,
      ).toBe(0);
      const notices = (await ana.api('get', '/notifications').expect(200)).body.data as Array<{
        data?: Record<string, string>;
        body?: string;
        text?: string;
      }>;
      expect(notices.some((n) => n.data?.['reelId'] === res.body.data.id)).toBe(true);
      // And a failed reel cannot be edited into something else.
      await ana
        .api('patch', `/reels/${res.body.data.id}`, { body: { caption: 'new' } })
        .expect(409);
    });

    it('turns a reel’s own sound into one others can reuse, and counts each reuse', async () => {
      const original = await published(ana, { caption: 'my own sound' });
      const audioRow = (
        await row('SELECT * FROM original_audios WHERE source_reel_id = $1', [original])
      )[0]!;
      expect(audioRow).toMatchObject({ owner_id: ana.id, reusable: true, uses_count: 0 });
      expect((await get(ben, original).expect(200)).body.data.originalAudio).toMatchObject({
        id: audioRow.id,
        reusable: true,
      });

      const seen = await ben.api('get', `/audios/${audioRow.id}`).expect(200);
      expect(seen.body.data).toMatchObject({
        id: audioRow.id,
        reelId: original,
        reusable: true,
        usesCount: 0,
      });

      // Ben reuses it, from the part starting at 1 s.
      const clip = await video(ben);
      const made = await makeReel(ben, {
        clips: [{ mediaId: clip, endMs: 2500 }],
        reusedAudioId: audioRow.id,
        musicStartMs: 1000,
      }).expect(201);
      expect(made.body.data.reusedAudio).toMatchObject({ id: audioRow.id });
      await worker.drain();
      expect((await get(ben, made.body.data.id).expect(200)).body.data.status).toMatchObject({
        publish: 'PUBLISHED',
      });
      expect(
        (await row('SELECT uses_count FROM original_audios WHERE id = $1', [audioRow.id]))[0]!
          .uses_count,
      ).toBe(1);
      // Reusing a sound does not make a new original: a reel with borrowed sound has none of its own.
      expect(
        (
          await row('SELECT count(*)::int AS n FROM original_audios WHERE source_reel_id = $1', [
            made.body.data.id,
          ])
        )[0]!.n,
      ).toBe(0);

      // Turning remixing off stops further reuse; removing the reel takes the sound away.
      await ana.api('patch', `/reels/${original}`, { body: { allowRemix: false } }).expect(200);
      const clip2 = await video(ben);
      await makeReel(ben, {
        clips: [{ mediaId: clip2, endMs: 2000 }],
        reusedAudioId: audioRow.id,
      }).expect(400);
      await ana.api('patch', `/reels/${original}`, { body: { allowRemix: true } }).expect(200);
      await makeReel(ben, {
        clips: [{ mediaId: clip2, endMs: 2000 }],
        reusedAudioId: audioRow.id,
      }).expect(201);
      await ana.api('delete', `/reels/${original}`).expect(204);
      const clip3 = await video(ben);
      await makeReel(ben, {
        clips: [{ mediaId: clip3, endMs: 2000 }],
        reusedAudioId: audioRow.id,
      }).expect(400);
      await ben.api('get', `/audios/${audioRow.id}`).expect(404);
      await worker.drain();
    });

    it('does not make reusable sound out of a reel with no sound of its own', async () => {
      const clip = await wide(ana); // no audio at all
      const res = await makeReel(ana, { clips: [{ mediaId: clip, endMs: 2000 }] }).expect(201);
      await worker.drain();
      expect((await get(ana, res.body.data.id).expect(200)).body.data.status.publish).toBe(
        'PUBLISHED',
      );
      expect(
        (
          await row('SELECT count(*)::int AS n FROM original_audios WHERE source_reel_id = $1', [
            res.body.data.id,
          ])
        )[0]!.n,
      ).toBe(0);
    });
  });

  // ------------------------------------------------------------- editing, removing --

  describe('editing and removing', () => {
    it('lets the author change the caption and switches, and sends a reel back to review for a flagged caption', async () => {
      const id = await published(ana);
      const edited = await ana
        .api('patch', `/reels/${id}`, {
          body: { caption: 'Better #caption', allowComments: false, visibility: 'FOLLOWERS' },
        })
        .expect(200);
      expect(edited.body.data).toMatchObject({
        caption: 'Better #caption',
        hashtags: ['caption'],
        allowComments: false,
        visibility: 'FOLLOWERS',
      });
      await get(ben, id).expect(200); // ben follows ana

      try {
        await setting('moderation.blocked_terms', ['forbiddenword']);
        const demoted = await ana
          .api('patch', `/reels/${id}`, { body: { caption: 'now with forbiddenword' } })
          .expect(200);
        expect(demoted.body.data.status).toMatchObject({ publish: 'MODERATION', held: true });
        await get(ben, id).expect(404);
      } finally {
        await clearSetting('moderation.blocked_terms');
      }
      // It cannot approve itself: a clean edit afterwards does not publish it again.
      await ana.api('patch', `/reels/${id}`, { body: { caption: 'clean again' } }).expect(200);
      await get(ben, id).expect(404);
    });

    it('does not let anyone else edit or delete it, nor see inside a deleted one', async () => {
      const id = await published(ana);
      await ben.api('patch', `/reels/${id}`, { body: { caption: 'hijack' } }).expect(404);
      await ben.api('delete', `/reels/${id}`).expect(404);
      expect((await reelRow(id)).caption).not.toBe('hijack');
      await ana
        .api('patch', `/reels/${id}`, { body: { caption: 'x', reachLevel: 'GLOBAL' } })
        .expect(400);
    });

    it('deletes: gone for everyone, counters put back, and the video’s files removed', async () => {
      const song = await track();
      const id = await published(ana, { musicTrackId: song.id });
      expect(
        (await row('SELECT reels_count FROM music_tracks WHERE id = $1', [song.id]))[0]!
          .reels_count,
      ).toBe(1);
      const asset = await assetRow((await reelRow(id)).media_asset_id);
      const keys = (asset.renditions as Array<{ key: string }>).map((r) => r.key);
      expect(await storage.head(bucket, keys[0]!)).not.toBeNull();

      await ana.api('delete', `/reels/${id}`).expect(204);
      await ana.api('delete', `/reels/${id}`).expect(204); // already gone is fine
      await get(ana, id).expect(404);
      await get(ben, id).expect(404);
      expect(
        (await row('SELECT reels_count FROM music_tracks WHERE id = $1', [song.id]))[0]!
          .reels_count,
      ).toBe(0);
      await worker.drain();
      expect(await assetRow(asset.id)).toMatchObject({ status: 'DELETED' });
      for (const k of keys) expect(await storage.head(bucket, k)).toBeNull();
      const gone = (
        await ben
          .api('get', `/profiles/${ana.username}/reels`, { query: { limit: 50 } })
          .expect(200)
      ).body.data;
      expect(gone.map((r: any) => r.id)).not.toContain(id);
    });
  });

  // --------------------------------------------------------------------- who sees --

  describe('who can see a reel', () => {
    it('hides it from people who blocked or were blocked, and from non-followers when it is for followers', async () => {
      const id = await published(ana, { visibility: 'FOLLOWERS' });
      const stranger = await person(t);
      await get(stranger, id).expect(404);
      await get(ben, id).expect(200);
      await ben.api('post', `/users/${ana.id}/block`).expect(200);
      await get(ben, id).expect(404);
      await ben.api('delete', `/users/${ana.id}/block`).expect(204);
      // Blocking removed the follow, so it stays hidden from a followers-only reel until they follow again.
      await get(ben, id).expect(404);
      await ben.api('post', `/users/${ana.id}/follow`).expect(200);
      await get(ben, id).expect(200);
    });

    it('shows an unfinished or failed reel only to its author, in their own list', async () => {
      const clip = await video(ana);
      const made = await makeReel(ana, { clips: [{ mediaId: clip, endMs: 2000 }] }).expect(201); // not yet rendered
      const mine = (
        await ana
          .api('get', `/profiles/${ana.username}/reels`, { query: { limit: 50 } })
          .expect(200)
      ).body.data;
      expect(mine.find((r: any) => r.id === made.body.data.id)?.status.publish).toBe('PROCESSING');
      const theirs = (
        await ben
          .api('get', `/profiles/${ana.username}/reels`, { query: { limit: 50 } })
          .expect(200)
      ).body.data;
      expect(theirs.map((r: any) => r.id)).not.toContain(made.body.data.id);
      const feed = (
        await ben
          .api('get', '/feed/reels', { query: { scope: 'following', limit: 50 } })
          .expect(200)
      ).body.data;
      expect(feed.map((i: any) => i.reel.id)).not.toContain(made.body.data.id);
      await worker.drain();
    });

    it('lists a private account’s reels only to its followers', async () => {
      const closed = await person(t, { private: true });
      const stranger = await person(t);
      await stranger.api('get', `/profiles/${closed.username}/reels`).expect(403);
      await closed.api('get', `/profiles/${closed.username}/reels`).expect(200);
    });
  });

  it('needs a sign-in everywhere', async () => {
    await t.http.get('/api/v1/reels/00000000-0000-4000-8000-000000000000').expect(401);
    await t.http.post('/api/v1/reels').send({}).expect(401);
    await t.http.get('/api/v1/feed/reels').expect(401);
    await t.http.get('/api/v1/audios/00000000-0000-4000-8000-000000000000').expect(401);
  });
});
