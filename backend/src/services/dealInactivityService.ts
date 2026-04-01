import { prisma } from '@/lib/prisma';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SCAN_INTERVAL_MS = DAY_IN_MS;
const SALES_INACTIVITY_DAYS = 30;
const LEASING_INACTIVITY_DAYS = 14;
const INACTIVITY_NOTIFICATION_TYPE = 'INACTIVITY';

const TERMINAL_STATUSES = new Set([
  'closed',
  'won',
  'awaiting_payment',
  'awaiting payment',
]);

type InactivityScanResult = {
  scanned: number;
  flagged: number;
};

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let schedulerRunning = false;

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function normalizeDealType(value: unknown): 'sales' | 'leasing' | 'auction' {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'lease' || normalized === 'leasing') return 'leasing';
  if (normalized === 'auction') return 'auction';
  return 'sales';
}

function normalizeStatus(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function resolveInactivityThresholdDays(dealType: unknown): number | null {
  const normalized = normalizeDealType(dealType);
  if (normalized === 'leasing') return LEASING_INACTIVITY_DAYS;
  if (normalized === 'sales') return SALES_INACTIVITY_DAYS;
  return null;
}

function calculateDaysInactive(now: Date, lastActivityAt: Date | null): number {
  if (!lastActivityAt) return Number.MAX_SAFE_INTEGER;
  const elapsedMs = now.getTime() - new Date(lastActivityAt).getTime();
  return Math.floor(elapsedMs / DAY_IN_MS);
}

function isAlreadyAlertedSinceLastActivity(
  inactivityNotifiedAt: Date | null,
  lastActivityAt: Date | null
): boolean {
  if (!inactivityNotifiedAt) return false;
  if (!lastActivityAt) return true;
  return new Date(inactivityNotifiedAt).getTime() >= new Date(lastActivityAt).getTime();
}

function shouldSkipStatus(status: string): boolean {
  const normalized = normalizeStatus(status);
  return TERMINAL_STATUSES.has(normalized);
}

function buildInactivityMessage(daysInactive: number): string {
  return `No activity. Please update deal or request LOI/OTP. Inactive for ${daysInactive} day${daysInactive === 1 ? '' : 's'}.`;
}

async function flagDealAsInactive(dealId: string, now: Date): Promise<{
  dealId: string;
  brokerId: string;
  title: string;
  daysInactive: number;
  notificationId: string;
  notificationType: string;
  notificationCreatedAt: Date;
  message: string;
} | null> {
  return prisma.$transaction(async tx => {
    const deal = await tx.deal.findUnique({
      where: { id: dealId },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        brokerId: true,
        lastActivityAt: true,
        inactivityNotifiedAt: true,
      },
    });

    if (!deal) return null;

    const thresholdDays = resolveInactivityThresholdDays(deal.type);
    if (thresholdDays === null) return null;

    if (shouldSkipStatus(deal.status)) return null;

    const daysInactive = calculateDaysInactive(now, deal.lastActivityAt);
    if (daysInactive < thresholdDays) return null;

    if (isAlreadyAlertedSinceLastActivity(deal.inactivityNotifiedAt, deal.lastActivityAt)) {
      return null;
    }

    await tx.deal.update({
      where: { id: deal.id },
      data: {
        inactivityNotifiedAt: now,
      },
    });

    const message = buildInactivityMessage(daysInactive);

    const notification = await tx.notification.create({
      data: {
        actorUserId: null,
        actorName: 'System',
        actorRole: 'system',
        title: 'Deal Inactive',
        message,
        type: INACTIVITY_NOTIFICATION_TYPE,
        entityType: 'deal',
        entityId: deal.id,
        brokerId: deal.brokerId,
        visibilityScope: 'private',
        sound: true,
        read: false,
        payload: {
          dealId: deal.id,
          brokerId: deal.brokerId,
          status: deal.status,
          daysInactive,
          thresholdDays,
          sound: true,
        },
      },
    });

    return {
      dealId: deal.id,
      brokerId: deal.brokerId,
      title: deal.title,
      daysInactive,
      notificationId: notification.id,
      notificationType: notification.type,
      notificationCreatedAt: notification.createdAt,
      message,
    };
  });
}

export async function runDealInactivityScan(now = new Date()): Promise<InactivityScanResult> {
  const deals = await prisma.deal.findMany({
    select: {
      id: true,
      type: true,
      status: true,
      lastActivityAt: true,
      inactivityNotifiedAt: true,
    },
  });

  let flagged = 0;
  for (const deal of deals) {
    const thresholdDays = resolveInactivityThresholdDays(deal.type);
    if (thresholdDays === null) continue;
    if (shouldSkipStatus(deal.status)) continue;
    if (calculateDaysInactive(now, deal.lastActivityAt) < thresholdDays) continue;
    if (isAlreadyAlertedSinceLastActivity(deal.inactivityNotifiedAt, deal.lastActivityAt)) continue;

    const result = await flagDealAsInactive(deal.id, now);
    if (!result) continue;

    flagged += 1;

    const realtimePayload = {
      id: result.notificationId,
      title: 'Deal Inactive',
      message: result.message,
      type: result.notificationType,
      entityType: 'deal',
      entityId: result.dealId,
      dealId: result.dealId,
      brokerId: result.brokerId,
      sound: true,
      createdAt: result.notificationCreatedAt.toISOString(),
      timestamp: result.notificationCreatedAt.toISOString(),
      payload: {
        dealId: result.dealId,
        brokerId: result.brokerId,
      },
    };

    try {
      emitScopedEvent({
        event: 'notification',
        payload: realtimePayload,
        brokerId: result.brokerId,
        includePrivileged: true,
      });
      emitScopedEvent({
        event: 'notification:created',
        payload: realtimePayload,
        brokerId: result.brokerId,
        includePrivileged: true,
      });
      emitScopedEvent({
        event: 'deal:updated',
        payload: {
          id: result.dealId,
        },
        brokerId: result.brokerId,
        includePrivileged: true,
      });
      emitDashboardRefresh({
        type: 'deal:inactive',
        id: result.dealId,
        brokerId: result.brokerId,
      });
    } catch {
      console.warn('Realtime not initialized - skipping inactivity emit');
    }
  }

  return {
    scanned: deals.length,
    flagged,
  };
}

async function runSchedulerTick() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const result = await runDealInactivityScan(new Date());
    if (result.flagged > 0) {
      console.log(
        `Deal inactivity scan completed: ${result.flagged}/${result.scanned} deal(s) flagged`
      );
    }
  } catch (error) {
    console.error('Deal inactivity scan failed:', error);
  } finally {
    schedulerRunning = false;
  }
}

export function startDealInactivityScheduler(intervalMs = DEFAULT_SCAN_INTERVAL_MS): () => void {
  if (schedulerTimer) {
    return () => {
      if (!schedulerTimer) return;
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    };
  }

  void runSchedulerTick();

  schedulerTimer = setInterval(() => {
    void runSchedulerTick();
  }, Math.max(60_000, intervalMs));

  return () => {
    if (!schedulerTimer) return;
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  };
}
