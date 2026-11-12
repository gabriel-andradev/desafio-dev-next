export interface UserParticipant {
  id: string;
  name: string;
  email: string;
  /** Only on transfer contacts: the API never sends other users' full CPF. */
  maskedCpf?: string;
}

export interface WalletTransaction {
  id: string;
  type: 'DEPOSIT' | 'TRANSFER' | 'REVERSAL';
  status: 'COMPLETED' | 'REVERSED' | 'FAILED';
  amountCents: number;
  description: string | null;
  direction: 'IN' | 'OUT';
  sender: UserParticipant | null;
  receiver: UserParticipant;
  originalTransactionId: string | null;
  reversalReason: string | null;
  createdAt: string;
  reversedAt: string | null;
  reversalState: 'AVAILABLE' | 'EXPIRED' | 'UNAVAILABLE';
  canReverse: boolean;
}

export interface WalletSummary {
  walletId: string;
  balanceCents: number;
  isNegative: boolean;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    cpf: string;
  };
  transactions: WalletTransaction[];
}

export interface ActionState {
  success: boolean;
  message?: string;
  /**
   * Values to show again after an error (never the password). React 19 resets uncontrolled form
   * fields after a Server Action, so without this the user would retype everything.
   */
  fields?: Record<string, string>;
}

