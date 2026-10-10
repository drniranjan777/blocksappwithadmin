'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, api, newIdempotencyKey, type Envelope } from '@/lib/client/api';
import { formatDateTime, formatNumber, formatRupees, humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useApi } from '@/lib/client/use-api';
import type { CreatorLedger, CreatorOverview, LedgerEntryView } from '@/lib/types';
import { ReasonDialog } from '../forms/reason-dialog';
import { Button } from '../ui/button';
import { Card, CardTitle, StatCard } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Field, Input, Textarea } from '../ui/field';
import { ErrorState, Loading, describeError } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { LevelBadge, Tag, statusTone } from '../ui/tag';
import { useToast } from '../ui/toast';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REQUIREMENT_LABELS: Record<string, string> = {
  followers: 'Followers',
  accountAgeDays: 'Account age (days)',
  publishedItems: 'Published posts and reels',
  qualifiedReach30d: 'Qualified reach, last 30 days',
};

const adjustSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^-?\d{1,16}(\.\d{1,2})?$/, 'An amount in rupees such as 150.00. Use a minus sign to take money away.')
    .refine((v) => Number(v) !== 0, 'The amount cannot be zero.'),
  reason: z
    .string()
    .trim()
    .min(10, 'Give a reason of at least 10 characters.')
    .max(300, 'Keep the reason to 300 characters or fewer.'),
});

