'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { TrendChart } from '../charts/trend-chart';
import { Card, CardTitle, PageHeader, StatCard } from '../ui/card';
import { ErrorState, Loading } from '../ui/states';
import { cn } from '@/lib/client/cn';
import { formatAgo, formatNumber, formatRupees, humanize } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { useRecentlyActive } from '@/lib/client/use-recently-active';
import type { DashboardData, ReachLevel } from '@/lib/types';
import { levelInfo } from '../ui/tag';

/** Where each waiting-for-a-person count leads, and what to call it. */
const QUEUE_LINKS: Record<string, { label: string; href: string }> = {
  identityUnderReview: { label: 'Identity checks to review', href: '/identity' },
  bankAccountsToReview: { label: 'Bank accounts to review', href: '/bank-accounts' },
  payoutsToReview: { label: 'Payouts waiting for approval', href: '/payouts' },
  payoutsOnHold: { label: 'Payouts on hold', href: '/payouts' },
  mediaAwaitingReview: { label: 'Photos and videos to review', href: '/media' },
  mediaJobsFailed: { label: 'Media jobs that failed this week', href: '/media' },
  licencesEndingSoon: { label: 'Music licences ending within 30 days', href: '/music' },
  reportsOpen: { label: 'Open reports', href: '/reports' },
  appealsOpen: { label: 'Open appeals', href: '/reports' },
};

/** Queues that exist as services but have no console page yet are listed without a link. */
const HAS_PAGE = new Set(['/identity', '/bank-accounts', '/payouts', '/media', '/music']);

