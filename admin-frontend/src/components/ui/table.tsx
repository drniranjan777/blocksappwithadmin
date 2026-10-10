import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/client/cn';

/**
 * A scrollable table card in the prototype's style. Wide tables scroll sideways on a phone, and the
 * last column (where the buttons are) stays pinned to the right edge so the action is never off-screen.
 */
export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn(
          'w-full border-collapse',
          '[&_td:last-child:not(:first-child)]:bg-card [&_td:last-child:not(:first-child)]:sticky [&_td:last-child:not(:first-child)]:right-0',
          '[&_th:last-child:not(:first-child)]:bg-card [&_th:last-child:not(:first-child)]:sticky [&_th:last-child:not(:first-child)]:right-0',
          className,
        )}
        {...rest}
      />
    </div>
  );
}

export function Th({ className, scope = 'col', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope}
      className={cn(
        'border-line text-muted border-b px-3 py-2.5 text-left text-[11px] font-bold tracking-[0.06em] uppercase',
        className,
      )}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-line border-b px-3 py-3 align-middle', className)} {...rest} />;
}

export function Tr({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('hover:bg-[#FAF9FE] last:[&>td]:border-b-0', className)} {...rest} />;
}
