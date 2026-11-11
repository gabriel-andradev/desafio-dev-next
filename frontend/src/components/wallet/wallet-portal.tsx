'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  FileText,
  LayoutDashboard,
  LogOut,
  PlusCircle,
} from 'lucide-react';
import { logoutAction } from '@/actions/auth.actions';
import { formatCpf, formatCurrencyFromCents } from '@/lib/formatters';
import { UserParticipant, WalletSummary } from '@/types/wallet';
import { DepositModule } from './deposit-module';
import { TransferModule } from './transfer-module';
import { StatementModule } from './statement-module';
import { ModuleKey, OverviewModule } from './overview-module';

interface WalletPortalProps {
  summary: WalletSummary;
  recipients: UserParticipant[];
  initialTab?: string;
}

const VALID_MODULES: ModuleKey[] = [
  'overview',
  'deposit',
  'transfer',
  'statement',
];

const MODULE_ITEMS: { key: ModuleKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
  { key: 'deposit', label: 'Depositar', icon: PlusCircle },
  { key: 'transfer', label: 'Transferir', icon: ArrowRightLeft },
  { key: 'statement', label: 'Extrato & Estornos', icon: FileText },
];

/**
 * Renders the main banking portal shell with sidebar module navigation and active module view.
 */
export function WalletPortal({
  summary,
  recipients,
  initialTab,
}: WalletPortalProps) {
  const initialModule: ModuleKey =
    initialTab && VALID_MODULES.includes(initialTab as ModuleKey)
      ? (initialTab as ModuleKey)
      : 'overview';

  const [activeModule, setActiveModule] = useState<ModuleKey>(initialModule);

  const handleSelectModule = (mod: ModuleKey) => {
    setActiveModule(mod);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (mod === 'overview') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', mod);
      }
      window.history.replaceState(
        null,
        '',
        url.pathname + (url.search ? url.search : ''),
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 grid grid-cols-1 md:grid-cols-12">
      <aside className="md:col-span-3 lg:col-span-2 bg-brand-dark text-white p-5 flex flex-col justify-between border-r border-brand-gold/20">
        <div className="space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-white/10">
            <div className="w-9 h-9 rounded-lg bg-brand-navy border border-brand-gold flex items-center justify-center font-serif font-bold text-brand-gold text-sm shrink-0">
              AC
            </div>
            <div className="truncate">
              <div className="text-xs font-bold tracking-wide text-white">
                COBUCCIO
              </div>
              <div className="text-xs text-brand-gold">Brasil Card Wallet</div>
            </div>
          </div>

          <nav aria-label="Módulos da Carteira" className="space-y-1.5 text-xs">
            <div className="text-slate-400 uppercase tracking-wider px-2.5 pb-1 font-semibold">
              Módulos
            </div>

            {MODULE_ITEMS.map((item) => {
              const Icon = item.icon;
              const isSelected = activeModule === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelectModule(item.key)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg font-medium flex items-center gap-2.5 transition cursor-pointer ${
                    isSelected
                      ? 'bg-brand-navy text-brand-gold border border-brand-gold/40'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-white/10 space-y-3 text-xs">
          <div className="p-3 rounded-lg bg-brand-navy/60 border border-white/10 space-y-0.5">
            <div className="font-semibold text-white truncate">
              {summary.user.name}
            </div>
            <div className="text-slate-400 truncate">{summary.user.email}</div>
            <div className="text-brand-gold font-mono">
              CPF: {formatCpf(summary.user.cpf)}
            </div>
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-rose-500/20 text-rose-300 border border-white/10 flex items-center justify-center gap-2 font-medium transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair da conta</span>
            </button>
          </form>
        </div>
      </aside>

      <main className="md:col-span-9 lg:col-span-10 p-6 sm:p-8 space-y-6">
        {summary.isNegative && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs sm:text-sm">
                <div className="font-bold text-rose-900">
                  Sua carteira está com saldo negativo (
                  {formatCurrencyFromCents(summary.balanceCents)})
                </div>
                <p className="text-rose-700 mt-0.5">
                  Faça um depósito para regularizar: o valor quita a dívida
                  primeiro e o restante fica disponível.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSelectModule('deposit')}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
            >
              Depositar agora
            </button>
          </div>
        )}

        {activeModule === 'overview' && (
          <OverviewModule summary={summary} onSelectModule={handleSelectModule} />
        )}

        {activeModule === 'deposit' && (
          <DepositModule currentBalanceCents={summary.balanceCents} />
        )}

        {activeModule === 'transfer' && (
          <TransferModule
            currentBalanceCents={summary.balanceCents}
            recipients={recipients}
          />
        )}

        {activeModule === 'statement' && (
          <StatementModule transactions={summary.transactions} />
        )}
      </main>
    </div>
  );
}
