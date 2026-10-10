'use client';

import { useState, type ReactNode } from 'react';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatAgo, formatDateTime, formatNumber, formatRupees, humanize } from '@/lib/client/format';
import { BILLING_STATE, CAMPAIGN_STATUS, OBJECTIVE_LABEL, describeFlag } from '@/lib/business';
import { useSession } from '@/lib/client/session';
import { useDebounced } from '@/lib/client/use-debounced';
import { useApi, useCursorList } from '@/lib/client/use-api';
import type { CampaignCard, CampaignDetail } from '@/lib/types';
import { ConfirmDialog } from '../forms/confirm-dialog';
import { ReasonDialog } from '../forms/reason-dialog';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Input, Select } from '../ui/field';
import { Icon } from '../ui/icon';
import { EmptyState, ErrorState, Loading, LoadMore } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag } from '../ui/tag';
import { useToast } from '../ui/toast';

type Action = 'approve' | 'reject' | 'flag' | 'clear-flag' | 'pause' | 'resume';

const ACTIONS: Record<
  Exclude<Action, 'approve'>,
  {
    title: string;
    label: string;
    tone: 'good' | 'bad' | 'primary' | 'ghost';
    description: string;
    done: string;
    hint: string;
  }
> = {
  reject: {
    title: 'Turn this campaign down',
    label: 'Turn down',
    tone: 'bad',
    description: 'The advertiser can fix it and send it again.',
    done: 'Campaign turned down',
    hint: 'Shown to the advertiser. Say what to change.',
  },
  flag: {
    title: 'Flag this campaign',
    label: 'Flag and stop',
    tone: 'bad',
    description: 'It stops at once and cannot deliver until a person has looked again.',
    done: 'Campaign flagged',
    hint: 'Shown to the advertiser. Say which rule it may break.',
  },
  'clear-flag': {
    title: 'Clear the flag',
    label: 'Clear flag',
    tone: 'good',
    description:
      'A campaign that was paid for waits paused for its owner to start again; an unpaid one is approved again.',
    done: 'Flag cleared',
    hint: 'Recorded in the audit log.',
  },
  pause: {
    title: 'Pause this campaign',
    label: 'Pause',
    tone: 'ghost',
    description: 'It stops delivering. The advertiser cannot resume one that staff paused.',
    done: 'Campaign paused',
    hint: 'Shown to the advertiser.',
  },
  resume: {
    title: 'Resume this campaign',
    label: 'Resume',
    tone: 'primary',
    description: 'It goes back to running, if it is paid for and still in its schedule.',
    done: 'Campaign resumed',
    hint: 'Recorded in the audit log.',
  },
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-line flex items-start justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-muted text-[12.5px]">{label}</dt>
      <dd className="text-right font-semibold break-words">{children}</dd>
    </div>
  );
}

