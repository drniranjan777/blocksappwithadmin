'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/client/api';
import { formatAgo, formatDateTime, formatNumber, humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useApi } from '@/lib/client/use-api';
import type { AppUserDetail, UserNote } from '@/lib/types';
import { ReasonDialog } from '../forms/reason-dialog';
import { Avatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Field, Textarea } from '../ui/field';
import { ErrorState, Loading, describeError } from '../ui/states';
import { LevelBadge, Tag, statusTone } from '../ui/tag';
import { useToast } from '../ui/toast';

type Action = 'suspend' | 'restrict' | 'restore' | 'revoke';

const ACTIONS: Record<
  Action,
  { title: string; label: string; tone: 'bad' | 'good' | 'ghost'; description: string; done: string }
> = {
  suspend: {
    title: 'Suspend this account',
    label: 'Suspend',
    tone: 'bad',
    description:
      'They are signed out of every device and cannot sign in until the account is restored. They will see that it was suspended.',
    done: 'Account suspended',
  },
  restrict: {
    title: 'Restrict this account',
    label: 'Restrict',
    tone: 'bad',
    description:
      'They stay signed in and can read, but cannot post, comment or publish reels and stories until it is restored.',
    done: 'Account restricted',
  },
  restore: {
    title: 'Restore this account',
    label: 'Restore',
    tone: 'good',
    description: 'The account goes back to normal. A suspended person can sign in again.',
    done: 'Account restored',
  },
  revoke: {
    title: 'Sign out of every device',
    label: 'Sign out everywhere',
    tone: 'ghost',
    description:
      'Every phone and browser signed in as this person is signed out now. They can sign in again with their password.',
    done: 'Signed out of every device',
  },
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-line flex items-start justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-muted text-[12.5px]">{label}</dt>
      <dd className="text-right font-semibold break-words">{children}</dd>
    </div>
  );
}

const noteSchema = z.object({
  body: z.string().trim().min(3, 'Write at least a few words.').max(2000, 'Keep notes under 2,000 characters.'),
});

