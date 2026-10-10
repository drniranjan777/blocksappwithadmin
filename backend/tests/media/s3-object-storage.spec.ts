import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { S3ObjectStorage } from '../../src/media/storage/s3-object-storage.js';
import { FakeS3 } from '../support/fake-s3.js';

/**
 * The S3 driver run through the real AWS SDK against a fake S3 server. This shows the
 * driver issues the right operations and builds well-formed signed addresses. It does not
 * prove a real bucket would accept the signature; that needs a real account (see docs).
 */
describe('S3 object storage', () => {
  const fake = new FakeS3();
  let storage: S3ObjectStorage;
  let scratch: string;

  beforeAll(async () => {
    await fake.start();
    scratch = mkdtempSync(join(tmpdir(), 'blocks-s3-'));
    storage = new S3ObjectStorage({
      region: 'ap-south-1',
      endpoint: fake.endpoint,
      accessKeyId: 'AKIDEXAMPLEEXAMPLE',
      secretAccessKey: 'a-secret-key-that-is-only-for-tests-0123456789',
    });
  });
  afterAll(async () => {
    storage.destroy();
    await fake.stop();
    rmSync(scratch, { recursive: true, force: true });
  });

  describe('signed upload addresses', () => {
    it('are time-limited and sign the size and type, so they only work for the approved file', async () => {
      const req = await storage.presignUpload({
        bucket: 'media',
        key: 'orig/2026/10/a.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 123_456,
        ttlSeconds: 900,
      });
      const url = new URL(req.url);
      expect(req.method).toBe('PUT');
      expect(url.origin).toBe(fake.endpoint);
      expect(url.pathname).toBe('/media/orig/2026/10/a.jpg');
      expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
      expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
      expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
      expect(url.searchParams.get('X-Amz-Credential')).toContain('AKIDEXAMPLEEXAMPLE/');
      const signed = (url.searchParams.get('X-Amz-SignedHeaders') ?? '').split(';');
      expect(signed).toEqual(expect.arrayContaining(['content-length', 'content-type', 'host']));
      expect(req.headers).toEqual({ 'Content-Type': 'image/jpeg' });
      expect(req.expiresAt.getTime()).toBeGreaterThan(Date.now() + 890_000);
      // The secret never appears in the address.
      expect(req.url).not.toContain('a-secret-key');
    });

    it('cap their lifetime at a day however much is asked', async () => {
      const req = await storage.presignUpload({
        bucket: 'media',
        key: 'orig/b.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1,
        ttlSeconds: 10_000_000,
      });
      expect(new URL(req.url).searchParams.get('X-Amz-Expires')).toBe('86400');
    });

    it('work as a real request: the bytes arrive where the address says', async () => {
      const bytes = Buffer.from('a photograph');
      const req = await storage.presignUpload({
        bucket: 'media',
        key: 'orig/c.jpg',
        contentType: 'image/jpeg',
        sizeBytes: bytes.length,
        ttlSeconds: 60,
      });
      const res = await fetch(req.url, { method: 'PUT', headers: req.headers, body: bytes });
      expect(res.status).toBe(200);
      expect(fake.objects.get('media/orig/c.jpg')?.body).toEqual(bytes);
    });
  });

  describe('operations', () => {
    it('reports an object, or its absence', async () => {
      fake.objects.set('media/orig/d.jpg', {
        body: Buffer.from('12345'),
        contentType: 'image/jpeg',
      });
      expect(await storage.head('media', 'orig/d.jpg')).toMatchObject({
        sizeBytes: 5,
        contentType: 'image/jpeg',
      });
      expect(await storage.head('media', 'orig/missing.jpg')).toBeNull();
    });

    it('reads a byte range, downloads to a file and uploads from one', async () => {
      fake.objects.set('media/orig/e.bin', {
        body: Buffer.from('0123456789'),
        contentType: 'application/octet-stream',
      });
      expect((await storage.readRange('media', 'orig/e.bin', 2, 5)).toString()).toBe('2345');
      const local = join(scratch, 'sub', 'e.bin');
      await storage.downloadTo('media', 'orig/e.bin', local);
      expect(readFileSync(local).toString()).toBe('0123456789');

      const out = join(scratch, 'out.mp4');
      writeFileSync(out, Buffer.from('rendered video bytes'));
      await storage.uploadFrom({
        bucket: 'media',
        key: 'pub/f.mp4',
        path: out,
        contentType: 'video/mp4',
      });
      expect(fake.objects.get('media/pub/f.mp4')).toMatchObject({ contentType: 'video/mp4' });
      expect(fake.objects.get('media/pub/f.mp4')?.body.toString()).toBe('rendered video bytes');
    });

    it('deletes, and does not mind deleting twice', async () => {
      fake.objects.set('media/orig/g.jpg', { body: Buffer.from('x'), contentType: 'image/jpeg' });
      await storage.delete('media', 'orig/g.jpg');
      expect(fake.objects.has('media/orig/g.jpg')).toBe(false);
      await storage.delete('media', 'orig/g.jpg');
    });

    it('signs a download address that expires', async () => {
      const url = new URL(await storage.presignDownload('media', 'pub/h.jpg', 300));
      expect(url.pathname).toBe('/media/pub/h.jpg');
      expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
      expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('large files in parts', () => {
    it('are started, uploaded part by part with signed addresses, and joined in order', async () => {
      const key = 'orig/big.mp4';
      const { uploadId } = await storage.createMultipart({
        bucket: 'media',
        key,
        contentType: 'video/mp4',
      });
      const parts = [Buffer.from('AAAA'), Buffer.from('BBBB'), Buffer.from('CC')];
      const etags: Array<{ partNumber: number; etag: string }> = [];
      for (const [i, bytes] of parts.entries()) {
        const req = await storage.presignPart({
          bucket: 'media',
          key,
          uploadId,
          partNumber: i + 1,
          sizeBytes: bytes.length,
          ttlSeconds: 60,
        });
        const url = new URL(req.url);
        expect(url.searchParams.get('partNumber')).toBe(String(i + 1));
        expect(url.searchParams.get('uploadId')).toBe(uploadId);
        expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
        const res = await fetch(req.url, { method: 'PUT', body: bytes });
        etags.push({ partNumber: i + 1, etag: res.headers.get('etag') ?? '' });
      }
      await storage.completeMultipart({
        bucket: 'media',
        key,
        uploadId,
        parts: [etags[2]!, etags[0]!, etags[1]!],
      });
      expect(fake.objects.get('media/orig/big.mp4')?.body.toString()).toBe('AAAABBBBCC');
      expect(fake.objects.get('media/orig/big.mp4')?.contentType).toBe('video/mp4');
    });

    it('can be abandoned, repeatedly', async () => {
      const { uploadId } = await storage.createMultipart({
        bucket: 'media',
        key: 'orig/abandon.mp4',
        contentType: 'video/mp4',
      });
      await storage.abortMultipart({ bucket: 'media', key: 'orig/abandon.mp4', uploadId });
      await storage.abortMultipart({ bucket: 'media', key: 'orig/abandon.mp4', uploadId });
    });
  });

  it('needs no stored credentials when none are given (cloud roles)', async () => {
    const withoutKeys = new S3ObjectStorage({ region: 'ap-south-1', endpoint: fake.endpoint });
    // Signing needs credentials; the point is that construction does not demand them.
    expect(withoutKeys.driver).toBe('s3');
    withoutKeys.destroy();
  });
});
