import { CoBrokerSplit, DealType, ForecastDeal, PaginatedResponse, User } from '@/types';
import { CreateForecastDealInput, UpdateForecastDealInput } from '@/validators';
import { prisma } from '@/lib/prisma';
import { DealStatus } from '@prisma/client';
import { addDepartmentScope, assertBrokerCanAccessModule } from '@/lib/departmentAccess';
import { calculateDealFinancials, toPercentFromRate } from '@/lib/dealFinancials';
import { dealActivityService } from '@/services/dealActivityService';
import {
  getDealStatusLabel,
  resolveDealStatus,
  resolveDealStatusOrNull,
  statusRequiresWorkflowDocument,
} from '@/lib/dealWorkflow';
import {
  assertDealTransitionWithClient,
  recordDealStatusHistoryWithClient,
} from '@/lib/dealWorkflowPersistence';
import {
  assertLegalDocumentReferenceExists as assertLegalDocumentReferenceExistsWithClient,
  normalizeLegalDocumentReference,
  resolveLegalDocumentReferenceId,
} from '@/lib/legalDocumentReferences';

type ForecastDealWithBroker = Awaited<
  ReturnType<typeof prisma.forecastDeal.findFirst>
> & {
  broker?: { id: string; name: string } | null;
};

const COMMENT_REQUIRED_STATUSES = new Set(['loi', 'otp']);
const LOST_WIP_STATUSES = new Set(['lost', 'cancelled', 'canceled', 'rejected']);

