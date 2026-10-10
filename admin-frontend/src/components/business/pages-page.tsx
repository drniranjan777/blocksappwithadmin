'use client';

import { useState, type ReactNode } from 'react';
import { api } from '@/lib/client/api';
import { formatAgo, formatDateTime, formatNumber, humanize } from '@/lib/client/format';
import { CAMPAIGN_STATUS, PAGE_STATUS, VERIFICATION_KIND, VERIFICATION_STATE } from '@/lib/business';
import { useSession } from '@/lib/client/session';
import { useDebounced } from '@/lib/client/use-debounced';
import { useApi, useCursorList } from '@/lib/client/use-api';
import type { BusinessPageCard, BusinessPageDetail, CampaignStatus } from '@/lib/types';
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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-line flex items-start justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-muted text-[12.5px]">{label}</dt>
      <dd className="text-right font-semibold break-words">{children}</dd>
    </div>
  );
}

function PageDrawer({
  pageId,
  onClose,
  onChanged,
}: {
  pageId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<BusinessPageDetail>(pageId ? `business/pages/${pageId}` : null);
  const [action, setAction] = useState<'suspend' | 'restore' | null>(null);
  const p = data?.data;
  const mayManage = can('business.manage');

  return (
    <>
      <Dialog
        open={pageId !== null}
        onClose={onClose}
        title={p ? p.name : 'Business page'}
        description={p ? `/${p.slug}` : undefined}
        variant="drawer"
      >
        {isLoading ? (
          <Loading rows={6} />
        ) : error || !p ? (
          <ErrorState error={error} retry={() => void mutate()} />
        ) : (
          <div>
            <div className="flex flex-wrap gap-1.5">
              <Tag tone={PAGE_STATUS[p.status].tone}>{PAGE_STATUS[p.status].label}</Tag>
              <Tag tone={VERIFICATION_STATE[p.verification].tone}>{VERIFICATION_STATE[p.verification].label}</Tag>
              <Tag tone="brand">{p.category}</Tag>
            </div>
            {p.status === 'SUSPENDED' && p.statusReason && (
              <p className="bg-warn-bg text-warn mt-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold">
                Suspended: {p.statusReason}
              </p>
            )}
            {mayManage && (p.status === 'ACTIVE' || p.status === 'SUSPENDED') && (
              <div className="mt-4 flex gap-2">
                {p.status === 'ACTIVE' ? (
                  <Button variant="bad" onClick={() => setAction('suspend')}>
                    Suspend this page
                  </Button>
                ) : (
                  <Button variant="good" onClick={() => setAction('restore')}>
                    Restore this page
                  </Button>
                )}
              </div>
            )}

            {p.description && (
              <p className="bg-soft mt-4 rounded-xl px-3 py-2.5 whitespace-pre-wrap">{p.description}</p>
            )}
            <dl className="mt-3">
              <Fact label="Owner">@{p.owner.username}</Fact>
              <Fact label="Where">
                {[p.city, p.location.district, p.location.state].filter(Boolean).join(', ') || '—'}
              </Fact>
              <Fact label="Contact">{p.contactEmail ?? '—'}</Fact>
              <Fact label="Website">{p.websiteUrl ?? '—'}</Fact>
              <Fact label="Followers">{formatNumber(p.followers)}</Fact>
              <Fact label="Posts · offers">
                {formatNumber(p.counts.posts)} · {formatNumber(p.counts.offers)}
              </Fact>
              <Fact label="Registration number">
                {p.gstinLast4 ? `…${p.gstinLast4} (not checked against the register)` : '—'}
              </Fact>
              <Fact label="Reports against the owner">{formatNumber(p.ownerReportsAgainst)}</Fact>
              <Fact label="Created">{formatDateTime(p.createdAt)}</Fact>
              {p.statusChangedAt && <Fact label="Last status change">{formatAgo(p.statusChangedAt)}</Fact>}
            </dl>

            {Object.keys(p.campaigns).length > 0 && (
              <section className="mt-6">
                <h3 className="mb-2 text-[14px] font-extrabold">Campaigns</h3>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(p.campaigns).map(([status, n]) => (
                    <Tag key={status} tone={CAMPAIGN_STATUS[status as CampaignStatus]?.tone ?? 'neutral'}>
                      {CAMPAIGN_STATUS[status as CampaignStatus]?.label ?? humanize(status)}: {n}
                    </Tag>
                  ))}
                </div>
              </section>
            )}
            {p.verificationRequests.length > 0 && (
              <section className="mt-6">
                <h3 className="mb-2 text-[14px] font-extrabold">Verification history</h3>
                <ul className="space-y-1.5">
                  {p.verificationRequests.map((v) => (
                    <li key={v.id} className="bg-soft rounded-xl px-3 py-2 text-[13px]">
                      <span className="font-bold">{VERIFICATION_KIND[v.type]}</span> ·{' '}
                      {VERIFICATION_STATE[v.status].label} · {formatAgo(v.submittedAt)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Dialog>

      {action && p && (
        <ReasonDialog
          open
          onClose={() => setAction(null)}
          title={action === 'suspend' ? 'Suspend this page' : 'Restore this page'}
          description={
            action === 'suspend'
              ? 'The page and everything posted as it are hidden, and its campaigns are paused. The owner is told why.'
              : 'The page and what was posted as it are visible again. Its campaigns stay paused until the owner resumes them.'
          }
          confirmLabel={action === 'suspend' ? 'Suspend' : 'Restore'}
          tone={action === 'suspend' ? 'bad' : 'good'}
          reasonHint="Shown to the owner. Recorded in the audit log."
          onConfirm={async (reason) => {
            const res = await api.post<BusinessPageDetail>(`business/pages/${p.id}/${action}`, { reason });
            await mutate(res, { revalidate: false });
            toast.success(action === 'suspend' ? 'Page suspended' : 'Page restored');
            onChanged();
          }}
        />
      )}
    </>
  );
}

export function PagesPage() {
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [verification, setVerification] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useDebounced(search.trim());
  const list = useCursorList<BusinessPageCard>(can('business.read') ? 'business/pages' : null, {
    q,
    status,
    verification,
  });

  if (!can('business.read')) return <NoAccess what="business pages" />;

  return (
    <>
      <PageHeader
        title="Business pages"
        description="Pages that businesses publish on BLOCKS. A page is a place to post and be found; the verified badge is separate and is granted only after review."
      />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <label htmlFor="page-search" className="sr-only">
            Search pages
          </label>
          <Icon
            name="search"
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id="page-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Page name or address"
            className="pl-9"
            maxLength={100}
          />
        </div>
        <div>
          <label htmlFor="page-status" className="sr-only">
            Status
          </label>
          <Select id="page-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {(['DRAFT', 'ACTIVE', 'SUSPENDED'] as const).map((s) => (
              <option key={s} value={s}>
                {PAGE_STATUS[s].label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="page-verification" className="sr-only">
            Verification
          </label>
          <Select id="page-verification" value={verification} onChange={(e) => setVerification(e.target.value)}>
            <option value="">Any verification</option>
            {(['NONE', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
              <option key={s} value={s}>
                {VERIFICATION_STATE[s].label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card className="p-0">
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} retry={() => void list.reload()} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No pages match" hint="Try a different spelling, or clear a filter." />
        ) : (
          <Table>
            <caption className="sr-only">Business pages, newest first</caption>
            <thead>
              <tr>
                <Th>Page</Th>
                <Th className="hidden sm:table-cell">Status</Th>
                <Th className="hidden md:table-cell">Owner</Th>
                <Th className="hidden md:table-cell">Followers</Th>
                <Th className="hidden lg:table-cell">Created</Th>
                <Th>
                  <span className="sr-only">Open</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <div className="font-bold">{p.name}</div>
                    <div className="text-muted text-xs">
                      /{p.slug} · {p.category}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                      <Tag tone={PAGE_STATUS[p.status].tone}>{PAGE_STATUS[p.status].label}</Tag>
                    </div>
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      <Tag tone={PAGE_STATUS[p.status].tone}>{PAGE_STATUS[p.status].label}</Tag>
                      {p.verification !== 'NONE' && (
                        <Tag tone={VERIFICATION_STATE[p.verification].tone}>
                          {VERIFICATION_STATE[p.verification].label}
                        </Tag>
                      )}
                    </div>
                  </Td>
                  <Td className="text-muted hidden md:table-cell">@{p.owner.username}</Td>
                  <Td className="hidden md:table-cell">{formatNumber(p.followers)}</Td>
                  <Td className="text-muted hidden lg:table-cell">{formatAgo(p.createdAt)}</Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => setOpenId(p.id)} aria-label={`Open ${p.name}`}>
                      Open
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={() => void list.loadMore()} />
      </Card>
      <PageDrawer pageId={openId} onClose={() => setOpenId(null)} onChanged={() => void list.reload()} />
    </>
  );
}
