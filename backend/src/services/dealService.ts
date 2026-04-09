import { CoBrokerSplit, Deal, PaginatedResponse, User } from '@/types';
import { CreateDealInput, UpdateDealInput } from '@/validators';
import { prisma } from '@/lib/prisma';
import { DealStatus } from '@prisma/client';
import {
  addDepartmentScope,
  assertAssignedBrokerMatchesDepartment,
  assertBrokerCanAccessDealType,
  getEffectiveBrokerId,
  normalizeBrokerDepartment,
  normalizeDealType,
  normalizeModuleScope,
} from '@/lib/departmentAccess';
import { auditLogService } from '@/services/auditLogService';
import { calculateDealFinancials } from '@/lib/dealFinancials';
import { dealActivityService } from '@/services/dealActivityService';
import { assertLegalDocumentReferenceExists } from '@/lib/legalDocumentReferences';
import {
  getDealStatusLabel,
  resolveDealStatus,
  statusRequiresWorkflowDocument,
  summarizeWorkflowCompletion,
} from '@/lib/dealWorkflow';
import {
  assertDealTransitionWithClient,
  recordDealStatusHistoryWithClient,
  upsertDealStatusDocumentWithClient,
} from '@/lib/dealWorkflowPersistence';

type DealWithBroker = Awaited<ReturnType<typeof prisma.deal.findFirst>> & {
  broker?: { id: string; name: string } | null;
  lead?: { id: string; name: string } | null;
  legalDocument?: {
    id: string;
    documentName: string;
    status: string;
    fileName: string;
    filePath: string | null;
    fileType: string | null;
  } | null;
  statusDocuments?: Array<{
    id: string;
    status: DealStatus;
    documentType: string;
    legalDocumentId: string;
    version: number;
    uploadedAt: Date;
    completedAt: Date | null;
    updatedAt: Date;
    filledDocumentRecordId: string | null;
    filledDocumentDownloadUrl: string | null;
    filledDocumentName: string | null;
    legalDocument: {
      id: string;
      documentName: string;
      documentType: string;
      status: string;
      fileName: string;
      filePath: string | null;
      fileType: string | null;
      lastModifiedDate: string;
    };
  }>;
  statusHistory?: Array<{
    id: string;
    status: DealStatus;
    changedAt: Date;
    changedByUserId: string | null;
    changedByUser?: { id: string; name: string } | null;
  }>;
};

const DEFAULT_LEGACY_COMMISSION_PERCENT = 5;
const WIP_EXCLUDED_STATUSES: DealStatus[] = [
  DealStatus.CLOSED,
  DealStatus.WON,
  DealStatus.AWAITING_PAYMENT,
];

