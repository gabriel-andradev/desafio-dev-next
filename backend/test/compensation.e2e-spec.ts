import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Internal compensation of technical inconsistencies (`npm run wallet:compensate`).
 * Mirror of tests/Feature/CompensationTest.php in the PHP repository.
 */
describe('Internal compensation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let wallet: WalletService;

  async function userWithBalance(
    email: string,
    cpf: string,
    balanceCents: number,
  ) {
    return prisma.user.create({
      data: {
        name: 'Usuário Teste',
        email,
        cpf,
        passwordHash: 'not-used',
        wallet: { create: { balanceCents } },
      },
      include: { wallet: true },
    });
  }

  async function transferOf(amountCents: number, createdAt: Date) {
    const sender = await userWithBalance('a@test.com', '11111111111', 10_000);
    const receiver = await userWithBalance('b@test.com', '22222222222', 0);
    await prisma.wallet.update({
      where: { id: sender.wallet!.id },
      data: { balanceCents: { decrement: amountCents } },
    });
    await prisma.wallet.update({
      where: { id: receiver.wallet!.id },
      data: { balanceCents: { increment: amountCents } },
    });
    const transfer = await prisma.transaction.create({
      data: {
        type: 'TRANSFER',
        amountCents,
        senderWalletId: sender.wallet!.id,
        receiverWalletId: receiver.wallet!.id,
        createdAt,
      },
    });
    return { sender, receiver, transfer };
  }

  const balanceOf = async (walletId: string) =>
    (await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } }))
      .balanceCents;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        errorHttpStatusCode: 422,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    wallet = app.get(WalletService);
  });

  beforeEach(async () => {
    await prisma.transaction.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('compensates a transfer outside the user windows and audits source and operator', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const { sender, receiver, transfer } = await transferOf(3_000, twoDaysAgo);

    const reversal = await wallet.compensateTransaction(
      transfer.id,
      'Crédito duplicado identificado na conciliação',
      'ops.conciliacao',
    );

    expect(await balanceOf(sender.wallet!.id)).toBe(10_000);
    expect(await balanceOf(receiver.wallet!.id)).toBe(0);
    expect(
      (
        await prisma.transaction.findUniqueOrThrow({
          where: { id: transfer.id },
        })
      ).status,
    ).toBe('REVERSED');
    expect(reversal.type).toBe('REVERSAL');
    expect(reversal.originalTransactionId).toBe(transfer.id);
    expect(reversal.reversalSource).toBe('COMPENSATION');
    expect(reversal.reversalActor).toBe('operator:ops.conciliacao');
    expect(reversal.reversalReason).toContain('Crédito duplicado');
  });

  it('does not compensate the same transaction twice', async () => {
    const { transfer } = await transferOf(3_000, new Date());
    const reason = 'Crédito duplicado identificado na conciliação';

    await wallet.compensateTransaction(transfer.id, reason, 'ops');
    await expect(
      wallet.compensateTransaction(transfer.id, reason, 'ops'),
    ).rejects.toMatchObject({ status: 409 });

    expect(
      await prisma.transaction.count({ where: { type: 'REVERSAL' } }),
    ).toBe(1);
  });

  it('requires a justification and an operator', async () => {
    const { sender, transfer } = await transferOf(3_000, new Date());

    await expect(
      wallet.compensateTransaction(transfer.id, 'curto', 'ops'),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      wallet.compensateTransaction(transfer.id, 'Justificativa suficiente', ''),
    ).rejects.toMatchObject({
      status: 422,
    });

    expect(await balanceOf(sender.wallet!.id)).toBe(7_000);
    expect(
      await prisma.transaction.count({ where: { type: 'REVERSAL' } }),
    ).toBe(0);
  });

  it('exposes no HTTP route for compensation', async () => {
    const { transfer } = await transferOf(3_000, new Date());

    await request(app.getHttpServer())
      .post(`/api/wallet/transactions/${transfer.id}/compensate`)
      .send({})
      .expect(404);
  });

  it('runs end-to-end through the internal script (the only entry point)', async () => {
    const { sender, transfer } = await transferOf(
      3_000,
      new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    );

    const result = spawnSync(
      'npx ts-node src/scripts/compensate.ts',
      [
        `--transaction=${transfer.id}`,
        '"--reason=Crédito duplicado na conciliação"',
        '--operator=ops',
      ],
      {
        cwd: path.join(__dirname, '..'),
        env: process.env,
        shell: true,
        encoding: 'utf-8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"ok":true');
    expect(await balanceOf(sender.wallet!.id)).toBe(10_000);
  }, 60_000);
});
