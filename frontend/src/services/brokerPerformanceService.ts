import { Deal, dealService } from '@/services/dealService';
import { ForecastDealRecord, forecastDealApiService } from '@/services/forecastDealService';
import { Lead, leadService } from '@/services/leadService';
import { PropertyRecord, propertyService } from '@/services/propertyService';
import { StockItemRecord, stockService } from '@/services/stockService';
import { roundMoney } from '@/lib/currency';
import {
  dealWorkflowStatusLabel,
  isFinalDealWorkflowStatus,
  parseDealWorkflowStatus,
} from '@/lib/dealWorkflow';

const LOST_STATUSES = new Set(['lost', 'cancelled', 'canceled', 'rejected']);

export type BrokerDealType = 'Leasing' | 'Sales' | 'Auction';

export interface BrokerWipItem {
  id: string;
  forecastDealId?: string;
  dealId?: string;
  leadId?: string;
  brokerId?: string;
  propertyId?: string;
  dealName: string;
  address?: string;
  dealType: BrokerDealType;
  status: string;
  legalDocument?: string;
  expectedValue: number;
  brokerCommission: number;
  forecastedClosureDate?: string;
  actionRequired?: string;
  comment?: string;
  statusDocuments?: Deal['statusDocuments'];
  statusHistory?: Deal['statusHistory'];
  workflowProgress?: Deal['workflowProgress'];
  createdAt: string;
  updatedAt: string;
}

export interface BrokerPerformanceSnapshot {
  currentBilling: number;
  wonDealsWip: number;
  lostDealsWip: number;
  wipItems: BrokerWipItem[];
}

function normalizeStatus(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function isClosedStatus(status: string): boolean {
  if (isFinalDealWorkflowStatus(status)) return true;
  const normalized = normalizeStatus(status);
  return (
    normalized === 'closed' ||
    normalized === 'won' ||
    normalized === 'completed' ||
    normalized === 'awaiting_payment' ||
    normalized === 'invoice'
  );
}

function isLostStatus(status: string): boolean {
  return LOST_STATUSES.has(normalizeStatus(status));
}

function normalizeDealType(type: string): BrokerDealType {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'leasing' || value === 'lease') return 'Leasing';
  if (value === 'auction') return 'Auction';
  return 'Sales';
}

function asObjectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function detailString(details: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const raw = details[key];
    const normalized = String(raw || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function deriveCommissionRate(params: {
  deal: Deal;
  linkedForecast?: ForecastDealRecord;
}): number {
  const { deal, linkedForecast } = params;
  const candidateRate = Number(
    (deal as any).commissionRate ??
      (linkedForecast as any)?.commissionRate ??
      (deal as any).forecastCommissionRate
  );
  if (Number.isFinite(candidateRate) && candidateRate > 0) {
    return candidateRate;
  }

  const candidatePercent = Number(
    (deal as any).commissionPercent ?? (linkedForecast as any)?.commissionPercent
  );
  if (Number.isFinite(candidatePercent) && candidatePercent > 0) {
    return candidatePercent / 100;
  }

  const candidateBrokerCommission = Number(
    (deal as any).brokerCommission ?? (linkedForecast as any)?.brokerCommission
  );
  const dealValue = Number((deal as any).value || 0);
  if (
    dealValue > 0 &&
    Number.isFinite(candidateBrokerCommission) &&
    candidateBrokerCommission > 0
  ) {
    return candidateBrokerCommission / dealValue;
  }

  return 0;
}

function mapDealStatusToWipStatus(status: string): string {
  const parsed = parseDealWorkflowStatus(status);
  if (!parsed) return String(status || '').trim();
  return dealWorkflowStatusLabel(parsed);
}

function pickLatestForecastByDealId(
  records: ForecastDealRecord[]
): { byDealId: Map<string, ForecastDealRecord>; orphans: ForecastDealRecord[] } {
  const byDealId = new Map<string, ForecastDealRecord>();
  const orphans: ForecastDealRecord[] = [];

  for (const item of records) {
    const dealId = String(item.dealId || '').trim();
    if (!dealId) {
      orphans.push(item);
      continue;
    }

    const existing = byDealId.get(dealId);
    if (!existing) {
      byDealId.set(dealId, item);
      continue;
    }

    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const nextTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
    if (nextTime >= existingTime) {
      byDealId.set(dealId, item);
    }
  }

  return { byDealId, orphans };
}

async function fetchAllDeals(): Promise<Deal[]> {
  const limit = 200;
  let page = 1;
  let pages = 1;
  const records: Deal[] = [];

  do {
    const response = await dealService.getAllDeals({ page, limit });
    records.push(...(response.data || []));
    pages = response.pagination?.pages || 1;
    page += 1;
  } while (page <= pages);

  return records;
}

async function fetchAllForecastDeals(): Promise<ForecastDealRecord[]> {
  const limit = 200;
  let page = 1;
  let pages = 1;
  const records: ForecastDealRecord[] = [];

  do {
    const response = await forecastDealApiService.getAllForecastDeals({ page, limit });
    records.push(...(response.data || []));
    pages = response.pagination?.pages || 1;
    page += 1;
  } while (page <= pages);

  return records;
}

async function fetchAllProperties(): Promise<PropertyRecord[]> {
  const limit = 200;
  let page = 1;
  let pages = 1;
  const records: PropertyRecord[] = [];

  do {
    const response = await propertyService.getAllProperties({ page, limit });
    records.push(...(response.data || []));
    pages = response.pagination?.pages || 1;
    page += 1;
  } while (page <= pages);

  return records;
}

async function fetchAllStockItems(): Promise<StockItemRecord[]> {
  const limit = 200;
  let page = 1;
  let pages = 1;
  const records: StockItemRecord[] = [];

  do {
    const response = await stockService.getAllStockItems({ page, limit });
    records.push(...(response.data || []));
    pages = response.pagination?.pages || 1;
    page += 1;
  } while (page <= pages);

  return records;
}

async function fetchAllLeads(): Promise<Lead[]> {
  const limit = 200;
  let page = 1;
  let pages = 1;
  const records: Lead[] = [];

  do {
    const response = await leadService.getAllLeads({ page, limit });
    records.push(...(response.data || []));
    pages = response.pagination?.pages || 1;
    page += 1;
  } while (page <= pages);

  return records;
}

function resolveStockAddress(item: StockItemRecord): string {
  const details = asObjectRecord(item.details);
  const formattedAddress = detailString(details, ['formatted_address']).trim();
  if (formattedAddress) {
    return formattedAddress;
  }

  const address =
    detailString(details, ['address', 'location', 'propertyAddress']).trim() ||
    String(item.address || '').trim();
  const area = detailString(details, ['areaName', 'locality', 'suburb', 'neighborhood']).trim();
  const city = detailString(details, ['city']).trim();

  return [address, area, city].filter(Boolean).join(', ');
}

function resolveLeadComment(lead: Lead | undefined): string {
  if (!lead) return '';
  return String(lead.comment || lead.notes || '').trim();
}

function deriveActionRequired(status: string): string {
  const normalized = normalizeStatus(status).replace(/[\s-]+/g, '_');
  if (normalized === 'loi' || normalized === 'otp' || normalized === 'otl') {
    return 'Legal document required';
  }
  if (normalized === 'sales_agreement' || normalized === 'sale_agreement' || normalized === 'lease_agreement') {
    return 'Agreement completed';
  }
  if (normalized === 'closed' || normalized === 'won') return 'Deal finalized';
  if (normalized === 'awaiting_payment') return 'Collect payment';
  if (normalized === 'loi') return 'Prepare OTP/OTL';
  if (normalized === 'otp' || normalized === 'otl') return 'Prepare agreement';
  return '-';
}

function mapToSnapshotRecord(
  map: Map<string, BrokerPerformanceSnapshot>
): Record<string, BrokerPerformanceSnapshot> {
  return Array.from(map.entries()).reduce<Record<string, BrokerPerformanceSnapshot>>(
    (acc, [brokerId, snapshot]) => {
      acc[brokerId] = snapshot;
      return acc;
    },
    {}
  );
}

export async function fetchBrokerPerformanceMap(): Promise<
  Record<string, BrokerPerformanceSnapshot>
> {
  const [deals, forecastDeals, properties, stockItems, leads] = await Promise.all([
    fetchAllDeals(),
    fetchAllForecastDeals(),
    fetchAllProperties(),
    fetchAllStockItems().catch(() => []),
    fetchAllLeads().catch(() => []),
  ]);
  const snapshots = new Map<string, BrokerPerformanceSnapshot>();
  const dealById = new Map<string, Deal>(deals.map(deal => [deal.id, deal]));
  const leadById = new Map<string, Lead>(leads.map(lead => [lead.id, lead]));
  const leadCommentByDealId = new Map<string, { leadId: string; comment: string; updatedAt: string }>();
  for (const lead of leads) {
    const linkedDealId = String(lead.dealId || '').trim();
    if (!linkedDealId) continue;

    const comment = resolveLeadComment(lead);
    if (!comment) continue;

    const current = leadCommentByDealId.get(linkedDealId);
    const nextUpdated = String(lead.updatedAt || lead.createdAt || '');
    if (!current || nextUpdated >= current.updatedAt) {
      leadCommentByDealId.set(linkedDealId, {
        leadId: String(lead.id || '').trim(),
        comment,
        updatedAt: nextUpdated,
      });
    }
  }

  const propertyById = new Map<string, PropertyRecord>(properties.map(property => [property.id, property]));
  const stockAddressByPropertyId = new Map<string, { address: string; updatedAt: string }>();
  for (const item of stockItems) {
    const propertyId = String(item.propertyId || '').trim();
    if (!propertyId) continue;

    const fullAddress = resolveStockAddress(item);
    if (!fullAddress) continue;

    const current = stockAddressByPropertyId.get(propertyId);
    const nextUpdated = String(item.updatedAt || item.createdAt || '');
    if (!current || nextUpdated >= current.updatedAt) {
      stockAddressByPropertyId.set(propertyId, {
        address: fullAddress,
        updatedAt: nextUpdated,
      });
    }
  }
  const { byDealId: forecastByDealId, orphans: orphanForecastDeals } =
    pickLatestForecastByDealId(forecastDeals);

  const upsert = (brokerId: string): BrokerPerformanceSnapshot => {
    const safeBrokerId = String(brokerId || '').trim();
    const existing = snapshots.get(safeBrokerId);
    if (existing) return existing;
    const created: BrokerPerformanceSnapshot = {
      currentBilling: 0,
      wonDealsWip: 0,
      lostDealsWip: 0,
      wipItems: [],
    };
    snapshots.set(safeBrokerId, created);
    return created;
  };

  for (const deal of deals) {
    const linkedForecast = forecastByDealId.get(deal.id);
    if (linkedForecast && isLostStatus(linkedForecast.status)) continue;

    const brokerId = String(deal.brokerId || '').trim();
    if (!brokerId) continue;
    if (!isClosedStatus(deal.status)) continue;

    const commissionRate = deriveCommissionRate({ deal, linkedForecast });
    const dealValue = Number(deal.value || 0);
    const commission = roundMoney(dealValue * commissionRate, 2);
    if (commission <= 0) continue;

    const snapshot = upsert(brokerId);
    snapshot.currentBilling += commission;
  }

  for (const deal of deals) {
    const brokerId = String(deal.brokerId || '').trim();
    if (!brokerId) continue;

    const snapshot = upsert(brokerId);
    const linkedForecast = forecastByDealId.get(deal.id);
    const linkedProperty = deal.propertyId ? propertyById.get(deal.propertyId) : undefined;
    const linkedLeadId = String((deal as any).leadId || '').trim();
    const linkedLead = linkedLeadId ? leadById.get(linkedLeadId) : undefined;
    const leadFromDeal = leadCommentByDealId.get(deal.id);
    const stockAddress =
      deal.propertyId && stockAddressByPropertyId.has(deal.propertyId)
        ? stockAddressByPropertyId.get(deal.propertyId)?.address
        : '';
    const status = linkedForecast?.status || mapDealStatusToWipStatus(deal.status);
    const updatedAt = linkedForecast?.updatedAt || deal.updatedAt;
    const createdAt = linkedForecast?.createdAt || deal.createdAt;

    snapshot.wipItems.push({
      id: deal.id,
      forecastDealId: linkedForecast?.id,
      dealId: deal.id,
      leadId: linkedLeadId || leadFromDeal?.leadId || undefined,
      brokerId,
      propertyId: deal.propertyId || undefined,
      dealName: linkedForecast?.title || deal.title,
      address:
        String(stockAddress || '').trim() ||
        String(linkedProperty?.address || '').trim() ||
        '',
      dealType: normalizeDealType(linkedForecast?.moduleType || deal.type),
      status,
      legalDocument:
        linkedForecast?.legalDocument || String((deal as any).legalDocumentId || '').trim() || '',
      statusDocuments: deal.statusDocuments || [],
      statusHistory: deal.statusHistory || [],
      workflowProgress: deal.workflowProgress,
      expectedValue: Number(linkedForecast?.expectedValue || deal.value || 0),
      brokerCommission: (() => {
        const stored = Number(linkedForecast?.brokerCommission || 0);
        if (stored > 0) return stored;
        const rate = deriveCommissionRate({ deal, linkedForecast });
        const value = Number(linkedForecast?.expectedValue || deal.value || 0);
        return roundMoney(value * rate * 0.45, 2);
      })(),
      forecastedClosureDate:
        linkedForecast?.forecastedClosureDate || deal.targetClosureDate || undefined,
      actionRequired: deriveActionRequired(status),
      comment:
        String(leadFromDeal?.comment || '').trim() ||
        resolveLeadComment(linkedLead) ||
        String(deal.description || '').trim(),
      createdAt,
      updatedAt,
    });
  }

  for (const forecastDeal of orphanForecastDeals) {
    const brokerId = String(forecastDeal.brokerId || '').trim();
    if (!brokerId) continue;
    if (forecastDeal.dealId && dealById.has(forecastDeal.dealId)) continue;

    const snapshot = upsert(brokerId);
    snapshot.wipItems.push({
      id: forecastDeal.id,
      forecastDealId: forecastDeal.id,
      dealId: forecastDeal.dealId || undefined,
      brokerId,
      propertyId: undefined,
      dealName: forecastDeal.title,
      address: '',
      dealType: normalizeDealType(forecastDeal.moduleType),
      status: forecastDeal.status,
      legalDocument: forecastDeal.legalDocument || '',
      statusDocuments: [],
      statusHistory: [],
      workflowProgress: undefined,
      expectedValue: Number(forecastDeal.expectedValue || 0),
      brokerCommission: Number(forecastDeal.brokerCommission || 0),
      forecastedClosureDate: forecastDeal.forecastedClosureDate,
      actionRequired: deriveActionRequired(forecastDeal.status),
      comment: String(leadCommentByDealId.get(String(forecastDeal.dealId || '').trim())?.comment || ''),
      createdAt: forecastDeal.createdAt,
      updatedAt: forecastDeal.updatedAt,
    });
  }

  Array.from(snapshots.values()).forEach(snapshot => {
    snapshot.wonDealsWip = snapshot.wipItems.filter(item => isClosedStatus(item.status)).length;
    snapshot.lostDealsWip = snapshot.wipItems.filter(item => isLostStatus(item.status)).length;
    snapshot.currentBilling = roundMoney(snapshot.currentBilling, 2);
    snapshot.wipItems.sort((a: BrokerWipItem, b: BrokerWipItem) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  });

  return mapToSnapshotRecord(snapshots);
}
