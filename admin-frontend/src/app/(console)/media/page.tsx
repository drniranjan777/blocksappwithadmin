import type { Metadata } from 'next';
import { MediaPage } from '@/components/media/media-page';

export const metadata: Metadata = { title: 'Media review' };

export default function Page() {
  return <MediaPage />;
}
