import type { Metadata } from 'next';
import { IncidentsPage } from '@/components/moderation/incidents-page';

export const metadata: Metadata = { title: 'Safety incidents' };

export default function Page() {
  return <IncidentsPage />;
}
