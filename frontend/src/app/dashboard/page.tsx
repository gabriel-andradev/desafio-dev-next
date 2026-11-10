import { redirect } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import { UserParticipant, WalletSummary } from '@/types/wallet';
import { WalletPortal } from '@/components/wallet/wallet-portal';

/**
 * Fetches the authenticated user's wallet summary and available recipients on the server.
 */
export default async function DashboardPage() {
  let summary: WalletSummary;
  let recipients: UserParticipant[] = [];

  try {
    [summary, recipients] = await Promise.all([
      apiRequest<WalletSummary>('/wallet'),
      apiRequest<UserParticipant[]>('/users/recipients'),
    ]);
  } catch {
    redirect('/login');
  }

  return <WalletPortal summary={summary} recipients={recipients} />;
}

