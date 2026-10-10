import type { Metadata } from 'next';
import { ReachPage } from '@/components/reach/reach-page';

export const metadata: Metadata = { title: 'Reach engine' };

export default function Page() {
  return <ReachPage />;
}
