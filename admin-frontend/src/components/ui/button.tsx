import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/client/cn';

export type ButtonVariant = 'primary' | 'ghost' | 'good' | 'bad';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-ink',
  ghost: 'bg-white text-ink border border-line hover:bg-soft',
  good: 'bg-good-bg text-good hover:brightness-95',
  bad: 'bg-bad-bg text-bad hover:brightness-95',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  /** Shows a spinner and blocks a second click while the work is happening. */
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[10px] font-bold whitespace-nowrap transition-colors disabled:opacity-45',
        size === 'sm' ? 'px-2.5 py-[5px] text-xs' : 'px-3.5 py-2 text-[13px]',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
