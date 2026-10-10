import type { Metadata } from 'next';
import { AppealsPage } from '@/components/moderation/appeals-page';

export const metadata: Metadata = { title: 'Appeals' };

export default function Page() {
  return <AppealsPage />;
}
