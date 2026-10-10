'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, ApiError } from '@/lib/client/api';
import { formatDateTime, humanize } from '@/lib/client/format';
import { CATEGORY_LABEL, SEVERITIES, SEVERITY_TONE, hoursLabel } from '@/lib/moderation';
import { useSession } from '@/lib/client/session';
import { useApi } from '@/lib/client/use-api';
import type { CategoryPolicyRow, PolicyView } from '@/lib/types';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, CardTitle, PageHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Field, Input, Select, Textarea } from '../ui/field';
import { ErrorState, Loading, describeError } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag } from '../ui/tag';
import { useToast } from '../ui/toast';

const schema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  slaHours: z.coerce
    .number()
    .int('Whole hours only.')
    .min(1, 'At least 1 hour.')
    .max(720, 'At most 720 hours (30 days).'),
  autoHoldAt: z.coerce.number().int('Whole numbers only.').min(0, '0 turns it off.').max(50, 'At most 50.'),
  reason: z
    .string()
    .trim()
    .min(10, 'Give a reason of at least 10 characters.')
    .max(500, 'Keep it under 500 characters.'),
});
type Values = z.input<typeof schema>;

function EditDialog({
  row,
  version,
  onClose,
  onSaved,
}: {
  row: CategoryPolicyRow;
  version: number;
  onClose: () => void;
  onSaved: (view: PolicyView) => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { severity: row.severity, slaHours: row.slaHours, autoHoldAt: row.autoHoldAt, reason: '' },
  });
  const [failure, setFailure] = useState<string | null>(null);

  const submit = handleSubmit(async (v) => {
    setFailure(null);
    try {
      const res = await api.put<PolicyView>(`policy/categories/${row.category}`, { ...v, expectedVersion: version });
      onSaved(res.data);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.details?.length) {
        for (const d of e.details) {
          if (d.field === 'severity' || d.field === 'slaHours' || d.field === 'autoHoldAt' || d.field === 'reason') {
            setError(d.field, { message: floorMessage(d.field, d.reasons[0]) });
          }
        }
        return;
      }
      setFailure(describeError(e));
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Handling of ${CATEGORY_LABEL[row.category].toLowerCase()} reports`}
      description="Applies to reports made from now on. Recorded in the audit log with the old and new values."
      busy={isSubmitting}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          label="Severity"
          hint={row.floor ? `Cannot be set below ${humanize(row.floor.minSeverity).toLowerCase()}.` : undefined}
          error={errors.severity?.message}
        >
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
        <Field
          label="Answer within (hours)"
          hint={
            row.floor ? `Cannot be slower than ${row.floor.maxSlaHours} hours.` : 'Reports past this show as overdue.'
          }
          error={errors.slaHours?.message}
        >
          {(p) => <Input {...p} {...register('slaHours')} type="number" min={1} max={720} inputMode="numeric" />}
        </Field>
        <Field
          label="Hide after this many different people report it"
          hint="0 turns automatic hiding off. It is hidden pending review, its author is told, and a moderator can show it again. Counted by person, not by report."
          error={errors.autoHoldAt?.message}
        >
          {(p) => <Input {...p} {...register('autoHoldAt')} type="number" min={0} max={50} inputMode="numeric" />}
        </Field>
        <Field label="Reason for the change" hint="Recorded in the audit log." error={errors.reason?.message}>
          {(p) => <Textarea {...p} {...register('reason')} rows={3} maxLength={500} />}
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
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function floorMessage(field: string, reason: string | undefined): string {
  if (reason?.startsWith('at_least_')) return `Cannot be set below ${humanize(reason.slice(9))}.`;
  if (reason?.startsWith('at_most_')) return `Cannot be more than ${reason.slice(8)} hours.`;
  return field === 'reason' ? 'Give a reason of at least 10 characters.' : 'This value is not acceptable.';
}

export function PolicyPage() {
  const { can } = useSession();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<PolicyView>(can('policy.read') ? 'policy' : null);
  const [editing, setEditing] = useState<CategoryPolicyRow | null>(null);

  if (!can('policy.read')) return <NoAccess what="the moderation policy" />;
  if (isLoading) return <Loading rows={8} />;
  if (error || !data) return <ErrorState error={error} retry={() => void mutate()} />;
  const p = data.data;
  const mayEdit = can('policy.update');

  return (
    <>
      <PageHeader
        title="Policy configuration"
        description="The published rules every decision cites, and how quickly and how strictly each kind of report is handled. Rule wording is a draft pending legal review; the business and its counsel set the real text and response times."
        actions={<Tag tone="neutral">Version {p.policyVersion}</Tag>}
      />

      <Card className="mb-5 p-0">
        <div className="p-[18px] pb-0">
          <CardTitle
            title="How each kind of report is handled"
            hint={`Child-safety and self-harm reports can be tuned but never below a floor. ${p.updatedAt ? `Last changed ${formatDateTime(p.updatedAt)}.` : 'Nothing has been changed from the defaults.'}`}
          />
        </div>
        <Table>
          <caption className="sr-only">Handling of each kind of report</caption>
          <thead>
            <tr>
              <Th>Kind of report</Th>
              <Th>Severity</Th>
              <Th>Answered within</Th>
              <Th className="hidden sm:table-cell">Hidden after</Th>
              <Th>
                <span className="sr-only">Edit</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {p.categories.map((c) => (
              <Tr key={c.category}>
                <Td>
                  <div className="font-bold">{CATEGORY_LABEL[c.category]}</div>
                  {!c.isDefault && <Tag tone="brand">Changed</Tag>}
                </Td>
                <Td>
                  <Tag tone={SEVERITY_TONE[c.severity]}>{humanize(c.severity)}</Tag>
                </Td>
                <Td>{hoursLabel(c.slaHours)}</Td>
                <Td className="hidden sm:table-cell">
                  {c.autoHoldAt === 0
                    ? 'Never'
                    : `${c.autoHoldAt} ${c.autoHoldAt === 1 ? 'person' : 'different people'}`}
                </Td>
                <Td>
                  {mayEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(c)}
                      aria-label={`Edit ${CATEGORY_LABEL[c.category]}`}
                    >
                      Edit
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card>
          <div className="text-muted text-[11.5px] font-bold">Reports one person can make a day</div>
          <div className="text-[24px] font-extrabold">{p.limits.reportsPerDay}</div>
        </Card>
        <Card>
          <div className="text-muted text-[11.5px] font-bold">Days to appeal a decision</div>
          <div className="text-[24px] font-extrabold">{p.limits.appealWindowDays}</div>
        </Card>
        <Card>
          <div className="text-muted text-[11.5px] font-bold">Hours to answer an appeal</div>
          <div className="text-[24px] font-extrabold">{p.limits.appealSlaHours}</div>
        </Card>
      </div>
      <p className="text-muted mb-5 text-xs">
        These three limits are changed on the{' '}
        <Link href="/settings" className="text-brand font-bold underline">
          settings page
        </Link>
        .
      </p>

      <Card className="p-0">
        <div className="p-[18px] pb-0">
          <CardTitle
            title="Published rules"
            hint="Moderators pick one of these for every decision, and the person is told which."
          />
        </div>
        <Table>
          <caption className="sr-only">Published rules</caption>
          <thead>
            <tr>
              <Th>Rule</Th>
              <Th className="hidden md:table-cell">What it covers</Th>
            </tr>
          </thead>
          <tbody>
            {p.rules.map((r) => (
              <Tr key={r.code}>
                <Td>
                  <div className="font-bold">{r.title}</div>
                  <div className="text-muted font-mono text-xs">{r.code}</div>
                </Td>
                <Td className="text-muted hidden md:table-cell">{r.summary}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {editing && (
        <EditDialog
          row={editing}
          version={p.version}
          onClose={() => setEditing(null)}
          onSaved={(view) => {
            toast.success('Policy updated');
            void mutate({ data: view }, { revalidate: false });
          }}
        />
      )}
    </>
  );
}
