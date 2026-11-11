import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Money } from './money.vo';
import {
  TransactionDomainRules,
  TransactionStatus,
  TransactionType,
} from './transaction-rules.domain';

describe('Wallet Domain - Money Value Object & Transaction Rules (TDD)', () => {
  describe('Money Value Object', () => {
    it('should create a valid Money instance from positive integer cents', () => {
      const money = Money.fromCents(1050);
      expect(money.valueInCents).toBe(1050);
    });

    it('should reject floating point numbers to prevent IEEE 754 precision loss', () => {
      expect(() => Money.fromCents(10.5)).toThrow(BadRequestException);
    });

    it('should reject zero or negative monetary amounts', () => {
      expect(() => Money.fromCents(0)).toThrow(BadRequestException);
      expect(() => Money.fromCents(-500)).toThrow(BadRequestException);
    });

    it('should accurately calculate new balance when depositing into a negative wallet', () => {
      const depositAmount = Money.fromCents(12000);
      const updatedBalance = depositAmount.addToBalance(-5000);
      expect(updatedBalance).toBe(7000);
    });
  });

  describe('TransactionDomainRules', () => {
    it('should reject self-transfer when sender and recipient are identical', () => {
      const amount = Money.fromCents(5000);

      expect(() =>
        TransactionDomainRules.validateTransferPreconditions({
          senderUserId: 'user-1',
          recipientUserId: 'user-1',
          senderBalanceCents: 10000,
          amount,
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject transfer when balance does not cover the requested amount', () => {
      const amount = Money.fromCents(8000);

      expect(() =>
        TransactionDomainRules.validateTransferPreconditions({
          senderUserId: 'user-1',
          recipientUserId: 'user-2',
          senderBalanceCents: 5000,
          amount,
        }),
      ).toThrow(BadRequestException);
    });

    it('should forbid reversal when requester is neither sender nor receiver', () => {
      expect(() =>
        TransactionDomainRules.validateReversalPreconditions(
          {
            type: TransactionType.TRANSFER,
            status: TransactionStatus.COMPLETED,
            senderWalletId: 'wallet-1',
            receiverWalletId: 'wallet-2',
            createdAt: new Date(),
          },
          'wallet-outsider',
        ),
      ).toThrow(ForbiddenException);
    });

    it('should reject reversing a transaction that is already a REVERSAL', () => {
      expect(() =>
        TransactionDomainRules.validateReversalPreconditions(
          {
            type: TransactionType.REVERSAL,
            status: TransactionStatus.COMPLETED,
            senderWalletId: 'wallet-1',
            receiverWalletId: 'wallet-2',
            createdAt: new Date(),
          },
          'wallet-1',
        ),
      ).toThrow(BadRequestException);
    });

    it('should reject reversing an already REVERSED transaction', () => {
      expect(() =>
        TransactionDomainRules.validateReversalPreconditions(
          {
            type: TransactionType.TRANSFER,
            status: TransactionStatus.REVERSED,
            senderWalletId: 'wallet-1',
            receiverWalletId: 'wallet-2',
            createdAt: new Date(),
          },
          'wallet-1',
        ),
      ).toThrow(ConflictException);
    });

    it('should allow sender to reverse transfer within 15 minutes repentance window', () => {
      const now = new Date('2026-11-11T12:10:00Z');
      const createdAt = new Date('2026-11-11T12:00:00Z'); // 10 minutes ago

      expect(() =>
        TransactionDomainRules.validateReversalPreconditions(
          {
            type: TransactionType.TRANSFER,
            status: TransactionStatus.COMPLETED,
            senderWalletId: 'wallet-1',
            receiverWalletId: 'wallet-2',
            createdAt,
          },
          'wallet-1',
          now,
        ),
      ).not.toThrow();
    });

    it('should reject sender reversing transfer after 15 minutes repentance window', () => {
      const now = new Date('2026-11-11T12:20:00Z');
      const createdAt = new Date('2026-11-11T12:00:00Z'); // 20 minutes ago

      expect(() =>
        TransactionDomainRules.validateReversalPreconditions(
          {
            type: TransactionType.TRANSFER,
            status: TransactionStatus.COMPLETED,
            senderWalletId: 'wallet-1',
            receiverWalletId: 'wallet-2',
            createdAt,
          },
          'wallet-1',
          now,
        ),
      ).toThrow(BadRequestException);
    });

    it('should allow recipient to return transfer within 24 hours', () => {
      const now = new Date('2026-11-11T20:00:00Z');
      const createdAt = new Date('2026-11-11T12:00:00Z'); // 8 hours ago

      expect(() =>
        TransactionDomainRules.validateReversalPreconditions(
          {
            type: TransactionType.TRANSFER,
            status: TransactionStatus.COMPLETED,
            senderWalletId: 'wallet-1',
            receiverWalletId: 'wallet-2',
            createdAt,
          },
          'wallet-2',
          now,
        ),
      ).not.toThrow();
    });

    it('should reject recipient returning transfer after 24 hours', () => {
      const now = new Date('2026-11-12T13:00:00Z');
      const createdAt = new Date('2026-11-11T12:00:00Z'); // 25 hours ago

      expect(() =>
        TransactionDomainRules.validateReversalPreconditions(
          {
            type: TransactionType.TRANSFER,
            status: TransactionStatus.COMPLETED,
            senderWalletId: 'wallet-1',
            receiverWalletId: 'wallet-2',
            createdAt,
          },
          'wallet-2',
          now,
        ),
      ).toThrow(BadRequestException);
    });

    it('should reject non-owner reversing a deposit', () => {
      expect(() =>
        TransactionDomainRules.validateReversalPreconditions(
          {
            type: TransactionType.DEPOSIT,
            status: TransactionStatus.COMPLETED,
            senderWalletId: null,
            receiverWalletId: 'wallet-1',
            createdAt: new Date(),
          },
          'wallet-other',
        ),
      ).toThrow(ForbiddenException);
    });

    it('should reject deposit owner reversing after 24 hours', () => {
      const now = new Date('2026-11-12T13:00:00Z');
      const createdAt = new Date('2026-11-11T12:00:00Z'); // 25 hours ago

      expect(() =>
        TransactionDomainRules.validateReversalPreconditions(
          {
            type: TransactionType.DEPOSIT,
            status: TransactionStatus.COMPLETED,
            senderWalletId: null,
            receiverWalletId: 'wallet-1',
            createdAt,
          },
          'wallet-1',
          now,
        ),
      ).toThrow(BadRequestException);
    });

    describe('getReversalState', () => {
      const transfer = {
        type: TransactionType.TRANSFER,
        status: TransactionStatus.COMPLETED,
        senderWalletId: 'wallet-1',
        receiverWalletId: 'wallet-2',
        createdAt: new Date('2026-11-11T12:00:00Z'),
      };

      it('should be AVAILABLE while the sender is inside the 15-minute window', () => {
        const now = new Date('2026-11-11T12:10:00Z');

        expect(TransactionDomainRules.getReversalState(transfer, 'wallet-1', now)).toBe('AVAILABLE');
      });

      it('should be EXPIRED once the sender window has passed', () => {
        const now = new Date('2026-11-11T12:20:00Z');

        expect(TransactionDomainRules.getReversalState(transfer, 'wallet-1', now)).toBe('EXPIRED');
      });

      it('should be UNAVAILABLE for an already reversed transaction', () => {
        const now = new Date('2026-11-11T12:05:00Z');

        expect(
          TransactionDomainRules.getReversalState(
            { ...transfer, status: TransactionStatus.REVERSED },
            'wallet-1',
            now,
          ),
        ).toBe('UNAVAILABLE');
      });

      it('should be UNAVAILABLE for a wallet that did not take part in the transaction', () => {
        const now = new Date('2026-11-11T12:05:00Z');

        expect(TransactionDomainRules.getReversalState(transfer, 'wallet-9', now)).toBe('UNAVAILABLE');
      });
    });
  });
});