function CampaignDrawer({
  campaignId,
  onClose,
  onChanged,
}: {
  campaignId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<CampaignDetail>(campaignId ? `ads/campaigns/${campaignId}` : null);
  const [action, setAction] = useState<Action | null>(null);
  const c = data?.data;
  const manage = can('ads.manage');

  const available: Action[] =
    !c || !manage
      ? []
      : c.status === 'IN_REVIEW'
        ? ['approve', 'reject']
        : c.status === 'ACTIVE'
          ? ['pause', 'flag']
          : c.status === 'PAUSED'
            ? ['resume', 'flag']
            : c.status === 'APPROVED'
              ? ['flag']
              : c.status === 'FLAGGED'
                ? ['clear-flag']
                : [];

  const run = async (kind: Action, note?: string) => {
    if (!campaignId) return;
    const res = await api.post<CampaignDetail>(`ads/campaigns/${campaignId}/${kind}`, note ? { note } : {});
    await mutate(res, { revalidate: false });
    toast.success(kind === 'approve' ? 'Campaign approved' : ACTIONS[kind].done);
    onChanged();
  };

  const flagged = c ? Object.entries(c.flags ?? {}).flatMap(([k, v]) => describeFlag(k, v) ?? []) : [];

  return (
    <>
      <Dialog
        open={campaignId !== null}
        onClose={onClose}
        title={c ? c.name : 'Campaign'}
        description={c ? `By @${c.advertiser.username}` : undefined}
        variant="drawer"
      >
        {isLoading ? (
          <Loading rows={6} />
        ) : error || !c ? (
          <ErrorState error={error} retry={() => void mutate()} />
        ) : (
          <div>
            <div className="flex flex-wrap gap-1.5">
              <Tag tone={CAMPAIGN_STATUS[c.status].tone}>{CAMPAIGN_STATUS[c.status].label}</Tag>
              <Tag tone="brand">{OBJECTIVE_LABEL[c.objective] ?? humanize(c.objective)}</Tag>
              {c.billingStatus && (
                <Tag tone={BILLING_STATE[c.billingStatus].tone}>{BILLING_STATE[c.billingStatus].label}</Tag>
              )}
              {c.pausedBy && c.status === 'PAUSED' && <Tag tone="warn">Paused by {c.pausedBy.toLowerCase()}</Tag>}
            </div>

            {available.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {available.map((a) =>
                  a === 'approve' ? (
                    <Button key={a} variant="good" onClick={() => setAction(a)}>
                      Approve
                    </Button>
                  ) : (
                    <Button key={a} variant={ACTIONS[a].tone} onClick={() => setAction(a)}>
                      {ACTIONS[a].label}
                    </Button>
                  ),
                )}
              </div>
            )}
            {c.reviewNote && (
              <p className="bg-warn-bg text-warn mt-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold">
                Note to the advertiser: {c.reviewNote}
              </p>
            )}
            {flagged.length > 0 && (
              <ul className="mt-3 space-y-1">
                {flagged.map((f) => (
                  <li key={f} className="bg-soft rounded-lg px-3 py-1.5 text-[12.5px]">
                    {f}
                  </li>
                ))}
              </ul>
            )}

            <section className="mt-5">
              <h3 className="mb-1.5 text-[14px] font-extrabold">What the advertisement says</h3>
              <div className="bg-soft rounded-xl px-3 py-2.5">
                <p className="font-bold">{c.creative.headline}</p>
                {c.creative.body && <p className="mt-1 whitespace-pre-wrap">{c.creative.body}</p>}
                {c.creative.destinationUrl && (
                  <p className="text-muted mt-2 text-xs break-all">Leads to {c.creative.destinationUrl}</p>
                )}
              </div>
              {c.boost && (
                <div className="mt-2 rounded-xl border px-3 py-2.5 text-[13px]">
                  <p className="mb-0.5 font-bold">Promotes a {c.boost.type === 'REEL' ? 'reel' : 'post'}</p>
                  {c.boost.available ? (
                    <p className="whitespace-pre-wrap">{c.boost.excerpt ?? 'No text.'}</p>
                  ) : (
                    <p className="text-bad font-semibold">It is no longer available.</p>
                  )}
                </div>
              )}
            </section>

            <section className="mt-5">
              <h3 className="mb-1.5 text-[14px] font-extrabold">Who it is aimed at</h3>
              <dl>
                <Fact label="Country">India</Fact>
                <Fact label="States">{c.targeting.states.join(', ') || 'All'}</Fact>
                <Fact label="Districts">{c.targeting.districts.join(', ') || 'All'}</Fact>
                <Fact label="Age bands">{c.targeting.ageBands.join(', ') || 'All adults'}</Fact>
                <Fact label="People it could reach">{formatNumber(c.audience.exact)}</Fact>
              </dl>
              <p className="text-muted mt-1 text-xs">
                The advertiser sees this figure rounded down, and never who is in it.
              </p>
            </section>

            <section className="mt-5">
              <h3 className="mb-1.5 text-[14px] font-extrabold">Budget and schedule</h3>
              <dl>
                <Fact label="Total budget">{formatRupees(c.budget)}</Fact>
                <Fact label="Daily limit">{c.dailyBudget ? formatRupees(c.dailyBudget) : 'None'}</Fact>
                <Fact label="Spent so far">{formatRupees(c.spent)}</Fact>
                <Fact label="Starts">{formatDateTime(c.startsAt)}</Fact>
                <Fact label="Ends">{formatDateTime(c.endsAt)}</Fact>
                {c.page && (
                  <Fact label="For the page">
                    {c.page.name}{' '}
                    {c.pageStatus && (
                      <Tag tone={c.pageStatus.status === 'ACTIVE' ? 'good' : 'bad'}>
                        {humanize(c.pageStatus.status)}
                      </Tag>
                    )}
                  </Fact>
                )}
                {c.billing && (
                  <>
                    <Fact label="Payment">{BILLING_STATE[c.billing.status].label}</Fact>
                    {c.billing.reference && <Fact label="Provider reference">{c.billing.reference}</Fact>}
                    {c.billing.fundedAt && <Fact label="Paid">{formatDateTime(c.billing.fundedAt)}</Fact>}
                  </>
                )}
              </dl>
            </section>

            <section className="mt-5">
              <h3 className="mb-1.5 text-[14px] font-extrabold">The advertiser</h3>
              <dl>
                <Fact label="Account">
                  @{c.advertiserStanding.user?.username}{' '}
                  {c.advertiserStanding.user && c.advertiserStanding.user.status !== 'ACTIVE' && (
                    <Tag tone="bad">{humanize(c.advertiserStanding.user.status)}</Tag>
                  )}
                </Fact>
                <Fact label="Reports against them">{formatNumber(c.advertiserStanding.reportsAgainst)}</Fact>
                <Fact label="Campaigns">
                  {Object.entries(c.advertiserStanding.campaigns)
                    .map(([s, n]) => `${CAMPAIGN_STATUS[s as keyof typeof CAMPAIGN_STATUS]?.label ?? humanize(s)} ${n}`)
                    .join(' · ') || '—'}
                </Fact>
              </dl>
            </section>

            {c.history.length > 0 && (
              <section className="mt-5">
                <h3 className="mb-1.5 text-[14px] font-extrabold">History</h3>
                <ol className="space-y-1.5">
                  {c.history.map((h, i) => (
                    <li key={`${h.createdAt}-${i}`} className="bg-soft rounded-xl px-3 py-2 text-[13px]">
                      <span className="font-bold">{humanize(h.action.replace(/^ads\./, ''))}</span>{' '}
                      <span className="text-muted">
                        · {h.actorLabel ?? 'the system'} · {formatAgo(h.createdAt)}
                      </span>
                      {h.reason && <p className="mt-0.5 whitespace-pre-wrap">{h.reason}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}
      </Dialog>

      {action === 'approve' && c && (
        <ConfirmDialog
          open
          onClose={() => setAction(null)}
          title="Approve this campaign"
          description="It still will not run until it is paid for and its start time comes."
          confirmLabel="Approve"
          tone="good"
          onConfirm={() => run('approve')}
        >
          <ul className="bg-soft list-disc space-y-1 rounded-xl py-3 pr-3 pl-7 text-[13px]">
            <li>The words and the destination are fit to show.</li>
            <li>The audience is not so small it could point at one person.</li>
            <li>The advertiser, the page and anything promoted are in good standing.</li>
          </ul>
        </ConfirmDialog>
      )}
      {action && action !== 'approve' && c && (
        <ReasonDialog
          open
          onClose={() => setAction(null)}
          title={ACTIONS[action].title}
          description={ACTIONS[action].description}
          confirmLabel={ACTIONS[action].label}
          tone={ACTIONS[action].tone}
          reasonLabel="Note"
          reasonHint={ACTIONS[action].hint}
          onConfirm={(note) => run(action, note)}
        />
      )}
    </>
  );
}

export function CampaignsPage() {
  const { can } = useSession();
  const [scope, setScope] = useState<'review' | 'all'>('review');
  const [status, setStatus] = useState('');
  const [billing, setBilling] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useDebounced(search.trim());
  const list = useCursorList<CampaignCard>(can('ads.read') ? 'ads/campaigns' : null, {
    scope: status || q || billing ? 'all' : scope,
    status,
    billing,
    q,
  });
  const billingRead = can('ads.billing.read');

  if (!can('ads.read')) return <NoAccess what="advertising campaigns" />;

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Advertising campaigns waiting for a decision, and everything that has run. Nothing runs without a person approving it, and nothing runs until it is paid for."
      />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="Campaign view" className="flex gap-1.5">
          {(
            [
              ['review', 'Waiting for review'],
              ['all', 'All campaigns'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              id={`camp-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={scope === id}
              aria-controls="camp-panel"
              onClick={() => setScope(id)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[13px] font-bold',
                scope === id ? 'bg-brand text-white' : 'text-ink border-line hover:bg-soft border bg-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <label htmlFor="camp-search" className="sr-only">
            Search campaigns
          </label>
          <Icon
            name="search"
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id="camp-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Campaign name"
            className="pl-9"
            maxLength={100}
          />
        </div>
        <div>
          <label htmlFor="camp-status" className="sr-only">
            Status
          </label>
          <Select id="camp-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {Object.entries(CAMPAIGN_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        {billingRead && (
          <div>
            <label htmlFor="camp-billing" className="sr-only">
              Payment
            </label>
            <Select id="camp-billing" value={billing} onChange={(e) => setBilling(e.target.value)}>
              <option value="">Any payment state</option>
              {Object.entries(BILLING_STATE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <Card className="p-0">
        <div id="camp-panel" role="tabpanel" aria-labelledby={`camp-tab-${scope}`}>
          {list.loading ? (
            <Loading />
          ) : list.error ? (
            <ErrorState error={list.error} retry={() => void list.reload()} />
          ) : list.items.length === 0 ? (
            <EmptyState
              title={scope === 'review' && !status && !q ? 'Nothing is waiting for review' : 'No campaigns match'}
              hint="Campaigns appear here once an advertiser sends them for review."
            />
          ) : (
            <Table>
              <caption className="sr-only">
                Campaigns, {scope === 'review' && !status && !q ? 'oldest first' : 'newest first'}
              </caption>
              <thead>
                <tr>
                  <Th>Campaign</Th>
                  <Th className="hidden md:table-cell">Advertiser</Th>
                  <Th className="hidden sm:table-cell">Budget</Th>
                  <Th>Status</Th>
                  <Th className="hidden lg:table-cell">Schedule</Th>
                  <Th>
                    <span className="sr-only">Open</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <div className="font-bold">{c.name}</div>
                      <div className="text-muted text-xs">{OBJECTIVE_LABEL[c.objective] ?? humanize(c.objective)}</div>
                      {c.waitingHours !== null && <div className="text-muted text-xs">Waiting {c.waitingHours} h</div>}
                    </Td>
                    <Td className="text-muted hidden md:table-cell">
                      @{c.advertiser.username}
                      {c.page ? ` · ${c.page.name}` : ''}
                    </Td>
                    <Td className="hidden sm:table-cell">{formatRupees(c.budget)}</Td>
                    <Td>
                      <Tag tone={CAMPAIGN_STATUS[c.status].tone}>{CAMPAIGN_STATUS[c.status].label}</Tag>
                    </Td>
                    <Td className="text-muted hidden lg:table-cell">
                      {formatDateTime(c.startsAt)} – {formatDateTime(c.endsAt)}
                    </Td>
                    <Td>
                      <Button variant="ghost" size="sm" onClick={() => setOpenId(c.id)} aria-label={`Open ${c.name}`}>
                        Open
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={() => void list.loadMore()} />
        </div>
      </Card>
      <CampaignDrawer campaignId={openId} onClose={() => setOpenId(null)} onChanged={() => void list.reload()} />
    </>
  );
}
