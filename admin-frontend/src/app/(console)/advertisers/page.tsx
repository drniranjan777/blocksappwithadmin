import type { Metadata } from 'next';
import { AdvertisersPage } from '@/components/business/advertisers-page';

export const metadata: Metadata = { title: 'Advertisers' };

export default function Page() {
  return <AdvertisersPage />;
}
