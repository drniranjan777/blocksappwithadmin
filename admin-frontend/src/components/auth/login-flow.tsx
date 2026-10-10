'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import QRCode from 'qrcode';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { authApi } from '@/lib/client/api';
import type { NextStep, SessionState } from '@/lib/client/session';
import { Button } from '../ui/button';
import { Field, Input } from '../ui/field';
import { Logo } from '../ui/icon';
import { describeError, Spinner } from '../ui/states';

type Mode = 'loading' | 'credentials' | 'password_change' | 'two_factor_setup' | 'two_factor' | 'backup_codes';

/** Where a finished sign-in lands. A hard navigation, so nothing from before is carried over. */
function enter(): void {
  window.location.assign('/');
}

function Frame({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-2.5 text-[19px] font-extrabold tracking-tight">
          <Logo size={38} /> BLOCKS
        </div>
        <div className="border-line bg-card rounded-2xl border p-7 shadow-sm">
          <h1 className="text-[20px] font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted mt-1 mb-5 text-[13px]">{subtitle}</p>}
          {children}
        </div>
        <p className="text-muted mt-4 text-center text-xs">Staff only. Everything you do here is recorded.</p>
      </div>
    </main>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="bg-bad-bg text-bad rounded-lg px-3 py-2 text-[13px] font-semibold">
      {message}
    </p>
  );
}

// ------------------------------------------------------------ credentials --

const credentialsSchema = z.object({
  email: z.string().trim().min(3, 'Enter your work e-mail address.').max(254),
  password: z.string().min(1, 'Enter your password.').max(128),
});

function CredentialsForm({ onStep }: { onStep: (next: SessionState) => void }) {
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof credentialsSchema>>({ resolver: zodResolver(credentialsSchema) });

  const submit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      const res = await authApi.call<SessionState>('login', values);
      onStep(res.data);
    } catch (error) {
      setFailure(describeError(error));
    }
  });

  return (
    <Frame title="Sign in" subtitle="Use your BLOCKS staff account.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="E-mail" error={errors.email?.message}>
          {(p) => <Input {...p} {...register('email')} type="email" autoComplete="username" autoFocus />}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(p) => <Input {...p} {...register('password')} type="password" autoComplete="current-password" />}
        </Field>
        <FormError message={failure} />
        <Button type="submit" loading={isSubmitting} className="w-full">
          Continue
        </Button>
      </form>
    </Frame>
  );
}

// -------------------------------------------------------- password change --

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter the password you were given.').max(128),
    newPassword: z.string().min(14, 'Use at least 14 characters.').max(128, 'Use 128 characters or fewer.'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'The two passwords do not match.' })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password you have not used for this account.',
  });

function PasswordForm({ onStep }: { onStep: (next: SessionState) => void }) {
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });

  const submit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setFailure(null);
    try {
      const res = await authApi.call<SessionState>('password', { currentPassword, newPassword });
      onStep(res.data);
    } catch (error) {
      setFailure(describeError(error));
    }
  });

  return (
    <Frame title="Choose a new password" subtitle="The password you were given is temporary. Pick one only you know.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Current password" error={errors.currentPassword?.message}>
          {(p) => (
            <Input {...p} {...register('currentPassword')} type="password" autoComplete="current-password" autoFocus />
          )}
        </Field>
        <Field
          label="New password"
          hint="At least 14 characters. A few random words is fine."
          error={errors.newPassword?.message}
        >
          {(p) => <Input {...p} {...register('newPassword')} type="password" autoComplete="new-password" />}
        </Field>
        <Field label="Repeat new password" error={errors.confirm?.message}>
          {(p) => <Input {...p} {...register('confirm')} type="password" autoComplete="new-password" />}
        </Field>
        <FormError message={failure} />
        <Button type="submit" loading={isSubmitting} className="w-full">
          Save password
        </Button>
      </form>
    </Frame>
  );
}

// ------------------------------------------------------ two-step: set up --

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6 digits shown in your app.'),
});

