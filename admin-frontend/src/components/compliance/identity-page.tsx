'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/client/api';
import { formatAgo, formatDateTime, humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useApi, useCursorList } from '@/lib/client/use-api';
import type { KycCase, KycRow } from '@/lib/types';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { Field, Select, Textarea } from '../ui/field';
import { EmptyState, ErrorState, Loading, LoadMore, describeError } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag, statusTone } from '../ui/tag';
import { useToast } from '../ui/toast';

const STATUSES = ['UNDER_REVIEW', 'PENDING', 'ACTION_REQUIRED', 'VERIFIED', 'REJECTED', 'EXPIRED'];

const REJECTION_LABELS: Record<string, string> = {
  ILLEGIBLE: 'The document cannot be read',
  DETAILS_MISMATCH: 'Details do not match',
  DOCUMENT_EXPIRED: 'The document has expired',
  NOT_ACCEPTED: 'This kind of document is not accepted',
  SUSPECTED_FRAUD: 'Suspected fraud',
};

type Decision = 'APPROVE' | 'REJECT' | 'REQUEST_INFO';

const decisionSchema = z.object({
  reasonCode: z.string().optional(),
  note: z
    .string()
    .trim()
    .min(10, 'Write at least 10 characters about what you checked.')
    .max(1000, 'Keep the note to 1,000 characters or fewer.'),
});

