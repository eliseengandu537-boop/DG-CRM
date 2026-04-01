import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { User } from '@/types';
import { auditLogService } from '@/services/auditLogService';

type PrismaLike = Prisma.TransactionClient | typeof prisma;

export interface DealStatusActivity {
  id: string;
  dealId: string;
  brokerId: string;
  brokerName: string;
  previousStatus: string;
  newStatus: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface RecordDealStatusChangeInput {
  dealId: string;
  dealTitle: string;
  brokerId: string;
  previousStatus: string;
  newStatus: string;
  actor?: User | null;
  source?: string;
  occurredAt?: Date;
  createNotification?: boolean;
}

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function normalizeStatus(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function toObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function buildStatusChangeMessage(actorName: string, previousStatus: string, newStatus: string): string {
  return `${actorName} changed deal from ${previousStatus} to ${newStatus}`;
}

class DealActivityService {
  private async resolveBrokerName(
    client: PrismaLike,
    brokerId: string,
    actor?: User | null
  ): Promise<string> {
    const actorName = normalizeText(actor?.name);
    if (actorName) return actorName;

    const broker = await client.broker.findUnique({
      where: { id: brokerId },
      select: { name: true },
    });

    const assignedBrokerName = normalizeText(broker?.name);
    return assignedBrokerName ? `System (${assignedBrokerName})` : 'System';
  }

  private mapDealActivity(record: {
    id: string;
    dealId: string;
    brokerId: string;
    brokerName: string;
    previousStatus: string;
    newStatus: string;
    createdAt: Date;
    metadata: unknown;
  }): DealStatusActivity {
    return {
      id: record.id,
      dealId: record.dealId,
      brokerId: record.brokerId,
      brokerName: record.brokerName,
      previousStatus: record.previousStatus,
      newStatus: record.newStatus,
      createdAt: record.createdAt,
      metadata: toObject(record.metadata),
    };
  }

  async getDealActivities(dealId: string): Promise<DealStatusActivity[]> {
    const records = await prisma.dealActivity.findMany({
      where: { dealId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(record =>
      this.mapDealActivity({
        id: record.id,
        dealId: record.dealId,
        brokerId: record.brokerId,
        brokerName: record.brokerName,
        previousStatus: record.previousStatus,
        newStatus: record.newStatus,
        createdAt: record.createdAt,
        metadata: record.metadata,
      })
    );
  }

  async touchDealWithClient(
    client: PrismaLike,
    dealId: string,
    touchedAt = new Date()
  ): Promise<void> {
    await client.deal.update({
      where: { id: dealId },
      data: {
        lastActivityAt: touchedAt,
        inactivityNotifiedAt: null,
      },
    });
  }

  async recordStatusChangeWithClient(
    client: PrismaLike,
    input: RecordDealStatusChangeInput
  ): Promise<DealStatusActivity | null> {
    const previousStatus = normalizeText(input.previousStatus);
    const newStatus = normalizeText(input.newStatus);
    if (!previousStatus || !newStatus) return null;
    if (normalizeStatus(previousStatus) === normalizeStatus(newStatus)) {
      return null;
    }

    const dealId = normalizeText(input.dealId);
    const brokerId = normalizeText(input.brokerId);
    const dealTitle = normalizeText(input.dealTitle) || 'Deal';
    if (!dealId || !brokerId) {
      throw new Error('Deal status activity requires dealId and brokerId');
    }

    const occurredAt = input.occurredAt || new Date();
    const actor = input.actor || null;
    const actorBrokerId = normalizeText(actor?.brokerId);
    const actorRole = normalizeText(actor?.role).toLowerCase();
    const timelineBrokerId =
      actorBrokerId || (actorRole === 'broker' ? normalizeText(actor?.id) : '') || brokerId;
    const brokerName = await this.resolveBrokerName(client, brokerId, actor);

    const metadata = {
      source: normalizeText(input.source) || 'deal_status_update',
      actorUserId: normalizeText(actor?.id) || null,
      actorRole: normalizeText(actor?.role) || null,
      actorEmail: normalizeText(actor?.email) || null,
      dealTitle,
    };

    const activity = await client.dealActivity.create({
      data: {
        dealId,
        brokerId: timelineBrokerId,
        brokerName,
        previousStatus,
        newStatus,
        createdAt: occurredAt,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });

    const message = buildStatusChangeMessage(brokerName, previousStatus, newStatus);

    await auditLogService.recordStrictWithClient(client, {
      action: 'deal_status_changed',
      entityType: 'deal',
      entityId: dealId,
      description: message,
      actorUserId: normalizeText(actor?.id) || null,
      actorName: normalizeText(actor?.name) || null,
      actorEmail: normalizeText(actor?.email) || null,
      actorRole: normalizeText(actor?.role) || null,
      brokerId,
      visibilityScope: 'shared',
      previousValues: {
        status: previousStatus,
      },
      nextValues: {
        status: newStatus,
      },
      metadata: {
        dealId,
        dealTitle,
        brokerId,
        previousStatus,
        newStatus,
        source: normalizeText(input.source) || 'deal_status_update',
      },
      notification:
        input.createNotification === false
          ? null
          : {
              title: 'Deal Status Changed',
              message,
              type: 'DEAL_STATUS_CHANGE',
              payload: {
                dealId,
                brokerId,
                previousStatus,
                newStatus,
              },
            },
    });

    return this.mapDealActivity({
      id: activity.id,
      dealId: activity.dealId,
      brokerId: activity.brokerId,
      brokerName: activity.brokerName,
      previousStatus: activity.previousStatus,
      newStatus: activity.newStatus,
      createdAt: activity.createdAt,
      metadata: activity.metadata,
    });
  }
}

export const dealActivityService = new DealActivityService();
