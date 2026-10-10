'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatAgo, formatDateTime, humanize } from '@/lib/client/format';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  DECISION_LABEL,
  REVERSIBLE,
  SEVERITIES,
  SEVERITY_TONE,
  STATUS_LABEL,
  TARGET_LABEL,
  reportStatusTone,
} from '@/lib/moderation';
import { useSession } from '@/lib/client/session';
import { useApi, useCursorList } from '@/lib/client/use-api';
import type { DecisionRecord, ModerationSummary, ReportCard } from '@/lib/types';
import { ReasonDialog } from '../forms/reason-dialog';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader, StatCard } from '../ui/card';
import { Select } from '../ui/field';
import { EmptyState, ErrorState, Loading, LoadMore } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag } from '../ui/tag';
import { useToast } from '../ui/toast';
import { ReportDrawer } from './report-drawer';

type View = 'waiting' | 'mine' | 'unassigned' | 'overdue' | 'escalated' | 'closed' | 'decisions';

const VIEWS: Array<{ id: View; label: string; params: Record<string, string | boolean> }> = [
  { id: 'waiting', label: 'Waiting', params: {} },
  { id: 'mine', label: 'Mine', params: { assignee: 'me' } },
  { id: 'unassigned', label: 'Unassigned', params: { assignee: 'unassigned' } },
  { id: 'overdue', label: 'Overdue', params: { overdue: true } },
  { id: 'escalated', label: 'Escalated', params: { status: 'ESCALATED' } },
  { id: 'closed', label: 'Closed', params: { scope: 'closed' } },
  { id: 'decisions', label: 'Decisions', params: {} },
];

const KINDS = ['POST', 'REEL', 'STORY', 'COMMENT', 'USER', 'LIVE'] as const;

function Summary() {
  const { data } = useApi<ModerationSummary>('moderation/summary');
  const s = data?.data.reports;
  if (!s) return null;
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
      <StatCard label="Waiting" value={s.active} hint={`${s.resolvedLast24h} closed in the last day`} />
      <StatCard
        label="Critical"
        value={s.bySeverity.CRITICAL}
        tone={s.bySeverity.CRITICAL > 0 ? 'bad' : 'neutral'}
        hint={`${s.bySeverity.HIGH} high`}
      />
      <StatCard label="Overdue" value={s.overdue} tone={s.overdue > 0 ? 'bad' : 'good'} hint="Past their answer time" />
      <StatCard label="Unassigned" value={s.unassigned} />
      <StatCard label="Yours" value={s.mine} />
    </div>
  );
}

