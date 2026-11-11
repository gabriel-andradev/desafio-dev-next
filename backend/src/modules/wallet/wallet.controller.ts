import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Consulta o saldo atual e histórico completo da carteira' })
  async getWalletSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getWalletSummary(user.id);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Lista o extrato de movimentações da carteira' })
  async listTransactions(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.listTransactions(user.walletId);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('deposit')
  @ApiOperation({ summary: 'Realiza depósito em centavos na carteira do usuário' })
  async deposit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DepositDto,
    @Headers('x-idempotency-key') headerIdempotencyKey?: string,
  ) {
    const idempotencyKey = headerIdempotencyKey || dto.idempotencyKey;
    return this.walletService.deposit(user.id, dto, idempotencyKey);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('transfer')
  @ApiOperation({ summary: 'Transfere saldo de forma atômica para outro usuário via e-mail ou CPF' })
  async transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TransferDto,
    @Headers('x-idempotency-key') headerIdempotencyKey?: string,
  ) {
    const idempotencyKey = headerIdempotencyKey || dto.idempotencyKey;
    return this.walletService.transfer(user.id, dto, idempotencyKey);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('transactions/:id/reverse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicita a reversão atômica de um depósito ou transferência' })
  async reverseTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') transactionId: string,
    @Body() dto: ReverseTransactionDto,
  ) {
    return this.walletService.reverseTransaction(user.id, transactionId, dto);
  }
}
