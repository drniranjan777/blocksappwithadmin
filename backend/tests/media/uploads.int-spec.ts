import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UploadsService } from '../../src/media/uploads/uploads.service.js';
import { ObjectStorage } from '../../src/media/storage/object-storage.js';
import { LocalObjectStorage } from '../../src/media/storage/local-object-storage.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV } from '../support/auth.js';
import { fakeJpeg, pathOf, putBytes, storageEnv, uploadSmall } from '../support/media.js';
import { person, type Person } from '../support/social.js';

const MiB = 1024 * 1024;

describe('uploading media', () => {
  let t: TestApp;
  let dir: string;

  beforeAll(async () => {
    const env = storageEnv();
    dir = env.STORAGE_LOCAL_DIR;
    t = await createTestApp({ ...AUTH_TEST_ENV, ...env });
  });
  afterAll(async () => {
    await t.close();
  });

  const start = (p: Person, over: Record<string, unknown> = {}) =>
    p.api('post', '/media/uploads', {
      body: {
        purpose: 'POST_IMAGE',
        kind: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 2048,
        ...over,
      },
    });
  const asset = async (id: string) =>
    (await t.db.query<Record<string, any>>('SELECT * FROM media_assets WHERE id = $1', [id]))
      .rows[0]!;

  describe('announcing a file', () => {
    it('gives a signed address, and creates an asset the server names itself', async () => {
      const me = await person(t);
      const res = await start(me, { filename: '../../etc/passwd' }).expect(201);
      const d = res.body.data;
      expect(d).toMatchObject({
        mode: 'single',
        upload: { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' } },
      });
      expect(new Date(d.expiresAt).getTime()).toBeGreaterThan(Date.now() + 800_000);
      expect(pathOf(d.upload.url)).toMatch(/^\/api\/v1\/media\/local-upload\//);

      const row = await asset(d.assetId);
      expect(row).toMatchObject({
        owner_id: me.id,
        kind: 'IMAGE',
        purpose: 'POST_IMAGE',
        status: 'PENDING_UPLOAD',
        declared_mime: 'image/jpeg',
        declared_size_bytes: 2048,
      });
      // The stored name is ours alone: no trace of what the client called it.
      expect(row.storage_key).toMatch(/^orig\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
      expect(row.storage_key).not.toMatch(/passwd|etc/);
      expect(row.original_filename).toBe('.._.._etc_passwd');
      // And the response never shows where it lives.
      expect(JSON.stringify(res.body)).not.toMatch(/storageKey|storage_key|blocks-media|bucket/i);
      const session = await t.db.query<{ status: string; total_bytes: number }>(
        'SELECT status, total_bytes FROM upload_sessions WHERE id = $1',
        [d.sessionId],
      );
      expect(session.rows[0]).toEqual({ status: 'OPEN', total_bytes: 2048 });
    });

    it('allows only listed purposes, kinds and types', async () => {
      const me = await person(t);
      // Purposes the app may never upload: they come from the server or from staff.
      for (const purpose of [
        'REEL_VIDEO',
        'MUSIC_PREVIEW',
        'MUSIC_COVER',
        'KYC_DOCUMENT',
        'NOT_A_PURPOSE',
      ]) {
        const res = await start(me, { purpose });
        expect(res.status, purpose).toBe(400);
      }
      // A video where only images are allowed.
      const wrongKind = await start(me, {
        purpose: 'AVATAR',
        kind: 'VIDEO',
        contentType: 'video/mp4',
      }).expect(400);
      expect(JSON.stringify(wrongKind.body.error.details)).toContain('not_allowed_for_this_kind');
      await start(me, { kind: 'AUDIO' }).expect(400);

      for (const contentType of [
        'image/gif',
        'image/svg+xml',
        'text/html',
        'application/x-msdownload',
        'application/pdf',
        'image/jpeg2',
        '',
      ]) {
        const res = await start(me, { contentType });
        expect(res.status, contentType).toBeGreaterThanOrEqual(400);
        expect(res.status).not.toBe(201);
      }
      const svg = await start(me, { contentType: 'image/svg+xml' }).expect(415);
      expect(svg.body.error.code).toBe('UNSUPPORTED_MEDIA');
      expect(svg.body.error.details.allowed).toEqual(['image/jpeg', 'image/png', 'image/webp']);
      // A type given in upper case is the same type.
      await start(me, { contentType: 'IMAGE/JPEG' }).expect(201);
    });

    it('enforces size limits per purpose, and sanity on the number', async () => {
      const me = await person(t);
      const big = await start(me, { purpose: 'AVATAR', sizeBytes: 5 * MiB + 1 }).expect(413);
      expect(big.body.error).toMatchObject({
        code: 'PAYLOAD_TOO_LARGE',
        details: { maxBytes: 5 * MiB },
      });
      await start(me, { purpose: 'AVATAR', sizeBytes: 5 * MiB }).expect(201);
      for (const sizeBytes of [0, -5, 1.5, '100', null, 3_000_000_000]) {
        const res = await start(me, { sizeBytes });
        expect(res.status, String(sizeBytes)).toBe(400);
      }
      await start(me, {
        purpose: 'STORY',
        kind: 'VIDEO',
        contentType: 'video/mp4',
        sizeBytes: 100 * MiB + 1,
      }).expect(413);
    });

    it('is only for signed-in, active people, and does not accept extra fields', async () => {
      await t.http.post('/api/v1/media/uploads').send({}).expect(401);
      const me = await person(t);
      await start(me, { owner: 'someone-else' }).expect(400);
      await start(me, { storageKey: 'orig/mine.jpg' }).expect(400);
      await start(me, { bucket: 'other' }).expect(400);
      const leaving = await person(t);
      await leaving
        .api('post', '/account/deletion/request', { body: { password: leaving.password } })
        .expect(200);
      await start(leaving).expect(403);
    });

    it('limits how many uploads can be waiting at once, and how many bytes a day', async () => {
      const waiting = await person(t);
      for (let i = 0; i < 30; i++) await start(waiting).expect(201);
      const refused = await start(waiting).expect(429);
      expect(refused.body.error.code).toBe('RATE_LIMITED');

      const heavy = await person(t);
      let accepted = 0;
      let status = 201;
      for (let i = 0; i < 10 && status === 201; i++) {
        status = (
          await start(heavy, {
            purpose: 'REEL_CLIP',
            kind: 'VIDEO',
            contentType: 'video/mp4',
            sizeBytes: 250 * MiB,
          })
        ).status;
        if (status === 201) accepted++;
      }
      // 2 GiB a day: eight 250 MiB clips fit, the ninth does not.
      expect(accepted).toBe(8);
      expect(status).toBe(429);
    }, 60_000);
  });

  describe('sending and finishing', () => {
    it('stores the bytes where the address says, then queues the file for checking', async () => {
      const me = await person(t);
      const bytes = fakeJpeg(3000);
      const res = await start(me, { sizeBytes: 3000 }).expect(201);
      const { upload, assetId, sessionId } = res.body.data;
      const put = await putBytes(t, upload, bytes).expect(200);
      expect(put.headers['etag']).toMatch(/^"[0-9a-f]{32}"$/);

      const done = await me
        .api('post', `/media/uploads/${sessionId}/complete`, { body: {} })
        .expect(200);
      expect(done.body.data).toMatchObject({
        id: assetId,
        status: 'UPLOADED',
        ready: false,
        purpose: 'POST_IMAGE',
      });
      const row = await asset(assetId);
      expect(row).toMatchObject({ status: 'UPLOADED', size_bytes: 3000 });
      expect(readFileSync(join(dir, row.bucket, row.storage_key))).toEqual(bytes);
      const jobs = await t.db.query<{ type: string; status: string }>(
        'SELECT type, status FROM media_jobs WHERE asset_id = $1',
        [assetId],
      );
      expect(jobs.rows).toEqual([{ type: 'VALIDATE', status: 'QUEUED' }]);
    });

    it('can be finished twice without doing the work twice', async () => {
      const me = await person(t);
      const { assetId, sessionId } = await uploadSmall(t, me);
      const again = await me
        .api('post', `/media/uploads/${sessionId}/complete`, { body: {} })
        .expect(200);
      expect(again.body.data.id).toBe(assetId);
      const jobs = await t.db.query('SELECT 1 FROM media_jobs WHERE asset_id = $1', [assetId]);
      expect(jobs.rowCount).toBe(1);
      const both = await Promise.all([
        me.api('post', `/media/uploads/${sessionId}/complete`, { body: {} }),
        me.api('post', `/media/uploads/${sessionId}/complete`, { body: {} }),
      ]);
      expect(both.map((r) => r.status)).toEqual([200, 200]);
      expect(
        (await t.db.query('SELECT 1 FROM media_jobs WHERE asset_id = $1', [assetId])).rowCount,
      ).toBe(1);
    });

    it('refuses to finish before anything arrives', async () => {
      const me = await person(t);
      const { sessionId } = (await start(me).expect(201)).body.data;
      const res = await me
        .api('post', `/media/uploads/${sessionId}/complete`, { body: {} })
        .expect(409);
      expect(res.body.error.message).toMatch(/nothing has been uploaded/i);
    });

    it('rejects a file that is not the size announced, and deletes it', async () => {
      const me = await person(t);
      const res = await start(me, { sizeBytes: 2048 }).expect(201);
      const { upload, assetId, sessionId } = res.body.data;
      await putBytes(t, upload, fakeJpeg(2048)).expect(200);
      // Something swaps the object for a different size before the app says "done".
      const row = await asset(assetId);
      writeFileSync(join(dir, row.bucket, row.storage_key), Buffer.alloc(500));
      const done = await me
        .api('post', `/media/uploads/${sessionId}/complete`, { body: {} })
        .expect(400);
      expect(done.body.error.message).toMatch(/not the size/i);
      expect(existsSync(join(dir, row.bucket, row.storage_key))).toBe(false);
      expect(await asset(assetId)).toMatchObject({
        status: 'FAILED',
        failure_code: 'SIZE_MISMATCH',
      });
      expect(
        (await t.db.query('SELECT 1 FROM media_jobs WHERE asset_id = $1', [assetId])).rowCount,
      ).toBe(0);
    });

    it('does not accept a different size or type at the address, whoever sends it', async () => {
      const me = await person(t);
      const res = await start(me, { sizeBytes: 100 }).expect(201);
      const { upload } = res.body.data;
      await putBytes(t, upload, Buffer.alloc(101)).expect(400);
      await putBytes(t, upload, Buffer.alloc(99)).expect(400);
      await putBytes(
        t,
        { ...upload, headers: { 'Content-Type': 'text/html' } },
        Buffer.alloc(100),
      ).expect(415);
      await putBytes(t, upload, Buffer.alloc(100)).expect(200);
    });

    it('rejects forged and expired addresses', async () => {
      const me = await person(t);
      const { upload } = (await start(me).expect(201)).body.data;
      const path = pathOf(upload.url);
      await t.http.put(`${path}x`).set(upload.headers).send(fakeJpeg()).expect(403);
      await t.http
        .put('/api/v1/media/local-upload/not.atoken')
        .set(upload.headers)
        .send(fakeJpeg())
        .expect(403);
      await t.http
        .put('/api/v1/media/local-upload/abc')
        .set(upload.headers)
        .send(fakeJpeg())
        .expect(403);
    });

    it('belongs to the person who started it', async () => {
      const me = await person(t);
      const other = await person(t);
      const { sessionId, assetId } = await uploadSmall(t, me);
      await other.api('post', `/media/uploads/${sessionId}/complete`, { body: {} }).expect(404);
      await other.api('delete', `/media/uploads/${sessionId}`).expect(404);
      await other.api('get', `/media/${assetId}`).expect(404);
      await other
        .api('post', `/media/uploads/${sessionId}/parts`, { body: { partNumbers: [1] } })
        .expect(404);
      await me.api('get', `/media/${assetId}`).expect(200);
    });

    it('shows its owner where it is, without internals', async () => {
      const me = await person(t);
      const { assetId } = await uploadSmall(t, me);
      const res = await me.api('get', `/media/${assetId}`).expect(200);
      expect(Object.keys(res.body.data).sort()).toEqual(
        [
          'createdAt',
          'durationMs',
          'failureCode',
          'height',
          'id',
          'kind',
          'moderation',
          'purpose',
          'ready',
          'status',
          'width',
        ].sort(),
      );
      await me.api('get', '/media/not-a-uuid').expect(400);
      await me.api('get', '/media/01990000-0000-7000-8000-000000000001').expect(404);
    });
  });

  describe('large files', () => {
    it('go in parts of 8 MiB that are sent independently and joined at the end', async () => {
      const me = await person(t);
      const size = 17 * MiB;
      const res = await start(me, {
        purpose: 'REEL_CLIP',
        kind: 'VIDEO',
        contentType: 'video/mp4',
        sizeBytes: size,
      }).expect(201);
      const { assetId, sessionId } = res.body.data;
      expect(res.body.data).toMatchObject({
        mode: 'multipart',
        multipart: { partSizeBytes: 8 * MiB, partCount: 3 },
      });
      expect(res.body.data.upload).toBeUndefined();

      const addresses = (
        await me
          .api('post', `/media/uploads/${sessionId}/parts`, { body: { partNumbers: [1, 2, 3] } })
          .expect(200)
      ).body.data.parts;
      expect(
        addresses.map((p: { partNumber: number; sizeBytes: number }) => [
          p.partNumber,
          p.sizeBytes,
        ]),
      ).toEqual([
        [1, 8 * MiB],
        [2, 8 * MiB],
        [3, MiB],
      ]);

      const content = Buffer.alloc(size);
      for (let i = 0; i < size; i += 4096) content.writeUInt32BE(i / 4096, i);
      const etags: Array<{ partNumber: number; etag: string }> = [];
      // Out of order, as a real uploader running parts in parallel would.
      for (const p of [addresses[2], addresses[0], addresses[1]]) {
        const slice = content.subarray(
          (p.partNumber - 1) * 8 * MiB,
          (p.partNumber - 1) * 8 * MiB + p.sizeBytes,
        );
        const put = await putBytes(t, p, slice).expect(200);
        etags.push({ partNumber: p.partNumber, etag: put.headers['etag'] as string });
      }
      const done = await me
        .api('post', `/media/uploads/${sessionId}/complete`, { body: { parts: etags } })
        .expect(200);
      expect(done.body.data.status).toBe('UPLOADED');
      const row = await asset(assetId);
      expect(readFileSync(join(dir, row.bucket, row.storage_key)).equals(content)).toBe(true);
      expect(
        (await t.db.query('SELECT 1 FROM media_jobs WHERE asset_id = $1', [assetId])).rowCount,
      ).toBe(1);
    }, 60_000);

    it('cannot be finished with parts missing, wrong, or duplicated', async () => {
      const me = await person(t);
      const res = await start(me, {
        purpose: 'REEL_CLIP',
        kind: 'VIDEO',
        contentType: 'video/mp4',
        sizeBytes: 17 * MiB,
      }).expect(201);
      const { sessionId } = res.body.data;
      const only = [{ partNumber: 1, etag: 'abc' }];
      await me
        .api('post', `/media/uploads/${sessionId}/complete`, { body: { parts: only } })
        .expect(400);
      await me.api('post', `/media/uploads/${sessionId}/complete`, { body: {} }).expect(400);
      const dup = [1, 1, 3].map((partNumber) => ({ partNumber, etag: 'abc' }));
      await me
        .api('post', `/media/uploads/${sessionId}/complete`, { body: { parts: dup } })
        .expect(400);
      const bad = [1, 2, 3].map((partNumber) => ({ partNumber, etag: 'deadbeef' }));
      const joined = await me
        .api('post', `/media/uploads/${sessionId}/complete`, { body: { parts: bad } })
        .expect(409);
      expect(joined.body.error.code).toBe('CONFLICT');
    });

    it('only hands out addresses for parts that exist, on uploads that need parts', async () => {
      const me = await person(t);
      const big = (
        await start(me, {
          purpose: 'REEL_CLIP',
          kind: 'VIDEO',
          contentType: 'video/mp4',
          sizeBytes: 17 * MiB,
        }).expect(201)
      ).body.data;
      for (const partNumbers of [[0], [4], [-1], [1.5], []]) {
        const res = await me.api('post', `/media/uploads/${big.sessionId}/parts`, {
          body: { partNumbers },
        });
        expect(res.status, JSON.stringify(partNumbers)).toBe(400);
      }
      const small = (await start(me).expect(201)).body.data;
      await me
        .api('post', `/media/uploads/${small.sessionId}/parts`, { body: { partNumbers: [1] } })
        .expect(409);
    });
  });

  describe('giving up', () => {
    it('cancels, removes what was sent, and cannot then be finished', async () => {
      const me = await person(t);
      const res = await start(me).expect(201);
      const { upload, assetId, sessionId } = res.body.data;
      await putBytes(t, upload, fakeJpeg()).expect(200);
      const row = await asset(assetId);
      await me.api('delete', `/media/uploads/${sessionId}`).expect(204);
      await me.api('delete', `/media/uploads/${sessionId}`).expect(204);
      expect(existsSync(join(dir, row.bucket, row.storage_key))).toBe(false);
      expect(await asset(assetId)).toMatchObject({ status: 'DELETED' });
      await me.api('post', `/media/uploads/${sessionId}/complete`, { body: {} }).expect(409);
      await me.api('get', `/media/${assetId}`).expect(404);
    });

    it('lets stale uploads expire and tidies up after them', async () => {
      const me = await person(t);
      const res = await start(me).expect(201);
      const { upload, assetId, sessionId } = res.body.data;
      await putBytes(t, upload, fakeJpeg()).expect(200);
      const big = (
        await start(me, {
          purpose: 'REEL_CLIP',
          kind: 'VIDEO',
          contentType: 'video/mp4',
          sizeBytes: 17 * MiB,
        }).expect(201)
      ).body.data;
      await t.db.query(
        "UPDATE upload_sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1",
        [me.id],
      );

      const uploads = t.app.get(UploadsService, { strict: false });
      expect(await uploads.expireStale()).toBe(2);
      const row = await asset(assetId);
      expect(row).toMatchObject({ status: 'DELETED', failure_code: 'UPLOAD_EXPIRED' });
      expect(existsSync(join(dir, row.bucket, row.storage_key))).toBe(false);
      const sessions = await t.db.query<{ status: string }>(
        'SELECT status FROM upload_sessions WHERE user_id = $1',
        [me.id],
      );
      expect(sessions.rows.map((s) => s.status)).toEqual(['EXPIRED', 'EXPIRED']);
      await me.api('post', `/media/uploads/${sessionId}/complete`, { body: {} }).expect(409);
      await me
        .api('post', `/media/uploads/${big.sessionId}/parts`, { body: { partNumbers: [1] } })
        .expect(409);
      expect(await uploads.expireStale()).toBe(0);
    });

    it('also refuses to finish an upload whose time ran out, and cleans it up', async () => {
      const me = await person(t);
      const { upload, assetId, sessionId } = (await start(me).expect(201)).body.data;
      await putBytes(t, upload, fakeJpeg()).expect(200);
      await t.db.query(
        "UPDATE upload_sessions SET expires_at = now() - interval '1 second' WHERE id = $1",
        [sessionId],
      );
      const res = await me
        .api('post', `/media/uploads/${sessionId}/complete`, { body: {} })
        .expect(409);
      expect(res.body.error.message).toMatch(/expired/i);
      expect(await asset(assetId)).toMatchObject({ status: 'DELETED' });
    });
  });

  describe('delivery from local storage', () => {
    it('serves a stored file through a signed, expiring address, safely', async () => {
      const me = await person(t);
      const bytes = fakeJpeg(1000);
      const { assetId } = await uploadSmall(t, me, { bytes });
      const row = await asset(assetId);
      const storage = t.app.get(ObjectStorage, { strict: false }) as LocalObjectStorage;
      const url = await storage.presignDownload(row.bucket, row.storage_key, 60);

      const res = await t.http
        .get(pathOf(url))
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.body).toEqual(bytes);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toBe('inline');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['content-length']).toBe('1000');
    });

    it('answers byte-range requests, as video players need when seeking', async () => {
      const me = await person(t);
      const { assetId } = await uploadSmall(t, me, { bytes: fakeJpeg(1000) });
      const row = await asset(assetId);
      const storage = t.app.get(ObjectStorage, { strict: false }) as LocalObjectStorage;
      const path = pathOf(await storage.presignDownload(row.bucket, row.storage_key, 60));
      const part = await t.http.get(path).set('Range', 'bytes=10-19');
      expect(part.status).toBe(206);
      expect(part.headers['content-range']).toBe('bytes 10-19/1000');
      expect(part.headers['content-length']).toBe('10');
      const tail = await t.http.get(path).set('Range', 'bytes=-100');
      expect(tail.status).toBe(206);
      expect(tail.headers['content-range']).toBe('bytes 900-999/1000');
      const beyond = await t.http.get(path).set('Range', 'bytes=5000-6000');
      expect(beyond.status).toBe(416);
    });

    it('refuses forged tokens and a file that is gone', async () => {
      const me = await person(t);
      const { assetId } = await uploadSmall(t, me);
      const row = await asset(assetId);
      const storage = t.app.get(ObjectStorage, { strict: false }) as LocalObjectStorage;
      const path = pathOf(await storage.presignDownload(row.bucket, row.storage_key, 60));
      await t.http.get(`${path}x`).expect(403);
      await t.http.get('/api/v1/media/local-download/forged.token').expect(403);
      // An upload address is not a download address.
      const upload = await storage.presignUpload({
        bucket: row.bucket,
        key: 'orig/other.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1,
        ttlSeconds: 60,
      });
      await t.http.get(pathOf(upload.url).replace('local-upload', 'local-download')).expect(403);
      await storage.delete(row.bucket, row.storage_key);
      await t.http.get(path).expect(404);
    });
  });
});
