'use client';

import { Fragment, useState } from 'react';
import { formatDateTime } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useCursorList } from '@/lib/client/use-api';
import type { AuditEntry } from '@/lib/types';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Input, Select } from '../ui/field';
import { EmptyState, ErrorState, Loading, LoadMore } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag } from '../ui/tag';

const MODULES = [
  'admin',
  'role',
  'user',
  'settings',
  'media',
  'music',
  'reach',
  'earnings',
  'kyc',
  'bank',
  'payout',
  'ledger',
];

/** `2026-10-09T12:00` from a date picker -> the same instant as an ISO string, in the viewer's zone. */
function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="min-w-0 flex-1">
      <p className="text-muted mb-1 text-[11px] font-bold tracking-wider uppercase">{label}</p>
      <pre className="bg-soft max-h-48 overflow-auto rounded-lg p-2.5 font-mono text-[11.5px] break-words whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AuditPage() {
  const { can } = useSession();
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const actionOk = action === '' || /^[a-z][a-z0-9_.]{2,79}$/.test(action);
  const list = useCursorList<AuditEntry>(can('audit.read') ? 'audit-logs' : null, {
    module,
    action: actionOk ? action : '',
    from: toIso(from),
    to: toIso(to),
    sensitiveOnly,
  });

  if (!can('audit.read')) return <NoAccess what="the audit log" />;

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who did what, to what, when and why. It can only be added to: entries cannot be changed or removed, by anyone."
      />

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor="audit-module" className="mb-1 block text-xs font-bold">
            Area
          </label>
          <Select id="audit-module" value={module} onChange={(e) => setModule(e.target.value)}>
            <option value="">Everything</option>
            {MODULES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="audit-action" className="mb-1 block text-xs font-bold">
            Exact action
          </label>
          <Input
            id="audit-action"
            value={action}
            onChange={(e) => setAction(e.target.value.trim().toLowerCase())}
            placeholder="user.suspend"
            invalid={!actionOk}
            maxLength={80}
          />
        </div>
        <div>
          <label htmlFor="audit-from" className="mb-1 block text-xs font-bold">
            From
          </label>
          <Input id="audit-from" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="audit-to" className="mb-1 block text-xs font-bold">
            To
          </label>
          <Input id="audit-to" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {can('audit.sensitive.read') && (
          <label className="flex items-end gap-2 pb-2.5 text-[13px] font-semibold">
            <input
              type="checkbox"
              checked={sensitiveOnly}
              onChange={(e) => setSensitiveOnly(e.target.checked)}
              className="accent-brand size-4"
            />
            Only access to protected data
          </label>
        )}
      </div>

      <Card className="p-0">
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} retry={() => void list.reload()} />
        ) : list.items.length === 0 ? (
          <EmptyState title="Nothing recorded for these filters" />
        ) : (
          <Table>
            <caption className="sr-only">Audit trail, newest first</caption>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th className="hidden md:table-cell">On</Th>
                <Th className="hidden lg:table-cell">Reason</Th>
                <Th>
                  <span className="sr-only">Details</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((e) => {
                const expanded = open === e.id;
                const hasDetail = e.before != null || e.after != null || e.requestId || e.ip;
                return (
                  <Fragment key={e.id}>
                    <Tr>
                      <Td className="text-[12.5px] whitespace-nowrap">{formatDateTime(e.createdAt)}</Td>
                      <Td>
                        <div className="font-semibold">{e.actorLabel ?? e.actorType}</div>
                        {e.actorType !== 'ADMIN' && (
                          <div className="text-muted text-xs">{e.actorType.toLowerCase()}</div>
                        )}
                      </Td>
                      <Td>
                        <span className="font-mono text-xs font-bold">{e.action}</span>{' '}
                        {e.sensitive && <Tag tone="warn">protected data</Tag>}
                      </Td>
                      <Td className="text-muted hidden text-xs md:table-cell">
                        {e.targetType ? `${e.targetType} ${e.targetId ? e.targetId.slice(0, 13) : ''}` : '—'}
                      </Td>
                      <Td className="hidden max-w-xs text-[12.5px] lg:table-cell">{e.reason ?? '—'}</Td>
                      <Td>
                        {hasDetail && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-expanded={expanded}
                            onClick={() => setOpen(expanded ? null : e.id)}
                          >
                            {expanded ? 'Hide' : 'Details'}
                          </Button>
                        )}
                      </Td>
                    </Tr>
                    {expanded && (
                      <tr>
                        <td colSpan={6} className="border-line border-b bg-[#FAF9FE] px-3 py-3">
                          <div className="text-muted mb-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                            {e.ip && <span>Address {e.ip}</span>}
                            {e.requestId && (
                              <span>
                                Request <span className="font-mono">{e.requestId}</span>
                              </span>
                            )}
                            {e.targetId && (
                              <span>
                                Target <span className="font-mono">{e.targetId}</span>
                              </span>
                            )}
                            {e.reason && <span className="lg:hidden">Reason: {e.reason}</span>}
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row">
                            <Json label="Before" value={e.before} />
                            <Json label="After" value={e.after} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        )}
        <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={() => void list.loadMore()} />
      </Card>
    </>
  );
}
