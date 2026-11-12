import { UnprocessableEntityException } from '@nestjs/common';

export class Money {
  /**
   * Ceiling per operation: R$ 1.000.000,00. A conservative business decision of this implementation
   * (not a requirement of the challenge), shared with the PHP version.
   */
  static readonly MAX_OPERATION_CENTS = 100_000_000;

  private readonly cents: number;

  private constructor(cents: number) {
    this.cents = cents;
  }

  /**
   * Creates a validated Money value object from an integer amount in cents.
   */
  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents)) {
      throw new UnprocessableEntityException(
        'O valor monetário deve ser representado em centavos inteiros.',
      );
    }

    if (cents <= 0) {
      throw new UnprocessableEntityException(
        'O valor da operação deve ser maior que zero.',
      );
    }

    if (cents > Money.MAX_OPERATION_CENTS) {
      throw new UnprocessableEntityException(
        'O valor excede o limite máximo permitido por operação.',
      );
    }

    return new Money(cents);
  }

  /**
   * Returns the raw integer value in cents.
   */
  get valueInCents(): number {
    return this.cents;
  }

  /**
   * Checks whether a given wallet balance in cents is sufficient to cover this monetary amount.
   */
  isCoveredBy(balanceCents: number): boolean {
    return balanceCents >= this.cents;
  }
}

