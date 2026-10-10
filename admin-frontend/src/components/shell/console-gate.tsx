'use client';

import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/lib/client/session';
import { Spinner } from '../ui/states';
import { Shell } from './shell';

/**
 * Lets a page render only for someone fully signed in. Anyone else is sent back to the sign-in page,
 * which also handles a half-finished sign-in (password still to change, two-step still to enter).
 */
export function ConsoleGate({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const notReady = session === null || (session !== undefined && session.nextStep !== null);

  useEffect(() => {
    if (notReady) window.location.assign('/login');
  }, [notReady]);

  if (!session || notReady) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Checking your session" />
      </div>
    );
  }
  return <Shell>{children}</Shell>;
}

/** Shown in place of a page the signed-in person's roles do not include. */
export function NoAccess({ what }: { what: string }) {
  return (
    <div role="alert" className="border-line bg-card mx-auto mt-16 max-w-md rounded-2xl border p-8 text-center">
      <p className="text-[15px] font-extrabold">You do not have access to {what}</p>
      <p className="text-muted mt-1 text-[13px]">
        Your roles do not include it. If you need it for your work, ask a super admin to add the role.
      </p>
    </div>
  );
}
