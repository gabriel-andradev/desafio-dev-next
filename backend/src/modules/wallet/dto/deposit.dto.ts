import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Money } from '../domain/money.vo';

export class DepositDto {
  @IsInt({ message: 'O valor do depósito deve ser informado em centavos (inteiro).' })
  @Min(1, { message: 'O valor mínimo para depósito é de R$ 0,01 (1 centavo).' })
  @Max(Money.MAX_OPERATION_CENTS, {
    message: 'O valor excede o limite máximo permitido por operação.',
  })
  amountCents!: number;

  @IsOptional()
  @IsString({ message: 'A descrição deve ser um texto válido.' })
  @MaxLength(140, { message: 'A descrição deve ter no máximo 140 caracteres.' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'A chave de idempotência deve ser uma string válida.' })
  idempotencyKey?: string;
}

