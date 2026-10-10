import type { Metadata } from 'next';
import { PolicyPage } from '@/components/moderation/policy-page';

export const metadata: Metadata = { title: 'Policy configuration' };

export default function Page() {
  return <PolicyPage />;
}
