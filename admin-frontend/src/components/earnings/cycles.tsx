'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, api } from '@/lib/client/api';
import { formatDateTime, formatNumber, formatRupees, humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useApi, useCursorList } from '@/lib/client/use-api';
import type { CycleDetail, CycleView } from '@/lib/types';
import { ConfirmDialog } from '../forms/confirm-dialog';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Field, Input } from '../ui/field';
import { Icon } from '../ui/icon';
import { EmptyState, ErrorState, Loading, LoadMore, describeError } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { LevelBadge, Tag, statusTone } from '../ui/tag';
import { useToast } from '../ui/toast';

/** `2026-11-01T00:00` (a date picker's value, in the viewer's own zone) -> the instant, as ISO text. */
export function localToIso(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** An instant as a date picker's value, in the viewer's own zone. */
export function isoToLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const AMOUNT = /^\d{1,16}(\.\d{1,2})?$/;

const cycleSchema = z
  .object({
    label: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9 _-]{1,38}[A-Za-z0-9]$/,
        'Use 3 to 40 letters, digits, spaces, dashes or underscores, such as 2026-11.',
      ),
    startsAt: z.string().min(1, 'Choose when the cycle starts.'),
    endsAt: z.string().min(1, 'Choose when the cycle ends.'),
    poolAmount: z.string().trim().regex(AMOUNT, 'An amount in rupees with up to two decimals, such as 250000.00.'),
  })
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt), {
    path: ['endsAt'],
    message: 'The cycle must end after it starts.',
  });
type CycleValues = z.infer<typeof cycleSchema>;