function roundMoney(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function asOptionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
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

function mapDeal(record: NonNullable<DealWithBroker>): Deal {
  const parsedSplits = parseCoBrokerSplits(record.coBrokerSplits);
  const hasLegalDocument =
    Boolean(String(record.legalDocumentId || '').trim()) && Boolean(record.legalDocument);
  const workflowCompletion = summarizeWorkflowCompletion(
    (record.statusDocuments || []).map(item => item.status)
  );
  return {
    id: record.id,
    title: record.title,
    description: record.description ?? undefined,
    status: getDealStatusLabel(record.status as DealStatus),
    type: record.type as Deal['type'],
    value: record.value,
    assetValue: record.assetValue ?? record.value,
    commissionPercent: record.commissionPercent ?? undefined,
    grossCommission: record.grossCommission ?? undefined,
    companyCommission: record.companyCommission ?? undefined,
    brokerCommission: record.brokerCommission ?? undefined,
    brokerSplitPercent: record.brokerSplitPercent ?? undefined,
    auctionReferralPercent: record.auctionReferralPercent ?? undefined,
    auctionCommissionPercent: record.auctionCommissionPercent ?? undefined,
    coBrokerSplits: parsedSplits ?? undefined,
    targetClosureDate: record.targetClosureDate ?? undefined,
    closedDate: record.closedDate ?? undefined,
    leadId: record.leadId,
    propertyId: record.propertyId,
    brokerId: record.brokerId,
    createdByBrokerId: record.createdByBrokerId ?? undefined,
    legalDocumentId: record.legalDocument?.id ?? undefined,
    documentLinked: hasLegalDocument,
    clientName: record.lead?.name || undefined,
    legalDocument: record.legalDocument
      ? {
          id: record.legalDocument.id,
          documentName: record.legalDocument.documentName,
          status: record.legalDocument.status || undefined,
          fileName: record.legalDocument.fileName || undefined,
          filePath: record.legalDocument.filePath || undefined,
          fileType: record.legalDocument.fileType || undefined,
        }
      : undefined,
    assignedBrokerId: record.brokerId,
    assignedBrokerName: record.broker?.name ?? undefined,
    statusDocuments: (record.statusDocuments || []).map(item => ({
      id: item.id,
      status: getDealStatusLabel(item.status),
      documentType: String(item.documentType || ''),
      legalDocumentId: item.legalDocumentId,
      legalDocumentName: item.legalDocument.documentName,
      legalDocumentType: item.legalDocument.documentType,
      legalDocumentStatus: item.legalDocument.status || undefined,
      fileName: item.legalDocument.fileName || undefined,
      filePath: item.legalDocument.filePath || undefined,
      fileType: item.legalDocument.fileType || undefined,
      version: item.version,
      uploadedAt: item.uploadedAt,
      completedAt: item.completedAt ?? undefined,
      lastModifiedAt: item.updatedAt,
      filledDocumentRecordId: item.filledDocumentRecordId || undefined,
      filledDocumentDownloadUrl: item.filledDocumentDownloadUrl || undefined,
      filledDocumentName: item.filledDocumentName || undefined,
    })),
    statusHistory: (record.statusHistory || []).map(item => ({
      id: item.id,
      status: getDealStatusLabel(item.status),
      changedAt: item.changedAt,
      changedByUserId: item.changedByUserId || undefined,
      changedByName: item.changedByUser?.name || undefined,
    })),
    workflowProgress: {
      hasLoiDocument: workflowCompletion.hasLoiDocument,
      hasStep2Document: workflowCompletion.hasStep2Document,
      hasAgreementDocument: workflowCompletion.hasAgreementDocument,
      step2Status: workflowCompletion.step2Status
        ? getDealStatusLabel(workflowCompletion.step2Status)
        : undefined,
      agreementStatus: workflowCompletion.agreementStatus
        ? getDealStatusLabel(workflowCompletion.agreementStatus)
        : undefined,
    },
    lastActivityAt: (record as any).lastActivityAt ?? undefined,
    inactivityNotifiedAt: (record as any).inactivityNotifiedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildAuditSnapshot(record: Deal): Record<string, unknown> {
  return {
    title: record.title,
    description: record.description ?? null,
    status: record.status,
    type: record.type,
    value: record.value,
    assetValue: record.assetValue ?? null,
    commissionPercent: record.commissionPercent ?? null,
    grossCommission: record.grossCommission ?? null,
    companyCommission: record.companyCommission ?? null,
    brokerCommission: record.brokerCommission ?? null,
    brokerSplitPercent: record.brokerSplitPercent ?? null,
    auctionReferralPercent: record.auctionReferralPercent ?? null,
    auctionCommissionPercent: record.auctionCommissionPercent ?? null,
    coBrokerSplits: record.coBrokerSplits ?? null,
    brokerId: record.brokerId,
    createdByBrokerId: record.createdByBrokerId ?? null,
    leadId: record.leadId,
    propertyId: record.propertyId,
    legalDocumentId: record.legalDocumentId ?? null,
  };
}

async function removeDealDocumentLink(tx: any, legalDocumentId: string, dealId: string) {
  const document = await tx.legalDocument.findUnique({
    where: { id: legalDocumentId },
    select: { id: true, linkedDeals: true },
  });

  if (!document) return;

  const linkedDeals = Array.isArray(document.linkedDeals) ? document.linkedDeals : [];
  const filtered = linkedDeals.filter((item: any) => String(item?.dealId || '') !== dealId);

  if (filtered.length === linkedDeals.length) return;

  await tx.legalDocument.update({
    where: { id: legalDocumentId },
    data: {
      linkedDeals: filtered,
    },
  });
}

function mapDealTypeToModuleType(type: string): 'sales' | 'leasing' | 'auction' {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'lease' || normalized === 'leasing') return 'leasing';
  if (normalized === 'auction') return 'auction';
  return 'sales';
}

async function syncForecastDealsFromDeal(
  tx: any,
  deal: {
    id: string;
    title: string;
    type: string;
    brokerId: string;
    value: number;
    assetValue: number;
    commissionPercent: number;
    grossCommission: number;
    companyCommission: number;
    brokerCommission: number;
    brokerSplitPercent: number;
    auctionReferralPercent: number;
    auctionCommissionPercent: number;
    coBrokerSplits?: unknown;
  }
): Promise<void> {
  await tx.forecastDeal.updateMany({
    where: { dealId: deal.id },
    data: {
      dealType: normalizeDealType(deal.type),
      moduleType: mapDealTypeToModuleType(deal.type),
      title: deal.title,
      brokerId: deal.brokerId,
      expectedValue: deal.assetValue || deal.value,
      assetValue: deal.assetValue || deal.value,
      commissionPercent: deal.commissionPercent,
      grossCommission: deal.grossCommission,
      commissionRate: roundMoney((deal.commissionPercent || 0) / 100),
      commissionAmount: deal.grossCommission,
      companyCommission: deal.companyCommission,
      brokerCommission: deal.brokerCommission,
      brokerSplitPercent: deal.brokerSplitPercent,
      auctionReferralPercent: deal.auctionReferralPercent,
      auctionCommissionPercent: deal.auctionCommissionPercent,
      coBrokerSplits: (parseCoBrokerSplits(deal.coBrokerSplits) as any) ?? undefined,
    },
  });
}

async function assertAssignedBroker(
  brokerId: string,
  dealType: string
): Promise<void> {
  const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
  if (!broker) throw new Error('Assigned broker not found');
  if (broker.status === 'archived') throw new Error('Assigned broker is archived');
  assertAssignedBrokerMatchesDepartment(broker.department || broker.company, dealType, 'deal');
}

async function assertLeadAndPropertyCompatibility(
  leadId: string,
  propertyId: string,
  dealType: string
) {
  const [lead, property] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, moduleType: true },
    }),
    prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, moduleType: true },
    }),
  ]);

  if (!lead) throw new Error('Lead not found');
  if (!property) throw new Error('Property not found');

  const normalizedDealType = normalizeDealType(dealType);
  const dealModule =
    normalizedDealType === 'lease' ? 'leasing' : normalizedDealType === 'auction' ? 'auction' : 'sales';
  const leadModule = normalizeModuleScope(lead.moduleType);
  const propertyModule = normalizeModuleScope(property.moduleType);

  if (
    dealModule !== 'auction' &&
    ((leadModule && leadModule !== 'auction' && leadModule !== dealModule) ||
      (propertyModule && propertyModule !== 'auction' && propertyModule !== dealModule))
  ) {
    throw new Error('Deal department must match the linked lead and property');
  }
}

