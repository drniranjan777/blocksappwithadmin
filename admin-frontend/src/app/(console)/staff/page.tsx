import type { Metadata } from 'next';
import { StaffPage } from '@/components/staff/staff-page';

export const metadata: Metadata = { title: 'Staff' };

export default function Page() {
  return <StaffPage />;
}
