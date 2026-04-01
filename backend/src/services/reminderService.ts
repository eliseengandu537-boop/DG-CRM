import { PaginatedResponse, Reminder, User } from '@/types';
import { CreateReminderInput, UpdateReminderInput } from '@/validators';
import { prisma } from '@/lib/prisma';
import { auditLogService } from '@/services/auditLogService';
import { canAccessPrivateBrokerData } from '@/lib/departmentAccess';

type ReminderRecord = Awaited<ReturnType<typeof prisma.reminder.findFirst>> & {
  deal?: { id: string; title: string } | null;
  broker?: { id: string; name: string } | null;
};

export interface ReminderFilters {
  page?: number;
  limit?: number;
  status?: Reminder['status'];
  reminderType?: Reminder['reminderType'];
  priority?: Reminder['priority'];
  dealId?: string;
  brokerId?: string;
  from?: string;
  to?: string;
}

export interface ReminderScope {
  role: User['role'];
  userId: string;
  brokerId?: string | null;
  userName?: string;
  userEmail?: string;
}

function mapReminder(record: NonNullable<ReminderRecord>): Reminder {
  return {
    id: record.id,
    title: record.title,
    description: record.description ?? undefined,
    reminderType: record.reminderType as Reminder['reminderType'],
    dueAt: record.dueAt,
    status: record.status as Reminder['status'],
    priority: record.priority as Reminder['priority'],
    dealId: record.dealId ?? undefined,
    brokerId: record.brokerId ?? undefined,
    assignedUserId: record.assignedUserId ?? undefined,
    assignedToRole: (record.assignedToRole as Reminder['assignedToRole']) ?? undefined,
    contactName: record.contactName ?? undefined,
    contactEmail: record.contactEmail ?? undefined,
    contactPhone: record.contactPhone ?? undefined,
    createdByUserId: record.createdByUserId ?? undefined,
    createdByName: record.createdByName ?? undefined,
    createdByEmail: record.createdByEmail ?? undefined,
    completedAt: record.completedAt ?? undefined,
    dealTitle: record.deal?.title ?? undefined,
    brokerName: record.broker?.name ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildAuditSnapshot(record: Reminder): Record<string, unknown> {
  return {
    title: record.title,
    status: record.status,
    priority: record.priority,
    reminderType: record.reminderType,
    dueAt: record.dueAt.toISOString(),
    dealId: record.dealId ?? null,
    brokerId: record.brokerId ?? null,
    assignedUserId: record.assignedUserId ?? null,
    assignedToRole: record.assignedToRole ?? null,
    contactName: record.contactName ?? null,
  };
}

function parseDateOrThrow(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return parsed;
}

function applyScope(where: any, scope: ReminderScope) {
  if (scope.role !== 'broker') {
    return;
  }

  const effectiveBrokerId = scope.brokerId || scope.userId;
  const scoped = {
    OR: [
      { brokerId: effectiveBrokerId },
      { assignedUserId: scope.userId },
      { createdByUserId: scope.userId },
    ],
  };

  if (where.AND) {
    where.AND = Array.isArray(where.AND) ? [...where.AND, scoped] : [where.AND, scoped];
    return;
  }

  where.AND = [scoped];
}

function canAccessReminder(record: ReminderRecord, scope: ReminderScope): boolean {
  if (!record) return false;
  if (scope.role === 'admin' || scope.role === 'manager') {
    return true;
  }

  return canAccessPrivateBrokerData(
    {
      role: scope.role,
      brokerId: scope.brokerId,
      id: scope.userId,
    },
    record.brokerId
  );
}

export class ReminderService {
  async getAllReminders(
    filters: ReminderFilters,
    scope: ReminderScope
  ): Promise<PaginatedResponse<Reminder>> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const where: any = {};

    if (filters.status) where.status = filters.status;
    if (filters.reminderType) where.reminderType = filters.reminderType;
    if (filters.priority) where.priority = filters.priority;
    if (filters.dealId) where.dealId = filters.dealId;
    if (filters.brokerId) where.brokerId = filters.brokerId;

    if (filters.from || filters.to) {
      where.dueAt = {};
      if (filters.from) where.dueAt.gte = parseDateOrThrow(filters.from, 'from date');
      if (filters.to) where.dueAt.lte = parseDateOrThrow(filters.to, 'to date');
    }

    applyScope(where, scope);

    const [total, reminders] = await prisma.$transaction([
      prisma.reminder.count({ where }),
      prisma.reminder.findMany({
        where,
        include: {
          deal: { select: { id: true, title: true } },
          broker: { select: { id: true, name: true } },
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: reminders.map(reminder => mapReminder(reminder as NonNullable<ReminderRecord>)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getReminderById(id: string, scope: ReminderScope): Promise<Reminder> {
    const reminder = await prisma.reminder.findUnique({
      where: { id },
      include: {
        deal: { select: { id: true, title: true } },
        broker: { select: { id: true, name: true } },
      },
    });

    if (!reminder) throw new Error('Reminder not found');
    if (!canAccessReminder(reminder as ReminderRecord, scope)) {
      throw new Error('Forbidden: cross-broker access denied');
    }

    return mapReminder(reminder as NonNullable<ReminderRecord>);
  }

  async createReminder(data: CreateReminderInput, scope: ReminderScope): Promise<Reminder> {
    const dueAt = parseDateOrThrow(data.dueAt, 'dueAt');
    const effectiveBrokerId = scope.brokerId || scope.userId;

    let dealBrokerId: string | null = null;
    if (data.dealId) {
      const deal = await prisma.deal.findUnique({
        where: { id: data.dealId },
        select: { id: true, brokerId: true },
      });
      if (!deal) throw new Error('Linked deal not found');
      dealBrokerId = deal.brokerId;
      if (scope.role === 'broker' && dealBrokerId !== effectiveBrokerId) {
        throw new Error('Forbidden: cannot create reminder for another broker deal');
      }
    }

    let nextBrokerId = data.brokerId || dealBrokerId || undefined;
    if (scope.role === 'broker') {
      nextBrokerId = effectiveBrokerId;
    }

    if (nextBrokerId) {
      const broker = await prisma.broker.findUnique({
        where: { id: nextBrokerId },
        select: { id: true, status: true },
      });
      if (!broker) throw new Error('Assigned broker not found');
      if (broker.status === 'archived') throw new Error('Assigned broker is archived');
    }

    const defaultAssignedRole =
      scope.role === 'admin' || scope.role === 'manager' ? scope.role : undefined;
    const assignedToRole =
      scope.role === 'broker' ? 'broker' : data.assignedToRole ?? defaultAssignedRole;

    const reminder = await prisma.$transaction(async tx => {
      const record = await tx.reminder.create({
        data: {
          title: data.title,
          description: data.description,
          reminderType: data.reminderType,
          dueAt,
          status: scope.role === 'broker' ? 'pending' : data.status,
          priority: data.priority,
          dealId: data.dealId,
          brokerId: nextBrokerId,
          assignedUserId: scope.role === 'broker' ? scope.userId : data.assignedUserId,
          assignedToRole,
          contactName: data.contactName,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          createdByUserId: scope.userId,
          createdByName: scope.userName,
          createdByEmail: scope.userEmail,
          completedAt: data.status === 'completed' ? new Date() : null,
        },
        include: {
          deal: { select: { id: true, title: true } },
          broker: { select: { id: true, name: true } },
        },
      });

      const mapped = mapReminder(record as NonNullable<ReminderRecord>);
      await auditLogService.recordWithClient(tx, {
        action: 'reminder_created',
        entityType: 'reminder',
        entityId: record.id,
        description: `Reminder "${record.title}" created`,
        actorUserId: scope.userId,
        actorName: scope.userName,
        actorEmail: scope.userEmail,
        actorRole: scope.role,
        brokerId: nextBrokerId || null,
        visibilityScope: 'private',
        nextValues: buildAuditSnapshot(mapped),
        metadata: {
          dealId: record.dealId,
          brokerId: record.brokerId,
          assignedToRole,
        },
        notification: {
          title: 'Reminder Created',
          message: `Reminder "${record.title}" created`,
          type: 'reminder_created',
          payload: {
            reminderId: record.id,
            brokerId: nextBrokerId || null,
          },
        },
      });

      return mapped;
    });

    return reminder;
  }

  async updateReminder(
    id: string,
    data: UpdateReminderInput,
    scope: ReminderScope
  ): Promise<Reminder> {
    const existing = await prisma.reminder.findUnique({
      where: { id },
      include: {
        deal: { select: { id: true, title: true } },
        broker: { select: { id: true, name: true } },
      },
    });
    if (!existing) throw new Error('Reminder not found');
    if (!canAccessReminder(existing as ReminderRecord, scope)) {
      throw new Error('Forbidden: cross-broker access denied');
    }

    const effectiveBrokerId = scope.brokerId || scope.userId;

    let dealId = data.dealId ?? existing.dealId ?? undefined;
    let brokerId = data.brokerId ?? existing.brokerId ?? undefined;

    if (scope.role === 'broker') {
      brokerId = effectiveBrokerId;
      dealId = data.dealId === undefined ? existing.dealId ?? undefined : data.dealId;
    }

    if (dealId) {
      const deal = await prisma.deal.findUnique({
        where: { id: dealId },
        select: { id: true, brokerId: true },
      });
      if (!deal) throw new Error('Linked deal not found');
      if (scope.role === 'broker' && deal.brokerId !== effectiveBrokerId) {
        throw new Error('Forbidden: cannot link another broker deal');
      }
      if (!brokerId) brokerId = deal.brokerId;
    }

    if (brokerId) {
      const broker = await prisma.broker.findUnique({
        where: { id: brokerId },
        select: { id: true, status: true },
      });
      if (!broker) throw new Error('Assigned broker not found');
      if (broker.status === 'archived') throw new Error('Assigned broker is archived');
    }

    const nextStatus = (scope.role === 'broker'
      ? data.status ?? existing.status
      : data.status ?? existing.status) as Reminder['status'];

    const existingMapped = mapReminder(existing as NonNullable<ReminderRecord>);
    const updated = await prisma.$transaction(async tx => {
      const record = await tx.reminder.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          reminderType: data.reminderType,
          dueAt: data.dueAt ? parseDateOrThrow(data.dueAt, 'dueAt') : undefined,
          status: nextStatus,
          priority: data.priority,
          dealId,
          brokerId,
          assignedUserId: scope.role === 'broker' ? scope.userId : data.assignedUserId,
          assignedToRole: scope.role === 'broker' ? 'broker' : data.assignedToRole,
          contactName: data.contactName,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          completedAt:
            nextStatus === 'completed'
              ? existing.completedAt || new Date()
              : data.status && data.status !== 'completed'
              ? null
              : existing.completedAt,
        },
        include: {
          deal: { select: { id: true, title: true } },
          broker: { select: { id: true, name: true } },
        },
      });

      const mapped = mapReminder(record as NonNullable<ReminderRecord>);
      await auditLogService.recordWithClient(tx, {
        action:
          String(existing.status || '').trim() !== String(record.status || '').trim()
            ? 'reminder_status_changed'
            : 'reminder_updated',
        entityType: 'reminder',
        entityId: record.id,
        description: `Reminder "${record.title}" updated`,
        actorUserId: scope.userId,
        actorName: scope.userName,
        actorEmail: scope.userEmail,
        actorRole: scope.role,
        brokerId: brokerId || existing.brokerId || null,
        visibilityScope: 'private',
        previousValues: buildAuditSnapshot(existingMapped),
        nextValues: buildAuditSnapshot(mapped),
        metadata: {
          dealId: record.dealId,
          brokerId: record.brokerId,
          assignedToRole: record.assignedToRole,
        },
        notification: {
          title:
            String(existing.status || '').trim() !== String(record.status || '').trim()
              ? 'Reminder Status Changed'
              : 'Reminder Updated',
          message: `Reminder "${record.title}" updated`,
          type:
            String(existing.status || '').trim() !== String(record.status || '').trim()
              ? 'reminder_status_changed'
              : 'reminder_updated',
          payload: {
            reminderId: record.id,
            brokerId: brokerId || existing.brokerId || null,
          },
        },
      });

      return mapped;
    });

    return updated;
  }

  async markReminderCompleted(id: string, scope: ReminderScope): Promise<Reminder> {
    return this.updateReminder(
      id,
      {
        status: 'completed',
      },
      scope
    );
  }

  async deleteReminder(id: string, scope: ReminderScope): Promise<void> {
    const existing = await prisma.reminder.findUnique({
      where: { id },
      include: {
        deal: { select: { id: true, title: true } },
        broker: { select: { id: true, name: true } },
      },
    });
    if (!existing) throw new Error('Reminder not found');
    if (!canAccessReminder(existing as ReminderRecord, scope)) {
      throw new Error('Forbidden: cross-broker access denied');
    }

    const existingMapped = mapReminder(existing as NonNullable<ReminderRecord>);
    await prisma.$transaction(async tx => {
      await tx.reminder.delete({ where: { id } });

      await auditLogService.recordWithClient(tx, {
        action: 'reminder_deleted',
        entityType: 'reminder',
        entityId: id,
        description: `Reminder "${existing.title}" deleted`,
        actorUserId: scope.userId,
        actorName: scope.userName,
        actorEmail: scope.userEmail,
        actorRole: scope.role,
        brokerId: existing.brokerId || null,
        visibilityScope: 'private',
        previousValues: buildAuditSnapshot(existingMapped),
        metadata: {
          dealId: existing.dealId,
          brokerId: existing.brokerId,
          assignedToRole: existing.assignedToRole,
        },
        notification: {
          title: 'Reminder Deleted',
          message: `Reminder "${existing.title}" deleted`,
          type: 'reminder_deleted',
          payload: {
            reminderId: id,
            brokerId: existing.brokerId || null,
          },
        },
      });
    });
  }
}

export const reminderService = new ReminderService();
