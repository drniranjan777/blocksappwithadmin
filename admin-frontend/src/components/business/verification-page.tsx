'use client';

import { useState, type ReactNode } from 'react';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatAgo, formatDateTime, formatNumber, humanize } from '@/lib/client/format';
import { VERIFICATION_KIND, VERIFICATION_STATE } from '@/lib/business';
import { useSession } from '@/lib/client/session';
import { useApi, useCursorList } from '@/lib/client/use-api';
import type { VerificationCard, VerificationDetail } from '@/lib/types';
import { ReasonDialog } from '../forms/reason-dialog';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Select } from '../ui/field';
import { EmptyState, ErrorState, Loading, LoadMore } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag } from '../ui/tag';
import { useToast } from '../ui/toast';

type View = 'PENDING' | 'APPROVED' | 'REJECTED';
const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'PENDING', label: 'Waiting' },
  { id: 'APPROVED', label: 'Granted' },
  { id: 'REJECTED', label: 'Refused or taken back' },
];

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-line flex items-start justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-muted text-[12.5px]">{label}</dt>
      <dd className="text-right font-semibold break-words">{children}</dd>
    </div>
  );
}

function RequestDrawer({
  requestId,
  onClose,
  onChanged,
}: {
  requestId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<VerificationDetail>(
    requestId ? `business/verification/${requestId}` : null,
  );
  const [action, setAction] = useState<'APPROVE' | 'REJECT' | 'revoke' | null>(null);
  const r = data?.data;
  const mayDecide = can('business.verify');

  const done = async (res: { data: VerificationDetail }, message: string) => {
    await mutate(res, { revalidate: false });
    toast.success(message);
    onChanged();
  };

  return (
    <>
      <Dialog
        open={requestId !== null}
        onClose={onClose}
        title={r ? VERIFICATION_KIND[r.type] : 'Verification request'}
        description={r ? `From @${r.user.username}` : undefined}
        variant="drawer"
      >
        {isLoading ? (
          <Loading rows={6} />
        ) : error || !r ? (
          <ErrorState error={error} retry={() => void mutate()} />
        ) : (
          <div>
            <div className="flex flex-wrap gap-1.5">
              <Tag tone={VERIFICATION_STATE[r.status].tone}>{VERIFICATION_STATE[r.status].label}</Tag>
              <Tag tone="brand">{VERIFICATION_KIND[r.type]}</Tag>
            </div>

            {mayDecide && r.status === 'PENDING' && (
              <div className="mt-4 flex gap-2">
                <Button variant="good" onClick={() => setAction('APPROVE')}>
                  Approve
                </Button>
                <Button variant="bad" onClick={() => setAction('REJECT')}>
                  Refuse
                </Button>
              </div>
            )}
            {mayDecide && r.status === 'APPROVED' && (
              <div className="mt-4">
                <Button variant="bad" onClick={() => setAction('revoke')}>
                  Take the badge back
                </Button>
              </div>
            )}

            {r.note && (
              <section className="mt-5">
                <h3 className="mb-1.5 text-[14px] font-extrabold">What they said</h3>
                <p className="bg-soft rounded-xl px-3 py-2.5 whitespace-pre-wrap">{r.note}</p>
              </section>
            )}

            <section className="mt-5">
              <h3 className="mb-1.5 text-[14px] font-extrabold">Evidence</h3>
              <dl>
                {r.evidence.identity && (
                  <Fact label="Identity verification">
                    <Tag tone={r.evidence.identity.status === 'VERIFIED' ? 'good' : 'warn'}>
                      {humanize(r.evidence.identity.status)}
                    </Tag>
                  </Fact>
                )}
                {r.evidence.page && (
                  <>
                    <Fact label="Page">
                      {r.page?.name} <span className="text-muted">/{r.page?.slug}</span>
                    </Fact>
                    <Fact label="Category">{r.evidence.page.category}</Fact>
                    <Fact label="Website">{r.evidence.page.websiteUrl ?? '—'}</Fact>
                    <Fact label="Contact">{r.evidence.page.contactEmail ?? '—'}</Fact>
                    <Fact label="Followers">{formatNumber(r.evidence.page.followersCount)}</Fact>
                    <Fact label="Registration number">
                      {r.evidence.page.gstinLast4 ? `…${r.evidence.page.gstinLast4}` : 'Not given'}
                    </Fact>
                  </>
                )}
                <Fact label="Reports against the account">{formatNumber(r.evidence.account.reportsAgainst)}</Fact>
                <Fact label="Followers · posts">
                  {formatNumber(r.evidence.account.followers)} · {formatNumber(r.evidence.account.posts)}
                </Fact>
                <Fact label="Current badge">{humanize(r.evidence.account.badge)}</Fact>
              </dl>
              {r.evidence.page?.gstinLast4 && (
                <p role="note" className="bg-warn-bg text-warn mt-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold">
                  {r.evidence.page.gstinChecked}
                </p>
              )}
              <p className="text-muted mt-2 text-xs">
                Nothing here is checked with an outside authority. You are judging the evidence; granting a badge says
                BLOCKS has looked at it.
              </p>
            </section>

            {r.decisionNote && (
              <section className="mt-5">
                <h3 className="mb-1.5 text-[14px] font-extrabold">Decision</h3>
                <p className="text-[13px]">
                  {r.reviewedBy?.name ?? '—'} · {formatAgo(r.reviewedAt)}
                </p>
                <p className="bg-soft mt-1 rounded-xl px-3 py-2.5 whitespace-pre-wrap">{r.decisionNote}</p>
                <p className="text-muted mt-1 text-xs">The person can read this note.</p>
              </section>
            )}

            {r.earlier.length > 0 && (
              <section className="mt-5">
                <h3 className="mb-1.5 text-[14px] font-extrabold">Their earlier requests</h3>
                <ul className="space-y-1.5">
                  {r.earlier.map((e) => (
                    <li key={e.id} className="bg-soft rounded-xl px-3 py-2 text-[13px]">
                      <span className="font-bold">{VERIFICATION_KIND[e.type]}</span> ·{' '}
                      {VERIFICATION_STATE[e.status].label} · {formatDateTime(e.submittedAt)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Dialog>

      {(action === 'APPROVE' || action === 'REJECT') && r && (
        <ReasonDialog
          open
          onClose={() => setAction(null)}
          title={action === 'APPROVE' ? 'Grant this badge' : 'Refuse this request'}
          description={
            action === 'APPROVE'
              ? 'The condition is checked again on the server when you confirm.'
              : 'Say what is missing or wrong, so they can fix it and ask again.'
          }
          confirmLabel={action === 'APPROVE' ? 'Grant badge' : 'Refuse'}
          tone={action === 'APPROVE' ? 'good' : 'bad'}
          reasonLabel="Note to the person"
          reasonHint="They can read this. Recorded in the audit log."
          onConfirm={async (note) => {
            const res = await api.post<VerificationDetail>(`business/verification/${r.id}/decision`, {
              decision: action,
              note,
            });
            await done(res, action === 'APPROVE' ? 'Badge granted' : 'Request refused');
          }}
        />
      )}
      {action === 'revoke' && r && (
        <ReasonDialog
          open
          onClose={() => setAction(null)}
          title="Take the badge back"
          description="The badge is removed and the person is told. This is its own step and is recorded in the audit log."
          confirmLabel="Take it back"
          tone="bad"
          onConfirm={async (reason) => {
            const res = await api.post<VerificationDetail>(`business/verification/${r.id}/revoke`, { reason });
            await done(res, 'Badge taken back');
          }}
        />
      )}
    </>
  );
}

export function VerificationPage() {
  const { can } = useSession();
  const [view, setView] = useState<View>('PENDING');
  const [type, setType] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useCursorList<VerificationCard>(can('business.read') ? 'business/verification' : null, {
    status: view,
    type,
  });

  if (!can('business.read')) return <NoAccess what="verification requests" />;

  return (
    <>
      <PageHeader
        title="Business verification"
        description="People asking for an identity, business or publisher badge. A person reviews every request; nothing is granted automatically. An identity badge needs a completed identity verification."
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Request view" className="flex flex-wrap gap-1.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              id={`vr-tab-${v.id}`}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              aria-controls="vr-panel"
              onClick={() => setView(v.id)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[13px] font-bold',
                view === v.id ? 'bg-brand text-white' : 'text-ink border-line hover:bg-soft border bg-white',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="vr-type" className="sr-only">
            Kind of badge
          </label>
          <Select id="vr-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Any badge</option>
            {(['IDENTITY', 'BUSINESS', 'PUBLISHER'] as const).map((k) => (
              <option key={k} value={k}>
                {VERIFICATION_KIND[k]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Card className="p-0">
        <div id="vr-panel" role="tabpanel" aria-labelledby={`vr-tab-${view}`}>
          {list.loading ? (
            <Loading />
          ) : list.error ? (
            <ErrorState error={list.error} retry={() => void list.reload()} />
          ) : list.items.length === 0 ? (
            <EmptyState
              title={view === 'PENDING' ? 'Nothing is waiting' : 'Nothing here yet'}
              hint="Requests appear here as people send them."
            />
          ) : (
            <Table>
              <caption className="sr-only">
                Verification requests, {view === 'PENDING' ? 'oldest first' : 'newest first'}
              </caption>
              <thead>
                <tr>
                  <Th>Request</Th>
                  <Th className="hidden sm:table-cell">Page</Th>
                  <Th className="hidden md:table-cell">Sent</Th>
                  <Th className="hidden lg:table-cell">Reviewed by</Th>
                  <Th>
                    <span className="sr-only">Open</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <div className="font-bold">{VERIFICATION_KIND[r.type]}</div>
                      <div className="text-muted text-xs">@{r.user.username}</div>
                    </Td>
                    <Td className="text-muted hidden sm:table-cell">{r.page ? r.page.name : '—'}</Td>
                    <Td className="text-muted hidden md:table-cell">{formatAgo(r.submittedAt)}</Td>
                    <Td className="text-muted hidden lg:table-cell">{r.reviewedBy?.name ?? '—'}</Td>
                    <Td>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpenId(r.id)}
                        aria-label={`Open ${VERIFICATION_KIND[r.type]} request from ${r.user.username}`}
                      >
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
      <RequestDrawer requestId={openId} onClose={() => setOpenId(null)} onChanged={() => void list.reload()} />
    </>
  );
}
