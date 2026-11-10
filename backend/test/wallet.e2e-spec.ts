import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Financial Wallet Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenUserA: string;
  let tokenUserB: string;
  let transferTransactionId: string;

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
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();

    prisma = app.get(PrismaService);
    await prisma.transaction.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health - should report healthy service and database', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('up');
  });

  it('POST /api/auth/register - should register User A and User B with zeroed wallets', async () => {
    const resA = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Alice Cobuccio',
        email: 'alice@cobuccio.com',
        cpf: '111.222.333-44',
        password: 'password123',
      })
      .expect(201);

    tokenUserA = resA.body.accessToken;
    expect(resA.body.user.wallet.balanceCents).toBe(0);

    const resB = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Bruno Invest',
        email: 'bruno@cobuccio.com',
        cpf: '555.666.777-88',
        password: 'password123',
      })
      .expect(201);

    tokenUserB = resB.body.accessToken;
    expect(resB.body.user.wallet.balanceCents).toBe(0);
  });

  it('POST /api/wallet/deposit - should deposit R$ 200,00 (20000 cents) into User A wallet', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        amountCents: 20000,
        description: 'Aporte inicial',
      })
      .expect(201);

    expect(res.body.newBalanceCents).toBe(20000);
  });

  it('POST /api/wallet/transfer - should transfer R$ 80,00 (8000 cents) from User A to User B', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        recipientIdentifier: 'bruno@cobuccio.com',
        amountCents: 8000,
        description: 'Pagamento de serviço',
      })
      .expect(201);

    expect(res.body.newBalanceCents).toBe(12000);
    transferTransactionId = res.body.transaction.id;
  });

  it('POST /api/wallet/transactions/:id/reverse - should reverse the transfer and handle negative balance recovery on deposit', async () => {
    await request(app.getHttpServer())
      .post('/api/wallet/transfer')
      .set('Authorization', `Bearer ${tokenUserB}`)
      .send({
        recipientIdentifier: '11122233344',
        amountCents: 5000,
        description: 'Transferência parcial de Bruno',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/wallet/transactions/${transferTransactionId}/reverse`)
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        reason: 'Estorno solicitado pelo remetente',
      })
      .expect(200);

    const summaryB = await request(app.getHttpServer())
      .get('/api/wallet')
      .set('Authorization', `Bearer ${tokenUserB}`)
      .expect(200);

    expect(summaryB.body.balanceCents).toBe(-5000);
    expect(summaryB.body.isNegative).toBe(true);

    const depositRecoveryB = await request(app.getHttpServer())
      .post('/api/wallet/deposit')
      .set('Authorization', `Bearer ${tokenUserB}`)
      .send({
        amountCents: 12000,
        description: 'Depósito para cobrir saldo negativo',
      })
      .expect(201);

    expect(depositRecoveryB.body.previousBalanceCents).toBe(-5000);
    expect(depositRecoveryB.body.newBalanceCents).toBe(7000);
  });
});

