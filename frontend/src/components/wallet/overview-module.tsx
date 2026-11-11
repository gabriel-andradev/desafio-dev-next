'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { formatCurrencyFromCents, formatDateTime } from '@/lib/formatters';
import { WalletSummary } from '@/types/wallet';

export type ModuleKey = 'overview' | 'deposit' | 'transfer' | 'statement';

interface OverviewModuleProps {
  summary: WalletSummary;
  onSelectModule: (mod: ModuleKey) => void;
}

const HIDDEN_VALUE = 'R$ ••••••';

const SHORTCUTS: { key: ModuleKey; title: string; description: string }[] = [
  {
    key: 'deposit',
    title: 'Depositar →',
    description: 'Adicione saldo ou quite um saldo negativo.',
  },
  {
    key: 'transfer',
    title: 'Transferir →',
    description: 'Envie dinheiro para outra conta por e-mail ou CPF.',
  },
  {
    key: 'statement',
    title: 'Extrato & Estornos →',
    description: 'Veja o histórico completo e estorne operações.',
  },
];

/**
 * Renders the wallet overview cards, totals, quick shortcuts, and recent transactions preview.
 */
export function OverviewModule({
  summary,
  onSelectModule,
}: OverviewModuleProps) {
  const [hideBalance, setHideBalance] = useState(false);

  const totalDepositsCents = summary.transactions
    .filter((tx) => tx.type === 'DEPOSIT' && tx.status === 'COMPLETED')
    .reduce((acc, tx) => acc + tx.amountCents, 0);

  const totalSentCents = summary.transactions
    .filter(
      (tx) =>
        tx.type === 'TRANSFER' &&
        tx.direction === 'OUT' &&
        tx.status === 'COMPLETED',
    )
    .reduce((acc, tx) => acc + tx.amountCents, 0);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-brand-navy">Visão Geral</h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Olá, {summary.user.name}. Acompanhe seu saldo e acesse as operações
            da sua carteira.
          </p>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${
            summary.isNegative
              ? 'bg-rose-100 text-rose-800'
              : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {summary.isNegative ? 'Saldo negativo' : 'Conta regular'}
        </span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-brand-navy text-white border border-brand-gold/40 shadow-md space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Saldo disponível</span>
            <button
              type="button"
              onClick={() => setHideBalance((prev) => !prev)}
              aria-pressed={hideBalance}
              className="text-brand-gold hover:underline flex items-center gap-1 cursor-pointer"
            >
              {hideBalance ? (
                <>
                  <Eye className="w-3.5 h-3.5" /> Mostrar
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5" /> Ocultar
                </>
              )}
            </button>
          </div>
          <div
            suppressHydrationWarning
            className={`text-2xl font-bold font-mono ${
              summary.isNegative ? 'text-rose-400' : 'text-brand-gold'
            }`}
          >
            {hideBalance
              ? HIDDEN_VALUE
              : formatCurrencyFromCents(summary.balanceCents)}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm space-y-2">
          <div className="text-xs text-slate-500 font-medium">
            Total depositado
          </div>
          <div
            suppressHydrationWarning
            className="text-xl font-bold font-mono text-emerald-600"
          >
            {hideBalance
              ? HIDDEN_VALUE
              : `+ ${formatCurrencyFromCents(totalDepositsCents)}`}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm space-y-2">
          <div className="text-xs text-slate-500 font-medium">
            Total transferido
          </div>
          <div
            suppressHydrationWarning
            className="text-xl font-bold font-mono text-rose-600"
          >
            {hideBalance
              ? HIDDEN_VALUE
              : `- ${formatCurrencyFromCents(totalSentCents)}`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {SHORTCUTS.map((shortcut) => (
          <button
            key={shortcut.key}
            type="button"
            onClick={() => onSelectModule(shortcut.key)}
            className="p-4 rounded-xl bg-white border border-slate-200 hover:border-brand-navy shadow-sm text-left transition cursor-pointer"
          >
            <div className="text-sm font-bold text-brand-navy">
              {shortcut.title}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {shortcut.description}
            </div>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-brand-navy">
            Últimas movimentações
          </h2>
          <button
            type="button"
            onClick={() => onSelectModule('statement')}
            className="text-xs text-brand-navy font-semibold hover:underline cursor-pointer"
          >
            Ver extrato completo →
          </button>
        </div>

        {summary.transactions.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            Nenhuma movimentação ainda.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {summary.transactions.slice(0, 4).map((tx) => (
              <div
                key={tx.id}
                className="py-2.5 flex items-center justify-between"
              >
                <div>
                  <span
                    className={`font-semibold ${
                      tx.status === 'REVERSED'
                        ? 'line-through text-slate-400'
                        : 'text-slate-800'
                    }`}
                  >
                    {tx.description || tx.type}
                  </span>
                  <span
                    suppressHydrationWarning
                    className="text-slate-400 ml-2"
                  >
                    {formatDateTime(tx.createdAt)}
                  </span>
                </div>
                <span
                  suppressHydrationWarning
                  className={`font-mono font-bold ${
                    tx.status === 'REVERSED'
                      ? 'line-through text-slate-400'
                      : tx.direction === 'IN'
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                  }`}
                >
                  {hideBalance
                    ? HIDDEN_VALUE
                    : `${tx.direction === 'IN' ? '+' : '-'} ${formatCurrencyFromCents(tx.amountCents)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
