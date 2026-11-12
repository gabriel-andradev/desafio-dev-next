'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE_NAME, ApiClientError, apiRequest } from '@/lib/api';
import { requireAuth } from '@/lib/auth';
import { isValidEmail } from '@/lib/formatters';
import { ActionState } from '@/types/wallet';

interface AuthApiResponse {
  accessToken: string;
}

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;

/**
 * Authenticates the user with email and password, sets an httpOnly JWT cookie, and redirects to the dashboard.
 */
export async function loginAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!email || !password) {
    return {
      success: false,
      fields: { email },
      message: 'Preencha o e-mail e a senha para continuar.',
    };
  }

  if (!isValidEmail(email)) {
    return {
      success: false,
      fields: { email },
      message:
        'Informe um endereço de e-mail válido (ex: seu.nome@dominio.com).',
    };
  }

  try {
    const response = await apiRequest<AuthApiResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, response.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  } catch (error) {
    if (error instanceof ApiClientError) {
      return { success: false, fields: { email }, message: error.message };
    }
    return {
      success: false,
      fields: { email },
      message: 'Não foi possível conectar ao servidor de autenticação.',
    };
  }

  redirect('/dashboard');
}

/**
 * Registers a new user account and wallet, sets an httpOnly JWT cookie, and redirects to the dashboard.
 */
export async function registerAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get('name') || '').trim();
  const cpf = String(formData.get('cpf') || '').replace(/\D/g, '');
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!name || !cpf || !email || !password) {
    return {
      success: false,
      fields: { name, email },
      message: 'Todos os campos são obrigatórios para abertura da conta.',
    };
  }

  if (cpf.length !== 11) {
    return {
      success: false,
      fields: { name, email },
      message: 'O CPF deve conter exatamente 11 dígitos numéricos.',
    };
  }

  if (!isValidEmail(email)) {
    return {
      success: false,
      fields: { name, email },
      message:
        'Informe um endereço de e-mail válido (ex: seu.nome@dominio.com).',
    };
  }

  try {
    const response = await apiRequest<AuthApiResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, cpf, email, password }),
    });

    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE_NAME, response.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  } catch (error) {
    if (error instanceof ApiClientError) {
      return {
        success: false,
        fields: { name, email },
        message: error.message,
      };
    }
    return {
      success: false,
      fields: { name, email },
      message: 'Não foi possível concluir o cadastro no momento.',
    };
  }

  redirect('/dashboard');
}

/**
 * Clears the authentication cookie and redirects the user back to the login page.
 */
export async function logoutAction(): Promise<void> {
  await requireAuth();

  // Revoke the JWT on the API first (bumps the user's session version), then drop the cookie.
  // A failure here must not keep the user logged in on this browser.
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } catch {
    // 204 has no JSON body, or the API is unreachable: the cookie is removed anyway.
  }

  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  redirect('/login');
}
