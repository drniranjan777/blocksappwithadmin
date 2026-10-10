'use client';

import { useRef, useState } from 'react';
import { ApiError, api } from '@/lib/client/api';
import { formatDate, humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { uploadToSigned, type SignedUpload } from '@/lib/client/upload';
import { useApi } from '@/lib/client/use-api';
import type { MusicRights, MusicTrackView } from '@/lib/types';
import { ReasonDialog } from '../forms/reason-dialog';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Field, Input, Select } from '../ui/field';
import { ErrorState, Loading, describeError } from '../ui/states';
import { Tag, statusTone } from '../ui/tag';
import { useToast } from '../ui/toast';
import { Licences } from './licences';
import { RIGHTS, USES, formatDuration, parseCountries, rightsLabel } from './music-constants';

type Step = 'activate' | 'suspend' | 'restore' | 'rights' | 'where' | null;

function FileButton({
  label,
  accept,
  onFile,
  progress,
}: {
  label: string;
  accept: string;
  onFile: (file: File) => void;
  progress: number | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <Button variant="ghost" size="sm" loading={progress !== null} onClick={() => input.current?.click()}>
        {progress !== null ? `Uploading ${progress}%` : label}
      </Button>
    </>
  );
}

export function TrackDrawer({
  trackId,
  onClose,
  onChanged,
}: {
  trackId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<MusicTrackView>(trackId ? `music/tracks/${trackId}` : null);
  const [step, setStep] = useState<Step>(null);
  const [rights, setRights] = useState<MusicRights>('LICENSED');
  const [countries, setCountries] = useState('');
  const [uses, setUses] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ part: 'audio' | 'cover'; percent: number } | null>(null);
  const t = data?.data;
  const manage = can('music.manage');

  const refresh = (next?: MusicTrackView) => {
    if (next) void mutate({ data: next }, { revalidate: false });
    else void mutate();
    onChanged();
  };

  const upload = async (part: 'audio' | 'cover', file: File) => {
    if (!trackId) return;
    setProgress({ part, percent: 0 });
    try {
      const presigned = await api.post<{ upload: SignedUpload }>(`music/tracks/${trackId}/${part}/upload`, {
        contentType: file.type,
        sizeBytes: file.size,
      });
      await uploadToSigned(presigned.data.upload, file, (percent) => setProgress({ part, percent }));
      const done = await api.post<MusicTrackView>(`music/tracks/${trackId}/${part}/complete`, {});
      toast.success(part === 'audio' ? 'Audio saved and the 30-second preview made' : 'Cover saved');
      refresh(done.data);
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setProgress(null);
    }
  };

  const openWhere = () => {
    if (!t) return;
    setCountries(t.allowedCountries.join(', '));
    setUses(t.allowedUses);
    setStep('where');
  };

  return (
    <>
      <Dialog
        open={trackId !== null}
        onClose={onClose}
        title={t ? t.title : 'Track'}
        description={t ? `${t.artist} · ${t.language}` : undefined}
        variant="drawer"
      >
        {isLoading ? (
          <Loading rows={6} />
        ) : error || !t ? (
          <ErrorState error={error} retry={() => void mutate()} />
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Tag tone={statusTone(t.status)}>{humanize(t.status)}</Tag>
              <Tag tone={t.rightsType === 'RESTRICTED' ? 'bad' : 'brand'}>{rightsLabel(t.rightsType)}</Tag>
              {t.categories.map((c) => (
                <Tag key={c}>{humanize(c)}</Tag>
              ))}
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            {t.coverUrl && (
              <img
                src={t.coverUrl}
                alt={`Cover for ${t.title}`}
                width={120}
                height={120}
                className="mb-3 size-[120px] rounded-xl object-cover"
              />
            )}
            {t.previewUrl && (
              <figure className="mb-3">
                <figcaption className="text-muted mb-1 text-xs">
                  30-second preview. The full track is never sent to anyone but the server.
                </figcaption>
                {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- a 30-second music preview has no transcript */}
                <audio controls preload="none" src={t.previewUrl} className="w-full" />
              </figure>
            )}

            <dl className="mb-4">
              {[
                ['Length', formatDuration(t.durationMs)],
                ['Genre', t.genre ?? '—'],
                ['Allowed countries', t.allowedCountries.length ? t.allowedCountries.join(', ') : 'None chosen yet'],
                [
                  'Allowed for',
                  t.allowedUses.length
                    ? t.allowedUses.map((u) => USES.find((x) => x.value === u)?.label ?? u).join(', ')
                    : 'None chosen yet',
                ],
                [
                  'Licence ends',
                  t.licenceExpiresAt === 'perpetual'
                    ? 'Never'
                    : t.licenceExpiresAt
                      ? formatDate(t.licenceExpiresAt)
                      : '—',
                ],
                ['Used in reels', String(t.reelsCount)],
                ['Audio', t.hasAudio ? 'Uploaded' : 'Not uploaded yet'],
              ].map(([a, b]) => (
                <div key={a} className="border-line flex items-start justify-between gap-4 border-b py-2 last:border-0">
                  <dt className="text-muted text-[12.5px]">{a}</dt>
                  <dd className="text-right font-semibold">{b}</dd>
                </div>
              ))}
            </dl>

            {manage && (
              <div className="mb-3 flex flex-wrap gap-2">
                <FileButton
                  label={t.hasAudio ? 'Replace audio' : 'Upload audio'}
                  accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,audio/flac,audio/ogg"
                  progress={progress?.part === 'audio' ? progress.percent : null}
                  onFile={(f) => void upload('audio', f)}
                />
                <FileButton
                  label={t.coverUrl ? 'Replace cover' : 'Upload cover'}
                  accept="image/jpeg,image/png,image/webp"
                  progress={progress?.part === 'cover' ? progress.percent : null}
                  onFile={(f) => void upload('cover', f)}
                />
                <Button variant="ghost" size="sm" onClick={openWhere}>
                  Where it can be used
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {t.status === 'DRAFT' && manage && <Button onClick={() => setStep('activate')}>Make available</Button>}
              {t.status === 'ACTIVE' && manage && (
                <Button variant="bad" onClick={() => setStep('suspend')}>
                  Take down
                </Button>
              )}
              {(t.status === 'SUSPENDED' || t.status === 'EXPIRED') && manage && (
                <Button variant="good" onClick={() => setStep('restore')}>
                  Put back
                </Button>
              )}
              {can('music.licences.manage') && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRights(t.rightsType);
                    setStep('rights');
                  }}
                >
                  Change who owns the rights
                </Button>
              )}
            </div>
            {t.status === 'DRAFT' && (
              <p className="text-muted mt-2 text-xs">
                Needs audio, at least one country and use, and (for licensed music) a running licence that covers those
                countries.
              </p>
            )}

            <Licences trackId={t.id} />
          </div>
        )}
      </Dialog>

      {step === 'activate' && t && (
        <ReasonDialog
          open
          onClose={() => setStep(null)}
          title="Make this track available"
          description="Creators can use it in the countries and ways you chose."
          confirmLabel="Make available"
          tone="good"
          onConfirm={async (reason) => {
            const res = await api.post<MusicTrackView>(`music/tracks/${t.id}/activate`, { reason });
            toast.success('Track is available');
            refresh(res.data);
          }}
        />
      )}
      {step === 'suspend' && t && (
        <ReasonDialog
          open
          onClose={() => setStep(null)}
          title="Take this track down"
          description="Creators can no longer pick it. Reels already made with it stay, unless its rights are the reason it is coming down."
          confirmLabel="Take down"
          tone="bad"
          onConfirm={async (reason) => {
            const res = await api.post<MusicTrackView>(`music/tracks/${t.id}/suspend`, { reason });
            toast.success('Track taken down');
            refresh(res.data);
          }}
        />
      )}
      {step === 'restore' && t && (
        <ReasonDialog
          open
          onClose={() => setStep(null)}
          title="Put this track back"
          description="It must still be covered by a running licence for the countries it is offered in."
          confirmLabel="Put back"
          tone="good"
          onConfirm={async (reason) => {
            const res = await api.post<MusicTrackView>(`music/tracks/${t.id}/restore`, { reason });
            toast.success('Track is available again');
            refresh(res.data);
          }}
        />
      )}
      {step === 'rights' && t && (
        <ReasonDialog
          open
          onClose={() => setStep(null)}
          title="Who owns the rights?"
          description="A licensing decision. Moving a live track to rights that need a licence takes it down until one is running."
          confirmLabel="Save"
          onConfirm={async (reason) => {
            const res = await api.put<MusicTrackView>(`music/tracks/${t.id}/rights`, { rightsType: rights, reason });
            toast.success('Rights updated');
            refresh(res.data);
          }}
        >
          <Field label="Rights">
            {(p) => (
              <Select {...p} value={rights} onChange={(e) => setRights(e.target.value as MusicRights)}>
                {RIGHTS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </ReasonDialog>
      )}
      {step === 'where' && t && (
        <ReasonDialog
          open
          onClose={() => setStep(null)}
          title="Where this track can be used"
          description="Changing this is a licensing matter, so it needs a reason."
          confirmLabel="Save"
          onConfirm={async (reason) => {
            const list = parseCountries(countries);
            if (!list || list.length === 0) {
              throw new ApiError(
                400,
                'VALIDATION_FAILED',
                'Use two-letter country codes separated by commas, such as IN, US.',
              );
            }
            const res = await api.patch<MusicTrackView>(`music/tracks/${t.id}`, {
              allowedCountries: list,
              allowedUses: uses,
              reason,
            });
            toast.success('Saved');
            refresh(res.data);
          }}
        >
          <Field label="Countries" hint="Two-letter codes separated by commas.">
            {(p) => (
              <Input {...p} value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="IN, US, GB" />
            )}
          </Field>
          <fieldset className="mt-3">
            <legend className="mb-1 text-[12.5px] font-bold">Can be used for</legend>
            <div className="flex flex-wrap gap-3">
              {USES.map((u) => (
                <label key={u.value} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={uses.includes(u.value)}
                    onChange={(e) =>
                      setUses((all) => (e.target.checked ? [...all, u.value] : all.filter((x) => x !== u.value)))
                    }
                    className="accent-brand size-4"
                  />
                  {u.label}
                </label>
              ))}
            </div>
          </fieldset>
        </ReasonDialog>
      )}
    </>
  );
}