function Queue({
  view,
  kind,
  category,
  severity,
}: {
  view: Exclude<View, 'decisions'>;
  kind: string;
  category: string;
  severity: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const preset = VIEWS.find((v) => v.id === view)?.params ?? {};
  const list = useCursorList<ReportCard>('moderation/reports', { ...preset, targetType: kind, category, severity });

  if (list.loading) return <Loading />;
  if (list.error) return <ErrorState error={list.error} retry={() => void list.reload()} />;
  return (
    <>
      {list.items.length === 0 ? (
        <EmptyState
          title={view === 'closed' ? 'Nothing has been decided yet' : 'Nothing here'}
          hint={
            view === 'waiting'
              ? 'No reports are waiting with these filters. New ones appear here as people report things.'
              : 'No reports match this view and these filters.'
          }
        />
      ) : (
        <Table>
          <caption className="sr-only">Reports, {view === 'closed' ? 'newest first' : 'most urgent first'}</caption>
          <thead>
            <tr>
              <Th>Urgency</Th>
              <Th>Report</Th>
              <Th className="hidden md:table-cell">Person</Th>
              <Th className="hidden sm:table-cell">Waiting</Th>
              <Th className="hidden lg:table-cell">Held by</Th>
              <Th>
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <Tag tone={SEVERITY_TONE[r.severity]}>{humanize(r.severity)}</Tag>
                    {r.overdue && <Tag tone="bad">Overdue</Tag>}
                  </div>
                </Td>
                <Td>
                  <div className="font-bold">{CATEGORY_LABEL[r.category]}</div>
                  <div className="text-muted text-xs">
                    {TARGET_LABEL[r.targetType]}
                    {r.reportsOnTarget > 1 ? ` · ${r.reportsOnTarget} reports` : ''}
                    {r.source !== 'USER' ? ` · ${r.source === 'ADMIN' ? 'flagged by staff' : 'automatic'}` : ''}
                  </div>
                  {r.excerpt && <div className="mt-0.5 max-w-xs truncate text-[12.5px]">{r.excerpt}</div>}
                  <div className="mt-1 sm:hidden">
                    <Tag tone={reportStatusTone(r.status)}>{STATUS_LABEL[r.status]}</Tag>
                  </div>
                </Td>
                <Td className="text-muted hidden md:table-cell">{r.targetUser ? `@${r.targetUser.username}` : '—'}</Td>
                <Td className="text-muted hidden sm:table-cell">
                  <div>
                    {view === 'closed' && r.resolvedAt ? `Closed ${formatAgo(r.resolvedAt)}` : formatAgo(r.createdAt)}
                  </div>
                  <Tag tone={reportStatusTone(r.status)}>{STATUS_LABEL[r.status]}</Tag>
                </Td>
                <Td className="text-muted hidden lg:table-cell">{r.assignedTo?.name ?? '—'}</Td>
                <Td>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenId(r.id)}
                    aria-label={`Open ${CATEGORY_LABEL[r.category]} report`}
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
      <ReportDrawer reportId={openId} onClose={() => setOpenId(null)} onChanged={() => void list.reload()} />
    </>
  );
}

function Decisions() {
  const { can } = useSession();
  const toast = useToast();
  const list = useCursorList<DecisionRecord>('moderation/actions');
  const [reversing, setReversing] = useState<DecisionRecord | null>(null);
  const mayReverse = can('content.restore', 'users.restore');

  if (list.loading) return <Loading />;
  if (list.error) return <ErrorState error={list.error} retry={() => void list.reload()} />;
  if (list.items.length === 0)
    return <EmptyState title="No decisions yet" hint="Every decision, by people and by the system, is listed here." />;
  return (
    <>
      <Table>
        <caption className="sr-only">Moderation decisions, newest first</caption>
        <thead>
          <tr>
            <Th>Decision</Th>
            <Th className="hidden sm:table-cell">Rule</Th>
            <Th className="hidden md:table-cell">By</Th>
            <Th>When</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {list.items.map((d) => (
            <Tr key={d.id}>
              <Td>
                <div className="font-bold">{DECISION_LABEL[d.action] ?? humanize(d.action)}</div>
                <div className="text-muted text-xs">
                  {TARGET_LABEL[d.targetType]}
                  {d.source === 'AUTOMATED' ? ' · automatic' : ''}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {d.reversed && <Tag>Taken back</Tag>}
                  {d.appeal && <Tag tone="brand">Appeal: {humanize(d.appeal.status)}</Tag>}
                </div>
              </Td>
              <Td className="text-muted hidden sm:table-cell">{d.policyTitle}</Td>
              <Td className="text-muted hidden md:table-cell">{d.by?.name ?? 'The system'}</Td>
              <Td className="text-muted" title={formatDateTime(d.createdAt)}>
                {formatAgo(d.createdAt)}
              </Td>
              <Td>
                {mayReverse && REVERSIBLE.has(d.action) && !d.reversed && (
                  <Button variant="ghost" size="sm" onClick={() => setReversing(d)}>
                    Take back
                  </Button>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={() => void list.loadMore()} />
      {reversing && (
        <ReasonDialog
          open
          onClose={() => setReversing(null)}
          title={`Take back: ${DECISION_LABEL[reversing.action] ?? humanize(reversing.action)}`}
          description="The item or account goes back to how it was before this decision. This is recorded as a new decision; the old one stays in the history. Only the latest decision on something can be taken back."
          confirmLabel="Take it back"
          tone="primary"
          reasonLabel="Why?"
          onConfirm={async (reason) => {
            await api.post(`moderation/actions/${reversing.id}/reverse`, { reason });
            toast.success('Decision taken back');
            await list.reload();
          }}
        />
      )}
    </>
  );
}

export function ModerationPage() {
  const { can } = useSession();
  const [view, setView] = useState<View>('waiting');
  const [kind, setKind] = useState('');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');

  if (!can('reports.read')) return <NoAccess what="the moderation queue" />;

  return (
    <>
      <PageHeader
        title="Moderation queue"
        description="Reports from people, flags from staff and automatic checks, most urgent first. Take a report, look at what was reported, and decide it under a published rule."
      />
      <Summary />

      <div role="tablist" aria-label="Queue view" className="mb-3 flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            id={`tab-${v.id}`}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            aria-controls="queue-panel"
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

      {view !== 'decisions' && (
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="mod-kind" className="sr-only">
              Kind of thing
            </label>
            <Select id="mod-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Any kind of thing</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {TARGET_LABEL[k]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="mod-category" className="sr-only">
              Reason
            </label>
            <Select id="mod-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Any reason</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="mod-severity" className="sr-only">
              Severity
            </label>
            <Select id="mod-severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="">Any severity</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      <Card className="p-0">
        <div id="queue-panel" role="tabpanel" aria-labelledby={`tab-${view}`}>
          {view === 'decisions' ? (
            <Decisions />
          ) : (
            <Queue key={view} view={view} kind={kind} category={category} severity={severity} />
          )}
        </div>
      </Card>

      <p className="text-muted mt-3 text-xs">
        Every decision names a published rule, is recorded with your name and is audited. A mistake is taken back by a
        new decision, never erased. The rule wording is a draft pending legal review.
      </p>
    </>
  );
}
