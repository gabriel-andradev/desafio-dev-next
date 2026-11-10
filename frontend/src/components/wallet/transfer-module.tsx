'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, CheckCircle2, Send, UserCheck } from 'lucide-react';
import { transferAction } from '@/actions/wallet.actions';
import {
  formatCpf,
  formatCurrencyFromCents,
  formatCurrencyInput,
  formatRecipientInput,
  isAllowedNumericKey,
  isValidEmail,
} from '@/lib/formatters';
import { ActionState, UserParticipant } from '@/types/wallet';

interface TransferModuleProps {
  currentBalanceCents: number;
  recipients: UserParticipant[];
}

const initialState: ActionState = {
  success: false,
  message: '',
};

interface RecipientStatusHintProps {
  value: string;
}

/**
 * Renders real-time contextual validation hints for email or CPF recipient inputs.
 */
function RecipientStatusHint({ value }: RecipientStatusHintProps) {
  if (!value) {
    return null;
  }

  if (value.includes('@')) {
    const valid = isValidEmail(value);
    return (
      <span
        className={
          valid
            ? 'text-emerald-600 font-semibold'
            : 'text-amber-600 font-semibold'
        }
      >
        {valid
          ? '✓ Formato de e-mail válido'
          : 'Aguardando formato completo (ex: nome@dominio.com)'}
      </span>
    );
  }

  if (/^\d/.test(value)) {
    const digitCount = value.replace(/\D/g, '').length;
    const isComplete = digitCount === 11;
    return (
      <span
        className={
          isComplete
            ? 'text-emerald-600 font-semibold'
            : 'text-slate-500 font-medium'
        }
      >
        {isComplete
          ? '✓ CPF com 11 dígitos'
          : `Dígitos de CPF: ${digitCount}/11`}
      </span>
    );
  }

  return null;
}

/**
 * Renders the peer-to-peer Transfer module with quick recipient selection and atomic balance validation.
 */
export function TransferModule({
  currentBalanceCents,
  recipients,
}: TransferModuleProps) {
  const [recipientInput, setRecipientInput] = useState('');
  const [amount, setAmount] = useState('');
  const [state, formAction, isPending] = useActionState(
    transferAction,
    initialState,
  );

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-brand-navy">
            Módulo: Transferência entre Contas (P2P)
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Envie valores instantaneamente informando o E-mail ou CPF do
            destinatário.
          </p>
        </div>

        <div className="px-3.5 py-2 rounded-lg bg-brand-navy text-white border border-brand-gold/40 text-xs">
          <span className="text-slate-300 mr-2">Saldo Disponível:</span>
          <span
            suppressHydrationWarning
            className={`font-mono font-bold ${
              currentBalanceCents < 0 ? 'text-rose-400' : 'text-brand-gold'
            }`}
          >
            {formatCurrencyFromCents(currentBalanceCents)}
          </span>
        </div>
      </header>

      {state.message && (
        <div
          role="alert"
          className={`flex items-center gap-2.5 p-3.5 rounded-lg border text-xs sm:text-sm ${
            state.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {state.success ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{state.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          action={formAction}
          className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4"
        >
          <div>
            <label
              htmlFor="recipientIdentifier"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Destinatário (E-mail ou CPF)
            </label>
            <input
              id="recipientIdentifier"
              name="recipientIdentifier"
              type="text"
              required
              value={recipientInput}
              onChange={(e) =>
                setRecipientInput(formatRecipientInput(e.target.value))
              }
              placeholder="Ex: bruno@cobuccio.com ou 000.000.000-00"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-brand-navy"
            />
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px]">
              <span className="text-slate-500">
                Informe o e-mail cadastrado ou CPF do titular.
              </span>
              <RecipientStatusHint value={recipientInput} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="transfer-amount"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Valor da Transferência (R$)
              </label>
              <input
                id="transfer-amount"
                name="amount"
                type="text"
                inputMode="numeric"
                required
                value={amount}
                onKeyDown={(e) => {
                  if (!isAllowedNumericKey(e.key, e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                  }
                }}
                onChange={(e) => setAmount(formatCurrencyInput(e.target.value))}
                placeholder="0,00"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 font-mono text-sm focus:outline-none focus:border-brand-navy"
              />
            </div>

            <div>
              <label
                htmlFor="transfer-description"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Descrição (opcional)
              </label>
              <input
                id="transfer-description"
                name="description"
                type="text"
                maxLength={140}
                placeholder="Ex: Pagamento de serviço"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-brand-navy"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending || currentBalanceCents <= 0}
            className="w-full py-2.5 px-4 rounded-lg bg-brand-gold hover:bg-brand-goldLight disabled:opacity-50 text-brand-dark font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>
              {isPending
                ? 'Validando saldo e transferindo...'
                : 'Executar Transferência Agora'}
            </span>
          </button>
        </form>

        <aside className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-brand-navy uppercase tracking-wider">
            <UserCheck className="w-4 h-4 text-brand-gold" />
            <span>Contatos Disponíveis (Seleção Rápida)</span>
          </div>

          {recipients.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nenhum outro usuário cadastrado ainda. Abra outra conta para testar
              transferências P2P.
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {recipients.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => setRecipientInput(contact.email)}
                  className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-brand-navy hover:bg-slate-50 transition flex items-center justify-between text-xs cursor-pointer"
                >
                  <div>
                    <div className="font-semibold text-slate-800">
                      {contact.name}
                    </div>
                    <div className="text-slate-500">{contact.email}</div>
                  </div>
                  {contact.cpf && (
                    <span className="font-mono text-slate-400">
                      {formatCpf(contact.cpf)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

