import { prisma } from '@/lib/prisma';
import { AuthRequest } from '@/types';
import { activityService } from '@/services/activityService';
import { calculateDealFinancials, toPercentFromRate } from '@/lib/dealFinancials';
import { Prisma } from '@prisma/client';

type RevenueByType = {
  Sales: number;
  Leasing: number;
  Auction: number;
};

type DashboardActivity = {
  id: string;
  type: 'lead_added' | 'deal_created' | 'deal_won' | 'deal_lost';
  description: string;
  actor: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
};

type DailySalesPoint = {
  date: string;
  amount: number;
  type: 'Sales' | 'Leasing' | 'Auction';
};

type TopPerformer = {
  brokerId: string;
  name: string;
  closedDeals: number;
  brokerCommission: number;
};

type DashboardTrends = {
  totalRevenue: number;
  dealsWon: number;
  dealsLost: number;
  companyCommission: number;
  openDeals: number;
  closedDeals: number;
  conversionRate: number;
  leadCount: number;
};

export interface DashboardMetricsResponse {
  totalRevenue: number;
  dealsWon: number;
  dealsLost: number;
  companyCommission: number;
  brokerCommission: number;
  leadCount: number;
  dealCount: number;
  contactCount: number;
  accountCount: number;
  revenueByType: RevenueByType;
  dailySalesData: DailySalesPoint[];
  statistics: {
    openDeals: number;
    closedDeals: number;
    lostDeals: number;
    conversionRate: number;
  };
  trends: DashboardTrends;
  topPerformer: TopPerformer | null;
  recentActivities: DashboardActivity[];
}

const CLOSED_STATUSES = new Set([
  'closed',
  'won',
  'completed',
  'awaiting_payment',
  'invoice',
]);
const LOST_STATUSES = new Set(['lost', 'cancelled', 'canceled', 'rejected']);
const roundMoney = (value: number) => Math.round(Number(value || 0) * 100) / 100;

type MonthRange = {
  start: Date;
  end: Date;
};

function getMonthRange(referenceDate: Date, monthOffset = 0): MonthRange {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + monthOffset;
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function isWithinRange(value: Date, range: MonthRange): boolean {
  const time = value.getTime();
  return time >= range.start.getTime() && time < range.end.getTime();
}

function calculateTrendPercentage(currentValue: number, previousValue: number): number {
  const current = Number.isFinite(currentValue) ? currentValue : 0;
  const previous = Number.isFinite(previousValue) ? previousValue : 0;

  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

function normalizeDealType(type: string): 'Sales' | 'Leasing' | 'Auction' {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'lease' || value === 'leasing') return 'Leasing';
  if (value === 'auction') return 'Auction';
  return 'Sales';
}

function normalizeModuleType(type: string): 'Sales' | 'Leasing' | 'Auction' {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'lease' || value === 'leasing') return 'Leasing';
  if (value === 'auction') return 'Auction';
  return 'Sales';
}