const LEVELS: ReachLevel[] = ['DISTRICT', 'STATE', 'NATIONAL', 'GLOBAL'];
const LEVEL_BG: Record<ReachLevel, string> = { DISTRICT: 'bg-d1', STATE: 'bg-s1', NATIONAL: 'bg-n1', GLOBAL: 'bg-g1' };

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-line flex items-center justify-between border-b py-[7px] last:border-0">
      <span className="text-muted text-[12.5px]">{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function Dashboard() {
  const active = useRecentlyActive();
  const { data, error, isLoading, mutate } = useApi<DashboardData>('dashboard', {
    refreshInterval: active ? 60_000 : 0,
  });

  if (isLoading) return <Loading rows={6} />;
  if (error || !data) return <ErrorState error={error} retry={() => void mutate()} />;
  const d = data.data;

  const attention = Object.entries(d.queues)
    .map(([key, count]) => ({ key, count, ...(QUEUE_LINKS[key] ?? { label: humanize(key), href: '' }) }))
    .sort((a, b) => b.count - a.count);
  const waiting = attention.filter((a) => a.count > 0);

  const levelTotal = d.reach ? LEVELS.reduce((sum, l) => sum + (d.reach?.itemsByLevel[l] ?? 0), 0) : 0;

  return (
    <>
      <PageHeader title="Dashboard" description={`Counted from live data ${formatAgo(d.generatedAt)}.`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d.users && (
          <>
            <StatCard
              label="PEOPLE"
              value={formatNumber(d.users.total)}
              hint={`${formatNumber(d.users.active)} active`}
            />
            <StatCard
              label="NEW IN 7 DAYS"
              value={formatNumber(d.users.newLast7Days)}
              hint={
                d.users.suspended + d.users.restricted > 0
                  ? `${d.users.suspended} suspended · ${d.users.restricted} restricted`
                  : 'no restrictions'
              }
              tone={d.users.suspended + d.users.restricted > 0 ? 'bad' : 'good'}
            />
          </>
        )}
        {d.content && (
          <>
            <StatCard
              label="POSTS AND REELS"
              value={formatNumber(d.content.posts + d.content.reels)}
              hint={`${formatNumber(d.content.posts)} posts · ${formatNumber(d.content.reels)} reels`}
            />
            <StatCard
              label="HELD FOR REVIEW"
              value={formatNumber(d.content.heldForReview.posts + d.content.heldForReview.reels)}
              hint={`${d.content.reelsBeingMade} reels being made`}
              tone={d.content.heldForReview.posts + d.content.heldForReview.reels > 0 ? 'bad' : 'good'}
            />
          </>
        )}
      </div>

      {(d.users || d.reach) && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {d.users && (
            <Card>
              <CardTitle title="New accounts" hint="Last 14 days" />
              <TrendChart title="New accounts per day" data={d.users.signupsPerDay} unit="New accounts" />
            </Card>
          )}
          {d.reach && (
            <Card>
              <CardTitle title="Qualified views" hint="Last 14 days. Counted by the server, after fraud checks." />
              <TrendChart
                title="Qualified views per day"
                data={d.reach.qualifiedViewsPerDay}
                colour="#0FA39A"
                unit="Qualified views"
              />
            </Card>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {d.reach && (
          <Card>
            <CardTitle
              title="Reach Ladder"
              hint={
                d.reach.activeConfigVersion
                  ? `Settings version ${d.reach.activeConfigVersion}`
                  : 'No settings version is active'
              }
            />
            <div className="space-y-3">
              {LEVELS.map((level) => {
                const n = d.reach?.itemsByLevel[level] ?? 0;
                const pct = levelTotal ? Math.round((n / levelTotal) * 100) : 0;
                const info = levelInfo(level);
                return (
                  <div key={level}>
                    <div className="mb-1 flex justify-between text-[12.5px]">
                      <span className="font-bold">
                        {info?.code} {info?.label}
                      </span>
                      <span className="text-muted">
                        {formatNumber(n)} · {pct}%
                      </span>
                    </div>
                    <div className="bg-soft h-2 overflow-hidden rounded-full" role="presentation">
                      <div
                        className={cn('h-full rounded-full', LEVEL_BG[level])}
                        style={{ width: `${Math.max(pct, n > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {d.money && (
          <Card>
            <CardTitle title="Creator money" hint="From the ledger." />
            <Row label="Owed to creators" value={formatRupees(d.money.owedToCreators)} />
            <Row label="Payouts in flight" value={formatRupees(d.money.payoutsInFlight)} />
            <Row label="Paid out" value={formatRupees(d.money.paidOut)} />
            <Row label="Rewards granted" value={formatRupees(d.money.rewardsGranted)} />
            <Row label="Manual adjustments" value={formatRupees(d.money.manualAdjustments)} />
            {Object.keys(d.money.cycles).length > 0 && (
              <p className="text-muted mt-2 text-xs">
                Reward cycles:{' '}
                {Object.entries(d.money.cycles)
                  .map(([s, n]) => `${n} ${humanize(s).toLowerCase()}`)
                  .join(', ')}
              </p>
            )}
          </Card>
        )}

        <Card className={cn(!d.reach && !d.money && 'lg:col-span-3')}>
          <CardTitle title="Needs attention" hint="Waiting for a person. Most numerous first." />
          {waiting.length === 0 ? (
            <p className="bg-good-bg text-good rounded-xl px-3 py-2.5 text-[13px] font-semibold">
              Nothing is waiting for you.
            </p>
          ) : (
            <ul className="space-y-2">
              {waiting.map((q) => {
                const body = (
                  <span className="flex items-center justify-between gap-3">
                    <span>{q.label}</span>
                    <b className="rounded-full bg-white/70 px-2 py-px">{formatNumber(q.count)}</b>
                  </span>
                );
                const cls = 'block rounded-xl bg-warn-bg px-3.5 py-2.5 text-[13px] font-semibold text-[#7A4E0B]';
                return (
                  <li key={q.key}>
                    {HAS_PAGE.has(q.href) ? (
                      <Link href={q.href} prefetch={false} className={cn(cls, 'hover:brightness-95')}>
                        {body}
                      </Link>
                    ) : (
                      <div className={cls}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
