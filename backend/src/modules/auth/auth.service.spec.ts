import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersService = {
    create: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    sanitizeUser: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-jwt-token'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should hash password and return token on registration', async () => {
    mockUsersService.create.mockResolvedValue({
      id: 'user-1',
      name: 'Gabriel',
      email: 'gabriel@email.com',
      cpf: '12345678901',
      wallet: { id: 'wallet-1', balanceCents: 0 },
    });

    const result = await service.register({
      name: 'Gabriel',
      email: 'gabriel@email.com',
      cpf: '12345678901',
      password: 'password123',
    });

    expect(result.accessToken).toBe('signed-jwt-token');
    expect(mockUsersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'gabriel@email.com',
        passwordHash: expect.not.stringMatching('password123'),
      }),
    );
  });

  it('should throw UnauthorizedException when password does not match', async () => {
    const hash = await bcrypt.hash('correct-password', 10);

    mockUsersService.findByEmailWithPassword.mockResolvedValue({
      id: 'user-1',
      email: 'gabriel@email.com',
      passwordHash: hash,
    });

    await expect(
      service.login({
        email: 'gabriel@email.com',
        password: 'wrong-password',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});

