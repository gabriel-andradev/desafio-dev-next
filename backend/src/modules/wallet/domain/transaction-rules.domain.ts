import {
  UnprocessableEntityException,
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

export type ReversalState = 'AVAILABLE' | 'EXPIRED' | 'UNAVAILABLE';

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
      throw new UnprocessableEntityException(
        'Não é permitido realizar transferência para a própria carteira.',
      );
    }

    if (!params.amount.isCoveredBy(params.senderBalanceCents)) {
      throw new UnprocessableEntityException(
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
      throw new UnprocessableEntityException(
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
        throw new UnprocessableEntityException(
          'O prazo limite de 24 horas para estorno deste depósito expirou.',
        );
      }
    }

    if (transaction.type === TransactionType.TRANSFER) {
      const isSender = transaction.senderWalletId === requesterWalletId;
      const isReceiver = transaction.receiverWalletId === requesterWalletId;

      if (isSender) {
        if (elapsedMinutes > 15) {
          throw new UnprocessableEntityException(
            'O prazo de arrependimento do remetente (15 minutos) expirou. Solicite a devolução diretamente ao destinatário.',
          );
        }
      } else if (isReceiver) {
        if (elapsedMinutes > 1440) {
          throw new UnprocessableEntityException(
            'O prazo limite para devolução voluntária pelo destinatário (24 horas) expirou.',
          );
        }
      }
    }
  }

  /** Minimum length of the justification required for an internal compensation. */
  static readonly COMPENSATION_REASON_MIN_LENGTH = 10;

  /**
   * Validates an internal compensation of a technical inconsistency.
   * Unlike a user reversal there is no time window and no participant check: the trusted origin is the
   * operator running the internal script on the server. It still requires a justification and an operator,
   * and can never touch a reversal entry or something already reversed.
   */
  static validateCompensationPreconditions(
    transaction: { type: string; status: string },
    reason: string,
    operator: string,
  ): void {
    if (transaction.status === TransactionStatus.REVERSED) {
      throw new ConflictException(
        'Esta transação já foi revertida anteriormente.',
      );
    }

    if (transaction.type === TransactionType.REVERSAL) {
      throw new UnprocessableEntityException(
        'Não é permitido reverter uma transação que já é um estorno.',
      );
    }

    if (reason.trim().length < this.COMPENSATION_REASON_MIN_LENGTH) {
      throw new UnprocessableEntityException(
        `Informe uma justificativa com pelo menos ${this.COMPENSATION_REASON_MIN_LENGTH} caracteres.`,
      );
    }

    if (!operator.trim()) {
      throw new UnprocessableEntityException(
        'Informe o responsável pela compensação.',
      );
    }
  }

  /**
   * Classifies a transaction for the statement UI:
   * - AVAILABLE: the wallet can reverse it right now;
   * - EXPIRED: it would be reversible, but the time window has passed;
   * - UNAVAILABLE: it can never be reversed by this wallet (already reversed, a reversal entry, not the owner...).
   */
  static getReversalState(
    transaction: ReversibilityCheckInput,
    requesterWalletId: string,
    currentDate: Date = new Date(),
  ): ReversalState {
    if (
      this.isEligibleForReversal(transaction, requesterWalletId, currentDate)
    ) {
      return 'AVAILABLE';
    }

    const eligibleAtCreation = this.isEligibleForReversal(
      transaction,
      requesterWalletId,
      new Date(transaction.createdAt),
    );

    return eligibleAtCreation ? 'EXPIRED' : 'UNAVAILABLE';
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
