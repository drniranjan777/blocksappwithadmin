'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/client/api';
import { formatDate, humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { uploadToSigned, type SignedUpload } from '@/lib/client/upload';
import { useApi } from '@/lib/client/use-api';
import type { MusicLicenceView } from '@/lib/types';
import { ReasonDialog } from '../forms/reason-dialog';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Field, Input, Select, Textarea } from '../ui/field';
import { ErrorState, Loading, describeError } from '../ui/states';
import { Tag, statusTone } from '../ui/tag';
import { useToast } from '../ui/toast';
import { RIGHTS, parseCountries, rightsLabel } from './music-constants';

const schema = z
  .object({
    licensor: z.string().trim().min(2, 'Who is licensing it?').max(160),
    reference: z.string().trim().min(2, 'Enter the contract reference.').max(120),
    rightsType: z.string().min(1),
    territories: z.string().trim().min(2, 'List at least one country, such as IN.'),
    startsAt: z.string().min(1, 'Choose the start date.'),
    expiresAt: z.string().optional(),
    restrictionsNote: z.string().trim().max(500).optional(),
  })
  .refine((v) => parseCountries(v.territories) !== null, {
    path: ['territories'],
    message: 'Use two-letter country codes separated by commas, such as IN, US. (WW means worldwide.)',
  })
  .refine((v) => !v.expiresAt || !v.startsAt || v.expiresAt > v.startsAt, {
    path: ['expiresAt'],
    message: 'It must end after it starts.',
  });

