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

  /**
   * Hashes the user's password, creates the account and wallet, and returns a signed JWT.
   */
  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      cpf: dto.cpf,
      passwordHash,
    });

    // A brand-new account starts at session version 0.
    const accessToken = await this.generateToken(user.id, user.email, 0);

    return {
      accessToken,
      user,
    };
  }

  /**
   * Verifies user credentials against the stored bcrypt hash and issues a signed JWT.
   */
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
      userWithPassword.tokenVersion,
    );

    return {
      accessToken,
      user: sanitizedUser,
    };
  }

  /**
   * Revokes every JWT issued so far for this user by bumping the session version
   * (JwtStrategy rejects tokens whose `ver` claim no longer matches).
   */
  async logout(userId: string): Promise<void> {
    await this.usersService.incrementTokenVersion(userId);
  }

  private async generateToken(
    userId: string,
    email: string,
    tokenVersion: number,
  ): Promise<string> {
    return this.jwtService.signAsync({
      sub: userId,
      email,
      ver: tokenVersion,
    });
  }
}
