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
  timeZone: 'America/Sao_Paulo',
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

const MAX_AMOUNT_INPUT_DIGITS = 11;

/**
 * Formats a raw numeric/digit string into formatted BRL currency representation (e.g. "1.250,50").
 * Strips any non-digit character and treats numbers from right-to-left in cents.
 * Keeps at most 11 digits (999.999.999,99), as in the PHP version: already above the R$ 1.000.000,00
 * ceiling (so the API still answers "excede o limite") and far below Number.MAX_SAFE_INTEGER, so the
 * value shown is always exact.
 */
export function formatCurrencyInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, MAX_AMOUNT_INPUT_DIGITS);
  if (!digits) {
    return '';
  }
  const cents = parseInt(digits, 10);
  if (cents === 0) {
    return '0,00';
  }
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Validates whether a keypress corresponds to an allowed navigation, shortcut, or numeric key.
 */
export function isAllowedNumericKey(key: string, ctrlOrMeta: boolean): boolean {
  if (
    [
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ].includes(key) ||
    ctrlOrMeta
  ) {
    return true;
  }
  return /^\d$/.test(key);
}

/**
 * Formats recipient input: if user types numbers, applies progressive CPF mask;
 * if letters or '@' are present, preserves as clean email.
 */
export function formatRecipientInput(value: string): string {
  const trimmed = value.trim();
  if (/[a-zA-Z@]/.test(trimmed)) {
    return trimmed;
  }
  return formatCpf(trimmed);
}

/**
 * Validates whether a string matches a standard email format.
 */
export function isValidEmail(email: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

/**
 * Formats an ISO timestamp string into a localized Brazilian date and time string.
 */
export function formatDateTime(isoDate: string): string {
  return dateTimeFormatter.format(new Date(isoDate));
}
