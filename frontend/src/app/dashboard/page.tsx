import { redirect } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import { UserParticipant, WalletSummary } from '@/types/wallet';
import { WalletPortal } from '@/components/wallet/wallet-portal';

interface DashboardPageProps {
  searchParams: Promise<{ tab?: string }>;
}

/**
 * Fetches the authenticated user's wallet summary and available recipients on the server.
 */
export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
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

  const resolvedSearchParams = await searchParams;

  return (
    <WalletPortal
      summary={summary}
      recipients={recipients}
      initialTab={resolvedSearchParams.tab}
    />
  );
}

