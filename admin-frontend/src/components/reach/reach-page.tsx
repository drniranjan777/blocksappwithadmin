'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { formatAgo, formatDateTime, formatNumber, humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useApi, useCursorList } from '@/lib/client/use-api';
import type { ReachHistoryRow, ReachVersionSummary } from '@/lib/types';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, CardTitle, PageHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Field, Input, Select } from '../ui/field';
import { Icon } from '../ui/icon';
import { EmptyState, ErrorState, Loading, LoadMore, describeError } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { LevelBadge, Tag, statusTone } from '../ui/tag';
import { useToast } from '../ui/toast';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ContentHistory() {
  const [kind, setKind] = useState<'reel' | 'post'>('reel');
  const [id, setId] = useState('');
  const valid = UUID.test(id.trim());
  const history = useApi<ReachHistoryRow[]>(valid ? `reach/content/${kind}/${id.trim()}` : null);

  return (
    <Card className="mt-6">
      <CardTitle
        title="Why is this at its level?"
        hint="Paste a post or reel id to see every score it has had, with the numbers each was computed from and the settings version used."
      />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="rh-kind" className="mb-1 block text-xs font-bold">
            Kind
          </label>
          <Select
            id="rh-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'reel' | 'post')}
            className="w-auto"
          >
            <option value="reel">Reel</option>
            <option value="post">Post</option>
          </Select>
        </div>
        <div className="min-w-[260px] flex-1 sm:max-w-md">
          <label htmlFor="rh-id" className="mb-1 block text-xs font-bold">
            Id
          </label>
          <Input
            id="rh-id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="01990000-0000-7000-8000-000000000001"
            className="font-mono"
            invalid={id !== '' && !valid}
          />
        </div>
      </div>
      {id !== '' && !valid && (
        <p className="text-bad mt-2 text-xs font-semibold">That is not an id: it is 36 characters with dashes.</p>
      )}
      {valid && (
        <div className="mt-4">
          {history.isLoading ? (
            <Loading rows={2} />
          ) : history.error ? (
            <ErrorState error={history.error} />
          ) : history.data && history.data.data.length === 0 ? (
            <EmptyState title="Not scored yet" hint="Scoring runs in the background after a view is counted." />
          ) : (
            <Table>
              <caption className="sr-only">Score history</caption>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Level</Th>
                  <Th>Score</Th>
                  <Th>Qualified reach</Th>
                  <Th className="hidden md:table-cell">Places</Th>
                  <Th className="hidden sm:table-cell">Excluded</Th>
                  <Th>Settings</Th>
                </tr>
              </thead>
              <tbody>
                {history.data?.data.map((r) => (
                  <Tr key={r.id}>
                    <Td className="text-[12.5px]">{formatDateTime(r.computedAt)}</Td>
                    <Td>
                      <LevelBadge level={r.level} />
                      {r.previousLevel !== r.level && r.previousLevel && (
                        <span className="text-muted ml-1 text-xs">from {humanize(r.previousLevel)}</span>
                      )}
                    </Td>
                    <Td className="font-bold">{r.score.toFixed(1)}</Td>
                    <Td>{formatNumber(r.qualifiedReach)}</Td>
                    <Td className="text-muted hidden text-xs md:table-cell">
                      {r.distinctDistricts} districts · {r.distinctStates} states · {r.distinctCountries} countries
                    </Td>
                    <Td className="hidden sm:table-cell">{formatNumber(r.excludedEvents)}</Td>
                    <Td>v{r.configVersion}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      )}
    </Card>
  );
}

export function ReachPage() {
  const { can } = useSession();
  const router = useRouter();
  const toast = useToast();
  const list = useCursorList<ReachVersionSummary>(can('reach.config.read') ? 'reach/config/versions' : null, {}, 20);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (!can('reach.config.read')) return <NoAccess what="the Reach engine settings" />;

  const draft = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ id: string }>('reach/config/versions', note.trim() ? { note: note.trim() } : {});
      toast.success('Draft created');
      router.push(`/reach/${res.data.id}`);
    } catch (error) {
      toast.error(describeError(error));
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Reach engine"
        description="Every weight, threshold and multiplier lives here, in numbered versions. A version that has been live is never edited: change a copy, have a second person look, then activate it."
        actions={
          can('reach.config.update') ? (
            <Button onClick={() => setCreating(true)}>
              <Icon name="plus" className="size-4" /> New draft
            </Button>
          ) : undefined
        }
      />

      <Card className="p-0">
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} retry={() => void list.reload()} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No versions yet" />
        ) : (
          <Table>
            <caption className="sr-only">Reach settings versions, newest first</caption>
            <thead>
              <tr>
                <Th>Version</Th>
                <Th>Status</Th>
                <Th className="hidden md:table-cell">Note</Th>
                <Th className="hidden sm:table-cell">Drafted by</Th>
                <Th className="hidden lg:table-cell">Went live</Th>
                <Th>
                  <span className="sr-only">Open</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((v) => (
                <Tr key={v.id}>
                  <Td className="font-extrabold">v{v.version}</Td>
                  <Td>
                    <Tag tone={statusTone(v.status)}>{humanize(v.status)}</Tag>
                  </Td>
                  <Td className="hidden max-w-xs text-[12.5px] md:table-cell">{v.note ?? '—'}</Td>
                  <Td className="hidden sm:table-cell">
                    {v.createdBy}
                    <div className="text-muted text-xs">{formatAgo(v.createdAt)}</div>
                  </Td>
                  <Td className="text-muted hidden lg:table-cell">
                    {v.activatedAt ? formatDateTime(v.activatedAt) : '—'}
                  </Td>
                  <Td>
                    <Link
                      href={`/reach/${v.id}`}
                      prefetch={false}
                      className="border-line hover:bg-soft inline-flex rounded-[10px] border bg-white px-2.5 py-[5px] text-xs font-bold"
                    >
                      Open
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={() => void list.loadMore()} />
      </Card>

      {can('reach.read') && <ContentHistory />}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New draft"
        description="A copy of the version that is live now. Change what you need, then ask someone else to activate it."
        busy={busy}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void draft();
          }}
          className="space-y-4"
        >
          <Field label="What is this change for? (optional)" hint="Shown in the version list.">
            {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Create draft
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
