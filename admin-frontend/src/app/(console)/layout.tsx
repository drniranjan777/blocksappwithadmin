import { ConsoleGate } from '@/components/shell/console-gate';
import { ToastProvider } from '@/components/ui/toast';
import { SessionProvider } from '@/lib/client/session';

export default function ConsoleLayout({ children }: LayoutProps<'/'>) {
  return (
    <ToastProvider>
      <SessionProvider>
        <ConsoleGate>{children}</ConsoleGate>
      </SessionProvider>
    </ToastProvider>
  );
}
