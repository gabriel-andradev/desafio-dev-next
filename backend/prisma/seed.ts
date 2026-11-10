import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Seeds the database with two demonstration users, wallets, and sample ledger transactions.
 */
async function main() {
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash('password123', 10);

  const gabriel = await prisma.user.create({
    data: {
      name: 'Gabriel Silva',
      email: 'gabriel@cobuccio.com',
      cpf: '12345678901',
      passwordHash,
      wallet: {
        create: {
          balanceCents: 145000,
        },
      },
    },
    include: { wallet: true },
  });

  const bruno = await prisma.user.create({
    data: {
      name: 'Bruno Invest',
      email: 'bruno@cobuccio.com',
      cpf: '98765432100',
      passwordHash,
      wallet: {
        create: {
          balanceCents: 55000,
        },
      },
    },
    include: { wallet: true },
  });

  if (gabriel.wallet && bruno.wallet) {
    await prisma.transaction.create({
      data: {
        type: 'DEPOSIT',
        status: 'COMPLETED',
        amountCents: 200000,
        description: 'Aporte inicial em carteira',
        receiverWalletId: gabriel.wallet.id,
      },
    });

    await prisma.transaction.create({
      data: {
        type: 'TRANSFER',
        status: 'COMPLETED',
        amountCents: 55000,
        description: 'Transferência para Bruno Invest',
        senderWalletId: gabriel.wallet.id,
        receiverWalletId: bruno.wallet.id,
      },
    });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

