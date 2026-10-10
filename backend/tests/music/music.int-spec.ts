import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { probe } from '../../src/media/processing/ffmpeg.js';
import { ObjectStorage } from '../../src/media/storage/object-storage.js';
import { MEDIA_BUCKET } from '../../src/media/storage/storage.module.js';
import { MusicAdminService } from '../../src/music/music-admin.service.js';
import { createTestApp, type TestApp } from '../support/app.js';
import {
  adminCall,
  provisionAdmin,
  signInAdmin,
  staffSession,
  type StaffSession,
} from '../support/admin.js';
import { AUTH_TEST_ENV } from '../support/auth.js';
import { pathOf, putBytes, storageEnv } from '../support/media.js';
import { person, type Person } from '../support/social.js';
import { makeAudio, makeImage, scratchDir, TOOLS } from '../support/tools.js';

// Built at run time so this file never contains an invisible character itself.
const ZWSP = String.fromCharCode(0x200b);
const MP4 = 'mov,mp4,m4a,3gp,3g2,mj2';

describe('the music library', () => {
  let t: TestApp;
  let boss: StaffSession;
  let curator: StaffSession; // decides what is offered
  let licensing: StaffSession; // records what is permitted
  let analyst: StaffSession; // read-only
  let fan: Person;
  const fixtures = scratchDir('blocks-music-');
  const f = (name: string) => join(fixtures.dir, name);
  let song: Buffer;
  let cover: Buffer;
  let counter = 0;

  const as =
    (s: StaffSession) =>
    (
      method: 'get' | 'post' | 'put' | 'patch' | 'delete',
      path: string,
      o: { body?: object; query?: Record<string, string | number | boolean> } = {},
    ) =>
      adminCall(t, method, `/music${path}`, { token: s.accessToken, ...o });
  const cur = (...a: Parameters<ReturnType<typeof as>>) => as(curator)(...a);
  const lic = (...a: Parameters<ReturnType<typeof as>>) => as(licensing)(...a);

  beforeAll(async () => {
    t = await createTestApp({
      ...AUTH_TEST_ENV,
      LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
      ...storageEnv(),
      MEDIA_TEMP_DIR: scratchDir('blocks-work-').dir,
      FFMPEG_PATH: TOOLS.ffmpeg,
      FFPROBE_PATH: TOOLS.ffprobe,
    });
    boss = await staffSession(t, ['super_admin']);
    // Nobody holds both halves by default: a curator decides what is offered, licensing what is permitted.
    for (const [key, permissionKeys] of [
      ['music_curator', ['music.read', 'music.manage']],
      ['music_licensing', ['music.read', 'music.licences.read', 'music.licences.manage']],
    ] as const) {
      await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: { key, name: key, permissionKeys },
      }).expect(201);
    }
    curator = await signInAdmin(t, await provisionAdmin(t, { roleKeys: ['music_curator'] }));
    licensing = await signInAdmin(t, await provisionAdmin(t, { roleKeys: ['music_licensing'] }));
    analyst = await staffSession(t, ['readonly_analyst']);
    fan = await person(t);

    await makeAudio(f('song.m4a'), 40);
    await makeAudio(f('blip.m4a'), 2);
    await makeImage(f('cover.jpg'), { width: 1200, height: 1200 });
    song = readFileSync(f('song.m4a'));
    cover = readFileSync(f('cover.jpg'));
  }, 180_000);

  afterAll(async () => {
    fixtures.remove();
    await t.close();
  });

  // ---------------------------------------------------------------- helpers --

  const newTrack = async (over: Record<string, unknown> = {}) => {
    counter += 1;
    const res = await cur('post', '/tracks', {
      body: {
        title: `Song ${counter}`,
        artist: 'The Band',
        language: 'Hindi',
        categories: ['HINDI'],
        ...over,
      },
    }).expect(201);
    return res.body.data as { id: string; title: string };
  };

  const upload = async (
    s: StaffSession,
    id: string,
    part: 'audio' | 'cover',
    bytes: Buffer,
    contentType: string,
  ) => {
    const start = await as(s)('post', `/tracks/${id}/${part}/upload`, {
      body: { contentType, sizeBytes: bytes.length },
    }).expect(200);
    await putBytes(t, start.body.data.upload, bytes).expect(200);
  };

  const prepared = async (over: Record<string, unknown> = {}) => {
    const track = await newTrack(over);
    await upload(curator, track.id, 'audio', song, 'audio/mp4');
    await cur('post', `/tracks/${track.id}/audio/complete`, { body: {} }).expect(200);
    await upload(curator, track.id, 'cover', cover, 'image/jpeg');
    await cur('post', `/tracks/${track.id}/cover/complete`).expect(200);
    return track;
  };

  const licence = async (
    trackId: string,
    o: {
      territories?: string[];
      startsAt?: string;
      expiresAt?: string | null;
      activate?: boolean;
    } = {},
  ) => {
    const res = await lic('post', `/tracks/${trackId}/licences`, {
      body: {
        licensor: 'Sangeet Records',
        reference: `CONTRACT-${++counter}`,
        rightsType: 'LICENSED',
        territories: o.territories ?? ['IN'],
        startsAt: o.startsAt ?? '2025-01-01T00:00:00Z',
        ...(o.expiresAt === null ? {} : { expiresAt: o.expiresAt ?? '2035-01-01T00:00:00Z' }),
      },
    }).expect(201);
    const id = res.body.data.id as string;
    if (o.activate !== false) {
      await lic('post', `/licences/${id}/activate`, {
        body: { reason: 'Contract signed and filed' },
      }).expect(200);
    }
    return id;
  };

  const reason = { reason: 'Reviewed and approved' };

  /** A track that is live in India for reels and stories under a running licence. */
  const live = async (over: Record<string, unknown> = {}) => {
    const track = await prepared(over);
    const licenceId = await licence(track.id);
    await cur('patch', `/tracks/${track.id}`, {
      body: { allowedCountries: ['IN'], allowedUses: ['REEL', 'STORY'], ...reason },
    }).expect(200);
    await cur('post', `/tracks/${track.id}/activate`, { body: reason }).expect(200);
    return { ...track, licenceId };
  };

  const listed = async (p: Person, query: Record<string, string> = {}) =>
    (await p.api('get', '/music/tracks', { query: { limit: 50, ...query } }).expect(200)).body
      .data as Array<Record<string, any>>;
  const row = async (id: string) =>
    (await t.db.query<Record<string, any>>('SELECT * FROM music_tracks WHERE id = $1', [id]))
      .rows[0]!;

  // ------------------------------------------------------------ permissions --

  describe('who may do what', () => {
    it('needs a staff sign-in, and an ordinary user is not staff', async () => {
      await adminCall(t, 'get', '/music/tracks').expect(401);
      await adminCall(t, 'get', '/music/tracks', { token: fan.accessToken }).expect(401);
    });

    it('lets a read-only role look but not change', async () => {
      await as(analyst)('get', '/tracks').expect(200);
      await as(analyst)('post', '/tracks', {
        body: { title: 'x', artist: 'y', language: 'Hindi' },
      }).expect(403);
      await as(analyst)('get', `/tracks/${(await newTrack()).id}/licences`).expect(403);
    });

    it('keeps the two halves apart: curation cannot touch licences, licensing cannot curate', async () => {
      const track = await prepared();
      // The curator cannot read or write licences, or set who owns the rights.
      await cur('get', `/tracks/${track.id}/licences`).expect(403);
      await cur('post', `/tracks/${track.id}/licences`, { body: {} }).expect(403);
      await cur('put', `/tracks/${track.id}/rights`, {
        body: { rightsType: 'PLATFORM_OWNED', ...reason },
      }).expect(403);
      // Licensing cannot add or change tracks, or put one live.
      await lic('post', '/tracks', { body: { title: 'x', artist: 'y', language: 'Hindi' } }).expect(
        403,
      );
      await lic('patch', `/tracks/${track.id}`, { body: { title: 'changed' } }).expect(403);
      await lic('post', `/tracks/${track.id}/activate`, { body: reason }).expect(403);
      await lic('post', `/tracks/${track.id}/audio/upload`, {
        body: { contentType: 'audio/mp4', sizeBytes: 10 },
      }).expect(403);
    });

    it('cannot be given to one role: no role may both record a licence and make music available', async () => {
      const res = await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: {
          key: 'music_everything',
          name: 'Everything',
          permissionKeys: ['music.manage', 'music.licences.manage'],
        },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      const made = await t.db.query("SELECT 1 FROM roles WHERE key = 'music_everything'");
      expect(made.rowCount).toBe(0);
    });
  });

  // ----------------------------------------------------------------- tracks --

  describe('adding a track', () => {
    it('starts as a draft that needs a licence, and nobody else can see it', async () => {
      const track = await newTrack({ title: 'Hidden Draft' });
      const got = (await cur('get', `/tracks/${track.id}`).expect(200)).body.data;
      expect(got).toMatchObject({
        status: 'DRAFT',
        rightsType: 'LICENSED',
        durationMs: 0,
        hasAudio: false,
        allowedCountries: [],
        allowedUses: [],
      });
      expect((await listed(fan)).map((x) => x.id)).not.toContain(track.id);
      await fan.api('get', `/music/tracks/${track.id}`).expect(404);
    });

    it('cleans text, rejects empty titles and unknown fields', async () => {
      const ok = await cur('post', '/tracks', {
        body: { title: `  Tum${ZWSP}   Hi  Ho `, artist: ' Arijit ', language: 'Hindi' },
      }).expect(201);
      expect(ok.body.data.title).toBe('Tum Hi Ho');
      await cur('post', '/tracks', { body: { title: '', artist: 'a', language: 'Hindi' } }).expect(
        400,
      );
      await cur('post', '/tracks', {
        body: { title: ` ${ZWSP} `, artist: 'a', language: 'Hindi' },
      }).expect(400);
      await cur('post', '/tracks', {
        body: { title: 'x', artist: 'a', language: 'Hindi', status: 'ACTIVE' },
      }).expect(400);
      await cur('post', '/tracks', {
        body: { title: 'x', artist: 'a', language: 'Hindi', rightsType: 'PLATFORM_OWNED' },
      }).expect(400);
    });

    it('needs a reason to change where or how it may be used, and normalises countries', async () => {
      const track = await newTrack();
      await cur('patch', `/tracks/${track.id}`, { body: { allowedCountries: ['in'] } }).expect(400);
      await cur('patch', `/tracks/${track.id}`, { body: { allowedUses: ['REEL'] } }).expect(400);
      await cur('patch', `/tracks/${track.id}`, {
        body: { allowedCountries: ['india'], ...reason },
      }).expect(400);
      // Metadata alone needs none.
      await cur('patch', `/tracks/${track.id}`, { body: { genre: 'Pop' } }).expect(200);
    });

    it('lists staff pages newest first and filters by status and name', async () => {
      const a = await newTrack({ title: 'Zebra Crossing' });
      const b = await newTrack({ title: 'Zebra Stripes' });
      const first = await cur('get', '/tracks', { query: { limit: 1, q: 'zebra' } }).expect(200);
      expect(first.body.data.map((x: any) => x.id)).toEqual([b.id]);
      expect(first.body.meta.hasMore).toBe(true);
      const second = await cur('get', '/tracks', {
        query: { limit: 1, q: 'zebra', cursor: first.body.meta.nextCursor },
      }).expect(200);
      expect(second.body.data.map((x: any) => x.id)).toEqual([a.id]);
      expect(second.body.meta.hasMore).toBe(false);
      const none = await cur('get', '/tracks', { query: { status: 'ACTIVE', q: 'zebra' } }).expect(
        200,
      );
      expect(none.body.data).toEqual([]);
      await cur('get', '/tracks', { query: { cursor: 'not-a-cursor' } }).expect(400);
    });
  });

  // ------------------------------------------------------------------ files --

  describe('the audio and cover', () => {
    it('checks the real file, then makes a full copy that stays private and a 30-second preview that is served', async () => {
      const track = await newTrack();
      await upload(curator, track.id, 'audio', song, 'audio/mp4');
      const done = await cur('post', `/tracks/${track.id}/audio/complete`, {
        body: { previewStartSeconds: 5 },
      }).expect(200);
      expect(done.body.data.hasAudio).toBe(true);
      expect(done.body.data.durationMs).toBeGreaterThan(39_000);
      expect(done.body.data.durationMs).toBeLessThan(41_500);
      expect(done.body.data.previewUrl).toMatch(
        /\/api\/v1\/media\/f\/music\/.+\/preview\.m4a\?e=\d+&s=/,
      );

      const storage = t.app.get(ObjectStorage, { strict: false });
      const bucket = t.app.get<string>(MEDIA_BUCKET, { strict: false });
      const stored = await row(track.id);
      expect(stored.audio_key).toBe(`music/${track.id}/full.m4a`);
      expect(stored.preview_key).toBe(`music/${track.id}/preview.m4a`);
      // The upload area is cleared once the files are made.
      expect(await storage.head(bucket, `music/${track.id}/source-audio`)).toBeNull();

      const local = join(fixtures.dir, `${track.id}-preview.m4a`);
      await storage.downloadTo(bucket, stored.preview_key, local);
      const facts = await probe(TOOLS, local, MP4);
      expect(facts.durationMs).toBeGreaterThan(29_000);
      expect(facts.durationMs).toBeLessThan(31_500);
      expect(facts.audio).toBeTruthy();

      // The preview is reachable through its signed link...
      const served = await t.http.get(pathOf(done.body.data.previewUrl)).expect(200);
      expect(served.headers['content-type']).toMatch(/audio\/mp4/);
      // ...a tampered link is not...
      await t.http.get(pathOf(done.body.data.previewUrl).replace(/s=./, 's=A')).expect(403);
      // ...and the full-length copy is not reachable at all, even with a "signature".
      await t.http
        .get(`/api/v1/media/f/music/${track.id}/full.m4a?e=9999999999&s=AAAA`)
        .expect(404);
      await t.http
        .get(`/api/v1/media/f/music/${track.id}/source-audio?e=9999999999&s=AAAA`)
        .expect(404);
    });

    it('refuses a file that is not really audio, however it is labelled', async () => {
      const track = await newTrack();
      const page = Buffer.from(
        '<!DOCTYPE html><html><body><script>alert(1)</script></body></html>'.repeat(10),
      );
      await upload(curator, track.id, 'audio', page, 'audio/mp4');
      const res = await cur('post', `/tracks/${track.id}/audio/complete`, { body: {} }).expect(400);
      expect(JSON.stringify(res.body)).toMatch(/unsupported_file/);
      const storage = t.app.get(ObjectStorage, { strict: false });
      expect(
        await storage.head(
          t.app.get<string>(MEDIA_BUCKET, { strict: false }),
          `music/${track.id}/source-audio`,
        ),
      ).toBeNull();
      expect((await row(track.id)).audio_key).toBeNull();
    });

    it('refuses audio that is too short, and a type or size that was not allowed', async () => {
      const track = await newTrack();
      await upload(curator, track.id, 'audio', readFileSync(f('blip.m4a')), 'audio/mp4');
      const res = await cur('post', `/tracks/${track.id}/audio/complete`, { body: {} }).expect(400);
      expect(JSON.stringify(res.body)).toMatch(/length_out_of_range/);
      await cur('post', `/tracks/${track.id}/audio/upload`, {
        body: { contentType: 'video/mp4', sizeBytes: 100 },
      }).expect(415);
      await cur('post', `/tracks/${track.id}/audio/upload`, {
        body: { contentType: 'audio/mp4', sizeBytes: 41 * 1024 * 1024 },
      }).expect(413);
      await cur('post', `/tracks/${track.id}/cover/upload`, {
        body: { contentType: 'image/gif', sizeBytes: 100 },
      }).expect(415);
    });

    it('says so when "complete" is called before anything was uploaded', async () => {
      const track = await newTrack();
      await cur('post', `/tracks/${track.id}/audio/complete`, { body: {} }).expect(409);
      await cur('post', `/tracks/${track.id}/cover/complete`).expect(409);
    });

    it('resizes the cover to a small JPEG', async () => {
      const track = await newTrack();
      await upload(curator, track.id, 'cover', cover, 'image/jpeg');
      const done = await cur('post', `/tracks/${track.id}/cover/complete`).expect(200);
      expect(done.body.data.coverUrl).toMatch(/music\/.+\/cover\.jpg\?e=/);
      const img = await t.http.get(pathOf(done.body.data.coverUrl)).expect(200);
      expect(img.headers['content-type']).toMatch(/image\/jpeg/);
      expect(Number(img.headers['content-length'])).toBeLessThan(cover.length);
    });

    it('does not let the files of a live track be swapped', async () => {
      const track = await live();
      await cur('post', `/tracks/${track.id}/audio/upload`, {
        body: { contentType: 'audio/mp4', sizeBytes: 100 },
      }).expect(409);
      await cur('post', `/tracks/${track.id}/cover/upload`, {
        body: { contentType: 'image/jpeg', sizeBytes: 100 },
      }).expect(409);
    });
  });

  // ----------------------------------------------------------- going live --

  describe('making a track available', () => {
    it('will not go live without audio, countries, uses or a licence, and says which', async () => {
      const bare = await newTrack();
      let res = await cur('post', `/tracks/${bare.id}/activate`, { body: reason }).expect(409);
      expect(res.body.error.message).toMatch(/audio/i);

      const track = await prepared();
      res = await cur('post', `/tracks/${track.id}/activate`, { body: reason }).expect(409);
      expect(res.body.error.message).toMatch(/country/i);

      await cur('patch', `/tracks/${track.id}`, {
        body: { allowedUses: ['REEL'], ...reason },
      }).expect(200);
      // No licence yet, so a country cannot even be chosen.
      const early = await cur('patch', `/tracks/${track.id}`, {
        body: { allowedCountries: ['IN'], ...reason },
      }).expect(409);
      expect(early.body.error.details.notCovered).toEqual(['IN']);

      const licenceId = await licence(track.id, { activate: false });
      // A recorded but pending licence is not a running one.
      await cur('patch', `/tracks/${track.id}`, {
        body: { allowedCountries: ['IN'], ...reason },
      }).expect(409);
      await lic('post', `/licences/${licenceId}/activate`, { body: reason }).expect(200);
      await cur('patch', `/tracks/${track.id}`, {
        body: { allowedCountries: ['IN'], ...reason },
      }).expect(200);
      const live = await cur('post', `/tracks/${track.id}/activate`, { body: reason }).expect(200);
      expect(live.body.data.status).toBe('ACTIVE');
      expect(live.body.data.licenceExpiresAt).toBe('2035-01-01T00:00:00.000Z');
    });

    it('does not offer countries a licence does not cover', async () => {
      const track = await prepared();
      await licence(track.id, { territories: ['IN', 'NP'] });
      const res = await cur('patch', `/tracks/${track.id}`, {
        body: { allowedCountries: ['IN', 'us', 'NP'].map((c) => c.toUpperCase()), ...reason },
      }).expect(409);
      expect(res.body.error.details.notCovered).toEqual(['US']);
      await cur('patch', `/tracks/${track.id}`, {
        body: { allowedCountries: ['NP', 'IN'], ...reason },
      }).expect(200);
      expect((await row(track.id)).allowed_countries).toEqual(['IN', 'NP']);
    });

    it('treats a worldwide licence as covering every country', async () => {
      const track = await prepared();
      await licence(track.id, { territories: ['WW'], expiresAt: null });
      await cur('patch', `/tracks/${track.id}`, {
        body: { allowedCountries: ['IN', 'US', 'GB'], allowedUses: ['REEL'], ...reason },
      }).expect(200);
      const live = await cur('post', `/tracks/${track.id}/activate`, { body: reason }).expect(200);
      // A licence with no end is shown as such.
      expect(live.body.data.licenceExpiresAt).toBe('perpetual');
    });

    it('lets platform-owned music go live with no licence, but only if licensing says it is owned', async () => {
      const track = await prepared();
      await cur('patch', `/tracks/${track.id}`, {
        body: { allowedCountries: ['IN'], allowedUses: ['REEL'], ...reason },
      }).expect(409);
      await lic('put', `/tracks/${track.id}/rights`, {
        body: { rightsType: 'PLATFORM_OWNED', reason: 'Commissioned in-house' },
      }).expect(200);
      await cur('patch', `/tracks/${track.id}`, {
        body: { allowedCountries: ['IN'], allowedUses: ['REEL'], ...reason },
      }).expect(200);
      await cur('post', `/tracks/${track.id}/activate`, { body: reason }).expect(200);
      expect((await listed(fan)).map((x) => x.id)).toContain(track.id);

      // Moving it back to licensed rights, with no licence, takes it down at once.
      const back = await lic('put', `/tracks/${track.id}/rights`, {
        body: { rightsType: 'LICENSED', reason: 'Rights were disputed' },
      }).expect(200);
      expect(back.body.data.status).toBe('SUSPENDED');
      expect((await listed(fan)).map((x) => x.id)).not.toContain(track.id);
    });

    it('needs a reason for every status change, and does not repeat one', async () => {
      const track = await live();
      await cur('post', `/tracks/${track.id}/suspend`, { body: {} }).expect(400);
      await cur('post', `/tracks/${track.id}/suspend`, { body: { reason: 'no' } }).expect(400);
      await cur('post', `/tracks/${track.id}/activate`, { body: reason }).expect(409); // already live
      await cur('post', `/tracks/${track.id}/suspend`, { body: reason }).expect(200);
      await cur('post', `/tracks/${track.id}/suspend`, { body: reason }).expect(409);
      await cur('post', `/tracks/${track.id}/restore`, { body: reason }).expect(200);
    });

    it('will not empty the countries of a live track', async () => {
      const track = await live();
      await cur('patch', `/tracks/${track.id}`, {
        body: { allowedCountries: [], ...reason },
      }).expect(409);
      expect((await row(track.id)).allowed_countries).toEqual(['IN']);
    });
  });

  // ------------------------------------------------------------- what people see --

  describe('what people see', () => {
    it('shows live music licensed for their country and use, without rights details or the full audio', async () => {
      const track = await live({ title: 'Visible In India' });
      const rows = await listed(fan);
      const mine = rows.find((x) => x.id === track.id)!;
      expect(mine).toBeTruthy();
      expect(Object.keys(mine).sort()).toEqual(
        [
          'artist',
          'categories',
          'coverUrl',
          'durationMs',
          'genre',
          'id',
          'language',
          'previewUrl',
          'reelsCount',
          'title',
        ].sort(),
      );
      expect(JSON.stringify(mine)).not.toMatch(/full\.m4a|licen|rights|audioKey|allowedCountries/i);
      const one = await fan.api('get', `/music/tracks/${track.id}`).expect(200);
      expect(one.body.data.id).toBe(track.id);
    });

    it('hides it from people in other countries, and for uses it was not granted', async () => {
      const track = await live({ title: 'India Only' });
      const abroad = await person(t);
      await t.db.query('UPDATE profiles SET country = $1 WHERE user_id = $2', ['US', abroad.id]);
      expect((await listed(abroad)).map((x) => x.id)).not.toContain(track.id);
      await abroad.api('get', `/music/tracks/${track.id}`).expect(404);

      expect((await listed(fan, { use: 'REEL' })).map((x) => x.id)).toContain(track.id);
      expect((await listed(fan, { use: 'STORY' })).map((x) => x.id)).toContain(track.id);
      expect((await listed(fan, { use: 'ADVERTISING' })).map((x) => x.id)).not.toContain(track.id);
      expect((await listed(fan, { use: 'POST' })).map((x) => x.id)).not.toContain(track.id);
    });

    it('filters by category and name, and pages through with a cursor', async () => {
      const a = await live({ title: 'Raag Alpha', categories: ['INSTRUMENTAL'] });
      const b = await live({ title: 'Raag Beta', categories: ['INSTRUMENTAL', 'DEVOTIONAL'] });
      const c = await live({ title: 'Other Thing', categories: ['COMEDY'] });
      const byName = (await listed(fan, { q: 'raag' })).map((x) => x.id);
      expect(byName).toEqual(expect.arrayContaining([a.id, b.id]));
      expect(byName).not.toContain(c.id);
      const devotional = (await listed(fan, { category: 'DEVOTIONAL' })).map((x) => x.id);
      expect(devotional).toContain(b.id);
      expect(devotional).not.toContain(a.id);

      const first = await fan
        .api('get', '/music/tracks', { query: { q: 'raag', limit: 1 } })
        .expect(200);
      expect(first.body.data).toHaveLength(1);
      expect(first.body.meta.hasMore).toBe(true);
      const second = await fan
        .api('get', '/music/tracks', {
          query: { q: 'raag', limit: 1, cursor: first.body.meta.nextCursor },
        })
        .expect(200);
      expect(second.body.data).toHaveLength(1);
      expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
      await fan.api('get', '/music/tracks', { query: { category: 'NOPE' } }).expect(400);
      await fan.api('get', '/music/tracks', { query: { limit: 500 } }).expect(400);
    });

    it('puts the most used first', async () => {
      const quiet = await live({ title: 'Ordering quiet' });
      const busy = await live({ title: 'Ordering busy' });
      await t.db.query('UPDATE music_tracks SET reels_count = 500 WHERE id = $1', [busy.id]);
      const ids = (await listed(fan, { q: 'ordering' })).map((x) => x.id);
      expect(ids).toEqual([busy.id, quiet.id]);
    });

    it('lists the categories for the picker', async () => {
      const res = await fan.api('get', '/music/categories').expect(200);
      expect(res.body.data.map((c: any) => c.key)).toEqual(
        expect.arrayContaining(['TRENDING', 'HINDI', 'INSTRUMENTAL']),
      );
    });

    it('needs a sign-in', async () => {
      await t.http.get('/api/v1/music/tracks').expect(401);
    });

    it('stops offering a track the moment its licence date passes, before any job notices', async () => {
      const track = await live({ title: 'Lapses silently' });
      expect((await listed(fan)).map((x) => x.id)).toContain(track.id);
      await t.db.query(
        "UPDATE music_tracks SET licence_expires_at = now() - interval '1 minute' WHERE id = $1",
        [track.id],
      );
      expect((await listed(fan)).map((x) => x.id)).not.toContain(track.id);
      await fan.api('get', `/music/tracks/${track.id}`).expect(404);
    });

    it('hides a suspended track and brings it back when restored', async () => {
      const track = await live({ title: 'Pausable' });
      await cur('post', `/tracks/${track.id}/suspend`, {
        body: { reason: 'Rights holder asked us to pause' },
      }).expect(200);
      expect((await listed(fan)).map((x) => x.id)).not.toContain(track.id);
      await fan.api('get', `/music/tracks/${track.id}`).expect(404);
      await cur('post', `/tracks/${track.id}/restore`, { body: reason }).expect(200);
      expect((await listed(fan)).map((x) => x.id)).toContain(track.id);
    });
  });

  // ---------------------------------------------------------------- licences --

  describe('licences', () => {
    it('records who, which contract, where and when, without terms or amounts', async () => {
      const track = await prepared();
      const bad = (body: object) => lic('post', `/tracks/${track.id}/licences`, { body });
      const base = {
        licensor: 'Sangeet Records',
        reference: 'C-1',
        rightsType: 'LICENSED',
        territories: ['IN'],
        startsAt: '2025-01-01T00:00:00Z',
      };
      await bad({ ...base, expiresAt: '2024-01-01T00:00:00Z' }).expect(400); // ends before it starts
      await bad({ ...base, territories: [] }).expect(400);
      await bad({ ...base, territories: ['IND'] }).expect(400);
      await bad({ ...base, startsAt: 'yesterday' }).expect(400);
      await bad({ ...base, amount: 100000 }).expect(400);
      const ok = await bad({ ...base, territories: ['in', 'IN', 'np'] }).expect(201);
      expect(ok.body.data).toMatchObject({
        status: 'PENDING',
        territories: ['IN', 'NP'],
        hasDocument: false,
      });
      const list = await lic('get', `/tracks/${track.id}/licences`).expect(200);
      expect(list.body.data).toHaveLength(1);
    });

    it('cannot start before its start date or after it has ended', async () => {
      const track = await prepared();
      const future = await licence(track.id, {
        startsAt: '2099-01-01T00:00:00Z',
        expiresAt: '2100-01-01T00:00:00Z',
        activate: false,
      });
      await lic('post', `/licences/${future}/activate`, { body: reason }).expect(409);
      const past = await licence(track.id, {
        startsAt: '2001-01-01T00:00:00Z',
        expiresAt: '2002-01-01T00:00:00Z',
        activate: false,
      });
      await lic('post', `/licences/${past}/activate`, { body: reason }).expect(409);
    });

    it('takes a live track down the moment its only licence is revoked', async () => {
      const track = await live({ title: 'Loses its licence' });
      expect((await listed(fan)).map((x) => x.id)).toContain(track.id);
      const res = await lic('post', `/licences/${track.licenceId}/revoke`, {
        body: { reason: 'Licensor withdrew the catalogue' },
      }).expect(200);
      expect(res.body.data.status).toBe('REVOKED');
      expect((await cur('get', `/tracks/${track.id}`).expect(200)).body.data).toMatchObject({
        status: 'SUSPENDED',
        licenceExpiresAt: null,
      });
      expect((await listed(fan)).map((x) => x.id)).not.toContain(track.id);
      // It cannot simply be switched back on.
      const again = await cur('post', `/tracks/${track.id}/restore`, { body: reason }).expect(409);
      expect(again.body.error.details.reason).toBe('licence_missing');
      await lic('post', `/licences/${track.licenceId}/revoke`, { body: reason }).expect(409);
    });

    it('keeps a track live while another licence still runs', async () => {
      const track = await live({ title: 'Two licences' });
      await licence(track.id, { expiresAt: '2040-06-01T00:00:00Z' });
      await lic('post', `/licences/${track.licenceId}/revoke`, { body: reason }).expect(200);
      const got = (await cur('get', `/tracks/${track.id}`).expect(200)).body.data;
      expect(got.status).toBe('ACTIVE');
      expect(got.licenceExpiresAt).toBe('2040-06-01T00:00:00.000Z');
    });

    it('ends licences on time, takes their tracks off, and does so only once', async () => {
      const music = t.app.get(MusicAdminService, { strict: false });
      const track = await live({ title: 'Expires by itself' });
      const other = await live({ title: 'Does not expire' });
      await t.db.query(
        "UPDATE music_licences SET expires_at = now() - interval '1 hour' WHERE id = $1",
        [track.licenceId],
      );

      expect(await music.expireLicences()).toBeGreaterThanOrEqual(1);
      expect(await music.expireLicences()).toBe(0);

      expect((await row(track.id)).status).toBe('EXPIRED');
      expect((await row(other.id)).status).toBe('ACTIVE');
      const l = await t.db.query('SELECT status FROM music_licences WHERE id = $1', [
        track.licenceId,
      ]);
      expect(l.rows[0]!.status).toBe('EXPIRED');
      expect((await listed(fan)).map((x) => x.id)).not.toContain(track.id);
      const logged = await t.db.query(
        "SELECT actor_type FROM audit_logs WHERE action = 'music.licence_expired' AND target_id = $1",
        [track.licenceId],
      );
      expect(logged.rows).toEqual([{ actor_type: 'SYSTEM' }]);

      // A new licence lets it be restored.
      await cur('post', `/tracks/${track.id}/restore`, { body: reason }).expect(409);
      await licence(track.id);
      await cur('post', `/tracks/${track.id}/restore`, { body: reason }).expect(200);
    });

    it('keeps the signed document private: checked, never served, each view recorded', async () => {
      const track = await prepared();
      const licenceId = await licence(track.id, { activate: false });
      const pdf = Buffer.concat([
        Buffer.from('%PDF-1.4\n'),
        Buffer.alloc(600, 0x20),
        Buffer.from('\n%%EOF'),
      ]);

      // Not a document: removed.
      const html = Buffer.from('<html><script>alert(1)</script></html>'.repeat(5));
      let start = await lic('post', `/licences/${licenceId}/document/upload`, {
        body: { contentType: 'application/pdf', sizeBytes: html.length },
      }).expect(200);
      await putBytes(t, start.body.data.upload, html).expect(200);
      await lic('post', `/licences/${licenceId}/document/complete`).expect(400);
      const storage = t.app.get(ObjectStorage, { strict: false });
      const bucket = t.app.get<string>(MEDIA_BUCKET, { strict: false });
      expect(await storage.head(bucket, `music-licences/${licenceId}/document`)).toBeNull();

      await lic('post', `/licences/${licenceId}/document/upload`, {
        body: { contentType: 'image/gif', sizeBytes: 100 },
      }).expect(415);

      start = await lic('post', `/licences/${licenceId}/document/upload`, {
        body: { contentType: 'application/pdf', sizeBytes: pdf.length },
      }).expect(200);
      await putBytes(t, start.body.data.upload, pdf).expect(200);
      const done = await lic('post', `/licences/${licenceId}/document/complete`).expect(200);
      expect(done.body.data.hasDocument).toBe(true);
      expect(JSON.stringify(done.body)).not.toMatch(/music-licences|document_key|documentKey/);

      // Only licensing staff can ask for it, and each time is written to the sensitive trail.
      await cur('get', `/licences/${licenceId}/document`).expect(403);
      await as(analyst)('get', `/licences/${licenceId}/document`).expect(403);
      const link = await lic('get', `/licences/${licenceId}/document`).expect(200);
      expect(link.body.data.url).toMatch(/^https?:\/\//);
      expect(link.body.data.expiresInSeconds).toBe(120);
      const logged = await t.db.query(
        "SELECT sensitive FROM audit_logs WHERE action = 'music.licence_document_viewed' AND target_id = $1",
        [licenceId],
      );
      expect(logged.rows).toEqual([{ sensitive: true }]);

      // It cannot be fetched through the public media route, even with a "signature".
      await t.http
        .get(`/api/v1/media/f/music-licences/${licenceId}/document?e=9999999999&s=AAAA`)
        .expect(404);
      await lic('get', `/licences/${track.id}/document`).expect(404);
    });
  });

  // ------------------------------------------------------------------- audit --

  describe('the audit trail', () => {
    it('records every change with who made it and why, in the same transaction', async () => {
      const track = await live({ title: 'Audited' });
      await cur('post', `/tracks/${track.id}/suspend`, {
        body: { reason: 'Quality complaint from the rights holder' },
      }).expect(200);
      const rows = await t.db.query<{
        action: string;
        actor_label: string;
        reason: string | null;
        before: any;
        after: any;
      }>(
        'SELECT action, actor_label, reason, before, after FROM audit_logs WHERE target_id = $1 ORDER BY created_at, id',
        [track.id],
      );
      const actions = rows.rows.map((r) => r.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'music.track_created',
          'music.audio_uploaded',
          'music.cover_uploaded',
          'music.track_updated',
          'music.track_activated',
          'music.track_suspended',
        ]),
      );
      const suspended = rows.rows.find((r) => r.action === 'music.track_suspended')!;
      expect(suspended.reason).toBe('Quality complaint from the rights holder');
      expect(suspended.before).toEqual({ status: 'ACTIVE' });
      expect(suspended.after).toEqual({ status: 'SUSPENDED' });
      expect(suspended.actor_label).toBeTruthy();
      const updated = rows.rows.find((r) => r.action === 'music.track_updated')!;
      expect(updated.after).toMatchObject({ allowedCountries: ['IN'] });

      const lrows = await t.db.query(
        'SELECT action FROM audit_logs WHERE target_id = $1 ORDER BY created_at',
        [track.licenceId],
      );
      expect(lrows.rows.map((r) => r.action)).toEqual([
        'music.licence_created',
        'music.licence_activated',
      ]);
    });

    it('leaves no half-done change when a status change is refused', async () => {
      const track = await prepared();
      const before = await t.db.query(
        'SELECT count(*)::int AS n FROM audit_logs WHERE target_id = $1',
        [track.id],
      );
      await cur('post', `/tracks/${track.id}/activate`, { body: reason }).expect(409);
      const after = await t.db.query(
        'SELECT count(*)::int AS n FROM audit_logs WHERE target_id = $1',
        [track.id],
      );
      expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
      expect((await row(track.id)).status).toBe('DRAFT');
    });
  });
});
