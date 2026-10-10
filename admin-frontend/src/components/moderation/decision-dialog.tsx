'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api, type Envelope } from '@/lib/client/api';
import { ACTION_INFO, rulesFor } from '@/lib/moderation';
import { useApi } from '@/lib/client/use-api';
import type { PolicyRule, ReportDetail, StaffAction } from '@/lib/types';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Field, Select, Textarea } from '../ui/field';
import { Spinner, describeError } from '../ui/states';

const schema = z.object({
  action: z.string().min(1, 'Choose what to do.'),
  policyReason: z.string().min(1, 'Choose the rule this is under.'),
  notes: z.string().trim().max(1000, 'Keep notes under 1,000 characters.').optional(),
});
type Values = z.infer<typeof schema>;

interface Props {
  report: ReportDetail;
  onClose: () => void;
  /** Called with the report as the API returns it after the decision. */
  onDecided: (updated: Envelope<ReportDetail>) => void;
}

/**
 * Deciding a report: what to do, under which published rule, and a private note. The rule list only
 * offers rules that fit the chosen decision (nothing is removed for "no violation"); the API checks
 * the same thing and has the final say.
 */
export function DecisionDialog({ report, onClose, onDecided }: Props) {
  const { data: rulesData, error: rulesError } = useApi<{ policyVersion: string; rules: PolicyRule[] }>(
    'moderation/rules',
  );
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { action: '', policyReason: '', notes: '' },
  });
  const [failure, setFailure] = useState<string | null>(null);
  const action = useWatch({ control, name: 'action' }) as StaffAction | '';
  const rules = useMemo(() => (action ? rulesFor(action, rulesData?.data.rules ?? []) : []), [action, rulesData]);
  const info = action ? ACTION_INFO[action] : null;

  const submit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      const res = await api.post<ReportDetail>(`moderation/reports/${report.id}/decision`, {
        action: values.action,
        policyReason: values.policyReason,
        ...(values.notes ? { notes: values.notes } : {}),
      });
      onDecided(res);
      onClose();
    } catch (e) {
      setFailure(describeError(e));
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Decide this report"
      description="Recorded with your name, the rule and your note."
      busy={isSubmitting}
    >
      {rulesError ? (
        <p role="alert" className="bg-bad-bg text-bad rounded-lg px-3 py-2 text-[13px] font-semibold">
          {describeError(rulesError)}
        </p>
      ) : !rulesData ? (
        <Spinner label="Loading the rules" />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Decision" error={errors.action?.message}>
            {(p) => (
              <Select
                {...p}
                {...register('action', {
                  onChange: () => setValue('policyReason', ''),
                })}
              >
                <option value="">Choose…</option>
                {report.allowed.actions.map((a) => (
                  <option key={a} value={a}>
                    {ACTION_INFO[a].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {info && <p className="bg-soft rounded-lg px-3 py-2 text-[12.5px]">{info.effect}</p>}

          <Field
            label="Rule"
            hint="The published rule this decision is under. The person is told which one."
            error={errors.policyReason?.message}
          >
            {(p) => (
              <Select {...p} {...register('policyReason')} disabled={!action}>
                <option value="">{action ? 'Choose a rule…' : 'Choose a decision first'}</option>
                {rules.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Private note"
            hint="For other staff. Never shown to the person or to whoever reported it."
            error={errors.notes?.message}
          >
            {(p) => <Textarea {...p} {...register('notes')} rows={3} maxLength={1000} />}
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
            <Button type="submit" variant={info?.tone ?? 'primary'} loading={isSubmitting}>
              {info ? info.label : 'Decide'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
