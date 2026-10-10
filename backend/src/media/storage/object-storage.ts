/**
 * Object storage, as the rest of the system sees it.
 *
 * Nothing outside `media/storage` knows whether files live on a developer's disk or
 * in an S3-compatible bucket (AWS S3, Cloudflare R2, MinIO...). Two rules shape the
 * interface:
 *
 *   1. **Clients upload straight to storage** with a short-lived signed request,
 *      never through the API. The API never holds a video in memory, and storage
 *      credentials never reach a phone or a browser.
 *   2. **Everything is private.** There are no public buckets. Originals are never
 *      served; processed renditions are served through signed (or CDN-fronted)
 *      addresses that expire.
 */

export interface PresignedRequest {
  method: 'PUT';
  url: string;
  /** Headers the client must send exactly as given (they are part of the signature). */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface ObjectInfo {
  sizeBytes: number;
  contentType?: string | undefined;
  etag?: string | undefined;
}

export interface MultipartPart {
  partNumber: number;
  etag: string;
}

export abstract class ObjectStorage {
  abstract readonly driver: 'local' | 's3';

  /** A signed request that lets a client upload exactly `sizeBytes` of `contentType` to `key`. */
  abstract presignUpload(input: {
    bucket: string;
    key: string;
    contentType: string;
    sizeBytes: number;
    ttlSeconds: number;
  }): Promise<PresignedRequest>;

  /** Large files: the upload is split into parts of a fixed size, uploaded independently and joined. */
  abstract createMultipart(input: {
    bucket: string;
    key: string;
    contentType: string;
  }): Promise<{ uploadId: string }>;

  abstract presignPart(input: {
    bucket: string;
    key: string;
    uploadId: string;
    partNumber: number;
    sizeBytes: number;
    ttlSeconds: number;
  }): Promise<PresignedRequest>;

  abstract completeMultipart(input: {
    bucket: string;
    key: string;
    uploadId: string;
    parts: MultipartPart[];
  }): Promise<void>;

  abstract abortMultipart(input: { bucket: string; key: string; uploadId: string }): Promise<void>;

  /** Size and type of a stored object, or `null` if there is none. */
  abstract head(bucket: string, key: string): Promise<ObjectInfo | null>;

  /** Bytes `start..endInclusive` of an object (for checking the real file type without downloading it). */
  abstract readRange(
    bucket: string,
    key: string,
    start: number,
    endInclusive: number,
  ): Promise<Buffer>;

  /** Copies an object to a local file (for the processing worker). */
  abstract downloadTo(bucket: string, key: string, path: string): Promise<void>;

  /** Stores a local file (the worker's output). */
  abstract uploadFrom(input: {
    bucket: string;
    key: string;
    path: string;
    contentType: string;
  }): Promise<void>;

  abstract delete(bucket: string, key: string): Promise<void>;

  /** A temporary address from which `key` can be fetched. */
  abstract presignDownload(bucket: string, key: string, ttlSeconds: number): Promise<string>;
}

/** The longest an upload or download address stays valid. */
export const MAX_PRESIGN_TTL_SECONDS = 86_400;
