import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalObjectStorage, UploadRejected } from './local-object-storage.js';

const BUCKET = 'test-media';
const tokenOf = (url: string) => url.slice(url.lastIndexOf('/') + 1);
const body = (bytes: Buffer) => Readable.from([bytes]);

describe('local object storage', () => {
  let dir: string;
  let storage: LocalObjectStorage;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'blocks-storage-'));
    storage = new LocalObjectStorage(
      dir,
      'a-signing-key-for-tests-only-0123456789',
      'http://api.test',
    );
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const put = async (key: string, bytes: Buffer, type = 'image/jpeg') => {
    const req = await storage.presignUpload({
      bucket: BUCKET,
      key,
      contentType: type,
      sizeBytes: bytes.length,
      ttlSeconds: 60,
    });
    return storage.acceptUpload(tokenOf(req.url), body(bytes), type);
  };

  describe('uploads', () => {
    it('accepts exactly the signed number of bytes of the signed type, and returns an ETag like S3', async () => {
      const bytes = Buffer.from('hello world, this is a photo');
      const { etag } = await put('orig/2026/10/a.jpg', bytes);
      expect(etag).toBe(createHash('md5').update(bytes).digest('hex'));
      expect(await storage.head(BUCKET, 'orig/2026/10/a.jpg')).toEqual({
        sizeBytes: bytes.length,
        contentType: 'image/jpeg',
      });
      expect(readFileSync(join(dir, BUCKET, 'orig/2026/10/a.jpg'))).toEqual(bytes);
    });

    it('describes the request the client must make', async () => {
      const req = await storage.presignUpload({
        bucket: BUCKET,
        key: 'orig/b.png',
        contentType: 'image/png',
        sizeBytes: 10,
        ttlSeconds: 120,
      });
      expect(req.method).toBe('PUT');
      expect(req.url).toMatch(/^http:\/\/api\.test\/api\/v1\/media\/local-upload\/[\w-]+\.[\w-]+$/);
      expect(req.headers).toEqual({ 'Content-Type': 'image/png' });
      expect(req.expiresAt.getTime()).toBeGreaterThan(Date.now() + 100_000);
    });

    it('refuses more bytes than signed, and leaves nothing behind', async () => {
      const req = await storage.presignUpload({
        bucket: BUCKET,
        key: 'orig/big.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 10,
        ttlSeconds: 60,
      });
      await expect(
        storage.acceptUpload(tokenOf(req.url), body(Buffer.alloc(11)), 'image/jpeg'),
      ).rejects.toMatchObject({ reason: 'wrong_size' });
      expect(await storage.head(BUCKET, 'orig/big.jpg')).toBeNull();
      expect(readdirSync(join(dir, BUCKET, 'orig')).filter((f) => f.startsWith('big'))).toEqual([]);
    });

    it('refuses fewer bytes than signed, and a different content type', async () => {
      const req = await storage.presignUpload({
        bucket: BUCKET,
        key: 'orig/short.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 10,
        ttlSeconds: 60,
      });
      await expect(
        storage.acceptUpload(tokenOf(req.url), body(Buffer.alloc(9)), 'image/jpeg'),
      ).rejects.toMatchObject({ reason: 'wrong_size' });
      await expect(
        storage.acceptUpload(tokenOf(req.url), body(Buffer.alloc(10)), 'text/html'),
      ).rejects.toMatchObject({ reason: 'wrong_type' });
      await expect(
        storage.acceptUpload(tokenOf(req.url), body(Buffer.alloc(10)), undefined),
      ).rejects.toMatchObject({ reason: 'wrong_type' });
      expect(await storage.head(BUCKET, 'orig/short.jpg')).toBeNull();
      // The right request still works afterwards.
      await storage.acceptUpload(
        tokenOf(req.url),
        body(Buffer.alloc(10)),
        'image/jpeg; charset=binary',
      );
    });

    it('refuses a forged, edited, truncated or expired address', async () => {
      const req = await storage.presignUpload({
        bucket: BUCKET,
        key: 'orig/c.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 4,
        ttlSeconds: 60,
      });
      const token = tokenOf(req.url);
      const [payload, sig] = token.split('.') as [string, string];
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
        string,
        unknown
      >;
      const edited = Buffer.from(
        JSON.stringify({ ...claims, sz: 4_000_000, k: 'orig/other.jpg' }),
      ).toString('base64url');
      for (const bad of [
        `${edited}.${sig}`,
        `${payload}.${sig.slice(0, -2)}xx`,
        payload,
        'x.y',
        '',
        `${payload}.`,
      ]) {
        await expect(
          storage.acceptUpload(bad, body(Buffer.alloc(4)), 'image/jpeg'),
        ).rejects.toBeInstanceOf(UploadRejected);
      }
      const other = new LocalObjectStorage(
        dir,
        'a-different-key-0123456789abcdef',
        'http://api.test',
      );
      await expect(
        other.acceptUpload(token, body(Buffer.alloc(4)), 'image/jpeg'),
      ).rejects.toMatchObject({ reason: 'bad_token' });

      const expired = await storage.presignUpload({
        bucket: BUCKET,
        key: 'orig/d.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 4,
        ttlSeconds: 1,
      });
      await new Promise((r) => setTimeout(r, 2100));
      await expect(
        storage.acceptUpload(tokenOf(expired.url), body(Buffer.alloc(4)), 'image/jpeg'),
      ).rejects.toMatchObject({ reason: 'expired' });
    }, 10_000);

    it('does not let a download address be used to upload', async () => {
      await put('orig/e.jpg', Buffer.from('abcd'));
      const url = await storage.presignDownload(BUCKET, 'orig/e.jpg', 60);
      await expect(
        storage.acceptUpload(tokenOf(url), body(Buffer.alloc(4)), 'image/jpeg'),
      ).rejects.toMatchObject({ reason: 'bad_token' });
    });
  });

  describe('keys stay inside the storage directory', () => {
    it('rejects anything that could escape or is not a plain name', async () => {
      const ask = (bucket: string, key: string) =>
        storage.presignUpload({
          bucket,
          key,
          contentType: 'image/jpeg',
          sizeBytes: 1,
          ttlSeconds: 60,
        });
      for (const key of [
        '../escape.jpg',
        'a/../../escape.jpg',
        '/abs/path.jpg',
        'a//b.jpg',
        'a/./b.jpg',
        'a\\b.jpg',
        'a/b\0.jpg',
        '',
        'x'.repeat(600),
        '.hidden',
      ]) {
        await expect(ask(BUCKET, key), JSON.stringify(key)).rejects.toThrow();
      }
      for (const bucket of ['..', 'a', 'UPPER', 'has space', 'a/b', '../x']) {
        await expect(ask(bucket, 'orig/ok.jpg'), bucket).rejects.toThrow();
      }
      expect(existsSync(join(dir, '..', 'escape.jpg'))).toBe(false);
    });
  });

  describe('reading and writing files', () => {
    it('reads byte ranges (for checking the real file type), downloads, replaces and deletes', async () => {
      const bytes = Buffer.from('0123456789abcdefghij');
      await put('orig/f.jpg', bytes);
      expect((await storage.readRange(BUCKET, 'orig/f.jpg', 0, 3)).toString()).toBe('0123');
      expect((await storage.readRange(BUCKET, 'orig/f.jpg', 15, 99)).toString()).toBe('fghij');
      expect((await storage.readRange(BUCKET, 'orig/f.jpg', 100, 200)).length).toBe(0);

      const local = join(dir, 'scratch', 'copy.bin');
      await storage.downloadTo(BUCKET, 'orig/f.jpg', local);
      expect(readFileSync(local)).toEqual(bytes);

      await storage.uploadFrom({
        bucket: BUCKET,
        key: 'pub/g.mp4',
        path: local,
        contentType: 'video/mp4',
      });
      expect(await storage.head(BUCKET, 'pub/g.mp4')).toEqual({
        sizeBytes: bytes.length,
        contentType: 'video/mp4',
      });

      await storage.delete(BUCKET, 'orig/f.jpg');
      expect(await storage.head(BUCKET, 'orig/f.jpg')).toBeNull();
      await storage.delete(BUCKET, 'orig/f.jpg'); // already gone is fine
      expect(await storage.head(BUCKET, 'never/was.jpg')).toBeNull();
    });

    it('serves downloads only through a valid, unexpired address', async () => {
      await put('orig/h.jpg', Buffer.from('some image bytes'));
      const url = await storage.presignDownload(BUCKET, 'orig/h.jpg', 60);
      expect(url).toMatch(/\/api\/v1\/media\/local-download\//);
      const found = await storage.resolveDownload(tokenOf(url));
      expect(found).toMatchObject({ contentType: 'image/jpeg', sizeBytes: 16 });
      await expect(storage.resolveDownload('garbage.token')).rejects.toBeInstanceOf(UploadRejected);
      const short = await storage.presignDownload(BUCKET, 'orig/h.jpg', 1);
      await new Promise((r) => setTimeout(r, 2100));
      await expect(storage.resolveDownload(tokenOf(short))).rejects.toMatchObject({
        reason: 'expired',
      });
      await storage.delete(BUCKET, 'orig/h.jpg');
      await expect(storage.resolveDownload(tokenOf(url))).rejects.toMatchObject({ reason: 'io' });
    }, 10_000);
  });

  describe('large files in parts', () => {
    const part = (n: number) => Buffer.from(`part-${n}-`.repeat(500));

    async function sendPart(key: string, uploadId: string, n: number, bytes = part(n)) {
      const req = await storage.presignPart({
        bucket: BUCKET,
        key,
        uploadId,
        partNumber: n,
        sizeBytes: bytes.length,
        ttlSeconds: 60,
      });
      return storage.acceptUpload(tokenOf(req.url), body(bytes), 'application/octet-stream');
    }

    it('joins the parts, in order, into one object', async () => {
      const key = 'orig/big/video.mp4';
      const { uploadId } = await storage.createMultipart({
        bucket: BUCKET,
        key,
        contentType: 'video/mp4',
      });
      const sent = [];
      for (const n of [3, 1, 2])
        sent.push({ partNumber: n, etag: (await sendPart(key, uploadId, n)).etag });
      expect((await storage.listParts(BUCKET, uploadId)).map((p) => p.partNumber)).toEqual([
        1, 2, 3,
      ]);

      await storage.completeMultipart({ bucket: BUCKET, key, uploadId, parts: sent });
      const stored = readFileSync(join(dir, BUCKET, key));
      expect(stored).toEqual(Buffer.concat([part(1), part(2), part(3)]));
      expect(await storage.head(BUCKET, key)).toMatchObject({
        sizeBytes: stored.length,
        contentType: 'video/mp4',
      });
      // The staging area is cleaned up.
      expect(existsSync(join(dir, BUCKET, '.parts', uploadId))).toBe(false);
    });

    it('refuses a part list whose checksum does not match what was sent', async () => {
      const key = 'orig/big/wrong.mp4';
      const { uploadId } = await storage.createMultipart({
        bucket: BUCKET,
        key,
        contentType: 'video/mp4',
      });
      const one = await sendPart(key, uploadId, 1);
      await expect(
        storage.completeMultipart({
          bucket: BUCKET,
          key,
          uploadId,
          parts: [{ partNumber: 1, etag: `${one.etag.slice(0, -1)}0` }],
        }),
      ).rejects.toThrow(/etag/);
      expect(await storage.head(BUCKET, key)).toBeNull();
    });

    it('can be abandoned, and a part cannot be larger than its signature allows', async () => {
      const key = 'orig/big/abandon.mp4';
      const { uploadId } = await storage.createMultipart({
        bucket: BUCKET,
        key,
        contentType: 'video/mp4',
      });
      const req = await storage.presignPart({
        bucket: BUCKET,
        key,
        uploadId,
        partNumber: 1,
        sizeBytes: 10,
        ttlSeconds: 60,
      });
      await expect(
        storage.acceptUpload(tokenOf(req.url), body(Buffer.alloc(11)), 'application/octet-stream'),
      ).rejects.toMatchObject({ reason: 'wrong_size' });
      await storage.abortMultipart({ bucket: BUCKET, key, uploadId });
      expect(existsSync(join(dir, BUCKET, '.parts', uploadId))).toBe(false);
      await storage.abortMultipart({ bucket: BUCKET, key, uploadId }); // repeatable
    });

    it('rejects a bad upload id or part number up front', async () => {
      await expect(
        storage.presignPart({
          bucket: BUCKET,
          key: 'orig/x.mp4',
          uploadId: '../../etc',
          partNumber: 1,
          sizeBytes: 1,
          ttlSeconds: 60,
        }),
      ).rejects.toThrow();
      const { uploadId } = await storage.createMultipart({
        bucket: BUCKET,
        key: 'orig/x.mp4',
        contentType: 'video/mp4',
      });
      for (const n of [0, -1, 10_001, 1.5]) {
        await expect(
          storage.presignPart({
            bucket: BUCKET,
            key: 'orig/x.mp4',
            uploadId,
            partNumber: n,
            sizeBytes: 1,
            ttlSeconds: 60,
          }),
        ).rejects.toThrow();
      }
    });
  });
});
