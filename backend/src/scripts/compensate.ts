import { NestFactory } from '@nestjs/core';
import { HttpException, Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { WalletService } from '../modules/wallet/wallet.service';

/**
 * Internal compensation of a technical inconsistency. There is deliberately no HTTP route for this:
 * running it requires shell access to the server, which is the trusted origin.
 *
 * Usage:
 *   npm run wallet:compensate -- --transaction=<id> --reason="<justificativa>" --operator=<responsável>
 */
function readOption(name: string): string {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

async function main(): Promise<number> {
  const logger = new Logger('wallet:compensate');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const reversal = await app
      .get(WalletService)
      .compensateTransaction(
        readOption('transaction'),
        readOption('reason'),
        readOption('operator'),
      );

    logger.log(
      `Compensação registrada: lançamento ${reversal.id} (origem COMPENSATION, ${reversal.reversalActor}).`,
    );
    console.log(JSON.stringify({ ok: true, reversalId: reversal.id }));
    return 0;
  } catch (error) {
    const message =
      error instanceof HttpException || error instanceof Error
        ? error.message
        : String(error);
    console.error(JSON.stringify({ ok: false, error: message }));
    return 1;
  } finally {
    await app.close();
  }
}

main().then((code) => process.exit(code));
