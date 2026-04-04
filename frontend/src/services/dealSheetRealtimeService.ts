import { Broker, brokerService } from '@/services/brokerService';
import { Deal, dealService } from '@/services/dealService';
import { ForecastDealRecord, forecastDealApiService } from '@/services/forecastDealService';
import { PropertyRecord, propertyService } from '@/services/propertyService';

export type DealTypeLabel = 'Leasing' | 'Sales' | 'Auction';

const CLOSED_STATUSES = new Set(['closed', 'awaiting_payment', 'completed', 'won', 'invoice']);
const LOST_STATUSES = new Set(['lost', 'cancelled', 'canceled', 'rejected']);
const AWAITING_PAYMENT_STATUSES = new Set(['awaiting_payment', 'invoice']);

const DEFAULT_COMMISSION_RATE = 0.05;

export interface DealSheetRealtimeData {
  deals: Deal[];
  forecastDeals: ForecastDealRecord[];
  brokers: Broker[];
  properties: PropertyRecord[];
}

function normalizeStatus(status: string): string {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function normalizeDealType(type: string): DealTypeLabel {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'leasing' || normalized === 'lease') return 'Leasing';
  if (normalized === 'auction') return 'Auction';
  return 'Sales';
}

export function isClosedStatus(status: string): boolean {
  return CLOSED_STATUSES.has(normalizeStatus(status));
}

export function isLostStatus(status: string): boolean {
  return LOST_STATUSES.has(normalizeStatus(status));
}

export function isAwaitingPaymentStatus(status: string): boolean {
  return AWAITING_PAYMENT_STATUSES.has(normalizeStatus(status));
}

export function isClosedDeal(deal: Deal): boolean {
  if (isLostStatus(deal.status)) return false;
  if (deal.closedDate) return true;
  return isClosedStatus(deal.status);
}

export function isClosedForecastDeal(deal: ForecastDealRecord): boolean {
  if (isLostStatus(deal.status)) return false;
  return isClosedStatus(deal.status);
}

export function estimateDealGrossCommission(value: number): number {
  return Math.round(Number(value || 0) * DEFAULT_COMMISSION_RATE);
}

export function getDealGrossCommission(deal: Deal): number {
  const stored = Number(deal.grossCommission || 0);
  if (stored > 0) return stored;
  return estimateDealGrossCommission(Number(deal.value || 0));
}

export function getDealCompanyCommission(deal: Deal): number {
  const stored = Number(deal.companyCommission || 0);
  if (stored > 0) return stored;
  const gross = getDealGrossCommission(deal);
  return Math.round(gross * 0.55 * 100) / 100;
}

export function getDealBrokerCommission(deal: Deal): number {
  const stored = Number(deal.brokerCommission || 0);
  if (stored > 0) return stored;
  const gross = getDealGrossCommission(deal);
  const company = getDealCompanyCommission(deal);
  return Math.round((gross - company) * 100) / 100;
}

export function estimateForecastGrossCommission(deal: ForecastDealRecord): number {
  const commissionAmount = Number(deal.commissionAmount || 0);
  if (commissionAmount > 0) return Math.round(commissionAmount);
  const commissionRate = Number(deal.commissionRate || DEFAULT_COMMISSION_RATE);
  return Math.round(Number(deal.expectedValue || 0) * commissionRate);
}

export function getIsoDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

async function fetchAllDeals(): Promise<Deal[]> {
  const limit = 200;
  let page = 1;
  let pages = 1;
  const results: Deal[] = [];

  do {
    const response = await dealService.getAllDeals({ page, limit });
    results.push(...(response.data || []));
    pages = response.pagination?.pages || 1;
    page += 1;
  } while (page <= pages);

  return results;
}

async function fetchAllForecastDeals(): Promise<ForecastDealRecord[]> {
  const limit = 200;
  let page = 1;
  let pages = 1;
  const results: ForecastDealRecord[] = [];

  do {
    const response = await forecastDealApiService.getAllForecastDeals({ page, limit });
    results.push(...(response.data || []));
    pages = response.pagination?.pages || 1;
    page += 1;
  } while (page <= pages);

  return results;
}

async function fetchAllProperties(): Promise<PropertyRecord[]> {
  const limit = 200;
  let page = 1;
  let pages = 1;
  const results: PropertyRecord[] = [];

  do {
    const response = await propertyService.getAllProperties({ page, limit });
    results.push(...(response.data || []));
    pages = response.pagination?.pages || 1;
    page += 1;
  } while (page <= pages);

  return results;
}

export async function fetchDealSheetRealtimeData(): Promise<DealSheetRealtimeData> {
  const [deals, forecastDeals, brokers, properties] = await Promise.all([
    fetchAllDeals(),
    fetchAllForecastDeals(),
    brokerService.getAllBrokers({ includeArchived: true }),
    fetchAllProperties(),
  ]);

  const latestForecastByDealId = new Map<string, ForecastDealRecord>();
  for (const forecast of forecastDeals) {
    const dealId = String(forecast.dealId || '').trim();
    if (!dealId) continue;

    const existing = latestForecastByDealId.get(dealId);
    if (!existing) {
      latestForecastByDealId.set(dealId, forecast);
      continue;
    }

    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const nextTime = new Date(forecast.updatedAt || forecast.createdAt || 0).getTime();
    if (nextTime >= existingTime) {
      latestForecastByDealId.set(dealId, forecast);
    }
  }

  const projectedDeals = deals.map(deal => {
    const linkedForecast = latestForecastByDealId.get(String(deal.id || '').trim());
    if (!linkedForecast) return deal;
    if (!isLostStatus(linkedForecast.status)) return deal;

    return {
      ...deal,
      status: linkedForecast.status,
    };
  });

  return {
    deals: projectedDeals,
    forecastDeals,
    brokers,
    properties,
  };
}
