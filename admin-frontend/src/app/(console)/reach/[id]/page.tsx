import type { Metadata } from 'next';
import { ReachVersionPage } from '@/components/reach/reach-version-page';

export const metadata: Metadata = { title: 'Reach settings version' };

export default async function Page({ params }: PageProps<'/reach/[id]'>) {
  const { id } = await params;
  return <ReachVersionPage id={id} />;
}
