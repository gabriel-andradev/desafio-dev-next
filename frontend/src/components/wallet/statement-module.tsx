'use client';

import { useActionState, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { reverseTransactionAction } from '@/actions/wallet.actions';
import { formatCurrencyFromCents, formatDateTime } from '@/lib/formatters';
import { ActionState, WalletTransaction } from '@/types/wallet';

interface StatementModuleProps {
  transactions: WalletTransaction[];
}

type FilterType = 'ALL' | 'DEPOSIT' | 'TRANSFER' | 'REVERSAL';

const initialState: ActionState = {
  success: false,
  message: '',
};

/**
 * Renders the transaction ledger history with type filters and atomic reversal triggers.
 */
export function StatementModule({ transactions }: StatementModuleProps) {
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    reverseTransactionAction,
    initialState,
  );

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === 'ALL') return true;
    return tx.type === filter;
  });

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-brand-navy">
            Módulo: Extrato Contábil & Estornos (Ledger)
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Histórico auditável de todas as operações. Depósitos e
            transferências concluídos podem ser revertidos sob solicitação.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          {(
            [
              { key: 'ALL', label: 'Todos' },
              { key: 'DEPOSIT', label: 'Depósitos' },
              { key: 'TRANSFER', label: 'Transferências' },
              { key: 'REVERSAL', label: 'Estornos' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Nenhuma movimentação encontrada para o filtro selecionado.
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
                        isReversed
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
                      <div
                        className={`text-sm font-semibold ${
                          isReversed
                            ? 'line-through text-slate-400'
                            : 'text-slate-900'
                        }`}
                      >
                        {tx.description || tx.type}
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                        <span>{formatDateTime(tx.createdAt)}</span>
                        <span>•</span>
                        <span>
                          {tx.type === 'DEPOSIT'
                            ? 'Depósito Direto'
                            : tx.type === 'REVERSAL'
                              ? 'Contra-lançamento de Estorno'
                              : isIncoming
                                ? `Recebido de ${tx.sender?.name || 'Usuário'}`
                                : `Enviado para ${tx.receiver.name}`}
                        </span>
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

                    {isReversed ? (
                      <span className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 text-xs font-semibold">
                        Revertida
                      </span>
                    ) : tx.canReverse ? (
                      <button
                        type="button"
                        onClick={() =>
                          setReversingId(isConfirming ? null : tx.id)
                        }
                        className="px-3 py-1 rounded-md border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold transition cursor-pointer"
                      >
                        {isConfirming ? 'Cancelar' : 'Solicitar Reversão'}
                      </button>
                    ) : null}
                  </div>
                </div>

                {isConfirming && tx.canReverse && (
                  <form
                    action={formAction}
                    onSubmit={() => setReversingId(null)}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <input type="hidden" name="transactionId" value={tx.id} />
                    <label htmlFor={`reason-${tx.id}`} className="font-semibold text-slate-700">
                      Motivo do estorno:
                    </label>
                    <input
                      id={`reason-${tx.id}`}
                      type="text"
                      name="reason"
                      placeholder="Ex: Valor digitado incorretamente"
                      className="flex-1 min-w-[200px] px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-brand-navy"
                    />
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-1.5 rounded bg-brand-navy text-brand-gold font-semibold hover:bg-brand-dark transition cursor-pointer"
                    >
                      {isPending
                        ? 'Estornando...'
                        : 'Confirmar Estorno Imutável'}
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

