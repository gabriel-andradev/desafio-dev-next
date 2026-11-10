import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async getWalletSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getWalletSummary(user.id);
  }

  @Get('transactions')
  async listTransactions(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.listTransactions(user.walletId);
  }

  @Post('deposit')
  async deposit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DepositDto,
  ) {
    return this.walletService.deposit(user.id, dto);
  }

  @Post('transfer')
  async transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TransferDto,
  ) {
    return this.walletService.transfer(user.id, dto);
  }

  @Post('transactions/:id/reverse')
  @HttpCode(HttpStatus.OK)
  async reverseTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') transactionId: string,
    @Body() dto: ReverseTransactionDto,
  ) {
    return this.walletService.reverseTransaction(user.id, transactionId, dto);
  }
}

