'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, CheckCircle2, PlusCircle } from 'lucide-react';
import { depositAction } from '@/actions/wallet.actions';
import {
  formatCurrencyFromCents,
  formatCurrencyInput,
  isAllowedNumericKey,
  parseCurrencyInputToCents,
} from '@/lib/formatters';
import { ActionState } from '@/types/wallet';

interface DepositModuleProps {
  currentBalanceCents: number;
}

const initialState: ActionState = {
  success: false,
  message: '',
};

const QUICK_AMOUNTS = [
  { label: '+ R$ 50', value: '50,00' },
  { label: '+ R$ 100', value: '100,00' },
  { label: '+ R$ 500', value: '500,00' },
];

/**
 * Renders the Deposit module with real-time balance projection and negative balance recovery preview.
 */
export function DepositModule({ currentBalanceCents }: DepositModuleProps) {
  const [amountInput, setAmountInput] = useState('150,00');
  const [state, formAction, isPending] = useActionState(
    depositAction,
    initialState,
  );

  const previewDepositCents = parseCurrencyInputToCents(amountInput);
  const projectedBalanceCents = currentBalanceCents + previewDepositCents;

  return (
    <section className="space-y-6">
      <header className="border-b border-slate-200 pb-4">
        <h2 className="text-lg font-bold text-brand-navy">
          Módulo: Depósito em Carteira
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
          Adicione saldo à sua conta. Caso seu saldo esteja negativo, o depósito
          abate automaticamente o débito e acrescenta o valor excedente.
        </p>
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

      <form
        action={formAction}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div>
            <label
              htmlFor="deposit-amount"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Valor do Aporte (R$)
            </label>
            <input
              id="deposit-amount"
              name="amount"
              type="text"
              inputMode="numeric"
              required
              value={amountInput}
              onKeyDown={(e) => {
                if (!isAllowedNumericKey(e.key, e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                }
              }}
              onChange={(e) => setAmountInput(formatCurrencyInput(e.target.value))}
              placeholder="0,00"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 font-mono text-base focus:outline-none focus:border-brand-navy"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Valores rápidos:</span>
            {QUICK_AMOUNTS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setAmountInput(item.value)}
                className="px-3 py-1 rounded-md bg-slate-100 hover:bg-brand-navy hover:text-brand-gold text-slate-700 text-xs font-medium border border-slate-200 transition cursor-pointer"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor="deposit-description"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Identificação / Descrição (opcional)
            </label>
            <input
              id="deposit-description"
              name="description"
              type="text"
              maxLength={140}
              placeholder="Ex: Aporte de capital"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-brand-navy"
            />
          </div>
        </div>

        <div className="lg:col-span-5 bg-brand-navy text-white p-5 rounded-xl border border-brand-gold/40 shadow-md space-y-4">
          <div className="text-xs uppercase tracking-wider text-brand-gold font-semibold">
            Simulação Contábil em Tempo Real
          </div>

          <div className="space-y-2 text-xs border-b border-white/10 pb-3">
            <div className="flex justify-between">
              <span className="text-slate-300">Saldo Atual:</span>
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
              <span className="text-slate-300">Valor do Depósito:</span>
              <span
                suppressHydrationWarning
                className="font-mono font-semibold text-emerald-400"
              >
                + {formatCurrencyFromCents(previewDepositCents)}
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-300">
              Saldo Previsto Após Confirmação:
            </div>
            <div
              suppressHydrationWarning
              className={`text-xl font-bold font-mono mt-0.5 ${
                projectedBalanceCents < 0
                  ? 'text-rose-400'
                  : 'text-brand-gold'
              }`}
            >
              {formatCurrencyFromCents(projectedBalanceCents)}
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 px-4 rounded-lg bg-brand-gold hover:bg-brand-goldLight disabled:opacity-60 text-brand-dark font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>
              {isPending ? 'Creditando em conta...' : 'Confirmar Depósito'}
            </span>
          </button>
        </div>
      </form>
    </section>
  );
}

