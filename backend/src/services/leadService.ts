import { Lead, PaginatedResponse, User } from '@/types';
import { CreateLeadInput, UpdateLeadInput } from '@/validators';
import { prisma } from '@/lib/prisma';
import {
  addDepartmentScope,
  assertAssignedBrokerMatchesDepartment,
  assertBrokerCanAccessModule,
  getEffectiveBrokerId,
  normalizeBrokerDepartment,
  normalizeModuleScope,
} from '@/lib/departmentAccess';
import { auditLogService } from '@/services/auditLogService';

type LeadWithRelations = Awaited<
  ReturnType<typeof prisma.lead.findFirst>
> & {
  broker?: { id: string; name: string } | null;
};

function mapLead(record: NonNullable<LeadWithRelations>): Lead {
  const resolvedComment = (record as any).comment ?? record.notes;
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    phone: record.phone,
    moduleType: (record.moduleType as Lead['moduleType']) ?? undefined,
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
    createdByBrokerId: record.createdByBrokerId ?? undefined,
    assignedBrokerId: record.brokerId ?? undefined,
    assignedBrokerName: record.broker?.name ?? undefined,
    propertyId: record.propertyId ?? undefined,
    broker: record.brokerId ?? undefined,
    property: record.propertyId ?? undefined,
    value: record.value ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildAuditSnapshot(record: Lead): Record<string, unknown> {
  return {
    name: record.name,
    email: record.email,
    phone: record.phone,
    status: record.status,
    moduleType: record.moduleType ?? null,
    dealType: record.dealType ?? null,
    brokerId: record.brokerId ?? null,
    createdByBrokerId: record.createdByBrokerId ?? null,
    propertyId: record.propertyId ?? null,
    contactId: record.contactId ?? null,
    value: record.value ?? null,
    linkedStockId: record.linkedStockId ?? null,
    comment: record.comment ?? record.notes ?? null,
  };
}

function normalizeOptionalComment(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
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

async function resolveLeadModuleType(
  inputModuleType: string | undefined,
  brokerId: string | undefined,
  propertyId: string | undefined,
  user?: User | null,
  existingModuleType?: string | null
) {
  if (user?.role === 'broker') {
    const department = normalizeBrokerDepartment(user.department);
    if (!department) {
      throw new Error('Broker department is required before creating leads');
    }
    return department;
  }

  const normalizedInput = normalizeModuleScope(inputModuleType);
  if (normalizedInput) {
    return normalizedInput;
  }

  if (propertyId) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, moduleType: true },
    });
    if (!property) throw new Error('Property not found');
    const propertyModule = normalizeModuleScope(property.moduleType);
    if (propertyModule) {
      return propertyModule;
    }
  }

  if (brokerId) {
    const broker = await prisma.broker.findUnique({
      where: { id: brokerId },
      select: { department: true, company: true },
    });
    const brokerModule =
      normalizeBrokerDepartment(broker?.department) || normalizeBrokerDepartment(broker?.company);
    if (brokerModule) {
      return brokerModule;
    }
  }

  const existingModule = normalizeModuleScope(existingModuleType);
  if (existingModule) {
    return existingModule;
  }

  throw new Error('Lead module is required');
}

async function assertAssignedBroker(
  brokerId: string | undefined,
  moduleType: string | undefined
): Promise<void> {
  if (!brokerId) return;

  const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
  if (!broker) throw new Error('Assigned broker not found');
  if (broker.status === 'archived') throw new Error('Assigned broker is archived');
  assertAssignedBrokerMatchesDepartment(broker.department || broker.company, moduleType, 'lead');
}

async function assertPropertyMatchesModule(propertyId: string | undefined, moduleType: string | undefined) {
  if (!propertyId) return;

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, moduleType: true },
  });
  if (!property) throw new Error('Property not found');

  const propertyModule = normalizeModuleScope(property.moduleType);
  const leadModule = normalizeModuleScope(moduleType);
  if (
    propertyModule &&
    leadModule &&
    propertyModule !== 'auction' &&
    leadModule !== 'auction' &&
    propertyModule !== leadModule
  ) {
    throw new Error('Lead module must match the linked property department');
  }
}

