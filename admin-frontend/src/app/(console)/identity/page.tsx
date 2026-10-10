import type { Metadata } from 'next';
import { IdentityPage } from '@/components/compliance/identity-page';

export const metadata: Metadata = { title: 'Identity checks' };

export default function Page() {
  return <IdentityPage />;
}
