'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, ApiError } from '@/lib/client/api';
import { formatAgo, formatNumber, formatRupees } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useApi } from '@/lib/client/use-api';
import type { SettingRow } from '@/lib/types';
import { reasonSchema } from '../forms/reason-dialog';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Field, Input, Textarea } from '../ui/field';
import { ErrorState, Loading, describeError } from '../ui/states';
import { Tag } from '../ui/tag';
import { useToast } from '../ui/toast';

type Kind = 'number' | 'list' | 'text';

function kindOf(s: SettingRow): Kind {
  if (Array.isArray(s.default)) return 'list';
  return typeof s.default === 'number' ? 'number' : 'text';
}

/** How a value reads on the page: amounts as rupees, lists as a count, numbers as they are. */
export function showValue(s: SettingRow): string {
  const kind = kindOf(s);
  if (kind === 'list') {
    const n = Array.isArray(s.value) ? s.value.length : 0;
    return n === 0 ? 'None' : `${formatNumber(n)} ${n === 1 ? 'entry' : 'entries'}`;
  }
  if (kind === 'number') return formatNumber(Number(s.value));
  return s.key.endsWith('_amount') || s.key.endsWith('_limit') || s.key.endsWith('adjustment')
    ? formatRupees(String(s.value))
    : String(s.value);
}

/** The text a person edits: one entry per line for lists, otherwise the value itself. */
function toEditable(s: SettingRow): string {
  return Array.isArray(s.value) ? s.value.join('\n') : String(s.value ?? '');
}

/** What the API expects back for the edited text. */
export function fromEditable(kind: Kind, text: string): unknown {
  if (kind === 'list')
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  if (kind === 'number') return text.trim() === '' ? Number.NaN : Number(text);
  return text.trim();
}

const schema = z.object({ value: z.string().max(20_000), reason: reasonSchema.shape.reason });

function EditDialog({ setting, onClose, onSaved }: { setting: SettingRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const kind = kindOf(setting);
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { value: toEditable(setting), reason: '' },
  });

  const submit = handleSubmit(async ({ value, reason }) => {
    setFailure(null);
    const next = fromEditable(kind, value);
    if (kind === 'number' && !Number.isFinite(next)) {
      setError('value', { message: 'Enter a number.' });
      return;
    }
    try {
      await api.put(`settings/${setting.key}`, { value: next, reason });
      toast.success(`${setting.label} updated`);
      onSaved();
      onClose();
    } catch (error) {
      const field = error instanceof ApiError ? error.details?.find((d) => d.field === 'value') : undefined;
      if (field) setError('value', { message: field.reasons[0] ?? 'This value is not acceptable.' });
      else setFailure(describeError(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field
        label={setting.label}
        hint={
          kind === 'list'
            ? 'One entry per line.'
            : kind === 'text'
              ? 'An amount in rupees with two decimals, like 1500.00.'
              : `Currently ${showValue(setting)}. Default ${String(setting.default)}.`
        }
        error={errors.value?.message}
      >
        {(p) =>
          kind === 'list' ? (
            <Textarea {...p} {...register('value')} rows={8} />
          ) : (
            <Input {...p} {...register('value')} inputMode={kind === 'number' ? 'numeric' : 'decimal'} />
          )
        }
      </Field>
      <Field label="Reason" hint="Recorded in the audit log with the old and new value." error={errors.reason?.message}>
        {(p) => <Textarea {...p} {...register('reason')} rows={2} maxLength={600} />}
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
  );
}

export function SettingsPage() {
  const { can } = useSession();
  const { data, error, isLoading, mutate } = useApi<SettingRow[]>(can('settings.read') ? 'settings' : null);
  const [editing, setEditing] = useState<SettingRow | null>(null);

  if (!can('settings.read')) return <NoAccess what="settings" />;
  if (isLoading) return <Loading rows={6} />;
  if (error || !data) return <ErrorState error={error} retry={() => void mutate()} />;

  const groups = new Map<string, SettingRow[]>();
  for (const s of data.data) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
  const editable = can('settings.update');

  return (
    <>
      <PageHeader
        title="Settings"
        description="Rules that can change without a new release. The list is fixed: only these can be changed, and each value is checked before it is saved. Money limits must stay consistent with each other."
      />
      <div className="space-y-4">
        {[...groups.entries()].map(([group, rows]) => (
          <Card key={group} className="p-0">
            <h2 className="border-line border-b px-[18px] py-3 text-[14px] font-extrabold">{group}</h2>
            <ul>
              {rows.map((s) => (
                <li
                  key={s.key}
                  className="border-line flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-[18px] py-3 last:border-0"
                >
                  <div className="min-w-[220px] flex-1">
                    <div className="font-bold">{s.label}</div>
                    <p className="text-muted text-[12.5px]">{s.description}</p>
                    {s.updatedAt && <p className="text-muted mt-0.5 text-xs">Changed {formatAgo(s.updatedAt)}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{showValue(s)}</span>
                    {s.isDefault && <Tag>Default</Tag>}
                  </div>
                  {editable && (
                    <Button variant="ghost" size="sm" onClick={() => setEditing(s)} aria-label={`Change ${s.label}`}>
                      Change
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Change: ${editing.label}` : 'Change'}
        description={editing?.description}
      >
        {editing && <EditDialog setting={editing} onClose={() => setEditing(null)} onSaved={() => void mutate()} />}
      </Dialog>
    </>
  );
}
