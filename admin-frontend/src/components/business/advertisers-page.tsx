'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatAgo, formatRupees, humanize } from '@/lib/client/format';
import { CAMPAIGN_STATUS } from '@/lib/business';
import { useSession } from '@/lib/client/session';
import { useDebounced } from '@/lib/client/use-debounced';
import { useCursorList } from '@/lib/client/use-api';
import type { AdvertiserRow, CampaignStatus } from '@/lib/types';
import { NoAccess } from '../shell/console-gate';
import { Card, PageHeader } from '../ui/card';
import { Input } from '../ui/field';
import { Icon } from '../ui/icon';
import { EmptyState, ErrorState, Loading, LoadMore } from '../ui/states';
import { Table, Td, Th, Tr } from '../ui/table';
import { Tag, statusTone } from '../ui/tag';

export function AdvertisersPage() {
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const list = useCursorList<AdvertiserRow>(can('ads.read') ? 'ads/advertisers' : null, { q });

  if (!can('ads.read')) return <NoAccess what="advertisers" />;

  return (
    <>
      <PageHeader
        title="Advertisers"
        description="People who have run campaigns, with what they have run and committed. Totals only: nothing about who was in their audiences."
      />
      <div className="mb-3">
        <div className="relative min-w-[220px] sm:max-w-sm">
          <label htmlFor="advertiser-search" className="sr-only">
            Search advertisers
          </label>
          <Icon
            name="search"
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id="advertiser-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Username"
            className="pl-9"
            maxLength={60}
          />
        </div>
      </div>
      <Card className="p-0">
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} retry={() => void list.reload()} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No advertisers yet" hint="People appear here once they create a campaign." />
        ) : (
          <Table>
            <caption className="sr-only">Advertisers, newest first</caption>
            <thead>
              <tr>
                <Th>Advertiser</Th>
                <Th>Campaigns</Th>
                <Th className="hidden sm:table-cell">Committed</Th>
                <Th className="hidden sm:table-cell">Spent</Th>
                <Th className="hidden md:table-cell">Since</Th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <div className="font-bold">{a.displayName}</div>
                    <div className="text-muted text-xs">
                      @{a.username}{' '}
                      {a.status !== 'ACTIVE' && <Tag tone={statusTone(a.status)}>{humanize(a.status)}</Tag>}
                    </div>
                  </Td>
                  <Td>
                    <div className="mb-1 font-bold">{a.total}</div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(a.campaigns).map(([s, n]) => (
                        <Tag key={s} tone={CAMPAIGN_STATUS[s as CampaignStatus]?.tone ?? 'neutral'}>
                          {CAMPAIGN_STATUS[s as CampaignStatus]?.label ?? humanize(s)} {n}
                        </Tag>
                      ))}
                    </div>
                    <Link href="/campaigns" className="text-brand mt-1 inline-block text-xs font-bold underline">
                      Review campaigns
                    </Link>
                  </Td>
                  <Td className="hidden sm:table-cell">{formatRupees(a.committed)}</Td>
                  <Td className="hidden sm:table-cell">{formatRupees(a.spent)}</Td>
                  <Td className="text-muted hidden md:table-cell">{formatAgo(a.since)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={() => void list.loadMore()} />
      </Card>
    </>
  );
}
