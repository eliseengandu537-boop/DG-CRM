import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { auditLogService } from '@/services/auditLogService';
import { CustomRecord, PaginatedResponse, User, VisibilityScope } from '@/types';
import { CreateCustomRecordInput, UpdateCustomRecordInput } from '@/validators';
import { buildVisibilityWhere, canUserAccessVisibility } from '@/lib/visibilityScope';
import { getEffectiveBrokerId, normalizeModuleScope } from '@/lib/departmentAccess';

type CustomRecordDb = {
  id: string;
  entityType: string;
  name: string;
  status?: string | null;
  category?: string | null;
  referenceId?: string | null;
  createdByUserId?: string | null;
  createdByBrokerId?: string | null;
  assignedBrokerId?: string | null;
  moduleType?: string | null;
  visibilityScope?: string | null;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const customRecordSelect = {
  id: true,
  entityType: true,
  name: true,
  status: true,
  category: true,
  referenceId: true,
  createdByUserId: true,
  createdByBrokerId: true,
  assignedBrokerId: true,
  moduleType: true,
  visibilityScope: true,
  payload: true,
  createdAt: true,
  updatedAt: true,
} as const;

const legacyCustomRecordSelect = {
  id: true,
  entityType: true,
  name: true,
  status: true,
  category: true,
  referenceId: true,
  payload: true,
  createdAt: true,
  updatedAt: true,
} as const;

function isMissingCustomRecordTable(error: unknown): boolean {
  const message = String((error as any)?.message || error || '');

  return message.includes('CustomRecord') && message.toLowerCase().includes('does not exist');
}

function isLegacyCustomRecordSchemaError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase();

  return (
    message.includes('customrecord') &&
    message.includes('does not exist') &&
    [
      'created_by_user_id',
      'created_by_broker_id',
      'assigned_broker_id',
      'module_type',
      'visibility_scope',
    ].some(column => message.includes(column))
  );
}

function buildLegacyCustomRecordMutationData(
  data: {
    entityType: string;
    name: string;
    status?: string | null;
    category?: string | null;
    referenceId?: string | null;
    payload?: Prisma.InputJsonValue;
  }
): Prisma.CustomRecordUncheckedCreateInput {
  return {
    entityType: data.entityType,
    name: data.name,
    status: data.status ?? null,
    category: data.category ?? null,
    referenceId: data.referenceId ?? null,
    payload: (data.payload ?? {}) as Prisma.InputJsonValue,
  };
}

function toPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function prettify(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function mapCustomRecord(record: CustomRecordDb): CustomRecord {
  return {
    id: record.id,
    entityType: record.entityType,
    name: record.name,
    status: record.status ?? undefined,
    category: record.category ?? undefined,
    referenceId: record.referenceId ?? undefined,
    createdByUserId: record.createdByUserId ?? undefined,
    createdByBrokerId: record.createdByBrokerId ?? undefined,
    assignedBrokerId: record.assignedBrokerId ?? undefined,
    moduleType: (record.moduleType as CustomRecord['moduleType']) ?? undefined,
    visibilityScope:
      String(record.visibilityScope || '').trim().toLowerCase() === 'private'
        ? 'private'
        : 'shared',
    payload: toPayload(record.payload),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function isPrivateCustomRecord(entityType: string): boolean {
  return normalizeEntityType(entityType) === 'brochure';
}

function normalizeEntityType(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function buildAuditPayload(record: CustomRecord) {
  return {
    entityType: record.entityType,
    name: record.name,
    status: record.status ?? null,
    category: record.category ?? null,
    referenceId: record.referenceId ?? null,
    assignedBrokerId: record.assignedBrokerId ?? null,
    moduleType: record.moduleType ?? null,
    visibilityScope: record.visibilityScope ?? 'shared',
    payload: record.payload,
  };
}

async function resolveBrokerIdFromCustomRecordInput(
  data: Partial<CreateCustomRecordInput & UpdateCustomRecordInput>,
  user?: User | null
): Promise<string | undefined> {
  const effectiveBrokerId = getEffectiveBrokerId(user);
  if (effectiveBrokerId) {
    return effectiveBrokerId;
  }

  const payload = toPayload(data.payload);
  const directBrokerId = String(
    data.assignedBrokerId ||
      payload.assignedBrokerId ||
      payload.brokerId ||
      ''
  ).trim();

  if (directBrokerId) {
    const broker = await prisma.broker.findUnique({
      where: { id: directBrokerId },
      select: { id: true, status: true },
    });
    if (broker?.status !== 'archived') {
      return broker?.id;
    }
  }

  const brokerReference = String(payload.brokerName || payload.assignee || '').trim();
  if (!brokerReference) {
    return undefined;
  }

  const broker = await prisma.broker.findFirst({
    where: {
      status: { not: 'archived' },
      OR: [
        { name: { equals: brokerReference, mode: 'insensitive' } },
        { email: { equals: brokerReference.toLowerCase(), mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });

  return broker?.id;
}

class CustomRecordService {
  async getAllCustomRecords(
    filters?: {
      entityType?: string;
      status?: string;
      category?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
    options?: { user?: User | null }
  ): Promise<PaginatedResponse<CustomRecord>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const where: any = {};

    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.status) where.status = filters.status;
    if (filters?.category) where.category = filters.category;
    if (filters?.search) {
      const search = filters.search.trim();
      if (search) {
        where.name = { contains: search, mode: 'insensitive' };
      }
    }

    const visibilityWhere = buildVisibilityWhere(options?.user, {
      brokerFields: ['assignedBrokerId', 'createdByBrokerId'],
    });
    const scopedWhere =
      Object.keys(visibilityWhere).length === 0
        ? where
        : Object.keys(where).length === 0
        ? visibilityWhere
        : { AND: [where, visibilityWhere] };

    let total = 0;
    let records: CustomRecordDb[] = [];

    try {
      [total, records] = await prisma.$transaction([
        prisma.customRecord.count({ where: scopedWhere }),
        prisma.customRecord.findMany({
          where: scopedWhere,
          select: customRecordSelect,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
    } catch (error) {
      if (isMissingCustomRecordTable(error)) {
        return {
          data: [],
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        };
      }

      if (!isLegacyCustomRecordSchemaError(error)) {
        throw error;
      }

      [total, records] = await prisma.$transaction([
        prisma.customRecord.count({ where }),
        prisma.customRecord.findMany({
          where,
          select: legacyCustomRecordSelect,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
    }

    return {
      data: records.map(record => mapCustomRecord(record)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getCustomRecordById(id: string, options?: { user?: User | null }): Promise<CustomRecord> {
    let record: CustomRecordDb | null = null;

    try {
      record = (await prisma.customRecord.findUnique({
        where: { id },
        select: customRecordSelect,
      })) as CustomRecordDb | null;
    } catch (error) {
      if (!isLegacyCustomRecordSchemaError(error)) {
        throw error;
      }

      record = (await prisma.customRecord.findUnique({
        where: { id },
        select: legacyCustomRecordSelect,
      })) as CustomRecordDb | null;
    }

    if (!record) throw new Error('Record not found');

    if (
      !canUserAccessVisibility(
        options?.user,
        record.visibilityScope,
        record.assignedBrokerId || record.createdByBrokerId
      )
    ) {
      throw new Error('Forbidden: cross-broker access denied');
    }

    return mapCustomRecord(record);
  }

  async createCustomRecord(
    data: CreateCustomRecordInput,
    options?: { user?: User | null }
  ): Promise<CustomRecord> {
    const entityType = normalizeEntityType(data.entityType.trim());
    const assignedBrokerId = await resolveBrokerIdFromCustomRecordInput(data, options?.user);
    const visibilityScope: VisibilityScope = isPrivateCustomRecord(entityType)
      ? 'private'
      : data.visibilityScope || 'shared';
    const moduleType =
      normalizeModuleScope(data.moduleType) ||
      normalizeModuleScope(String(toPayload(data.payload).moduleType || '')) ||
      normalizeModuleScope(options?.user?.department) ||
      undefined;

    const created = await prisma.$transaction(async tx => {
      let record: CustomRecordDb;
      try {
        record = (await tx.customRecord.create({
          data: {
            entityType,
            name: data.name.trim(),
            status: data.status?.trim() || null,
            category: data.category?.trim() || null,
            referenceId: data.referenceId?.trim() || null,
            createdByUserId: options?.user?.id || null,
            createdByBrokerId: getEffectiveBrokerId(options?.user) || null,
            assignedBrokerId: assignedBrokerId || null,
            moduleType: moduleType || null,
            visibilityScope,
            payload: (data.payload ?? {}) as Prisma.InputJsonValue,
          },
          select: customRecordSelect,
        })) as CustomRecordDb;
      } catch (error) {
        if (!isLegacyCustomRecordSchemaError(error)) {
          throw error;
        }

        record = (await tx.customRecord.create({
          data: buildLegacyCustomRecordMutationData({
            entityType,
            name: data.name.trim(),
            status: data.status?.trim() || null,
            category: data.category?.trim() || null,
            referenceId: data.referenceId?.trim() || null,
            payload: (data.payload ?? {}) as Prisma.InputJsonValue,
          }),
          select: legacyCustomRecordSelect,
        })) as CustomRecordDb;
      }

      const mappedRecord = mapCustomRecord(record as NonNullable<CustomRecordDb>);
      await auditLogService.recordWithClient(tx, {
        action: `${entityType}_created`,
        entityType,
        entityId: record.id,
        description: `${prettify(entityType)} "${record.name}" created`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: assignedBrokerId || null,
        visibilityScope,
        nextValues: buildAuditPayload(mappedRecord),
        metadata: {
          category: record.category,
          status: record.status,
          moduleType: record.moduleType,
        },
        notification: {
          title: `${prettify(entityType)} Created`,
          message: `${prettify(entityType)} "${record.name}" created`,
          type: `${entityType}_created`,
          payload: {
            entityType,
            entityId: record.id,
            brokerId: assignedBrokerId || null,
          },
        },
      });

      return mappedRecord;
    });

    return created;
  }

  async updateCustomRecord(
    id: string,
    data: UpdateCustomRecordInput,
    options?: { user?: User | null }
  ): Promise<CustomRecord> {
    let existing: CustomRecordDb | null = null;
    try {
      existing = (await prisma.customRecord.findUnique({
        where: { id },
        select: customRecordSelect,
      })) as CustomRecordDb | null;
    } catch (error) {
      if (!isLegacyCustomRecordSchemaError(error)) {
        throw error;
      }

      existing = (await prisma.customRecord.findUnique({
        where: { id },
        select: legacyCustomRecordSelect,
      })) as CustomRecordDb | null;
    }

    if (!existing) throw new Error('Record not found');

    if (
      !canUserAccessVisibility(
        options?.user,
        existing.visibilityScope,
        existing.assignedBrokerId || existing.createdByBrokerId
      )
    ) {
      throw new Error('Forbidden: cross-broker access denied');
    }

    const existingMapped = mapCustomRecord(existing as NonNullable<CustomRecordDb>);
    const entityType = normalizeEntityType(data.entityType || existing.entityType);
    const assignedBrokerId =
      (await resolveBrokerIdFromCustomRecordInput(data, options?.user)) ||
      existing.assignedBrokerId ||
      undefined;
    const visibilityScope: VisibilityScope = isPrivateCustomRecord(entityType)
      ? 'private'
      : data.visibilityScope || (existing.visibilityScope as VisibilityScope) || 'shared';
    const moduleType =
      normalizeModuleScope(data.moduleType) ||
      normalizeModuleScope(String(toPayload(data.payload).moduleType || '')) ||
      (existing.moduleType as CustomRecord['moduleType']) ||
      undefined;

    const updated = await prisma.$transaction(async tx => {
      let record: CustomRecordDb;
      try {
        record = (await tx.customRecord.update({
          where: { id },
          data: {
            entityType,
            name: data.name?.trim(),
            status: data.status === undefined ? undefined : data.status?.trim() || null,
            category: data.category === undefined ? undefined : data.category?.trim() || null,
            referenceId:
              data.referenceId === undefined ? undefined : data.referenceId?.trim() || null,
            assignedBrokerId: assignedBrokerId || null,
            moduleType: moduleType || null,
            visibilityScope,
            payload:
              data.payload === undefined ? undefined : (data.payload as Prisma.InputJsonValue),
          },
          select: customRecordSelect,
        })) as CustomRecordDb;
      } catch (error) {
        if (!isLegacyCustomRecordSchemaError(error)) {
          throw error;
        }

        record = (await tx.customRecord.update({
          where: { id },
          data: {
            entityType,
            name: data.name?.trim(),
            status: data.status === undefined ? undefined : data.status?.trim() || null,
            category: data.category === undefined ? undefined : data.category?.trim() || null,
            referenceId:
              data.referenceId === undefined ? undefined : data.referenceId?.trim() || null,
            payload:
              data.payload === undefined ? undefined : (data.payload as Prisma.InputJsonValue),
          },
          select: legacyCustomRecordSelect,
        })) as CustomRecordDb;
      }

      const mappedRecord = mapCustomRecord(record as NonNullable<CustomRecordDb>);
      await auditLogService.recordWithClient(tx, {
        action: `${entityType}_updated`,
        entityType,
        entityId: record.id,
        description: `${prettify(entityType)} "${record.name}" updated`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: assignedBrokerId || existing.assignedBrokerId || null,
        visibilityScope,
        previousValues: buildAuditPayload(existingMapped),
        nextValues: buildAuditPayload(mappedRecord),
        metadata: {
          category: record.category,
          status: record.status,
          moduleType: record.moduleType,
        },
        notification: {
          title: `${prettify(entityType)} Updated`,
          message: `${prettify(entityType)} "${record.name}" updated`,
          type: `${entityType}_updated`,
          payload: {
            entityType,
            entityId: record.id,
            brokerId: assignedBrokerId || existing.assignedBrokerId || null,
          },
        },
      });

      return mappedRecord;
    });

    return updated;
  }

  async deleteCustomRecord(id: string, options?: { user?: User | null }): Promise<void> {
    let existing: CustomRecordDb | null = null;
    try {
      existing = (await prisma.customRecord.findUnique({
        where: { id },
        select: customRecordSelect,
      })) as CustomRecordDb | null;
    } catch (error) {
      if (!isLegacyCustomRecordSchemaError(error)) {
        throw error;
      }

      existing = (await prisma.customRecord.findUnique({
        where: { id },
        select: legacyCustomRecordSelect,
      })) as CustomRecordDb | null;
    }

    if (!existing) throw new Error('Record not found');

    if (
      !canUserAccessVisibility(
        options?.user,
        existing.visibilityScope,
        existing.assignedBrokerId || existing.createdByBrokerId
      )
    ) {
      throw new Error('Forbidden: cross-broker access denied');
    }

    const existingMapped = mapCustomRecord(existing as NonNullable<CustomRecordDb>);
    const entityType = normalizeEntityType(existing.entityType);

    await prisma.$transaction(async tx => {
      await tx.customRecord.delete({
        where: { id },
        select: { id: true },
      });

      await auditLogService.recordWithClient(tx, {
        action: `${entityType}_deleted`,
        entityType,
        entityId: id,
        description: `${prettify(entityType)} "${existing.name}" deleted`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: existing.assignedBrokerId || existing.createdByBrokerId || null,
        visibilityScope:
          String(existing.visibilityScope || '').trim().toLowerCase() === 'private'
            ? 'private'
            : 'shared',
        previousValues: buildAuditPayload(existingMapped),
        metadata: {
          category: existing.category,
          status: existing.status,
          moduleType: existing.moduleType,
        },
        notification: {
          title: `${prettify(entityType)} Deleted`,
          message: `${prettify(entityType)} "${existing.name}" deleted`,
          type: `${entityType}_deleted`,
          payload: {
            entityType,
            entityId: id,
            brokerId: existing.assignedBrokerId || existing.createdByBrokerId || null,
          },
        },
      });
    });
  }
}

export const customRecordService = new CustomRecordService();
