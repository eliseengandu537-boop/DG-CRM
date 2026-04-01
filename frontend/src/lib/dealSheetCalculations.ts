import { roundMoney } from '@/lib/currency';

export const COMPANY_COMMISSION_RATE = 0.55;
export const BROKER_COMMISSION_RATE = 0.45;
export const VAT_RATE = 0.15;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export type DealPaymentStatus =
  | 'Awaiting payment'
  | 'Overdue'
  | 'Due Soon'
  | 'On Track'
  | 'Paid';

export function toSafeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function roundCurrency(value: unknown): number {
  return roundMoney(value, 2);
}

export function sanitizeCurrency(value: unknown, minimum = 0): number {
  return Math.max(minimum, roundCurrency(value));
}

export function clampCurrency(value: unknown, minimum: number, maximum: number): number {
  const normalizedMin = sanitizeCurrency(minimum, 0);
  const normalizedMax = sanitizeCurrency(maximum, normalizedMin);
  const normalizedValue = sanitizeCurrency(value, normalizedMin);
  return Math.min(normalizedValue, normalizedMax);
}

export function calculateCommissionSplit(grossCommission: unknown) {
  const grossComm = sanitizeCurrency(grossCommission, 0);
  const companyComm = roundCurrency(grossComm * COMPANY_COMMISSION_RATE);
  const brokerComm = grossComm - companyComm;

  return { grossComm, companyComm, brokerComm };
}

export function calculateInvoiceAmount(grossCommission: unknown): number {
  const grossComm = sanitizeCurrency(grossCommission, 0);
  return roundCurrency(grossComm * (1 + VAT_RATE));
}

export function calculatePendingAmount(grossCommission: unknown, paidAmount: unknown): number {
  const grossComm = sanitizeCurrency(grossCommission, 0);
  const paid = clampCurrency(paidAmount, 0, grossComm);
  return grossComm - paid;
}

function parseDateOnly(dateString: string): Date | null {
  if (!dateString) return null;

  const parts = dateString.split('-').map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    const [year, month, day] = parts;
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function derivePaymentStatus(params: {
  expectedPaymentDate?: string;
  pendingAmount: unknown;
  paidAmount: unknown;
  today?: Date;
}): DealPaymentStatus {
  const pending = sanitizeCurrency(params.pendingAmount, 0);
  const paid = sanitizeCurrency(params.paidAmount, 0);

  if (pending <= 0) return 'Paid';

  const expectedDate = parseDateOnly(params.expectedPaymentDate || '');
  if (!expectedDate) return paid <= 0 ? 'Awaiting payment' : 'On Track';

  const today = startOfDay(params.today || new Date());
  const dueDate = startOfDay(expectedDate);
  const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / MS_PER_DAY);

  if (daysUntilDue < 0) return 'Overdue';
  if (daysUntilDue <= 7) return 'Due Soon';
  if (paid <= 0) return 'Awaiting payment';
  return 'On Track';
}
