'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { loginAction, registerAction } from '@/actions/auth.actions';
import { formatCpf, isAllowedNumericKey } from '@/lib/formatters';
import { ActionState } from '@/types/wallet';

interface AuthFormProps {
  mode: 'login' | 'register';
}

const initialState: ActionState = {
  success: false,
  message: '',
};

/**
 * Renders the authentication card for either sign-in or account registration bound to Server Actions.
 */
export function AuthForm({ mode }: AuthFormProps) {
  const isLogin = mode === 'login';
  const action = isLogin ? loginAction : registerAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [cpf, setCpf] = useState('');

  return (
    <main className="min-h-screen bg-brand-dark text-white flex flex-col justify-center items-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-brand-navy/90 border border-brand-gold/30 shadow-2xl p-6 sm:p-8 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-dark border border-brand-gold flex items-center justify-center font-serif font-bold text-brand-gold text-base shadow-inner">
              AC
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold tracking-wide text-white">
                GRUPO ADRIANO COBUCCIO
              </h1>
              <p className="text-xs text-brand-gold font-medium">
                Brasil Card • Internet Banking
              </p>
            </div>
          </div>

          <nav
            aria-label="Alternar modo de autenticação"
            className="flex rounded-lg bg-brand-dark p-1 border border-white/10 text-xs"
          >
            <Link
              href="/login"
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                isLogin
                  ? 'bg-brand-gold text-brand-dark'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                !isLogin
                  ? 'bg-brand-gold text-brand-dark'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Cadastrar
            </Link>
          </nav>
        </header>

        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white">
            {isLogin
              ? 'Acesse sua Carteira Digital'
              : 'Abra sua Conta Financeira'}
          </h2>
          <p className="text-xs text-slate-300">
            {isLogin
              ? 'Informe suas credenciais para acessar os módulos de saldo, depósito, transferência e estorno.'
              : 'Preencha seus dados para criar sua carteira digital com proteção transacional ACID.'}
          </p>
        </div>

        {state.message && (
          <div
            role="alert"
            className="flex items-center gap-2.5 p-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{state.message}</span>
          </div>
        )}

        <form action={formAction} className="space-y-4 text-xs sm:text-sm">
          {!isLogin && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Nome Completo
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  minLength={3}
                  maxLength={100}
                  placeholder="Ex: Gabriel Silva"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-brand-dark border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-brand-gold transition"
                />
              </div>

              <div>
                <label
                  htmlFor="cpf"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  CPF
                </label>
                <input
                  id="cpf"
                  name="cpf"
                  type="text"
                  inputMode="numeric"
                  required
                  value={cpf}
                  onKeyDown={(e) => {
                    if (!isAllowedNumericKey(e.key, e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  maxLength={14}
                  placeholder="000.000.000-00"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-brand-dark border border-white/15 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-brand-gold transition"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                E-mail de Acesso
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="voce@cobuccio.com"
                className="w-full px-3.5 py-2.5 rounded-lg bg-brand-dark border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-brand-gold transition"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Senha {isLogin ? '' : '(mín. 8 caracteres)'}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={isLogin ? undefined : 8}
                maxLength={72}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg bg-brand-dark border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-brand-gold transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 px-4 rounded-lg bg-brand-gold hover:bg-brand-goldLight disabled:opacity-60 text-brand-dark font-bold flex items-center justify-center gap-2 transition shadow-lg cursor-pointer"
          >
            <span>
              {isPending
                ? 'Processando com segurança...'
                : isLogin
                  ? 'Autenticar e Acessar Módulos'
                  : 'Criar Conta e Carteira Digital'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <footer className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-brand-gold" />
            Sessão protegida via Cookie HttpOnly + JWT
          </span>
          <Link
            href={isLogin ? '/register' : '/login'}
            className="text-brand-gold hover:underline font-medium"
          >
            {isLogin ? 'Criar nova conta' : 'Já tenho conta'}
          </Link>
        </footer>
      </div>
    </main>
  );
}

