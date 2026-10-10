'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatAgo, formatDateTime, humanize } from '@/lib/client/format';
import { CATEGORY_LABEL, DECISION_LABEL, TARGET_LABEL } from '@/lib/moderation';
import { useSession } from '@/lib/client/session';
import { useApi, useCursorList } from '@/lib/client/use-api';
import type { AppealCard, AppealDetail, AppealStatus } from '@/lib/types';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Field, Textarea } from '../ui/field';
import { EmptyState, ErrorState, Loading, LoadMore, describeError } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag, statusTone, type Tone } from '../ui/tag';
import { useToast } from '../ui/toast';

type View = 'waiting' | 'mine' | 'decided';
const VIEWS: Array<{ id: View; label: string; params: Record<string, string> }> = [
  { id: 'waiting', label: 'Waiting', params: {} },
  { id: 'mine', label: 'Mine', params: { assignee: 'me' } },
  { id: 'decided', label: 'Decided', params: { scope: 'decided' } },
];

const STATUS: Record<AppealStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Waiting', tone: 'brand' },
  IN_REVIEW: { label: 'Being reviewed', tone: 'warn' },
  UPHELD: { label: 'Decision stands', tone: 'neutral' },
  OVERTURNED: { label: 'Overturned', tone: 'good' },
  REJECTED: { label: 'Rejected', tone: 'neutral' },
};

const OUTCOMES = [
  {
    value: 'UPHELD',
    label: 'Uphold the decision',
    hint: 'The original decision stands. Nothing changes.',
  },
  {
    value: 'OVERTURNED',
    label: 'Overturn the decision',
    hint: 'The decision is reversed: the content is restored or the account reactivated. Needs permission to restore.',
  },
  {
    value: 'REJECTED',
    label: 'Reject the appeal',
    hint: 'It cannot be taken forward (for example, it gives no reason). Nothing changes.',
  },
] as const;

const decideSchema = z.object({
  decision: z.enum(['UPHELD', 'OVERTURNED', 'REJECTED'], { error: 'Choose an outcome.' }),
  note: z
    .string()
    .trim()
    .min(10, 'Write at least 10 characters: the person will read this.')
    .max(1000, 'Keep it to 1,000 characters or fewer.'),
});
type DecideValues = z.infer<typeof decideSchema>;

