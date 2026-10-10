'use client';

import { useEffect, useState } from 'react';

/** The value, but only after it has stopped changing for `delay` ms (so typing does not search on every key). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
