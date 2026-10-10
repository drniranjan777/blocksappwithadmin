import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IMAGE_MIMES, VIDEO_MIMES, ruleFor } from '../../src/media/media-policy.js';
import { SNIFF_BYTES, compatibleTypes, sniffMime } from '../../src/media/processing/sniff.js';
import { makeImage, makeVideo, scratchDir } from '../support/tools.js';

const pad = (bytes: number[], to = 64) =>
  Buffer.concat([Buffer.from(bytes), Buffer.alloc(Math.max(0, to - bytes.length))]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('knowing what a file really is', () => {
  const scratch = scratchDir();
  const head = (name: string) => readFileSync(join(scratch.dir, name)).subarray(0, SNIFF_BYTES);

  beforeAll(async () => {
    await makeImage(join(scratch.dir, 'a.jpg'));
    await makeImage(join(scratch.dir, 'b.png'));
    await makeVideo(join(scratch.dir, 'c.mp4'), { seconds: 1 });
  }, 30_000);
  afterAll(() => scratch.remove());

  it('recognises real JPEG, PNG and MP4 files from their first bytes', async () => {
    expect(await sniffMime(head('a.jpg'))).toBe('image/jpeg');
    expect(await sniffMime(head('b.png'))).toBe('image/png');
    expect(await sniffMime(head('c.mp4'))).toBe('video/mp4');
  });

  it('recognises the other formats the app accepts', async () => {
    const webp = pad([
      ...ascii('RIFF'),
      0x24,
      0,
      0,
      0,
      ...ascii('WEBP'),
      ...ascii('VP8 '),
      0x18,
      0,
      0,
      0,
    ]);
    expect(await sniffMime(webp)).toBe('image/webp');
    const mov = pad([
      0,
      0,
      0,
      0x14,
      ...ascii('ftyp'),
      ...ascii('qt  '),
      0,
      0,
      0,
      0,
      ...ascii('qt  '),
    ]);
    expect(await sniffMime(mov)).toBe('video/quicktime');
    const gp = pad([
      0,
      0,
      0,
      0x18,
      ...ascii('ftyp'),
      ...ascii('3gp4'),
      0,
      0,
      0,
      0,
      ...ascii('3gp4'),
    ]);
    expect(await sniffMime(gp)).toBe('video/3gpp');
    const webm = pad([
      0x1a,
      0x45,
      0xdf,
      0xa3,
      0x9f,
      0x42,
      0x86,
      0x81,
      0x01,
      0x42,
      0xf7,
      0x81,
      0x01,
      0x42,
      0xf2,
      0x81,
      0x04,
      0x42,
      0xf3,
      0x81,
      0x08,
      0x42,
      0x82,
      0x84,
      ...ascii('webm'),
    ]);
    expect(await sniffMime(webm)).toBe('video/webm');
  });

  it('is not fooled by a name or a declared type: it only looks at the bytes', async () => {
    const exe = pad([...ascii('MZ'), 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff]);
    const html = Buffer.from('<!DOCTYPE html><html><script>alert(1)</script></html>');
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const gif = pad([...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0]);
    const pdf = pad([...ascii('%PDF-1.7\n')]);
    const zip = pad([0x50, 0x4b, 3, 4, 0x14, 0, 0, 0, 0, 0, 0, 0]);
    const playlist = Buffer.from(
      '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:1.0,\nhttp://example.test/x.ts\n#EXT-X-ENDLIST\n',
    );

    const allowed = new Set<string>([...IMAGE_MIMES, ...VIDEO_MIMES]);
    for (const [name, bytes] of Object.entries({ exe, html, svg, gif, pdf, zip, playlist })) {
      const found = await sniffMime(bytes);
      expect(found === undefined || !allowed.has(found), `${name} -> ${found}`).toBe(true);
    }
  });

  it('says nothing about a file too short to judge, or random bytes', async () => {
    expect(await sniffMime(Buffer.alloc(0))).toBeUndefined();
    expect(await sniffMime(Buffer.from([0xff, 0xd8, 0xff]))).toBeUndefined();
    expect(await sniffMime(Buffer.alloc(200, 0xab))).toBeUndefined();
  });

  it('treats phone-labelled ISO video files as one family, and nothing else as interchangeable', () => {
    expect(compatibleTypes('video/mp4', 'video/quicktime')).toBe(true);
    expect(compatibleTypes('video/quicktime', 'video/mp4')).toBe(true);
    expect(compatibleTypes('video/3gpp', 'video/mp4')).toBe(true);
    expect(compatibleTypes('image/jpeg', 'image/jpeg')).toBe(true);
    expect(compatibleTypes('image/jpeg', 'image/png')).toBe(false);
    expect(compatibleTypes('image/jpeg', 'video/mp4')).toBe(false);
    expect(compatibleTypes('video/webm', 'video/mp4')).toBe(false);
  });

  it('is what the upload rules are checked against', () => {
    // Every type the app lets through is one the sniffer can name.
    expect(ruleFor('POST_IMAGE', 'IMAGE')?.mimes).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    expect(ruleFor('POST_IMAGE', 'VIDEO')).toBeUndefined();
    expect(ruleFor('REEL_VIDEO', 'VIDEO')).toBeUndefined();
    expect(ruleFor('STORY', 'VIDEO')?.maxDurationMs).toBe(60_000);
    expect(ruleFor('KYC_DOCUMENT', 'IMAGE')).toBeUndefined();
  });
});
