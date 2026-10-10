import { describe, expect, it } from 'vitest';
import { encodeLimitMs } from './ffmpeg.js';

const MINUTE = 60_000;

describe('how long a video encode may run before it is killed and retried', () => {
  it('is two minutes for a short clip, so a stalled encode is retried quickly', () => {
    expect(encodeLimitMs(2_000)).toBe(2 * MINUTE);
    expect(encodeLimitMs(0)).toBe(2 * MINUTE);
  });

  it('grows with the length of the video', () => {
    expect(encodeLimitMs(30_000)).toBe(11 * MINUTE);
    expect(encodeLimitMs(30_000)).toBeGreaterThan(encodeLimitMs(10_000));
  });

  it('never exceeds fifteen minutes, however long the video claims to be', () => {
    expect(encodeLimitMs(60_000)).toBe(15 * MINUTE);
    expect(encodeLimitMs(10 * 60 * MINUTE)).toBe(15 * MINUTE);
  });

  it('copes with a length that is missing or nonsense', () => {
    expect(encodeLimitMs(Number.NaN)).toBe(2 * MINUTE);
    expect(encodeLimitMs(-5)).toBe(2 * MINUTE);
    expect(encodeLimitMs(Number.POSITIVE_INFINITY)).toBe(2 * MINUTE);
  });
});
