'use server';

import { revalidatePath } from 'next/cache';
import { ApiClientError, apiRequest } from '@/lib/api';
import { isValidEmail, parseCurrencyInputToCents } from '@/lib/formatters';
import { ActionState } from '@/types/wallet';

/**
 * Processes a wallet deposit request, converting BRL input to integer cents and revalidating the dashboard.
 * The idempotency key comes from the form, so a retry or double submit of the same form reuses it.
 */
export async function depositAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rawAmount = String(formData.get('amount') || '');
  const description = String(formData.get('description') || '').trim();
  const amountCents = parseCurrencyInputToCents(rawAmount);

  if (amountCents <= 0) {
    return {
      success: false,
      message: 'Informe um valor válido maior que R$ 0,00 (ex: 150,00).',
    };
  }

  try {
    const idempotencyKey =
      String(formData.get('idempotencyKey') || '') || crypto.randomUUID();
    await apiRequest('/wallet/deposit', {
      method: 'POST',
      headers: {
        'x-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        amountCents,
        description: description || undefined,
        idempotencyKey,
      }),
    });

    revalidatePath('/dashboard');

    return {
      success: true,
      message: 'Depósito realizado com sucesso.',
    };
  } catch (error) {
    if (error instanceof ApiClientError) {
      return { success: false, message: error.message };
    }
    return {
      success: false,
      message: 'Erro ao processar o depósito.',
    };
  }
}

/**
 * Processes a peer-to-peer transfer request and revalidates the dashboard cache upon completion.
 * The idempotency key comes from the form, so a retry or double submit of the same form reuses it.
 */
export async function transferAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const recipientIdentifier = String(
    formData.get('recipientIdentifier') || '',
  ).trim();
  const rawAmount = String(formData.get('amount') || '');
  const description = String(formData.get('description') || '').trim();
  const amountCents = parseCurrencyInputToCents(rawAmount);

  if (!recipientIdentifier) {
    return {
      success: false,
      message: 'Informe o e-mail ou CPF do destinatário.',
    };
  }

  const isEmail = recipientIdentifier.includes('@');
  if (isEmail) {
    if (!isValidEmail(recipientIdentifier)) {
      return {
        success: false,
        message:
          'Informe um endereço de e-mail válido (ex: destinatario@cobuccio.com).',
      };
    }
  } else {
    const digits = recipientIdentifier.replace(/\D/g, '');
    if (digits.length !== 11) {
      return {
        success: false,
        message: 'Informe um e-mail válido ou um CPF de 11 dígitos numéricos.',
      };
    }
  }

  if (amountCents <= 0) {
    return {
      success: false,
      message: 'Informe um valor de transferência válido maior que R$ 0,00.',
    };
  }

  try {
    const idempotencyKey =
      String(formData.get('idempotencyKey') || '') || crypto.randomUUID();
    await apiRequest('/wallet/transfer', {
      method: 'POST',
      headers: {
        'x-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        recipientIdentifier,
        amountCents,
        description: description || undefined,
        idempotencyKey,
      }),
    });

    revalidatePath('/dashboard');

    return {
      success: true,
      message: 'Transferência realizada com sucesso.',
    };
  } catch (error) {
    if (error instanceof ApiClientError) {
      return { success: false, message: error.message };
    }
    return {
      success: false,
      message: 'Erro ao processar a transferência.',
    };
  }
}

/**
 * Requests an atomic reversal for a completed deposit or transfer transaction.
 */
export async function reverseTransactionAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const transactionId = String(formData.get('transactionId') || '').trim();
  const reason = String(formData.get('reason') || '').trim();

  if (!transactionId) {
    return {
      success: false,
      message: 'Identificador da transação inválido.',
    };
  }

  try {
    await apiRequest(`/wallet/transactions/${transactionId}/reverse`, {
      method: 'POST',
      body: JSON.stringify({
        reason: reason || undefined,
      }),
    });

    revalidatePath('/dashboard');

    return {
      success: true,
      message: 'Estorno realizado com sucesso.',
    };
  } catch (error) {
    if (error instanceof ApiClientError) {
      return { success: false, message: error.message };
    }
    return {
      success: false,
      message: 'Não foi possível reverter esta operação.',
    };
  }
}
