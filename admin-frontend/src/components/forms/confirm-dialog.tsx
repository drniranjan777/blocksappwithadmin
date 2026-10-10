'use client';

import { useState, type ReactNode } from 'react';
import { Button, type ButtonVariant } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { describeError } from '../ui/states';

/** A yes/no question for an action that needs no explanation (the API takes no reason for it). */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  children,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: ButtonVariant;
  children?: ReactNode;
  onConfirm: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} busy={busy}>
      <div className="space-y-4">
        {children}
        {failure && (
          <p role="alert" className="bg-bad-bg text-bad rounded-lg px-3 py-2 text-[13px] font-semibold">
            {failure}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} loading={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
