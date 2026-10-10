'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';
import { formatAgo, humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useCursorList } from '@/lib/client/use-api';
import type { BankRow } from '@/lib/types';
import { ReasonDialog } from '../forms/reason-dialog';
import { NoAccess } from '../shell/console-gate';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Select } from '../ui/field';
import { EmptyState, ErrorState, Loading, LoadMore } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag, statusTone, type Tone } from '../ui/tag';
import { useToast } from '../ui/toast';

const STATUSES = ['PENDING_VERIFICATION', 'VERIFIED', 'FAILED', 'DISABLED'];

const MATCH_TONE: Record<string, Tone> = { MATCH: 'good', PARTIAL: 'warn', NO_MATCH: 'bad' };
const MATCH_LABEL: Record<string, string> = {
  MATCH: 'Name matches',
  PARTIAL: 'Name partly matches',
  NO_MATCH: 'Name does not match',
};

export function BankAccountsPage() {
  const { can } = useSession();
  const toast = useToast();
  const [status, setStatus] = useState('PENDING_VERIFICATION');
  const list = useCursorList<BankRow>(can('bank.read') ? 'bank-accounts' : null, { status });
  const [deciding, setDeciding] = useState<{ row: BankRow; decision: 'APPROVE' | 'REJECT' } | null>(null);

  if (!can('bank.read')) return <NoAccess what="bank accounts" />;

  return (
    <>
      <PageHeader
        title="Bank accounts"
        description="Where creators are paid. The bank checks the account and the name on it; a person here decides only when the name matched in part. An account whose name does not match, or that the bank cannot find, cannot be approved by anyone."
      />
      <div className="mb-3">
        <label htmlFor="bank-status" className="sr-only">
          Status
        </label>
        <Select id="bank-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
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
            <caption className="sr-only">Bank accounts, newest first</caption>
            <thead>
              <tr>
                <Th>Account holder</Th>
                <Th>Bank</Th>
                <Th className="hidden sm:table-cell">Account</Th>
                <Th>Name check</Th>
                <Th>Status</Th>
                <Th className="hidden lg:table-cell">Added</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-bold">{r.holderName}</Td>
                  <Td>
                    {r.bankName}
                    <div className="text-muted font-mono text-xs">{r.ifsc}</div>
                  </Td>
                  <Td className="hidden sm:table-cell">
                    {r.accountNumber}
                    <div className="text-muted text-xs">{humanize(r.accountType)}</div>
                  </Td>
                  <Td>
                    {r.nameMatch ? (
                      <Tag tone={MATCH_TONE[r.nameMatch] ?? 'neutral'}>
                        {MATCH_LABEL[r.nameMatch] ?? humanize(r.nameMatch)}
                      </Tag>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    <Tag tone={statusTone(r.status)}>{humanize(r.status)}</Tag>
                    {r.failureCode && <div className="text-muted text-xs">{humanize(r.failureCode)}</div>}
                  </Td>
                  <Td className="text-muted hidden lg:table-cell">{formatAgo(r.createdAt)}</Td>
                  <Td>
                    {r.status === 'PENDING_VERIFICATION' && can('bank.review') && (
                      <div className="flex gap-1.5">
                        <Button variant="good" size="sm" onClick={() => setDeciding({ row: r, decision: 'APPROVE' })}>
                          Approve
                        </Button>
                        <Button variant="bad" size="sm" onClick={() => setDeciding({ row: r, decision: 'REJECT' })}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={() => void list.loadMore()} />
      </Card>

      {deciding && (
        <ReasonDialog
          open
          onClose={() => setDeciding(null)}
          title={deciding.decision === 'APPROVE' ? 'Approve this bank account' : 'Reject this bank account'}
          description={
            deciding.decision === 'APPROVE'
              ? `Payouts to ${deciding.row.bankName} ${deciding.row.accountNumber} become possible once the usual waiting period after a bank change has passed.`
              : 'The person is told the account could not be verified and can add another.'
          }
          confirmLabel={deciding.decision === 'APPROVE' ? 'Approve' : 'Reject'}
          tone={deciding.decision === 'APPROVE' ? 'good' : 'bad'}
          reasonLabel="Your note"
          reasonHint="What you compared and why. Recorded in the audit log."
          onConfirm={async (note) => {
            await api.post(`bank-accounts/${deciding.row.id}/review`, { decision: deciding.decision, note });
            toast.success(deciding.decision === 'APPROVE' ? 'Account approved' : 'Account rejected');
            await list.reload();
          }}
        />
      )}
    </>
  );
}
