'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatDateTime, humanize } from '@/lib/client/format';
import { problemsFrom, type Problem } from '@/lib/client/problems';
import { useSession } from '@/lib/client/session';
import { useApi } from '@/lib/client/use-api';
import {
  REACH_GROUPS,
  fieldFor,
  getPath,
  parseFormValue,
  setPath,
  showConfigValue,
  toFormValue,
  type FieldDef,
  type FormValue,
} from '@/lib/reach-fields';
import type { ReachVersionFull } from '@/lib/types';
import { ConfirmDialog } from '../forms/confirm-dialog';
import { ReasonDialog } from '../forms/reason-dialog';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, CardTitle, PageHeader } from '../ui/card';
import { Input, Switch } from '../ui/field';
import { ErrorState, Loading, describeError } from '../ui/states';
import { Tag, statusTone } from '../ui/tag';
import { useToast } from '../ui/toast';

function labelFor(path: string): string {
  return fieldFor(path)?.label ?? humanize(path.split('.').pop() ?? path);
}

function ReadOnlyGroups({ config }: { config: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {REACH_GROUPS.map((g) => (
        <Card key={g.id}>
          <CardTitle title={g.title} hint={g.hint} />
          <dl>
            {g.fields.map((d) => (
              <div
                key={d.path}
                className="border-line flex items-start justify-between gap-4 border-b py-1.5 last:border-0"
              >
                <dt className="text-muted text-[12.5px]">{d.label}</dt>
                <dd className="font-bold">{showConfigValue(getPath(config, d.path), d.kind)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </div>
  );
}

function Editor({ version, onSaved }: { version: ReachVersionFull; onSaved: (next: ReachVersionFull) => void }) {
  const toast = useToast();
  const initial = useMemo(() => {
    const out: Record<string, FormValue> = {};
    for (const g of REACH_GROUPS) for (const d of g.fields) out[d.path] = toFormValue(d, version.config);
    return out;
  }, [version.config]);
  const [values, setValues] = useState<Record<string, FormValue>>(initial);
  const [note, setNote] = useState(version.note ?? '');
  const [local, setLocal] = useState<Record<string, string>>({});
  const [server, setServer] = useState<Problem[]>([]);
  const [saving, setSaving] = useState(false);
  const dirty = note !== (version.note ?? '') || Object.keys(initial).some((k) => initial[k] !== values[k]);

  const set = (path: string, v: FormValue) => setValues((all) => ({ ...all, [path]: v }));

  const total = (paths: string[]) =>
    paths.reduce((sum, p) => {
      const n = Number(values[p]);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

  const save = async () => {
    setServer([]);
    const errors: Record<string, string> = {};
    let doc: Record<string, unknown> = version.config;
    for (const g of REACH_GROUPS) {
      for (const d of g.fields) {
        const parsed = parseFormValue(d, values[d.path] ?? '');
        if (!parsed.ok) errors[d.path] = parsed.message;
        else doc = setPath(doc, d.path, parsed.value);
      }
    }
    setLocal(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Some numbers need fixing.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.put<ReachVersionFull>(`reach/config/versions/${version.id}`, {
        config: doc,
        note: note.trim() || undefined,
      });
      toast.success('Draft saved');
      onSaved(res.data);
    } catch (error) {
      setServer(problemsFrom(error, describeError));
    } finally {
      setSaving(false);
    }
  };

  const hasProblem = (d: FieldDef) => server.some((p) => p.path === d.path);

  return (
    <div>
      {server.length > 0 && (
        <div role="alert" className="border-bad/30 bg-bad-bg mb-4 rounded-2xl border p-4">
          <p className="text-bad mb-1 font-extrabold">This draft cannot be saved yet. Fix these and save again:</p>
          <ul className="text-bad list-disc space-y-0.5 pl-5 text-[13px]">
            {server.map((p, i) => (
              <li key={i}>
                {p.path ? <b>{labelFor(p.path)}: </b> : null}
                {p.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="rv-note" className="mb-1 block text-[12.5px] font-bold">
          What is this change for?
        </label>
        <Input id="rv-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {REACH_GROUPS.map((g) => {
          const sum = g.mustTotal100 ? total(g.fields.map((d) => d.path)) : null;
          const ok = sum !== null && Math.abs(sum - 100) < 0.0001;
          return (
            <Card key={g.id}>
              <CardTitle
                title={g.title}
                hint={g.hint}
                action={
                  sum !== null ? (
                    <Tag tone={ok ? 'good' : 'bad'}>Total {Math.round(sum * 10000) / 10000}%</Tag>
                  ) : undefined
                }
              />
              <div className="space-y-3">
                {g.fields.map((d) => {
                  const id = `rf-${d.path}`;
                  const message = local[d.path] ?? server.find((p) => p.path === d.path)?.message;
                  if (d.kind === 'bool') {
                    return (
                      <div key={d.path} className="flex items-center justify-between gap-3">
                        <label htmlFor={id} className="text-[13px] font-semibold">
                          {d.label}
                        </label>
                        <Switch checked={values[d.path] === true} onChange={(v) => set(d.path, v)} label={d.label} />
                      </div>
                    );
                  }
                  return (
                    <div key={d.path}>
                      <div className="flex items-center justify-between gap-3">
                        <label htmlFor={id} className="text-[13px] font-semibold">
                          {d.label}
                        </label>
                        <div className="flex items-center gap-1.5">
                          <Input
                            id={id}
                            inputMode="decimal"
                            value={String(values[d.path] ?? '')}
                            onChange={(e) => set(d.path, e.target.value)}
                            invalid={!!message || hasProblem(d)}
                            aria-describedby={message ? `${id}-msg` : undefined}
                            className="w-24 text-right font-bold"
                          />
                          {d.kind === 'percent' && <span className="text-muted">%</span>}
                        </div>
                      </div>
                      {d.hint && <p className="text-muted text-xs">{d.hint}</p>}
                      {message && (
                        <p id={`${id}-msg`} role="alert" className="text-bad text-xs font-semibold">
                          {message}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="border-line sticky bottom-0 mt-4 flex items-center justify-end gap-3 rounded-2xl border bg-white/95 p-3 shadow-lg backdrop-blur">
        <span className="text-muted mr-auto text-[12.5px]">
          {dirty ? 'You have unsaved changes.' : 'No changes yet.'}
        </span>
        <Button
          variant="ghost"
          disabled={!dirty || saving}
          onClick={() => {
            setValues(initial);
            setNote(version.note ?? '');
            setLocal({});
            setServer([]);
          }}
        >
          Reset
        </Button>
        <Button loading={saving} disabled={!dirty} onClick={() => void save()}>
          Save draft
        </Button>
      </div>
    </div>
  );
}

export function ReachVersionPage({ id }: { id: string }) {
  const { can } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<ReachVersionFull>(
    can('reach.config.read') ? `reach/config/versions/${id}` : null,
  );
  const [activating, setActivating] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  if (!can('reach.config.read')) return <NoAccess what="the Reach engine settings" />;
  if (isLoading) return <Loading rows={6} />;
  if (error || !data) return <ErrorState error={error} retry={() => void mutate()} />;
  const v = data.data;
  const draft = v.status === 'DRAFT';
  const editable = draft && can('reach.config.update');

  return (
    <>
      <p className="mb-2">
        <Link href="/reach" className="text-brand text-[13px] font-bold hover:underline">
          ← All versions
        </Link>
      </p>
      <PageHeader
        title={`Version ${v.version}`}
        description={
          <>
            <Tag tone={statusTone(v.status)}>{humanize(v.status)}</Tag>{' '}
            <span className="ml-1">
              Drafted by {v.createdBy} on {formatDateTime(v.createdAt)}
              {v.activatedAt ? `, live since ${formatDateTime(v.activatedAt)}` : ''}.
            </span>
            {v.note && <span className="mt-1 block">“{v.note}”</span>}
          </>
        }
        actions={
          draft ? (
            <>
              {editable && (
                <Button variant="bad" onClick={() => setDiscarding(true)}>
                  Discard draft
                </Button>
              )}
              {can('reach.config.activate') && <Button onClick={() => setActivating(true)}>Activate</Button>}
            </>
          ) : undefined
        }
      />

      {draft && (
        <Card className="mb-4">
          <CardTitle title="What this changes" hint="Compared with the version that is live now." />
          {!v.changesFromActive || v.changesFromActive.length === 0 ? (
            <p className="text-muted text-[13px]">Nothing yet: this draft is identical to the live version.</p>
          ) : (
            <ul className="space-y-1">
              {v.changesFromActive.map((c) => {
                const def = fieldFor(c.path);
                return (
                  <li key={c.path} className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
                    <span className="min-w-[220px] font-semibold">{def?.label ?? c.path}</span>
                    <span className="text-muted line-through">{showConfigValue(c.from, def?.kind)}</span>
                    <span aria-hidden="true">→</span>
                    <b className={cn('text-brand-ink')}>{showConfigValue(c.to, def?.kind)}</b>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-muted mt-3 text-xs">
            Activating needs a reason and has to be done by a different person from the one who drafted it. Content is
            then re-scored under the new numbers in the background.
          </p>
        </Card>
      )}

      {editable ? (
        <Editor
          key={v.id + JSON.stringify(v.config)}
          version={v}
          onSaved={(next) => void mutate({ data: next }, { revalidate: false })}
        />
      ) : (
        <ReadOnlyGroups config={v.config} />
      )}

      {activating && (
        <ReasonDialog
          open
          onClose={() => setActivating(false)}
          title={`Activate version ${v.version}`}
          description="The version that is live now is archived, not changed. Scores and rewards use this one from now on."
          confirmLabel="Activate"
          onConfirm={async (reason) => {
            await api.post(`reach/config/versions/${v.id}/activate`, { reason });
            toast.success(`Version ${v.version} is live`);
            await mutate();
          }}
        />
      )}
      {discarding && (
        <ConfirmDialog
          open
          onClose={() => setDiscarding(false)}
          title="Discard this draft"
          description="The draft is deleted. Versions that have been live are never deleted."
          confirmLabel="Discard"
          tone="bad"
          onConfirm={async () => {
            await api.delete(`reach/config/versions/${v.id}`);
            toast.success('Draft discarded');
            router.push('/reach');
          }}
        />
      )}
    </>
  );
}
