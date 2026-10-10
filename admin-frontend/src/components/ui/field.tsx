import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/client/cn';

const CONTROL =
  'w-full rounded-[10px] border bg-white px-3 py-2 text-[13.5px] outline-none placeholder:text-muted/70 focus:border-brand disabled:bg-soft disabled:text-muted';

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(CONTROL, invalid ? 'border-bad' : 'border-line', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Select({
  className,
  invalid,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      className={cn(CONTROL, invalid ? 'border-bad' : 'border-line', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(CONTROL, 'min-h-[84px] resize-y', invalid ? 'border-bad' : 'border-line', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

/**
 * A label, a control and its message, wired together for screen readers: the control is described by
 * the hint or the error, and an error is announced as soon as it appears.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  children: (props: { id: string; 'aria-describedby': string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[12.5px] font-bold">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, invalid: !!error })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-bad mt-1 text-xs font-semibold">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-muted mt-1 text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-10 flex-none rounded-full transition-colors disabled:opacity-45',
        checked ? 'bg-brand' : 'bg-[#CFCBE6]',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] size-[18px] rounded-full bg-white transition-all',
          checked ? 'left-[19px]' : 'left-[3px]',
        )}
      />
    </button>
  );
}
