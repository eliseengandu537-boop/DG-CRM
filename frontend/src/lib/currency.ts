export interface FormatRandOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

function normalizeNumericString(value: string): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^\d,.-]/g, '');

  if (!cleaned) return '';

  const commaCount = (cleaned.match(/,/g) || []).length;
  const dotCount = (cleaned.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    return cleaned.replace(/,/g, '');
  }

  if (commaCount > 0) {
    const lastCommaIndex = cleaned.lastIndexOf(',');
    const digitsAfterComma = cleaned.length - lastCommaIndex - 1;
    if (digitsAfterComma > 0 && digitsAfterComma <= 2) {
      return cleaned.replace(/\./g, '').replace(',', '.');
    }
    return cleaned.replace(/,/g, '');
  }

  if (dotCount > 1) {
    return cleaned.replace(/\./g, '');
  }

  if (dotCount === 1) {
    const lastDotIndex = cleaned.lastIndexOf('.');
    const digitsAfterDot = cleaned.length - lastDotIndex - 1;
    if (digitsAfterDot === 3) {
      return cleaned.replace(/\./g, '');
    }
  }

  return cleaned;
}

export function parseCurrencyInput(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string') {
    const normalized = normalizeNumericString(value);
    if (!normalized || normalized === '-' || normalized === '.' || normalized === ',') {
      return fallback;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function toSafeNumber(value: unknown): number {
  return parseCurrencyInput(value, 0);
}

export function roundMoney(value: unknown, precision: number = 2): number {
  const safePrecision = Number.isFinite(precision) && precision >= 0 ? precision : 2;
  const factor = 10 ** safePrecision;
  return Math.round(toSafeNumber(value) * factor) / factor;
}

export function formatRand(value: unknown, options: FormatRandOptions = {}): string {
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const maximumFractionDigits =
    options.maximumFractionDigits ?? options.minimumFractionDigits ?? 0;

  return `R ${new Intl.NumberFormat('en-ZA', {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(toSafeNumber(value))}`;
}

export const formatCurrency = formatRand;
