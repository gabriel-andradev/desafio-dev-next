import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface ThrottledRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: { email?: unknown };
}

/**
 * Who a rate limit counts against, matching the Laravel version:
 * - authenticated calls (wallet operations): the user (JWT `sub`);
 * - login/register: the e-mail + caller IP.
 *
 * The default (IP only) is wrong here: every browser request reaches the API through the Next.js BFF,
 * so all users would share one bucket (e.g. 30 deposits/min for the whole app).
 * The JWT is only decoded to pick the bucket; it is verified afterwards by JwtAuthGuard, and a forged
 * token is rejected there.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: ThrottledRequest): Promise<string> {
    const ip = req.ip ?? 'unknown';

    const subject = AppThrottlerGuard.jwtSubject(req.headers.authorization);
    if (subject) {
      return `user:${subject}`;
    }

    const email = req.body?.email;
    if (typeof email === 'string' && email.trim()) {
      return `email:${email.trim().toLowerCase()}|${ip}`;
    }

    return ip;
  }

  private static jwtSubject(
    header: string | string[] | undefined,
  ): string | null {
    const value = Array.isArray(header) ? header[0] : header;
    const token = value?.startsWith('Bearer ') ? value.slice(7) : null;
    const payload = token?.split('.')[1];
    if (!payload) {
      return null;
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { sub?: unknown };
      return typeof decoded.sub === 'string' ? decoded.sub : null;
    } catch {
      return null;
    }
  }
}
