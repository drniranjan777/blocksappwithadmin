'use client';

import { useState } from 'react';
import { NoAccess } from '../shell/console-gate';
import { Avatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { Card, PageHeader } from '../ui/card';
import { Input, Select } from '../ui/field';
import { Icon } from '../ui/icon';
import { EmptyState, ErrorState, Loading, LoadMore } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag, statusTone, type Tone } from '../ui/tag';
import { formatAgo, formatNumber, humanize } from '@/lib/client/format';
import { useSession } from '@/lib/client/session';
import { useDebounced } from '@/lib/client/use-debounced';
import { useCursorList } from '@/lib/client/use-api';
import type { AppUserCard, RiskLevel } from '@/lib/types';
import { UserDrawer } from './user-drawer';

const RISK_TONE: Record<RiskLevel, Tone> = { LOW: 'good', MEDIUM: 'warn', HIGH: 'bad' };

export function UsersPage() {
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [risk, setRisk] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useDebounced(search.trim());

  const list = useCursorList<AppUserCard>(can('users.read') ? 'users' : null, { q, status, risk });

  if (!can('users.read')) return <NoAccess what="user accounts" />;

  return (
    <>
      <PageHeader
        title="Users"
        description="Find a person by username, name, or an exact e-mail address or phone number. Contact details are masked unless your role allows seeing them."
      />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <label htmlFor="user-search" className="sr-only">
            Search users
          </label>
          <Icon
            name="search"
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id="user-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Username, name, e-mail or phone"
            className="pl-9"
            maxLength={100}
          />
        </div>
        <div>
          <label htmlFor="user-status" className="sr-only">
            Status
          </label>
          <Select id="user-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="RESTRICTED">Restricted</option>
            <option value="SUSPENDED">Suspended</option>
          </Select>
        </div>
        <div>
          <label htmlFor="user-risk" className="sr-only">
            Risk
          </label>
          <Select id="user-risk" value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option value="">Any risk</option>
            <option value="HIGH">High risk</option>
            <option value="MEDIUM">Medium risk</option>
            <option value="LOW">Low risk</option>
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
            title="No one matches"
            hint={
              q
                ? 'Try a different spelling, or the exact e-mail address.'
                : 'There are no accounts with these filters yet.'
            }
          />
        ) : (
          <Table>
            <caption className="sr-only">App users, newest first</caption>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th className="hidden md:table-cell">Where</Th>
                <Th className="hidden sm:table-cell">Followers</Th>
                <Th className="hidden sm:table-cell">Risk</Th>
                <Th className="hidden sm:table-cell">Status</Th>
                <Th className="hidden lg:table-cell">Joined</Th>
                <Th>
                  <span className="sr-only">Open</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.displayName} seed={u.id} />
                      <div className="min-w-0">
                        <div className="truncate font-bold">{u.displayName}</div>
                        <div className="text-muted truncate text-xs">@{u.username}</div>
                        {/* On a phone the Risk and Status columns are hidden; the standing shows under the name. */}
                        <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                          <Tag tone={statusTone(u.status)}>{humanize(u.status)}</Tag>
                          <Tag tone={RISK_TONE[u.risk]}>{humanize(u.risk)} risk</Tag>
                        </div>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-muted hidden md:table-cell">
                    {[u.location?.district, u.location?.state].filter(Boolean).join(', ') || '—'}
                  </Td>
                  <Td className="hidden sm:table-cell">{formatNumber(u.followers)}</Td>
                  <Td className="hidden sm:table-cell">
                    <Tag tone={RISK_TONE[u.risk]}>{humanize(u.risk)}</Tag>
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <Tag tone={statusTone(u.status)}>{humanize(u.status)}</Tag>
                  </Td>
                  <Td className="text-muted hidden lg:table-cell">{formatAgo(u.createdAt)}</Td>
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpenId(u.id)}
                      aria-label={`Open ${u.displayName}`}
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

      <p className="text-muted mt-3 text-xs">
        Risk is shown to staff only. People see a simplified account standing, never the internal score. Every action
        here is recorded in the audit log with your name and reason.
      </p>

      <UserDrawer userId={openId} onClose={() => setOpenId(null)} onChanged={() => void list.reload()} />
    </>
  );
}
