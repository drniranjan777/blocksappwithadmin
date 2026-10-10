import type { ReactNode } from 'react';
import { ApiError } from '@/lib/client/api';
import { Button } from './button';
import { Icon } from './icon';
import { cn } from '@/lib/client/cn';

const GENERIC_REFUSAL = 'You do not have permission to do that.';

/** What to tell a person about a failed request, in plain words. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    // The API says why when it knows (for example, "someone else has to activate your draft"); only
    // its stock refusal is replaced by our own wording.
    if (error.status === 403) {
      return error.message && error.message !== GENERIC_REFUSAL
        ? error.message
        : 'You do not have permission to see or do this.';
    }
    if (error.status === 429) {
      return error.retryAfterSeconds
        ? `Too many attempts. Try again in ${error.retryAfterSeconds} seconds.`
        : 'Too many attempts. Please wait a moment.';
    }
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="text-muted inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="border-brand size-4 animate-spin rounded-full border-2 border-t-transparent"
      />
      <span className="text-[13px]">{label}…</span>
    </span>
  );
}

/** Placeholder rows while a list loads, so the page does not jump when it arrives. */
export function Loading({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2.5 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="bg-soft h-9 animate-pulse rounded-lg" />
      ))}
    </div>
  );
}

export function ErrorState({ error, retry, className }: { error: unknown; retry?: () => void; className?: string }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-2 px-4 py-10 text-center', className)}>
      <span
        className={cn(
          'grid size-10 place-items-center rounded-full',
          forbidden ? 'bg-warn-bg text-warn' : 'bg-bad-bg text-bad',
        )}
      >
        <Icon name={forbidden ? 'lock' : 'alert'} />
      </span>
      <p className="max-w-md text-[13.5px] font-semibold">{describeError(error)}</p>
      {error instanceof ApiError && error.requestId && (
        <p className="text-muted text-xs">
          Reference <span className="font-mono">{error.requestId}</span>
        </p>
      )}
      {retry && !forbidden && (
        <Button variant="ghost" size="sm" onClick={retry}>
          <Icon name="refresh" className="size-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-12 text-center">
      <p className="text-[14px] font-bold">{title}</p>
      {hint && <p className="text-muted max-w-md text-[13px]">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="border-line flex justify-center border-t p-3">
      <Button variant="ghost" size="sm" loading={loading} onClick={onClick}>
        Load more
      </Button>
    </div>
  );
}
