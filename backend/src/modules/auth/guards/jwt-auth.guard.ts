import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException(
          'Acesso negado. Faça login para acessar este recurso.',
        )
      );
    }
    return user;
  }
}

