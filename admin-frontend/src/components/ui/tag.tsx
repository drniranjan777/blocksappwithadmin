import type { ReactNode } from 'react';
import { cn } from '@/lib/client/cn';

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'brand';

const TONES: Record<Tone, string> = {
  neutral: 'bg-soft text-muted',
  good: 'bg-good-bg text-good',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  brand: 'bg-brand-2 text-brand-ink',
};

/** A small status label. The text always says what it means, never colour alone. */
export function Tag({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[7px] px-[9px] py-[3px] text-[11.5px] font-bold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const LEVELS = {
  DISTRICT: { code: 'D1', label: 'District', colour: 'bg-d1' },
  STATE: { code: 'S1', label: 'State', colour: 'bg-s1' },
  NATIONAL: { code: 'N1', label: 'National', colour: 'bg-n1' },
  GLOBAL: { code: 'G1', label: 'Global', colour: 'bg-g1' },
} as const;

export function levelInfo(level: string) {
  return LEVELS[level as keyof typeof LEVELS];
}

/** The Reach level as its coloured pill (D1 District ... G1 Global). */
export function LevelBadge({ level }: { level: string }) {
  const info = levelInfo(level);
  if (!info) return <Tag>{level}</Tag>;
  return (
    <span
      className={cn('inline-block rounded-full px-[9px] py-0.5 text-[11px] font-extrabold text-white', info.colour)}
      title={`${info.label} reach`}
    >
      {info.code}
    </span>
  );
}

/** Maps a status word from the API to a colour. Unknown words stay neutral. */
export function statusTone(status: string | null | undefined): Tone {
  switch ((status ?? '').toUpperCase()) {
    case 'ACTIVE':
    case 'VERIFIED':
    case 'APPROVED':
    case 'READY':
    case 'PUBLISHED':
    case 'SUCCEEDED':
    case 'COMPLETED':
    case 'FINALIZED':
    case 'ELIGIBLE':
    case 'SETTLED':
      return 'good';
    case 'SUSPENDED':
    case 'REJECTED':
    case 'FAILED':
    case 'REMOVED':
    case 'DISABLED':
    case 'CANCELLED':
    case 'REVOKED':
      return 'bad';
    case 'PENDING':
    case 'UNDER_REVIEW':
    case 'PENDING_REVIEW':
    case 'RESTRICTED':
    case 'ON_HOLD':
    case 'INVITED':
    case 'RETRYING':
    case 'CLOSED':
    case 'DRAFT':
    case 'PARTIAL':
      return 'warn';
    case 'OPEN':
    case 'QUEUED':
    case 'RUNNING':
    case 'PROCESSING':
    case 'SENT':
      return 'brand';
    default:
      return 'neutral';
  }
}
