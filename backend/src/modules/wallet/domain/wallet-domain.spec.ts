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
          },
          'wallet-1',
        ),
      ).toThrow(ConflictException);
    });
  });
});

