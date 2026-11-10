import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateUserInput {
  name: string;
  email: string;
  cpf: string;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUserInput) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedCpf = input.cpf.replace(/\D/g, '');

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { cpf: normalizedCpf }],
      },
    });

    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        throw new ConflictException('Este endereço de e-mail já está em uso.');
      }
      throw new ConflictException('Este CPF já está cadastrado no sistema.');
    }

    // Criação atômica de Usuário + Carteira (nested write do Prisma roda em transação)
    const user = await this.prisma.user.create({
      data: {
        name: input.name.trim(),
        email: normalizedEmail,
        cpf: normalizedCpf,
        passwordHash: input.passwordHash,
        wallet: {
          create: {
            balanceCents: 0,
          },
        },
      },
      include: {
        wallet: true,
      },
    });

    return this.sanitizeUser(user);
  }

  async findByEmailWithPassword(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { wallet: true },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { wallet: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return this.sanitizeUser(user);
  }

  async findByEmailOrCpf(identifier: string) {
    const trimmed = identifier.trim().toLowerCase();
    const digitsOnly = identifier.replace(/\D/g, '');

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: trimmed },
          ...(digitsOnly.length === 11 ? [{ cpf: digitsOnly }] : []),
        ],
      },
      include: { wallet: true },
    });

    return user;
  }

  async listRecipients(excludeUserId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: excludeUserId },
      },
      select: {
        id: true,
        name: true,
        email: true,
        cpf: true,
      },
      orderBy: { name: 'asc' },
    });

    return users;
  }

  sanitizeUser(user: {
    id: string;
    name: string;
    email: string;
    cpf: string;
    createdAt: Date;
    wallet?: { id: string; balanceCents: number } | null;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      cpf: user.cpf,
      createdAt: user.createdAt,
      wallet: user.wallet
        ? {
            id: user.wallet.id,
            balanceCents: user.wallet.balanceCents,
          }
        : null,
    };
  }
}

