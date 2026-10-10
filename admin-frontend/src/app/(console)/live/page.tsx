import type { Metadata } from 'next';
import { LivePage } from '@/components/moderation/live-page';

export const metadata: Metadata = { title: 'Live monitoring' };

export default function Page() {
  return <LivePage />;
}
