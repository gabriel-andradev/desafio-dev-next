import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import {
  UnprocessableEntityException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';

describe('WalletService', () => {
  let service: WalletService;

  const mockTx = {
    wallet: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    transaction: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockPrismaService = {
    $transaction: jest.fn((callback: (tx: typeof mockTx) => unknown) =>
      callback(mockTx),
    ),
    wallet: mockTx.wallet,
    transaction: {
      ...mockTx.transaction,
      findMany: jest.fn(),
    },
  };

  const mockUsersService = {
    findByEmailOrCpf: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  describe('deposit', () => {
    it('should increment balance on a regular positive wallet', async () => {
      mockTx.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        balanceCents: 10000,
      });

      mockTx.wallet.update.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        balanceCents: 25000,
      });

      mockTx.transaction.create.mockResolvedValue({
        id: 'tx-1',
        type: 'DEPOSIT',
        status: 'COMPLETED',
        amountCents: 15000,
      });

      const result = await service.deposit('user-1', {
        amountCents: 15000,
        description: 'Depósito inicial',
      });

      expect(result.previousBalanceCents).toBe(10000);
      expect(result.newBalanceCents).toBe(25000);
      expect(mockTx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { balanceCents: { increment: 15000 } },
      });
    });

    it('should offset negative balance and add remaining amount on deposit', async () => {
      mockTx.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        balanceCents: -5000,
      });

      mockTx.wallet.update.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        balanceCents: 7000,
      });

      mockTx.transaction.create.mockResolvedValue({
        id: 'tx-2',
        type: 'DEPOSIT',
        status: 'COMPLETED',
        amountCents: 12000,
      });

      const result = await service.deposit('user-1', {
        amountCents: 12000,
      });

      expect(result.previousBalanceCents).toBe(-5000);
      expect(result.newBalanceCents).toBe(7000);
    });

    it('should return cached transaction without updating balance when idempotency key is repeated', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-existing',
        type: 'DEPOSIT',
        status: 'COMPLETED',
        amountCents: 15000,
        receiverWalletId: 'wallet-1',
        idempotencyKey: 'idemp-key-1',
      });

      mockPrismaService.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        balanceCents: 25000,
      });

      const result = await service.deposit(
        'user-1',
        { amountCents: 15000 },
        'idemp-key-1',
      );

      expect(result.transaction.id).toBe('tx-existing');
      expect(result.isIdempotentReplay).toBe(true);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should reject an idempotency key already used by another wallet without leaking its transaction', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-from-someone-else',
        type: 'DEPOSIT',
        status: 'COMPLETED',
        amountCents: 15000,
        receiverWalletId: 'wallet-other',
        idempotencyKey: 'idemp-key-1',
      });

      mockPrismaService.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        balanceCents: 25000,
      });

      await expect(
        service.deposit('user-1', { amountCents: 15000 }, 'idemp-key-1'),
      ).rejects.toThrow(ConflictException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should reject an idempotency key reused with a different amount', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-existing',
        type: 'DEPOSIT',
        status: 'COMPLETED',
        amountCents: 15000,
        receiverWalletId: 'wallet-1',
        idempotencyKey: 'idemp-key-1',
      });

      mockPrismaService.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        balanceCents: 25000,
      });

      await expect(
        service.deposit('user-1', { amountCents: 99900 }, 'idemp-key-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('transfer', () => {
    it('should reject transfer to the same user', async () => {
      mockUsersService.findByEmailOrCpf.mockResolvedValue({
        id: 'user-1',
        name: 'Alice',
        wallet: { id: 'wallet-1', balanceCents: 10000 },
      });

      await expect(
        service.transfer('user-1', {
          recipientIdentifier: 'alice@email.com',
          amountCents: 5000,
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should reject transfer when sender has insufficient balance', async () => {
      mockUsersService.findByEmailOrCpf.mockResolvedValue({
        id: 'user-2',
        name: 'Bob',
        wallet: { id: 'wallet-2', balanceCents: 0 },
      });

      mockTx.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        balanceCents: 3000,
      });

      mockTx.wallet.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.transfer('user-1', {
          recipientIdentifier: 'bob@email.com',
          amountCents: 5000,
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should debit sender and credit receiver atomically when balance is sufficient', async () => {
      mockUsersService.findByEmailOrCpf.mockResolvedValue({
        id: 'user-2',
        name: 'Bob',
        wallet: { id: 'wallet-2', balanceCents: 1000 },
      });

      mockTx.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        balanceCents: 10000,
      });

      mockTx.wallet.updateMany.mockResolvedValue({ count: 1 });
      mockTx.wallet.update.mockResolvedValue({
        id: 'wallet-2',
        balanceCents: 6000,
      });
      mockTx.wallet.findUniqueOrThrow.mockResolvedValue({
        id: 'wallet-1',
        balanceCents: 5000,
      });
      mockTx.transaction.create.mockResolvedValue({
        id: 'tx-transfer-1',
        type: 'TRANSFER',
        status: 'COMPLETED',
        amountCents: 5000,
      });

      const result = await service.transfer('user-1', {
        recipientIdentifier: 'bob@email.com',
        amountCents: 5000,
      });

      expect(result.newBalanceCents).toBe(5000);
      expect(mockTx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-2' },
        data: { balanceCents: { increment: 5000 } },
      });
    });

    it('should return cached transaction without debiting balance when transfer idempotency key is replayed', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-existing-transfer',
        type: 'TRANSFER',
        status: 'COMPLETED',
        amountCents: 5000,
        senderWalletId: 'wallet-1',
        idempotencyKey: 'idemp-tx-1',
      });

      mockPrismaService.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        balanceCents: 8000,
      });

      const result = await service.transfer(
        'user-1',
        {
          recipientIdentifier: 'bob@email.com',
          amountCents: 5000,
        },
        'idemp-tx-1',
      );

      expect(result.transaction.id).toBe('tx-existing-transfer');
      expect(result.isIdempotentReplay).toBe(true);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('reverseTransaction', () => {
    it('should forbid reversal if user is not a participant of the transaction', async () => {
      mockTx.wallet.findUnique.mockResolvedValue({
        id: 'wallet-outsider',
        userId: 'user-outsider',
      });

      mockTx.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        type: 'TRANSFER',
        status: 'COMPLETED',
        amountCents: 5000,
        senderWalletId: 'wallet-1',
        receiverWalletId: 'wallet-2',
        createdAt: new Date(),
      });

      await expect(
        service.reverseTransaction('user-outsider', 'tx-1', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if transaction was already reversed', async () => {
      mockTx.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
      });

      mockTx.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        type: 'TRANSFER',
        status: 'REVERSED',
        amountCents: 5000,
        senderWalletId: 'wallet-1',
        receiverWalletId: 'wallet-2',
        createdAt: new Date(),
      });

      await expect(
        service.reverseTransaction('user-1', 'tx-1', {}),
      ).rejects.toThrow(ConflictException);
    });

    it('should reverse a completed transfer and restore balances', async () => {
      mockTx.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
      });

      mockTx.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        type: 'TRANSFER',
        status: 'COMPLETED',
        amountCents: 5000,
        senderWalletId: 'wallet-1',
        receiverWalletId: 'wallet-2',
        createdAt: new Date(),
      });

      mockTx.transaction.updateMany.mockResolvedValue({ count: 1 });
      mockTx.transaction.create.mockResolvedValue({
        id: 'tx-rev-1',
        type: 'REVERSAL',
        status: 'COMPLETED',
        amountCents: 5000,
        originalTransactionId: 'tx-1',
      });
      mockTx.wallet.findUniqueOrThrow.mockResolvedValue({
        id: 'wallet-1',
        balanceCents: 10000,
      });

      const result = await service.reverseTransaction('user-1', 'tx-1', {
        reason: 'Valor incorreto',
      });

      expect(result.newBalanceCents).toBe(10000);
      expect(result.reversalTransaction.type).toBe('REVERSAL');
      expect(mockTx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-2' },
        data: { balanceCents: { decrement: 5000 } },
      });
      expect(mockTx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { balanceCents: { increment: 5000 } },
      });
    });
  });

  describe('SQLite lock handling', () => {
    const lockError = () =>
      new Prisma.PrismaClientKnownRequestError('write conflict', {
        code: 'P2034',
        clientVersion: 'test',
      });

    it('classifies P2034 and "database is locked" as transient, business errors as not', () => {
      expect(WalletService.isTransientLockError(lockError())).toBe(true);
      expect(
        WalletService.isTransientLockError(
          new Error('SQLITE_BUSY: database is locked'),
        ),
      ).toBe(true);
      expect(
        WalletService.isTransientLockError(
          new UnprocessableEntityException('Saldo insuficiente'),
        ),
      ).toBe(false);
    });

    it('retries a deposit after a transient lock error and succeeds without double credit', async () => {
      mockPrismaService.$transaction.mockImplementationOnce(() =>
        Promise.reject(lockError()),
      );
      mockTx.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        balanceCents: 0,
      });
      mockTx.wallet.update.mockResolvedValue({
        id: 'wallet-1',
        balanceCents: 5000,
      });
      mockTx.transaction.create.mockResolvedValue({
        id: 'tx-1',
        type: 'DEPOSIT',
        amountCents: 5000,
      });

      const result = await service.deposit('user-1', { amountCents: 5000 });

      expect(result.newBalanceCents).toBe(5000);
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(2);
      expect(mockTx.transaction.create).toHaveBeenCalledTimes(1);
    });
  });
});
