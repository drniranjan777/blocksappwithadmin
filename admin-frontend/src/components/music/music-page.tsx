'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/client/api';
import { humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useDebounced } from '@/lib/client/use-debounced';
import { useCursorList } from '@/lib/client/use-api';
import type { MusicTrackView } from '@/lib/types';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Field, Input, Select } from '../ui/field';
import { Icon } from '../ui/icon';
import { EmptyState, ErrorState, Loading, LoadMore, describeError } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag, statusTone } from '../ui/tag';
import { useToast } from '../ui/toast';
import { CATEGORIES, formatDuration, rightsLabel } from './music-constants';
import { TrackDrawer } from './track-drawer';

const schema = z.object({
  title: z.string().trim().min(1, 'Enter the title.').max(160),
  artist: z.string().trim().min(1, 'Enter the artist.').max(120),
  language: z.string().trim().min(2, 'Enter the language, such as Hindi.').max(40),
  genre: z.string().trim().max(60).optional(),
});

function AddTrack({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const submit = handleSubmit(async (v) => {
    setFailure(null);
    if (picked.length > 5) {
      setFailure('Choose at most five categories.');
      return;
    }
    try {
      const res = await api.post<MusicTrackView>('music/tracks', {
        ...v,
        genre: v.genre || undefined,
        categories: picked,
      });
      toast.success('Track added as a draft');
      onDone(res.data.id);
      onClose();
    } catch (error) {
      setFailure(describeError(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Title" error={errors.title?.message}>
        {(p) => <Input {...p} {...register('title')} />}
      </Field>
      <Field label="Artist" error={errors.artist?.message}>
        {(p) => <Input {...p} {...register('artist')} />}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Language" error={errors.language?.message}>
          {(p) => <Input {...p} {...register('language')} />}
        </Field>
        <Field label="Genre (optional)" error={errors.genre?.message}>
          {(p) => <Input {...p} {...register('genre')} />}
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-[12.5px] font-bold">Shelves it appears on (up to five)</legend>
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {CATEGORIES.map((c) => {
            const on = picked.includes(c);
            return (
              <label
                key={c}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-bold ${on ? 'border-ink bg-ink text-white' : 'border-line bg-white'}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={(e) => setPicked((all) => (e.target.checked ? [...all, c] : all.filter((x) => x !== c)))}
                />
                {humanize(c)}
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className="text-muted text-xs">
        The track starts as a draft, licensed from someone else: the strictest case. It cannot go live until a licence
        is recorded or the licensing team changes who owns the rights.
      </p>
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
          Add track
        </Button>
      </div>
    </form>
  );
}

export function MusicPage() {
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const q = useDebounced(search.trim());
  const list = useCursorList<MusicTrackView>(can('music.read') ? 'music/tracks' : null, { q, status });

  if (!can('music.read')) return <NoAccess what="the music library" />;

  return (
    <>
      <PageHeader
        title="Music library"
        description="Every track creators can put under a reel, and the rights behind it. A track goes live only with audio, a country and a use chosen, and (for licensed music) a running licence that covers those countries. When a licence ends, the track comes down by itself."
        actions={
          can('music.manage') ? (
            <Button onClick={() => setAdding(true)}>
              <Icon name="plus" className="size-4" /> Add a track
            </Button>
          ) : undefined
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <label htmlFor="music-search" className="sr-only">
            Search tracks
          </label>
          <Icon
            name="search"
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id="music-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title or artist"
            className="pl-9"
            maxLength={60}
          />
        </div>
        <div>
          <label htmlFor="music-status" className="sr-only">
            Status
          </label>
          <Select id="music-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Available</option>
            <option value="SUSPENDED">Taken down</option>
            <option value="EXPIRED">Licence ended</option>
          </Select>
        </div>
      </div>

      <Card className="p-0">
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} retry={() => void list.reload()} />
        ) : list.items.length === 0 ? (
          <EmptyState
            title="No tracks match"
            hint={q || status ? 'Try clearing the filters.' : 'Add the first track to start the library.'}
          />
        ) : (
          <Table>
            <caption className="sr-only">Music tracks, newest first</caption>
            <thead>
              <tr>
                <Th>Track</Th>
                <Th>Status</Th>
                <Th className="hidden md:table-cell">Rights</Th>
                <Th className="hidden sm:table-cell">Length</Th>
                <Th className="hidden lg:table-cell">Countries</Th>
                <Th className="hidden lg:table-cell">In reels</Th>
                <Th>
                  <span className="sr-only">Open</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((t) => (
                <Tr key={t.id}>
                  <Td>
                    <div className="font-bold">{t.title}</div>
                    <div className="text-muted text-xs">
                      {t.artist} · {t.language}
                    </div>
                  </Td>
                  <Td>
                    <Tag tone={statusTone(t.status)}>{humanize(t.status)}</Tag>
                    {!t.hasAudio && <div className="text-muted mt-0.5 text-xs">No audio yet</div>}
                  </Td>
                  <Td className="hidden text-[12.5px] md:table-cell">{rightsLabel(t.rightsType)}</Td>
                  <Td className="hidden sm:table-cell">{formatDuration(t.durationMs)}</Td>
                  <Td className="hidden text-xs lg:table-cell">
                    {t.allowedCountries.length ? t.allowedCountries.join(', ') : '—'}
                  </Td>
                  <Td className="hidden lg:table-cell">{t.reelsCount}</Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => setOpenId(t.id)} aria-label={`Open ${t.title}`}>
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

      <TrackDrawer trackId={openId} onClose={() => setOpenId(null)} onChanged={() => void list.reload()} />
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a track"
        description="You add the details now and the audio next."
      >
        <AddTrack
          onClose={() => setAdding(false)}
          onDone={(id) => {
            void list.reload();
            setOpenId(id);
          }}
        />
      </Dialog>
    </>
  );
}