function DecisionForm({
  caseId,
  decision,
  onClose,
  onDone,
}: {
  caseId: string;
  decision: Decision;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof decisionSchema>>({ resolver: zodResolver(decisionSchema) });

  const submit = handleSubmit(async ({ reasonCode, note }) => {
    setFailure(null);
    if (decision === 'REJECT' && !reasonCode) {
      setError('reasonCode', { message: 'Choose why it is being rejected. The person sees only this reason.' });
      return;
    }
    try {
      await api.post(`kyc/cases/${caseId}/decision`, {
        decision,
        note,
        ...(decision === 'REJECT' ? { reasonCode } : {}),
      });
      toast.success(
        decision === 'APPROVE'
          ? 'Identity approved'
          : decision === 'REJECT'
            ? 'Identity rejected'
            : 'More information requested',
      );
      onDone();
      onClose();
    } catch (error) {
      setFailure(describeError(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {decision === 'REJECT' && (
        <Field label="Reason shown to the person" error={errors.reasonCode?.message}>
          {(p) => (
            <Select {...p} {...register('reasonCode')} defaultValue="">
              <option value="" disabled>
                Choose a reason
              </option>
              {Object.entries(REJECTION_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Field
        label="Your note"
        hint="What you checked and why. Recorded in the audit log; the person does not see it."
        error={errors.note?.message}
      >
        {(p) => <Textarea {...p} {...register('note')} rows={3} maxLength={1000} />}
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
        <Button
          type="submit"
          variant={decision === 'REJECT' ? 'bad' : decision === 'APPROVE' ? 'good' : 'primary'}
          loading={isSubmitting}
        >
          {decision === 'APPROVE' ? 'Approve' : decision === 'REJECT' ? 'Reject' : 'Ask for more'}
        </Button>
      </div>
    </form>
  );
}

function CaseDrawer({
  caseId,
  onClose,
  onChanged,
}: {
  caseId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useSession();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useApi<KycCase>(caseId ? `kyc/cases/${caseId}` : null);
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const k = data?.data;

  const view = async (docId: string) => {
    if (!caseId) return;
    setOpening(docId);
    try {
      const res = await api.get<{ url: string; expiresInSeconds: number }>(
        `kyc/cases/${caseId}/documents/${docId}/file`,
      );
      // A short-lived address for the scan; opened in its own tab, away from this page.
      window.open(res.data.url, '_blank', 'noopener,noreferrer');
      toast.success(`Opened. The link works for ${res.data.expiresInSeconds} seconds. This view is recorded.`);
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setOpening(null);
    }
  };

  return (
    <>
      <Dialog
        open={caseId !== null}
        onClose={onClose}
        title={k ? `Identity check: ${k.legalName ?? 'Unnamed'}` : 'Identity check'}
        description={k ? `${humanize(k.subject)} · submitted ${formatDateTime(k.submittedAt)}` : undefined}
        variant="drawer"
      >
        {isLoading ? (
          <Loading rows={5} />
        ) : error || !k ? (
          <ErrorState error={error} retry={() => void mutate()} />
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Tag tone={statusTone(k.status)}>{humanize(k.status)}</Tag>
              {k.reasonCode && <Tag tone="warn">{REJECTION_LABELS[k.reasonCode] ?? humanize(k.reasonCode)}</Tag>}
            </div>
            <p className="text-muted mb-3 text-xs">
              Names and numbers are masked here. Only the last four characters of an identifier are ever kept in
              readable form.
            </p>
            <dl className="mb-4">
              {[
                ['Legal name', k.legalName ?? '—'],
                ['PAN', k.pan ?? '—'],
                ...(k.businessType ? [['Business type', humanize(k.businessType)]] : []),
                ['Account', k.userId],
                ['Provider reference', k.providerReference ?? '—'],
                ['Reviewed', k.reviewedAt ? formatDateTime(k.reviewedAt) : 'Not yet'],
                ['Valid until', k.expiresAt ? formatDateTime(k.expiresAt) : '—'],
              ].map(([a, b]) => (
                <div key={a} className="border-line flex items-start justify-between gap-4 border-b py-2 last:border-0">
                  <dt className="text-muted text-[12.5px]">{a}</dt>
                  <dd className="text-right font-semibold break-all">{b}</dd>
                </div>
              ))}
            </dl>
            {can('earnings.read') && (
              <p className="mb-3 text-[13px]">
                <Link href={`/earnings?creator=${k.userId}`} className="text-brand font-bold hover:underline">
                  Open this creator&apos;s earnings →
                </Link>
              </p>
            )}

            <h3 className="mb-2 text-[14px] font-extrabold">Documents</h3>
            <ul className="space-y-2">
              {k.documents.map((d) => (
                <li key={d.id} className="bg-soft flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="font-bold">{humanize(d.type)}</div>
                    <div className="text-muted text-xs">
                      {humanize(d.role)} · {d.number ?? 'no number'} · {humanize(d.status)}
                      {d.rejectionCode && ` · ${REJECTION_LABELS[d.rejectionCode] ?? humanize(d.rejectionCode)}`}
                    </div>
                  </div>
                  {d.hasScan && can('kyc.documents.view') && (
                    <Button variant="ghost" size="sm" loading={opening === d.id} onClick={() => void view(d.id)}>
                      View scan
                    </Button>
                  )}
                </li>
              ))}
              {k.documents.length === 0 && <li className="text-muted text-[13px]">No documents.</li>}
            </ul>
            {can('kyc.documents.view') && (
              <p className="text-muted mt-2 text-xs">
                Each time you open a scan, who looked and when is written to the protected-data audit trail.
              </p>
            )}

            {k.status === 'UNDER_REVIEW' && can('kyc.review') && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="good" onClick={() => setDeciding('APPROVE')}>
                  Approve
                </Button>
                <Button variant="ghost" onClick={() => setDeciding('REQUEST_INFO')}>
                  Ask for more
                </Button>
                <Button variant="bad" onClick={() => setDeciding('REJECT')}>
                  Reject
                </Button>
              </div>
            )}
            {k.status !== 'UNDER_REVIEW' && (
              <p className="text-muted mt-4 text-xs">
                Only a case the identity provider sent for a person to review can be decided here. Nobody can mark a
                person verified by hand.
              </p>
            )}

            {k.reviews.length > 0 && (
              <section className="mt-6" aria-labelledby="kyc-reviews">
                <h3 id="kyc-reviews" className="mb-2 text-[14px] font-extrabold">
                  Decisions so far
                </h3>
                <ul className="space-y-2">
                  {k.reviews.map((r, i) => (
                    <li key={i} className="bg-soft rounded-xl px-3 py-2.5 text-[13px]">
                      <b>{humanize(r.decision)}</b>
                      {r.reasonCode ? ` · ${REJECTION_LABELS[r.reasonCode] ?? humanize(r.reasonCode)}` : ''}
                      <p className="mt-0.5 whitespace-pre-wrap">{r.note}</p>
                      <p className="text-muted mt-0.5 text-xs">
                        {r.by} · {formatAgo(r.at)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Dialog>

      {deciding && caseId && (
        <Dialog
          open
          onClose={() => setDeciding(null)}
          title={
            deciding === 'APPROVE'
              ? 'Approve this identity'
              : deciding === 'REJECT'
                ? 'Reject this identity'
                : 'Ask for more information'
          }
        >
          <DecisionForm
            caseId={caseId}
            decision={deciding}
            onClose={() => setDeciding(null)}
            onDone={() => {
              void mutate();
              onChanged();
            }}
          />
        </Dialog>
      )}
    </>
  );
}

export function IdentityPage() {
  const { can } = useSession();
  const [status, setStatus] = useState('UNDER_REVIEW');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useCursorList<KycRow>(can('kyc.read') ? 'kyc/cases' : null, { status });

  if (!can('kyc.read')) return <NoAccess what="identity checks" />;

  return (
    <>
      <PageHeader
        title="Identity checks"
        description="People verifying who they are so they can be paid. The identity provider decides; a person here looks only at cases it could not settle. Aadhaar is never collected or stored."
      />
      <div className="mb-3">
        <label htmlFor="kyc-status" className="sr-only">
          Status
        </label>
        <Select id="kyc-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </div>
      <Card className="p-0">
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} retry={() => void list.reload()} />
        ) : list.items.length === 0 ? (
          <EmptyState title={`Nothing is ${humanize(status).toLowerCase()}`} />
        ) : (
          <Table>
            <caption className="sr-only">Identity cases, newest first</caption>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th className="hidden sm:table-cell">Kind</Th>
                <Th className="hidden md:table-cell">PAN</Th>
                <Th>Status</Th>
                <Th className="hidden md:table-cell">Documents</Th>
                <Th className="hidden lg:table-cell">Submitted</Th>
                <Th>
                  <span className="sr-only">Open</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-bold">{r.legalName ?? '—'}</Td>
                  <Td className="hidden sm:table-cell">{humanize(r.subject)}</Td>
                  <Td className="hidden font-mono text-xs md:table-cell">{r.pan ?? '—'}</Td>
                  <Td>
                    <Tag tone={statusTone(r.status)}>{humanize(r.status)}</Tag>
                  </Td>
                  <Td className="hidden md:table-cell">{r.documents}</Td>
                  <Td className="text-muted hidden lg:table-cell">{formatAgo(r.submittedAt)}</Td>
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpenId(r.id)}
                      aria-label={`Open case for ${r.legalName ?? 'this person'}`}
                    >
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
      <CaseDrawer caseId={openId} onClose={() => setOpenId(null)} onChanged={() => void list.reload()} />
    </>
  );
}
