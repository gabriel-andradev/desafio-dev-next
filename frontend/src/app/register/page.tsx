import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE_NAME } from '@/lib/api';
import { AuthForm } from '@/components/auth/auth-form';

/**
 * Renders the account registration screen or redirects already authenticated users to the dashboard.
 */
export default async function RegisterPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    redirect('/dashboard');
  }

  return <AuthForm mode="register" />;
}

