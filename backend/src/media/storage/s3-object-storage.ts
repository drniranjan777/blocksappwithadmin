import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  MAX_PRESIGN_TTL_SECONDS,
  type MultipartPart,
  type ObjectInfo,
  ObjectStorage,
  type PresignedRequest,
} from './object-storage.js';

export interface S3Settings {
  region: string;
  /** Set for R2, MinIO and other S3-compatible services; leave empty for AWS S3. */
  endpoint?: string | undefined;
  accessKeyId?: string | undefined;
  secretAccessKey?: string | undefined;
}

/**
 * Storage in an S3-compatible bucket.
 *
 * Upload addresses sign `Content-Type` **and `Content-Length`**, so the request only
 * works for exactly the number of bytes the API approved; a client cannot be handed
 * an address for 5 MB and upload 5 GB with it. Credentials never leave this process:
 * the client gets only a time-limited address.
 *
 * Checksums are calculated only when the service requires them (the SDK's newer
 * default adds a trailer that several S3-compatible services do not accept).
 */
export class S3ObjectStorage extends ObjectStorage {
  readonly driver = 's3' as const;
  private readonly s3: S3Client;

  constructor(settings: S3Settings) {
    super();
    this.s3 = new S3Client({
      region: settings.region,
      ...(settings.endpoint ? { endpoint: settings.endpoint, forcePathStyle: true } : {}),
      ...(settings.accessKeyId && settings.secretAccessKey
        ? {
            credentials: {
              accessKeyId: settings.accessKeyId,
              secretAccessKey: settings.secretAccessKey,
            },
          }
        : {}),
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  private ttl(seconds: number): number {
    return Math.min(Math.max(Math.floor(seconds), 1), MAX_PRESIGN_TTL_SECONDS);
  }

  async presignUpload(input: {
    bucket: string;
    key: string;
    contentType: string;
    sizeBytes: number;
    ttlSeconds: number;
  }): Promise<PresignedRequest> {
    const ttl = this.ttl(input.ttlSeconds);
    const url = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.sizeBytes,
      }),
      { expiresIn: ttl, signableHeaders: new Set(['content-type', 'content-length']) },
    );
    return {
      method: 'PUT',
      url,
      headers: { 'Content-Type': input.contentType },
      expiresAt: new Date(Date.now() + ttl * 1000),
    };
  }

  async createMultipart(input: {
    bucket: string;
    key: string;
    contentType: string;
  }): Promise<{ uploadId: string }> {
    const res = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.key,
        ContentType: input.contentType,
      }),
    );
    if (!res.UploadId) throw new Error('the storage service did not start the upload');
    return { uploadId: res.UploadId };
  }

  async presignPart(input: {
    bucket: string;
    key: string;
    uploadId: string;
    partNumber: number;
    sizeBytes: number;
    ttlSeconds: number;
  }): Promise<PresignedRequest> {
    const ttl = this.ttl(input.ttlSeconds);
    const url = await getSignedUrl(
      this.s3,
      new UploadPartCommand({
        Bucket: input.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
        ContentLength: input.sizeBytes,
      }),
      { expiresIn: ttl, signableHeaders: new Set(['content-length']) },
    );
    return { method: 'PUT', url, headers: {}, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  async completeMultipart(input: {
    bucket: string;
    key: string;
    uploadId: string;
    parts: MultipartPart[];
  }): Promise<void> {
    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        MultipartUpload: {
          Parts: [...input.parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  async abortMultipart(input: { bucket: string; key: string; uploadId: string }): Promise<void> {
    await this.s3
      .send(
        new AbortMultipartUploadCommand({
          Bucket: input.bucket,
          Key: input.key,
          UploadId: input.uploadId,
        }),
      )
      .catch((e: { name?: string }) => {
        // Already gone is the goal.
        if (e.name !== 'NoSuchUpload' && e.name !== 'NotFound') throw e;
      });
  }

  async head(bucket: string, key: string): Promise<ObjectInfo | null> {
    try {
      const res = await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        sizeBytes: res.ContentLength ?? 0,
        contentType: res.ContentType,
        etag: res.ETag?.replaceAll('"', ''),
      };
    } catch (error) {
      const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404)
        return null;
      throw error;
    }
  }

  async readRange(
    bucket: string,
    key: string,
    start: number,
    endInclusive: number,
  ): Promise<Buffer> {
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${endInclusive}` }),
    );
    return Buffer.from(
      await (res.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray(),
    );
  }

  async downloadTo(bucket: string, key: string, path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const res = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    await pipeline(res.Body as Readable, createWriteStream(path));
  }

  async uploadFrom(input: {
    bucket: string;
    key: string;
    path: string;
    contentType: string;
  }): Promise<void> {
    const { size } = await stat(input.path);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: createReadStream(input.path),
        ContentType: input.contentType,
        ContentLength: size,
      }),
    );
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  presignDownload(bucket: string, key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: this.ttl(ttlSeconds),
    });
  }

  /** Release sockets (tests and shutdown). */
  destroy(): void {
    this.s3.destroy();
  }
}
