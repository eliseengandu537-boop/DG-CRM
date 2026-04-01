import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getEffectiveBrokerId, normalizeModuleScope } from '@/lib/departmentAccess';
import { CustomRecord, PaginatedResponse, User } from '@/types';
import { emailService } from '@/services/emailService';

const ENTITY_TYPE = 'brochure';

type BrochureRecord = Awaited<ReturnType<typeof prisma.customRecord.findFirst>>;

export interface BrochureFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export interface BrochureMutationInput {
  name?: string;
  status?: string;
  category?: string;
  referenceId?: string;
  moduleType?: string;
  payload?: Record<string, unknown>;
}

function toPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isPrivileged(user?: User | null): boolean {
  return user?.role === 'admin' || user?.role === 'manager';
}

function mapBrochure(record: NonNullable<BrochureRecord>): CustomRecord {
  return {
    id: record.id,
    entityType: record.entityType,
    name: record.name,
    status: record.status || undefined,
    category: record.category || undefined,
    referenceId: record.referenceId || undefined,
    createdByUserId: record.createdByUserId || undefined,
    createdByBrokerId: record.createdByBrokerId || undefined,
    assignedBrokerId: record.assignedBrokerId || undefined,
    moduleType: (record.moduleType as CustomRecord['moduleType']) || undefined,
    visibilityScope:
      String(record.visibilityScope || '').trim().toLowerCase() === 'private' ? 'private' : 'shared',
    payload: toPayload(record.payload),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function assertCanView(user: User | null | undefined, record: NonNullable<BrochureRecord>) {
  if (isPrivileged(user)) return;
  if (user?.role === 'broker' && record.createdByUserId === user.id) return;
  throw new Error('Forbidden: brochure access denied');
}

function assertCanEdit(user: User | null | undefined, record: NonNullable<BrochureRecord>) {
  if (isPrivileged(user)) return;
  if (user?.role === 'broker' && record.createdByUserId === user.id) return;
  throw new Error('Forbidden: cannot edit this brochure');
}

function assertCanDelete(user: User | null | undefined) {
  if (isPrivileged(user)) return;
  throw new Error('Forbidden: only admin or manager can delete brochures');
}

function toEmailText(record: CustomRecord): string {
  const payload = toPayload(record.payload);
  const fallbackDate = record.createdAt ? new Date(record.createdAt).toISOString().split('T')[0] : '';

  return [
    'New Brochure Entry Created:',
    '',
    `Sending to: ${String(payload.emailTo || record.referenceId || '').trim()}`,
    '',
    `Created By: ${String(payload.createdBy || '').trim()}`,
    `Assignee: ${String(payload.assignee || '').trim()}`,
    `Date: ${String(payload.date || fallbackDate).trim()}`,
    `Priority: ${String(payload.priority || record.status || '').trim()}`,
    '',
    'Brochure Details:',
    `Name: ${record.name}`,
    `Broker Name: ${String(payload.brokerName || '').trim()}`,
    `Property Type: ${String(payload.propertyType || record.category || '').trim()}`,
    `Transaction Type: ${String(payload.transactionType || '').trim()}`,
    `Area: ${String(payload.area || '').trim()}`,
    `Address: ${String(payload.address || '').trim()}`,
    `Google Link: ${String(payload.googleLink || '').trim()}`,
    `GLA/Land Size: ${String(payload.glaLandSize || '').trim()} m2`,
    `Zoning: ${String(payload.zoning || '').trim()}`,
    `Rate p/m2: ${String(payload.ratePerM2 || '').trim()}`,
    `Asking Price: ${String(payload.askingPrice || '').trim()}`,
    `Yield: ${String(payload.yield || '').trim()}`,
    `Amenities: ${String(payload.amenities || '').trim()}`,
    `Tenanted/Vacant: ${String(payload.tenantedVacant || '').trim()}`,
    `Description: ${String(payload.propertyDescription || '').trim()}`,
    `Photo Link: ${String(payload.photoLinkOnedrive || '').trim()}`,
    `Supporting Docs: ${String(payload.supportingDocs || '').trim()}`,
    `Required: ${String(payload.whatRequired || '').trim()}`,
    `Brochure Link: ${String(payload.brochureLink || '').trim()}`,
    `Comments: ${String(payload.commentChanges || '').trim()}`,
    `Post Link: ${String(payload.postLink || '').trim()}`,
  ].join('\n');
}

function buildWhere(filters: BrochureFilters | undefined, user: User | null | undefined) {
  const where: Record<string, unknown> = {
    entityType: ENTITY_TYPE,
  };

  if (!isPrivileged(user)) {
    where.createdByUserId = user?.id || '';
  }

  const search = String(filters?.search || '').trim();
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  return where;
}

function buildBrochurePayload(
  data: BrochureMutationInput,
  user: User | null | undefined,
  existingPayload?: Record<string, unknown>
): Record<string, unknown> {
  const inputPayload = toPayload(data.payload);
  const merged = {
    ...(existingPayload || {}),
    ...inputPayload,
  };

  const brochureName = String(data.name || merged.brochureName || '').trim();
  const today = new Date().toISOString().split('T')[0];

  return {
    ...merged,
    brochureName,
    createdBy: String(merged.createdBy || user?.name || '').trim(),
    date: String(merged.date || today).trim(),
    priority: String(data.status || merged.priority || '').trim(),
    propertyType: String(data.category || merged.propertyType || '').trim(),
    emailTo: String(data.referenceId || merged.emailTo || '').trim(),
  };
}

export class BrochureService {
  async getAllBrochures(
    filters?: BrochureFilters,
    options?: { user?: User | null }
  ): Promise<PaginatedResponse<CustomRecord>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const where = buildWhere(filters, options?.user);

    const [total, rows] = await prisma.$transaction([
      prisma.customRecord.count({ where }),
      prisma.customRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map(row => mapBrochure(row as NonNullable<BrochureRecord>)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getBrochureById(id: string, options?: { user?: User | null }): Promise<CustomRecord> {
    const row = await prisma.customRecord.findFirst({
      where: {
        id,
        entityType: ENTITY_TYPE,
      },
    });
    if (!row) throw new Error('Brochure not found');

    assertCanView(options?.user, row as NonNullable<BrochureRecord>);
    return mapBrochure(row as NonNullable<BrochureRecord>);
  }

  async createBrochure(
    data: BrochureMutationInput,
    options?: { user?: User | null }
  ): Promise<CustomRecord> {
    const payload = buildBrochurePayload(data, options?.user);
    const name = String(data.name || payload.brochureName || '').trim();
    if (!name) {
      throw new Error('Brochure name is required');
    }

    const status = String(data.status || payload.priority || 'Medium').trim();
    const category = String(data.category || payload.propertyType || '').trim() || null;
    const referenceId = String(data.referenceId || payload.emailTo || '').trim() || null;
    const moduleType =
      normalizeModuleScope(data.moduleType) ||
      normalizeModuleScope(String(payload.moduleType || options?.user?.department || '')) ||
      undefined;
    const createdByBrokerId = getEffectiveBrokerId(options?.user) || null;

    const row = await prisma.customRecord.create({
      data: {
        entityType: ENTITY_TYPE,
        name,
        status: status || null,
        category,
        referenceId,
        createdByUserId: options?.user?.id || null,
        createdByBrokerId,
        assignedBrokerId: createdByBrokerId,
        moduleType: moduleType || null,
        visibilityScope: 'private',
        payload: payload as Prisma.InputJsonValue,
      },
    });

    return mapBrochure(row as NonNullable<BrochureRecord>);
  }

  async updateBrochure(
    id: string,
    data: BrochureMutationInput,
    options?: { user?: User | null }
  ): Promise<CustomRecord> {
    const existing = await prisma.customRecord.findFirst({
      where: {
        id,
        entityType: ENTITY_TYPE,
      },
    });
    if (!existing) throw new Error('Brochure not found');

    assertCanEdit(options?.user, existing as NonNullable<BrochureRecord>);

    const existingPayload = toPayload(existing.payload);
    const payload = buildBrochurePayload(data, options?.user, existingPayload);

    const name = String(data.name || payload.brochureName || existing.name || '').trim();
    if (!name) {
      throw new Error('Brochure name is required');
    }

    const nextStatus =
      data.status === undefined ? undefined : String(data.status || payload.priority || '').trim() || null;
    const nextCategory =
      data.category === undefined
        ? undefined
        : String(data.category || payload.propertyType || '').trim() || null;
    const nextReferenceId =
      data.referenceId === undefined
        ? undefined
        : String(data.referenceId || payload.emailTo || '').trim() || null;
    const nextModuleType =
      data.moduleType === undefined
        ? undefined
        : normalizeModuleScope(data.moduleType) ||
          normalizeModuleScope(String(payload.moduleType || '')) ||
          null;

    const row = await prisma.customRecord.update({
      where: { id },
      data: {
        name,
        status: nextStatus,
        category: nextCategory,
        referenceId: nextReferenceId,
        moduleType: nextModuleType,
        payload: payload as Prisma.InputJsonValue,
      },
    });

    return mapBrochure(row as NonNullable<BrochureRecord>);
  }

  async deleteBrochure(id: string, options?: { user?: User | null }): Promise<void> {
    assertCanDelete(options?.user);

    const existing = await prisma.customRecord.findFirst({
      where: {
        id,
        entityType: ENTITY_TYPE,
      },
      select: { id: true },
    });
    if (!existing) throw new Error('Brochure not found');

    await prisma.customRecord.delete({
      where: { id },
    });
  }

  async sendBrochureEmail(id: string, options?: { user?: User | null }): Promise<{ to: string }> {
    const brochure = await this.getBrochureById(id, options);
    const payload = toPayload(brochure.payload);
    const to = String(payload.emailTo || brochure.referenceId || '').trim();
    if (!to) {
      throw new Error('Recipient email is required');
    }

    await emailService.sendMail({
      to,
      subject: `New Brochure Entry: ${brochure.name}`,
      text: toEmailText(brochure),
    });

    return { to };
  }
}

export const brochureService = new BrochureService();
