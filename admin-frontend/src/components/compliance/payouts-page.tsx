'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { formatAgo, formatDateTime, formatRupees, humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useApi, useCursorList } from '@/lib/client/use-api';
import type { PayoutDetail, PayoutRow } from '@/lib/types';
import { ReasonDialog } from '../forms/reason-dialog';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Select } from '../ui/field';
import { EmptyState, ErrorState, Loading, LoadMore } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag, statusTone } from '../ui/tag';
import { useToast } from '../ui/toast';

const STATUSES = [
  'PENDING_REVIEW',
  'ON_HOLD',
  'APPROVED',
  'PROCESSING',
  'FAILED',
  'COMPLETED',
  'REVERSED',
  'REJECTED',
  'CANCELLED',
  'REQUESTED',
];

type Action = 'approve' | 'reject' | 'hold' | 'resume' | 'retry';

const ACTIONS: Record<
  Action,
  { title: string; label: string; tone: 'good' | 'bad' | 'ghost' | 'primary'; description: string; done: string }
> = {
  approve: {
    title: 'Approve this payout',
    label: 'Approve',
    tone: 'good',
    description:
      'This gives one approval. At or above the two-approver amount a second, different person must also approve before it is sent. Nobody can approve twice.',
    done: 'Approval recorded',
  },
  reject: {
    title: 'Reject this payout',
    label: 'Reject',
    tone: 'bad',
    description: 'The held amount goes back to the creator’s balance, and they are told.',
    done: 'Payout rejected',
  },
  hold: {
    title: 'Put this payout on hold',
    label: 'Hold',
    tone: 'ghost',
    description: 'It is not sent, and the amount stays held while you look into it.',
    done: 'Payout on hold',
  },
  resume: {
    title: 'Take this payout off hold',
    label: 'Resume',
    tone: 'primary',
    description: 'It goes back to review, and earlier approvals no longer count.',
    done: 'Back in review',
  },
  retry: {
    title: 'Try to send this payout now',
    label: 'Send now',
    tone: 'primary',
    description: 'Safe to repeat: the bank treats the same payout id as the same payout.',
    done: 'Sent to the bank',
  },
};

/** Which actions make sense for a payout in this status, before the person's permissions are considered. */
function actionsFor(status: string): Action[] {
  switch (status) {
    case 'PENDING_REVIEW':
      return ['approve', 'reject', 'hold'];
    case 'ON_HOLD':
      return ['resume', 'reject'];
    case 'APPROVED':
    case 'FAILED':
      return ['retry', 'hold'];
    default:
      return [];
  }
}

const NEEDS: Record<Action, string> = {
  approve: 'payout.approve',
  reject: 'payout.reject',
  hold: 'payout.hold',
  resume: 'payout.retry',
  retry: 'payout.retry',
};

