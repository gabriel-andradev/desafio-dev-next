import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class ReverseTransactionDto {
  @IsOptional()
  @IsString({ message: 'O motivo da reversão deve ser um texto válido.' })
  @MaxLength(200, {
    message: 'O motivo da reversão deve ter no máximo 200 caracteres.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason?: string;
}

