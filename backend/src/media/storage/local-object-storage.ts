import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import {
  MAX_PRESIGN_TTL_SECONDS,
  type MultipartPart,
  type ObjectInfo,
  ObjectStorage,
  type PresignedRequest,
} from './object-storage.js';

const BUCKET = /^[a-z0-9][a-z0-9.-]{2,62}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,511}$/;

interface UploadClaims {
  a: 'put' | 'part';
  b: string;
  k: string;
  ct: string;
  sz: number;
  /** multipart only */
  u?: string;
  pn?: number;
  exp: number;
}

interface DownloadClaims {
  a: 'get';
  b: string;
  k: string;
  exp: number;
}

export class UploadRejected extends Error {
  constructor(
    readonly reason: 'bad_token' | 'expired' | 'wrong_type' | 'wrong_size' | 'io',
    message: string,
  ) {
    super(message);
  }
}

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * Storage on the local disk, for development and tests.
 *
 * It imitates the protocol of a real bucket on purpose: a client asks for a signed
 * request, then PUTs the bytes to the address it was given. The address points at
 * this API (`/media/local-upload/<token>`), and the token is an HMAC-signed,
 * expiring statement of exactly what may be written: which key, which content type,
 * how many bytes. Code written against this works unchanged against S3.
 *
 * Safety: bucket and key names are validated against a strict alphabet, resolved,
 * and checked to stay inside the storage directory, so no key can reach outside it.
 */
export class LocalObjectStorage extends ObjectStorage {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(
    dir: string,
    private readonly signingKey: string,
    private readonly apiBase: string,
  ) {
    super();
    this.root = resolve(dir);
  }

  // ---------------------------------------------------------------- paths --

  private path(bucket: string, key: string): string {
    if (!BUCKET.test(bucket)) throw new Error('invalid bucket name');
    if (!KEY.test(key) || key.split('/').some((p) => p === '..' || p === '.' || p === '')) {
      throw new Error('invalid object key');
    }
    const full = resolve(this.root, bucket, key);
    if (!full.startsWith(join(this.root, bucket) + sep)) throw new Error('key escapes storage');
    return full;
  }

  /** The file behind a key (for streaming it out). */
  pathOf(bucket: string, key: string): string {
    return this.path(bucket, key);
  }

  private sidecar(path: string): string {
    return `${path}.meta.json`;
  }