function resolveCoBrokerInput(
  first?: unknown,
  second?: unknown,
  fallback?: unknown
): CoBrokerSplit[] | undefined {
  return parseCoBrokerSplits(first) || parseCoBrokerSplits(second) || parseCoBrokerSplits(fallback);
}

function buildDealFinancialSnapshot(input: {
  dealType: string;
  assetValue: number;
  commissionPercent?: number;
  grossCommission?: number;
  auctionReferralPercent?: number;
  auctionCommissionPercent?: number;
  brokerSplitPercent?: number;
  coBrokers?: CoBrokerSplit[];
}) {
  const normalizedDealType = normalizeDealType(input.dealType);
  const dealTypeLabel =
    normalizedDealType === 'lease'
      ? 'leasing'
      : normalizedDealType === 'auction'
      ? 'auction'
      : 'sales';

  const commissionPercent = input.commissionPercent;

  const grossCommission =
    dealTypeLabel === 'leasing'
      ? resolveLegacyLeasingGrossCommission(
          input.assetValue,
          commissionPercent,
          input.grossCommission
        )
      : input.grossCommission;

  return calculateDealFinancials({
    dealType: dealTypeLabel,
    assetValue: input.assetValue,
    commissionPercent,
    grossCommission,
    auctionReferralPercent: input.auctionReferralPercent,
    auctionCommissionPercent: input.auctionCommissionPercent,
    brokerSplitPercent: input.brokerSplitPercent,
    coBrokers: input.coBrokers,
  });
}

