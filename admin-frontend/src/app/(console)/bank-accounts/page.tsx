import type { Metadata } from 'next';
import { BankAccountsPage } from '@/components/compliance/bank-accounts-page';

export const metadata: Metadata = { title: 'Bank accounts' };

export default function Page() {
  return <BankAccountsPage />;
}
