'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatAgo, formatDateTime, humanize } from '@/lib/client/format';
import { SEVERITIES, SEVERITY_TONE } from '@/lib/moderation';
import { useSession } from '@/lib/client/session';
import { useApi, useCursorList } from '@/lib/client/use-api';
import type { IncidentCard, IncidentDetail, IncidentStatus, IncidentType, Severity } from '@/lib/types';
import { ReasonDialog } from '../forms/reason-dialog';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Field, Input, Select, Textarea } from '../ui/field';
import { EmptyState, ErrorState, Loading, LoadMore, describeError } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag, type Tone } from '../ui/tag';
import { useToast } from '../ui/toast';

const TYPES: Record<IncidentType, string> = {
  SELF_HARM: 'Self-harm risk',
  VIOLENCE: 'Violence',
  SCAM: 'Scam',
  CHILD_SAFETY: 'Child safety',
  HARASSMENT: 'Harassment',
  OTHER: 'Other',
};

const STATUS: Record<IncidentStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Open', tone: 'brand' },
  ESCALATED: { label: 'Escalated', tone: 'bad' },
  RESOLVED: { label: 'Resolved', tone: 'good' },
};

const EVENT_LABEL: Record<IncidentDetail['events'][number]['kind'], string> = {
  OPENED: 'Opened',
  NOTE: 'Note',
  ASSIGNED: 'Handed over',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  REOPENED: 'Reopened',
};

type View = 'open' | 'escalated' | 'mine' | 'resolved';
const VIEWS: Array<{ id: View; label: string; params: Record<string, string> }> = [
  { id: 'open', label: 'Open', params: { status: 'OPEN' } },
  { id: 'escalated', label: 'Escalated', params: { status: 'ESCALATED' } },
  { id: 'mine', label: 'Mine', params: { owner: 'me' } },
  { id: 'resolved', label: 'Resolved', params: { status: 'RESOLVED' } },
];

const newSchema = z.object({
  type: z.enum(['SELF_HARM', 'VIOLENCE', 'SCAM', 'CHILD_SAFETY', 'HARASSMENT', 'OTHER']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  summary: z.string().trim().min(10, 'Write at least 10 characters.').max(1000, 'Keep it under 1,000 characters.'),
  userId: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
      'That is not an account id.',
    ),
});
type NewValues = z.infer<typeof newSchema>;

