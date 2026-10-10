'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatAgo, formatDateTime, formatNumber, humanize } from '@/lib/client/format';
import { rulesFor } from '@/lib/moderation';
import { useSession } from '@/lib/client/session';
import { useApi, useCursorList } from '@/lib/client/use-api';
import type { IncidentType, LiveSessionCard, PolicyRule } from '@/lib/types';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Field, Select, Textarea } from '../ui/field';
import { EmptyState, ErrorState, Loading, LoadMore, describeError } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag, type Tone } from '../ui/tag';
import { useToast } from '../ui/toast';

const STATUS: Record<LiveSessionCard['status'], { label: string; tone: Tone }> = {
  SCHEDULED: { label: 'Scheduled', tone: 'neutral' },
  LIVE: { label: 'Live now', tone: 'bad' },
  ENDED: { label: 'Ended', tone: 'neutral' },
  TERMINATED: { label: 'Ended by staff', tone: 'warn' },
};

const INCIDENT_TYPES: Record<IncidentType, string> = {
  SELF_HARM: 'Self-harm risk',
  VIOLENCE: 'Violence',
  SCAM: 'Scam',
  CHILD_SAFETY: 'Child safety',
  HARASSMENT: 'Harassment',
  OTHER: 'Other',
};

const schema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(10, 'Give a reason of at least 10 characters.')
      .max(300, 'Keep it under 300 characters.'),
    policyReason: z.string().min(1, 'Choose the rule.'),
    openIncident: z.boolean(),
    incidentType: z.enum(['SELF_HARM', 'VIOLENCE', 'SCAM', 'CHILD_SAFETY', 'HARASSMENT', 'OTHER']),
    incidentSummary: z.string().trim().max(1000, 'Keep it under 1,000 characters.'),
  })
  .refine((v) => !v.openIncident || v.incidentSummary.length >= 10, {
    path: ['incidentSummary'],
    message: 'Write at least 10 characters.',
  });
type Values = z.infer<typeof schema>;

