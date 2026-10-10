import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestApp } from './app.js';
import type { Person } from './social.js';

/** A fresh storage directory for one test app. */
export function storageEnv(): { STORAGE_LOCAL_DIR: string } {
  return { STORAGE_LOCAL_DIR: mkdtempSync(join(tmpdir(), 'blocks-test-media-')) };
}

/** The path of an upload address (the host in it is the configured public API address, not the test server). */
export function pathOf(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}

/** Sends bytes to a signed upload address, as a phone would. */
export function putBytes(
  t: TestApp,
  request: { url: string; headers: Record<string, string> },
  bytes: Buffer,
) {
  let req = t.http.put(pathOf(request.url));
  for (const [k, v] of Object.entries(request.headers)) req = req.set(k, v);
  return req.send(bytes);
}

export interface UploadedFile {
  assetId: string;
  sessionId: string;
}

/** A JPEG header followed by filler: enough to look like a JPEG to a type check on the first bytes. */
export function fakeJpeg(size = 2048): Buffer {
  const b = Buffer.alloc(size, 0x20);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]).copy(b, 0);
  return b;
}

/** Announce, upload and finish a small file for `p`. Returns once processing has been queued. */
export async function uploadSmall(
  t: TestApp,
  p: Person,
  o: { purpose?: string; kind?: 'IMAGE' | 'VIDEO'; contentType?: string; bytes?: Buffer } = {},
): Promise<UploadedFile> {
  const bytes = o.bytes ?? fakeJpeg();
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
  const { upload, assetId, sessionId } = start.body.data as {
    upload: { url: string; headers: Record<string, string> };
    assetId: string;
    sessionId: string;
  };
  await putBytes(t, upload, bytes).expect(200);
  await p.api('post', `/media/uploads/${sessionId}/complete`, { body: {} }).expect(200);
  return { assetId, sessionId };
}