function DecideDialog({
  appeal,
  onClose,
  onDecided,
}: {
  appeal: AppealDetail;
  onClose: () => void;
  onDecided: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DecideValues>({ resolver: zodResolver(decideSchema), defaultValues: { note: '' } });
  const [failure, setFailure] = useState<string | null>(null);

  const submit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      await api.post(`appeals/${appeal.id}/decision`, values);
      onDecided();
      onClose();
    } catch (e) {
      setFailure(describeError(e));
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Decide this appeal"
      description="You are reviewing a decision somebody else made. The person is told the outcome."
      busy={isSubmitting}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-bold">Outcome</legend>
          <div className="space-y-2">
            {OUTCOMES.map((o) => (
              <label
                key={o.value}
                className="border-line hover:bg-soft flex cursor-pointer items-start gap-2.5 rounded-xl border p-3"
              >
                <input type="radio" value={o.value} {...register('decision')} className="mt-1" />
                <span>
                  <span className="block font-bold">{o.label}</span>
                  <span className="text-muted block text-xs">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.decision && (
            <p role="alert" className="text-bad mt-1 text-xs font-semibold">
              {errors.decision.message}
            </p>
          )}
        </fieldset>
        <Field
          label="Note to the person"
          hint="Shown to the person who appealed. Say why, plainly, and leave out internal detail."
          error={errors.note?.message}
        >
          {(p) => <Textarea {...p} {...register('note')} rows={4} maxLength={1000} />}
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
            Record decision
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-line flex items-start justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-muted text-[12.5px]">{label}</dt>
      <dd className="text-right font-semibold break-words">{children}</dd>
    </div>
  );
}

function AppealDrawer({
  appealId,
  onClose,
  onChanged,
}: {
  appealId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { session } = useSession();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<AppealDetail>(appealId ? `appeals/${appealId}` : null);
  const [deciding, setDeciding] = useState(false);
  const [busy, setBusy] = useState<'claim' | 'release' | null>(null);
  const a = data?.data;

  const post = async (kind: 'claim' | 'release') => {
    if (!appealId) return;
    setBusy(kind);
    try {
      const res = await api.post<AppealDetail>(`appeals/${appealId}/${kind}`);
      await mutate(res, { revalidate: false });
      toast.success(kind === 'claim' ? 'You are reviewing this appeal' : 'Put back');
      onChanged();
    } catch (e) {
      toast.error(describeError(e));
      await mutate();
    } finally {
      setBusy(null);
    }
  };

  const mine = !!a && a.assignedTo?.id === session?.admin.id;
  return (
    <>
      <Dialog
        open={appealId !== null}
        onClose={onClose}
        title={a ? `Appeal from @${a.user.username}` : 'Appeal'}
        description={a ? (a.kind === 'ACCOUNT' ? 'About their account' : 'About their content') : undefined}
        variant="drawer"
      >
        {isLoading ? (
          <Loading rows={6} />
        ) : error || !a ? (
          <ErrorState error={error} retry={() => void mutate()} />
        ) : (
          <div>
            <div className="flex flex-wrap gap-1.5">
              <Tag tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Tag>
              {a.overdue && <Tag tone="bad">Overdue</Tag>}
              {a.original?.source === 'AUTOMATED' && <Tag tone="warn">Automatic decision</Tag>}
            </div>

            {a.you.madeTheOriginalDecision && (
              <p role="note" className="bg-warn-bg text-warn mt-4 rounded-xl px-3 py-2.5 text-[13px] font-semibold">
                You made the decision under appeal, so someone else has to review it. You can read it but not take or
                decide it.
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {a.you.canClaim && (
                <Button loading={busy === 'claim'} onClick={() => void post('claim')}>
                  Take this appeal
                </Button>
              )}
              {a.you.canDecide && <Button onClick={() => setDeciding(true)}>Decide…</Button>}
              {a.status === 'IN_REVIEW' && mine && (
                <Button variant="ghost" loading={busy === 'release'} onClick={() => void post('release')}>
                  Put back
                </Button>
              )}
            </div>
            {a.status === 'IN_REVIEW' && !mine && a.assignedTo && (
              <p className="text-muted mt-3 text-[13px]">{a.assignedTo.name} is reviewing this appeal.</p>
            )}

            <section className="mt-6">
              <h3 className="mb-2 text-[14px] font-extrabold">What they say</h3>
              <p className="bg-soft rounded-xl px-3 py-2.5 whitespace-pre-wrap">{a.reason}</p>
              <p className="text-muted mt-1 text-xs">Sent {formatDateTime(a.createdAt)}</p>
            </section>

            {a.original && (
              <section className="mt-6">
                <h3 className="mb-2 text-[14px] font-extrabold">The decision under appeal</h3>
                <dl>
                  <Fact label="Decision">{DECISION_LABEL[a.original.action] ?? humanize(a.original.action)}</Fact>
                  <Fact label="Rule">{a.original.policyTitle}</Fact>
                  <Fact label="Made by">{a.original.by ? a.original.by.name : 'The system (automatic)'}</Fact>
                  <Fact label="When">{formatDateTime(a.original.at)}</Fact>
                  {a.original.reversed && <Fact label="Since">Taken back</Fact>}
                  {a.original.report && <Fact label="Reported as">{CATEGORY_LABEL[a.original.report.category]}</Fact>}
                </dl>
                {a.original.notes && (
                  <p className="bg-soft mt-2 rounded-xl px-3 py-2.5 text-[13px] whitespace-pre-wrap">
                    <strong>Staff note:</strong> {a.original.notes}
                  </p>
                )}
              </section>
            )}

            {a.target && (
              <section className="mt-6">
                <h3 className="mb-2 text-[14px] font-extrabold">What it was about</h3>
                <div className="bg-soft rounded-xl px-3 py-2.5">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Tag tone="brand">{TARGET_LABEL[a.target.type]}</Tag>
                    {a.target.state && <Tag tone={statusTone(a.target.state)}>{humanize(a.target.state)}</Tag>}
                  </div>
                  {a.target.available && a.target.excerpt ? (
                    <p className="whitespace-pre-wrap">{a.target.excerpt}</p>
                  ) : (
                    <p className="text-muted text-[13px]">{a.target.available ? 'No text.' : 'No longer there.'}</p>
                  )}
                </div>
              </section>
            )}

            {a.decidedAt && (
              <section className="mt-6">
                <h3 className="mb-2 text-[14px] font-extrabold">Outcome</h3>
                <p className="mb-1 text-[13px]">
                  {STATUS[a.status].label}
                  {a.decidedBy ? ` · ${a.decidedBy.name}` : ' · by reversing the decision directly'} ·{' '}
                  {formatAgo(a.decidedAt)}
                </p>
                {a.decisionNote && (
                  <p className="bg-soft rounded-xl px-3 py-2.5 whitespace-pre-wrap">{a.decisionNote}</p>
                )}
                <p className="text-muted mt-1 text-xs">This note is shown to the person.</p>
              </section>
            )}
          </div>
        )}
      </Dialog>
      {deciding && a && (
        <DecideDialog
          appeal={a}
          onClose={() => setDeciding(false)}
          onDecided={() => {
            toast.success('Decision recorded');
            void mutate();
            onChanged();
          }}
        />
      )}
    </>
  );
}

export function AppealsPage() {
  const { can } = useSession();
  const [view, setView] = useState<View>('waiting');
  const [openId, setOpenId] = useState<string | null>(null);
  const preset = VIEWS.find((v) => v.id === view)?.params ?? {};
  const list = useCursorList<AppealCard>(can('appeals.read') ? 'appeals' : null, preset);

  if (!can('appeals.read')) return <NoAccess what="appeals" />;

  return (
    <>
      <PageHeader
        title="Appeals"
        description="People asking for a decision to be looked at again. Someone who was not involved in the decision reviews it: you cannot take an appeal about a decision you made."
      />
      <div role="tablist" aria-label="Appeal view" className="mb-3 flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            id={`appeal-tab-${v.id}`}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            aria-controls="appeals-panel"
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
      <Card className="p-0">
        <div id="appeals-panel" role="tabpanel" aria-labelledby={`appeal-tab-${view}`}>
          {list.loading ? (
            <Loading />
          ) : list.error ? (
            <ErrorState error={list.error} retry={() => void list.reload()} />
          ) : list.items.length === 0 ? (
            <EmptyState
              title={view === 'decided' ? 'No appeals have been decided yet' : 'No appeals are waiting'}
              hint="People can appeal a decision about their own content or account within the appeal window."
            />
          ) : (
            <Table>
              <caption className="sr-only">Appeals, {view === 'decided' ? 'newest first' : 'oldest first'}</caption>
              <thead>
                <tr>
                  <Th>Person</Th>
                  <Th>Decision appealed</Th>
                  <Th className="hidden sm:table-cell">Status</Th>
                  <Th className="hidden md:table-cell">Sent</Th>
                  <Th className="hidden lg:table-cell">Reviewer</Th>
                  <Th>
                    <span className="sr-only">Open</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      <div className="font-bold">@{a.user.username}</div>
                      <div className="text-muted text-xs">{a.kind === 'ACCOUNT' ? 'Account' : 'Content'}</div>
                    </Td>
                    <Td>
                      {a.decision ? (
                        <>
                          <div className="font-bold">
                            {DECISION_LABEL[a.decision.action] ?? humanize(a.decision.action)}
                          </div>
                          <div className="text-muted text-xs">{a.decision.policyTitle}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="hidden sm:table-cell">
                      <Tag tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Tag>
                      {a.overdue && (
                        <Tag tone="bad" className="ml-1">
                          Overdue
                        </Tag>
                      )}
                    </Td>
                    <Td className="text-muted hidden md:table-cell">{formatAgo(a.createdAt)}</Td>
                    <Td className="text-muted hidden lg:table-cell">
                      {a.assignedTo?.name ?? a.decidedBy?.name ?? '—'}
                    </Td>
                    <Td>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpenId(a.id)}
                        aria-label={`Open appeal from ${a.user.username}`}
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
      <AppealDrawer appealId={openId} onClose={() => setOpenId(null)} onChanged={() => void list.reload()} />
    </>
  );
}
