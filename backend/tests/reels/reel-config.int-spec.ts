import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PURPOSE_RULES } from '../../src/media/media-policy.js';
import {
  MAX_CLIPS,
  MAX_REEL_MS,
  MIN_CLIP_MS,
  PHOTO_DEFAULT_MS,
} from '../../src/reels/reels.dto.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, call, signUp, type Account } from '../support/auth.js';

describe('the reel editor limits', () => {
  let t: TestApp;
  let me: Account;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
    me = await signUp(t);
  });
  afterAll(async () => {
    await t.close();
  });

  it('are the limits the server enforces, not a copy that could drift', async () => {
    const res = await call(t, 'get', '/creator/reel-config', { token: me.accessToken }).expect(200);
    const c = res.body.data;
    const rule = PURPOSE_RULES.REEL_CLIP;
    expect(c.maxDurationSeconds).toBe(MAX_REEL_MS / 1000);
    expect(c.maxClips).toBe(MAX_CLIPS);
    expect(c.minClipDurationMs).toBe(MIN_CLIP_MS);
    expect(c.defaultPhotoDurationMs).toBe(PHOTO_DEFAULT_MS);
    expect(c.maxVideoSizeMb * 1024 * 1024).toBe(rule?.VIDEO?.maxBytes);
    expect(c.maxPhotoSizeMb * 1024 * 1024).toBe(rule?.IMAGE?.maxBytes);
    expect(c.videoTypes).toEqual([...(rule?.VIDEO?.mimes ?? [])]);
    expect(c.photoTypes).toEqual([...(rule?.IMAGE?.mimes ?? [])]);
  });

  it('never offer a length above the maximum, and start below it', async () => {
    const c = (await call(t, 'get', '/creator/reel-config', { token: me.accessToken }).expect(200))
      .body.data;
    expect(c.durationOptionsSeconds.length).toBeGreaterThan(0);
    for (const seconds of c.durationOptionsSeconds as number[]) {
      expect(seconds).toBeLessThanOrEqual(c.maxDurationSeconds);
    }
    expect(c.durationOptionsSeconds).toContain(c.defaultLimitSeconds);
  });

  it('need a signed-in person', async () => {
    await call(t, 'get', '/creator/reel-config').expect(401);
  });
});