function normalizeStatusToken(status: string): string {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function isClosedStatus(status: string, closedDate?: Date | null): boolean {
  if (closedDate) return true;
  return CLOSED_STATUSES.has(normalizeStatusToken(status));
}

function isLostStatus(status: string): boolean {
  return LOST_STATUSES.has(normalizeStatusToken(status));
}

function salesAndLeasingModuleWhere(): Prisma.LeadWhereInput | Prisma.ContactWhereInput {
  return {
    OR: [
      { moduleType: { equals: 'sales', mode: 'insensitive' } },
      { moduleType: { equals: 'sale', mode: 'insensitive' } },
      { moduleType: { equals: 'leasing', mode: 'insensitive' } },
      { moduleType: { equals: 'lease', mode: 'insensitive' } },
      { moduleType: null },
      { moduleType: '' },
    ],
  };
}

function asOptionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function resolveDealFinancials(record: any): {
  grossCommission: number;
  companyCommission: number;
  brokerCommission: number;
} {
  const dealType = normalizeDealType(record.type).toLowerCase();
  const assetValue = Number(record.assetValue || record.value || 0);
  const commissionPercentInput = asOptionalNumber(record.commissionPercent);
  const grossCommissionInput = asOptionalNumber(record.grossCommission);
  const leasingGrossCommission =
    dealType === 'leasing'
      ? grossCommissionInput !== undefined
        ? grossCommissionInput
        : roundMoney(assetValue * ((commissionPercentInput ?? 5) / 100))
      : grossCommissionInput;
  const calculated = (() => {
    try {
      return calculateDealFinancials({
        dealType,
        assetValue,
        commissionPercent: commissionPercentInput,
        grossCommission: leasingGrossCommission,
        brokerSplitPercent: asOptionalNumber(record.brokerSplitPercent),
        auctionReferralPercent: asOptionalNumber(record.auctionReferralPercent),
        auctionCommissionPercent: asOptionalNumber(record.auctionCommissionPercent),
        coBrokers: Array.isArray(record.coBrokerSplits) ? record.coBrokerSplits : undefined,
      });
    } catch {
      return {
        grossCommission: 0,
        companyCommission: 0,
        brokerCommission: 0,
      };
    }
  })();

  const grossStored = Number(record.grossCommission || 0);
  const companyStored = Number(record.companyCommission || 0);
  const brokerStored = Number(record.brokerCommission || 0);

  return {
    grossCommission: roundMoney(grossStored > 0 ? grossStored : calculated.grossCommission),
    companyCommission: roundMoney(companyStored > 0 ? companyStored : calculated.companyCommission),
    brokerCommission: roundMoney(brokerStored > 0 ? brokerStored : calculated.brokerCommission),
  };
}

function resolveForecastFinancials(record: any): {
  grossCommission: number;
  companyCommission: number;
  brokerCommission: number;
} {
  const dealType = normalizeModuleType(record.moduleType).toLowerCase();
  const assetValue = Number(record.assetValue || record.expectedValue || 0);
  const commissionPercentInput =
    asOptionalNumber(record.commissionPercent) ?? toPercentFromRate(record.commissionRate);
  const grossCommissionInput =
    asOptionalNumber(record.grossCommission) ?? asOptionalNumber(record.commissionAmount);
  const leasingGrossCommission =
    dealType === 'leasing'
      ? grossCommissionInput !== undefined
        ? grossCommissionInput
        : roundMoney(assetValue * ((commissionPercentInput ?? 5) / 100))
      : grossCommissionInput;
  const calculated = (() => {
    try {
      return calculateDealFinancials({
        dealType,
        assetValue,
        commissionPercent: commissionPercentInput,
        grossCommission: leasingGrossCommission,
        brokerSplitPercent: asOptionalNumber(record.brokerSplitPercent),
        auctionReferralPercent: asOptionalNumber(record.auctionReferralPercent),
        auctionCommissionPercent: asOptionalNumber(record.auctionCommissionPercent),
        coBrokers: Array.isArray(record.coBrokerSplits) ? record.coBrokerSplits : undefined,
      });
    } catch {
      return {
        grossCommission: 0,
        companyCommission: 0,
        brokerCommission: 0,
      };
    }
  })();

  const grossStored = Number(record.grossCommission || record.commissionAmount || 0);
  const companyStored = Number(record.companyCommission || 0);
  const brokerStored = Number(record.brokerCommission || 0);

  return {
    grossCommission: roundMoney(grossStored > 0 ? grossStored : calculated.grossCommission),
    companyCommission: roundMoney(companyStored > 0 ? companyStored : calculated.companyCommission),
    brokerCommission: roundMoney(brokerStored > 0 ? brokerStored : calculated.brokerCommission),
  };
}

export class DashboardService {
  async getMetrics(req: AuthRequest): Promise<DashboardMetricsResponse> {
    const now = new Date();
    const currentMonthRange = getMonthRange(now, 0);
    const previousMonthRange = getMonthRange(now, -1);

    const rollingWindowStart = new Date();
    rollingWindowStart.setDate(rollingWindowStart.getDate() - 120);

    const [
      deals,
      forecastDeals,
      leadCount,
      lostLeadCount,
      currentMonthLeadCount,
      previousMonthLeadCount,
      contactCountRaw,
      accountCountRaw,
      recentActivitiesRaw,
    ] = await Promise.all([
      prisma.deal.findMany({
        select: {
          id: true,
          brokerId: true,
          title: true,
          status: true,
          type: true,
          value: true,
          assetValue: true,
          commissionPercent: true,
          grossCommission: true,
          companyCommission: true,
          brokerCommission: true,
          brokerSplitPercent: true,
          auctionReferralPercent: true,
          auctionCommissionPercent: true,
          coBrokerSplits: true,
          closedDate: true,
          createdAt: true,
          updatedAt: true,
          broker: { select: { name: true } },
        },
      }),
      prisma.forecastDeal.findMany({
        select: {
          id: true,
          dealId: true,
          brokerId: true,
          title: true,
          status: true,
          dealType: true,
          moduleType: true,
          expectedValue: true,
          assetValue: true,
          commissionPercent: true,
          grossCommission: true,
          commissionRate: true,
          commissionAmount: true,
          companyCommission: true,
          brokerCommission: true,
          brokerSplitPercent: true,
          auctionReferralPercent: true,
          auctionCommissionPercent: true,
          coBrokerSplits: true,
          forecastedClosureDate: true,
          expectedPaymentDate: true,
          createdAt: true,
          updatedAt: true,
          broker: { select: { name: true } },
        },
      }),
      prisma.lead.count({
        where: salesAndLeasingModuleWhere() as Prisma.LeadWhereInput,
      }),
      prisma.lead.count({
        where: {
          AND: [
            salesAndLeasingModuleWhere() as Prisma.LeadWhereInput,
            { status: 'lost' },
          ],
        },
      }),
      prisma.lead.count({
        where: {
          AND: [
            salesAndLeasingModuleWhere() as Prisma.LeadWhereInput,
            {
              createdAt: {
                gte: currentMonthRange.start,
                lt: currentMonthRange.end,
              },
            },
          ],
        },
      }),
      prisma.lead.count({
        where: {
          AND: [
            salesAndLeasingModuleWhere() as Prisma.LeadWhereInput,
            {
              createdAt: {
                gte: previousMonthRange.start,
                lt: previousMonthRange.end,
              },
            },
          ],
        },
      }),
      prisma.contact.count({
        where: salesAndLeasingModuleWhere() as Prisma.ContactWhereInput,
      }),
      prisma.broker.count({ where: { status: { not: 'archived' } } }),
      activityService.getRecentActivities(req.user, 20),
    ]);

    const closedDeals = deals.filter(deal => isClosedStatus(deal.status, deal.closedDate));
    const lostDeals = deals.filter(deal => isLostStatus(deal.status));
    const openDeals = deals.filter(
      deal => !isClosedStatus(deal.status, deal.closedDate) && !isLostStatus(deal.status)
    );

    const closedForecastDeals = forecastDeals.filter(deal => isClosedStatus(deal.status));
    const lostForecastDeals = forecastDeals.filter(deal => isLostStatus(deal.status));
    const openForecastDeals = forecastDeals.filter(
      deal => !isClosedStatus(deal.status) && !isLostStatus(deal.status)
    );

    const closedDealIdSet = new Set(closedDeals.map(deal => deal.id));
    const revenueForecastDeals = closedForecastDeals.filter(
      deal => !deal.dealId || !closedDealIdSet.has(deal.dealId)
    );

    const revenueByType = closedDeals.reduce<RevenueByType>(
      (acc, deal) => {
        const key = normalizeDealType(deal.type);
        acc[key] = roundMoney(acc[key] + Number(deal.assetValue || deal.value || 0));
        return acc;
      },
      { Sales: 0, Leasing: 0, Auction: 0 }
    );

    for (const forecastDeal of revenueForecastDeals) {
      const key = normalizeModuleType(forecastDeal.moduleType);
      revenueByType[key] = roundMoney(
        revenueByType[key] + Number(forecastDeal.assetValue || forecastDeal.expectedValue || 0)
      );
    }

    const totalRevenue = roundMoney(revenueByType.Sales + revenueByType.Leasing + revenueByType.Auction);
    let companyCommission = 0;
    let brokerCommission = 0;
    let currentMonthRevenue = 0;
    let previousMonthRevenue = 0;
    let currentMonthCompanyCommission = 0;
    let previousMonthCompanyCommission = 0;
    let currentMonthDealsWon = 0;
    let previousMonthDealsWon = 0;
    let currentMonthDealsLost = 0;
    let previousMonthDealsLost = 0;
    let currentMonthOpenDeals = 0;
    let previousMonthOpenDeals = 0;

    const brokerPerformanceMap = new Map<
      string,
      TopPerformer & { totalRevenue: number }
    >();

    const upsertBrokerPerformance = (
      brokerId: string,
      name: string,
      closedDealIncrement: number,
      brokerCommissionIncrement: number,
      revenueIncrement: number
    ) => {
      const existing = brokerPerformanceMap.get(brokerId) || {
        brokerId,
        name,
        closedDeals: 0,
        brokerCommission: 0,
        totalRevenue: 0,
      };

      existing.closedDeals += closedDealIncrement;
      existing.brokerCommission += brokerCommissionIncrement;
      existing.totalRevenue += revenueIncrement;
      existing.name = existing.name || name || 'Unknown Broker';
      brokerPerformanceMap.set(brokerId, existing);
    };

    for (const deal of closedDeals) {
      const brokerId = deal.brokerId || 'unknown-broker';
      const brokerName = deal.broker?.name || 'Unknown Broker';
      const dealValue = Number(deal.assetValue || deal.value || 0);
      const eventDate = deal.closedDate || deal.updatedAt || deal.createdAt;
      const dealFinancials = resolveDealFinancials(deal);
      const dealBrokerCommission = dealFinancials.brokerCommission;
      companyCommission = roundMoney(companyCommission + dealFinancials.companyCommission);
      brokerCommission = roundMoney(brokerCommission + dealFinancials.brokerCommission);

      upsertBrokerPerformance(brokerId, brokerName, 1, dealBrokerCommission, dealValue);

      if (isWithinRange(eventDate, currentMonthRange)) {
        currentMonthRevenue = roundMoney(currentMonthRevenue + dealValue);
        currentMonthCompanyCommission = roundMoney(
          currentMonthCompanyCommission + dealFinancials.companyCommission
        );
        currentMonthDealsWon += 1;
      } else if (isWithinRange(eventDate, previousMonthRange)) {
        previousMonthRevenue = roundMoney(previousMonthRevenue + dealValue);
        previousMonthCompanyCommission = roundMoney(
          previousMonthCompanyCommission + dealFinancials.companyCommission
        );
        previousMonthDealsWon += 1;
      }
    }

    for (const deal of revenueForecastDeals) {
      const brokerId = deal.brokerId || 'unknown-broker';
      const brokerName = deal.broker?.name || 'Unknown Broker';
      const dealValue = Number(deal.assetValue || deal.expectedValue || 0);
      const eventDate =
        deal.expectedPaymentDate || deal.forecastedClosureDate || deal.updatedAt || deal.createdAt;
      const forecastFinancials = resolveForecastFinancials(deal);
      const dealBrokerCommission = forecastFinancials.brokerCommission;
      companyCommission = roundMoney(companyCommission + forecastFinancials.companyCommission);
      brokerCommission = roundMoney(brokerCommission + forecastFinancials.brokerCommission);

      upsertBrokerPerformance(brokerId, brokerName, 1, dealBrokerCommission, dealValue);

      if (isWithinRange(eventDate, currentMonthRange)) {
        currentMonthRevenue = roundMoney(currentMonthRevenue + dealValue);
        currentMonthCompanyCommission = roundMoney(
          currentMonthCompanyCommission + forecastFinancials.companyCommission
        );
      } else if (isWithinRange(eventDate, previousMonthRange)) {
        previousMonthRevenue = roundMoney(previousMonthRevenue + dealValue);
        previousMonthCompanyCommission = roundMoney(
          previousMonthCompanyCommission + forecastFinancials.companyCommission
        );
      }
    }

    for (const deal of closedForecastDeals) {
      const eventDate =
        deal.expectedPaymentDate || deal.forecastedClosureDate || deal.updatedAt || deal.createdAt;
      if (isWithinRange(eventDate, currentMonthRange)) {
        currentMonthDealsWon += 1;
      } else if (isWithinRange(eventDate, previousMonthRange)) {
        previousMonthDealsWon += 1;
      }
    }

    for (const deal of lostDeals) {
      const eventDate = deal.updatedAt || deal.createdAt;
      if (isWithinRange(eventDate, currentMonthRange)) {
        currentMonthDealsLost += 1;
      } else if (isWithinRange(eventDate, previousMonthRange)) {
        previousMonthDealsLost += 1;
      }
    }

    for (const deal of lostForecastDeals) {
      const eventDate = deal.updatedAt || deal.createdAt;
      if (isWithinRange(eventDate, currentMonthRange)) {
        currentMonthDealsLost += 1;
      } else if (isWithinRange(eventDate, previousMonthRange)) {
        previousMonthDealsLost += 1;
      }
    }

    for (const deal of openDeals) {
      const eventDate = deal.createdAt;
      if (isWithinRange(eventDate, currentMonthRange)) {
        currentMonthOpenDeals += 1;
      } else if (isWithinRange(eventDate, previousMonthRange)) {
        previousMonthOpenDeals += 1;
      }
    }

    for (const deal of openForecastDeals) {
      const eventDate = deal.createdAt;
      if (isWithinRange(eventDate, currentMonthRange)) {
        currentMonthOpenDeals += 1;
      } else if (isWithinRange(eventDate, previousMonthRange)) {
        previousMonthOpenDeals += 1;
      }
    }

    const topPerformer: TopPerformer | null =
      Array.from(brokerPerformanceMap.values())
        .filter(item => item.closedDeals > 0 || item.brokerCommission > 0)
        .sort(
          (a, b) =>
            b.closedDeals - a.closedDeals ||
            b.brokerCommission - a.brokerCommission ||
            b.totalRevenue - a.totalRevenue ||
            a.name.localeCompare(b.name)
        )
        .map(item => ({
          brokerId: item.brokerId,
          name: item.name,
          closedDeals: item.closedDeals,
          brokerCommission: roundMoney(item.brokerCommission),
        }))[0] || null;

    const dailySalesMap = new Map<string, number>();

    function appendDailyPoint(date: Date, type: 'Sales' | 'Leasing' | 'Auction', amount: number) {
      if (date < rollingWindowStart) return;
      const dateKey = date.toISOString().slice(0, 10);
      const mapKey = `${dateKey}|${type}`;
      dailySalesMap.set(mapKey, roundMoney((dailySalesMap.get(mapKey) || 0) + amount));
    }

    for (const deal of closedDeals) {
      const eventDate = deal.closedDate || deal.updatedAt || deal.createdAt;
      appendDailyPoint(eventDate, normalizeDealType(deal.type), Number(deal.value || 0));
    }

    for (const deal of revenueForecastDeals) {
      const eventDate = deal.expectedPaymentDate || deal.forecastedClosureDate || deal.updatedAt || deal.createdAt;
      appendDailyPoint(eventDate, normalizeModuleType(deal.moduleType), Number(deal.expectedValue || 0));
    }

    const dailySalesData: DailySalesPoint[] = Array.from(dailySalesMap.entries())
      .map(([key, amount]) => {
        const [date, type] = key.split('|');
        return {
          date,
          amount,
          type: type as DailySalesPoint['type'],
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const recentActivities: DashboardActivity[] = recentActivitiesRaw.map(activity => {
      const normalizedAction = String(activity.action || '').toLowerCase();
      const normalizedEntity = String(activity.entityType || '').toLowerCase();
      const type: DashboardActivity['type'] =
        normalizedAction.includes('lost')
          ? 'deal_lost'
          : normalizedAction.includes('won') ||
            normalizedAction.includes('closed')
          ? 'deal_won'
          : normalizedEntity === 'lead'
          ? 'lead_added'
          : 'deal_created';

      return {
        id: activity.id,
        type,
        description: activity.description,
        actor: activity.actorDisplayName || activity.actorName || 'System',
        timestamp: activity.createdAt,
        metadata: {
          ...(activity.metadata || {}),
          entityType: activity.entityType,
          entityId: activity.entityId || null,
          action: activity.action,
        },
      };
    });

    const totalClosedDeals = closedDeals.length + closedForecastDeals.length;
    const totalOpenDeals = openDeals.length + openForecastDeals.length;
    const totalLostDeals = lostDeals.length + lostForecastDeals.length + lostLeadCount;
    const totalDealCount = deals.length;
    const conversionRate = leadCount > 0 ? (totalClosedDeals / leadCount) * 100 : 0;
    const currentMonthConversionRate =
      currentMonthLeadCount > 0 ? (currentMonthDealsWon / currentMonthLeadCount) * 100 : 0;
    const previousMonthConversionRate =
      previousMonthLeadCount > 0 ? (previousMonthDealsWon / previousMonthLeadCount) * 100 : 0;

    const trends: DashboardTrends = {
      totalRevenue: roundMoney(calculateTrendPercentage(currentMonthRevenue, previousMonthRevenue)),
      dealsWon: roundMoney(calculateTrendPercentage(currentMonthDealsWon, previousMonthDealsWon)),
      dealsLost: roundMoney(calculateTrendPercentage(currentMonthDealsLost, previousMonthDealsLost)),
      companyCommission: roundMoney(
        calculateTrendPercentage(currentMonthCompanyCommission, previousMonthCompanyCommission)
      ),
      openDeals: roundMoney(calculateTrendPercentage(currentMonthOpenDeals, previousMonthOpenDeals)),
      closedDeals: roundMoney(calculateTrendPercentage(currentMonthDealsWon, previousMonthDealsWon)),
      conversionRate: roundMoney(
        calculateTrendPercentage(currentMonthConversionRate, previousMonthConversionRate)
      ),
      leadCount: roundMoney(calculateTrendPercentage(currentMonthLeadCount, previousMonthLeadCount)),
    };

    return {
      totalRevenue,
      dealsWon: totalClosedDeals,
      dealsLost: lostDeals.length + lostForecastDeals.length,
      companyCommission: roundMoney(companyCommission),
      brokerCommission: roundMoney(brokerCommission),
      leadCount,
      dealCount: totalDealCount,
      contactCount: contactCountRaw,
      accountCount: accountCountRaw,
      revenueByType,
      dailySalesData,
      statistics: {
        openDeals: totalOpenDeals,
        closedDeals: totalClosedDeals,
        lostDeals: totalLostDeals,
        conversionRate: roundMoney(conversionRate),
      },
      trends,
      topPerformer,
      recentActivities,
    };
  }
}

export const dashboardService = new DashboardService();
