import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { VisibilityScope } from '@/types';
import { emitScopedEvent } from '@/realtime';

export interface AuditLogEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  description?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  brokerId?: string | null;
  visibilityScope?: VisibilityScope;
  previousValues?: Record<string, unknown> | null;
  nextValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  notification?: {
    title?: string | null;
    message: string;
    type?: string | null;
    payload?: Record<string, unknown> | null;
  } | null;
}

type PrismaLike = Prisma.TransactionClient | typeof prisma;

function toJson(
  value: Record<string, unknown> | null | undefined
): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  return value as Prisma.InputJsonValue;
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

class AuditLogService {
  private async resolveActorUserId(
    client: PrismaLike,
    actorUserId?: string | null
  ): Promise<string | null> {
    const normalizedActorUserId = String(actorUserId || '').trim();
    if (!normalizedActorUserId) return null;

    try {
      const existingUser = await client.user.findUnique({
        where: { id: normalizedActorUserId },
        select: { id: true },
      });
      return existingUser?.id || null;
    } catch {
      return null;
    }
  }

  private async buildCreateInput(client: PrismaLike, entry: AuditLogEntry) {
    const actorUserId = await this.resolveActorUserId(client, entry.actorUserId);

    return {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId || null,
      description: entry.description || '',
      actorUserId,
      actorName: entry.actorName || null,
      actorEmail: entry.actorEmail || null,
      actorRole: entry.actorRole || null,
      brokerId: entry.brokerId || null,
      visibilityScope: entry.visibilityScope || 'shared',
      previousValues: toJson(entry.previousValues),
      nextValues: toJson(entry.nextValues),
      metadata: toJson(entry.metadata),
    };
  }

  private async createNotification(
    client: PrismaLike,
    auditLogId: string,
    actorUserId: string | null,
    entry: AuditLogEntry
  ): Promise<void> {
    if (!entry.notification?.message) {
      return;
    }

    const notification = await client.notification.create({
      data: {
        activityId: auditLogId,
        actorUserId,
        actorName: entry.actorName || null,
        actorRole: entry.actorRole || null,
        title: entry.notification.title || entry.description || entry.action,
        message: entry.notification.message,
        type: entry.notification.type || entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId || null,
        brokerId: entry.brokerId || null,
        visibilityScope: entry.visibilityScope || 'shared',
        payload: toJson(entry.notification.payload),
      },
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        entityType: true,
        entityId: true,
        brokerId: true,
        visibilityScope: true,
        payload: true,
        sound: true,
        read: true,
        createdAt: true,
      },
    });

    const visibilityScope =
      String(notification.visibilityScope || '').trim().toLowerCase() === 'private'
        ? 'private'
        : 'shared';
    const payload = toObject(notification.payload);
    const createdAtIso = notification.createdAt.toISOString();
    const payloadDealId = String(payload.dealId || '').trim();
    const dealId =
      payloadDealId || (notification.entityType === 'deal' ? String(notification.entityId || '') : '');

    const realtimePayload = {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      entityType: notification.entityType,
      entityId: notification.entityId,
      dealId: dealId || undefined,
      brokerId: notification.brokerId,
      sound: Boolean(notification.sound),
      read: Boolean(notification.read),
      visibilityScope,
      payload,
      createdAt: createdAtIso,
      timestamp: createdAtIso,
    };

    try {
      emitScopedEvent({
        event: 'notification',
        payload: realtimePayload,
        brokerId: visibilityScope === 'private' ? notification.brokerId : null,
        roles: visibilityScope === 'shared' ? ['broker'] : undefined,
        includePrivileged: true,
      });
      emitScopedEvent({
        event: 'notification:created',
        payload: realtimePayload,
        brokerId: visibilityScope === 'private' ? notification.brokerId : null,
        roles: visibilityScope === 'shared' ? ['broker'] : undefined,
        includePrivileged: true,
      });
    } catch {
      console.warn('Realtime not initialized - skipping notification emit');
    }
  }

  async record(entry: AuditLogEntry): Promise<void> {
    try {
      await this.recordStrict(entry);
    } catch (error) {
      console.warn('Failed to write audit log:', error);
    }
  }

  async recordWithClient(client: PrismaLike, entry: AuditLogEntry): Promise<void> {
    try {
      await this.recordStrictWithClient(client, entry);
    } catch (error) {
      console.warn('Failed to write audit log in transaction:', error);
    }
  }

  async recordStrict(entry: AuditLogEntry): Promise<void> {
    await this.recordStrictWithClient(prisma, entry);
  }

  async recordStrictWithClient(client: PrismaLike, entry: AuditLogEntry): Promise<void> {
    const actorUserId = await this.resolveActorUserId(client, entry.actorUserId);
    const created = await client.auditLog.create({
      data: await this.buildCreateInput(client, entry),
    });
    await this.createNotification(client, created.id, actorUserId, entry);
  }

  async list(params: {
    entityType?: string;
    entityId?: string;
    action?: string;
    actorUserId?: string;
    brokerId?: string;
    search?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }): Promise<{
    data: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(params.limit) || 50));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};
    if (params.entityType) where.entityType = params.entityType;
    if (params.entityId) where.entityId = params.entityId;
    if (params.action) where.action = { contains: params.action, mode: 'insensitive' };
    if (params.actorUserId) where.actorUserId = params.actorUserId;
    if (params.brokerId) where.brokerId = params.brokerId;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }
    if (params.search) {
      where.OR = [
        { description: { contains: params.search, mode: 'insensitive' } },
        { actorName: { contains: params.search, mode: 'insensitive' } },
        { actorEmail: { contains: params.search, mode: 'insensitive' } },
        { action: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        description: row.description,
        actorUserId: row.actorUserId,
        actorName: row.actorName,
        actorEmail: row.actorEmail,
        actorRole: row.actorRole,
        brokerId: row.brokerId,
        visibilityScope: row.visibilityScope,
        previousValues: row.previousValues,
        nextValues: row.nextValues,
        metadata: row.metadata,
        createdAt: row.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}

export const auditLogService = new AuditLogService();
