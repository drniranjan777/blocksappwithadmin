'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, api } from '@/lib/client/api';
import { formatAgo, formatDateTime, humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useDebounced } from '@/lib/client/use-debounced';
import { useApi, useCursorList } from '@/lib/client/use-api';
import type { RoleView, StaffSession, StaffView } from '@/lib/types';
import { ReasonDialog, reasonSchema } from '../forms/reason-dialog';
import { NoAccess } from '../shell/console-gate';
import { Avatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Field, Input, Select, Textarea } from '../ui/field';
import { Icon } from '../ui/icon';
import { EmptyState, ErrorState, Loading, LoadMore, describeError } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag, statusTone } from '../ui/tag';
import { useToast } from '../ui/toast';

/** Checkboxes for roles, shared by "invite" and "change roles". */
function RolePicker({
  roles,
  value,
  onChange,
}: {
  roles: RoleView[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-[12.5px] font-bold">Roles</legend>
      {roles.map((r) => (
        <label key={r.key} className="border-line hover:bg-soft flex items-start gap-2 rounded-lg border px-3 py-2">
          <input
            type="checkbox"
            checked={value.includes(r.key)}
            onChange={(e) => onChange(e.target.checked ? [...value, r.key] : value.filter((k) => k !== r.key))}
            className="accent-brand mt-0.5 size-4"
          />
          <span>
            <span className="font-bold">{r.name}</span>
            {r.description && <span className="text-muted block text-xs">{r.description}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

const inviteSchema = z.object({
  name: z.string().trim().min(2, 'Enter their full name.').max(120),
  email: z.string().trim().min(3, 'Enter their work e-mail address.').max(254),
});

function InviteForm({ roles, onClose, onDone }: { roles: RoleView[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof inviteSchema>>({ resolver: zodResolver(inviteSchema) });

  const submit = handleSubmit(async (values) => {
    setFailure(null);
    if (picked.length === 0) {
      setRolesError('Choose at least one role.');
      return;
    }
    if (picked.length > 5) {
      setRolesError('A person can hold at most five roles.');
      return;
    }
    setRolesError(null);
    try {
      const res = await api.post<{ inviteEmailSent: boolean }>('staff', { ...values, roleKeys: picked });
      toast.success(
        res.data.inviteEmailSent
          ? 'Invitation sent'
          : 'Account created. The e-mail could not be sent: use "Send a new invitation".',
      );
      onDone();
      onClose();
    } catch (error) {
      const email = error instanceof ApiError ? error.details?.find((d) => d.field === 'email') : undefined;
      if (email) setError('email', { message: email.reasons[0] ?? 'Check this address.' });
      else setFailure(describeError(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Full name" error={errors.name?.message}>
        {(p) => <Input {...p} {...register('name')} autoComplete="off" />}
      </Field>
      <Field
        label="Work e-mail"
        hint="A temporary password is sent here. It expires, and they must replace it and set up an authenticator before they can do anything."
        error={errors.email?.message}
      >
        {(p) => <Input {...p} {...register('email')} type="email" autoComplete="off" />}
      </Field>
      <div>
        <RolePicker roles={roles} value={picked} onChange={setPicked} />
        {rolesError && (
          <p role="alert" className="text-bad mt-1 text-xs font-semibold">
            {rolesError}
          </p>
        )}
      </div>
      {failure && (
        <p role="alert" className="bg-bad-bg text-bad rounded-lg px-3 py-2 text-[13px] font-semibold">
          {failure}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Send invitation
        </Button>
      </div>
    </form>
  );
}

const rolesSchema = z.object({ reason: reasonSchema.shape.reason });

function ChangeRolesForm({
  staff,
  roles,
  onClose,
  onDone,
}: {
  staff: StaffView;
  roles: RoleView[];
  onClose: () => void;
  onDone: (next: StaffView) => void;
}) {
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>(staff.roles.map((r) => r.key));
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof rolesSchema>>({ resolver: zodResolver(rolesSchema) });

  const submit = handleSubmit(async ({ reason }) => {
    setFailure(null);
    if (picked.length === 0 || picked.length > 5) {
      setFailure('Choose between one and five roles.');
      return;
    }
    try {
      const res = await api.put<StaffView>(`staff/${staff.id}/roles`, { roleKeys: picked, reason });
      toast.success('Roles updated');
      onDone(res.data);
      onClose();
    } catch (error) {
      setFailure(describeError(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <RolePicker roles={roles} value={picked} onChange={setPicked} />
      <Field
        label="Reason"
        hint="Recorded in the audit log. You cannot change your own roles, grant what you do not hold, or create a combination the separation-of-duties rules forbid."
        error={errors.reason?.message}
      >
        {(p) => <Textarea {...p} {...register('reason')} rows={2} maxLength={600} />}
      </Field>
      {failure && (
        <p role="alert" className="bg-bad-bg text-bad rounded-lg px-3 py-2 text-[13px] font-semibold">
          {failure}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Save roles
        </Button>
      </div>
    </form>
  );
}

type StaffAction = 'disable' | 'enable' | 'reset-two-factor' | 'revoke-sessions';
const STAFF_ACTIONS: Record<
  StaffAction,
  { title: string; label: string; tone: 'bad' | 'good' | 'ghost'; description: string; done: string }
> = {
  disable: {
    title: 'Disable this account',
    label: 'Disable',
    tone: 'bad',
    description: 'They are signed out everywhere and cannot sign in until it is enabled again.',
    done: 'Account disabled',
  },
  enable: {
    title: 'Enable this account',
    label: 'Enable',
    tone: 'good',
    description: 'They can sign in again with their existing password and authenticator.',
    done: 'Account enabled',
  },
  'reset-two-factor': {
    title: 'Reset two-step verification',
    label: 'Reset',
    tone: 'bad',
    description:
      'For someone who lost their device. They are signed out and must set up an authenticator again on their next sign-in.',
    done: 'Two-step verification reset',
  },
  'revoke-sessions': {
    title: 'Sign out of every device',
    label: 'Sign out everywhere',
    tone: 'ghost',
    description: 'Every browser signed in as this person is signed out now.',
    done: 'Signed out everywhere',
  },
};

function StaffDrawer({
  staffId,
  onClose,
  onChanged,
}: {
  staffId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can, session } = useSession();
  const toast = useToast();
  const [action, setAction] = useState<StaffAction | null>(null);
  const [changingRoles, setChangingRoles] = useState(false);
  const { data, error, isLoading, mutate } = useApi<StaffView>(staffId ? `staff/${staffId}` : null);
  const sessions = useApi<StaffSession[]>(staffId && can('admin.users.read') ? `staff/${staffId}/sessions` : null);
  const roles = useApi<RoleView[]>(can('admin.roles.read') && changingRoles ? 'roles' : null);
  const s = data?.data;
  const manage = can('admin.users.manage');
  const itself = !!s && session?.admin.id === s.id;

  const available: StaffAction[] = s
    ? [
        ...(manage && s.status !== 'DISABLED' && !itself ? (['disable'] as const) : []),
        ...(manage && s.status === 'DISABLED' ? (['enable'] as const) : []),
        ...(manage && s.twoFactorEnabled && !itself ? (['reset-two-factor'] as const) : []),
        ...(can('admin.sessions.revoke') ? (['revoke-sessions'] as const) : []),
      ]
    : [];

  const run = async (kind: StaffAction, reason: string) => {
    if (!staffId) return;
    const res = await api.post<StaffView | { signedOut: number }>(`staff/${staffId}/${kind}`, { reason });
    toast.success(STAFF_ACTIONS[kind].done);
    if ('id' in res.data) await mutate({ data: res.data }, { revalidate: false });
    await sessions.mutate();
    onChanged();
  };

  const spec = action ? STAFF_ACTIONS[action] : null;
  return (
    <>
      <Dialog
        open={staffId !== null}
        onClose={onClose}
        title={s?.name ?? 'Staff account'}
        description={s?.email}
        variant="drawer"
      >
        {isLoading ? (
          <Loading rows={5} />
        ) : error || !s ? (
          <ErrorState error={error} retry={() => void mutate()} />
        ) : (
          <div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              <Tag tone={statusTone(s.status)}>{humanize(s.status)}</Tag>
              <Tag tone={s.twoFactorEnabled ? 'good' : 'warn'}>
                {s.twoFactorEnabled ? 'Two-step on' : 'Two-step not set up'}
              </Tag>
              {s.mustChangePassword && <Tag tone="warn">Must change password</Tag>}
              {itself && <Tag tone="brand">You</Tag>}
            </div>
            <dl className="mb-4">
              {[
                ['Roles', s.roles.map((r) => r.name).join(', ') || '—'],
                [
                  'Last sign-in',
                  s.lastLoginAt ? `${formatDateTime(s.lastLoginAt)} (${formatAgo(s.lastLoginAt)})` : 'Never',
                ],
                ['Account created', formatDateTime(s.createdAt)],
                ...(s.status === 'INVITED' ? [['Invitation expires', formatDateTime(s.inviteExpiresAt)]] : []),
              ].map(([k, v]) => (
                <div key={k} className="border-line flex items-start justify-between gap-4 border-b py-2 last:border-0">
                  <dt className="text-muted text-[12.5px]">{k}</dt>
                  <dd className="text-right font-semibold">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap gap-2">
              {manage && !itself && (
                <Button variant="ghost" onClick={() => setChangingRoles(true)}>
                  Change roles
                </Button>
              )}
              {manage && s.status === 'INVITED' && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await api.post(`staff/${s.id}/reinvite`);
                      toast.success('A new invitation was sent');
                      await mutate();
                    } catch (e) {
                      toast.error(describeError(e));
                    }
                  }}
                >
                  Send a new invitation
                </Button>
              )}
              {available.map((a) => (
                <Button key={a} variant={STAFF_ACTIONS[a].tone} onClick={() => setAction(a)}>
                  {STAFF_ACTIONS[a].label}
                </Button>
              ))}
            </div>
            {itself && (
              <p className="text-muted mt-2 text-xs">Another administrator has to change your own roles or status.</p>
            )}

            {sessions.data && (
              <section className="mt-6" aria-labelledby="staff-sessions">
                <h3 id="staff-sessions" className="mb-2 text-[14px] font-extrabold">
                  Signed in now
                </h3>
                {sessions.data.data.length === 0 ? (
                  <p className="text-muted text-[13px]">No active sign-ins.</p>
                ) : (
                  <ul className="space-y-2">
                    {sessions.data.data.map((x) => (
                      <li key={x.id} className="bg-soft rounded-xl px-3 py-2 text-[12.5px]">
                        <b>{x.ip ?? 'Unknown address'}</b> · started {formatAgo(x.createdAt)} · last used{' '}
                        {formatAgo(x.lastUsedAt)}
                        <div className="text-muted">Ends by {formatDateTime(x.expiresAt)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        open={changingRoles}
        onClose={() => setChangingRoles(false)}
        title="Change roles"
        description={s ? `For ${s.name}` : undefined}
      >
        {roles.isLoading ? (
          <Loading rows={4} />
        ) : roles.error || !roles.data || !s ? (
          <ErrorState error={roles.error} />
        ) : (
          <ChangeRolesForm
            staff={s}
            roles={roles.data.data}
            onClose={() => setChangingRoles(false)}
            onDone={(next) => {
              void mutate({ data: next }, { revalidate: false });
              onChanged();
            }}
          />
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

export function StaffPage() {
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const q = useDebounced(search.trim());
  const list = useCursorList<StaffView>(can('admin.users.read') ? 'staff' : null, { q, status, role });
  const roles = useApi<RoleView[]>(can('admin.roles.read') ? 'roles' : null);

  if (!can('admin.users.read')) return <NoAccess what="staff accounts" />;

  return (
    <>
      <PageHeader
        title="Staff"
        description="People who can sign in to this console. Everyone must set up two-step verification. Changes to roles and status are recorded with a reason."
        actions={
          can('admin.users.manage') && can('admin.roles.read') ? (
            <Button onClick={() => setInviting(true)}>
              <Icon name="plus" className="size-4" /> Invite staff
            </Button>
          ) : undefined
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <label htmlFor="staff-search" className="sr-only">
            Search staff
          </label>
          <Icon
            name="search"
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id="staff-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or e-mail"
            className="pl-9"
            maxLength={80}
          />
        </div>
        <div>
          <label htmlFor="staff-status" className="sr-only">
            Status
          </label>
          <Select id="staff-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="INVITED">Invited</option>
            <option value="DISABLED">Disabled</option>
          </Select>
        </div>
        {roles.data && (
          <div>
            <label htmlFor="staff-role" className="sr-only">
              Role
            </label>
            <Select id="staff-role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Any role</option>
              {roles.data.data.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <Card className="p-0">
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} retry={() => void list.reload()} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No staff match" />
        ) : (
          <Table>
            <caption className="sr-only">Staff accounts</caption>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th className="hidden md:table-cell">Roles</Th>
                <Th>Status</Th>
                <Th className="hidden sm:table-cell">Two-step</Th>
                <Th className="hidden lg:table-cell">Last sign-in</Th>
                <Th>
                  <span className="sr-only">Open</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.name} seed={s.id} />
                      <div className="min-w-0">
                        <div className="truncate font-bold">{s.name}</div>
                        <div className="text-muted truncate text-xs">{s.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {s.roles.map((r) => (
                        <Tag key={r.key} tone="brand">
                          {r.name}
                        </Tag>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <Tag tone={statusTone(s.status)}>{humanize(s.status)}</Tag>
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <Tag tone={s.twoFactorEnabled ? 'good' : 'warn'}>{s.twoFactorEnabled ? 'On' : 'Not yet'}</Tag>
                  </Td>
                  <Td className="text-muted hidden lg:table-cell">
                    {s.lastLoginAt ? formatAgo(s.lastLoginAt) : 'Never'}
                  </Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => setOpenId(s.id)} aria-label={`Open ${s.name}`}>
                      Open
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={() => void list.loadMore()} />
      </Card>

      <StaffDrawer staffId={openId} onClose={() => setOpenId(null)} onChanged={() => void list.reload()} />

      <Dialog
        open={inviting}
        onClose={() => setInviting(false)}
        title="Invite a staff member"
        description="They get an e-mail with a temporary password."
      >
        {roles.data ? (
          <InviteForm roles={roles.data.data} onClose={() => setInviting(false)} onDone={() => void list.reload()} />
        ) : (
          <Loading rows={3} />
        )}
      </Dialog>
    </>
  );
}
