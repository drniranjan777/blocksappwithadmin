import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_AFTER_MS, useRecentlyActive } from '@/lib/client/use-recently-active';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('whether the page is being used', () => {
  it('starts as used, so the first load can fetch', () => {
    const { result } = renderHook(() => useRecentlyActive());
    expect(result.current).toBe(true);
  });

  it('stops counting as used after ten minutes with no click, key or scroll', () => {
    const { result } = renderHook(() => useRecentlyActive());
    act(() => {
      vi.advanceTimersByTime(IDLE_AFTER_MS - 1000);
    });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(false);
  });

  it('counts as used again, and the clock restarts, on any sign of life', () => {
    const { result } = renderHook(() => useRecentlyActive());
    act(() => {
      vi.advanceTimersByTime(IDLE_AFTER_MS + 1000);
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(IDLE_AFTER_MS - 1000);
    });
    expect(result.current).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
      vi.advanceTimersByTime(IDLE_AFTER_MS - 1000);
    });
    expect(result.current).toBe(true);
  });

  it('listens to nothing once the page is gone', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useRecentlyActive());
    unmount();
    expect(remove.mock.calls.map(([name]) => name)).toEqual(
      expect.arrayContaining(['pointerdown', 'keydown', 'scroll', 'touchstart']),
    );
    remove.mockRestore();
  });
});