function LicenceForm({ trackId, onClose, onDone }: { trackId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { rightsType: 'LICENSED' } });

  const submit = handleSubmit(async (v) => {
    setFailure(null);
    try {
      await api.post(`music/tracks/${trackId}/licences`, {
        licensor: v.licensor,
        reference: v.reference,
        rightsType: v.rightsType,
        territories: parseCountries(v.territories),
        startsAt: v.startsAt,
        ...(v.expiresAt ? { expiresAt: v.expiresAt } : {}),
        ...(v.restrictionsNote ? { restrictionsNote: v.restrictionsNote } : {}),
      });
      toast.success('Licence recorded (not running yet)');
      onDone();
      onClose();
    } catch (error) {
      setFailure(describeError(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Licensor" error={errors.licensor?.message}>
        {(p) => <Input {...p} {...register('licensor')} />}
      </Field>
      <Field
        label="Contract reference"
        hint="For finding the contract in your own records. Do not type terms or amounts here."
        error={errors.reference?.message}
      >
        {(p) => <Input {...p} {...register('reference')} />}
      </Field>
      <Field label="Kind of rights" error={errors.rightsType?.message}>
        {(p) => (
          <Select {...p} {...register('rightsType')}>
            {RIGHTS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label="Countries"
        hint="Two-letter codes separated by commas. WW means anywhere."
        error={errors.territories?.message}
      >
        {(p) => <Input {...p} {...register('territories')} placeholder="IN, US, GB" />}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Starts" error={errors.startsAt?.message}>
          {(p) => <Input {...p} {...register('startsAt')} type="date" />}
        </Field>
        <Field label="Ends" hint="Leave empty if it never ends." error={errors.expiresAt?.message}>
          {(p) => <Input {...p} {...register('expiresAt')} type="date" />}
        </Field>
      </div>
      <Field label="Restrictions (optional)" error={errors.restrictionsNote?.message}>
        {(p) => <Textarea {...p} {...register('restrictionsNote')} rows={2} maxLength={500} />}
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
          Record licence
        </Button>
      </div>
    </form>
  );
}

function DocumentUpload({ licence, onDone }: { licence: MusicLicenceView; onDone: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const send = async (file: File) => {
    setProgress(0);
    try {
      const presigned = await api.post<{ upload: SignedUpload }>(`music/licences/${licence.id}/document/upload`, {
        contentType: file.type,
        sizeBytes: file.size,
      });
      await uploadToSigned(presigned.data.upload, file, setProgress);
      await api.post(`music/licences/${licence.id}/document/complete`);
      toast.success('Document saved');
      onDone();
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="sr-only"
        aria-label={`Upload the signed licence for ${licence.licensor}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void send(file);
        }}
      />
      <Button variant="ghost" size="sm" loading={progress !== null} onClick={() => input.current?.click()}>
        {progress !== null ? `Uploading ${progress}%` : licence.hasDocument ? 'Replace document' : 'Upload signed copy'}
      </Button>
    </>
  );
}

export function Licences({ trackId }: { trackId: string }) {
  const { can } = useSession();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<MusicLicenceView[]>(
    can('music.licences.read') ? `music/tracks/${trackId}/licences` : null,
  );
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState<{ licence: MusicLicenceView; kind: 'activate' | 'revoke' } | null>(null);

  if (!can('music.licences.read')) return null;

  const openDocument = async (l: MusicLicenceView) => {
    try {
      const res = await api.get<{ url: string; expiresInSeconds: number }>(`music/licences/${l.id}/document`);
      window.open(res.data.url, '_blank', 'noopener,noreferrer');
      toast.success(`Opened. The link works for ${res.data.expiresInSeconds} seconds. This view is recorded.`);
    } catch (e) {
      toast.error(describeError(e));
    }
  };

  return (
    <section className="mt-6" aria-labelledby="licences-title">
      <div className="mb-2 flex items-center justify-between">
        <h3 id="licences-title" className="text-[14px] font-extrabold">
          Licences
        </h3>
        {can('music.licences.manage') && (
          <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
            Record a licence
          </Button>
        )}
      </div>
      {isLoading ? (
        <Loading rows={2} />
      ) : error || !data ? (
        <ErrorState error={error} />
      ) : data.data.length === 0 ? (
        <p className="text-muted text-[13px]">
          No licence is recorded. Music that needs one cannot go live without it.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.data.map((l) => (
            <li key={l.id} className="bg-soft rounded-xl px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <b>{l.licensor}</b>
                <Tag tone={statusTone(l.status)}>{humanize(l.status)}</Tag>
                <Tag>{rightsLabel(l.rightsType)}</Tag>
              </div>
              <p className="text-muted mt-1 text-xs">
                Ref {l.reference} · {l.territories.join(', ')} · {formatDate(l.startsAt)} to{' '}
                {l.expiresAt ? formatDate(l.expiresAt) : 'no end date'}
              </p>
              {l.restrictionsNote && <p className="mt-1 text-xs">{l.restrictionsNote}</p>}
              {can('music.licences.manage') && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {l.status === 'PENDING' && (
                    <Button variant="good" size="sm" onClick={() => setActing({ licence: l, kind: 'activate' })}>
                      Start licence
                    </Button>
                  )}
                  {(l.status === 'ACTIVE' || l.status === 'PENDING') && (
                    <Button variant="bad" size="sm" onClick={() => setActing({ licence: l, kind: 'revoke' })}>
                      Revoke
                    </Button>
                  )}
                  <DocumentUpload licence={l} onDone={() => void mutate()} />
                  {l.hasDocument && (
                    <Button variant="ghost" size="sm" onClick={() => void openDocument(l)}>
                      View signed copy
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Record a licence"
        description="It starts as pending. Start it once the contract is in force."
      >
        <LicenceForm trackId={trackId} onClose={() => setCreating(false)} onDone={() => void mutate()} />
      </Dialog>

      {acting && (
        <ReasonDialog
          open
          onClose={() => setActing(null)}
          title={acting.kind === 'activate' ? 'Start this licence' : 'Revoke this licence'}
          description={
            acting.kind === 'activate'
              ? 'Only on or after its start date. Tracks that depend on it can then go live.'
              : 'Tracks that depend only on this licence are taken down at once.'
          }
          confirmLabel={acting.kind === 'activate' ? 'Start licence' : 'Revoke licence'}
          tone={acting.kind === 'activate' ? 'good' : 'bad'}
          onConfirm={async (reason) => {
            await api.post(`music/licences/${acting.licence.id}/${acting.kind}`, { reason });
            toast.success(acting.kind === 'activate' ? 'Licence started' : 'Licence revoked');
            await mutate();
          }}
        />
      )}
    </section>
  );
}
