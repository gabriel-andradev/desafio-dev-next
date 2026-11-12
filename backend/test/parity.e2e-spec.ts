import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Business-parity scenarios shared with the PHP version (same inputs, same outcome, same HTTP status).
 */
describe('Parity scenarios (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cpfCounter = 10_000_000_000;

  const http = () => request(app.getHttpServer());

  // Users are created straight in the database with a signed JWT: going through /auth/register for
  // every scenario would hit the 10 req/min rate limit (covered by its own scenario below).
  async function registerWithBalance(email: string, balanceCents: number) {
    const user = await prisma.user.create({
      data: {
        name: 'Usuário Teste',
        email,
        cpf: String(cpfCounter++),
        passwordHash: await bcrypt.hash('password123', 4),
        wallet: { create: { balanceCents } },
      },
    });

    const token = await app
      .get(JwtService)
      .signAsync({ sub: user.id, email: user.email });

    return { token, userId: user.id };
  }

  const balanceOf = async (userId: string) =>
    (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balanceCents;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: 422,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.transaction.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await app.close();
  });

  it('rejects duplicate e-mail and duplicate CPF with 409', async () => {
    const payload = {
      name: 'Gabriel',
      email: 'dup@test.com',
      cpf: '12345678901',
      password: 'password123',
    };
    await http().post('/api/auth/register').send(payload).expect(201);

    await http()
      .post('/api/auth/register')
      .send({ ...payload, cpf: '10987654321' })
      .expect(409);
    await http()
      .post('/api/auth/register')
      .send({ ...payload, email: 'other@test.com' })
      .expect(409);
  });

  it('rejects invalid login with 401 and a generic message', async () => {
    await registerWithBalance('login@test.com', 0);

    const res = await http()
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'wrong-password' })
      .expect(401);

    expect(res.body.message).toBe('E-mail ou senha inválidos.');
  });

  it('rejects zero, negative and above-ceiling deposits with 422', async () => {
    const { token } = await registerWithBalance('deposit@test.com', 0);

    for (const amountCents of [0, -100, 100_000_001]) {
      await http()
        .post('/api/wallet/deposit')
        .set('Authorization', `Bearer ${token}`)
        .send({ amountCents })
        .expect(422);
    }
  });

  it('rejects a transfer to yourself (422) and to an unknown recipient (404)', async () => {
    const { token } = await registerWithBalance('self@test.com', 10_000);

    await http()
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ recipientIdentifier: 'self@test.com', amountCents: 100 })
      .expect(422);

    await http()
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ recipientIdentifier: 'nobody@test.com', amountCents: 100 })
      .expect(404);
  });

  it('rejects reusing an idempotency key for a different operation with 409', async () => {
    const user = await registerWithBalance('reuse@test.com', 0);
    const send = (amountCents: number) =>
      http()
        .post('/api/wallet/deposit')
        .set('Authorization', `Bearer ${user.token}`)
        .set('x-idempotency-key', 'reused-key')
        .send({ amountCents });

    await send(5_000).expect(201);
    await send(9_999).expect(409);
    expect(await balanceOf(user.userId)).toBe(5_000);
  });

  it("returns 409 for another user's idempotency key without exposing the transaction", async () => {
    const alice = await registerWithBalance('alice@test.com', 0);
    const bob = await registerWithBalance('bob@test.com', 0);
    const deposit = (token: string) =>
      http()
        .post('/api/wallet/deposit')
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', 'alice-key')
        .send({ amountCents: 5_000 });

    await deposit(alice.token).expect(201);
    const res = await deposit(bob.token).expect(409);

    expect(res.body.transaction).toBeUndefined();
    expect(await balanceOf(bob.userId)).toBe(0);
  });

  it('rolls back the debit and the credit when the ledger insert fails mid-transfer', async () => {
    const sender = await registerWithBalance('rollback-a@test.com', 10_000);
    const receiver = await registerWithBalance('rollback-b@test.com', 1_000);

    // Wrap the interactive transaction so that inserting the ledger row fails after the balances changed.
    const originalTransaction = prisma.$transaction.bind(prisma) as (
      fn: (tx: unknown) => Promise<unknown>,
    ) => Promise<unknown>;
    jest.spyOn(prisma, '$transaction').mockImplementationOnce(((
      fn: (tx: unknown) => Promise<unknown>,
    ) =>
      originalTransaction((tx) =>
        fn(
          new Proxy(tx as object, {
            get(target, prop) {
              const value = Reflect.get(target, prop);
              if (prop !== 'transaction') return value;
              return new Proxy(value as object, {
                get(model, method) {
                  if (method === 'create') {
                    return () =>
                      Promise.reject(new Error('Simulated ledger failure'));
                  }
                  return Reflect.get(model, method);
                },
              });
            },
          }),
        ),
      )) as never);

    await http()
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${sender.token}`)
      .send({ recipientIdentifier: 'rollback-b@test.com', amountCents: 4_000 })
      .expect(500);

    expect(await balanceOf(sender.userId)).toBe(10_000);
    expect(await balanceOf(receiver.userId)).toBe(1_000);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it('enforces reversal rules: non-participant 403, outside window 422, duplicate 409', async () => {
    const sender = await registerWithBalance('rev-a@test.com', 10_000);
    await registerWithBalance('rev-b@test.com', 0);
    const outsider = await registerWithBalance('rev-c@test.com', 0);

    const transfer = await http()
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${sender.token}`)
      .send({ recipientIdentifier: 'rev-b@test.com', amountCents: 3_000 })
      .expect(201);
    const id = transfer.body.transaction.id as string;
    const reverse = (token: string) =>
      http()
        .post(`/api/wallet/transactions/${id}/reverse`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

    await reverse(outsider.token).expect(403);
    await reverse(sender.token).expect(200);
    await reverse(sender.token).expect(409);

    const late = await http()
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${sender.token}`)
      .send({ recipientIdentifier: 'rev-b@test.com', amountCents: 1_000 })
      .expect(201);
    await prisma.transaction.update({
      where: { id: late.body.transaction.id },
      data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
    });
    await http()
      .post(`/api/wallet/transactions/${late.body.transaction.id}/reverse`)
      .set('Authorization', `Bearer ${sender.token}`)
      .send({})
      .expect(422);
  });

  it('logout revokes the JWT: the old token stops working, a new login works', async () => {
    await registerWithBalance('logout@test.com', 0);
    const login = () =>
      http()
        .post('/api/auth/login')
        .send({ email: 'logout@test.com', password: 'password123' })
        .expect(200);

    const oldToken = (await login()).body.accessToken as string;
    await http()
      .get('/api/wallet')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(200);

    await http()
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(204);
    await http()
      .get('/api/wallet')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(401);

    const newToken = (await login()).body.accessToken as string;
    await http()
      .get('/api/wallet')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);
  });

  it('rate-limits login attempts: at most 10 per minute, then 429', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt++) {
      const res = await http()
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'wrong-password' });
      statuses.push(res.status);
    }

    // Earlier scenarios in this file already used part of the per-minute budget.
    expect(statuses).toContain(429);
    expect(
      statuses.filter((status) => status !== 429).length,
    ).toBeLessThanOrEqual(10);
  });
});
