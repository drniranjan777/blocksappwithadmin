import { z } from 'zod';
import { Errors } from '../errors/app-error.js';

/**
 * Cursor (keyset) pagination.
 *
 * A cursor says "continue after this row": it carries the sort key of the last
 * row sent, so the next query is `WHERE (sort_key, id) < (last_key, last_id)`
 * and costs the same on page 1 as on page 10,000. Offset pagination is not used
 * for anything that can grow, because `OFFSET n` reads and discards n rows.
 *
 * Cursors are opaque to clients. Tampering can only change which rows a user
 * sees *of their own query*, and every value is bound as a query parameter, so
 * it cannot change the shape of the SQL; a malformed cursor is a 400.
 */

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

export function encodeCursor(payload: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor<S extends z.ZodType>(
  raw: string | undefined,
  schema: S,
): z.infer<S> | undefined {
  if (!raw) return undefined;
  try {
    const json = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    const parsed = schema.safeParse(json);
    if (parsed.success) return parsed.data;
  } catch {
    // fall through to the error below
  }
  throw Errors.validation([{ field: 'cursor', reasons: ['invalid'] }]);
}

/** The most rows one page may return, however much the client asks for. */
export function clampLimit(
  limit: number | undefined,
  fallback = DEFAULT_PAGE_SIZE,
  max = MAX_PAGE_SIZE,
): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(Math.max(Math.trunc(limit), 1), max);
}

/** A page of results. Controllers return this; the response interceptor shapes it. */
export class Page<T> {
  constructor(
    readonly items: T[],
    readonly nextCursor: string | null,
  ) {}

  get hasMore(): boolean {
    return this.nextCursor !== null;
  }

  /**
   * Builds a page from `limit + 1` fetched rows: the extra row only proves there
   * is more, and is not returned.
   */
  static fromRows<R, T = R>(
    rows: R[],
    limit: number,
    cursorOf: (last: R) => Record<string, string | number>,
    map: (row: R) => T = (r) => r as unknown as T,
  ): Page<T> {
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const last = slice[slice.length - 1];
    return new Page(slice.map(map), hasMore && last ? encodeCursor(cursorOf(last)) : null);
  }
}
