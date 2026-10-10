'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/client/api';
import { humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useApi } from '@/lib/client/use-api';
import type { PermissionGroup, RoleView } from '@/lib/types';
import { ConfirmDialog } from '../forms/confirm-dialog';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Field, Input, Textarea } from '../ui/field';
import { Icon } from '../ui/icon';
import { ErrorState, Loading, describeError } from '../ui/states';
import { Tag } from '../ui/tag';
import { useToast } from '../ui/toast';

const roleSchema = z.object({
  name: z.string().trim().min(3, 'Use at least 3 characters.').max(80, 'Use 80 characters or fewer.'),
  key: z
    .string()
    .trim()
    .regex(
      /^[a-z][a-z0-9_]{2,59}$/,
      'Lower-case letters, digits and underscores, starting with a letter (3 to 60 characters).',
    ),
  description: z.string().trim().max(300, 'Keep it under 300 characters.').optional(),
});

function RoleForm({
  role,
  catalogue,
  held,
  onClose,
  onDone,
}: {
  role: RoleView | null;
  catalogue: PermissionGroup[];
  /** Permissions the signed-in person holds: the most they can hand out. */
  held: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>(role?.permissions ?? []);
  const [permError, setPermError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof roleSchema>>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: role?.name ?? '', key: role?.key ?? '', description: role?.description ?? '' },
  });

  const submit = handleSubmit(async (values) => {
    setFailure(null);
    if (picked.length === 0) {
      setPermError('Choose at least one permission.');
      return;
    }
    setPermError(null);
    try {
      if (role) {
        await api.put(`roles/${role.id}`, {
          name: values.name,
          description: values.description ?? '',
          permissionKeys: picked,
        });
      } else {
        await api.post('roles', { ...values, description: values.description ?? '', permissionKeys: picked });
      }
      toast.success(role ? 'Role updated' : 'Role created');
      onDone();
      onClose();
    } catch (error) {
      setFailure(describeError(error));
    }
  });

  const toggle = (key: string, on: boolean) => setPicked((all) => (on ? [...all, key] : all.filter((k) => k !== key)));

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Name" error={errors.name?.message}>
        {(p) => <Input {...p} {...register('name')} />}
      </Field>
      <Field
        label="Key"
        hint={role ? 'The key cannot be changed.' : 'A short code used in the API, such as case_reviewer.'}
        error={errors.key?.message}
      >
        {(p) => <Input {...p} {...register('key')} disabled={!!role} className="font-mono" />}
      </Field>
      <Field label="What it is for" error={errors.description?.message}>
        {(p) => <Textarea {...p} {...register('description')} rows={2} />}
      </Field>

      <div>
        <p className="mb-1 text-[12.5px] font-bold">Permissions</p>
        <p className="text-muted mb-2 text-xs">
          You can only include permissions you hold yourself. A role cannot combine permissions the separation-of-duties
          rules keep apart (for example, approving a payout and creating one).
        </p>
        <div className="border-line max-h-72 space-y-3 overflow-y-auto rounded-xl border p-3">
          {catalogue.map((g) => (
            <fieldset key={g.module}>
              <legend className="text-muted mb-1 text-[11px] font-bold tracking-wider uppercase">
                {humanize(g.module)}
              </legend>
              {g.permissions.map((perm) => {
                const allowed = held.has(perm.key);
                return (
                  <label key={perm.key} className="flex items-start gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={picked.includes(perm.key)}
                      disabled={!allowed && !picked.includes(perm.key)}
                      onChange={(e) => toggle(perm.key, e.target.checked)}
                      className="accent-brand mt-0.5 size-4"
                    />
                    <span className={allowed ? '' : 'text-muted'}>
                      <span className="font-mono text-xs font-bold">{perm.key}</span>
                      <span className="text-muted block text-xs">{perm.description}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
        {permError && (
          <p role="alert" className="text-bad mt-1 text-xs font-semibold">
            {permError}
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
          {role ? 'Save role' : 'Create role'}
        </Button>
      </div>
    </form>
  );
}

export function RolesPage() {
  const { can, session } = useSession();
  const toast = useToast();
  const roles = useApi<RoleView[]>(can('admin.roles.read') ? 'roles' : null);
  const catalogue = useApi<PermissionGroup[]>(can('admin.roles.read') ? 'permissions' : null);
  const [editing, setEditing] = useState<RoleView | 'new' | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<RoleView | null>(null);
  const manage = can('admin.roles.manage');

  if (!can('admin.roles.read')) return <NoAccess what="roles" />;
  if (roles.isLoading || catalogue.isLoading) return <Loading rows={5} />;
  if (roles.error || !roles.data) return <ErrorState error={roles.error} retry={() => void roles.mutate()} />;
  if (catalogue.error || !catalogue.data)
    return <ErrorState error={catalogue.error} retry={() => void catalogue.mutate()} />;

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="What each role may do. Built-in roles are defined in code and cannot be edited; you can add custom roles within your own permissions."
        actions={
          manage ? (
            <Button onClick={() => setEditing('new')}>
              <Icon name="plus" className="size-4" /> New role
            </Button>
          ) : undefined
        }
      />

      <ul className="space-y-3">
        {roles.data.data.map((r) => {
          const open = expanded === r.id;
          return (
            <li key={r.id}>
              <Card className="p-0">
                <div className="flex flex-wrap items-center gap-3 px-[18px] py-3.5">
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-extrabold">{r.name}</h2>
                      <Tag tone={r.isSystem ? 'brand' : 'neutral'}>{r.isSystem ? 'Built in' : 'Custom'}</Tag>
                    </div>
                    {r.description && <p className="text-muted text-[12.5px]">{r.description}</p>}
                  </div>
                  <span className="text-muted text-[12.5px]">
                    {r.memberCount} {r.memberCount === 1 ? 'person' : 'people'} · {r.permissions.length} permissions
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={open}
                      onClick={() => setExpanded(open ? null : r.id)}
                    >
                      {open ? 'Hide permissions' : 'Show permissions'}
                    </Button>
                    {manage && !r.isSystem && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                          Edit
                        </Button>
                        {r.memberCount === 0 && (
                          <Button variant="bad" size="sm" onClick={() => setDeleting(r)}>
                            Delete
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {open && (
                  <div className="border-line border-t px-[18px] py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {r.permissions.map((p) => (
                        <span key={p} className="bg-soft rounded-md px-2 py-0.5 font-mono text-[11.5px]">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {deleting && (
        <ConfirmDialog
          open
          onClose={() => setDeleting(null)}
          title={`Delete the role "${deleting.name}"`}
          description="Nobody holds it. This cannot be undone; the deletion is recorded in the audit log."
          confirmLabel="Delete role"
          tone="bad"
          onConfirm={async () => {
            await api.delete(`roles/${deleting.id}`);
            toast.success('Role deleted');
            await roles.mutate();
          }}
        />
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New role' : `Edit ${editing?.name ?? 'role'}`}
      >
        {editing && (
          <RoleForm
            role={editing === 'new' ? null : editing}
            catalogue={catalogue.data.data}
            held={new Set(session?.admin.permissions ?? [])}
            onClose={() => setEditing(null)}
            onDone={() => void roles.mutate()}
          />
        )}
      </Dialog>
    </>
  );
}