function TwoFactorSetup({ onDone }: { onDone: (codes: string[]) => void }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof codeSchema>>({ resolver: zodResolver(codeSchema) });

  // Asking for a secret creates a new one on the server, so it must be asked for exactly once per
  // visit. The request is kept in a ref: React may run this effect twice (development re-mounts it),
  // and both runs then wait on the same request instead of making a second, different secret.
  const request = useRef<Promise<{ secret: string; qr: string }> | null>(null);
  useEffect(() => {
    let cancelled = false;
    request.current ??= authApi.call<{ secret: string; otpauthUri: string }>('two-factor/setup').then(async (res) => ({
      secret: res.data.secret,
      qr: await QRCode.toDataURL(res.data.otpauthUri, { margin: 1, width: 192, errorCorrectionLevel: 'M' }),
    }));
    request.current.then(
      (value) => {
        if (!cancelled) setSetup(value);
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(describeError(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = handleSubmit(async ({ code }) => {
    setFailure(null);
    try {
      const res = await authApi.call<SessionState & { backupCodes?: string[] }>('two-factor/confirm', { code });
      onDone(res.data.backupCodes ?? []);
    } catch (error) {
      setFailure(describeError(error));
    }
  });

  return (
    <Frame
      title="Set up two-step verification"
      subtitle="Staff accounts need a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password...) every time you sign in."
    >
      {loadError ? (
        <FormError message={loadError} />
      ) : !setup ? (
        <Spinner label="Preparing" />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-[13px]">
            <li>Scan this picture with your authenticator app.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <div className="bg-soft flex flex-col items-center gap-2 rounded-xl p-4">
            {/* A data: image made on this page from the one-time secret; it is never uploaded anywhere. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setup.qr}
              alt="QR code for your authenticator app"
              width={192}
              height={192}
              className="rounded-lg bg-white"
            />
            <p className="text-muted text-center text-xs">
              Cannot scan? Enter this key by hand:
              <br />
              <code className="text-ink font-mono text-[13px] font-bold break-all select-all">{setup.secret}</code>
            </p>
          </div>
          <Field label="6-digit code" error={errors.code?.message}>
            {(p) => (
              <Input
                {...p}
                {...register('code')}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                autoFocus
              />
            )}
          </Field>
          <FormError message={failure} />
          <Button type="submit" loading={isSubmitting} className="w-full">
            Turn on and continue
          </Button>
        </form>
      )}
    </Frame>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([`BLOCKS staff console: backup codes\n(each works once)\n\n${codes.join('\n')}\n`], {
        type: 'text/plain',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'blocks-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Frame
      title="Save your backup codes"
      subtitle="If you lose your phone, each of these gets you in once. They are shown only now."
    >
      <ul
        className="bg-soft grid grid-cols-2 gap-2 rounded-xl p-4 font-mono text-[14px] font-bold"
        aria-label="Backup codes"
      >
        {codes.map((c) => (
          <li key={c} className="select-all">
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button variant="ghost" size="sm" onClick={download}>
          Download
        </Button>
      </div>
      <label className="mt-4 flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="accent-brand mt-0.5 size-4"
        />
        I have saved these codes somewhere safe.
      </label>
      <Button className="mt-4 w-full" disabled={!saved} onClick={enter}>
        Enter the console
      </Button>
    </Frame>
  );
}

// ------------------------------------------------------- two-step: sign in --

const verifySchema = z.object({ code: z.string().trim().min(6, 'Enter your code.').max(20) });

function TwoFactorVerify({ onStep }: { onStep: (next: SessionState) => void }) {
  const [method, setMethod] = useState<'totp' | 'backup_code'>('totp');
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof verifySchema>>({ resolver: zodResolver(verifySchema) });

  const submit = handleSubmit(async ({ code }) => {
    setFailure(null);
    if (method === 'totp' && !/^\d{6}$/.test(code)) {
      setFailure('The code from your app is 6 digits.');
      return;
    }
    try {
      const res = await authApi.call<SessionState>('verify', { method, code });
      onStep(res.data);
    } catch (error) {
      setFailure(describeError(error));
      reset({ code: '' });
    }
  });

  return (
    <Frame
      title="Enter your code"
      subtitle={
        method === 'totp'
          ? 'Open your authenticator app and type the 6-digit code.'
          : 'Type one of the backup codes you saved. Each works once.'
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label={method === 'totp' ? '6-digit code' : 'Backup code'} error={errors.code?.message}>
          {(p) => (
            <Input
              {...p}
              {...register('code')}
              inputMode={method === 'totp' ? 'numeric' : 'text'}
              autoComplete="one-time-code"
              maxLength={method === 'totp' ? 6 : 20}
              autoFocus
            />
          )}
        </Field>
        <FormError message={failure} />
        <Button type="submit" loading={isSubmitting} className="w-full">
          Sign in
        </Button>
        <button
          type="button"
          className="text-brand w-full text-center text-[13px] font-bold hover:underline"
          onClick={() => {
            setMethod((m) => (m === 'totp' ? 'backup_code' : 'totp'));
            setFailure(null);
            reset({ code: '' });
          }}
        >
          {method === 'totp' ? 'Use a backup code instead' : 'Use my authenticator app instead'}
        </button>
      </form>
    </Frame>
  );
}

// ------------------------------------------------------------------- flow --

function modeFor(step: NextStep): Mode {
  return step ?? 'credentials';
}

export function LoginFlow() {
  const [mode, setMode] = useState<Mode>('loading');
  const [codes, setCodes] = useState<string[]>([]);

  // Pick up where a half-finished sign-in left off (a refresh must not lose the person's place).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authApi.call<SessionState>('session', undefined, 'GET');
        if (cancelled) return;
        if (res.data.nextStep === null) enter();
        else setMode(modeFor(res.data.nextStep));
      } catch {
        // Not signed in (or the server cannot be reached): start from the beginning.
        if (!cancelled) setMode('credentials');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onStep = (state: SessionState) => {
    if (state.nextStep === null) enter();
    else setMode(modeFor(state.nextStep));
  };

  switch (mode) {
    case 'loading':
      return (
        <Frame title="BLOCKS staff console">
          <Spinner label="Checking your session" />
        </Frame>
      );
    case 'credentials':
      return <CredentialsForm onStep={onStep} />;
    case 'password_change':
      return <PasswordForm onStep={onStep} />;
    case 'two_factor_setup':
      return (
        <TwoFactorSetup
          onDone={(c) => {
            setCodes(c);
            setMode('backup_codes');
          }}
        />
      );
    case 'two_factor':
      return <TwoFactorVerify onStep={onStep} />;
    case 'backup_codes':
      return <BackupCodes codes={codes} />;
  }
}
