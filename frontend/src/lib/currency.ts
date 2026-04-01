export interface FormatRandOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export function toSafeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
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
