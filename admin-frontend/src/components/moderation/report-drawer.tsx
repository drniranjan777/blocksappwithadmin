'use client';

import { useState, type ReactNode } from 'react';
import { api } from '@/lib/client/api';
import { formatAgo, formatDateTime, humanize } from '@/lib/client/format';
import {
  CATEGORY_LABEL,
  DECISION_LABEL,
  SEVERITY_TONE,
  STATUS_LABEL,
  TARGET_LABEL,
  reportStatusTone,
} from '@/lib/moderation';
import { useSession } from '@/lib/client/session';
import { useApi } from '@/lib/client/use-api';
import type { DecisionRecord, ReportDetail } from '@/lib/types';
import { ReasonDialog } from '../forms/reason-dialog';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { ErrorState, Loading, describeError } from '../ui/states';
import { Tag, statusTone } from '../ui/tag';
import { useToast } from '../ui/toast';
import { DecisionDialog } from './decision-dialog';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-line flex items-start justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-muted text-[12.5px]">{label}</dt>
      <dd className="text-right font-semibold break-words">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-[14px] font-extrabold">{title}</h3>
      {children}
    </section>
  );
}

export function DecisionHistory({ items }: { items: DecisionRecord[] }) {
  if (items.length === 0) return <p className="text-muted text-[13px]">Nothing has been decided about this yet.</p>;
  return (
    <ol className="space-y-2">
      {items.map((h) => (
        <li key={h.id} className="bg-soft rounded-xl px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold">{DECISION_LABEL[h.action] ?? humanize(h.action)}</span>
            <span className="text-muted text-xs">{TARGET_LABEL[h.targetType]}</span>
            {h.source === 'AUTOMATED' && <Tag tone="warn">Automatic</Tag>}
            {h.reversed && <Tag tone="neutral">Taken back</Tag>}
            {h.appeal && <Tag tone="brand">Appeal: {humanize(h.appeal.status)}</Tag>}
          </div>
          <p className="text-muted mt-0.5 text-xs">
            {h.policyTitle} · {h.by ? h.by.name : 'the system'} · {formatAgo(h.createdAt)}
          </p>
          {h.notes && <p className="mt-1 text-[13px] whitespace-pre-wrap">{h.notes}</p>}
        </li>
      ))}
    </ol>
  );
}

/** Why there is nothing to press, so a missing button is never a mystery. */
function whyNothing(r: ReportDetail, me: string | undefined): string | null {
  if (r.status === 'RESOLVED' || r.status === 'DISMISSED') return 'This report is closed.';
  if (r.allowed.actions.length > 0 || r.allowed.claim || r.allowed.release) return null;
  if (r.assignedTo && r.assignedTo.id !== me) return `${r.assignedTo.name} is looking at this report.`;
  if (r.status === 'ESCALATED') return 'Escalated reports are decided by a senior moderator.';
  return 'Your role can read reports but not decide them.';
}

