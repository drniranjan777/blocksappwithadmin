'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/client/cn';
import { formatAgo, formatNumber, humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useCursorList } from '@/lib/client/use-api';
import type { MediaJob, ReviewItem } from '@/lib/types';
import { ReasonDialog } from '../forms/reason-dialog';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Select } from '../ui/field';
import { EmptyState, ErrorState, Loading, LoadMore, describeError } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag, statusTone } from '../ui/tag';
import { useToast } from '../ui/toast';

type Tab = 'review' | 'jobs';
type Decision = { item: ReviewItem; decision: 'APPROVE' | 'REJECT' };

function ReviewCard({
  item,
  canDecide,
  onDecide,
}: {
  item: ReviewItem;
  canDecide: boolean;
  onDecide: (d: Decision['decision']) => void;
}) {
  const media = item.media;
  const video = media?.kind === 'VIDEO';
  return (
    <li className="border-line overflow-hidden rounded-2xl border bg-white">
      <div className="bg-ink/5 grid aspect-[4/3] place-items-center">
        {!media ? (
          <p className="text-muted text-[13px]">No preview available</p>
        ) : video && media.url ? (
          // Staff are checking what was uploaded: user videos have no caption track to offer.
          // oxlint-disable-next-line jsx-a11y/media-has-caption
          <video
            controls
            preload="none"
            poster={media.posterUrl ?? undefined}
            src={media.url}
            className="size-full object-contain"
            aria-label={`Video from ${item.ownerId}`}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.thumbnailUrl ?? media.url ?? ''}
            alt={`Uploaded for ${humanize(item.purpose).toLowerCase()}`}
            loading="lazy"
            className="size-full object-contain"
          />
        )}
      </div>
      <div className="space-y-2 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tone="brand">{video ? 'Video' : 'Photo'}</Tag>
          <Tag>{humanize(item.purpose)}</Tag>
          {media?.width && media.height && (
            <span className="text-muted text-xs">
              {media.width}×{media.height}
            </span>
          )}
        </div>
        <p className="text-muted text-xs">
          Uploaded by <span className="font-mono">{item.ownerId.slice(0, 8)}…</span> · ready{' '}
          {formatAgo(item.processedAt)}
        </p>
        {canDecide && (
          <div className="flex gap-2 pt-1">
            <Button variant="good" size="sm" className="flex-1" onClick={() => onDecide('APPROVE')}>
              Approve
            </Button>
            <Button variant="bad" size="sm" className="flex-1" onClick={() => onDecide('REJECT')}>
              Refuse
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function ReviewQueue() {
  const { can } = useSession();
  const toast = useToast();
  const list = useCursorList<ReviewItem>('media/review', {}, 12);
  const [pending, setPending] = useState<Decision | null>(null);

  if (list.loading) return <Loading rows={4} />;
  if (list.error) return <ErrorState error={list.error} retry={() => void list.reload()} />;
  if (list.items.length === 0) {
    return (
      <EmptyState
        title="Nothing is waiting for review"
        hint="Photos and videos that the automatic checks could not clear appear here, oldest first."
      />
    );
  }

  return (
    <>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.items.map((item) => (
          <ReviewCard
            key={item.id}
            item={item}
            canDecide={can('content.moderate')}
            onDecide={(decision) => setPending({ item, decision })}
          />
        ))}
      </ul>
      <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={() => void list.loadMore()} />

      {pending && (
        <ReasonDialog
          open
          onClose={() => setPending(null)}
          title={pending.decision === 'APPROVE' ? 'Approve this file' : 'Refuse this file'}
          description={
            pending.decision === 'APPROVE'
              ? 'Whatever uses it (a post, reel, story or profile picture) can go live once everything else it needs is cleared.'
              : 'The file is deleted and whatever uses it is taken down. The person is told their content was removed.'
          }
          confirmLabel={pending.decision === 'APPROVE' ? 'Approve' : 'Refuse and remove'}
          tone={pending.decision === 'APPROVE' ? 'good' : 'bad'}
          reasonLabel="Note"
          reasonHint="Say what you saw. Recorded in the audit log."
          onConfirm={async (note) => {
            await api.post(`media/review/${pending.item.id}/decision`, { decision: pending.decision, note });
            toast.success(pending.decision === 'APPROVE' ? 'Approved' : 'Refused and removed');
            await list.reload();
          }}
        />
      )}
    </>
  );
}

function Jobs() {
  const { can } = useSession();
  const toast = useToast();
  const [status, setStatus] = useState('FAILED');
  const list = useCursorList<MediaJob>('media/jobs', { status }, 25);
  const [retrying, setRetrying] = useState<string | null>(null);

  const retry = async (job: MediaJob) => {
    setRetrying(job.id);
    try {
      await api.post(`media/jobs/${job.id}/retry`);
      toast.success('Queued to run again');
      await list.reload();
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <>
      <div className="mb-3">
        <label htmlFor="job-status" className="sr-only">
          Job status
        </label>
        <Select id="job-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
          <option value="FAILED">Failed</option>
          <option value="RETRYING">Retrying</option>
          <option value="RUNNING">Running</option>
          <option value="QUEUED">Queued</option>
          <option value="SUCCEEDED">Succeeded</option>
        </Select>
      </div>
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} retry={() => void list.reload()} />
      ) : list.items.length === 0 ? (
        <EmptyState title={`No ${status.toLowerCase()} jobs`} />
      ) : (
        <Table>
          <caption className="sr-only">Media processing jobs</caption>
          <thead>
            <tr>
              <Th>Job</Th>
              <Th>File</Th>
              <Th>Tries</Th>
              <Th className="hidden md:table-cell">Last error</Th>
              <Th className="hidden sm:table-cell">Queued</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((job) => (
              <Tr key={job.id}>
                <Td>
                  <div className="font-bold">{humanize(job.type)}</div>
                  <Tag tone={statusTone(job.status)}>{humanize(job.status)}</Tag>
                </Td>
                <Td className="text-[12.5px]">
                  {humanize(job.asset.kind)} · {humanize(job.asset.purpose)}
                  <div className="text-muted text-xs">{humanize(job.asset.status)}</div>
                </Td>
                <Td>
                  {formatNumber(job.attempts)} / {formatNumber(job.maxAttempts)}
                </Td>
                <Td className="hidden max-w-xs md:table-cell">
                  <span
                    className={cn('line-clamp-2 text-xs', job.lastError ? 'text-bad' : 'text-muted')}
                    title={job.lastError ?? undefined}
                  >
                    {job.lastError ?? '—'}
                  </span>
                </Td>
                <Td className="text-muted hidden sm:table-cell">{formatAgo(job.queuedAt)}</Td>
                <Td>
                  {job.status === 'FAILED' && can('media.retry') && job.asset.status !== 'REJECTED' && (
                    <Button size="sm" variant="ghost" loading={retrying === job.id} onClick={() => void retry(job)}>
                      Retry
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={() => void list.loadMore()} />
    </>
  );
}

export function MediaPage() {
  const { can } = useSession();
  const canReview = can('content.moderate');
  const canJobs = can('media.read');
  const [tab, setTab] = useState<Tab>(canReview ? 'review' : 'jobs');

  if (!canReview && !canJobs) return <NoAccess what="media review" />;

  const tabs: Array<{ id: Tab; label: string; show: boolean }> = [
    { id: 'review', label: 'Waiting for review', show: canReview },
    { id: 'jobs', label: 'Processing jobs', show: canJobs },
  ];

  return (
    <>
      <PageHeader
        title="Media review"
        description="Photos and videos the automatic checks could not clear, and the processing jobs behind every upload. Originals are never shown: you see the processed copy."
      />
      <div role="tablist" aria-label="Media views" className="mb-4 flex flex-wrap gap-1.5">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[12.5px] font-bold',
                tab === t.id ? 'border-ink bg-ink text-white' : 'border-line hover:bg-soft bg-white',
              )}
            >
              {t.label}
            </button>
          ))}
      </div>
      <div role="tabpanel">
        {tab === 'review' && canReview ? (
          <ReviewQueue />
        ) : (
          <Card className="p-0">
            <Jobs />
          </Card>
        )}
      </div>
    </>
  );
}
