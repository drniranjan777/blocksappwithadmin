'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/client/cn';
import { useSession } from '@/lib/client/session';
import { NoAccess } from '../shell/console-gate';
import { PageHeader } from '../ui/card';
import { Cycles } from './cycles';
import { CreatorLookup } from './creators';

type Tab = 'cycles' | 'creators';

export function EarningsPage() {
  const { can } = useSession();
  const params = useSearchParams();
  const creator = params.get('creator') ?? '';
  const showCycles = can('earnings.read');
  const showCreators = can('creators.read');
  const [tab, setTab] = useState<Tab>(creator && showCreators ? 'creators' : showCycles ? 'cycles' : 'creators');

  if (!showCycles && !showCreators) return <NoAccess what="earnings" />;

  const tabs = [
    { id: 'cycles' as const, label: 'Reward cycles', show: showCycles },
    { id: 'creators' as const, label: 'Creators', show: showCreators },
  ].filter((t) => t.show);

  return (
    <>
      <PageHeader
        title="Earnings"
        description="Each cycle shares a pool of money among eligible creators by how their content performed. Closing a cycle fixes everyone's share; a different person then releases it into the ledger."
      />
      <div role="tablist" aria-label="Earnings views" className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
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
      <div role="tabpanel">{tab === 'cycles' && showCycles ? <Cycles /> : <CreatorLookup initialId={creator} />}</div>
    </>
  );
}
