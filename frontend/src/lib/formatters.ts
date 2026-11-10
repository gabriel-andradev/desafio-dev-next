const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Formats an integer amount in cents into a Brazilian Real (BRL) currency string.
 */
export function formatCurrencyFromCents(cents: number): string {
  return brlFormatter.format(cents / 100);
}

/**
 * Parses a BRL currency string input into exact integer cents without IEEE 754 floating-point errors.
 */
export function parseCurrencyInputToCents(rawInput: string): number {
  const cleaned = rawInput
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .trim();

  if (!cleaned) {
    return 0;
  }

  const normalized = cleaned.replace(',', '.');

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return 0;
  }

  const [wholePart, decimalPart = ''] = normalized.split('.');
  const paddedDecimal = decimalPart.padEnd(2, '0').slice(0, 2);

  return parseInt(wholePart, 10) * 100 + parseInt(paddedDecimal, 10);
}

/**
 * Formats a numeric string progressively or completely into standard CPF mask (000.000.000-00).
 */
export function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Formats an ISO timestamp string into a localized Brazilian date and time string.
 */
export function formatDateTime(isoDate: string): string {
  return dateTimeFormatter.format(new Date(isoDate));
}