export class DealService {
  async getAllDeals(
    filters?: {
      status?: string;
      type?: string;
      brokerId?: string;
      propertyId?: string;
      wip?: boolean;
      page?: number;
      limit?: number;
    },
    options?: { user?: User | null }
  ): Promise<PaginatedResponse<Deal>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const where: any = {};

    if (filters?.status) {
      where.status = resolveDealStatus(filters.status, { allowLegacyMapping: true });
    }
    if (filters?.type) where.type = filters.type;
    if (filters?.brokerId) where.brokerId = filters.brokerId;
    if (filters?.propertyId) where.propertyId = filters.propertyId;
    if (filters?.wip) {
      where.status = {
        notIn: WIP_EXCLUDED_STATUSES,
      };
    }

    const scopedWhere = addDepartmentScope(where, options?.user, 'type');

    const [total, deals] = await prisma.$transaction([
      prisma.deal.count({ where: scopedWhere }),
      prisma.deal.findMany({
        where: scopedWhere,
        include: {
          broker: {
            select: { id: true, name: true },
          },
          lead: {
            select: { id: true, name: true },
          },
          legalDocument: {
            select: {
              id: true,
              documentName: true,
              status: true,
              fileName: true,
              filePath: true,
              fileType: true,
            },
          },
          statusDocuments: {
            include: {
              legalDocument: {
                select: {
                  id: true,
                  documentName: true,
                  documentType: true,
                  status: true,
                  fileName: true,
                  filePath: true,
                  fileType: true,
                  lastModifiedDate: true,
                },
              },
            },
            orderBy: [{ status: 'asc' }],
          },
          statusHistory: {
            include: {
              changedByUser: {
                select: { id: true, name: true },
              },
            },
            orderBy: [{ changedAt: 'asc' }],
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: deals.map(deal => mapDeal(deal as NonNullable<DealWithBroker>)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getDealById(id: string): Promise<Deal> {
    const deal = await prisma.deal.findUnique({
      where: { id },
      include: {
        broker: {
          select: { id: true, name: true },
        },
        lead: {
          select: { id: true, name: true },
        },
        legalDocument: {
          select: {
            id: true,
            documentName: true,
            status: true,
            fileName: true,
            filePath: true,
            fileType: true,
          },
        },
        statusDocuments: {
          include: {
            legalDocument: {
              select: {
                id: true,
                documentName: true,
                documentType: true,
                status: true,
                fileName: true,
                filePath: true,
                fileType: true,
                lastModifiedDate: true,
              },
            },
          },
          orderBy: [{ status: 'asc' }],
        },
        statusHistory: {
          include: {
            changedByUser: {
              select: { id: true, name: true },
            },
          },
          orderBy: [{ changedAt: 'asc' }],
        },
      },
    });
    if (!deal) throw new Error('Deal not found');
    return mapDeal(deal as NonNullable<DealWithBroker>);
  }

  async getDealActivities(id: string) {
    const deal = await prisma.deal.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!deal) throw new Error('Deal not found');
    return dealActivityService.getDealActivities(id);
  }

  async createDeal(data: CreateDealInput, options?: { user?: User | null }): Promise<Deal> {
    const effectiveBrokerId = getEffectiveBrokerId(options?.user);
    const brokerId = effectiveBrokerId || data.brokerId;
    if (!brokerId) {
      throw new Error('Assigned broker is required');
    }

    const initialStatus = resolveDealStatus(data.status, {
      fallback: DealStatus.LOI,
      allowLegacyMapping: true,
    });
    if (initialStatus !== DealStatus.LOI) {
      throw new Error('New deals must start at LOI');
    }

    assertBrokerCanAccessDealType(options?.user, data.type);
    await assertAssignedBroker(brokerId, data.type);
    await assertLeadAndPropertyCompatibility(data.leadId, data.propertyId, data.type);

    const legalDocumentId = await assertLegalDocumentReferenceExists(
      prisma,
      data.legalDocumentId,
      'Selected legal document was not found'
    );

    const resolvedAssetValue = roundMoney(
      asOptionalNumber((data as any).assetValue) ?? asOptionalNumber(data.value) ?? 0
    );
    const resolvedCoBrokers = resolveCoBrokerInput(
      (data as any).coBrokers,
      (data as any).coBrokerSplits
    );
    const financials = buildDealFinancialSnapshot({
      dealType: data.type,
      assetValue: resolvedAssetValue,
      commissionPercent: asOptionalNumber((data as any).commissionPercent),
      grossCommission: asOptionalNumber((data as any).grossCommission),
      auctionReferralPercent: asOptionalNumber((data as any).auctionReferralPercent),
      auctionCommissionPercent: asOptionalNumber((data as any).auctionCommissionPercent),
      brokerSplitPercent: asOptionalNumber((data as any).brokerSplitPercent),
      coBrokers: resolvedCoBrokers,
    });

    const created = await prisma.$transaction(async tx => {
      const deal = await tx.deal.create({
        data: {
          title: data.title,
          description: data.description,
          status: initialStatus,
          type: data.type,
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
          targetClosureDate: data.targetClosureDate ? new Date(data.targetClosureDate) : undefined,
          leadId: data.leadId,
          propertyId: data.propertyId,
          brokerId,
          createdByBrokerId: effectiveBrokerId || null,
          legalDocumentId,
          lastActivityAt: new Date(),
          inactivityNotifiedAt: null,
        },
        include: {
          broker: {
            select: { id: true, name: true },
          },
        },
      });

      await recordDealStatusHistoryWithClient(tx, {
        dealId: deal.id,
        status: initialStatus,
        changedByUserId: options?.user?.id || null,
        changedAt: new Date(),
        metadata: {
          source: 'deal_create',
        },
      });

      if (legalDocumentId && statusRequiresWorkflowDocument(initialStatus)) {
        await upsertDealStatusDocumentWithClient(tx, {
          dealId: deal.id,
          status: initialStatus,
          legalDocumentId,
          linkedByUserId: options?.user?.id || null,
          metadata: {
            source: 'deal_create',
          },
        });
      }

      const mapped = mapDeal(deal as NonNullable<DealWithBroker>);
      await auditLogService.recordWithClient(tx, {
        action: 'deal_created',
        entityType: 'deal',
        entityId: deal.id,
        description: `Deal "${deal.title}" created`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId,
        visibilityScope: 'shared',
        nextValues: buildAuditSnapshot(mapped),
        metadata: {
          leadId: deal.leadId,
          propertyId: deal.propertyId,
          brokerId: deal.brokerId,
          type: deal.type,
          status: getDealStatusLabel(deal.status),
          value: deal.value,
        },
        notification: {
          title: 'Deal Created',
          message: `Deal "${deal.title}" created`,
          type: 'deal_created',
          payload: {
            dealId: deal.id,
            brokerId,
            type: deal.type,
          },
        },
      });

      await tx.lead.update({
        where: { id: data.leadId },
        data: {
          dealId: deal.id,
          legalDocumentId: legalDocumentId ?? undefined,
        },
      });

      await syncForecastDealsFromDeal(tx, deal);

      return mapped;
    });

    return created;
  }

  async updateDeal(id: string, data: UpdateDealInput, options?: { user?: User | null }): Promise<Deal> {
    const existing = await prisma.deal.findUnique({
      where: { id },
      include: {
        broker: { select: { id: true, name: true } },
      },
    });
    if (!existing) throw new Error('Deal not found');

    const effectiveBrokerId = getEffectiveBrokerId(options?.user);
    const brokerId = effectiveBrokerId || data.brokerId || existing.brokerId;
    const dealType = data.type || existing.type;
    const currentStatus = existing.status as DealStatus;
    const nextStatus =
      data.status !== undefined
        ? resolveDealStatus(data.status, {
            fallback: currentStatus,
            allowLegacyMapping: true,
          })
        : currentStatus;

    assertBrokerCanAccessDealType(options?.user, dealType);
    await assertAssignedBroker(brokerId, dealType);
    await assertLeadAndPropertyCompatibility(
      data.leadId || existing.leadId,
      data.propertyId || existing.propertyId,
      dealType
    );

    const nextLegalDocumentId =
      data.legalDocumentId !== undefined
        ? await assertLegalDocumentReferenceExists(
            prisma,
            data.legalDocumentId,
            'Selected legal document was not found'
          )
        : existing.legalDocumentId || undefined;

    if (statusRequiresWorkflowDocument(nextStatus) && !nextLegalDocumentId) {
      throw new Error(
        `A legal document must be linked for ${getDealStatusLabel(nextStatus)}`
      );
    }

    const nextAssetValue = roundMoney(
      asOptionalNumber((data as any).assetValue) ??
        asOptionalNumber(data.value) ??
        asOptionalNumber((existing as any).assetValue) ??
        asOptionalNumber(existing.value) ??
        0
    );
    const incomingCommissionPercent = asOptionalNumber((data as any).commissionPercent);
    const existingCommissionPercent = Number((existing as any).commissionPercent || 0);
    const nextCommissionPercent =
      incomingCommissionPercent !== undefined
        ? incomingCommissionPercent
        : existingCommissionPercent > 0
        ? existingCommissionPercent
        : undefined;
    const nextGrossCommissionFromPayload = asOptionalNumber((data as any).grossCommission);
    const nextGrossCommission =
      nextGrossCommissionFromPayload !== undefined
        ? nextGrossCommissionFromPayload
        : Number((existing as any).grossCommission || 0) > 0
        ? Number((existing as any).grossCommission)
        : undefined;
    const nextCoBrokers = resolveCoBrokerInput(
      (data as any).coBrokers,
      (data as any).coBrokerSplits,
      (existing as any).coBrokerSplits
    );
    const financials = buildDealFinancialSnapshot({
      dealType,
      assetValue: nextAssetValue,
      commissionPercent: nextCommissionPercent,
      grossCommission: nextGrossCommission,
      auctionReferralPercent:
        asOptionalNumber((data as any).auctionReferralPercent) ??
        (Number((existing as any).auctionReferralPercent || 0) > 0
          ? Number((existing as any).auctionReferralPercent)
          : undefined),
      auctionCommissionPercent:
        asOptionalNumber((data as any).auctionCommissionPercent) ??
        (Number((existing as any).auctionCommissionPercent || 0) > 0
          ? Number((existing as any).auctionCommissionPercent)
          : undefined),
      brokerSplitPercent:
        asOptionalNumber((data as any).brokerSplitPercent) ??
        (Number((existing as any).brokerSplitPercent || 0) > 0
          ? Number((existing as any).brokerSplitPercent)
          : undefined),
      coBrokers: nextCoBrokers,
    });

    const existingMapped = mapDeal(existing as NonNullable<DealWithBroker>);
    const activityAt = new Date();
    const updated = await prisma.$transaction(async tx => {
      const statusChanged = currentStatus !== nextStatus;

      if (nextLegalDocumentId && statusRequiresWorkflowDocument(nextStatus)) {
        await upsertDealStatusDocumentWithClient(tx, {
          dealId: id,
          status: nextStatus,
          legalDocumentId: nextLegalDocumentId,
          linkedByUserId: options?.user?.id || null,
          metadata: {
            source: 'deal_update',
          },
        });
      }

      if (statusChanged) {
        await assertDealTransitionWithClient(tx, {
          dealId: id,
          nextStatus,
        });
      }

      const deal = await tx.deal.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          status: nextStatus,
          type: data.type,
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
          targetClosureDate: data.targetClosureDate
            ? new Date(data.targetClosureDate)
            : data.targetClosureDate === undefined
            ? undefined
            : null,
          closedDate: data.closedDate
            ? new Date(data.closedDate)
            : data.closedDate === undefined
            ? undefined
            : null,
          leadId: data.leadId,
          propertyId: data.propertyId,
          brokerId,
          createdByBrokerId: existing.createdByBrokerId || effectiveBrokerId || null,
          legalDocumentId: nextLegalDocumentId,
          lastActivityAt: activityAt,
          inactivityNotifiedAt: null,
        },
        include: {
          broker: {
            select: { id: true, name: true },
          },
        },
      });

      const mapped = mapDeal(deal as NonNullable<DealWithBroker>);
      if (statusChanged) {
        await dealActivityService.recordStatusChangeWithClient(tx, {
          dealId: deal.id,
          dealTitle: deal.title,
          brokerId: deal.brokerId,
          previousStatus: getDealStatusLabel(currentStatus),
          newStatus: getDealStatusLabel(nextStatus),
          actor: options?.user || null,
          source: 'deal_update',
          occurredAt: activityAt,
        });

        await recordDealStatusHistoryWithClient(tx, {
          dealId: deal.id,
          status: nextStatus,
          changedByUserId: options?.user?.id || null,
          changedAt: activityAt,
          metadata: {
            source: 'deal_update',
            previousStatus: getDealStatusLabel(currentStatus),
          },
        });
      }

      await auditLogService.recordWithClient(tx, {
        action: 'deal_updated',
        entityType: 'deal',
        entityId: deal.id,
        description: `Deal "${deal.title}" updated`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId,
        visibilityScope: 'shared',
        previousValues: buildAuditSnapshot(existingMapped),
        nextValues: buildAuditSnapshot(mapped),
        metadata: {
          previousStatus: getDealStatusLabel(currentStatus),
          status: getDealStatusLabel(nextStatus),
          previousType: existing.type,
          type: deal.type,
          previousValue: existing.value,
          value: deal.value,
          leadId: deal.leadId,
          propertyId: deal.propertyId,
          brokerId: deal.brokerId,
        },
        notification: statusChanged
          ? null
          : {
              title: 'Deal Updated',
              message: `Deal "${deal.title}" updated`,
              type: 'deal_updated',
              payload: {
                dealId: deal.id,
                brokerId,
                type: deal.type,
                status: getDealStatusLabel(nextStatus),
              },
            },
      });

      if (existing.leadId !== deal.leadId) {
        await tx.lead.updateMany({
          where: { id: existing.leadId },
          data: {
            dealId: null,
          },
        });
      }

      await tx.lead.update({
        where: { id: deal.leadId },
        data: {
          dealId: deal.id,
          legalDocumentId: nextLegalDocumentId ?? undefined,
        },
      });

      await syncForecastDealsFromDeal(tx, deal);

      return mapped;
    });

    return updated;
  }

  async deleteDeal(id: string, options?: { user?: User | null }): Promise<void> {
    const existing = await prisma.deal.findUnique({
      where: { id },
      include: {
        broker: { select: { id: true, name: true } },
        statusDocuments: {
          select: { legalDocumentId: true },
        },
      },
    });
    if (!existing) throw new Error('Deal not found');

    const existingMapped = mapDeal(existing as NonNullable<DealWithBroker>);
    await prisma.$transaction(async tx => {
      const linkedDocumentIds = Array.from(
        new Set(
          [
            existing.legalDocumentId || null,
            ...(existing.statusDocuments || []).map(item => item.legalDocumentId),
          ]
            .filter(Boolean)
            .map(value => String(value))
        )
      );

      for (const legalDocumentId of linkedDocumentIds) {
        await removeDealDocumentLink(tx, legalDocumentId, existing.id);
      }

      await auditLogService.recordWithClient(tx, {
        action: 'deal_deleted',
        entityType: 'deal',
        entityId: existing.id,
        description: `Deal "${existing.title}" deleted`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: existing.brokerId,
        visibilityScope: 'shared',
        previousValues: buildAuditSnapshot(existingMapped),
        metadata: {
          leadId: existing.leadId,
          propertyId: existing.propertyId,
          brokerId: existing.brokerId,
          type: existing.type,
          status: getDealStatusLabel(existing.status as DealStatus),
          value: existing.value,
        },
        notification: {
          title: 'Deal Deleted',
          message: `Deal "${existing.title}" deleted`,
          type: 'deal_deleted',
          payload: {
            dealId: existing.id,
            brokerId: existing.brokerId,
            type: existing.type,
          },
        },
      });

      await tx.lead.updateMany({
        where: { id: existing.leadId },
        data: {
          dealId: null,
          forecastDealId: null,
        },
      });

      await tx.deal.delete({ where: { id } });
    });
  }

  async getDealsByBroker(brokerId: string): Promise<Deal[]> {
    const deals = await prisma.deal.findMany({
      where: { brokerId },
      include: {
        broker: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true } },
        legalDocument: {
          select: {
            id: true,
            documentName: true,
            status: true,
            fileName: true,
            filePath: true,
            fileType: true,
          },
        },
        statusDocuments: {
          include: {
            legalDocument: {
              select: {
                id: true,
                documentName: true,
                documentType: true,
                status: true,
                fileName: true,
                filePath: true,
                fileType: true,
                lastModifiedDate: true,
              },
            },
          },
          orderBy: [{ status: 'asc' }],
        },
        statusHistory: {
          include: {
            changedByUser: {
              select: { id: true, name: true },
            },
          },
          orderBy: [{ changedAt: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return deals.map(deal => mapDeal(deal as NonNullable<DealWithBroker>));
  }

  async getDealsByStatus(status: string): Promise<Deal[]> {
    const normalizedStatus = resolveDealStatus(status, {
      allowLegacyMapping: true,
    });
    const deals = await prisma.deal.findMany({
      where: { status: normalizedStatus },
      include: {
        broker: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true } },
        legalDocument: {
          select: {
            id: true,
            documentName: true,
            status: true,
            fileName: true,
            filePath: true,
            fileType: true,
          },
        },
        statusDocuments: {
          include: {
            legalDocument: {
              select: {
                id: true,
                documentName: true,
                documentType: true,
                status: true,
                fileName: true,
                filePath: true,
                fileType: true,
                lastModifiedDate: true,
              },
            },
          },
          orderBy: [{ status: 'asc' }],
        },
        statusHistory: {
          include: {
            changedByUser: {
              select: { id: true, name: true },
            },
          },
          orderBy: [{ changedAt: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return deals.map(deal => mapDeal(deal as NonNullable<DealWithBroker>));
  }

  async getTotalDealValue(): Promise<number> {
    const result = await prisma.deal.aggregate({
      _sum: {
        value: true,
      },
    });

    return result._sum.value || 0;
  }
}

export const dealService = new DealService();
