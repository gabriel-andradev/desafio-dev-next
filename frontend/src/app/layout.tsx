import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Cobuccio Wallet | Carteira Financeira Digital',
  description:
    'Plataforma de gestão de saldo, depósitos, transferências instantâneas e estornos auditáveis.',
};

/**
 * Root application layout applying global typography and styles.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>{children}</body>
    </html>
  );
}

