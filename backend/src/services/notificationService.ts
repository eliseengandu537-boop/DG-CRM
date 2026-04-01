import { prisma } from '@/lib/prisma';
import { NotificationRecord, PaginatedResponse, User } from '@/types';
import { buildVisibilityWhere, canUserAccessVisibility } from '@/lib/visibilityScope';

type NotificationDb = Awaited<ReturnType<typeof prisma.notification.findFirst>>;

export interface NotificationFilters {
  entityType?: string;
  type?: string;
  brokerId?: string;
  userId?: string;
  read?: boolean;
  page?: number;
  limit?: number;
}

export interface NotificationListResult extends PaginatedResponse<NotificationRecord> {
  unreadCount: number;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mapNotification(record: NonNullable<NotificationDb>): NotificationRecord {
  return {
    id: record.id,
    activityId: record.activityId ?? undefined,
    actorUserId: record.actorUserId ?? undefined,
    actorName: record.actorName ?? undefined,
    actorRole: record.actorRole ?? undefined,
    title: record.title,
    message: record.message,
    type: record.type,
    entityType: record.entityType,
    entityId: record.entityId ?? undefined,
    brokerId: record.brokerId ?? undefined,
    sound: Boolean((record as any).sound),
    read: Boolean((record as any).read),
    visibilityScope:
      String(record.visibilityScope || '').trim().toLowerCase() === 'private'
        ? 'private'
        : 'shared',
    payload: toObject(record.payload),
    createdAt: record.createdAt,
  };
}

function combineWhere(baseWhere: Record<string, unknown>, extraWhere: Record<string, unknown>) {
  if (Object.keys(baseWhere).length === 0) return extraWhere;
  if (Object.keys(extraWhere).length === 0) return baseWhere;
  return {
    AND: [baseWhere, extraWhere],
  };
}

function normalizeRequestedUserId(userId: unknown, currentUser?: User | null): string | null {
  const normalized = String(userId || '').trim();
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  if (lower === 'currentuser' || lower === 'current_user' || lower === 'me') {
    return currentUser?.id || null;
  }

  return normalized;
}

class NotificationService {
  private async resolveBrokerIdForUser(userId: string): Promise<string | null> {
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        email: true,
      },
    });

    if (!targetUser || targetUser.role !== 'broker') {
      return null;
    }

    const normalizedEmail = String(targetUser.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return targetUser.id;
    }

    const brokerProfile = await prisma.broker.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    return brokerProfile?.id || targetUser.id;
  }

  async getNotifications(
    filters?: NotificationFilters,
    user?: User | null
  ): Promise<NotificationListResult> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 25;
    const where: Record<string, unknown> = {};

    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.type) where.type = filters.type;
    if (filters?.brokerId) where.brokerId = filters.brokerId;
    if (typeof filters?.read === 'boolean') where.read = filters.read;

    const requestedUserId = normalizeRequestedUserId(filters?.userId, user);
    if (filters?.userId && !requestedUserId) {
      throw new Error('Invalid userId filter');
    }

    if (requestedUserId) {
      const role = String(user?.role || '').trim().toLowerCase();
      const canQueryOtherUsers = role === 'admin' || role === 'manager';
      const isSelfQuery = requestedUserId === user?.id;
      if (!canQueryOtherUsers && !isSelfQuery) {
        throw new Error('Forbidden: cross-user notification access denied');
      }

      if (canQueryOtherUsers && !isSelfQuery && !filters?.brokerId) {
        const targetBrokerId = await this.resolveBrokerIdForUser(requestedUserId);
        if (targetBrokerId) {
          where.brokerId = targetBrokerId;
        }
      }
    }

    const visibilityWhere = buildVisibilityWhere(user);
    const scopedWhere = combineWhere(where, visibilityWhere);
    const unreadWhere = combineWhere(scopedWhere, { read: false });

    const [total, unreadCount, records] = await prisma.$transaction([
      prisma.notification.count({ where: scopedWhere }),
      prisma.notification.count({ where: unreadWhere }),
      prisma.notification.findMany({
        where: scopedWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: records.map(record => mapNotification(record as NonNullable<NotificationDb>)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      unreadCount,
    };
  }

  async getNotificationById(id: string, user?: User | null): Promise<NotificationRecord> {
    const record = await prisma.notification.findUnique({ where: { id } });
    if (!record) {
      throw new Error('Notification not found');
    }

    if (!canUserAccessVisibility(user, record.visibilityScope, record.brokerId)) {
      throw new Error('Forbidden: cross-broker notification access denied');
    }

    return mapNotification(record as NonNullable<NotificationDb>);
  }

  async markNotificationRead(id: string, user?: User | null): Promise<NotificationRecord> {
    const existing = await prisma.notification.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Notification not found');
    }

    if (!canUserAccessVisibility(user, existing.visibilityScope, existing.brokerId)) {
      throw new Error('Forbidden: cross-broker notification access denied');
    }

    if (existing.read) {
      return mapNotification(existing as NonNullable<NotificationDb>);
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    return mapNotification(updated as NonNullable<NotificationDb>);
  }
}

export const notificationService = new NotificationService();
