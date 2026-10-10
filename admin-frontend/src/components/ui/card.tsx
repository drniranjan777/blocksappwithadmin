import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/client/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-line bg-card rounded-2xl border p-[18px]', className)} {...rest} />;
}

export function CardTitle({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[15px] font-extrabold">{title}</h3>
        {hint && <p className="text-muted text-[12.5px]">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'good' | 'bad';
}) {
  return (
    <Card>
      <div className="text-muted text-[11.5px] font-bold tracking-wide">{label}</div>
      <div className="mt-1 mb-0.5 text-[28px] leading-tight font-extrabold tracking-tight">{value}</div>
      {hint && (
        <div
          className={cn(
            'text-xs font-bold',
            tone === 'good' && 'text-good',
            tone === 'bad' && 'text-bad',
            tone === 'neutral' && 'text-muted',
          )}
        >
          {hint}
        </div>
      )}
    </Card>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-extrabold tracking-tight">{title}</h1>
        {description && <p className="text-muted mt-0.5 max-w-3xl text-[13px]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