  private partsDir(bucket: string, uploadId: string): string {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(uploadId)) throw new Error('invalid upload id');
    return resolve(this.root, bucket, '.parts', uploadId);
  }

  // -------------------------------------------------------------- signing --

  private sign(payload: string): string {
    return createHmac('sha256', this.signingKey).update(payload).digest('base64url');
  }

  private seal(claims: UploadClaims | DownloadClaims): string {
    const body = b64(claims);
    return `${body}.${this.sign(body)}`;
  }

  private open<T extends UploadClaims | DownloadClaims>(token: string, action: T['a']): T {
    const dot = token.indexOf('.');
    if (dot < 1) throw new UploadRejected('bad_token', 'malformed token');
    const body = token.slice(0, dot);
    const given = Buffer.from(token.slice(dot + 1));
    const expected = Buffer.from(this.sign(body));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UploadRejected('bad_token', 'bad signature');
    }
    let claims: T;
    try {
      claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    } catch {
      throw new UploadRejected('bad_token', 'unreadable token');
    }
    if (claims.a !== action && !(action === 'put' && claims.a === 'part')) {
      throw new UploadRejected('bad_token', 'token is for something else');
    }
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) {
      throw new UploadRejected('expired', 'this address has expired');
    }
    return claims;
  }

  private expiry(ttlSeconds: number): { exp: number; at: Date } {
    const ttl = Math.min(Math.max(ttlSeconds, 1), MAX_PRESIGN_TTL_SECONDS);
    const at = new Date(Date.now() + ttl * 1000);
    return { exp: Math.floor(at.getTime() / 1000), at };
  }

  // -------------------------------------------------------------- uploads --

  async presignUpload(input: {
    bucket: string;
    key: string;
    contentType: string;
    sizeBytes: number;
    ttlSeconds: number;
  }): Promise<PresignedRequest> {
    this.path(input.bucket, input.key); // validates
    const { exp, at } = this.expiry(input.ttlSeconds);
    const token = this.seal({
      a: 'put',
      b: input.bucket,
      k: input.key,
      ct: input.contentType,
      sz: input.sizeBytes,
      exp,
    });
    return {
      method: 'PUT',
      url: `${this.apiBase}/api/v1/media/local-upload/${token}`,
      headers: { 'Content-Type': input.contentType },
      expiresAt: at,
    };
  }

  async createMultipart(input: {
    bucket: string;
    key: string;
    contentType: string;
  }): Promise<{ uploadId: string }> {
    this.path(input.bucket, input.key);
    const uploadId = randomBytes(24).toString('base64url');
    await mkdir(this.partsDir(input.bucket, uploadId), { recursive: true });
    await writeFile(
      join(this.partsDir(input.bucket, uploadId), 'meta.json'),
      JSON.stringify({ key: input.key, contentType: input.contentType }),
    );
    return { uploadId };
  }

  async presignPart(input: {
    bucket: string;
    key: string;
    uploadId: string;
    partNumber: number;
    sizeBytes: number;
    ttlSeconds: number;
  }): Promise<PresignedRequest> {
    this.path(input.bucket, input.key);
    this.partsDir(input.bucket, input.uploadId);
    if (!Number.isInteger(input.partNumber) || input.partNumber < 1 || input.partNumber > 10_000) {
      throw new Error('invalid part number');
    }
    const { exp, at } = this.expiry(input.ttlSeconds);
    const token = this.seal({
      a: 'part',
      b: input.bucket,
      k: input.key,
      ct: 'application/octet-stream',
      sz: input.sizeBytes,
      u: input.uploadId,
      pn: input.partNumber,
      exp,
    });
    return {
      method: 'PUT',
      url: `${this.apiBase}/api/v1/media/local-upload/${token}`,
      headers: { 'Content-Type': 'application/octet-stream' },
      expiresAt: at,
    };
  }

  /**
   * Writes the bytes of an upload to disk after checking its signed token. The body
   * must be exactly the declared size and type; anything else is deleted and refused.
   * Returns the entity tag (MD5), as S3 does.
   */
  async acceptUpload(
    token: string,
    body: Readable,
    contentType: string | undefined,
  ): Promise<{ etag: string }> {
    const claims = this.open<UploadClaims>(token, 'put');
    if ((contentType ?? '').split(';')[0]?.trim().toLowerCase() !== claims.ct.toLowerCase()) {
      throw new UploadRejected('wrong_type', 'the content type does not match what was signed');
    }
    const final =
      claims.a === 'part'
        ? join(this.partsDir(claims.b, claims.u as string), String(claims.pn))
        : this.path(claims.b, claims.k);
    await mkdir(dirname(final), { recursive: true });
    const temp = `${final}.${randomBytes(6).toString('hex')}.uploading`;

    const md5 = createHash('md5');
    let received = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        received += chunk.length;
        // Stop reading the moment the client sends more than it said it would.
        if (received > claims.sz)
          return done(new UploadRejected('wrong_size', 'more data than was signed for'));
        md5.update(chunk);
        done(null, chunk);
      },
    });
    try {
      await pipeline(body, meter, createWriteStream(temp, { flags: 'wx' }));
      if (received !== claims.sz)
        throw new UploadRejected('wrong_size', 'less data than was signed for');
      await rename(temp, final);
      if (claims.a === 'put')
        await writeFile(this.sidecar(final), JSON.stringify({ contentType: claims.ct }));
    } catch (error) {
      await rm(temp, { force: true });
      if (error instanceof UploadRejected) throw error;
      throw new UploadRejected('io', (error as Error).message);
    }
    return { etag: md5.digest('hex') };
  }

  async completeMultipart(input: {
    bucket: string;
    key: string;
    uploadId: string;
    parts: MultipartPart[];
  }): Promise<void> {
    const dir = this.partsDir(input.bucket, input.uploadId);
    const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as {
      key: string;
      contentType: string;
    };
    if (meta.key !== input.key) throw new Error('upload belongs to another key');
    const ordered = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
    if (ordered.length === 0) throw new Error('no parts');
    const final = this.path(input.bucket, input.key);
    await mkdir(dirname(final), { recursive: true });
    const temp = `${final}.${randomBytes(6).toString('hex')}.joining`;
    const out = createWriteStream(temp, { flags: 'wx' });
    // Failures surface through the awaited steps below. Without this, a write still in
    // flight when we give up would raise a stray, unhandled error event after cleanup.
    out.on('error', () => undefined);
    try {
      for (const part of ordered) {
        const file = join(dir, String(part.partNumber));
        const data = createReadStream(file);
        const md5 = createHash('md5');
        data.on('data', (c) => md5.update(c));
        await new Promise<void>((done, fail) => {
          data.on('error', fail);
          data.on('end', done);
          data.pipe(out, { end: false });
        });
        if (md5.digest('hex') !== part.etag)
          throw new Error(`part ${part.partNumber} does not match its etag`);
      }
      await new Promise<void>((done, fail) =>
        out.end((e: Error | null | undefined) => (e ? fail(e) : done())),
      );
      await rename(temp, final);
      await writeFile(this.sidecar(final), JSON.stringify({ contentType: meta.contentType }));
    } catch (error) {
      out.destroy();
      await rm(temp, { force: true });
      throw error;
    }
    await rm(dir, { recursive: true, force: true });
  }

  async abortMultipart(input: { bucket: string; key: string; uploadId: string }): Promise<void> {
    await rm(this.partsDir(input.bucket, input.uploadId), { recursive: true, force: true });
  }

  /** Part numbers received so far (for resuming an interrupted upload). */
  async listParts(bucket: string, uploadId: string): Promise<MultipartPart[]> {
    const dir = this.partsDir(bucket, uploadId);
    const names = await readdir(dir).catch(() => [] as string[]);
    const parts: MultipartPart[] = [];
    for (const name of names) {
      if (!/^\d+$/.test(name)) continue;
      const data = await readFile(join(dir, name));
      parts.push({ partNumber: Number(name), etag: createHash('md5').update(data).digest('hex') });
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  // ---------------------------------------------------------------- reads --

  async head(bucket: string, key: string): Promise<ObjectInfo | null> {
    const path = this.path(bucket, key);
    const s = await stat(path).catch(() => null);
    if (!s?.isFile()) return null;
    const meta = await readFile(this.sidecar(path), 'utf8').then(
      (t) => JSON.parse(t) as { contentType?: string },
      () => ({}) as { contentType?: string },
    );
    return { sizeBytes: s.size, contentType: meta.contentType };
  }

  async readRange(
    bucket: string,
    key: string,
    start: number,
    endInclusive: number,
  ): Promise<Buffer> {
    const file = await open(this.path(bucket, key), 'r');
    try {
      const length = Math.max(0, endInclusive - start + 1);
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await file.read(buffer, 0, length, start);
      return buffer.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  }

  async downloadTo(bucket: string, key: string, path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await copyFile(this.path(bucket, key), path);
  }

  async uploadFrom(input: {
    bucket: string;
    key: string;
    path: string;
    contentType: string;
  }): Promise<void> {
    const final = this.path(input.bucket, input.key);
    await mkdir(dirname(final), { recursive: true });
    await copyFile(input.path, final);
    await writeFile(this.sidecar(final), JSON.stringify({ contentType: input.contentType }));
  }

  async delete(bucket: string, key: string): Promise<void> {
    const path = this.path(bucket, key);
    await rm(path, { force: true });
    await rm(this.sidecar(path), { force: true });
  }

  async presignDownload(bucket: string, key: string, ttlSeconds: number): Promise<string> {
    this.path(bucket, key);
    const { exp } = this.expiry(ttlSeconds);
    return `${this.apiBase}/api/v1/media/local-download/${this.seal({ a: 'get', b: bucket, k: key, exp })}`;
  }

  /** What a download token allows: the file, its type and size, for the download route to stream. */
  async resolveDownload(
    token: string,
  ): Promise<{ path: string; contentType: string; sizeBytes: number }> {
    const claims = this.open<DownloadClaims>(token, 'get');
    const info = await this.head(claims.b, claims.k);
    if (!info) throw new UploadRejected('io', 'not found');
    return {
      path: this.path(claims.b, claims.k),
      contentType: info.contentType ?? 'application/octet-stream',
      sizeBytes: info.sizeBytes,
    };
  }
}
