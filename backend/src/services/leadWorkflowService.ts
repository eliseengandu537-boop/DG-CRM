import { CoBrokerSplit, Deal, ForecastDeal, Lead, User } from '@/types';
import { LeadWorkflowSyncInput } from '@/validators';
import { DealStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { auditLogService } from '@/services/auditLogService';
import { dealActivityService } from '@/services/dealActivityService';
import {
  assertAssignedBrokerMatchesDepartment,
  assertBrokerCanAccessDealType,
  assertBrokerCanAccessModule,
  canBrokerAccessRecord,
} from '@/lib/departmentAccess';
import { ModuleScope } from '@/types';
import { calculateDealFinancials, toPercentFromRate } from '@/lib/dealFinancials';
import {
  getDealStatusLabel,
  isFinalDealStatus,
  resolveDealStatus,
  resolveDealStatusOrNull,
  statusRequiresWorkflowDocument,
} from '@/lib/dealWorkflow';
import {
  assertDealTransitionWithClient,
  recordDealStatusHistoryWithClient,
  upsertDealStatusDocumentWithClient,
} from '@/lib/dealWorkflowPersistence';

type LeadRecord = Awaited<ReturnType<typeof prisma.lead.findUnique>> & {
  broker?: { id: string; name: string } | null;
};

type DealRecord = Awaited<ReturnType<typeof prisma.deal.findUnique>> & {
  broker?: { id: string; name: string } | null;
};

type ForecastRecord = Awaited<ReturnType<typeof prisma.forecastDeal.findUnique>> & {
  broker?: { id: string; name: string } | null;
};

function roundMoney(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function asOptionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeText(value?: string | null): string {
  return String(value || '').trim();
}

function parseCoBrokerSplits(value: unknown): CoBrokerSplit[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map(entry => {
      const brokerId = String((entry as any)?.brokerId || '').trim();
      const splitPercent = Number((entry as any)?.splitPercent);
      if (!brokerId || !Number.isFinite(splitPercent)) return null;
      const brokerShareRaw = Number((entry as any)?.brokerShare);
      return {
        brokerId,
        splitPercent: roundMoney(splitPercent),
        ...(Number.isFinite(brokerShareRaw) ? { brokerShare: roundMoney(brokerShareRaw) } : {}),
      } as CoBrokerSplit;
    })
    .filter((entry): entry is CoBrokerSplit => Boolean(entry));
  return normalized.length > 0 ? normalized : undefined;
}

function resolveCoBrokerInput(
  first?: unknown,
  second?: unknown,
  fallback?: unknown
): CoBrokerSplit[] | undefined {
  return parseCoBrokerSplits(first) || parseCoBrokerSplits(second) || parseCoBrokerSplits(fallback);
}

function isLegacyPropertySchemaError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase();
  if (!message.includes('does not exist')) return false;
  return message.includes('module_type') || message.includes('created_by_broker_id');
}

function normalizeModuleType(value?: string | null): 'sales' | 'leasing' | 'auction' {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'leasing' || normalized === 'lease') return 'leasing';
  if (normalized === 'auction') return 'auction';
  return 'sales';
}

function normalizeDealType(value?: string | null): 'sale' | 'lease' | 'auction' {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'lease' || normalized === 'leasing') return 'lease';
  if (normalized === 'auction') return 'auction';
  return 'sale';
}

function deriveDealStatus(status?: string | null): DealStatus {
  return resolveDealStatus(status, {
    fallback: DealStatus.LOI,
    allowLegacyMapping: true,
  });
}

function isLegalWorkflowStatus(status?: string | null): boolean {
  const resolved = resolveDealStatusOrNull(status, { allowLegacyMapping: true });
  return Boolean(resolved && statusRequiresWorkflowDocument(resolved));
}

function isClosedWorkflowStatus(status?: string | null): boolean {
  const resolved = resolveDealStatusOrNull(status, { allowLegacyMapping: true });
  return Boolean(resolved && isFinalDealStatus(resolved));
}