function TerminateDialog({
  session,
  onClose,
  onDone,
}: {
  session: LiveSessionCard;
  onClose: () => void;
  onDone: (providerConfirmed: boolean) => void;
}) {
  const { data: rulesData } = useApi<{ rules: PolicyRule[] }>('moderation/rules');
  const rules = rulesFor('REMOVE', rulesData?.data.rules ?? []);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '', policyReason: '', openIncident: false, incidentType: 'VIOLENCE', incidentSummary: '' },
  });
  const [failure, setFailure] = useState<string | null>(null);
  const openIncident = useWatch({ control, name: 'openIncident' });

  const submit = handleSubmit(async (v) => {
    setFailure(null);
    try {
      const res = await api.post<{ providerConfirmed: boolean }>(`live/sessions/${session.id}/terminate`, {
        reason: v.reason,
        policyReason: v.policyReason,
        ...(v.openIncident ? { incident: { type: v.incidentType, summary: v.incidentSummary } } : {}),
      });
      onDone(res.data.providerConfirmed);
      onClose();
    } catch (e) {
      setFailure(describeError(e));
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="End this live session now"
      description={`“${session.title}” by @${session.host.username}. This cuts it immediately and cannot be undone; the host is told and can appeal.`}
      busy={isSubmitting}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          label="Why is it being ended?"
          hint="Recorded in the audit log and with the decision."
          error={errors.reason?.message}
        >
          {(p) => <Textarea {...p} {...register('reason')} rows={3} maxLength={300} />}
        </Field>
        <Field
          label="Rule"
          hint="The published rule it broke. The host is told which."
          error={errors.policyReason?.message}
        >
          {(p) => (
            <Select {...p} {...register('policyReason')}>
              <option value="">Choose a rule…</option>
              {rules.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" {...register('openIncident')} className="mt-1" />
          <span>
            <span className="block font-bold">Also open a safety incident</span>
            <span className="text-muted block text-xs">Use this when somebody may be in danger.</span>
          </span>
        </label>
        {openIncident && (
          <div className="space-y-3">
            <Field label="Kind of incident">
              {(p) => (
                <Select {...p} {...register('incidentType')}>
                  {Object.entries(INCIDENT_TYPES).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="What happened" hint="Facts only." error={errors.incidentSummary?.message}>
              {(p) => <Textarea {...p} {...register('incidentSummary')} rows={3} maxLength={1000} />}
            </Field>
          </div>
        )}
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
            End session now
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type View = 'active' | 'past';

export function LivePage() {
  const { can } = useSession();
  const toast = useToast();
  const [view, setView] = useState<View>('active');
  const [ending, setEnding] = useState<LiveSessionCard | null>(null);
  const list = useCursorList<LiveSessionCard>(can('live.read') ? 'live/sessions' : null, { scope: view });

  if (!can('live.read')) return <NoAccess what="live sessions" />;

  return (
    <>
      <PageHeader
        title="Live monitoring"
        description="Sessions that are live or about to be, with their risk signals, reports and incidents, and a way to end one at once."
      />
      <p role="note" className="bg-warn-bg text-warn mb-4 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold">
        BLOCKS does not stream live video yet. Sessions will appear here once a live service is connected; until then
        this list is empty, and ending a session only records the decision. Live streaming needs its own safety and
        legal review before it is switched on.
      </p>
      <div role="tablist" aria-label="Session view" className="mb-3 flex flex-wrap gap-1.5">
        {(['active', 'past'] as const).map((v) => (
          <button
            key={v}
            id={`live-tab-${v}`}
            type="button"
            role="tab"
            aria-selected={view === v}
            aria-controls="live-panel"
            onClick={() => setView(v)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[13px] font-bold',
              view === v ? 'bg-brand text-white' : 'text-ink border-line hover:bg-soft border bg-white',
            )}
          >
            {v === 'active' ? 'Live and scheduled' : 'Past'}
          </button>
        ))}
      </div>
      <Card className="p-0">
        <div id="live-panel" role="tabpanel" aria-labelledby={`live-tab-${view}`}>
          {list.loading ? (
            <Loading />
          ) : list.error ? (
            <ErrorState error={list.error} retry={() => void list.reload()} />
          ) : list.items.length === 0 ? (
            <EmptyState
              title={view === 'active' ? 'Nothing is live' : 'No past sessions'}
              hint="There is no live service connected, so there are no sessions to show."
            />
          ) : (
            <Table>
              <caption className="sr-only">Live sessions, newest first</caption>
              <thead>
                <tr>
                  <Th>Session</Th>
                  <Th className="hidden sm:table-cell">Status</Th>
                  <Th className="hidden md:table-cell">Viewers</Th>
                  <Th>Signals</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((s) => (
                  <Tr key={s.id}>
                    <Td>
                      <div className="font-bold">{s.title}</div>
                      <div className="text-muted text-xs">
                        @{s.host.username} ·{' '}
                        {s.startedAt ? `started ${formatAgo(s.startedAt)}` : `created ${formatAgo(s.createdAt)}`}
                      </div>
                      {s.terminationReason && (
                        <div className="text-muted mt-0.5 text-xs">
                          Ended by {s.terminatedBy?.name ?? 'staff'}: {s.terminationReason}
                        </div>
                      )}
                    </Td>
                    <Td className="hidden sm:table-cell">
                      <Tag tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Tag>
                    </Td>
                    <Td className="hidden md:table-cell">{formatNumber(s.peakViewers)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {s.openReports > 0 && <Tag tone="bad">{s.openReports} report(s)</Tag>}
                        {s.openIncidents > 0 && <Tag tone="bad">{s.openIncidents} incident(s)</Tag>}
                        {(s.riskFlags?.signals ?? []).map((sig) => (
                          <Tag key={sig} tone="warn">
                            {humanize(sig)}
                          </Tag>
                        ))}
                        {s.openReports === 0 && s.openIncidents === 0 && !s.riskFlags?.signals?.length && (
                          <span className="text-muted text-xs">None</span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      {can('live.terminate') && (s.status === 'LIVE' || s.status === 'SCHEDULED') && (
                        <Button variant="bad" size="sm" onClick={() => setEnding(s)} aria-label={`End ${s.title}`}>
                          End now
                        </Button>
                      )}
                      {s.endedAt && <span className="text-muted text-xs">{formatDateTime(s.endedAt)}</span>}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={() => void list.loadMore()} />
        </div>
      </Card>
      {ending && (
        <TerminateDialog
          session={ending}
          onClose={() => setEnding(null)}
          onDone={(confirmed) => {
            if (confirmed) toast.success('Session ended');
            else
              toast.error(
                'Recorded as ended here, but the live service did not confirm it stopped. Cut the stream at the source too.',
              );
            void list.reload();
          }}
        />
      )}
    </>
  );
}
