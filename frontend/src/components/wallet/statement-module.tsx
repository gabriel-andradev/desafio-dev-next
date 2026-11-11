'use client';

import { useActionState, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, RotateCcw } from 'lucide-react';
import { reverseTransactionAction } from '@/actions/wallet.actions';
import { formatCurrencyFromCents, formatDateTime } from '@/lib/formatters';
import { ActionState, WalletTransaction } from '@/types/wallet';
import { ActionAlert } from './action-alert';

interface StatementModuleProps {
  transactions: WalletTransaction[];
}

type FilterType = 'ALL' | 'DEPOSIT' | 'TRANSFER' | 'REVERSAL';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'DEPOSIT', label: 'Depósitos' },
  { key: 'TRANSFER', label: 'Transferências' },
  { key: 'REVERSAL', label: 'Estornos' },
];

const initialState: ActionState = {
  success: false,
  message: '',
};

/**
 * Short, human-friendly reference for a transaction UUID (the PHP version shows the numeric id).
 */
function shortReference(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function StatusBadge({ tx }: { tx: WalletTransaction }) {
  if (tx.type === 'REVERSAL') {
    return (
      <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-[11px] font-semibold">
        Estorno
      </span>
    );
  }

  if (tx.status === 'REVERSED') {
    return (
      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-semibold">
        Estornada
      </span>
    );
  }

  return (
    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-semibold">
      Concluída
    </span>
  );
}

function counterpartLabel(tx: WalletTransaction): string {
  if (tx.type === 'DEPOSIT') {
    return 'Depósito em conta';
  }

  if (tx.type === 'REVERSAL') {
    return tx.originalTransactionId
      ? `Estorno da operação ${shortReference(tx.originalTransactionId)}`
      : 'Estorno';
  }

  return tx.direction === 'IN'
    ? `Recebido de ${tx.sender?.name || 'Usuário'}`
    : `Enviado para ${tx.receiver.name}`;
}

/**
 * Renders the transaction history with type filters, status badges and the reversal flow.
 */
export function StatementModule({ transactions }: StatementModuleProps) {
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    reverseTransactionAction,
    initialState,
  );

  const filteredTransactions = transactions.filter(
    (tx) => filter === 'ALL' || tx.type === filter,
  );

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-brand-navy">
            Extrato & Estornos
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Histórico completo das suas operações. Um estorno não apaga nada:
            ele cria um novo lançamento ligado à operação original.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Prazos: quem enviou pode estornar em até 15 minutos; quem recebeu e
            depósitos, em até 24 horas.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          {FILTERS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              aria-pressed={filter === tab.key}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                filter === tab.key
                  ? 'bg-brand-navy text-brand-gold border border-brand-gold/40'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <ActionAlert state={state} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Nenhuma movimentação para este filtro.
          </div>
        ) : (
          filteredTransactions.map((tx) => {
            const isIncoming = tx.direction === 'IN';
            const isReversed = tx.status === 'REVERSED';
            const isConfirming = reversingId === tx.id;

            return (
              <div key={tx.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        tx.type === 'REVERSAL' || isReversed
                          ? 'bg-amber-100 text-amber-700'
                          : isIncoming
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {tx.type === 'REVERSAL' ? (
                        <RotateCcw className="w-4 h-4" />
                      ) : isIncoming ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isReversed
                              ? 'line-through text-slate-400'
                              : 'text-slate-900'
                          }`}
                        >
                          {tx.description || tx.type}
                        </span>
                        <StatusBadge tx={tx} />
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="font-mono text-slate-400">
                          {shortReference(tx.id)}
                        </span>
                        <span>•</span>
                        <span suppressHydrationWarning>
                          {formatDateTime(tx.createdAt)}
                        </span>
                        <span>•</span>
                        <span>{counterpartLabel(tx)}</span>
                      </div>
                      {tx.reversalReason && (
                        <div className="text-xs text-amber-700 mt-1">
                          Motivo: {tx.reversalReason}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      suppressHydrationWarning
                      className={`font-mono text-sm font-bold ${
                        isReversed
                          ? 'line-through text-slate-400'
                          : isIncoming
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                      }`}
                    >
                      {isIncoming ? '+' : '-'}{' '}
                      {formatCurrencyFromCents(tx.amountCents)}
                    </span>

                    {tx.reversalState === 'AVAILABLE' && (
                      <button
                        type="button"
                        onClick={() => setReversingId(isConfirming ? null : tx.id)}
                        className="px-3 py-1 rounded-md border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold transition cursor-pointer"
                      >
                        {isConfirming ? 'Cancelar' : 'Estornar'}
                      </button>
                    )}

                    {tx.reversalState === 'EXPIRED' && (
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 text-[11px] font-medium">
                        Prazo de estorno expirado
                      </span>
                    )}
                  </div>
                </div>

                {isConfirming && tx.reversalState === 'AVAILABLE' && (
                  <form
                    action={formAction}
                    onSubmit={() => setReversingId(null)}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <input type="hidden" name="transactionId" value={tx.id} />
                    <label
                      htmlFor={`reason-${tx.id}`}
                      className="font-semibold text-slate-700"
                    >
                      Motivo do estorno (opcional):
                    </label>
                    <input
                      id={`reason-${tx.id}`}
                      type="text"
                      name="reason"
                      maxLength={200}
                      placeholder="Ex: Valor digitado errado"
                      className="flex-1 min-w-[200px] px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-brand-navy"
                    />
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-1.5 rounded bg-brand-navy text-brand-gold font-semibold hover:bg-brand-dark transition cursor-pointer"
                    >
                      {isPending ? 'Estornando...' : 'Confirmar estorno'}
                    </button>
                  </form>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
