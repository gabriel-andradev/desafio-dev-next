import {
  UnprocessableEntityException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Transaction } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto';
import { Money } from './domain/money.vo';
import {
  TransactionDomainRules,
  TransactionStatus,
  TransactionType,
} from './domain/transaction-rules.domain';

export interface DepositResult {
  transaction: Transaction;
  previousBalanceCents: number;
  newBalanceCents: number;
  isIdempotentReplay: boolean;
}

export interface TransferResult {
  transaction: Transaction;
  newBalanceCents: number;
  isIdempotentReplay: boolean;
}

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * SQLite allows a single writer. Prisma already waits for the lock (busy timeout), but under heavier
   * contention SQLite can still answer SQLITE_BUSY ("database is locked") or Prisma can report a write
   * conflict (P2034). Those are transient: the whole transaction was rolled back, so running it again is
   * safe. Bounded to 3 attempts with a short backoff; anything else is rethrown untouched.
   */
  private async retryOnBusy<T>(operation: () => Promise<T>): Promise<T> {
    const maxAttempts = 3;

    for (let attempt = 1; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (
          attempt >= maxAttempts ||
          !WalletService.isTransientLockError(error)
        ) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
      }
    }
  }

  static isTransientLockError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code === 'P2034';
    }
    const message = error instanceof Error ? error.message : '';
    return /SQLITE_BUSY|database is locked/i.test(message);
  }

  /**
   * Two requests with the same idempotency key can both pass the replay lookup at the same time.
   * The unique index makes the second insert fail (Prisma P2002) and roll back its whole transaction;
   * running the operation again then finds the first request's row and returns it as a replay.
   */
  private async withConcurrentReplay<T>(
    key: string | undefined,
    run: () => Promise<T>,
    retryAsReplay: () => Promise<T>,
  ): Promise<T> {
    try {
      return await this.retryOnBusy(run);
    } catch (error) {
      const isDuplicateKey =
        key &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';

      if (!isDuplicateKey) {
        throw error;
      }

      return retryAsReplay();
    }
  }

  /**
   * Rejects an idempotency key that was already used for a different operation or by another wallet,
   * so a replay can never return (or leak) someone else's transaction.
   */
  private assertSameIdempotentOperation(
    existingTx: { type: string; amountCents: number },
    expected: {
      type: TransactionType;
      amountCents: number;
      ownerMatches: boolean;
    },
  ): void {
    const isSameOperation =
      expected.ownerMatches &&
      existingTx.type === expected.type &&
      existingTx.amountCents === expected.amountCents;

    if (!isSameOperation) {
      throw new ConflictException(
        'Esta chave de idempotência já foi utilizada em outra operação.',
      );
    }
  }

  /**
   * Retrieves the user's wallet balance, negative balance indicator, and transaction history.
   */
  async getWalletSummary(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            cpf: true,
          },
        },
      },
    });

    if (!wallet) {
      throw new NotFoundException('Carteira não encontrada para este usuário.');
    }

    const transactions = await this.listTransactions(wallet.id);

    return {
      walletId: wallet.id,
      balanceCents: wallet.balanceCents,
      isNegative: wallet.balanceCents < 0,
      updatedAt: wallet.updatedAt,
      user: wallet.user,
      transactions,
    };
  }

  /**
   * Lists all incoming and outgoing transactions for a given wallet ordered by newest first.
   */
  async listTransactions(walletId: string) {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        OR: [{ senderWalletId: walletId }, { receiverWalletId: walletId }],
      },
      include: {
        senderWallet: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        receiverWallet: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        reversalTransaction: {
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return transactions.map((tx) => {
      const reversalState = tx.reversalTransaction
        ? 'UNAVAILABLE'
        : TransactionDomainRules.getReversalState(tx, walletId);

      return {
        id: tx.id,
        type: tx.type,
        status: tx.status,
        amountCents: tx.amountCents,
        description: tx.description,
        // Money leaves the wallet whenever it is the sender. This also covers a deposit reversal,
        // whose sender and receiver are the same wallet and which is a debit.
        direction: tx.senderWalletId === walletId ? 'OUT' : 'IN',
        sender: tx.senderWallet?.user ?? null,
        receiver: tx.receiverWallet.user,
        originalTransactionId: tx.originalTransactionId,
        reversalReason: tx.reversalReason,
        createdAt: tx.createdAt,
        reversedAt: tx.reversedAt,
        reversalState,
        canReverse: reversalState === 'AVAILABLE',
      };
    });
  }

  /**
   * Credits the user's wallet balance atomically and records a DEPOSIT ledger entry.
   * Supports idempotent replay via optional idempotencyKey.
   */
  async deposit(
    userId: string,
    dto: DepositDto,
    idempotencyKey?: string,
  ): Promise<DepositResult> {
    const key = idempotencyKey?.trim() || dto.idempotencyKey?.trim();

    if (key) {
      const existingTx = await this.prisma.transaction.findUnique({
        where: { idempotencyKey: key },
      });

      if (existingTx) {
        const wallet = await this.prisma.wallet.findUnique({
          where: { userId },
        });

        this.assertSameIdempotentOperation(existingTx, {
          type: TransactionType.DEPOSIT,
          amountCents: dto.amountCents,
          ownerMatches: existingTx.receiverWalletId === wallet?.id,
        });

        return {
          transaction: existingTx,
          previousBalanceCents: wallet?.balanceCents ?? 0,
          newBalanceCents: wallet?.balanceCents ?? 0,
          isIdempotentReplay: true,
        };
      }
    }

    const money = Money.fromCents(dto.amountCents);

    const run = (): Promise<DepositResult> =>
      this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new NotFoundException('Carteira não encontrada.');
        }

        const previousBalanceCents = wallet.balanceCents;

        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balanceCents: { increment: money.valueInCents },
          },
        });

        const transaction = await tx.transaction.create({
          data: {
            type: TransactionType.DEPOSIT,
            status: TransactionStatus.COMPLETED,
            amountCents: money.valueInCents,
            description: dto.description?.trim() || 'Depósito em carteira',
            receiverWalletId: wallet.id,
            idempotencyKey: key || undefined,
          },
        });

        return {
          transaction,
          previousBalanceCents,
          newBalanceCents: updatedWallet.balanceCents,
          isIdempotentReplay: false,
        };
      });

    return this.withConcurrentReplay(key, run, () =>
      this.deposit(userId, dto, key),
    );
  }

  /**
   * Validates recipient and balance via domain rules, debits sender, credits receiver, and logs the TRANSFER atomically.
   * Supports idempotent replay via optional idempotencyKey.
   */
  async transfer(
    senderUserId: string,
    dto: TransferDto,
    idempotencyKey?: string,
  ): Promise<TransferResult> {
    const key = idempotencyKey?.trim() || dto.idempotencyKey?.trim();

    if (key) {
      const existingTx = await this.prisma.transaction.findUnique({
        where: { idempotencyKey: key },
      });

      if (existingTx) {
        const senderWallet = await this.prisma.wallet.findUnique({
          where: { userId: senderUserId },
        });

        this.assertSameIdempotentOperation(existingTx, {
          type: TransactionType.TRANSFER,
          amountCents: dto.amountCents,
          ownerMatches: existingTx.senderWalletId === senderWallet?.id,
        });

        return {
          transaction: existingTx,
          newBalanceCents: senderWallet?.balanceCents ?? 0,
          isIdempotentReplay: true,
        };
      }
    }

    const money = Money.fromCents(dto.amountCents);

    const recipientUser = await this.usersService.findByEmailOrCpf(
      dto.recipientIdentifier,
    );

    if (!recipientUser || !recipientUser.wallet) {
      throw new NotFoundException(
        'Destinatário não encontrado para o e-mail ou CPF informado.',
      );
    }

    if (recipientUser.id === senderUserId) {
      throw new UnprocessableEntityException(
        'Não é permitido realizar transferência para a própria carteira.',
      );
    }

    const recipientWalletId = recipientUser.wallet.id;

    const run = (): Promise<TransferResult> =>
      this.prisma.$transaction(async (tx) => {
        const senderWallet = await tx.wallet.findUnique({
          where: { userId: senderUserId },
        });

        if (!senderWallet) {
          throw new NotFoundException('Carteira do remetente não encontrada.');
        }

        TransactionDomainRules.validateTransferPreconditions({
          senderUserId,
          recipientUserId: recipientUser.id,
          senderBalanceCents: senderWallet.balanceCents,
          amount: money,
        });

        const debitResult = await tx.wallet.updateMany({
          where: {
            id: senderWallet.id,
            balanceCents: { gte: money.valueInCents },
          },
          data: {
            balanceCents: { decrement: money.valueInCents },
          },
        });

        if (debitResult.count === 0) {
          throw new UnprocessableEntityException(
            'Saldo insuficiente para realizar a transferência.',
          );
        }

        await tx.wallet.update({
          where: { id: recipientWalletId },
          data: {
            balanceCents: { increment: money.valueInCents },
          },
        });

        const updatedSenderWallet = await tx.wallet.findUniqueOrThrow({
          where: { id: senderWallet.id },
        });

        const transaction = await tx.transaction.create({
          data: {
            type: TransactionType.TRANSFER,
            status: TransactionStatus.COMPLETED,
            amountCents: money.valueInCents,
            description:
              dto.description?.trim() ||
              `Transferência para ${recipientUser.name}`,
            senderWalletId: senderWallet.id,
            receiverWalletId: recipientWalletId,
            idempotencyKey: key || undefined,
          },
        });

        return {
          transaction,
          newBalanceCents: updatedSenderWallet.balanceCents,
          isIdempotentReplay: false,
        };
      });

    return this.withConcurrentReplay(key, run, () =>
      this.transfer(senderUserId, dto, key),
    );
  }

  /**
   * Reverses a completed DEPOSIT or TRANSFER transaction atomically and records a REVERSAL ledger entry.
   */
  async reverseTransaction(
    userId: string,
    transactionId: string,
    dto: ReverseTransactionDto,
  ) {
    return this.retryOnBusy(() =>
      this.prisma.$transaction(async (tx) => {
        const userWallet = await tx.wallet.findUnique({
          where: { userId },
        });

        if (!userWallet) {
          throw new NotFoundException('Carteira do usuário não encontrada.');
        }

        const originalTx = await tx.transaction.findUnique({
          where: { id: transactionId },
        });

        if (!originalTx) {
          throw new NotFoundException('Transação não encontrada.');
        }

        TransactionDomainRules.validateReversalPreconditions(
          originalTx,
          userWallet.id,
        );

        const reason =
          dto.reason || 'Reversão solicitada pelo titular da carteira';

        const reversalTransaction = await this.applyReversal(
          tx,
          originalTx,
          reason,
          'USER',
          `user:${userId}`,
        );

        const updatedWallet = await tx.wallet.findUniqueOrThrow({
          where: { id: userWallet.id },
        });

        return {
          reversalTransaction,
          newBalanceCents: updatedWallet.balanceCents,
        };
      }),
    );
  }

  /**
   * Internal compensation of a technical inconsistency (e.g. a credit found wrong by reconciliation).
   * Not exposed over HTTP: only the `wallet:compensate` script (src/scripts/compensate.ts) calls it, so the
   * trusted origin is whoever has shell access to the server. No user time windows apply.
   */
  async compensateTransaction(
    transactionId: string,
    reason: string,
    operator: string,
  ): Promise<Transaction> {
    return this.retryOnBusy(() =>
      this.prisma.$transaction(async (tx) => {
        const originalTx = await tx.transaction.findUnique({
          where: { id: transactionId },
        });

        if (!originalTx) {
          throw new NotFoundException('Transação não encontrada.');
        }

        TransactionDomainRules.validateCompensationPreconditions(
          originalTx,
          reason,
          operator,
        );

        return this.applyReversal(
          tx,
          originalTx,
          `Compensação técnica: ${reason.trim()}`,
          'COMPENSATION',
          `operator:${operator.trim()}`,
        );
      }),
    );
  }

  /**
   * Shared reversal core (user request or compensation). Runs inside the caller's interactive transaction.
   */
  private async applyReversal(
    tx: Prisma.TransactionClient,
    originalTx: Transaction,
    reason: string,
    source: 'USER' | 'COMPENSATION',
    actor: string,
  ): Promise<Transaction> {
    // Conditional status change: if a concurrent request reversed it first, nothing is updated.
    const statusUpdate = await tx.transaction.updateMany({
      where: { id: originalTx.id, status: TransactionStatus.COMPLETED },
      data: {
        status: TransactionStatus.REVERSED,
        reversedAt: new Date(),
        reversalReason: reason,
      },
    });

    if (statusUpdate.count === 0) {
      throw new ConflictException(
        'Esta transação já foi revertida anteriormente.',
      );
    }

    // The receiver may already have spent the money: the debit is allowed to go negative (policy).
    await tx.wallet.update({
      where: { id: originalTx.receiverWalletId },
      data: { balanceCents: { decrement: originalTx.amountCents } },
    });

    if (
      originalTx.type === TransactionType.TRANSFER &&
      originalTx.senderWalletId
    ) {
      await tx.wallet.update({
        where: { id: originalTx.senderWalletId },
        data: { balanceCents: { increment: originalTx.amountCents } },
      });
    } else if (originalTx.type !== TransactionType.DEPOSIT) {
      throw new UnprocessableEntityException(
        'Tipo de transação inválido para operação de reversão.',
      );
    }

    return tx.transaction.create({
      data: {
        type: TransactionType.REVERSAL,
        status: TransactionStatus.COMPLETED,
        amountCents: originalTx.amountCents,
        description:
          originalTx.type === TransactionType.DEPOSIT
            ? `Estorno de depósito (${reason})`
            : `Estorno de transferência (${reason})`,
        senderWalletId: originalTx.receiverWalletId,
        receiverWalletId:
          originalTx.senderWalletId ?? originalTx.receiverWalletId,
        originalTransactionId: originalTx.id,
        reversalReason: reason,
        reversalSource: source,
        reversalActor: actor,
      },
    });
  }
}
