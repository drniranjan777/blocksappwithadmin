'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/client/cn';
import { Icon } from './icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** `drawer` slides in from the right and is meant for looking at one record. */
  variant?: 'dialog' | 'drawer';
  /** Disables closing by Escape or a click outside (while something is being saved). */
  busy?: boolean;
}

/**
 * Built on the browser's own `<dialog>`: it traps keyboard focus inside, closes on Escape, marks the
 * rest of the page inert and returns focus to what opened it, so none of that is reimplemented here.
 * The content is only mounted while open, so every opening starts with a fresh form.
 */
export function Dialog({ open, onClose, title, description, children, variant = 'dialog', busy = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() puts focus on the first control, which is the Close button. A form should start
      // with its first field focused instead (React's own autoFocus runs too early to help here).
      dialog
        .querySelector<HTMLElement>(
          'input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
        )
        ?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const drawer = variant === 'drawer';
  return (
    // Clicking the dark backdrop closes the dialog as a mouse convenience; keyboard users close it with Escape (onCancel).
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current && !busy) onClose();
      }}
      className={cn(
        'bg-white p-0 shadow-2xl backdrop:backdrop-blur-[1px]',
        drawer
          ? 'border-line m-0 ml-auto h-dvh max-h-none w-[min(460px,100vw)] max-w-none border-l'
          : 'border-line m-auto w-[min(520px,calc(100vw-32px))] rounded-2xl border',
      )}
    >
      {open && (
        <div className={cn('flex flex-col', drawer && 'h-full')}>
          <header className="border-line flex items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-[16px] font-extrabold">
                {title}
              </h2>
              {description && <p className="text-muted mt-0.5 text-[13px]">{description}</p>}
            </div>
            <button
              type="button"
              aria-label="Close"
              disabled={busy}
              onClick={onClose}
              className="text-muted hover:bg-soft rounded-lg p-1.5 disabled:opacity-45"
            >
              <Icon name="close" />
            </button>
          </header>
          <div className={cn('px-5 py-4', drawer && 'flex-1 overflow-y-auto')}>{children}</div>
        </div>
      )}
    </dialog>
  );
}
