import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      cpf: dto.cpf,
      passwordHash,
    });

    const accessToken = await this.generateToken(user.id, user.email);

    return {
      accessToken,
      user,
    };
  }

  async login(dto: LoginDto) {
    const userWithPassword = await this.usersService.findByEmailWithPassword(
      dto.email,
    );

    if (!userWithPassword) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      userWithPassword.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const sanitizedUser = this.usersService.sanitizeUser(userWithPassword);
    const accessToken = await this.generateToken(
      sanitizedUser.id,
      sanitizedUser.email,
    );

    return {
      accessToken,
      user: sanitizedUser,
    };
  }

  private async generateToken(userId: string, email: string): Promise<string> {
    return this.jwtService.signAsync({
      sub: userId,
      email,
    });
  }
}

