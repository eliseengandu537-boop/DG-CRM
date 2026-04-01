import { DealStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  DealWorkflowCompletion,
  assertDealStatusTransition,
  getDocumentTypeForDealStatus,
  getDealStatusLabel,
  resolveDealStatus,
  resolveDealStatusOrNull,
  statusRequiresWorkflowDocument,
  summarizeWorkflowCompletion,
} from '@/lib/dealWorkflow';

type PrismaLike = Prisma.TransactionClient | typeof prisma;

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function removeLinkedDealEntry(
  value: unknown,
  dealId: string,
  status: DealStatus
): Array<Record<string, unknown>> {
  const links = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  return links.filter(link => {
    const linkedDealId = normalizeText((link as any)?.dealId);
    const linkedStatus = resolveDealStatusOrNull(normalizeText((link as any)?.status), {
      allowLegacyMapping: true,
    });
    if (!linkedStatus) return true;
    return !(linkedDealId === dealId && linkedStatus === status);
  });
}

function appendLinkedDealEntry(
  value: unknown,
  payload: {
    dealId: string;
    dealName: string;
    dealType: string;
    status: DealStatus;
    clientName?: string;
  }
): Array<Record<string, unknown>> {
  const links = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  const filtered = links.filter(link => {
    const linkedDealId = normalizeText((link as any)?.dealId);
    const linkedStatus = normalizeText((link as any)?.status);
    return !(linkedDealId === payload.dealId && linkedStatus === getDealStatusLabel(payload.status));
  });

  filtered.push({
    dealId: payload.dealId,
    dealName: payload.dealName,
    dealType: payload.dealType,
    status: getDealStatusLabel(payload.status),
    clientName: payload.clientName || '',
  });

  return filtered;
}

export async function getDealWorkflowStateWithClient(client: PrismaLike, dealId: string): Promise<{
  currentStatus: DealStatus;
  completion: DealWorkflowCompletion;
}> {
  const record = await client.deal.findUnique({
    where: { id: dealId },
    select: {
      status: true,
      statusDocuments: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!record) {
    throw new Error('Deal not found');
  }

  const completion = summarizeWorkflowCompletion(record.statusDocuments.map(item => item.status));
  return {
    currentStatus: record.status,
    completion,
  };
}

export async function assertDealTransitionWithClient(
  client: PrismaLike,
  input: {
    dealId: string;
    nextStatus: DealStatus;
  }
): Promise<void> {
  const state = await getDealWorkflowStateWithClient(client, input.dealId);
  assertDealStatusTransition({
    currentStatus: state.currentStatus,
    nextStatus: input.nextStatus,
    completion: state.completion,
  });
}

export async function recordDealStatusHistoryWithClient(
  client: PrismaLike,
  input: {
    dealId: string;
    status: DealStatus;
    changedByUserId?: string | null;
    changedAt?: Date;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  const latest = await client.dealStatusHistory.findFirst({
    where: { dealId: input.dealId },
    orderBy: { changedAt: 'desc' },
    select: { status: true },
  });

  if (latest?.status === input.status) {
    return;
  }

  await client.dealStatusHistory.create({
    data: {
      dealId: input.dealId,
      status: input.status,
      changedByUserId: input.changedByUserId || null,
      changedAt: input.changedAt || new Date(),
      metadata: (input.metadata as Prisma.InputJsonValue) || undefined,
    },
  });
}

export async function upsertDealStatusDocumentWithClient(
  client: PrismaLike,
  input: {
    dealId: string;
    status: DealStatus;
    legalDocumentId: string;
    linkedByUserId?: string | null;
    filledDocumentRecordId?: string | null;
    filledDocumentDownloadUrl?: string | null;
    filledDocumentName?: string | null;
    completedAt?: Date | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  if (!statusRequiresWorkflowDocument(input.status)) {
    throw new Error('This deal status does not allow workflow legal documents');
  }

  const [deal, legalDocument] = await Promise.all([
    client.deal.findUnique({
      where: { id: input.dealId },
      select: {
        id: true,
        title: true,
        type: true,
        lead: { select: { name: true } },
      },
    }),
    client.legalDocument.findUnique({
      where: { id: input.legalDocumentId },
      select: {
        id: true,
        documentType: true,
        documentName: true,
        tags: true,
        fileType: true,
        fileName: true,
        linkedDeals: true,
      },
    }),
  ]);

  if (!deal) {
    throw new Error('Deal not found');
  }

  if (!legalDocument) {
    throw new Error('Selected legal document was not found');
  }

  const documentType = getDocumentTypeForDealStatus(input.status);
  const existing = await client.dealStatusDocument.findUnique({
    where: {
      dealId_status: {
        dealId: input.dealId,
        status: input.status,
      },
    },
    select: {
      id: true,
      legalDocumentId: true,
      version: true,
    },
  });

  const nextVersion =
    existing && existing.legalDocumentId !== input.legalDocumentId
      ? existing.version + 1
      : existing?.version || 1;

  await client.dealStatusDocument.upsert({
    where: {
      dealId_status: {
        dealId: input.dealId,
        status: input.status,
      },
    },
    create: {
      dealId: input.dealId,
      status: input.status,
      documentType,
      legalDocumentId: input.legalDocumentId,
      linkedByUserId: input.linkedByUserId || null,
      filledDocumentRecordId: input.filledDocumentRecordId || null,
      filledDocumentDownloadUrl: input.filledDocumentDownloadUrl || null,
      filledDocumentName: input.filledDocumentName || null,
      completedAt: input.completedAt || null,
      metadata: (input.metadata as Prisma.InputJsonValue) || undefined,
      version: nextVersion,
    },
    update: {
      documentType,
      legalDocumentId: input.legalDocumentId,
      linkedByUserId: input.linkedByUserId || null,
      filledDocumentRecordId: input.filledDocumentRecordId || null,
      filledDocumentDownloadUrl: input.filledDocumentDownloadUrl || null,
      filledDocumentName: input.filledDocumentName || null,
      completedAt: input.completedAt || null,
      metadata: (input.metadata as Prisma.InputJsonValue) || undefined,
      version: nextVersion,
    },
  });

  await client.deal.update({
    where: { id: input.dealId },
    data: {
      legalDocumentId: input.legalDocumentId,
      lastActivityAt: new Date(),
      inactivityNotifiedAt: null,
    },
  });

  if (existing && existing.legalDocumentId && existing.legalDocumentId !== input.legalDocumentId) {
    const previousDocument = await client.legalDocument.findUnique({
      where: { id: existing.legalDocumentId },
      select: { id: true, linkedDeals: true },
    });

    if (previousDocument) {
      const previousLinks = removeLinkedDealEntry(previousDocument.linkedDeals, deal.id, input.status);
      await client.legalDocument.update({
        where: { id: previousDocument.id },
        data: { linkedDeals: previousLinks as Prisma.InputJsonValue },
      });
    }
  }

  const nextLinks = appendLinkedDealEntry(legalDocument.linkedDeals, {
    dealId: deal.id,
    dealName: deal.title,
    dealType: normalizeText(deal.type).toLowerCase(),
    status: input.status,
    clientName: deal.lead?.name || '',
  });

  await client.legalDocument.update({
    where: { id: legalDocument.id },
    data: {
      linkedDeals: nextLinks as Prisma.InputJsonValue,
    },
  });
}
