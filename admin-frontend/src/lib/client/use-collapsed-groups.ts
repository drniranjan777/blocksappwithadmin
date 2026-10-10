'use client';

import { useSyncExternalStore } from 'react';

const KEY = 'blocks.nav.collapsed';
const NONE: string[] = [];

const listeners = new Set<() => void>();
/** Set only when the browser refused to store the choice, so it still holds until the page is closed. */
let kept: string[] | null = null;
let lastRaw: string | null | undefined;
let lastParsed: string[] = NONE;

function parse(raw: string | null): string[] {
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : NONE;
  } catch {
    return NONE;
  }
}

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The same array object until the stored text changes: what `useSyncExternalStore` needs to avoid looping. */
function snapshot(): string[] {
  if (kept) return kept;
  const raw = read();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastParsed = parse(raw);
  }
  return lastParsed;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * Which menu groups the person folded up, remembered between visits (and shared between tabs).
 * Everything is open on the server and until the browser's storage has been read. If the browser
 * will not store anything (a private window, blocked site data) the choice still works, just not next time.
 */
export function useCollapsedGroups(): [collapsed: string[], toggle: (id: string) => void] {
  const collapsed = useSyncExternalStore(subscribe, snapshot, () => NONE);
  const toggle = (id: string) => {
    const next = collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id];
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
      kept = null;
    } catch {
      kept = next;
    }
    for (const listener of listeners) listener();
  };
  return [collapsed, toggle];
}

/** For tests: forget everything remembered in this module. */
export function resetCollapsedGroupsForTests(): void {
  kept = null;
  lastRaw = undefined;
  lastParsed = NONE;
}
