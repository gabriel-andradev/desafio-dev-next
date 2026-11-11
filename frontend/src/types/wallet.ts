export interface UserParticipant {
  id: string;
  name: string;
  email: string;
  cpf?: string;
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
}

