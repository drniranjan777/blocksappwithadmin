import type { Metadata } from 'next';
import { PagesPage } from '@/components/business/pages-page';

export const metadata: Metadata = { title: 'Business pages' };

export default function Page() {
  return <PagesPage />;
}