function PayoutDrawer({
  payoutId,
  onClose,
  onChanged,
}: {
  payoutId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<PayoutDetail>(payoutId ? `payouts/${payoutId}` : null);
  const [action, setAction] = useState<Action | null>(null);
  const p = data?.data;
  const available = p ? actionsFor(p.status).filter((a) => can(NEEDS[a])) : [];
  const spec = action ? ACTIONS[action] : null;

  return (
    <>
      <Dialog
        open={payoutId !== null}
        onClose={onClose}
        title={p ? `Payout of ${formatRupees(p.amount)}` : 'Payout'}
        description={p ? `Requested ${formatDateTime(p.requestedAt)}` : undefined}
        variant="drawer"
      >
        {isLoading ? (
          <Loading rows={5} />
        ) : error || !p ? (
          <ErrorState error={error} retry={() => void mutate()} />
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Tag tone={statusTone(p.status)}>{humanize(p.status)}</Tag>
              {Array.isArray(p.riskFlags) &&
                p.riskFlags.map((f) => (
                  <Tag key={String(f)} tone="warn">
                    {humanize(String(f))}
                  </Tag>
                ))}
            </div>
            {p.holdReason && (
              <p className="bg-warn-bg text-warn mb-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold">
                {p.holdReason}
              </p>
            )}
            <dl className="mb-4">
              {[
                ['Amount', formatRupees(p.amount)],
                ['To', `${p.account.bankName} ${p.account.accountNumber}`],
                ['Creator', p.userId],
                [
                  'Expected',
                  p.estimatedFrom ? `${formatDateTime(p.estimatedFrom)} to ${formatDateTime(p.estimatedTo)}` : '—',
                ],
                ['Completed', p.completedAt ? formatDateTime(p.completedAt) : '—'],
                ['Bank reference', p.providerReference ?? '—'],
                ...(p.failureCode ? [['Why it failed', humanize(p.failureCode)]] : []),
              ].map(([a, b]) => (
                <div key={a} className="border-line flex items-start justify-between gap-4 border-b py-2 last:border-0">
                  <dt className="text-muted text-[12.5px]">{a}</dt>
                  <dd className="text-right font-semibold break-all">{b}</dd>
                </div>
              ))}
            </dl>
            {can('earnings.read') && (
              <p className="mb-4 text-[13px]">
                <Link href={`/earnings?creator=${p.userId}`} className="text-brand font-bold hover:underline">
                  Open this creator&apos;s earnings and ledger →
                </Link>
              </p>
            )}

            {available.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {available.map((a) => (
                  <Button key={a} variant={ACTIONS[a].tone} onClick={() => setAction(a)}>
                    {ACTIONS[a].label}
                  </Button>
                ))}
              </div>
            )}

            <section className="mt-6" aria-labelledby="approvals-title">
              <h3 id="approvals-title" className="mb-2 text-[14px] font-extrabold">
                Decisions so far
              </h3>
              {p.approvals.length === 0 ? (
                <p className="text-muted text-[13px]">None yet.</p>
              ) : (
                <ul className="space-y-2">
                  {p.approvals.map((a, i) => (
                    <li key={i} className="bg-soft rounded-xl px-3 py-2.5 text-[13px]">
                      <b>{humanize(a.decision)}</b> by {a.by} · {formatAgo(a.at)}
                      <p className="mt-0.5 whitespace-pre-wrap">{a.note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Dialog>

      {spec && action && p && (
        <ReasonDialog
          open
          onClose={() => setAction(null)}
          title={spec.title}
          description={spec.description}
          confirmLabel={spec.label}
          tone={spec.tone}
          reasonLabel="Your note"
          reasonHint="Recorded in the audit log."
          onConfirm={async (note) => {
            await api.post(`payouts/${p.id}/${action}`, { note });
            toast.success(spec.done);
            await mutate();
            onChanged();
          }}
        />
      )}
    </>
  );
}

export function PayoutsPage() {
  const { can } = useSession();
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useCursorList<PayoutRow>(can('payout.read') ? 'payouts' : null, { status });

  if (!can('payout.read')) return <NoAccess what="payouts" />;

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Money leaving BLOCKS for a creator's bank. The amount is held the moment it is requested. Larger payouts need two different approvers, and nobody can approve a payout twice."
      />
      <div className="mb-3">
        <label htmlFor="payout-status" className="sr-only">
          Status
        </label>
        <Select id="payout-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </div>

      <Card className="p-0">
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} retry={() => void list.reload()} />
        ) : list.items.length === 0 ? (
          <EmptyState title={`No payouts are ${humanize(status).toLowerCase()}`} />
        ) : (
          <Table>
            <caption className="sr-only">Payout requests, newest first</caption>
            <thead>
              <tr>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th className="hidden md:table-cell">To</Th>
                <Th className="hidden sm:table-cell">Approvals</Th>
                <Th className="hidden lg:table-cell">Flags</Th>
                <Th className="hidden lg:table-cell">Requested</Th>
                <Th>
                  <span className="sr-only">Open</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-extrabold">{formatRupees(r.amount)}</Td>
                  <Td>
                    <Tag tone={statusTone(r.status)}>{humanize(r.status)}</Tag>
                  </Td>
                  <Td className="hidden text-[12.5px] md:table-cell">
                    {r.account.bankName} {r.account.accountNumber}
                  </Td>
                  <Td className="hidden sm:table-cell">{r.approvals}</Td>
                  <Td className="hidden lg:table-cell">
                    {Array.isArray(r.riskFlags) && r.riskFlags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r.riskFlags.map((f) => (
                          <Tag key={String(f)} tone="warn">
                            {humanize(String(f))}
                          </Tag>
                        ))}
                      </div>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="text-muted hidden lg:table-cell">{formatAgo(r.requestedAt)}</Td>
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpenId(r.id)}
                      aria-label={`Open payout of ${formatRupees(r.amount)}`}
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
      </Card>

      <PayoutDrawer payoutId={openId} onClose={() => setOpenId(null)} onChanged={() => void list.reload()} />
    </>
  );
}
