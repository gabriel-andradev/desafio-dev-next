import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

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
        tx.status === 'COMPLETED' &&
        tx.type !== 'REVERSAL' &&
        !tx.reversalTransaction,
    }));
  }

  /**
   * Credits the user's wallet balance atomically and records a DEPOSIT ledger entry.
   */
  async deposit(userId: string, dto: DepositDto) {
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
          balanceCents: { increment: dto.amountCents },
        },
      });

      const transaction = await tx.transaction.create({
        data: {
          type: 'DEPOSIT',
          status: 'COMPLETED',
          amountCents: dto.amountCents,
          description: dto.description?.trim() || 'Depósito em carteira',
          receiverWalletId: wallet.id,
        },
      });

      return {
        transaction,
        previousBalanceCents,
        newBalanceCents: updatedWallet.balanceCents,
      };
    });
  }

  /**
   * Validates recipient and balance, debits sender, credits receiver, and logs the TRANSFER atomically.
   */
  async transfer(senderUserId: string, dto: TransferDto) {
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

      const debitResult = await tx.wallet.updateMany({
        where: {
          id: senderWallet.id,
          balanceCents: { gte: dto.amountCents },
        },
        data: {
          balanceCents: { decrement: dto.amountCents },
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
          balanceCents: { increment: dto.amountCents },
        },
      });

      const updatedSenderWallet = await tx.wallet.findUniqueOrThrow({
        where: { id: senderWallet.id },
      });

      const transaction = await tx.transaction.create({
        data: {
          type: 'TRANSFER',
          status: 'COMPLETED',
          amountCents: dto.amountCents,
          description:
            dto.description?.trim() ||
            `Transferência para ${recipientUser.name}`,
          senderWalletId: senderWallet.id,
          receiverWalletId: recipientWalletId,
        },
      });

      return {
        transaction,
        newBalanceCents: updatedSenderWallet.balanceCents,
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

      const isParticipant =
        originalTx.senderWalletId === userWallet.id ||
        originalTx.receiverWalletId === userWallet.id;

      if (!isParticipant) {
        throw new ForbiddenException(
          'Você não tem permissão para reverter esta transação.',
        );
      }

      if (originalTx.type === 'REVERSAL') {
        throw new BadRequestException(
          'Não é permitido reverter uma transação que já é um estorno.',
        );
      }

      if (originalTx.status === 'REVERSED') {
        throw new ConflictException(
          'Esta transação já foi revertida anteriormente.',
        );
      }

      const reason =
        dto.reason || 'Reversão solicitada pelo titular da carteira';

      const statusUpdate = await tx.transaction.updateMany({
        where: {
          id: originalTx.id,
          status: 'COMPLETED',
        },
        data: {
          status: 'REVERSED',
          reversedAt: new Date(),
          reversalReason: reason,
        },
      });

      if (statusUpdate.count === 0) {
        throw new ConflictException(
          'Esta transação já foi revertida anteriormente.',
        );
      }

      if (originalTx.type === 'DEPOSIT') {
        await tx.wallet.update({
          where: { id: originalTx.receiverWalletId },
          data: {
            balanceCents: { decrement: originalTx.amountCents },
          },
        });

        const reversalTransaction = await tx.transaction.create({
          data: {
            type: 'REVERSAL',
            status: 'COMPLETED',
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

      if (originalTx.type === 'TRANSFER' && originalTx.senderWalletId) {
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
            type: 'REVERSAL',
            status: 'COMPLETED',
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

