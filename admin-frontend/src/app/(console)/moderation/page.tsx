import type { Metadata } from 'next';
import { ModerationPage } from '@/components/moderation/moderation-page';

export const metadata: Metadata = { title: 'Moderation queue' };

export default function Page() {
  return <ModerationPage />;
}
