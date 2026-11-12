'use client';

import { useActionState, useState } from 'react';
import { Send, UserCheck } from 'lucide-react';
import { transferAction } from '@/actions/wallet.actions';
import {
  formatCurrencyFromCents,
  formatCurrencyInput,
  formatRecipientInput,
  isAllowedNumericKey,
  isValidEmail,
  parseCurrencyInputToCents,
} from '@/lib/formatters';
import { ActionState, UserParticipant } from '@/types/wallet';
import { ActionAlert } from './action-alert';
import { useIdempotencyKey } from './use-idempotency-key';

interface TransferModuleProps {
  currentBalanceCents: number;
  recipients: UserParticipant[];
}

const initialState: ActionState = {
  success: false,
  message: '',
};

/**
 * Renders real-time validation hints for an e-mail or CPF recipient input.
 */
function RecipientStatusHint({ value }: { value: string }) {
  if (!value) {
    return null;
  }

  if (value.includes('@')) {
    const valid = isValidEmail(value);
    return (
      <span className={valid ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
        {valid ? '✓ E-mail válido' : 'Complete o e-mail (ex: nome@dominio.com)'}
      </span>
    );
  }

  if (/^\d/.test(value)) {
    const digitCount = value.replace(/\D/g, '').length;
    const isComplete = digitCount === 11;
    return (
      <span className={isComplete ? 'text-emerald-600 font-semibold' : 'text-slate-500 font-medium'}>
        {isComplete ? '✓ CPF completo' : `CPF: ${digitCount}/11 dígitos`}
      </span>
    );
  }

  return null;
}

/**
 * Renders the peer-to-peer Transfer module: recipient form, quick contacts and a live transfer summary.
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

  const idempotencyKey = useIdempotencyKey(state);
  const transferCents = parseCurrencyInputToCents(amount);
  const projectedBalanceCents = currentBalanceCents - transferCents;
  const hasInsufficientBalance = transferCents > currentBalanceCents;
  const selectedContact = recipients.find(
    (contact) => contact.email === recipientInput,
  );

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-brand-navy">Transferir</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Envie dinheiro para outra conta informando o e-mail ou o CPF do
            destinatário.
          </p>
        </div>

        <div className="px-3.5 py-2 rounded-lg bg-brand-navy text-white border border-brand-gold/40 text-xs">
          <span className="text-slate-300 mr-2">Saldo disponível:</span>
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

      <ActionAlert state={state} />

      <form
        action={formAction}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <label
                htmlFor="recipientIdentifier"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Destinatário (e-mail ou CPF)
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
                  Ou escolha um dos seus contatos abaixo.
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
                  Valor da transferência (R$)
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
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-navy uppercase tracking-wider">
              <UserCheck className="w-4 h-4 text-brand-gold" />
              <span>Seus contatos</span>
            </div>

            {recipients.length === 0 ? (
              <p className="text-xs text-slate-500">
                Ainda não há outros usuários cadastrados.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {recipients.map((contact) => {
                  const isSelected = selectedContact?.id === contact.id;

                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => setRecipientInput(contact.email)}
                      aria-pressed={isSelected}
                      className={`w-full text-left p-2.5 rounded-lg border transition flex items-center justify-between text-xs cursor-pointer ${
                        isSelected
                          ? 'border-brand-navy bg-slate-50'
                          : 'border-slate-200 hover:border-brand-navy hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-slate-800">
                          {contact.name}
                        </div>
                        <div className="text-slate-500">{contact.email}</div>
                      </div>
                      {contact.maskedCpf && (
                        <span className="font-mono text-slate-400">
                          {contact.maskedCpf}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-brand-navy text-white p-5 rounded-xl border border-brand-gold/40 shadow-md space-y-4">
          <div className="text-xs uppercase tracking-wider text-brand-gold font-semibold">
            Resumo da transferência
          </div>

          <div className="space-y-2 text-xs border-b border-white/10 pb-3">
            <div className="flex justify-between gap-3">
              <span className="text-slate-300">Para</span>
              <span className="font-semibold text-white truncate">
                {selectedContact?.name || recipientInput || '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Saldo disponível</span>
              <span
                suppressHydrationWarning
                className={`font-mono font-semibold ${
                  currentBalanceCents < 0 ? 'text-rose-400' : 'text-white'
                }`}
              >
                {formatCurrencyFromCents(currentBalanceCents)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Valor da transferência</span>
              <span
                suppressHydrationWarning
                className="font-mono font-semibold text-rose-400"
              >
                - {formatCurrencyFromCents(transferCents)}
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-300">
              Saldo após a transferência
            </div>
            <div
              suppressHydrationWarning
              className={`text-xl font-bold font-mono mt-0.5 ${
                projectedBalanceCents < 0 ? 'text-rose-400' : 'text-brand-gold'
              }`}
            >
              {formatCurrencyFromCents(projectedBalanceCents)}
            </div>
            {hasInsufficientBalance && (
              <p className="text-xs text-rose-300 mt-1">
                Saldo insuficiente para este valor.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isPending || transferCents <= 0 || hasInsufficientBalance}
            className="w-full py-2.5 px-4 rounded-lg bg-brand-gold hover:bg-brand-goldLight disabled:opacity-60 disabled:cursor-not-allowed text-brand-dark font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{isPending ? 'Transferindo...' : 'Confirmar transferência'}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