function AdjustForm({ userId, onClose, onDone }: { userId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  // One key per opening of this form: a double click or a retry after a lost connection cannot adjust twice.
  const [key] = useState(() => newIdempotencyKey());
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof adjustSchema>>({ resolver: zodResolver(adjustSchema) });

  const submit = handleSubmit(async (v) => {
    setFailure(null);
    try {
      await api.post('earnings/adjustments', {
        userId,
        amount: v.amount,
        reason: v.reason,
        idempotencyKey: key,
      });
      toast.success('Balance adjusted');
      onDone();
      onClose();
    } catch (error) {
      const field = error instanceof ApiError ? error.details?.find((d) => d.field === 'amount') : undefined;
      if (field) setError('amount', { message: field.reasons[0] ?? 'This amount is not acceptable.' });
      else setFailure(describeError(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field
        label="Amount (₹)"
        hint="Positive adds to what the creator is owed; negative takes away. Refused if it would take the balance below zero, or if it is above the limit set in Settings."
        error={errors.amount?.message}
      >
        {(p) => <Input {...p} {...register('amount')} inputMode="decimal" placeholder="150.00" />}
      </Field>
      <Field
        label="Reason"
        hint="Recorded with the entry in the ledger and the audit log."
        error={errors.reason?.message}
      >
        {(p) => <Textarea {...p} {...register('reason')} rows={3} maxLength={300} />}
      </Field>
      {failure && (
        <p role="alert" className="bg-bad-bg text-bad rounded-lg px-3 py-2 text-[13px] font-semibold">
          {failure}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Post adjustment
        </Button>
      </div>
    </form>
  );
}

function Ledger({ userId }: { userId: string }) {
  // This API pages with the cursor inside the answer rather than beside it, so it has its own key function.
  const pages = useSWRInfinite<Envelope<CreatorLedger>, ApiError>(
    (index, previous) => {
      if (previous && !previous.data.hasMore) return null;
      const after = index === 0 ? '' : `&cursor=${encodeURIComponent(previous?.data.nextCursor ?? '')}`;
      return `ledger/creators/${userId}?limit=20${after}`;
    },
    (key: string) => api.get<CreatorLedger>(key),
    { revalidateFirstPage: false, revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const loaded = pages.data ?? [];
  const entries: LedgerEntryView[] = loaded.flatMap((p) => p.data.entries);
  const balance = loaded[0]?.data.balance ?? null;
  const hasMore = loaded.at(-1)?.data.hasMore ?? false;
  const loadingMore = pages.isValidating && loaded.length > 0 && pages.size > loaded.length;

  if (pages.isLoading) return <Loading rows={3} />;
  if (pages.error) return <ErrorState error={pages.error} retry={() => void pages.mutate()} />;

  return (
    <>
      <p className="text-muted mb-2 text-[13px]">
        Balance now: <b className="text-ink">{formatRupees(balance)}</b>
      </p>
      {entries.length === 0 ? (
        <p className="text-muted text-[13px]">No ledger entries yet.</p>
      ) : (
        <Table>
          <caption className="sr-only">Ledger entries, newest first</caption>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>What</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Balance after</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <Tr key={e.id}>
                <Td className="text-[12.5px] whitespace-nowrap">{formatDateTime(e.createdAt)}</Td>
                <Td>
                  <div className="font-semibold">{humanize(e.type)}</div>
                  {e.memo && <div className="text-muted text-xs">{e.memo}</div>}
                </Td>
                <Td className={`text-right font-bold ${e.amount.startsWith('-') ? 'text-bad' : 'text-good'}`}>
                  {formatRupees(e.amount)}
                </Td>
                <Td className="text-right">{formatRupees(e.balanceAfter)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      {hasMore && (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" loading={loadingMore} onClick={() => void pages.setSize(pages.size + 1)}>
            Load more
          </Button>
        </div>
      )}
    </>
  );
}

export function CreatorLookup({ initialId = '' }: { initialId?: string }) {
  const { can } = useSession();
  const toast = useToast();
  const [input, setInput] = useState(initialId);
  const id = input.trim();
  const valid = UUID.test(id);
  const overview = useApi<CreatorOverview>(valid && can('creators.read') ? `creators/${id}` : null);
  const [adjusting, setAdjusting] = useState(false);
  const [monetisation, setMonetisation] = useState<'suspend' | 'restore' | null>(null);
  const o = overview.data?.data;

  return (
    <>
      <Card>
        <CardTitle title="Find a creator" hint="Paste the person's account id (you can copy it from the Users page)." />
        <label htmlFor="creator-id" className="sr-only">
          Creator account id
        </label>
        <Input
          id="creator-id"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="01990000-0000-7000-8000-000000000001"
          className="max-w-xl font-mono"
          invalid={input !== '' && !valid}
        />
        {input !== '' && !valid && (
          <p className="text-bad mt-1 text-xs font-semibold">
            That is not an account id: it is 36 characters with dashes.
          </p>
        )}
      </Card>

      {valid && (
        <div className="mt-4 space-y-4">
          {overview.isLoading ? (
            <Loading rows={4} />
          ) : overview.error || !o ? (
            <ErrorState error={overview.error} retry={() => void overview.mutate()} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="ESTIMATED THIS CYCLE"
                  value={o.earnings.estimated ? formatRupees(o.earnings.estimated.amount) : '—'}
                  hint={o.earnings.estimated ? `${o.earnings.estimated.cycle.label} · may change` : 'No open cycle'}
                />
                <StatCard
                  label="CLOSED, NOT YET RELEASED"
                  value={formatRupees(o.earnings.pending)}
                  hint="Fixed, waiting for release"
                />
                <StatCard label="RELEASED TO DATE" value={formatRupees(o.earnings.finalized)} />
                <StatCard
                  label="OWED NOW (BALANCE)"
                  value={formatRupees(o.earnings.available)}
                  hint="Can be requested as a payout"
                  tone="good"
                />
              </div>

              <Card>
                <CardTitle
                  title="Monetisation"
                  action={
                    can('creators.monetization.update') ? (
                      o.eligibility.status === 'SUSPENDED' ? (
                        <Button variant="good" size="sm" onClick={() => setMonetisation('restore')}>
                          Lift suspension
                        </Button>
                      ) : (
                        <Button variant="bad" size="sm" onClick={() => setMonetisation('suspend')}>
                          Suspend monetisation
                        </Button>
                      )
                    ) : undefined
                  }
                />
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Tag tone={statusTone(o.eligibility.status)}>{humanize(o.eligibility.status)}</Tag>
                  {o.earnings.estimated && <LevelBadge level={o.earnings.estimated.level} />}
                  {o.eligibility.suspended?.since && (
                    <span className="text-muted text-xs">
                      Suspended since {formatDateTime(o.eligibility.suspended.since)}
                    </span>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {o.eligibility.requirements.map((r) => (
                    <li key={r.key} className="flex items-center justify-between gap-3 text-[13px]">
                      <span>{REQUIREMENT_LABELS[r.key] ?? humanize(r.key)}</span>
                      <span className="flex items-center gap-2">
                        <b>
                          {formatNumber(r.have)} / {formatNumber(r.need)}
                        </b>
                        <Tag tone={r.met ? 'good' : 'warn'}>{r.met ? 'Met' : 'Not yet'}</Tag>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-muted mt-3 text-xs">
                  Eligibility here covers reach and account history. Payouts also need a verified identity and a
                  verified bank account.
                </p>
              </Card>

              {can('ledger.read') && (
                <Card>
                  <CardTitle
                    title="Ledger"
                    hint="Every credit and debit, from the double-entry ledger. Entries are never edited."
                    action={
                      can('earnings.adjust') ? (
                        <Button variant="ghost" size="sm" onClick={() => setAdjusting(true)}>
                          Post an adjustment
                        </Button>
                      ) : undefined
                    }
                  />
                  <Ledger userId={id} key={id + String(o.earnings.available)} />
                </Card>
              )}
            </>
          )}
        </div>
      )}

      <Dialog
        open={adjusting}
        onClose={() => setAdjusting(false)}
        title="Post an adjustment"
        description="A manual correction to this creator's balance, recorded in the ledger."
      >
        <AdjustForm userId={id} onClose={() => setAdjusting(false)} onDone={() => void overview.mutate()} />
      </Dialog>

      {monetisation && (
        <ReasonDialog
          open
          onClose={() => setMonetisation(null)}
          title={monetisation === 'suspend' ? 'Suspend monetisation' : 'Lift the suspension'}
          description={
            monetisation === 'suspend'
              ? 'Rewards stop accruing and releasing until staff restore it, however the creator performs.'
              : 'This does not make anyone eligible: the creator’s record decides that again.'
          }
          confirmLabel={monetisation === 'suspend' ? 'Suspend' : 'Lift suspension'}
          tone={monetisation === 'suspend' ? 'bad' : 'good'}
          onConfirm={async (reason) => {
            await api.post(`creators/${id}/monetization/${monetisation}`, { reason });
            toast.success(monetisation === 'suspend' ? 'Monetisation suspended' : 'Suspension lifted');
            await overview.mutate();
          }}
        />
      )}
    </>
  );
}