const DEAL_SELECTION = {
  id: true,
  title: true,
  description: true,
  status: true,
  type: true,
  value: true,
  assetValue: true,
  commissionPercent: true,
  grossCommission: true,
  companyCommission: true,
  brokerCommission: true,
  brokerSplitPercent: true,
  auctionReferralPercent: true,
  auctionCommissionPercent: true,
  coBrokerSplits: true,
  targetClosureDate: true,
  closedDate: true,
  leadId: true,
  propertyId: true,
  brokerId: true,
  createdByBrokerId: true,
  legalDocumentId: true,
  lastActivityAt: true,
  inactivityNotifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type DealSnapshot = {
  id: string;
  title: string;
  description: string | null;
  status: DealStatus;
  type: string;
  value: number;
  assetValue: number;
  commissionPercent: number;
  grossCommission: number;
  companyCommission: number;
  brokerCommission: number;
  brokerSplitPercent: number;
  auctionReferralPercent: number;
  auctionCommissionPercent: number;
  coBrokerSplits: unknown;
  targetClosureDate: Date | null;
  closedDate: Date | null;
  leadId: string;
  propertyId: string;
  brokerId: string;
  createdByBrokerId: string | null;
  legalDocumentId: string | null;
  lastActivityAt: Date;
  inactivityNotifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ForecastSnapshot = Awaited<ReturnType<typeof prisma.forecastDeal.findFirst>>;

const DEFAULT_LEGACY_COMMISSION_PERCENT = 5;

function roundMoney(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function asOptionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeDealTypeForStorage(value: string | null | undefined): DealType {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'lease' || normalized === 'leasing') return 'lease';
  if (normalized === 'auction') return 'auction';
  return 'sale';
}

function mapModuleTypeToDealType(moduleType: string): DealType {
  const normalized = String(moduleType || '').trim().toLowerCase();
  if (normalized === 'leasing' || normalized === 'lease') return 'lease';
  if (normalized === 'auction') return 'auction';
  return 'sale';
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

function resolveLegacyLeasingGrossCommission(
  assetValue: number,
  commissionPercent: number | undefined,
  grossCommission: number | undefined
): number {
  if (grossCommission !== undefined && Number.isFinite(grossCommission) && grossCommission >= 0) {
    return roundMoney(grossCommission);
  }

  if (commissionPercent !== undefined && Number.isFinite(commissionPercent) && commissionPercent >= 0) {
    return roundMoney(assetValue * (commissionPercent / 100));
  }

  return roundMoney(assetValue * (DEFAULT_LEGACY_COMMISSION_PERCENT / 100));
}

function buildForecastFinancialSnapshot(input: {
  moduleType: string;
  dealType?: string | null;
  assetValue: number;
  commissionPercent?: number;
  commissionRate?: number;
  grossCommission?: number;
  commissionAmount?: number;
  brokerSplitPercent?: number;
  auctionReferralPercent?: number;
  auctionCommissionPercent?: number;
  coBrokers?: CoBrokerSplit[];
}) {
  const moduleType = mapDealTypeToModuleType(input.moduleType);
  const commissionPercent = input.commissionPercent ?? toPercentFromRate(input.commissionRate);
  const grossCommissionInput = input.grossCommission ?? input.commissionAmount;
  const leasingGrossCommission =
    moduleType === 'leasing'
      ? resolveLegacyLeasingGrossCommission(input.assetValue, commissionPercent, grossCommissionInput)
      : grossCommissionInput;

  const calculated = calculateDealFinancials({
    dealType: moduleType,
    assetValue: input.assetValue,
    commissionPercent,
    grossCommission: leasingGrossCommission,
    brokerSplitPercent: input.brokerSplitPercent,
    auctionReferralPercent: input.auctionReferralPercent,
    auctionCommissionPercent: input.auctionCommissionPercent,
    coBrokers: input.coBrokers,
  });
  const { dealType: _calculatedDealType, ...calculatedFinancials } = calculated;

  return {
    moduleType,
    dealType: normalizeDealTypeForStorage(input.dealType || mapModuleTypeToDealType(moduleType)),
    ...calculatedFinancials,
  };
}

export interface HandleWipStatusChangeInput {
  dealId: string;
  status: string;
  brokerId?: string;
  legalDocument?: string | null;
  comment?: string | null;
}

export interface HandleWipStatusChangeResult {
  dealId: string;
  brokerId: string;
  moduleType: ForecastDeal['moduleType'];
  status: string;
  previousStatus?: string;
  statusChangedAt?: string;
  legalDocument?: string;
  comment?: string;
  forecastDeal: ForecastDeal | null;
}

function normalizeWorkflowStatus(status: string): string {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function isLostWipStatus(status: string): boolean {
  return LOST_WIP_STATUSES.has(normalizeWorkflowStatus(status));
}

function toLostWipStatusLabel(status: string): string {
  const normalized = normalizeWorkflowStatus(status);
  if (normalized === 'cancelled' || normalized === 'canceled') return 'Cancelled';
  if (normalized === 'rejected') return 'Rejected';
  return 'Lost';
}

function requiresLegalDocument(status: string): boolean {
  const resolved = resolveDealStatusOrNull(status, { allowLegacyMapping: true });
  if (!resolved) return false;
  return statusRequiresWorkflowDocument(resolved);
}

function requiresComment(status: string): boolean {
  return COMMENT_REQUIRED_STATUSES.has(normalizeWorkflowStatus(status));
}

function normalizeLegalDocument(value: string | null | undefined): string | null | undefined {
  return normalizeLegalDocumentReference(value);
}

function normalizeComment(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function mapDealTypeToModuleType(type: string): ForecastDeal['moduleType'] {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'lease' || normalized === 'leasing') return 'leasing';
  if (normalized === 'auction') return 'auction';
  return 'sales';
}

function assertLegalDocumentRequirement(status: string, legalDocument: string | null | undefined): void {
  if (!requiresLegalDocument(status)) return;
  if (String(legalDocument || '').trim()) return;
  throw new Error('Legal document is required for this status');
}

function assertCommentRequirement(status: string, comment: string | null | undefined): void {
  if (!requiresComment(status)) return;
  if (String(comment || '').trim()) return;
  throw new Error('Comment is required for LOI / OTP');
}

async function getPrimaryForecastByDealId(
  tx: any,
  dealId: string
): Promise<ForecastSnapshot | null> {
  const linkedForecasts = await tx.forecastDeal.findMany({
    where: { dealId },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  if (!linkedForecasts.length) {
    return null;
  }

  const [primary, ...duplicates] = linkedForecasts;
  if (duplicates.length) {
    await tx.forecastDeal.deleteMany({
      where: {
        id: { in: duplicates.map((item: { id: string }) => item.id) },
      },
    });
  }

  return primary;
}

function statusLabelForComment(status: string): string {
  const resolved = resolveDealStatusOrNull(status, { allowLegacyMapping: true });
  if (!resolved) {
    return normalizeWorkflowStatus(status)
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return getDealStatusLabel(resolved);
}

function buildDealCommentValue(
  currentDescription: string | null | undefined,
  nextComment: string | null,
  status: string
): string | null {
  if (nextComment === null) return null;

  const existing = String(currentDescription || '').trim();
  const incoming = String(nextComment || '').trim();
  if (!incoming) return existing || null;

  if (!requiresComment(status)) {
    return incoming;
  }

  if (!existing) {
    return incoming;
  }

  if (existing === incoming) {
    return existing;
  }

  const marker = `${statusLabelForComment(status)}: ${incoming}`;
  if (
    existing
      .split('\n')
      .some(line => line.toLowerCase().includes(marker.toLowerCase()))
  ) {
    return existing;
  }

  const timestamp = new Date().toISOString();
  return `${existing}\n[${timestamp}] ${marker}`;
}

function mapForecastDeal(record: NonNullable<ForecastDealWithBroker>): ForecastDeal {
  const parsedSplits = parseCoBrokerSplits(record.coBrokerSplits);
  return {
    id: record.id,
    dealId: record.dealId ?? undefined,
    brokerId: record.brokerId,
    assignedBrokerId: record.brokerId,
    assignedBrokerName: record.broker?.name ?? undefined,
    dealType: normalizeDealTypeForStorage(record.dealType || mapModuleTypeToDealType(record.moduleType)),
    moduleType: record.moduleType as ForecastDeal['moduleType'],
    status: record.status,
    title: record.title,
    expectedValue: record.expectedValue,
    assetValue: record.assetValue ?? record.expectedValue,
    commissionPercent: record.commissionPercent ?? undefined,
    grossCommission: record.grossCommission ?? record.commissionAmount,
    commissionRate: record.commissionRate,
    commissionAmount: record.commissionAmount,
    companyCommission: record.companyCommission,
    brokerCommission: record.brokerCommission,
    brokerSplitPercent: record.brokerSplitPercent ?? undefined,
    auctionReferralPercent: record.auctionReferralPercent ?? undefined,
    auctionCommissionPercent: record.auctionCommissionPercent ?? undefined,
    coBrokerSplits: parsedSplits ?? undefined,
    legalDocument: record.legalDocument ?? undefined,
    forecastedClosureDate: record.forecastedClosureDate ?? undefined,
    expectedPaymentDate: record.expectedPaymentDate ?? undefined,
    createdByUserId: record.createdByUserId ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class ForecastDealService {
  async getAllForecastDeals(filters?: {
    status?: string;
    moduleType?: string;
    brokerId?: string;
    page?: number;
    limit?: number;
  }, options?: { user?: User }): Promise<PaginatedResponse<ForecastDeal>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 25;
    const where: any = {};

    if (filters?.status) where.status = filters.status;
    if (filters?.moduleType) where.moduleType = filters.moduleType;
    if (filters?.brokerId) where.brokerId = filters.brokerId;

    const scopedWhere = addDepartmentScope(where, options?.user, 'moduleType');

    const [total, forecastDeals] = await prisma.$transaction([
      prisma.forecastDeal.count({ where: scopedWhere }),
      prisma.forecastDeal.findMany({
        where: scopedWhere,
        include: {
          broker: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: forecastDeals.map(item => mapForecastDeal(item as any)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getForecastDealById(id: string): Promise<ForecastDeal> {
    const forecastDeal = await prisma.forecastDeal.findUnique({
      where: { id },
      include: {
        broker: { select: { id: true, name: true } },
      },
    });

    if (!forecastDeal) throw new Error('Forecast deal not found');
    return mapForecastDeal(forecastDeal as any);
  }

  async createForecastDeal(
    data: CreateForecastDealInput & { createdByUserId?: string },
    options?: { user?: User }
  ): Promise<ForecastDeal> {
    if (!data.brokerId) {
      throw new Error('Assigned broker is required');
    }
    const brokerId = data.brokerId;

    const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
    if (!broker) throw new Error('Assigned broker not found');
    if (broker.status === 'archived') throw new Error('Assigned broker is archived');

    let linkedDeal: {
      id: string;
      description: string | null;
      type: string;
      value: number;
      assetValue: number;
      commissionPercent: number;
      grossCommission: number;
      brokerSplitPercent: number;
      auctionReferralPercent: number;
      auctionCommissionPercent: number;
      coBrokerSplits: unknown;
    } | null = null;
    if (data.dealId) {
      const deal = await prisma.deal.findUnique({
        where: { id: data.dealId },
        select: {
          id: true,
          description: true,
          type: true,
          value: true,
          assetValue: true,
          commissionPercent: true,
          grossCommission: true,
          brokerSplitPercent: true,
          auctionReferralPercent: true,
          auctionCommissionPercent: true,
          coBrokerSplits: true,
        },
      });
      if (!deal) throw new Error('Linked deal not found');
      linkedDeal = deal;
    }

    const legalDocument = await assertLegalDocumentReferenceExistsWithClient(
      prisma,
      normalizeLegalDocument(data.legalDocument),
      'Please select a legal document from Legal Docs module'
    );
    assertLegalDocumentRequirement(data.status, legalDocument);
    const incomingComment = normalizeComment(data.comment);
    const effectiveComment = incomingComment === undefined ? linkedDeal?.description : incomingComment;
    if (requiresComment(data.status) && !linkedDeal?.id) {
      throw new Error('Linked deal is required for LOI / OTP comments');
    }
    assertCommentRequirement(data.status, effectiveComment);

    const resolvedModuleType = mapDealTypeToModuleType(data.moduleType || linkedDeal?.type || 'sales');
    assertBrokerCanAccessModule(options?.user, resolvedModuleType);
    const resolvedAssetValue = roundMoney(
      asOptionalNumber((data as any).assetValue) ??
        asOptionalNumber(data.expectedValue) ??
        asOptionalNumber(linkedDeal?.assetValue) ??
        asOptionalNumber(linkedDeal?.value) ??
        0
    );
    const resolvedCoBrokers = resolveCoBrokerInput(
      (data as any).coBrokers,
      (data as any).coBrokerSplits,
      linkedDeal?.coBrokerSplits
    );
    const financials = buildForecastFinancialSnapshot({
      moduleType: resolvedModuleType,
      dealType: (data as any).dealType || linkedDeal?.type || mapModuleTypeToDealType(resolvedModuleType),
      assetValue: resolvedAssetValue,
      commissionPercent:
        asOptionalNumber((data as any).commissionPercent) ??
        (Number(linkedDeal?.commissionPercent || 0) > 0
          ? Number(linkedDeal?.commissionPercent)
          : undefined),
      commissionRate: asOptionalNumber((data as any).commissionRate),
      grossCommission:
        asOptionalNumber((data as any).grossCommission) ??
        (Number(linkedDeal?.grossCommission || 0) > 0 ? Number(linkedDeal?.grossCommission) : undefined),
      commissionAmount: asOptionalNumber((data as any).commissionAmount),
      brokerSplitPercent:
        asOptionalNumber((data as any).brokerSplitPercent) ??
        (Number(linkedDeal?.brokerSplitPercent || 0) > 0
          ? Number(linkedDeal?.brokerSplitPercent)
          : undefined),
      auctionReferralPercent:
        asOptionalNumber((data as any).auctionReferralPercent) ??
        (Number(linkedDeal?.auctionReferralPercent || 0) > 0
          ? Number(linkedDeal?.auctionReferralPercent)
          : undefined),
      auctionCommissionPercent:
        asOptionalNumber((data as any).auctionCommissionPercent) ??
        (Number(linkedDeal?.auctionCommissionPercent || 0) > 0
          ? Number(linkedDeal?.auctionCommissionPercent)
          : undefined),
      coBrokers: resolvedCoBrokers,
    });

    const created = await prisma.$transaction(async tx => {
      if (linkedDeal && incomingComment !== undefined) {
        const nextDescription = buildDealCommentValue(linkedDeal.description, incomingComment, data.status);
        if (nextDescription !== linkedDeal.description) {
          await tx.deal.update({
            where: { id: linkedDeal.id },
            data: {
              description: nextDescription,
              lastActivityAt: new Date(),
              inactivityNotifiedAt: null,
            },
          });
          linkedDeal = {
            ...linkedDeal,
            description: nextDescription,
          };
        }
      }

      const forecastPayload = {
        dealId: data.dealId,
        brokerId,
        dealType: financials.dealType,
        moduleType: financials.moduleType,
        status: data.status,
        title: data.title,
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
        legalDocument: legalDocument === undefined ? undefined : legalDocument,
        forecastedClosureDate: data.forecastedClosureDate
          ? new Date(data.forecastedClosureDate)
          : undefined,
        expectedPaymentDate: data.expectedPaymentDate
          ? new Date(data.expectedPaymentDate)
          : undefined,
        createdByUserId: data.createdByUserId,
      };

      let forecastRecord: any = null;
      if (data.dealId) {
        const existingForecast = await getPrimaryForecastByDealId(tx, data.dealId);
        if (existingForecast) {
          forecastRecord = await tx.forecastDeal.update({
            where: { id: existingForecast.id },
            data: forecastPayload,
            include: {
              broker: { select: { id: true, name: true } },
            },
          });
        }
      }

      if (!forecastRecord) {
        forecastRecord = await tx.forecastDeal.create({
          data: forecastPayload,
          include: {
            broker: { select: { id: true, name: true } },
          },
        });
      }

      if (data.dealId) {
        await dealActivityService.touchDealWithClient(tx, data.dealId, new Date());
      }

      return forecastRecord;
    });

    return mapForecastDeal(created as any);
  }

  async updateForecastDeal(id: string, data: UpdateForecastDealInput, options?: { user?: User }): Promise<ForecastDeal> {
    const existing = await prisma.forecastDeal.findUnique({ where: { id } });
    if (!existing) throw new Error('Forecast deal not found');

    const requestedModuleType = mapDealTypeToModuleType(
      data.moduleType || (data as any).dealType || existing.moduleType
    );
    assertBrokerCanAccessModule(options?.user, requestedModuleType);

    if (data.brokerId) {
      const broker = await prisma.broker.findUnique({ where: { id: data.brokerId } });
      if (!broker) throw new Error('Assigned broker not found');
      if (broker.status === 'archived') throw new Error('Assigned broker is archived');
    }

    const nextStatus = data.status ?? existing.status;
    const nextDealId = data.dealId ?? existing.dealId;
    let linkedDeal: {
      id: string;
      description: string | null;
      type: string;
      value: number;
      assetValue: number;
      commissionPercent: number;
      grossCommission: number;
      brokerSplitPercent: number;
      auctionReferralPercent: number;
      auctionCommissionPercent: number;
      coBrokerSplits: unknown;
    } | null = null;
    if (nextDealId) {
      const deal = await prisma.deal.findUnique({
        where: { id: nextDealId },
        select: {
          id: true,
          description: true,
          type: true,
          value: true,
          assetValue: true,
          commissionPercent: true,
          grossCommission: true,
          brokerSplitPercent: true,
          auctionReferralPercent: true,
          auctionCommissionPercent: true,
          coBrokerSplits: true,
        },
      });
      if (!deal) throw new Error('Linked deal not found');
      linkedDeal = deal;
    }

    const nextLegalDocument =
      data.legalDocument === undefined
        ? existing.legalDocument
        : normalizeLegalDocument(data.legalDocument);
    const resolvedNextLegalDocument = await assertLegalDocumentReferenceExistsWithClient(
      prisma,
      nextLegalDocument,
      'Please select a legal document from Legal Docs module'
    );
    assertLegalDocumentRequirement(nextStatus, resolvedNextLegalDocument);
    const incomingComment = normalizeComment(data.comment);
    const effectiveComment = incomingComment === undefined ? linkedDeal?.description : incomingComment;
    if (requiresComment(nextStatus) && !linkedDeal?.id) {
      throw new Error('Linked deal is required for LOI / OTP comments');
    }
    assertCommentRequirement(nextStatus, effectiveComment);

    const resolvedModuleType = mapDealTypeToModuleType(
      data.moduleType || existing.moduleType || linkedDeal?.type || 'sales'
    );
    const resolvedAssetValue = roundMoney(
      asOptionalNumber((data as any).assetValue) ??
        asOptionalNumber(data.expectedValue) ??
        asOptionalNumber((existing as any).assetValue) ??
        asOptionalNumber(existing.expectedValue) ??
        asOptionalNumber(linkedDeal?.assetValue) ??
        asOptionalNumber(linkedDeal?.value) ??
        0
    );
    const resolvedCoBrokers = resolveCoBrokerInput(
      (data as any).coBrokers,
      (data as any).coBrokerSplits,
      (existing as any).coBrokerSplits || linkedDeal?.coBrokerSplits
    );
    const financials = buildForecastFinancialSnapshot({
      moduleType: resolvedModuleType,
      dealType:
        (data as any).dealType ||
        (existing as any).dealType ||
        linkedDeal?.type ||
        mapModuleTypeToDealType(resolvedModuleType),
      assetValue: resolvedAssetValue,
      commissionPercent:
        asOptionalNumber((data as any).commissionPercent) ??
        (Number((existing as any).commissionPercent || 0) > 0
          ? Number((existing as any).commissionPercent)
          : undefined),
      commissionRate:
        asOptionalNumber((data as any).commissionRate) ??
        asOptionalNumber(existing.commissionRate),
      grossCommission:
        asOptionalNumber((data as any).grossCommission) ??
        asOptionalNumber((data as any).commissionAmount) ??
        (Number((existing as any).grossCommission || 0) > 0
          ? Number((existing as any).grossCommission)
          : undefined) ??
        asOptionalNumber(existing.commissionAmount) ??
        (Number(linkedDeal?.grossCommission || 0) > 0 ? Number(linkedDeal?.grossCommission) : undefined),
      commissionAmount:
        asOptionalNumber((data as any).commissionAmount) ??
        asOptionalNumber(existing.commissionAmount),
      brokerSplitPercent:
        asOptionalNumber((data as any).brokerSplitPercent) ??
        (Number((existing as any).brokerSplitPercent || 0) > 0
          ? Number((existing as any).brokerSplitPercent)
          : undefined) ??
        (Number(linkedDeal?.brokerSplitPercent || 0) > 0
          ? Number(linkedDeal?.brokerSplitPercent)
          : undefined),
      auctionReferralPercent:
        asOptionalNumber((data as any).auctionReferralPercent) ??
        (Number((existing as any).auctionReferralPercent || 0) > 0
          ? Number((existing as any).auctionReferralPercent)
          : undefined) ??
        (Number(linkedDeal?.auctionReferralPercent || 0) > 0
          ? Number(linkedDeal?.auctionReferralPercent)
          : undefined),
      auctionCommissionPercent:
        asOptionalNumber((data as any).auctionCommissionPercent) ??
        (Number((existing as any).auctionCommissionPercent || 0) > 0
          ? Number((existing as any).auctionCommissionPercent)
          : undefined) ??
        (Number(linkedDeal?.auctionCommissionPercent || 0) > 0
          ? Number(linkedDeal?.auctionCommissionPercent)
          : undefined),
      coBrokers: resolvedCoBrokers,
    });

    const moduleOrDealTypeChanged =
      (data as any).dealType !== undefined || data.moduleType !== undefined;
    const assetValueChanged =
      moduleOrDealTypeChanged ||
      data.expectedValue !== undefined ||
      (data as any).assetValue !== undefined;
    const commissionInputsChanged =
      moduleOrDealTypeChanged ||
      (data as any).commissionPercent !== undefined ||
      data.commissionRate !== undefined ||
      (data as any).grossCommission !== undefined ||
      data.commissionAmount !== undefined ||
      data.companyCommission !== undefined ||
      data.brokerCommission !== undefined ||
      (data as any).brokerSplitPercent !== undefined ||
      (data as any).auctionReferralPercent !== undefined ||
      (data as any).auctionCommissionPercent !== undefined ||
      (data as any).coBrokers !== undefined ||
      (data as any).coBrokerSplits !== undefined;

    const updated = await prisma.$transaction(async tx => {
      if (linkedDeal && incomingComment !== undefined) {
        const nextDescription = buildDealCommentValue(linkedDeal.description, incomingComment, nextStatus);
        if (nextDescription !== linkedDeal.description) {
          await tx.deal.update({
            where: { id: linkedDeal.id },
            data: {
              description: nextDescription,
              lastActivityAt: new Date(),
              inactivityNotifiedAt: null,
            },
          });
          linkedDeal = {
            ...linkedDeal,
            description: nextDescription,
          };
        }
      }

      const forecastRecord = await tx.forecastDeal.update({
        where: { id },
        data: {
          dealId: data.dealId,
          brokerId: data.brokerId,
          dealType: moduleOrDealTypeChanged ? financials.dealType : undefined,
          moduleType: moduleOrDealTypeChanged ? financials.moduleType : undefined,
          status: data.status,
          title: data.title,
          expectedValue: assetValueChanged ? financials.assetValue : undefined,
          assetValue: assetValueChanged ? financials.assetValue : undefined,
          commissionPercent: commissionInputsChanged ? financials.commissionPercent : undefined,
          grossCommission: commissionInputsChanged ? financials.grossCommission : undefined,
          commissionRate: commissionInputsChanged ? financials.commissionRate : undefined,
          commissionAmount: commissionInputsChanged ? financials.commissionAmount : undefined,
          companyCommission: commissionInputsChanged ? financials.companyCommission : undefined,
          brokerCommission: commissionInputsChanged ? financials.brokerCommission : undefined,
          brokerSplitPercent:
            commissionInputsChanged ? financials.brokerSplitPercent : undefined,
          auctionReferralPercent:
            commissionInputsChanged ? financials.auctionReferralPercent : undefined,
          auctionCommissionPercent:
            commissionInputsChanged ? financials.auctionCommissionPercent : undefined,
          coBrokerSplits:
            commissionInputsChanged ? (financials.coBrokerSplits as any) ?? null : undefined,
          legalDocument:
            data.legalDocument === undefined
              ? undefined
              : resolvedNextLegalDocument,
          forecastedClosureDate: data.forecastedClosureDate
            ? new Date(data.forecastedClosureDate)
            : data.forecastedClosureDate === undefined
            ? undefined
            : null,
          expectedPaymentDate: data.expectedPaymentDate
            ? new Date(data.expectedPaymentDate)
            : data.expectedPaymentDate === undefined
            ? undefined
            : null,
        },
        include: {
          broker: { select: { id: true, name: true } },
        },
      });

      if (nextDealId) {
        await dealActivityService.touchDealWithClient(tx, nextDealId, new Date());
      }

      return forecastRecord;
    });

    return mapForecastDeal(updated as any);
  }

  async deleteForecastDeal(id: string, _options?: { user?: User }): Promise<void> {
    const existing = await prisma.forecastDeal.findUnique({ where: { id } });
    if (!existing) throw new Error('Forecast deal not found');
    await prisma.forecastDeal.delete({ where: { id } });
  }

  async handleWipStatusChange(
    input: HandleWipStatusChangeInput,
    options?: { user?: User }
  ): Promise<HandleWipStatusChangeResult> {
    const dealId = String(input.dealId || '').trim();
    if (!dealId) {
      throw new Error('Deal is required');
    }

    const requestedStatus = String(input.status || '').trim();
    const lostStatusSelected = isLostWipStatus(requestedStatus);
    const nextStatus = lostStatusSelected
      ? null
      : resolveDealStatus(requestedStatus, {
          allowLegacyMapping: true,
        });
    const nextStatusLabel = lostStatusSelected
      ? toLostWipStatusLabel(requestedStatus)
      : getDealStatusLabel(nextStatus as DealStatus);

    const existingDeal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: DEAL_SELECTION,
    });
    if (!existingDeal) {
      throw new Error('Linked deal not found');
    }

    const moduleType = mapDealTypeToModuleType(existingDeal.type);
    assertBrokerCanAccessModule(options?.user, moduleType);

    const requestedBrokerId = String(input.brokerId || '').trim() || existingDeal.brokerId;
    const broker = await prisma.broker.findUnique({
      where: { id: requestedBrokerId },
      select: { id: true, status: true },
    });
    if (!broker) throw new Error('Assigned broker not found');
    if (broker.status === 'archived') throw new Error('Assigned broker is archived');

    const incomingLegalDocument = normalizeLegalDocument(input.legalDocument);
    const incomingComment = normalizeComment(input.comment);

    const result = await prisma.$transaction(async tx => {
      let dealRecord = (await tx.deal.findUnique({
        where: { id: dealId },
        select: DEAL_SELECTION,
      })) as DealSnapshot | null;
      if (!dealRecord) throw new Error('Linked deal not found');
      const activityAt = new Date();
      const statusBeforeUpdate = dealRecord.status;
      let dealTouched = false;

      let forecastRecord = await getPrimaryForecastByDealId(tx, dealId);
      const forecastStatusBeforeUpdate = String(
        forecastRecord?.status || getDealStatusLabel(statusBeforeUpdate)
      ).trim();

      const storedLegalDocumentReference = normalizeLegalDocument(
        forecastRecord?.legalDocument ?? dealRecord.legalDocumentId
      );
      const effectiveLegalDocumentReference =
        incomingLegalDocument === undefined ? storedLegalDocumentReference : incomingLegalDocument;
      const effectiveLegalDocument =
        incomingLegalDocument === undefined
          ? await resolveLegalDocumentReferenceId(tx, effectiveLegalDocumentReference)
          : await assertLegalDocumentReferenceExistsWithClient(
              tx,
              effectiveLegalDocumentReference,
              'Please select a legal document from Legal Docs module'
            );
      let workflowLinkedLegalDocument = effectiveLegalDocument ?? null;
      const legalDocumentRequired =
        !lostStatusSelected && statusRequiresWorkflowDocument(nextStatus as DealStatus);
      if (!lostStatusSelected) {
        assertLegalDocumentRequirement(nextStatusLabel, effectiveLegalDocument);
      }
      if (legalDocumentRequired) {
        const linkedStatusDocument = await tx.dealStatusDocument.findUnique({
          where: {
            dealId_status: {
              dealId,
              status: nextStatus as DealStatus,
            },
          },
          select: {
            legalDocumentId: true,
            completedAt: true,
            filledDocumentRecordId: true,
          },
        });

        if (!linkedStatusDocument) {
          throw new Error(
            `Complete ${nextStatusLabel} from Legal Docs before changing this deal status`
          );
        }
        workflowLinkedLegalDocument = linkedStatusDocument.legalDocumentId;

        if (!linkedStatusDocument.completedAt && !linkedStatusDocument.filledDocumentRecordId) {
          throw new Error('Selected legal document must be filled and downloaded before linking');
        }
      }

      const effectiveComment =
        incomingComment === undefined ? normalizeComment(dealRecord.description) : incomingComment;
      assertCommentRequirement(nextStatusLabel, effectiveComment);

      if (incomingComment !== undefined) {
        const nextDescription = buildDealCommentValue(
          dealRecord.description,
          incomingComment,
          nextStatusLabel
        );
        if (nextDescription !== dealRecord.description) {
          dealRecord = (await tx.deal.update({
            where: { id: dealId },
            data: {
              description: nextDescription,
              lastActivityAt: activityAt,
              inactivityNotifiedAt: null,
            },
            select: DEAL_SELECTION,
          })) as DealSnapshot;
          dealTouched = true;
        }
      }

      const nextBrokerId = requestedBrokerId || dealRecord.brokerId;

      if (
        !lostStatusSelected &&
        (dealRecord.status !== (nextStatus as DealStatus) || dealRecord.brokerId !== nextBrokerId)
      ) {
        await assertDealTransitionWithClient(tx, {
          dealId,
          nextStatus: nextStatus as DealStatus,
        });

        dealRecord = (await tx.deal.update({
          where: { id: dealId },
          data: {
            status: nextStatus as DealStatus,
            brokerId: nextBrokerId,
            lastActivityAt: activityAt,
            inactivityNotifiedAt: null,
          },
          select: DEAL_SELECTION,
        })) as DealSnapshot;
        dealTouched = true;
      }

      if (!dealTouched) {
        dealRecord = (await tx.deal.update({
          where: { id: dealId },
          data: {
            lastActivityAt: activityAt,
            inactivityNotifiedAt: null,
          },
          select: DEAL_SELECTION,
        })) as DealSnapshot;
      }

      const statusAfterUpdate = dealRecord.status;
      const statusChanged = statusBeforeUpdate !== statusAfterUpdate;
      if (statusChanged) {
        await dealActivityService.recordStatusChangeWithClient(tx, {
          dealId: dealRecord.id,
          dealTitle: dealRecord.title,
          brokerId: dealRecord.brokerId,
          previousStatus: getDealStatusLabel(statusBeforeUpdate),
          newStatus: getDealStatusLabel(statusAfterUpdate),
          actor: options?.user || null,
          source: 'forecast_wip_status_change',
          occurredAt: activityAt,
        });

        await recordDealStatusHistoryWithClient(tx, {
          dealId: dealRecord.id,
          status: statusAfterUpdate,
          changedByUserId: options?.user?.id || null,
          changedAt: activityAt,
          metadata: {
            source: 'forecast_wip_status_change',
            previousStatus: getDealStatusLabel(statusBeforeUpdate),
          },
        });
      }

      const resolvedCoBrokers = resolveCoBrokerInput(
        (forecastRecord as any)?.coBrokerSplits,
        undefined,
        dealRecord.coBrokerSplits
      );
      const financials = buildForecastFinancialSnapshot({
        moduleType: mapDealTypeToModuleType(dealRecord.type),
        dealType: dealRecord.type,
        assetValue: roundMoney(
          asOptionalNumber((forecastRecord as any)?.assetValue) ??
            asOptionalNumber(forecastRecord?.expectedValue) ??
            asOptionalNumber(dealRecord.assetValue) ??
            asOptionalNumber(dealRecord.value) ??
            0
        ),
        commissionPercent:
          asOptionalNumber((forecastRecord as any)?.commissionPercent) ??
          (Number(dealRecord.commissionPercent || 0) > 0
            ? Number(dealRecord.commissionPercent)
            : undefined),
        commissionRate: asOptionalNumber(forecastRecord?.commissionRate),
        grossCommission:
          asOptionalNumber((forecastRecord as any)?.grossCommission) ??
          asOptionalNumber(forecastRecord?.commissionAmount) ??
          (Number(dealRecord.grossCommission || 0) > 0
            ? Number(dealRecord.grossCommission)
            : undefined),
        commissionAmount: asOptionalNumber(forecastRecord?.commissionAmount),
        brokerSplitPercent:
          asOptionalNumber((forecastRecord as any)?.brokerSplitPercent) ??
          (Number(dealRecord.brokerSplitPercent || 0) > 0
            ? Number(dealRecord.brokerSplitPercent)
            : undefined),
        auctionReferralPercent:
          asOptionalNumber((forecastRecord as any)?.auctionReferralPercent) ??
          (Number(dealRecord.auctionReferralPercent || 0) > 0
            ? Number(dealRecord.auctionReferralPercent)
            : undefined),
        auctionCommissionPercent:
          asOptionalNumber((forecastRecord as any)?.auctionCommissionPercent) ??
          (Number(dealRecord.auctionCommissionPercent || 0) > 0
            ? Number(dealRecord.auctionCommissionPercent)
            : undefined),
        coBrokers: resolvedCoBrokers,
      });

      const forecastPayload = {
        dealId: dealRecord.id,
        brokerId: nextBrokerId,
        dealType: financials.dealType,
        moduleType: financials.moduleType,
        status: nextStatusLabel,
        title: dealRecord.title,
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
        legalDocument:
          legalDocumentRequired
            ? workflowLinkedLegalDocument
            : incomingLegalDocument === undefined
            ? effectiveLegalDocument ?? null
            : effectiveLegalDocument,
        forecastedClosureDate: forecastRecord?.forecastedClosureDate ?? null,
        expectedPaymentDate: forecastRecord?.expectedPaymentDate ?? null,
        createdByUserId: forecastRecord?.createdByUserId ?? options?.user?.id ?? null,
      };

      if (forecastRecord) {
        forecastRecord = await tx.forecastDeal.update({
          where: { id: forecastRecord.id },
          data: forecastPayload,
        });
      } else {
        forecastRecord = await tx.forecastDeal.create({
          data: forecastPayload,
        });
      }

      return {
        dealId: dealRecord.id,
        brokerId: dealRecord.brokerId,
        moduleType: mapDealTypeToModuleType(dealRecord.type),
        status: lostStatusSelected ? nextStatusLabel : getDealStatusLabel(statusAfterUpdate),
        previousStatus: lostStatusSelected
          ? normalizeWorkflowStatus(forecastStatusBeforeUpdate) !== normalizeWorkflowStatus(nextStatusLabel)
            ? forecastStatusBeforeUpdate
            : undefined
          : statusChanged
          ? getDealStatusLabel(statusBeforeUpdate)
          : undefined,
        statusChangedAt: lostStatusSelected
          ? normalizeWorkflowStatus(forecastStatusBeforeUpdate) !== normalizeWorkflowStatus(nextStatusLabel)
            ? activityAt.toISOString()
            : undefined
          : statusChanged
          ? activityAt.toISOString()
          : undefined,
        legalDocument: forecastRecord.legalDocument || undefined,
        comment: dealRecord.description || undefined,
        forecastDeal: mapForecastDeal({
          ...forecastRecord,
          broker: null,
        } as any),
      };
    });

    return result;
  }
}

export const forecastDealService = new ForecastDealService();
