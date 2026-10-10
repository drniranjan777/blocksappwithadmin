import type { Metadata } from 'next';
import { MusicPage } from '@/components/music/music-page';

export const metadata: Metadata = { title: 'Music library' };

export default function Page() {
  return <MusicPage />;
}
