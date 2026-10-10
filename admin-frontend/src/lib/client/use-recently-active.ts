'use client';

import { useEffect, useState } from 'react';

/** After this long without a click, key press or scroll, the page counts as left alone. */
export const IDLE_AFTER_MS = 10 * 60_000;

const SIGNS_OF_LIFE = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;

/**
 * Whether someone has used this page recently.
 *
 * Staff sessions end after 30 idle minutes, and "idle" means no request. A page that refreshes its own
 * numbers every minute would therefore keep a session alive for ever while nobody is there. Anything
 * that polls should do so only while this is true, so a walked-away session can expire as designed.
 * Coming back (any click or key) turns it on again, and the next request shows the sign-in page if the
 * session has ended meanwhile.
 */
export function useRecentlyActive(windowMs: number = IDLE_AFTER_MS): boolean {
  const [active, setActive] = useState(true);

  useEffect(() => {
    let timer = setTimeout(() => setActive(false), windowMs);
    const alive = () => {
      setActive(true);
      clearTimeout(timer);
      timer = setTimeout(() => setActive(false), windowMs);
    };
    for (const name of SIGNS_OF_LIFE) window.addEventListener(name, alive, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const name of SIGNS_OF_LIFE) window.removeEventListener(name, alive);
    };
  }, [windowMs]);

  return active;
}
