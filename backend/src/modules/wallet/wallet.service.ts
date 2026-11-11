import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Rejects an idempotency key that was already used for a different operation or by another wallet,
   * so a replay can never return (or leak) someone else's transaction.
   */
  private assertSameIdempotentOperation(
    existingTx: { type: string; amountCents: number },
    expected: { type: TransactionType; amountCents: number; ownerMatches: boolean },
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

    return transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      status: tx.status,
      amountCents: tx.amountCents,
      description: tx.description,
      direction: tx.receiverWalletId === walletId ? 'IN' : 'OUT',
      sender: tx.senderWallet?.user ?? null,
      receiver: tx.receiverWallet.user,
      originalTransactionId: tx.originalTransactionId,
      reversalReason: tx.reversalReason,
      createdAt: tx.createdAt,
      reversedAt: tx.reversedAt,
      canReverse:
        tx.status === TransactionStatus.COMPLETED &&
        tx.type !== TransactionType.REVERSAL &&
        !tx.reversalTransaction &&
        TransactionDomainRules.isEligibleForReversal(tx, walletId),
    }));
  }

  /**
   * Credits the user's wallet balance atomically and records a DEPOSIT ledger entry.
   * Supports idempotent replay via optional idempotencyKey.
   */
  async deposit(userId: string, dto: DepositDto, idempotencyKey?: string) {
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

    return this.prisma.$transaction(async (tx) => {
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
  }

  /**
   * Validates recipient and balance via domain rules, debits sender, credits receiver, and logs the TRANSFER atomically.
   * Supports idempotent replay via optional idempotencyKey.
   */
  async transfer(senderUserId: string, dto: TransferDto, idempotencyKey?: string) {
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
      throw new BadRequestException(
        'Não é permitido realizar transferência para a própria carteira.',
      );
    }

    const recipientWalletId = recipientUser.wallet.id;

    return this.prisma.$transaction(async (tx) => {
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
        throw new BadRequestException(
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
  }

  /**
   * Reverses a completed DEPOSIT or TRANSFER transaction atomically and records a REVERSAL ledger entry.
   */
  async reverseTransaction(
    userId: string,
    transactionId: string,
    dto: ReverseTransactionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
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

      const statusUpdate = await tx.transaction.updateMany({
        where: {
          id: originalTx.id,
          status: TransactionStatus.COMPLETED,
        },
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

      if (originalTx.type === TransactionType.DEPOSIT) {
        await tx.wallet.update({
          where: { id: originalTx.receiverWalletId },
          data: {
            balanceCents: { decrement: originalTx.amountCents },
          },
        });

        const reversalTransaction = await tx.transaction.create({
          data: {
            type: TransactionType.REVERSAL,
            status: TransactionStatus.COMPLETED,
            amountCents: originalTx.amountCents,
            description: `Estorno de depósito (${reason})`,
            senderWalletId: originalTx.receiverWalletId,
            receiverWalletId: originalTx.receiverWalletId,
            originalTransactionId: originalTx.id,
            reversalReason: reason,
          },
        });

        const updatedWallet = await tx.wallet.findUniqueOrThrow({
          where: { id: userWallet.id },
        });

        return {
          reversalTransaction,
          newBalanceCents: updatedWallet.balanceCents,
        };
      }

      if (
        originalTx.type === TransactionType.TRANSFER &&
        originalTx.senderWalletId
      ) {
        await tx.wallet.update({
          where: { id: originalTx.receiverWalletId },
          data: {
            balanceCents: { decrement: originalTx.amountCents },
          },
        });

        await tx.wallet.update({
          where: { id: originalTx.senderWalletId },
          data: {
            balanceCents: { increment: originalTx.amountCents },
          },
        });

        const reversalTransaction = await tx.transaction.create({
          data: {
            type: TransactionType.REVERSAL,
            status: TransactionStatus.COMPLETED,
            amountCents: originalTx.amountCents,
            description: `Estorno de transferência (${reason})`,
            senderWalletId: originalTx.receiverWalletId,
            receiverWalletId: originalTx.senderWalletId,
            originalTransactionId: originalTx.id,
            reversalReason: reason,
          },
        });

        const updatedWallet = await tx.wallet.findUniqueOrThrow({
          where: { id: userWallet.id },
        });

        return {
          reversalTransaction,
          newBalanceCents: updatedWallet.balanceCents,
        };
      }

      throw new BadRequestException(
        'Tipo de transação inválido para operação de reversão.',
      );
    });
  }
}
