'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import useSWRInfinite from 'swr/infinite';
import { api, type ApiError, type Envelope, queryString } from './api';

type Query = Record<string, string | number | boolean | null | undefined>;

const fetcher = <T>(path: string) => api.get<T>(path);

/** One read from the API. Pass `null` as the path to wait (for example until a form is filled in). */
export function useApi<T>(path: string | null, config?: SWRConfiguration<Envelope<T>, ApiError>) {
  return useSWR<Envelope<T>, ApiError>(path, fetcher<T>, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
    ...config,
  });
}

/**
 * A list that loads page after page ("Load more"), the way the API pages: with a cursor that says
 * where the next page starts. Changing `params` starts again from the top.
 */
export function useCursorList<T>(path: string | null, params: Query = {}, limit = 25) {
  const getKey = (index: number, previous: Envelope<T[]> | null): string | null => {
    if (!path) return null;
    if (previous && !previous.meta?.hasMore) return null;
    const cursor = index === 0 ? undefined : (previous?.meta?.nextCursor ?? undefined);
    return `${path}${queryString({ ...params, limit, cursor })}`;
  };
  const swr = useSWRInfinite<Envelope<T[]>, ApiError>(getKey, (key: string) => api.get<T[]>(key), {
    revalidateFirstPage: false,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const pages = swr.data ?? [];
  const items = pages.flatMap((p) => p.data);
  const last = pages[pages.length - 1];
  return {
    items,
    hasMore: !!last?.meta?.hasMore,
    loading: swr.isLoading,
    loadingMore: swr.isValidating && pages.length > 0 && swr.size > pages.length,
    error: swr.error,
    loadMore: () => swr.setSize(swr.size + 1),
    reload: () => swr.mutate(),
  };
}
