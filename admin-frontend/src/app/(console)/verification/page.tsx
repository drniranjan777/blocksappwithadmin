import type { Metadata } from 'next';
import { VerificationPage } from '@/components/business/verification-page';

export const metadata: Metadata = { title: 'Business verification' };

export default function Page() {
  return <VerificationPage />;
}
