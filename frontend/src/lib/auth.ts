import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE_NAME } from './api';

/**
 * Ensures the caller is authenticated by checking for an active session token cookie.
 * Redirects to the login page if unauthenticated.
 */
export async function requireAuth(): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    redirect('/login');
  }

  return token;
}

