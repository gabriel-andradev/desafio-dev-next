import { cookies } from 'next/headers';

export const AUTH_COOKIE_NAME = 'cobuccio_wallet_token';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3333/api';

export class ApiClientError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
  }
}

/**
 * Executes an authenticated or public HTTP request against the NestJS backend API.
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const rawMessage = errorPayload?.message;
    const errorMessage = Array.isArray(rawMessage)
      ? rawMessage[0]
      : rawMessage || 'Não foi possível concluir a operação no servidor.';

    throw new ApiClientError(errorMessage, response.status);
  }

  const data = (await response.json()) as T;
  return data;
}