export class LeadService {
  async getAllLeads(
    filters?: {
      status?: string;
      broker?: string;
      brokerId?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
    options?: { user?: User | null }
  ): Promise<PaginatedResponse<Lead>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    const brokerId = filters?.brokerId || filters?.broker;
    if (brokerId) {
      where.brokerId = brokerId;
    }

    if (filters?.search) {
      const search = filters.search.trim();
      if (search) {
        where.OR = [
          { name: { contains: search } },
          { email: { contains: search } },
          { phone: { contains: search } },
        ];
      }
    }

    const scopedWhere = addDepartmentScope(where, options?.user, 'moduleType');

    const [total, leads] = await prisma.$transaction([
      prisma.lead.count({ where: scopedWhere }),
      prisma.lead.findMany({
        where: scopedWhere,
        include: {
          broker: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: leads.map(lead => mapLead(lead as NonNullable<LeadWithRelations>)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getLeadById(id: string): Promise<Lead> {
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        broker: {
          select: { id: true, name: true },
        },
      },
    });
    if (!lead) throw new Error('Lead not found');
    return mapLead(lead as NonNullable<LeadWithRelations>);
  }

  async createLead(data: CreateLeadInput, options?: { user?: User | null }): Promise<Lead> {
    const effectiveBrokerId = getEffectiveBrokerId(options?.user);
    const brokerId = effectiveBrokerId || data.brokerId || undefined;
    const moduleType = await resolveLeadModuleType(
      data.moduleType,
      brokerId,
      data.propertyId,
      options?.user
    );

    assertBrokerCanAccessModule(options?.user, moduleType);
    await assertAssignedBroker(brokerId, moduleType);

    if (data.contactId) {
      const contact = await prisma.contact.findUnique({ where: { id: data.contactId } });
      if (!contact) throw new Error('Contact not found');
    }

    await assertPropertyMatchesModule(data.propertyId, moduleType);

    const legalDocumentId = data.legalDocumentId?.trim() || undefined;
    if (legalDocumentId) {
      await this.assertLegalDocumentReady(legalDocumentId);
    }

    const normalizedCommentInput = normalizeOptionalComment((data as any).comment);
    const normalizedNotesInput =
      data.notes === undefined ? undefined : String(data.notes || '').trim() || null;
    const resolvedComment =
      normalizedCommentInput !== undefined ? normalizedCommentInput : normalizedNotesInput;
    const resolvedNotes = resolvedComment ?? undefined;

    const created = await prisma.$transaction(async tx => {
      const lead = await tx.lead.create({
        data: {
          name: data.name,
          email: data.email.trim().toLowerCase(),
          phone: data.phone?.trim() || '',
          status: data.status,
          value: data.value,
          brokerId: brokerId || null,
          createdByBrokerId: effectiveBrokerId || null,
          propertyId: data.propertyId,
          moduleType,
          stage: data.stage,
          company: data.company,
          leadSource: data.leadSource,
          dealType: data.dealType,
          probability: data.probability,
          closingTimeline: data.closingTimeline,
          notes: resolvedNotes,
          comment: resolvedComment,
          contactId: data.contactId,
          brokerAssigned: data.brokerAssigned,
          additionalBroker: data.additionalBroker,
          commissionSplit: data.commissionSplit,
          propertyAddress: data.propertyAddress,
          leadType: data.leadType,
          linkedStockId: data.linkedStockId,
          dealId: data.dealId,
          forecastDealId: data.forecastDealId,
          legalDocumentId,
        },
        include: {
          broker: {
            select: { id: true, name: true },
          },
        },
      });

      const mapped = mapLead(lead as NonNullable<LeadWithRelations>);
      await auditLogService.recordWithClient(tx, {
        action: 'lead_created',
        entityType: 'lead',
        entityId: lead.id,
        description: `Lead "${lead.name}" created`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: brokerId || null,
        visibilityScope: 'shared',
        nextValues: buildAuditSnapshot(mapped),
        metadata: {
          status: lead.status,
          moduleType: lead.moduleType,
          brokerId: lead.brokerId,
          value: lead.value ?? 0,
        },
        notification: {
          title: 'Lead Created',
          message: `Lead "${lead.name}" created`,
          type: 'lead_created',
          payload: {
            leadId: lead.id,
            brokerId: brokerId || null,
            moduleType,
          },
        },
      });

      return mapped;
    });

    return created;
  }

  async updateLead(id: string, data: UpdateLeadInput, options?: { user?: User | null }): Promise<Lead> {
    const existing = await prisma.lead.findUnique({
      where: { id },
      include: {
        broker: { select: { id: true, name: true } },
      },
    });
    if (!existing) throw new Error('Lead not found');

    const effectiveBrokerId = getEffectiveBrokerId(options?.user);
    const brokerId = effectiveBrokerId || data.brokerId || existing.brokerId || undefined;
    const moduleType = await resolveLeadModuleType(
      data.moduleType || existing.moduleType || undefined,
      brokerId,
      data.propertyId || existing.propertyId || undefined,
      options?.user,
      existing.moduleType
    );

    assertBrokerCanAccessModule(options?.user, moduleType);
    await assertAssignedBroker(brokerId, moduleType);

    if (data.contactId !== undefined && data.contactId !== existing.contactId) {
      throw new Error('Linked contact cannot be changed after creation');
    }

    await assertPropertyMatchesModule(data.propertyId || existing.propertyId || undefined, moduleType);

    const nextStatus = String(data.status || existing.status || '').trim();
    const legalDocumentId = data.legalDocumentId?.trim() || existing.legalDocumentId || undefined;
    const normalizedCommentInput = normalizeOptionalComment((data as any).comment);
    const normalizedNotesInput =
      data.notes === undefined ? undefined : String(data.notes || '').trim() || null;
    const nextCommentForValidation =
      normalizedCommentInput !== undefined
        ? normalizedCommentInput
        : normalizedNotesInput !== undefined
        ? normalizedNotesInput
        : (existing as any).comment ?? existing.notes;
    const notes =
      normalizedNotesInput !== undefined
        ? normalizedNotesInput
        : normalizedCommentInput !== undefined
        ? normalizedCommentInput
        : existing.notes;
    if (this.isLegalWorkflowStatus(nextStatus)) {
      if (!String(notes || '').trim()) {
        throw new Error('A comment is required before changing to this lead status');
      }
      if (legalDocumentId) {
        await this.assertLegalDocumentReady(legalDocumentId);
      }
    } else if (legalDocumentId) {
      await this.assertLegalDocumentReady(legalDocumentId);
    }

    const existingMapped = mapLead(existing as NonNullable<LeadWithRelations>);
    const updated = await prisma.$transaction(async tx => {
      const lead = await tx.lead.update({
        where: { id },
        data: {
          name: data.name,
          email: data.email?.trim().toLowerCase(),
          phone: data.phone !== undefined ? data.phone.trim() : undefined,
          status: data.status,
          value: data.value,
          brokerId: brokerId || null,
          createdByBrokerId: existing.createdByBrokerId || effectiveBrokerId || null,
          propertyId: data.propertyId,
          moduleType,
          stage: data.stage,
          company: data.company,
          leadSource: data.leadSource,
          dealType: data.dealType,
          probability: data.probability,
          closingTimeline: data.closingTimeline,
          notes:
            normalizedNotesInput !== undefined
              ? normalizedNotesInput
              : normalizedCommentInput !== undefined
              ? normalizedCommentInput
              : undefined,
          comment:
            normalizedCommentInput !== undefined
              ? normalizedCommentInput
              : normalizedNotesInput !== undefined
              ? normalizedNotesInput
              : undefined,
          contactId: data.contactId,
          brokerAssigned: data.brokerAssigned,
          additionalBroker: data.additionalBroker,
          commissionSplit: data.commissionSplit,
          propertyAddress: data.propertyAddress,
          leadType: data.leadType,
          linkedStockId: data.linkedStockId,
          dealId: data.dealId,
          forecastDealId: data.forecastDealId,
          legalDocumentId,
        },
        include: {
          broker: {
            select: { id: true, name: true },
          },
        },
      });

      const mapped = mapLead(lead as NonNullable<LeadWithRelations>);
      await auditLogService.recordWithClient(tx, {
        action:
          String(existing.status || '').trim() !== String(lead.status || '').trim()
            ? 'lead_status_changed'
            : 'lead_updated',
        entityType: 'lead',
        entityId: lead.id,
        description: `Lead "${lead.name}" updated`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: brokerId || existing.brokerId || null,
        visibilityScope: 'shared',
        previousValues: buildAuditSnapshot(existingMapped),
        nextValues: buildAuditSnapshot(mapped),
          metadata: {
            previousStatus: existing.status,
            status: lead.status,
            moduleType: lead.moduleType,
            brokerId: lead.brokerId,
            comment: nextCommentForValidation || null,
          },
        notification: {
          title: 'Lead Updated',
          message: `Lead "${lead.name}" updated`,
          type:
            String(existing.status || '').trim() !== String(lead.status || '').trim()
              ? 'lead_status_changed'
              : 'lead_updated',
          payload: {
            leadId: lead.id,
            brokerId: brokerId || existing.brokerId || null,
            moduleType,
          },
        },
      });

      return mapped;
    });

    return updated;
  }

  async deleteLead(id: string, options?: { user?: User | null }): Promise<void> {
    const existing = await prisma.lead.findUnique({
      where: { id },
      include: {
        broker: { select: { id: true, name: true } },
      },
    });
    if (!existing) throw new Error('Lead not found');

    const existingMapped = mapLead(existing as NonNullable<LeadWithRelations>);
    await prisma.$transaction(async tx => {
      const relatedDeals = await tx.deal.findMany({
        where: { leadId: id },
        select: { id: true, title: true, legalDocumentId: true },
      });

      for (const deal of relatedDeals) {
        if (deal.legalDocumentId) {
          await removeDealDocumentLink(tx, deal.legalDocumentId, deal.id);
        }
      }

      await tx.lead.delete({ where: { id } });

      await auditLogService.recordWithClient(tx, {
        action: 'lead_deleted',
        entityType: 'lead',
        entityId: id,
        description: `Lead "${existing.name}" deleted`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: existing.brokerId || null,
        visibilityScope: 'shared',
        previousValues: buildAuditSnapshot(existingMapped),
        metadata: {
          moduleType: existing.moduleType,
          brokerId: existing.brokerId,
          relatedDeals: relatedDeals.length,
        },
        notification: {
          title: 'Lead Deleted',
          message: `Lead "${existing.name}" deleted`,
          type: 'lead_deleted',
          payload: {
            leadId: id,
            brokerId: existing.brokerId || null,
            moduleType: existing.moduleType || null,
          },
        },
      });
    });
  }

  async updateLeadComment(
    id: string,
    comment: string | null | undefined,
    options?: { user?: User | null }
  ): Promise<Lead> {
    const existing = await prisma.lead.findUnique({
      where: { id },
      include: {
        broker: { select: { id: true, name: true } },
      },
    });
    if (!existing) throw new Error('Lead not found');

    const normalizedComment = normalizeOptionalComment(comment);
    if (normalizedComment === undefined) {
      throw new Error('Comment is required');
    }

    const existingMapped = mapLead(existing as NonNullable<LeadWithRelations>);
    const updated = await prisma.$transaction(async tx => {
      const lead = await tx.lead.update({
        where: { id },
        data: {
          comment: normalizedComment,
          notes: normalizedComment,
        },
        include: {
          broker: { select: { id: true, name: true } },
        },
      });

      const linkedDealId = String(lead.dealId || '').trim();
      if (linkedDealId) {
        await tx.deal.update({
          where: { id: linkedDealId },
          data: {
            description: normalizedComment,
            lastActivityAt: new Date(),
            inactivityNotifiedAt: null,
          },
        });
      }

      const mapped = mapLead(lead as NonNullable<LeadWithRelations>);
      await auditLogService.recordWithClient(tx, {
        action: 'lead_comment_updated',
        entityType: 'lead',
        entityId: lead.id,
        description: `Lead "${lead.name}" comment updated`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: lead.brokerId || null,
        visibilityScope: 'shared',
        previousValues: buildAuditSnapshot(existingMapped),
        nextValues: buildAuditSnapshot(mapped),
        metadata: {
          leadId: lead.id,
          dealId: linkedDealId || null,
          comment: normalizedComment,
        },
        notification: {
          title: 'Lead Comment Updated',
          message: `Lead "${lead.name}" comment updated`,
          type: 'lead_comment_updated',
          payload: {
            leadId: lead.id,
            dealId: linkedDealId || null,
            brokerId: lead.brokerId || null,
          },
        },
      });

      return mapped;
    });

    return updated;
  }

  async getLeadsByStatus(status: string, options?: { user?: User | null }): Promise<Lead[]> {
    const where = addDepartmentScope({ status }, options?.user, 'moduleType');
    const leads = await prisma.lead.findMany({
      where,
      include: { broker: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return leads.map(lead => mapLead(lead as NonNullable<LeadWithRelations>));
  }

  async getLeadsByBroker(brokerId: string, options?: { user?: User | null }): Promise<Lead[]> {
    const where = addDepartmentScope({ brokerId }, options?.user, 'moduleType');
    const leads = await prisma.lead.findMany({
      where,
      include: { broker: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return leads.map(lead => mapLead(lead as NonNullable<LeadWithRelations>));
  }

  async getLeadAnalytics(options?: { user?: User | null }): Promise<{
    total: number;
    byStatus: Record<string, number>;
    totalValue: number;
    averageValue: number;
  }> {
    const leads = await prisma.lead.findMany({
      where: addDepartmentScope({}, options?.user, 'moduleType'),
    });
    const byStatus: Record<string, number> = {};
    let totalValue = 0;
    let valueCount = 0;

    leads.forEach(lead => {
      byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
      if (typeof lead.value === 'number') {
        totalValue += lead.value;
        valueCount += 1;
      }
    });

    return {
      total: leads.length,
      byStatus,
      totalValue,
      averageValue: valueCount > 0 ? totalValue / valueCount : 0,
    };
  }

  private isLegalWorkflowStatus(status: string): boolean {
    const normalized = String(status || '')
      .trim()
      .toLowerCase()
      .replace(/[_-]/g, ' ');

    return new Set(['loi', 'otp', 'otl', 'sale agreement', 'sales agreement', 'lease agreement']).has(
      normalized
    );
  }

  private async assertLegalDocumentReady(legalDocumentId: string): Promise<void> {
    const document = await prisma.legalDocument.findUnique({
      where: { id: legalDocumentId },
      select: { id: true },
    });

    if (!document) {
      throw new Error('Linked legal document not found');
    }
  }
}

export const leadService = new LeadService();
