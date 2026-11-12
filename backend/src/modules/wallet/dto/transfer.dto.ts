import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Money } from '../domain/money.vo';
import { Transform } from 'class-transformer';

export class TransferDto {
  @IsString({ message: 'Informe o e-mail ou CPF do destinatário.' })
  @IsNotEmpty({ message: 'O destinatário é obrigatório.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  recipientIdentifier!: string;

  @IsInt({ message: 'O valor da transferência deve ser informado em centavos (inteiro).' })
  @Min(1, { message: 'O valor mínimo para transferência é de R$ 0,01 (1 centavo).' })
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
  @MaxLength(100, { message: 'A chave de idempotência deve ter no máximo 100 caracteres.' })
  idempotencyKey?: string;
}