function NewIncident({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewValues>({
    resolver: zodResolver(newSchema),
    defaultValues: { type: 'SELF_HARM', severity: 'HIGH', summary: '', userId: '' },
  });
  const [failure, setFailure] = useState<string | null>(null);
  const submit = handleSubmit(async (v) => {
    setFailure(null);
    try {
      await api.post('safety/incidents', {
        type: v.type,
        severity: v.severity,
        summary: v.summary,
        ...(v.userId ? { userId: v.userId } : {}),
      });
      onCreated();
      onClose();
    } catch (e) {
      setFailure(describeError(e));
    }
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Open a safety incident"
      description="For when somebody may be in danger. Reports about self-harm and child safety open one automatically."
      busy={isSubmitting}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="What kind" error={errors.type?.message}>
            {(p) => (
              <Select {...p} {...register('type')}>
                {Object.entries(TYPES).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Severity" error={errors.severity?.message}>
            {(p) => (
              <Select {...p} {...register('severity')}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field
          label="What happened"
          hint="Facts only. Leave out names, phone numbers and anything not needed to respond."
          error={errors.summary?.message}
        >
          {(p) => <Textarea {...p} {...register('summary')} rows={4} maxLength={1000} />}
        </Field>
        <Field label="Account id (optional)" hint="The account at risk or responsible." error={errors.userId?.message}>
          {(p) => <Input {...p} {...register('userId')} autoComplete="off" />}
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
            Open incident
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const escalateSchema = z.object({
  escalatedTo: z.string().trim().min(3, 'Say who was told.').max(160, 'Keep it under 160 characters.'),
  note: z.string().trim().max(800, 'Keep it under 800 characters.').optional(),
});
type EscalateValues = z.infer<typeof escalateSchema>;

function EscalateDialog({
  incidentId,
  onClose,
  onDone,
}: {
  incidentId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EscalateValues>({ resolver: zodResolver(escalateSchema), defaultValues: { escalatedTo: '', note: '' } });
  const [failure, setFailure] = useState<string | null>(null);
  const submit = handleSubmit(async (v) => {
    setFailure(null);
    try {
      await api.post(`safety/incidents/${incidentId}/escalate`, {
        escalatedTo: v.escalatedTo,
        ...(v.note ? { note: v.note } : {}),
      });
      onDone();
      onClose();
    } catch (e) {
      setFailure(describeError(e));
    }
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Record an escalation"
      description="BLOCKS does not contact anyone for you. Record who you told outside the platform, and how."
      busy={isSubmitting}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          label="Who was told"
          hint="For example a helpline or authority, with how you reached them and any reference."
          error={errors.escalatedTo?.message}
        >
          {(p) => <Input {...p} {...register('escalatedTo')} autoComplete="off" />}
        </Field>
        <Field label="Note" error={errors.note?.message}>
          {(p) => <Textarea {...p} {...register('note')} rows={3} maxLength={800} />}
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
          <Button type="submit" variant="bad" loading={isSubmitting}>
            Record escalation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const noteSchema = z.object({
  note: z.string().trim().min(3, 'Write a few words.').max(1000, 'Keep it under 1,000 characters.'),
});

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-line flex items-start justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-muted text-[12.5px]">{label}</dt>
      <dd className="text-right font-semibold break-words">{children}</dd>
    </div>
  );
}

function IncidentDrawer({
  incidentId,
  onClose,
  onChanged,
}: {
  incidentId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can, session } = useSession();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<IncidentDetail>(
    incidentId ? `safety/incidents/${incidentId}` : null,
  );
  const [dialog, setDialog] = useState<'escalate' | 'resolve' | 'reopen' | null>(null);
  const [busy, setBusy] = useState(false);
  const i = data?.data;
  const write = can('safety.incidents.write');
  const senior = can('reports.escalate');
  const me = session?.admin.id;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof noteSchema>>({ resolver: zodResolver(noteSchema) });

  const act = async (path: string, body: object, done: string) => {
    if (!incidentId) return;
    const res = await api.post<IncidentDetail>(`safety/incidents/${incidentId}/${path}`, body);
    await mutate(res, { revalidate: false });
    toast.success(done);
    onChanged();
  };

  const addNote = handleSubmit(async ({ note }) => {
    try {
      await act('notes', { note }, 'Added to the log');
      reset();
    } catch (e) {
      toast.error(describeError(e));
    }
  });

  const take = async () => {
    setBusy(true);
    try {
      await act('assign', {}, 'You are looking after this incident');
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        open={incidentId !== null}
        onClose={onClose}
        title={i ? TYPES[i.type] : 'Incident'}
        description={i ? `Opened ${formatAgo(i.createdAt)}` : undefined}
        variant="drawer"
      >
        {isLoading ? (
          <Loading rows={6} />
        ) : error || !i ? (
          <ErrorState error={error} retry={() => void mutate()} />
        ) : (
          <div>
            <div className="flex flex-wrap gap-1.5">
              <Tag tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Tag>
              <Tag tone={SEVERITY_TONE[i.severity]}>{humanize(i.severity)}</Tag>
            </div>
            <p className="bg-soft mt-3 rounded-xl px-3 py-2.5 whitespace-pre-wrap">{i.summary}</p>

            <dl className="mt-3">
              <Fact label="Looked after by">{i.owner ? i.owner.name : 'Nobody yet'}</Fact>
              {i.user && <Fact label="Account">@{i.user.username}</Fact>}
              {i.escalatedTo && <Fact label="Told outside BLOCKS">{i.escalatedTo}</Fact>}
              {i.actionTaken && <Fact label="What was done">{i.actionTaken}</Fact>}
              {i.resolvedAt && <Fact label="Resolved">{formatDateTime(i.resolvedAt)}</Fact>}
            </dl>

            {write && (
              <div className="mt-4 flex flex-wrap gap-2">
                {i.status !== 'RESOLVED' && i.owner?.id !== me && (
                  <Button loading={busy} variant="ghost" onClick={() => void take()}>
                    Take this incident
                  </Button>
                )}
                {i.status === 'OPEN' && senior && (
                  <Button variant="bad" onClick={() => setDialog('escalate')}>
                    Record escalation
                  </Button>
                )}
                {i.status !== 'RESOLVED' && (
                  <Button variant="good" onClick={() => setDialog('resolve')}>
                    Resolve
                  </Button>
                )}
                {i.status === 'RESOLVED' && senior && (
                  <Button variant="ghost" onClick={() => setDialog('reopen')}>
                    Reopen
                  </Button>
                )}
              </div>
            )}

            <section className="mt-6" aria-labelledby="log-title">
              <h3 id="log-title" className="mb-2 text-[14px] font-extrabold">
                Log
              </h3>
              <ol className="space-y-2">
                {i.events.map((e) => (
                  <li key={e.id} className="bg-soft rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{EVENT_LABEL[e.kind]}</span>
                      <span className="text-muted text-xs" title={formatDateTime(e.at)}>
                        {e.by ? e.by.name : 'The system'} · {formatAgo(e.at)}
                      </span>
                    </div>
                    {e.note && <p className="mt-1 text-[13px] whitespace-pre-wrap">{e.note}</p>}
                  </li>
                ))}
              </ol>
              {write && i.status !== 'RESOLVED' && (
                <form onSubmit={addNote} noValidate className="mt-3 space-y-2">
                  <Field
                    label="Add to the log"
                    hint="Nothing in the log can be edited or removed."
                    error={errors.note?.message}
                  >
                    {(p) => <Textarea {...p} {...register('note')} rows={2} maxLength={1000} />}
                  </Field>
                  <Button type="submit" size="sm" variant="ghost" loading={isSubmitting}>
                    Add
                  </Button>
                </form>
              )}
            </section>
          </div>
        )}
      </Dialog>

      {dialog === 'escalate' && incidentId && (
        <EscalateDialog
          incidentId={incidentId}
          onClose={() => setDialog(null)}
          onDone={() => {
            toast.success('Escalation recorded');
            void mutate();
            onChanged();
          }}
        />
      )}
      {dialog === 'resolve' && (
        <ReasonDialog
          open
          onClose={() => setDialog(null)}
          title="Resolve this incident"
          description="Say what was done. It goes in the log and cannot be changed afterwards."
          confirmLabel="Resolve"
          tone="good"
          reasonLabel="What was done"
          onConfirm={(actionTaken) => act('resolve', { actionTaken }, 'Incident resolved')}
        />
      )}
      {dialog === 'reopen' && (
        <ReasonDialog
          open
          onClose={() => setDialog(null)}
          title="Reopen this incident"
          confirmLabel="Reopen"
          onConfirm={(reason) => act('reopen', { reason }, 'Incident reopened')}
        />
      )}
    </>
  );
}

export function IncidentsPage() {
  const { can } = useSession();
  const [view, setView] = useState<View>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const preset = VIEWS.find((v) => v.id === view)?.params ?? {};
  const list = useCursorList<IncidentCard>(can('safety.incidents.read') ? 'safety/incidents' : null, preset);

  if (!can('safety.incidents.read')) return <NoAccess what="safety incidents" />;

  return (
    <>
      <PageHeader
        title="Safety incidents"
        description="Cases where somebody may be in danger. Each has an owner and a log of everything that was done, in order, which nobody can edit. BLOCKS records the response; it does not contact helplines or authorities for you."
        actions={
          can('safety.incidents.write') ? (
            <Button onClick={() => setCreating(true)}>Open an incident</Button>
          ) : undefined
        }
      />
      <div role="tablist" aria-label="Incident view" className="mb-3 flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            id={`incident-tab-${v.id}`}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            aria-controls="incidents-panel"
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
        <div id="incidents-panel" role="tabpanel" aria-labelledby={`incident-tab-${view}`}>
          {list.loading ? (
            <Loading />
          ) : list.error ? (
            <ErrorState error={list.error} retry={() => void list.reload()} />
          ) : list.items.length === 0 ? (
            <EmptyState title="No incidents here" hint="Nothing matches this view." />
          ) : (
            <Table>
              <caption className="sr-only">Safety incidents, newest first</caption>
              <thead>
                <tr>
                  <Th>Incident</Th>
                  <Th className="hidden sm:table-cell">Status</Th>
                  <Th className="hidden md:table-cell">Looked after by</Th>
                  <Th className="hidden md:table-cell">Opened</Th>
                  <Th>
                    <span className="sr-only">Open</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((i) => (
                  <Tr key={i.id}>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold">{TYPES[i.type]}</span>
                        <Tag tone={SEVERITY_TONE[i.severity as Severity]}>{humanize(i.severity)}</Tag>
                      </div>
                      <div className="text-muted mt-0.5 max-w-sm truncate text-[12.5px]">{i.summary}</div>
                    </Td>
                    <Td className="hidden sm:table-cell">
                      <Tag tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Tag>
                    </Td>
                    <Td className="text-muted hidden md:table-cell">{i.owner?.name ?? 'Nobody yet'}</Td>
                    <Td className="text-muted hidden md:table-cell">{formatAgo(i.createdAt)}</Td>
                    <Td>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpenId(i.id)}
                        aria-label={`Open ${TYPES[i.type]} incident`}
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
      <IncidentDrawer incidentId={openId} onClose={() => setOpenId(null)} onChanged={() => void list.reload()} />
      {creating && <NewIncident onClose={() => setCreating(false)} onCreated={() => void list.reload()} />}
    </>
  );
}
