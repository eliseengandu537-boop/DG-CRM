import { prisma } from '@/lib/prisma';
import { User, ActivityRecord, PaginatedResponse } from '@/types';
import { buildVisibilityWhere, canUserAccessVisibility } from '@/lib/visibilityScope';

type AuditLogRecord = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  description?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  brokerId?: string | null;
  visibilityScope?: string | null;
  previousValues?: unknown;
  nextValues?: unknown;
  metadata?: unknown;
  createdAt: Date;
  actorUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  notification?: {
    id: string;
  } | null;
};

const auditActorUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

const auditLogSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  description: true,
  actorUserId: true,
  actorName: true,
  actorEmail: true,
  actorRole: true,
  brokerId: true,
  visibilityScope: true,
  previousValues: true,
  nextValues: true,
  metadata: true,
  createdAt: true,
  actorUser: {
    select: auditActorUserSelect,
  },
  notification: {
    select: { id: true },
  },
} as const;

const legacyAuditLogSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  actorUserId: true,
  actorName: true,
  actorEmail: true,
  actorRole: true,
  metadata: true,
  createdAt: true,
  actorUser: {
    select: auditActorUserSelect,
  },
} as const;

export interface ActivityFilters {
  action?: string;
  entityType?: string;
  entityId?: string;
  brokerId?: string;
  page?: number;
  limit?: number;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function prettifyToken(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function isLegacyAuditLogSchemaError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase();

  return (
    message.includes('auditlog') &&
    message.includes('does not exist') &&
    ['description', 'broker_id', 'visibility_scope', 'previous_values', 'next_values'].some(
      column => message.includes(column)
    )
  );
}

function buildActivityWhere(filters?: ActivityFilters, includeBrokerId = true): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters?.action) where.action = filters.action;
  if (filters?.entityType) where.entityType = filters.entityType;
  if (filters?.entityId) where.entityId = filters.entityId;
  if (includeBrokerId && filters?.brokerId) where.brokerId = filters.brokerId;

  return where;
}

function fallbackDescription(record: AuditLogRecord): string {
  if (String(record.description || '').trim()) {
    return String(record.description).trim();
  }

  const entityLabel = prettifyToken(record.entityType || 'record').toLowerCase();
  const actionLabel = prettifyToken(record.action || 'updated').toLowerCase();
  return `${entityLabel} ${actionLabel}`.trim();
}

function mapActivity(record: AuditLogRecord): ActivityRecord {
  return {
    id: record.id,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId ?? undefined,
    description: fallbackDescription(record),
    actorUserId: record.actorUserId ?? undefined,
    actorName: record.actorName ?? record.actorUser?.name ?? undefined,
    actorEmail: record.actorEmail ?? record.actorUser?.email ?? undefined,
    actorRole: record.actorRole ?? (record.actorUser?.role as User['role']) ?? undefined,
    actorDisplayName: record.actorName ?? record.actorUser?.name ?? 'System',
    brokerId: record.brokerId ?? undefined,
    visibilityScope:
      String(record.visibilityScope || '').trim().toLowerCase() === 'private'
        ? 'private'
        : 'shared',
    previousValues: toObject(record.previousValues),
    nextValues: toObject(record.nextValues),
    metadata: toObject(record.metadata),
    createdAt: record.createdAt,
  };
}

function extractRelatedEntity(record: ActivityRecord) {
  const metadata = record.metadata || {};
  const keys: Array<[string, string]> = [
    ['dealId', 'deal'],
    ['leadId', 'lead'],
    ['propertyId', 'property'],
    ['stockId', 'stock'],
    ['contactId', 'contact'],
    ['forecastDealId', 'forecast-deal'],
    ['brokerId', 'broker'],
  ];

  for (const [key, entityType] of keys) {
    const value = String(metadata[key] || '').trim();
    if (value) {
      return {
        entityType,
        entityId: value,
      };
    }
  }

  return record.entityId
    ? {
        entityType: record.entityType,
        entityId: record.entityId,
      }
    : null;
}

class ActivityService {
  async getActivities(
    filters?: ActivityFilters,
    user?: User | null
  ): Promise<PaginatedResponse<ActivityRecord>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 25;
    const where = buildActivityWhere(filters);

    const visibilityWhere = buildVisibilityWhere(user);
    const scopedWhere =
      Object.keys(visibilityWhere).length === 0
        ? where
        : Object.keys(where).length === 0
        ? visibilityWhere
        : { AND: [where, visibilityWhere] };

    let total = 0;
    let records: AuditLogRecord[] = [];

    try {
      [total, records] = await prisma.$transaction([
        prisma.auditLog.count({ where: scopedWhere }),
        prisma.auditLog.findMany({
          where: scopedWhere,
          select: auditLogSelect,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
    } catch (error) {
      if (!isLegacyAuditLogSchemaError(error)) {
        throw error;
      }

      const legacyWhere = buildActivityWhere(filters, false);
      [total, records] = await prisma.$transaction([
        prisma.auditLog.count({ where: legacyWhere }),
        prisma.auditLog.findMany({
          where: legacyWhere,
          select: legacyAuditLogSelect,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
    }

    return {
      data: records.map(record => mapActivity(record)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getRecentActivities(user?: User | null, limit = 20): Promise<ActivityRecord[]> {
    const result = await this.getActivities({ page: 1, limit }, user);
    return result.data;
  }

  async getActivityById(id: string, user?: User | null) {
    let record: AuditLogRecord | null = null;

    try {
      record = (await prisma.auditLog.findUnique({
        where: { id },
        select: auditLogSelect,
      })) as AuditLogRecord | null;
    } catch (error) {
      if (!isLegacyAuditLogSchemaError(error)) {
        throw error;
      }

      record = (await prisma.auditLog.findUnique({
        where: { id },
        select: legacyAuditLogSelect,
      })) as AuditLogRecord | null;
    }

    if (!record) {
      throw new Error('Activity not found');
    }

    if (!canUserAccessVisibility(user, record.visibilityScope, record.brokerId)) {
      throw new Error('Forbidden: cross-broker activity access denied');
    }

    const activity = mapActivity(record);
    return {
      ...activity,
      notificationId: record.notification?.id,
      relatedEntity: extractRelatedEntity(activity),
    };
  }

  async deleteActivity(id: string, user?: User | null): Promise<void> {
    const role = String(user?.role || '').trim().toLowerCase();
    if (role !== 'admin') {
      throw new Error('Forbidden: only admin can delete activities');
    }

    const existing = await prisma.auditLog.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new Error('Activity not found');
    }

    await prisma.$transaction(async tx => {
      await tx.notification.deleteMany({
        where: { activityId: id },
      });
      await tx.auditLog.delete({
        where: { id },
      });
    });
  }
}

export const activityService = new ActivityService();
