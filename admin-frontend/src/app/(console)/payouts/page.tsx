import type { Metadata } from 'next';
import { PayoutsPage } from '@/components/compliance/payouts-page';

export const metadata: Metadata = { title: 'Payouts' };

export default function Page() {
  return <PayoutsPage />;
}
