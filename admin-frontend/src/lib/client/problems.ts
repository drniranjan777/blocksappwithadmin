import { ApiError } from './api';

export interface Problem {
  /** The setting or field the problem is about, or empty when it is about the whole request. */
  path: string;
  message: string;
}

/**
 * The API reports totals as fractions ("weights must add up to 1 (they add up to 1.15)"). The
 * Reach form shows percentages, so say it the way the person sees it: "must add up to 100%
 * (they add up to 115%)".
 */
export function inPercent(message: string): string {
  return message.replace(
    /add up to 1 \((?:it adds|they add) up to ([\d.]+)\)/,
    (_all, total: string) => `add up to 100% (they add up to ${Math.round(Number(total) * 1_000_000) / 10_000}%)`,
  );
}

/** Every problem the API found with a document, as a flat list (the API reports them all at once). */
export function problemsFrom(error: unknown, fallback: (error: unknown) => string): Problem[] {
  if (error instanceof ApiError && error.details?.length) {
    return error.details.flatMap((d) => d.reasons.map((message) => ({ path: d.field, message: inPercent(message) })));
  }
  return [{ path: '', message: fallback(error) }];
}
