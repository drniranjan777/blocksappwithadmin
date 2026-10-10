'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import useSWR from 'swr';
import { ApiError, authApi, setSignedOutHandler } from './api';

export type NextStep = 'password_change' | 'two_factor_setup' | 'two_factor' | null;

export interface Staff {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: Array<{ key: string; name: string }>;
  /** What this person may do. Used to hide what they cannot; the API enforces it again on every call. */
  permissions: string[];
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export interface SessionState {
  nextStep: NextStep;
  admin: Staff;
}

interface SessionContext {
  /** `undefined` while it loads; `null` when nobody is signed in. */
  session: SessionState | null | undefined;
  /** Whether the signed-in person holds any one of these permissions. */
  can: (...permissions: string[]) => boolean;
  reload: () => Promise<unknown>;
  signOut: () => Promise<void>;
}

const Context = createContext<SessionContext | null>(null);

const SESSION_KEY = '/api/auth/session';

async function fetchSession(): Promise<SessionState | null> {
  try {
    const res = await authApi.call<SessionState>('session', undefined, 'GET');
    return res.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** Hard navigation, so every cached answer from the old session is thrown away with the page. */
function goToSignIn(): void {
  window.location.assign('/login');
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, mutate } = useSWR<SessionState | null>(SESSION_KEY, fetchSession, {
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });

  useEffect(() => {
    setSignedOutHandler(goToSignIn);
    return () => setSignedOutHandler(undefined);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.call('logout');
    } finally {
      goToSignIn();
    }
  }, []);

  const value = useMemo<SessionContext>(() => {
    const held = new Set(data?.admin.permissions ?? []);
    return {
      session: data,
      can: (...permissions) => permissions.length === 0 || permissions.some((p) => held.has(p)),
      reload: () => mutate(),
      signOut,
    };
  }, [data, mutate, signOut]);

  return <Context value={value}>{children}</Context>;
}

export function useSession(): SessionContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** Where a person who is not fully signed in has to go next. */
export function stepPath(step: NextStep): string | null {
  return step ? '/login' : null;
}
