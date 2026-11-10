import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Money } from './money.vo';

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  TRANSFER = 'TRANSFER',
  REVERSAL = 'REVERSAL',
}

export enum TransactionStatus {
  COMPLETED = 'COMPLETED',
  REVERSED = 'REVERSED',
  FAILED = 'FAILED',
}

export interface ReversibilityCheckInput {
  type: string;
  status: string;
  senderWalletId: string | null;
  receiverWalletId: string;
}

export class TransactionDomainRules {
  /**
   * Enforces domain invariants before executing a peer-to-peer transfer.
   */
  static validateTransferPreconditions(params: {
    senderUserId: string;
    recipientUserId: string;
    senderBalanceCents: number;
    amount: Money;
  }): void {
    if (params.senderUserId === params.recipientUserId) {
      throw new BadRequestException(
        'Não é permitido realizar transferência para a própria carteira.',
      );
    }

    if (!params.amount.isCoveredBy(params.senderBalanceCents)) {
      throw new BadRequestException(
        'Saldo insuficiente para realizar a transferência.',
      );
    }
  }

  /**
   * Enforces participant ownership and state invariants before reversing a transaction.
   */
  static validateReversalPreconditions(
    transaction: ReversibilityCheckInput,
    requesterWalletId: string,
  ): void {
    const isParticipant =
      transaction.senderWalletId === requesterWalletId ||
      transaction.receiverWalletId === requesterWalletId;

    if (!isParticipant) {
      throw new ForbiddenException(
        'Você não tem permissão para reverter esta transação.',
      );
    }

    if (transaction.type === TransactionType.REVERSAL) {
      throw new BadRequestException(
        'Não é permitido reverter uma transação que já é um estorno.',
      );
    }

    if (transaction.status === TransactionStatus.REVERSED) {
      throw new ConflictException(
        'Esta transação já foi revertida anteriormente.',
      );
    }
  }
}

