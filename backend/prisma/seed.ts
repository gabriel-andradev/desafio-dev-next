import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const REVERSAL_REASON = 'Inconsistência operacional de liquidação';

/**
 * Seeds the same three demonstration accounts used by the PHP/Laravel version of this challenge:
 * two positive balances with P2P history and one negative balance left by a reversed deposit.
 */
async function main() {
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash('password123', 10);

  const createUser = (name: string, email: string, cpf: string, balanceCents: number) =>
    prisma.user.create({
      data: { name, email, cpf, passwordHash, wallet: { create: { balanceCents } } },
      include: { wallet: true },
    });

  const gabriel = await createUser('Gabriel Cobuccio', 'gabriel@cobuccio.com', '11122233344', 145000);
  const bruno = await createUser('Bruno Costa', 'bruno@cobuccio.com', '55566677788', 80000);
  const mariana = await createUser('Mariana Souza', 'mariana@cobuccio.com', '99988877766', -25000);

  if (!gabriel.wallet || !bruno.wallet || !mariana.wallet) {
    throw new Error('Seed failed to provision wallets.');
  }

  await prisma.transaction.create({
    data: {
      type: 'DEPOSIT',
      amountCents: 200000,
      description: 'Aporte inicial em conta',
      receiverWalletId: gabriel.wallet.id,
    },
  });

  await prisma.transaction.create({
    data: {
      type: 'TRANSFER',
      amountCents: 55000,
      description: 'Transferência entre contas',
      senderWalletId: gabriel.wallet.id,
      receiverWalletId: bruno.wallet.id,
    },
  });

  await prisma.transaction.create({
    data: {
      type: 'DEPOSIT',
      amountCents: 25000,
      description: 'Depósito direto',
      receiverWalletId: bruno.wallet.id,
    },
  });

  const reversedDeposit = await prisma.transaction.create({
    data: {
      type: 'DEPOSIT',
      status: 'REVERSED',
      amountCents: 25000,
      description: 'Depósito revertido após utilização parcial',
      receiverWalletId: mariana.wallet.id,
      reversalReason: REVERSAL_REASON,
      reversedAt: new Date(),
    },
  });

  await prisma.transaction.create({
    data: {
      type: 'REVERSAL',
      amountCents: 25000,
      description: `Estorno de depósito (${REVERSAL_REASON})`,
      senderWalletId: mariana.wallet.id,
      receiverWalletId: mariana.wallet.id,
      originalTransactionId: reversedDeposit.id,
      reversalReason: REVERSAL_REASON,
    },
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