function Notes({ userId }: { userId: string }) {
  const { can } = useSession();
  const toast = useToast();
  const readable = can('users.notes.read');
  const { data, error, mutate } = useApi<UserNote[]>(readable ? `users/${userId}/notes` : null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof noteSchema>>({ resolver: zodResolver(noteSchema) });

  const add = handleSubmit(async ({ body }) => {
    try {
      await api.post(`users/${userId}/notes`, { body });
      reset();
      await mutate();
      toast.success('Note added');
    } catch (e) {
      toast.error(describeError(e));
    }
  });

  if (!readable) return null;
  return (
    <section aria-labelledby="notes-title" className="mt-6">
      <h3 id="notes-title" className="mb-2 text-[14px] font-extrabold">
        Internal notes
      </h3>
      {error ? (
        <ErrorState error={error} className="py-4" />
      ) : (
        <ul className="space-y-2">
          {(data?.data ?? []).map((n) => (
            <li key={n.id} className="bg-soft rounded-xl px-3 py-2.5">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="text-muted mt-1 text-xs">
                {n.by} · {formatAgo(n.at)}
              </p>
            </li>
          ))}
          {data && data.data.length === 0 && <li className="text-muted text-[13px]">No notes yet.</li>}
        </ul>
      )}
      {can('users.notes.write') && (
        <form onSubmit={add} noValidate className="mt-3 space-y-2">
          <Field
            label="Add a note"
            hint="Only staff can see notes. Never put passwords or full identity numbers here."
            error={errors.body?.message}
          >
            {(p) => <Textarea {...p} {...register('body')} rows={2} />}
          </Field>
          <Button type="submit" size="sm" variant="ghost" loading={isSubmitting}>
            Add note
          </Button>
        </form>
      )}
    </section>
  );
}

export function UserDrawer({
  userId,
  onClose,
  onChanged,
}: {
  userId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const toast = useToast();
  const [action, setAction] = useState<Action | null>(null);
  const { data, error, isLoading, mutate } = useApi<AppUserDetail>(userId ? `users/${userId}` : null);
  const u = data?.data;
  const available: Action[] = u
    ? [
        ...(u.status === 'ACTIVE' && can('users.restrict') ? (['restrict'] as const) : []),
        ...((u.status === 'ACTIVE' || u.status === 'RESTRICTED') && can('users.suspend') ? (['suspend'] as const) : []),
        ...((u.status === 'SUSPENDED' || u.status === 'RESTRICTED') && can('users.restore')
          ? (['restore'] as const)
          : []),
        ...(can('users.sessions.revoke') ? (['revoke'] as const) : []),
      ]
    : [];

  const run = async (kind: Action, reason: string) => {
    if (!userId) return;
    if (kind === 'revoke') {
      await api.post(`users/${userId}/sessions/revoke`, { reason });
      await mutate((prev) => (prev ? { ...prev, data: { ...prev.data, activeSessions: 0 } } : prev), {
        revalidate: false,
      });
    } else {
      const res = await api.post<AppUserDetail>(`users/${userId}/${kind}`, { reason });
      await mutate(res, { revalidate: false });
    }
    toast.success(ACTIONS[kind].done);
    onChanged();
  };

  const spec = action ? ACTIONS[action] : null;
  return (
    <>
      <Dialog
        open={userId !== null}
        onClose={onClose}
        title={u ? u.displayName : 'Account'}
        description={u ? `@${u.username}` : undefined}
        variant="drawer"
      >
        {isLoading ? (
          <Loading rows={6} />
        ) : error || !u ? (
          <ErrorState error={error} retry={() => void mutate()} />
        ) : (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={u.displayName} seed={u.id} size={48} />
              <div className="flex flex-wrap gap-1.5">
                <Tag tone={statusTone(u.status)}>{humanize(u.status)}</Tag>
                <Tag tone={u.risk === 'HIGH' ? 'bad' : u.risk === 'MEDIUM' ? 'warn' : 'good'}>
                  {humanize(u.risk)} risk
                </Tag>
                <Tag tone="brand">{humanize(u.accountType)}</Tag>
              </div>
            </div>

            {u.statusReason && u.status !== 'ACTIVE' && (
              <p className="bg-warn-bg text-warn mb-4 rounded-xl px-3 py-2.5 text-[13px] font-semibold">
                {humanize(u.status)}: {u.statusReason}
              </p>
            )}

            <dl>
              <Fact label="E-mail">
                {u.email ?? '—'}{' '}
                {u.email && (
                  <Tag tone={u.emailVerified ? 'good' : 'warn'}>{u.emailVerified ? 'verified' : 'not verified'}</Tag>
                )}
              </Fact>
              <Fact label="Phone">
                {u.phone ?? '—'}{' '}
                {u.phone && (
                  <Tag tone={u.phoneVerified ? 'good' : 'warn'}>{u.phoneVerified ? 'verified' : 'not verified'}</Tag>
                )}
              </Fact>
              <Fact label="Two-step sign-in">{u.twoFactorEnabled ? 'On' : 'Off'}</Fact>
              <Fact label="Identity check">
                <Tag tone={statusTone(u.identity)}>{humanize(u.identity)}</Tag>
              </Fact>
              <Fact label="Monetisation">
                <Tag tone={statusTone(u.monetization)}>{humanize(u.monetization)}</Tag>
              </Fact>
              <Fact label="Best reach level">
                <LevelBadge level={u.bestReachLevel} />
              </Fact>
              <Fact label="Followers · following">
                {formatNumber(u.followers)} · {formatNumber(u.following)}
              </Fact>
              <Fact label="Posts · reels">
                {formatNumber(u.posts)} · {formatNumber(u.reels)}
              </Fact>
              <Fact label="Reports against">{formatNumber(u.reportsAgainst)}</Fact>
              <Fact label="Signed in on">{formatNumber(u.activeSessions)} device(s)</Fact>
              <Fact label="Joined">{formatDateTime(u.createdAt)}</Fact>
              <Fact label="Last active">{formatAgo(u.lastActiveAt)}</Fact>
            </dl>

            {!can('users.read_contact') && (u.email || u.phone) && (
              <p className="text-muted mt-2 text-xs">Contact details are masked for your role.</p>
            )}

            {available.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {available.map((a) => (
                  <Button key={a} variant={ACTIONS[a].tone} onClick={() => setAction(a)}>
                    {ACTIONS[a].label}
                  </Button>
                ))}
              </div>
            )}
            <p className="text-muted mt-2 text-xs">Every action asks for a reason and is recorded in the audit log.</p>

            <Notes userId={u.id} />
          </div>
        )}
      </Dialog>

      {spec && action && (
        <ReasonDialog
          open
          onClose={() => setAction(null)}
          title={spec.title}
          description={spec.description}
          confirmLabel={spec.label}
          tone={spec.tone}
          onConfirm={(reason) => run(action, reason)}
        />
      )}
    </>
  );
}
