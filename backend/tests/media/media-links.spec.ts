import { describe, expect, it } from 'vitest';
import { LINK_WINDOW_SECONDS, MediaLinks } from '../../src/media/delivery/media-links.js';

describe('signed media links', () => {
  const links = new MediaLinks('a-test-signing-secret-that-is-long-enough');
  const NOW = Date.UTC(2026, 9, 9, 10, 0, 0);
  const KEY = 'pub/01990000-0000-7000-8000-000000000001/main.jpg';

  it('verifies a link it made, until it expires', () => {
    const { e, s } = links.sign(KEY, NOW);
    expect(links.verify(KEY, e, s, NOW)).toBe(true);
    expect(links.verify(KEY, String(e), s, NOW + 3600_000)).toBe(true);
    expect(links.verify(KEY, e, s, e * 1000 - 1)).toBe(true);
    expect(links.verify(KEY, e, s, e * 1000 + 1)).toBe(false);
  });

  it('lasts between one and two windows', () => {
    const { e } = links.sign(KEY, NOW);
    const lifetime = e - NOW / 1000;
    expect(lifetime).toBeGreaterThanOrEqual(LINK_WINDOW_SECONDS);
    expect(lifetime).toBeLessThanOrEqual(2 * LINK_WINDOW_SECONDS);
  });

  it('is the same text for the whole window, so image caches keep working', () => {
    const a = links.sign(KEY, NOW);
    const b = links.sign(KEY, NOW + 1.5 * 3600_000); // 11:30, same 06:00-12:00 window
    expect(b).toEqual(a);
    // …and changes once the window rolls over.
    expect(links.sign(KEY, NOW + 7 * 3600_000).e).toBeGreaterThan(a.e);
  });

  it('cannot be reused for another file or a longer life', () => {
    const { e, s } = links.sign(KEY, NOW);
    expect(links.verify('pub/01990000-0000-7000-8000-000000000001/small.jpg', e, s, NOW)).toBe(
      false,
    );
    expect(links.verify(KEY, e + LINK_WINDOW_SECONDS, s, NOW)).toBe(false);
    expect(links.verify(KEY.replace('main', 'main '), e, s, NOW)).toBe(false);
  });

  it('rejects anything malformed without throwing', () => {
    const { e, s } = links.sign(KEY, NOW);
    for (const bad of [undefined, null, '', 'abc', 1.5, NaN, {}, [], 'x'.repeat(500)]) {
      expect(links.verify(KEY, bad, s, NOW)).toBe(false);
      expect(links.verify(KEY, e, bad, NOW)).toBe(false);
    }
    expect(links.verify(KEY, e, s.slice(0, -2), NOW)).toBe(false);
    expect(links.verify(KEY, e, `${s}A`, NOW)).toBe(false);
  });

  it('does not verify under a different secret', () => {
    const { e, s } = links.sign(KEY, NOW);
    expect(new MediaLinks('another-secret-another-secret-12345').verify(KEY, e, s, NOW)).toBe(
      false,
    );
  });
});