export function ReportDrawer({
  reportId,
  onClose,
  onChanged,
}: {
  reportId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { session } = useSession();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<ReportDetail>(reportId ? `moderation/reports/${reportId}` : null);
  const [dialog, setDialog] = useState<'escalate' | 'decide' | null>(null);
  const [busy, setBusy] = useState<'claim' | 'release' | null>(null);
  const r = data?.data;

  const post = async (kind: 'claim' | 'release') => {
    if (!reportId) return;
    setBusy(kind);
    try {
      const res = await api.post<ReportDetail>(`moderation/reports/${reportId}/${kind}`);
      await mutate(res, { revalidate: false });
      toast.success(kind === 'claim' ? 'You are looking at this report' : 'Put back in the queue');
      onChanged();
    } catch (e) {
      toast.error(describeError(e));
      await mutate();
    } finally {
      setBusy(null);
    }
  };

  const note = r ? whyNothing(r, session?.admin.id) : null;
  return (
    <>
      <Dialog
        open={reportId !== null}
        onClose={onClose}
        title={r ? `${CATEGORY_LABEL[r.category]} report` : 'Report'}
        description={r ? `${TARGET_LABEL[r.targetType]} · ${STATUS_LABEL[r.status]}` : undefined}
        variant="drawer"
      >
        {isLoading ? (
          <Loading rows={6} />
        ) : error || !r ? (
          <ErrorState error={error} retry={() => void mutate()} />
        ) : (
          <div>
            <div className="flex flex-wrap gap-1.5">
              <Tag tone={SEVERITY_TONE[r.severity]}>{humanize(r.severity)}</Tag>
              <Tag tone={reportStatusTone(r.status)}>{STATUS_LABEL[r.status]}</Tag>
              {r.overdue && <Tag tone="bad">Overdue</Tag>}
              {r.source !== 'USER' && <Tag tone="brand">{r.source === 'ADMIN' ? 'Flagged by staff' : 'Automatic'}</Tag>}
              {r.reportsOnTarget > 1 && <Tag tone="warn">{r.reportsOnTarget} reports on this</Tag>}
            </div>

            {r.assignedTo && (
              <p className="text-muted mt-2 text-[13px]">
                Held by <strong>{r.assignedTo.name}</strong>
              </p>
            )}

            {(r.allowed.claim || r.allowed.release || r.allowed.escalate || r.allowed.actions.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {r.allowed.claim && (
                  <Button loading={busy === 'claim'} onClick={() => void post('claim')}>
                    Take this report
                  </Button>
                )}
                {r.allowed.actions.length > 0 && (
                  <Button variant="primary" onClick={() => setDialog('decide')}>
                    Decide…
                  </Button>
                )}
                {r.allowed.escalate && (
                  <Button variant="ghost" onClick={() => setDialog('escalate')}>
                    Escalate
                  </Button>
                )}
                {r.allowed.release && (
                  <Button variant="ghost" loading={busy === 'release'} onClick={() => void post('release')}>
                    Put back
                  </Button>
                )}
              </div>
            )}
            {note && <p className="bg-soft mt-4 rounded-xl px-3 py-2.5 text-[13px] font-semibold">{note}</p>}

            <Section title="What was reported">
              {r.target.available ? (
                <div className="bg-soft rounded-xl px-3 py-2.5">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Tag tone="brand">{TARGET_LABEL[r.target.type]}</Tag>
                    {r.target.state && <Tag tone={statusTone(r.target.state)}>{humanize(r.target.state)}</Tag>}
                    {r.target.owner && <span className="text-muted text-xs">by @{r.target.owner.username}</span>}
                  </div>
                  {r.target.excerpt ? (
                    <p className="whitespace-pre-wrap">{r.target.excerpt}</p>
                  ) : (
                    <p className="text-muted text-[13px]">No text. Check any pictures in media review.</p>
                  )}
                </div>
              ) : (
                <p className="bg-warn-bg text-warn rounded-xl px-3 py-2.5 text-[13px] font-semibold">
                  This is no longer there (deleted by its author). What it said when it was reported:
                  {r.evidence.snapshot?.excerpt ? ` “${r.evidence.snapshot.excerpt}”` : ' nothing was kept.'}
                </p>
              )}
              {r.evidence.snapshot?.excerpt &&
                r.target.available &&
                r.evidence.snapshot.excerpt !== r.target.excerpt && (
                  <p className="text-muted mt-2 text-xs">
                    It has been edited since it was reported. When reported it said: “{r.evidence.snapshot.excerpt}”
                  </p>
                )}
            </Section>

            <Section title="The report">
              <dl>
                <Fact label="Reason">{CATEGORY_LABEL[r.category]}</Fact>
                <Fact label="Reported by">
                  {r.reporter ? `@${r.reporter.username}` : r.source === 'ADMIN' ? 'Staff' : 'Automatic check'}
                </Fact>
                <Fact label="Reported">{formatDateTime(r.createdAt)}</Fact>
                <Fact label="Answer due">{r.slaDueAt ? formatDateTime(r.slaDueAt) : '—'}</Fact>
                {r.resolvedAt && <Fact label="Closed">{formatDateTime(r.resolvedAt)}</Fact>}
              </dl>
              {r.description && (
                <p className="bg-soft mt-2 rounded-xl px-3 py-2.5 whitespace-pre-wrap">{r.description}</p>
              )}
              {r.resolution && (
                <p className="text-muted mt-2 text-[13px]">
                  <strong>Outcome:</strong> {r.resolution}
                </p>
              )}
              {r.evidence.refs.length > 0 && (
                <p className="text-muted mt-2 text-xs">
                  {r.evidence.refs.length} other item(s) were pointed out as evidence.
                </p>
              )}
              <p className="text-muted mt-2 text-xs">
                The person reported is never told who reported them, and does not see this note.
              </p>
            </Section>

            {r.otherReports.length > 0 && (
              <Section title={`Other reports about this (${r.otherReports.length})`}>
                <ul className="space-y-1.5">
                  {r.otherReports.map((o) => (
                    <li key={o.id} className="bg-soft rounded-xl px-3 py-2 text-[13px]">
                      <span className="font-bold">{CATEGORY_LABEL[o.category]}</span>{' '}
                      <span className="text-muted">
                        · {o.reporter ? `@${o.reporter.username}` : humanize(o.source)} · {formatAgo(o.createdAt)} ·{' '}
                        {STATUS_LABEL[o.status]}
                      </span>
                      {o.description && <p className="mt-0.5 whitespace-pre-wrap">{o.description}</p>}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {r.standing && (
              <Section title={`Standing of @${r.standing.user.username}`}>
                <dl>
                  <Fact label="Account">
                    <Tag tone={statusTone(r.standing.user.status)}>{humanize(r.standing.user.status)}</Tag>
                  </Fact>
                  <Fact label="Reports against them">{r.standing.reportsAgainst}</Fact>
                  <Fact label="Last 90 days">
                    {r.standing.last90Days.warnings} warning(s), {r.standing.last90Days.restricted} hidden,{' '}
                    {r.standing.last90Days.removed} removed
                    {r.standing.last90Days.accountRestrictions + r.standing.last90Days.suspensions > 0
                      ? `, ${r.standing.last90Days.accountRestrictions} restriction(s), ${r.standing.last90Days.suspensions} suspension(s)`
                      : ''}
                  </Fact>
                  <Fact label="Member since">{formatDateTime(r.standing.memberSince)}</Fact>
                </dl>
              </Section>
            )}

            <Section title="What has been decided">
              <DecisionHistory items={r.history} />
            </Section>
          </div>
        )}
      </Dialog>

      {dialog === 'escalate' && r && (
        <ReasonDialog
          open
          onClose={() => setDialog(null)}
          title="Escalate to a senior moderator"
          description="Only seniors can decide it from here. It moves up the queue."
          confirmLabel="Escalate"
          reasonLabel="Why does it need a senior?"
          reasonHint="Seniors read this first. Recorded in the audit log."
          onConfirm={async (reason) => {
            const res = await api.post<ReportDetail>(`moderation/reports/${r.id}/escalate`, { reason });
            await mutate(res, { revalidate: false });
            toast.success('Escalated');
            onChanged();
          }}
        />
      )}
      {dialog === 'decide' && r && (
        <DecisionDialog
          report={r}
          onClose={() => setDialog(null)}
          onDecided={(res) => {
            void mutate(res, { revalidate: false });
            toast.success('Decision recorded');
            onChanged();
          }}
        />
      )}
    </>
  );
}
