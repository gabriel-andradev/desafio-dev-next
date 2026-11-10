import {
  formatCpf,
  formatCurrencyFromCents,
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

