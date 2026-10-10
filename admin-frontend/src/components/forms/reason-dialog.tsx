'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '@/lib/client/api';
import { Button, type ButtonVariant } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Field, Textarea } from '../ui/field';
import { describeError } from '../ui/states';

/** The same length rule the API applies, so a too-short reason is caught before it is sent. */
export const reasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Give a reason of at least 10 characters.')
    .max(500, 'Keep the reason to 500 characters or fewer.'),
});
type ReasonValues = z.infer<typeof reasonSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: ButtonVariant;
  reasonLabel?: string;
  reasonHint?: ReactNode;
  /** Content shown above the reason box (what exactly is about to change). */
  children?: ReactNode;
  /** Does the work. Throw (an `ApiError`) to keep the dialog open and show what went wrong. */
  onConfirm: (reason: string) => Promise<unknown>;
}

/**
 * Every action that changes someone's account, money or the rules asks *why*, and the answer goes to
 * the audit log. This is the one dialog they all use.
 */
export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  reasonLabel = 'Reason',
  reasonHint = 'Recorded in the audit log with your name.',
  children,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <ReasonForm
        onClose={onClose}
        confirmLabel={confirmLabel}
        tone={tone}
        reasonLabel={reasonLabel}
        reasonHint={reasonHint}
        onConfirm={onConfirm}
      >
        {children}
      </ReasonForm>
    </Dialog>
  );
}

function ReasonForm({
  onClose,
  confirmLabel,
  tone,
  reasonLabel,
  reasonHint,
  children,
  onConfirm,
}: Omit<Props, 'open' | 'title' | 'description'> & {
  tone: ButtonVariant;
  reasonLabel: string;
  reasonHint: ReactNode;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ReasonValues>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: '' } });
  const [failure, setFailure] = useState<string | null>(null);

  const submit = handleSubmit(async ({ reason }) => {
    setFailure(null);
    try {
      await onConfirm(reason);
      onClose();
    } catch (error) {
      const field = error instanceof ApiError ? error.details?.find((d) => d.field === 'reason') : undefined;
      if (field) setError('reason', { message: field.reasons[0] ?? 'This reason is not acceptable.' });
      else setFailure(describeError(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {children}
      <Field label={reasonLabel} hint={reasonHint} error={errors.reason?.message}>
        {(p) => <Textarea {...p} {...register('reason')} rows={3} maxLength={600} />}
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
        <Button type="submit" variant={tone} loading={isSubmitting}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}
