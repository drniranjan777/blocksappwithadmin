import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EarningsPage } from '@/components/earnings/earnings-page';
import { Spinner } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Earnings' };

export default function Page() {
  // The page reads the query string (a creator id to open), which needs a boundary around it.
  return (
    <Suspense fallback={<Spinner />}>
      <EarningsPage />
    </Suspense>
  );
}