function CycleForm({ cycle, onClose, onDone }: { cycle: CycleView | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CycleValues>({
    resolver: zodResolver(cycleSchema),
    defaultValues: {
      label: cycle?.label ?? '',
      startsAt: cycle ? isoToLocal(cycle.startsAt) : '',
      endsAt: cycle ? isoToLocal(cycle.endsAt) : '',
      poolAmount: cycle ? cycle.poolAmount : '',
    },
  });

  const submit = handleSubmit(async (v) => {
    setFailure(null);
    try {
      const body = { startsAt: localToIso(v.startsAt), endsAt: localToIso(v.endsAt), poolAmount: v.poolAmount };
      if (cycle) await api.put(`earnings/cycles/${cycle.id}`, body);
      else await api.post('earnings/cycles', { label: v.label, ...body });
      toast.success(cycle ? 'Cycle updated' : 'Cycle opened');
      onDone();
      onClose();
    } catch (error) {
      const first = error instanceof ApiError ? error.details?.[0] : undefined;
      if (first && first.field in v)
        setError(first.field as keyof CycleValues, { message: first.reasons[0] ?? 'Check this.' });
      else setFailure(describeError(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field
        label="Name"
        hint={cycle ? 'The name cannot be changed.' : 'Something staff will recognise, such as 2026-11.'}
        error={errors.label?.message}
      >
        {(p) => <Input {...p} {...register('label')} disabled={!!cycle} />}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Starts" hint="Your local time." error={errors.startsAt?.message}>
          {(p) => <Input {...p} {...register('startsAt')} type="datetime-local" />}
        </Field>
        <Field label="Ends" error={errors.endsAt?.message}>
          {(p) => <Input {...p} {...register('endsAt')} type="datetime-local" />}
        </Field>
      </div>
      <Field
        label="Pool (₹)"
        hint="The money shared among eligible creators by how their content performed. It is not a rate per view."
        error={errors.poolAmount?.message}
      >
        {(p) => <Input {...p} {...register('poolAmount')} inputMode="decimal" placeholder="250000.00" />}
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
          {cycle ? 'Save changes' : 'Open cycle'}
        </Button>
      </div>
    </form>
  );
}

const SUMMARY_LABELS: Record<string, string> = {
  pool: 'Pool',
  allocated: 'Shared out',
  unspent: 'Left unspent',
  cappedAway: 'Held back by the per-creator cap',
  creators: 'Creators paid',
  configVersion: 'Reach settings version',
  closedAt: 'Closed at',
};

function CycleDrawer({
  cycleId,
  onClose,
  onChanged,
}: {
  cycleId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<CycleDetail>(cycleId ? `earnings/cycles/${cycleId}` : null);
  const [step, setStep] = useState<'close' | 'finalize' | 'edit' | null>(null);
  const c = data?.data;

  const summary = c?.summary ? Object.entries(c.summary).filter(([k]) => k in SUMMARY_LABELS) : [];

  return (
    <>
      <Dialog
        open={cycleId !== null}
        onClose={onClose}
        title={c ? `Cycle ${c.label}` : 'Reward cycle'}
        description={c ? `${formatDateTime(c.startsAt)} to ${formatDateTime(c.endsAt)}` : undefined}
        variant="drawer"
      >
        {isLoading ? (
          <Loading rows={5} />
        ) : error || !c ? (
          <ErrorState error={error} retry={() => void mutate()} />
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <Tag tone={statusTone(c.status)}>{humanize(c.status)}</Tag>
              {c.configVersion && <Tag>Settings v{c.configVersion}</Tag>}
            </div>
            <p className="mb-4 text-[24px] font-extrabold tracking-tight">{formatRupees(c.poolAmount)}</p>

            {summary.length > 0 && (
              <dl className="mb-4">
                {summary.map(([k, v]) => (
                  <div key={k} className="border-line flex justify-between gap-4 border-b py-1.5 last:border-0">
                    <dt className="text-muted text-[12.5px]">{SUMMARY_LABELS[k]}</dt>
                    <dd className="font-bold">
                      {typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && k !== 'configVersion'
                        ? formatRupees(v)
                        : k === 'closedAt'
                          ? formatDateTime(String(v))
                          : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="flex flex-wrap gap-2">
              {c.status === 'OPEN' && can('earnings.cycles.manage') && (
                <>
                  <Button variant="ghost" onClick={() => setStep('edit')}>
                    Change dates or pool
                  </Button>
                  <Button
                    onClick={() => {
                      if (new Date(c.endsAt) > new Date())
                        toast.error('A cycle can be closed only after its end date.');
                      else setStep('close');
                    }}
                  >
                    Close cycle
                  </Button>
                </>
              )}
              {c.status === 'CLOSED' && can('earnings.cycles.finalize') && (
                <Button onClick={() => setStep('finalize')}>Release into the ledger</Button>
              )}
            </div>
            {c.status === 'OPEN' && (
              <p className="text-muted mt-2 text-xs">
                It can be closed after its end date. Estimates update as views are counted.
              </p>
            )}
            {c.status === 'CLOSED' && (
              <p className="text-muted mt-2 text-xs">
                Everyone&apos;s share is fixed but nothing is credited. A different person from the one who closed it
                releases it.
              </p>
            )}

            <h3 className="mt-6 mb-2 text-[14px] font-extrabold">Biggest earners</h3>
            {c.top.length === 0 ? (
              <p className="text-muted text-[13px]">No creator has qualifying reach in this cycle yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {c.top.map((t) => (
                  <li
                    key={t.creatorId}
                    className="bg-soft flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs">{t.creatorId}</span>
                      <span className="text-muted text-xs">
                        {formatNumber(t.qualifiedReach)} qualified reach <LevelBadge level={t.level} />
                      </span>
                    </span>
                    <b>{formatRupees(t.finalizedAmount ?? t.estimatedAmount)}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Dialog>

      {step === 'edit' && c && (
        <Dialog
          open
          onClose={() => setStep(null)}
          title="Change this cycle"
          description="Only an open cycle can change."
        >
          <CycleForm
            cycle={c}
            onClose={() => setStep(null)}
            onDone={() => {
              void mutate();
              onChanged();
            }}
          />
        </Dialog>
      )}
      {step === 'close' && c && (
        <ConfirmDialog
          open
          onClose={() => setStep(null)}
          title={`Close cycle ${c.label}`}
          description="Everyone's share is worked out and fixed from the counted views. Nothing is credited yet: a second person releases it."
          confirmLabel="Close cycle"
          onConfirm={async () => {
            await api.post(`earnings/cycles/${c.id}/close`);
            toast.success('Cycle closed');
            await mutate();
            onChanged();
          }}
        />
      )}
      {step === 'finalize' && c && (
        <ConfirmDialog
          open
          onClose={() => setStep(null)}
          title={`Release cycle ${c.label} into the ledger`}
          description={`Each creator is credited once, in one journal entry. Their balances rise by ${c.summary?.['allocated'] ? formatRupees(String(c.summary['allocated'])) : 'the amounts shown'} in total. This cannot be undone. You cannot do this if you closed the cycle.`}
          confirmLabel="Release money"
          tone="bad"
          onConfirm={async () => {
            await api.post(`earnings/cycles/${c.id}/finalize`);
            toast.success('Cycle released');
            await mutate();
            onChanged();
          }}
        />
      )}
    </>
  );
}

export function Cycles() {
  const { can } = useSession();
  const list = useCursorList<CycleView>('earnings/cycles', {}, 20);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="mb-3 flex justify-end">
        {can('earnings.cycles.manage') && (
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" className="size-4" /> Open a cycle
          </Button>
        )}
      </div>
      <Card className="p-0">
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} retry={() => void list.reload()} />
        ) : list.items.length === 0 ? (
          <EmptyState
            title="No reward cycles yet"
            hint="A cycle is a period and a pool of money shared among eligible creators by how their content performed."
          />
        ) : (
          <Table>
            <caption className="sr-only">Reward cycles, newest first</caption>
            <thead>
              <tr>
                <Th>Cycle</Th>
                <Th>Status</Th>
                <Th className="hidden md:table-cell">Period</Th>
                <Th>Pool</Th>
                <Th className="hidden sm:table-cell">Settings</Th>
                <Th>
                  <span className="sr-only">Open</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-bold">{c.label}</Td>
                  <Td>
                    <Tag tone={statusTone(c.status)}>{humanize(c.status)}</Tag>
                  </Td>
                  <Td className="text-muted hidden text-[12.5px] md:table-cell">
                    {formatDateTime(c.startsAt)} to {formatDateTime(c.endsAt)}
                  </Td>
                  <Td className="font-bold">{formatRupees(c.poolAmount)}</Td>
                  <Td className="hidden sm:table-cell">{c.configVersion ? `v${c.configVersion}` : '—'}</Td>
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpenId(c.id)}
                      aria-label={`Open cycle ${c.label}`}
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

      <CycleDrawer cycleId={openId} onClose={() => setOpenId(null)} onChanged={() => void list.reload()} />
      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Open a reward cycle"
        description="Cycles cannot overlap. The Reach settings live now are fixed for the cycle."
      >
        <CycleForm cycle={null} onClose={() => setCreating(false)} onDone={() => void list.reload()} />
      </Dialog>
    </>
  );
}
