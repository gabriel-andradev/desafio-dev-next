import {
  formatCpf,
  formatCurrencyFromCents,
  formatCurrencyInput,
  formatRecipientInput,
  isAllowedNumericKey,
  isValidEmail,
  parseCurrencyInputToCents,
} from './formatters';

describe('Frontend Currency & CPF Utilities (TDD)', () => {
  describe('formatCurrencyFromCents', () => {
    it('should format positive cents into BRL currency string', () => {
      const formatted = formatCurrencyFromCents(125050).replace(/\s/g, ' ');
      expect(formatted).toBe('R$ 1.250,50');
    });

    it('should format negative cents accurately for overdrawn wallets', () => {
      const formatted = formatCurrencyFromCents(-5000).replace(/\s/g, ' ');
      expect(formatted).toBe('-R$ 50,00');
    });
  });

  describe('parseCurrencyInputToCents', () => {
    it('should convert standard comma-separated BRL values into exact integer cents', () => {
      expect(parseCurrencyInputToCents('19,99')).toBe(1999);
      expect(parseCurrencyInputToCents('1.250,50')).toBe(125050);
      expect(parseCurrencyInputToCents('100')).toBe(10000);
      expect(parseCurrencyInputToCents('10,5')).toBe(1050);
    });

    it('should return 0 for invalid or negative inputs', () => {
      expect(parseCurrencyInputToCents('')).toBe(0);
      expect(parseCurrencyInputToCents('-50,00')).toBe(0);
      expect(parseCurrencyInputToCents('abc')).toBe(0);
    });
  });

  describe('formatCurrencyInput', () => {
    it('should format raw digits into cent-based BRL currency format', () => {
      expect(formatCurrencyInput('')).toBe('');
      expect(formatCurrencyInput('5')).toBe('0,05');
      expect(formatCurrencyInput('50')).toBe('0,50');
      expect(formatCurrencyInput('500')).toBe('5,00');
      expect(formatCurrencyInput('5000')).toBe('50,00');
      expect(formatCurrencyInput('125050')).toBe('1.250,50');
    });

    it('should automatically strip letters and invalid characters', () => {
      expect(formatCurrencyInput('5hgh4y')).toBe('0,54');
      expect(formatCurrencyInput('abc')).toBe('');
    });
  });

  describe('formatRecipientInput', () => {
    it('should apply CPF mask when only digits are entered', () => {
      expect(formatRecipientInput('12345678901')).toBe('123.456.789-01');
    });

    it('should preserve email as-is without applying CPF formatting', () => {
      expect(formatRecipientInput('bruno@cobuccio.com')).toBe('bruno@cobuccio.com');
      expect(formatRecipientInput('  bruno@cobuccio.com  ')).toBe('bruno@cobuccio.com');
    });
  });

  describe('isValidEmail', () => {
    it('should validate valid email patterns', () => {
      expect(isValidEmail('bruno@cobuccio.com')).toBe(true);
      expect(isValidEmail('gabriel.andrade@empresa.com.br')).toBe(true);
    });

    it('should reject invalid email patterns', () => {
      expect(isValidEmail('bruno@cobuccio')).toBe(false);
      expect(isValidEmail('bruno')).toBe(false);
      expect(isValidEmail('@dominio.com')).toBe(false);
    });
  });

  describe('isAllowedNumericKey', () => {
    it('should allow digits and control keys', () => {
      expect(isAllowedNumericKey('5', false)).toBe(true);
      expect(isAllowedNumericKey('Backspace', false)).toBe(true);
      expect(isAllowedNumericKey('Tab', false)).toBe(true);
      expect(isAllowedNumericKey('v', true)).toBe(true); // Ctrl+V
    });

    it('should block letters and special characters', () => {
      expect(isAllowedNumericKey('a', false)).toBe(false);
      expect(isAllowedNumericKey('h', false)).toBe(false);
      expect(isAllowedNumericKey('!', false)).toBe(false);
    });
  });

  describe('formatCpf', () => {
    it('should apply standard mask to 11-digit CPF', () => {
      expect(formatCpf('12345678901')).toBe('123.456.789-01');
    });

    it('should progressively format CPF while typing', () => {
      expect(formatCpf('123')).toBe('123');
      expect(formatCpf('1234')).toBe('123.4');
      expect(formatCpf('123456')).toBe('123.456');
      expect(formatCpf('1234567')).toBe('123.456.7');
      expect(formatCpf('1234567890')).toBe('123.456.789-0');
      expect(formatCpf('12345678901999')).toBe('123.456.789-01');
    });
  });
});

