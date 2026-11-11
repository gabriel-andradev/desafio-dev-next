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
  createdAt: Date;
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
   * Enforces participant ownership, state, and time window invariants before reversing a transaction.
   * - Deposit: Can only be reversed by the account owner within 24 hours.
   * - Transfer: Sender can reverse within 15 minutes (repentance window); Receiver can return within 24 hours.
   */
  static validateReversalPreconditions(
    transaction: ReversibilityCheckInput,
    requesterWalletId: string,
    currentDate: Date = new Date(),
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

    const elapsedMilliseconds =
      currentDate.getTime() - new Date(transaction.createdAt).getTime();
    const elapsedMinutes = elapsedMilliseconds / (1000 * 60);

    if (transaction.type === TransactionType.DEPOSIT) {
      if (transaction.receiverWalletId !== requesterWalletId) {
        throw new ForbiddenException(
          'Apenas o titular da conta pode solicitar o estorno do depósito.',
        );
      }
      if (elapsedMinutes > 1440) {
        throw new BadRequestException(
          'O prazo limite de 24 horas para estorno deste depósito expirou.',
        );
      }
    }

    if (transaction.type === TransactionType.TRANSFER) {
      const isSender = transaction.senderWalletId === requesterWalletId;
      const isReceiver = transaction.receiverWalletId === requesterWalletId;

      if (isSender) {
        if (elapsedMinutes > 15) {
          throw new BadRequestException(
            'O prazo de arrependimento do remetente (15 minutos) expirou. Solicite a devolução diretamente ao destinatário.',
          );
        }
      } else if (isReceiver) {
        if (elapsedMinutes > 1440) {
          throw new BadRequestException(
            'O prazo limite para devolução voluntária pelo destinatário (24 horas) expirou.',
          );
        }
      }
    }
  }

  /**
   * Evaluates whether a transaction is currently eligible for reversal by the given wallet.
   */
  static isEligibleForReversal(
    transaction: ReversibilityCheckInput,
    requesterWalletId: string,
    currentDate: Date = new Date(),
  ): boolean {
    try {
      this.validateReversalPreconditions(
        transaction,
        requesterWalletId,
        currentDate,
      );
      return true;
    } catch {
      return false;
    }
  }
}