function mapLead(record: NonNullable<LeadRecord>): Lead {
  const resolvedComment = (record as any).comment ?? record.notes;
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    phone: record.phone,
    moduleType: (record.moduleType as ModuleScope | null) ?? undefined,
    stage: record.stage ?? undefined,
    company: record.company ?? undefined,
    leadSource: record.leadSource ?? undefined,
    dealType: record.dealType ?? undefined,
    probability: record.probability ?? undefined,
    closingTimeline: record.closingTimeline ?? undefined,
    notes: record.notes ?? undefined,
    comment: resolvedComment ?? undefined,
    contactId: record.contactId ?? undefined,
    brokerAssigned: record.brokerAssigned ?? undefined,
    additionalBroker: record.additionalBroker ?? undefined,
    commissionSplit: (record.commissionSplit as Record<string, number> | null) ?? undefined,
    propertyAddress: record.propertyAddress ?? undefined,
    leadType: record.leadType ?? undefined,
    linkedStockId: record.linkedStockId ?? undefined,
    dealId: record.dealId ?? undefined,
    forecastDealId: record.forecastDealId ?? undefined,
    legalDocumentId: record.legalDocumentId ?? undefined,
    status: record.status,
    brokerId: record.brokerId ?? undefined,
    assignedBrokerName: record.broker?.name ?? undefined,
    propertyId: record.propertyId ?? undefined,
    broker: record.brokerId ?? undefined,
    property: record.propertyId ?? undefined,
    value: record.value ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapDeal(record: NonNullable<DealRecord>): Deal {
  const parsedSplits = parseCoBrokerSplits((record as any).coBrokerSplits);
  return {
    id: record.id,
    title: record.title,
    description: record.description ?? undefined,
    status: getDealStatusLabel(record.status as DealStatus),
    type: record.type as Deal['type'],
    value: record.value,
    assetValue: (record as any).assetValue ?? record.value,
    commissionPercent: (record as any).commissionPercent ?? undefined,
    grossCommission: (record as any).grossCommission ?? undefined,
    companyCommission: (record as any).companyCommission ?? undefined,
    brokerCommission: (record as any).brokerCommission ?? undefined,
    brokerSplitPercent: (record as any).brokerSplitPercent ?? undefined,
    auctionReferralPercent: (record as any).auctionReferralPercent ?? undefined,
    auctionCommissionPercent: (record as any).auctionCommissionPercent ?? undefined,
    coBrokerSplits: parsedSplits ?? undefined,
    targetClosureDate: record.targetClosureDate ?? undefined,
    closedDate: record.closedDate ?? undefined,
    leadId: record.leadId,
    propertyId: record.propertyId,
    brokerId: record.brokerId,
    legalDocumentId: record.legalDocumentId ?? undefined,
    assignedBrokerId: record.brokerId,
    assignedBrokerName: record.broker?.name ?? undefined,
    lastActivityAt: (record as any).lastActivityAt ?? undefined,
    inactivityNotifiedAt: (record as any).inactivityNotifiedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapForecastDeal(record: NonNullable<ForecastRecord>): ForecastDeal {
  const parsedSplits = parseCoBrokerSplits((record as any).coBrokerSplits);
  return {
    id: record.id,
    dealId: record.dealId ?? undefined,
    brokerId: record.brokerId,
    assignedBrokerId: record.brokerId,
    assignedBrokerName: record.broker?.name ?? undefined,
    dealType: (record as any).dealType ?? normalizeDealType(record.moduleType),
    moduleType: record.moduleType as ForecastDeal['moduleType'],
    status: record.status,
    title: record.title,
    expectedValue: record.expectedValue,
    assetValue: (record as any).assetValue ?? record.expectedValue,
    commissionPercent: (record as any).commissionPercent ?? undefined,
    grossCommission: (record as any).grossCommission ?? record.commissionAmount,
    commissionRate: record.commissionRate,
    commissionAmount: record.commissionAmount,
    companyCommission: record.companyCommission,
    brokerCommission: record.brokerCommission,
    brokerSplitPercent: (record as any).brokerSplitPercent ?? undefined,
    auctionReferralPercent: (record as any).auctionReferralPercent ?? undefined,
    auctionCommissionPercent: (record as any).auctionCommissionPercent ?? undefined,
    coBrokerSplits: parsedSplits ?? undefined,
    forecastedClosureDate: record.forecastedClosureDate ?? undefined,
    expectedPaymentDate: record.expectedPaymentDate ?? undefined,
    createdByUserId: record.createdByUserId ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function assertLegalDocumentReady(legalDocumentId: string): Promise<void> {
  const document = await prisma.legalDocument.findUnique({
    where: { id: legalDocumentId },
    select: { id: true },
  });

  if (!document) {
    throw new Error('Linked legal document not found');
  }
}

function buildPropertyPayload(input: {
  data: LeadWorkflowSyncInput;
  existingLead: NonNullable<LeadRecord>;
  stock: any;
  brokerId: string | null;
  moduleType: 'sales' | 'leasing' | 'auction';
}): {
  title: string;
  description: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  type: string;
  price: number;
  area: number;
  status: string;
  brokerId?: string;
  metadata: Record<string, unknown>;
} {
  const details = input.stock?.details && typeof input.stock.details === 'object' && !Array.isArray(input.stock.details)
    ? (input.stock.details as Record<string, unknown>)
    : {};

  const title =
    normalizeText(input.data.propertyTitle) ||
    normalizeText(input.data.stockName) ||
    normalizeText(String(details.itemName || details.propertyName || details.name || '')) ||
    normalizeText(input.data.propertyAddress) ||
    normalizeText(input.data.stockAddress) ||
    input.existingLead.name;

  const address =
    normalizeText(input.data.propertyAddress) ||
    normalizeText(input.data.stockAddress) ||
    normalizeText(
      String(
        details.formatted_address ||
          details.location ||
          details.address ||
          details.propertyAddress ||
          ''
      )
    ) ||
    title;

  const city = normalizeText(input.data.propertyCity) || normalizeText(String(details.city || '')) || 'Unknown';
  const province =
    normalizeText(input.data.propertyProvince) ||
    normalizeText(String(details.province || '')) ||
    'Unknown';
  const postalCode =
    normalizeText(input.data.propertyPostalCode) ||
    normalizeText(String(details.postalCode || '')) ||
    'Unknown';
  const type =
    normalizeText(input.data.propertyType) ||
    normalizeText(String(details.type || details.category || '')) ||
    (input.moduleType === 'auction' ? 'Auction' : input.moduleType === 'leasing' ? 'Leasing' : 'Sales');
  const price =
    roundMoney(input.data.propertyPrice) ||
    roundMoney(details.purchasePrice ?? details.value ?? details.price ?? input.data.dealValue ?? input.data.forecastExpectedValue ?? input.existingLead.value ?? 0);
  const area = roundMoney(input.data.propertyArea || details.area || 0);
  const status =
    normalizeText(input.data.propertyStatus) ||
    normalizeText(String(details.status || '')) ||
    'for_sale';

  return {
    title,
    description:
      normalizeText(input.data.dealDescription) ||
      normalizeText(String(details.comments || details.notes || '')) ||
      '',
    address,
    city,
    province,
    postalCode,
    type,
    price,
    area,
    status,
    brokerId: input.brokerId || undefined,
    metadata: {
      source: 'lead-workflow',
      leadId: input.existingLead.id,
      stockId: input.data.stockId || null,
      moduleType: input.moduleType,
      stockDetails: details,
    },
  };
}

function getExplicitBrokerId(
  input: LeadWorkflowSyncInput,
  existingLead: NonNullable<LeadRecord>,
  user?: User
): string | null {
  return (
    normalizeText(input.brokerId) ||
    normalizeText(existingLead.brokerId) ||
    (user?.role === 'broker' ? normalizeText(user.brokerId) : '')
  ) || null;
}

function getWorkflowCreatedByBrokerId(user?: User | null): string | null {
  if (!user || user.role !== 'broker') return null;
  return normalizeText(user.brokerId) || null;
}

async function resolveBrokerIdFromWorkflowContext(
  tx: Prisma.TransactionClient,
  existingLead: NonNullable<LeadRecord>,
  explicitBrokerId: string | null,
  user: User | undefined,
  moduleType: 'sales' | 'leasing' | 'auction',
  resolvedPropertyId: string | null,
  stockRecord: {
    details?: unknown;
    propertyId?: string | null;
    createdBy?: string | null;
    assignedBrokerId?: string | null;
  } | null
): Promise<string | null> {
  if (explicitBrokerId) {
    const explicitBroker = await tx.broker.findUnique({
      where: { id: explicitBrokerId },
      select: { id: true },
    });
    if (explicitBroker?.id) {
      return explicitBroker.id;
    }

    const explicitUser = await tx.user.findUnique({
      where: { id: explicitBrokerId },
      select: { email: true },
    });

    const explicitUserEmail = normalizeText(explicitUser?.email).toLowerCase();
    if (explicitUserEmail) {
      const brokerFromUserEmail = await tx.broker.findFirst({
        where: {
          email: { equals: explicitUserEmail, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (brokerFromUserEmail?.id) {
        return brokerFromUserEmail.id;
      }
    }
  }

  const leadCreatorBrokerId = normalizeText(existingLead.createdByBrokerId);
  if (leadCreatorBrokerId) {
    const leadCreatorBroker = await tx.broker.findUnique({
      where: { id: leadCreatorBrokerId },
      select: { id: true },
    });

    if (leadCreatorBroker?.id) {
      return leadCreatorBroker.id;
    }
  }

  const propertyCandidate = normalizeText(resolvedPropertyId) || normalizeText(existingLead.propertyId) || null;
  if (propertyCandidate) {
    const property = await tx.property.findUnique({
      where: { id: propertyCandidate },
      select: { brokerId: true },
    });

    if (property?.brokerId) {
      return normalizeText(property.brokerId) || null;
    }
  }

  const details = stockRecord?.details;
  const detailsRecord =
    details && typeof details === 'object' && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : {};
  const stockBrokerId = normalizeText(
    String(
      stockRecord?.assignedBrokerId ||
        detailsRecord.assignedBrokerId ||
        stockRecord?.createdBy ||
        ''
    )
  );

  if (stockBrokerId) {
    const brokerById = await tx.broker.findUnique({
      where: { id: stockBrokerId },
      select: { id: true },
    });

    if (brokerById?.id) {
      return brokerById.id;
    }
  }

  const brokerReference = normalizeText(
    String(
      detailsRecord.assignedBroker ||
        detailsRecord.assignedTo ||
        detailsRecord.broker ||
        ''
    )
  );

  if (brokerReference) {
    const broker = await tx.broker.findFirst({
      where: {
        OR: [
          { name: { equals: brokerReference, mode: 'insensitive' } },
          { email: { equals: brokerReference, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });

    if (broker?.id) {
      return broker.id;
    }
  }

  if (stockRecord?.propertyId) {
    const stockProperty = await tx.property.findUnique({
      where: { id: String(stockRecord.propertyId).trim() },
      select: { brokerId: true },
    });

    if (stockProperty?.brokerId) {
      return normalizeText(stockProperty.brokerId) || null;
    }
  }

  const leadBrokerReference = normalizeText(
    String(existingLead.brokerAssigned || existingLead.additionalBroker || '')
  ).toLowerCase();
  if (leadBrokerReference) {
    const brokerFromLeadReference = await tx.broker.findFirst({
      where: {
        OR: [
          { name: { equals: leadBrokerReference, mode: 'insensitive' } },
          { email: { equals: leadBrokerReference, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (brokerFromLeadReference?.id) {
      return brokerFromLeadReference.id;
    }
  }

  const currentUserBrokerId = normalizeText(user?.brokerId);
  if (currentUserBrokerId) {
    const brokerFromCurrentUser = await tx.broker.findUnique({
      where: { id: currentUserBrokerId },
      select: { id: true },
    });
    if (brokerFromCurrentUser?.id) {
      return brokerFromCurrentUser.id;
    }
  }

  const currentUserEmail = normalizeText(user?.email).toLowerCase();
  if (currentUserEmail) {
    const brokerFromCurrentUserEmail = await tx.broker.findFirst({
      where: { email: { equals: currentUserEmail, mode: 'insensitive' } },
      select: { id: true },
    });
    if (brokerFromCurrentUserEmail?.id) {
      return brokerFromCurrentUserEmail.id;
    }
  }

  return null;
}

async function assertWorkflowBrokerDepartment(
  tx: Prisma.TransactionClient,
  brokerId: string | null,
  moduleType: 'sales' | 'leasing' | 'auction'
): Promise<void> {
  if (!brokerId) {
    return;
  }

  const broker = await tx.broker.findUnique({
    where: { id: brokerId },
    select: { id: true, status: true, department: true, company: true },
  });

  if (!broker) {
    throw new Error('Assigned broker not found');
  }

  if (broker.status === 'archived') {
    throw new Error('Assigned broker is archived');
  }

  assertAssignedBrokerMatchesDepartment(
    broker.department || broker.company,
    moduleType,
    'workflow record'
  );
}

function getResolvedNotes(input: LeadWorkflowSyncInput, existingLead: NonNullable<LeadRecord>): string {
  return (
    normalizeText(input.comment) ||
    normalizeText(input.notes) ||
    normalizeText((existingLead as any).comment) ||
    normalizeText(existingLead.notes) ||
    ''
  );
}

function getResolvedDealValue(input: LeadWorkflowSyncInput, existingLead: NonNullable<LeadRecord>): number {
  const value =
    Number.isFinite(Number(input.dealValue)) && Number(input.dealValue) > 0
      ? Number(input.dealValue)
      : Number.isFinite(Number(input.forecastExpectedValue)) && Number(input.forecastExpectedValue) > 0
      ? Number(input.forecastExpectedValue)
      : Number(existingLead.value || 0);
  return roundMoney(value);
}

function getResolvedForecastValue(input: LeadWorkflowSyncInput, dealValue: number): number {
  return roundMoney(
    Number.isFinite(Number(input.forecastExpectedValue)) && Number(input.forecastExpectedValue) > 0
      ? Number(input.forecastExpectedValue)
      : dealValue
  );
}

function toModuleTypeFromDealType(value: 'sale' | 'lease' | 'auction'): 'sales' | 'leasing' | 'auction' {
  if (value === 'lease') return 'leasing';
  if (value === 'auction') return 'auction';
  return 'sales';
}

function buildWorkflowFinancialSnapshot(
  input: LeadWorkflowSyncInput,
  dealType: 'sale' | 'lease' | 'auction',
  assetValue: number,
  fallback?: {
    commissionPercent?: unknown;
    commissionRate?: unknown;
    grossCommission?: unknown;
    commissionAmount?: unknown;
    brokerSplitPercent?: unknown;
    auctionReferralPercent?: unknown;
    auctionCommissionPercent?: unknown;
    coBrokerSplits?: unknown;
  }
) {
  const moduleType = toModuleTypeFromDealType(dealType);
  const commissionPercent =
    asOptionalNumber((input as any).commissionPercent) ??
    toPercentFromRate(input.forecastCommissionRate) ??
    asOptionalNumber(fallback?.commissionPercent) ??
    toPercentFromRate(fallback?.commissionRate);
  const grossCommissionInput =
    asOptionalNumber((input as any).grossCommission) ??
    asOptionalNumber(input.forecastCommissionAmount) ??
    asOptionalNumber(fallback?.grossCommission) ??
    asOptionalNumber(fallback?.commissionAmount);
  const leasingGrossCommission =
    moduleType === 'leasing'
      ? grossCommissionInput !== undefined
        ? grossCommissionInput
        : roundMoney(assetValue * ((commissionPercent ?? 5) / 100))
      : grossCommissionInput;

  const coBrokers = resolveCoBrokerInput(
    (input as any).coBrokers,
    (input as any).coBrokerSplits,
    fallback?.coBrokerSplits
  );

  const calculated = calculateDealFinancials({
    dealType: moduleType,
    assetValue,
    commissionPercent,
    grossCommission: leasingGrossCommission,
    brokerSplitPercent:
      asOptionalNumber((input as any).brokerSplitPercent) ??
      asOptionalNumber(fallback?.brokerSplitPercent),
    auctionReferralPercent:
      asOptionalNumber((input as any).auctionReferralPercent) ??
      asOptionalNumber(fallback?.auctionReferralPercent),
    auctionCommissionPercent:
      asOptionalNumber((input as any).auctionCommissionPercent) ??
      asOptionalNumber(fallback?.auctionCommissionPercent),
    coBrokers,
  });

  return {
    ...calculated,
    dealType,
    moduleType,
  };
}

export interface LeadWorkflowResult {
  lead: Lead;
  deal: Deal | null;
  forecastDeal: ForecastDeal | null;
  propertyId: string | null;
  stockId: string | null;
}

export class LeadWorkflowService {
  async syncLeadWorkflow(
    leadId: string,
    data: LeadWorkflowSyncInput,
    user?: User
  ): Promise<LeadWorkflowResult> {
    if (normalizeText(data.leadId) && normalizeText(data.leadId) !== normalizeText(leadId)) {
      throw new Error('Lead ID mismatch');
    }

    const existingLead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        broker: { select: { id: true, name: true } },
      },
    });

    if (!existingLead) {
      throw new Error('Lead not found');
    }

    if (!canBrokerAccessRecord(user, existingLead.moduleType, existingLead.brokerId)) {
      throw new Error('Forbidden: cross-broker access denied');
    }

    const moduleType = normalizeModuleType(data.moduleType || existingLead.moduleType);
    assertBrokerCanAccessModule(user, moduleType);

    const dealType = normalizeDealType(data.dealType || moduleType);
    assertBrokerCanAccessDealType(user, dealType);

    const nextStatus = normalizeText(data.status || existingLead.status);
    const notes = getResolvedNotes(data, existingLead);
    const legalDocumentId = normalizeText(data.legalDocumentId) || existingLead.legalDocumentId || undefined;

    if (isLegalWorkflowStatus(nextStatus)) {
      if (!notes) {
        throw new Error('A comment is required before changing to this lead status');
      }
      if (legalDocumentId) {
        await assertLegalDocumentReady(legalDocumentId);
      }
    } else if (legalDocumentId) {
      await assertLegalDocumentReady(legalDocumentId);
    }

    const stockId = normalizeText(data.stockId) || normalizeText(existingLead.linkedStockId) || null;
    const resolvedDealValue = getResolvedDealValue(data, existingLead);
    const resolvedForecastValue = getResolvedForecastValue(data, resolvedDealValue);
    let financials = buildWorkflowFinancialSnapshot(data, dealType, resolvedForecastValue);
    const resolvedDealStatus = data.dealStatus
      ? resolveDealStatus(String(data.dealStatus), {
          allowLegacyMapping: true,
        })
      : deriveDealStatus(nextStatus);
    const resolvedForecastStatus =
      normalizeText(data.forecastStatus) || getDealStatusLabel(resolvedDealStatus);
    const dealTargetDate = data.dealTargetClosureDate ? new Date(data.dealTargetClosureDate) : undefined;
    const dealClosedDate =
      data.dealClosedDate !== undefined
        ? data.dealClosedDate
          ? new Date(data.dealClosedDate)
          : null
        : isClosedWorkflowStatus(nextStatus)
        ? new Date()
        : undefined;
    const forecastClosureDate = data.forecastClosureDate ? new Date(data.forecastClosureDate) : undefined;
    const forecastPaymentDate = data.forecastPaymentDate ? new Date(data.forecastPaymentDate) : undefined;
    const nextContactId =
      data.contactId !== undefined
        ? normalizeText(data.contactId) || undefined
        : existingLead.contactId || undefined;

    if (data.contactId !== undefined && existingLead.contactId && normalizeText(data.contactId) !== normalizeText(existingLead.contactId)) {
      throw new Error('Linked contact cannot be changed after creation');
    }

    const transactionResult = await prisma.$transaction(async tx => {
      let resolvedPropertyId = normalizeText(data.propertyId) || normalizeText(existingLead.propertyId) || null;
      let stockRecord: any = null;

      if (stockId) {
        stockRecord = await tx.stockItem.findUnique({
          where: { id: stockId },
        });
        if (!stockRecord) {
          throw new Error('Stock item not found');
        }

        if (resolvedPropertyId && stockRecord.propertyId !== resolvedPropertyId) {
          await tx.stockItem.update({
            where: { id: stockId },
            data: {
              propertyId: resolvedPropertyId,
            },
          });
        }
      }

      if (resolvedPropertyId) {
        const existingProperty = await tx.property.findUnique({
          where: { id: resolvedPropertyId },
          select: { id: true, brokerId: true },
        });

        if (!existingProperty) {
          resolvedPropertyId = null;
        }
      }

      if (!resolvedPropertyId && stockRecord?.propertyId) {
        const stockProperty = await tx.property.findUnique({
          where: { id: String(stockRecord.propertyId).trim() },
          select: { id: true, brokerId: true },
        });

        if (stockProperty) {
          resolvedPropertyId = stockProperty.id;
        }
      }

      let brokerId = await resolveBrokerIdFromWorkflowContext(
        tx,
        existingLead,
        getExplicitBrokerId(data, existingLead, user),
        user,
        moduleType,
        resolvedPropertyId,
        stockRecord
      );

      if (!resolvedPropertyId) {
        await assertWorkflowBrokerDepartment(tx, brokerId, moduleType);

        const propertyPayload = buildPropertyPayload({
          data,
          existingLead,
          stock: stockRecord,
          brokerId,
          moduleType,
        });

        let createdProperty: { id: string };
        try {
          createdProperty = await tx.property.create({
            data: {
              title: propertyPayload.title,
              description: propertyPayload.description,
              address: propertyPayload.address,
              city: propertyPayload.city,
              province: propertyPayload.province,
              postalCode: propertyPayload.postalCode,
              type: propertyPayload.type,
              price: propertyPayload.price,
              area: propertyPayload.area,
              status: propertyPayload.status,
              moduleType,
              brokerId: propertyPayload.brokerId,
              createdByBrokerId: getWorkflowCreatedByBrokerId(user),
              metadata: propertyPayload.metadata as Prisma.InputJsonValue,
            },
            select: { id: true },
          });
        } catch (error) {
          if (!isLegacyPropertySchemaError(error)) {
            throw error;
          }

          createdProperty = await tx.property.create({
            data: {
              title: propertyPayload.title,
              description: propertyPayload.description,
              address: propertyPayload.address,
              city: propertyPayload.city,
              province: propertyPayload.province,
              postalCode: propertyPayload.postalCode,
              type: propertyPayload.type,
              price: propertyPayload.price,
              area: propertyPayload.area,
              status: propertyPayload.status,
              brokerId: propertyPayload.brokerId,
              metadata: propertyPayload.metadata as Prisma.InputJsonValue,
            },
            select: { id: true },
          });
        }

        resolvedPropertyId = createdProperty.id;

        if (stockId) {
          await tx.stockItem.update({
            where: { id: stockId },
            data: {
              propertyId: resolvedPropertyId,
            },
          });
        }

        await auditLogService.recordWithClient(tx, {
          action: 'property_created_from_workflow',
          entityType: 'property',
          entityId: createdProperty.id,
          actorUserId: user?.id || null,
          actorName: user?.name || null,
          actorEmail: user?.email || null,
          actorRole: user?.role || null,
          metadata: {
            leadId,
            stockId,
            moduleType,
          },
        });

        if (!brokerId) {
          brokerId = await resolveBrokerIdFromWorkflowContext(
            tx,
            existingLead,
            null,
            user,
            moduleType,
            resolvedPropertyId,
            stockRecord
          );
        }
      }

      if (!resolvedPropertyId) {
        throw new Error('Property is required for workflow sync');
      }

      if (!brokerId) {
        throw new Error(
          'Unable to resolve broker for workflow sync. Assign a broker to the lead or stock before linking.'
        );
      }

      await assertWorkflowBrokerDepartment(tx, brokerId, moduleType);

      let dealId = normalizeText(data.dealId) || normalizeText(existingLead.dealId) || null;
      const existingDealRecord = dealId
        ? await tx.deal.findUnique({
            where: { id: dealId },
            include: { broker: { select: { id: true, name: true } } },
          })
        : null;
      financials = buildWorkflowFinancialSnapshot(
        data,
        dealType,
        resolvedForecastValue,
        existingDealRecord
          ? {
              commissionPercent: (existingDealRecord as any).commissionPercent,
              grossCommission: (existingDealRecord as any).grossCommission,
              brokerSplitPercent: (existingDealRecord as any).brokerSplitPercent,
              auctionReferralPercent: (existingDealRecord as any).auctionReferralPercent,
              auctionCommissionPercent: (existingDealRecord as any).auctionCommissionPercent,
              coBrokerSplits: (existingDealRecord as any).coBrokerSplits,
            }
          : undefined
      );
      const previousDealStatus = existingDealRecord?.status || null;
      const dealWasExisting = Boolean(existingDealRecord);
      const dealActivityAt = new Date();

      if (statusRequiresWorkflowDocument(resolvedDealStatus) && !legalDocumentId) {
        throw new Error(
          `Legal document is required for ${getDealStatusLabel(resolvedDealStatus)}`
        );
      }

      const dealData = {
        title: normalizeText(data.dealTitle) || `${existingLead.name} Deal`,
        description: normalizeText(data.dealDescription) || notes || '',
        status: resolvedDealStatus,
        type: dealType,
        value: financials.assetValue,
        assetValue: financials.assetValue,
        commissionPercent: financials.commissionPercent,
        grossCommission: financials.grossCommission,
        companyCommission: financials.companyCommission,
        brokerCommission: financials.brokerCommission,
        brokerSplitPercent: financials.brokerSplitPercent,
        auctionReferralPercent: financials.auctionReferralPercent,
        auctionCommissionPercent: financials.auctionCommissionPercent,
        coBrokerSplits: (financials.coBrokerSplits as any) ?? undefined,
        targetClosureDate: dealTargetDate,
        closedDate: dealClosedDate,
        leadId,
        propertyId: resolvedPropertyId,
        brokerId,
        createdByBrokerId: existingDealRecord?.createdByBrokerId || getWorkflowCreatedByBrokerId(user),
        legalDocumentId,
        lastActivityAt: dealActivityAt,
        inactivityNotifiedAt: null,
      };

      let dealRecord: DealRecord;
      if (existingDealRecord) {
        if (existingDealRecord.status !== resolvedDealStatus) {
          if (legalDocumentId && statusRequiresWorkflowDocument(resolvedDealStatus)) {
            await upsertDealStatusDocumentWithClient(tx, {
              dealId: existingDealRecord.id,
              status: resolvedDealStatus,
              legalDocumentId,
              linkedByUserId: user?.id || null,
              metadata: {
                source: 'lead_workflow_sync',
              },
            });
          }

          await assertDealTransitionWithClient(tx, {
            dealId: existingDealRecord.id,
            nextStatus: resolvedDealStatus,
          });
        } else if (legalDocumentId && statusRequiresWorkflowDocument(resolvedDealStatus)) {
          await upsertDealStatusDocumentWithClient(tx, {
            dealId: existingDealRecord.id,
            status: resolvedDealStatus,
            legalDocumentId,
            linkedByUserId: user?.id || null,
            metadata: {
              source: 'lead_workflow_sync',
            },
          });
        }

        dealRecord = await tx.deal.update({
          where: { id: existingDealRecord.id },
          data: {
            title: dealData.title,
            description: dealData.description,
            status: dealData.status,
            type: dealData.type,
            value: dealData.value,
            targetClosureDate: dealData.targetClosureDate,
            closedDate: dealData.closedDate,
            leadId: dealData.leadId,
            propertyId: dealData.propertyId,
            brokerId: dealData.brokerId,
            createdByBrokerId: dealData.createdByBrokerId,
            legalDocumentId: dealData.legalDocumentId,
            lastActivityAt: dealData.lastActivityAt,
            inactivityNotifiedAt: dealData.inactivityNotifiedAt,
          },
          include: {
            broker: { select: { id: true, name: true } },
          },
        });
      } else {
        if (resolvedDealStatus !== DealStatus.LOI) {
          throw new Error('Workflow can only create new deals at LOI');
        }

        dealRecord = await tx.deal.create({
          data: dealData,
          include: {
            broker: { select: { id: true, name: true } },
          },
        });
        dealId = dealRecord.id;
        await recordDealStatusHistoryWithClient(tx, {
          dealId: dealRecord.id,
          status: resolvedDealStatus,
          changedByUserId: user?.id || null,
          changedAt: dealActivityAt,
          metadata: {
            source: 'lead_workflow_sync',
          },
        });

        if (legalDocumentId && statusRequiresWorkflowDocument(resolvedDealStatus)) {
          await upsertDealStatusDocumentWithClient(tx, {
            dealId: dealRecord.id,
            status: resolvedDealStatus,
            legalDocumentId,
            linkedByUserId: user?.id || null,
            metadata: {
              source: 'lead_workflow_sync',
            },
          });
        }
      }

      let forecastDealId = normalizeText(data.forecastDealId) || normalizeText(existingLead.forecastDealId) || null;
      const forecastData = {
        dealId: dealId || undefined,
        brokerId,
        dealType,
        moduleType: financials.moduleType,
        status: resolvedForecastStatus,
        title: normalizeText(data.forecastTitle) || dealData.title,
        expectedValue: financials.assetValue,
        assetValue: financials.assetValue,
        commissionPercent: financials.commissionPercent,
        grossCommission: financials.grossCommission,
        commissionRate: financials.commissionRate,
        commissionAmount: financials.commissionAmount,
        companyCommission: financials.companyCommission,
        brokerCommission: financials.brokerCommission,
        brokerSplitPercent: financials.brokerSplitPercent,
        auctionReferralPercent: financials.auctionReferralPercent,
        auctionCommissionPercent: financials.auctionCommissionPercent,
        coBrokerSplits: (financials.coBrokerSplits as any) ?? undefined,
        forecastedClosureDate: forecastClosureDate,
        expectedPaymentDate: forecastPaymentDate,
        createdByUserId: user?.id || undefined,
      };

      let forecastRecord: ForecastRecord | null = null;
      if (forecastDealId) {
        forecastRecord = await tx.forecastDeal.findUnique({
          where: { id: forecastDealId },
          include: { broker: { select: { id: true, name: true } } },
        });
      }

      if (forecastRecord) {
        forecastRecord = await tx.forecastDeal.update({
          where: { id: forecastRecord.id },
          data: forecastData,
          include: {
            broker: { select: { id: true, name: true } },
          },
        });
      } else {
        forecastRecord = await tx.forecastDeal.create({
          data: forecastData,
          include: {
            broker: { select: { id: true, name: true } },
          },
        });
        forecastDealId = forecastRecord.id;
      }

      const leadRecord = await tx.lead.update({
        where: { id: leadId },
        data: {
          status: nextStatus,
          notes,
          value: financials.assetValue,
          moduleType: financials.moduleType,
          dealType: normalizeText(data.dealType) || existingLead.dealType || dealType,
          brokerId,
          createdByBrokerId: existingLead.createdByBrokerId || getWorkflowCreatedByBrokerId(user),
          propertyId: resolvedPropertyId,
          linkedStockId: stockId || undefined,
          dealId: dealRecord.id,
          forecastDealId: forecastRecord.id,
          legalDocumentId,
          contactId: nextContactId,
          additionalBroker: data.additionalBroker !== undefined ? data.additionalBroker : undefined,
          commissionSplit: data.commissionSplit !== undefined ? data.commissionSplit : undefined,
          propertyAddress: normalizeText(data.propertyAddress) || existingLead.propertyAddress || undefined,
        },
        include: {
          broker: { select: { id: true, name: true } },
        },
      });

      if (String(existingLead.status || '').trim() !== String(leadRecord.status || '').trim()) {
        await auditLogService.recordWithClient(tx, {
          action: 'lead_status_changed',
          entityType: 'lead',
          entityId: leadRecord.id,
          actorUserId: user?.id || null,
          actorName: user?.name || null,
          actorEmail: user?.email || null,
          actorRole: user?.role || null,
          metadata: {
            previousStatus: existingLead.status,
            status: leadRecord.status,
            moduleType: leadRecord.moduleType,
            brokerId: leadRecord.brokerId,
            dealId: leadRecord.dealId,
            forecastDealId: leadRecord.forecastDealId,
            legalDocumentId: leadRecord.legalDocumentId,
          },
        });
      }

      const dealStatusChanged =
        dealWasExisting &&
        previousDealStatus &&
        previousDealStatus !== dealRecord.status;
      if (dealStatusChanged) {
        await dealActivityService.recordStatusChangeWithClient(tx, {
          dealId: dealRecord.id,
          dealTitle: dealRecord.title,
          brokerId: dealRecord.brokerId,
          previousStatus: getDealStatusLabel(previousDealStatus),
          newStatus: getDealStatusLabel(dealRecord.status),
          actor: user || null,
          source: 'lead_workflow_sync',
          occurredAt: dealActivityAt,
        });

        await recordDealStatusHistoryWithClient(tx, {
          dealId: dealRecord.id,
          status: dealRecord.status,
          changedByUserId: user?.id || null,
          changedAt: dealActivityAt,
          metadata: {
            source: 'lead_workflow_sync',
            previousStatus: getDealStatusLabel(previousDealStatus),
          },
        });
      }

      await auditLogService.recordWithClient(tx, {
        action: dealWasExisting ? 'deal_updated' : 'deal_created',
        entityType: 'deal',
        entityId: dealRecord.id,
        actorUserId: user?.id || null,
        actorName: user?.name || null,
        actorEmail: user?.email || null,
        actorRole: user?.role || null,
        metadata: {
          leadId: leadRecord.id,
          propertyId: leadRecord.propertyId,
          brokerId: leadRecord.brokerId,
          type: dealRecord.type,
          status: getDealStatusLabel(dealRecord.status),
          value: dealRecord.value,
          legalDocumentId: dealRecord.legalDocumentId,
        },
      });

      await auditLogService.recordWithClient(tx, {
        action: 'lead_workflow_synced',
        entityType: 'lead',
        entityId: leadRecord.id,
        actorUserId: user?.id || null,
        actorName: user?.name || null,
        actorEmail: user?.email || null,
        actorRole: user?.role || null,
        metadata: {
          moduleType: financials.moduleType,
          status: nextStatus,
          brokerId,
          dealId: dealRecord.id,
          forecastDealId: forecastRecord.id,
          propertyId: resolvedPropertyId,
          stockId,
          legalDocumentId,
        },
      });

      return {
        lead: mapLead(leadRecord as any),
        deal: mapDeal(dealRecord as any),
        forecastDeal: mapForecastDeal(forecastRecord as any),
        propertyId: resolvedPropertyId,
        stockId,
      };
    });

    return transactionResult;
  }
}

export const leadWorkflowService = new LeadWorkflowService();
