/**
 * Worker used by multi-process.e2e-spec.ts: each invocation is a separate Node.js process (a real
 * concurrent client) using the same SQLite file passed in DATABASE_URL. Every worker waits for the same
 * instant (startAtEpochMs) so the operations really overlap. `fail-transfer` runs the same transfer but
 * makes the ledger insert fail after debit and credit, so everything must roll back.
 *
 * Usage: wallet-worker.ts <setup|transfer|deposit|fail-transfer|inspect> [startAtEpochMs] [idempotencyKey]
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WalletService } from '../../src/modules/wallet/wallet.service';

/** The test reads only this marked line (editor extensions may also write to stdout). */
function emit(result: Record<string, unknown>): void {
  process.stdout.write('\nRESULT:' + JSON.stringify(result) + '\n');
}

async function main(): Promise<void> {
  const [mode, startAtRaw, idempotencyKey] = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const prisma = app.get(PrismaService);
  const wallet = app.get(WalletService);

  const startAt = Number(startAtRaw || 0);
  while (startAt > Date.now()) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  const userId = async (email: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

  try {
    let result: Record<string, unknown>;

    switch (mode) {
      case 'setup':
        await prisma.transaction.deleteMany();
        await prisma.wallet.deleteMany();
        await prisma.user.deleteMany();
        for (const [email, cpf, balanceCents] of [
          ['sender@test.com', '11111111111', 10_000],
          ['receiver@test.com', '22222222222', 0],
        ] as const) {
          await prisma.user.create({
            data: {
              name: email,
              email,
              cpf,
              passwordHash: 'x',
              wallet: { create: { balanceCents } },
            },
          });
        }
        result = { ok: true };
        break;

      case 'transfer': {
        const res = await wallet.transfer(
          await userId('sender@test.com'),
          { recipientIdentifier: 'receiver@test.com', amountCents: 8_000 },
          idempotencyKey,
        );
        result = {
          ok: true,
          id: res.transaction.id,
          replay: res.isIdempotentReplay,
        };
        break;
      }

      case 'deposit': {
        const res = await wallet.deposit(
          await userId('receiver@test.com'),
          { amountCents: 5_000 },
          idempotencyKey,
        );
        result = {
          ok: true,
          id: res.transaction.id,
          replay: res.isIdempotentReplay,
        };
        break;
      }

      case 'fail-transfer': {
        const original = prisma.$transaction.bind(prisma) as (
          fn: (tx: unknown) => Promise<unknown>,
        ) => Promise<unknown>;
        (prisma as unknown as { $transaction: unknown }).$transaction = (
          fn: (tx: unknown) => Promise<unknown>,
        ) =>
          original((tx) =>
            fn(
              new Proxy(tx as object, {
                get(target, prop) {
                  const value = Reflect.get(target, prop);
                  if (prop !== 'transaction') return value;
                  return new Proxy(value as object, {
                    get: (model, method) =>
                      method === 'create'
                        ? () =>
                            Promise.reject(
                              new Error('Simulated ledger failure'),
                            )
                        : Reflect.get(model, method),
                  });
                },
              }),
            ),
          );
        await wallet.transfer(await userId('sender@test.com'), {
          recipientIdentifier: 'receiver@test.com',
          amountCents: 3_000,
        });
        result = { ok: true };
        break;
      }

      case 'inspect': {
        const balance = async (email: string) =>
          (await prisma.wallet.findFirstOrThrow({ where: { user: { email } } }))
            .balanceCents;
        result = {
          ok: true,
          sender: await balance('sender@test.com'),
          receiver: await balance('receiver@test.com'),
          transfers: await prisma.transaction.count({
            where: { type: 'TRANSFER' },
          }),
          deposits: await prisma.transaction.count({
            where: { type: 'DEPOSIT' },
          }),
        };
        break;
      }

      default:
        throw new Error(`Unknown mode: ${mode}`);
    }

    emit(result);
  } catch (error) {
    const err = error as { message?: string; status?: number; code?: string };
    emit({ ok: false, status: err.status, code: err.code, error: err.message });
  } finally {
    await app.close();
  }
}

void main();
