import apiClient from '@/lib/api';
import { formatRand } from '@/lib/currency';
import { AxiosError } from 'axios';

export interface Activity {
  id: string;
  type: string;
  description: string;
  actor: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface TopPerformer {
  brokerId: string;
  name: string;
  closedDeals: number;
  brokerCommission: number;
}

export interface DashboardTrends {
  totalRevenue: number;
  dealsWon: number;
  dealsLost: number;
  companyCommission: number;
  openDeals: number;
  closedDeals: number;
  conversionRate: number;
  leadCount: number;
}

export interface DashboardMetrics {
  totalRevenue: number;
  dealsWon: number;
  dealsLost: number;
  companyCommission: number;
  brokerCommission: number;
  leadCount: number;
  dealCount: number;
  contactCount: number;
  accountCount: number;
  revenueByType: Record<string, number>;
  dailySalesData: Array<{ date: string; amount: number; type: string }>;
  statistics: {
    openDeals: number;
    closedDeals: number;
    lostDeals: number;
    conversionRate: number;
  };
  trends: DashboardTrends;
  topPerformer: TopPerformer | null;
  recentActivities: Activity[];
}

type DashboardMetricsApiResponse = {
  success: boolean;
  message: string;
  data: {
    totalRevenue?: number;
    dealsWon?: number;
    dealsLost?: number;
    companyCommission?: number;
    brokerCommission?: number;
    leadCount?: number;
    dealCount?: number;
    contactCount?: number;
    accountCount?: number;
    revenueByType?: Record<string, number>;
    dailySalesData?: Array<{ date: string; amount: number; type: string }>;
    statistics?: {
      openDeals?: number;
      closedDeals?: number;
      lostDeals?: number;
      conversionRate?: number;
    };
    trends?: {
      totalRevenue?: number;
      dealsWon?: number;
      dealsLost?: number;
      companyCommission?: number;
      openDeals?: number;
      closedDeals?: number;
      conversionRate?: number;
      leadCount?: number;
    };
    topPerformer?: {
      brokerId?: string;
      name?: string;
      closedDeals?: number;
      brokerCommission?: number;
    } | null;
    recentActivities?: Array<{
      id: string;
      type: string;
      description: string;
      actor: string;
      timestamp: string | Date;
      metadata?: Record<string, unknown>;
    }>;
  };
};

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parseActivity(raw: DashboardMetricsApiResponse['data']['recentActivities']): Activity[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => ({
    id: item.id,
    type: String(item.type || ''),
    description: item.description,
    actor: item.actor,
    timestamp: new Date(item.timestamp),
    metadata: item.metadata,
  }));
}

export function isTaskActivity(activity: Activity): boolean {
  const type = activity.type?.toLowerCase() || '';
  const description = activity.description?.toLowerCase() || '';
  return (
    type.includes('task') ||
    type.includes('reminder') ||
    description.includes('task') ||
    description.includes('reminder')
  );
}

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  try {
    const response = await apiClient.get<DashboardMetricsApiResponse>('/dashboard/metrics');
    const data = response.data?.data || {};

    return {
      totalRevenue: toNumber(data.totalRevenue),
      dealsWon: toNumber(data.dealsWon),
      dealsLost: toNumber(data.dealsLost),
      companyCommission: toNumber(data.companyCommission),
      brokerCommission: toNumber(data.brokerCommission),
      leadCount: toNumber(data.leadCount),
      dealCount: toNumber(data.dealCount),
      contactCount: toNumber(data.contactCount),
      accountCount: toNumber(data.accountCount),
      revenueByType: {
        Sales: toNumber(data.revenueByType?.Sales),
        Leasing: toNumber(data.revenueByType?.Leasing),
        Auction: toNumber(data.revenueByType?.Auction),
      },
      dailySalesData: Array.isArray(data.dailySalesData)
        ? data.dailySalesData.map(item => ({
            date: item.date,
            amount: toNumber(item.amount),
            type: item.type,
          }))
        : [],
      statistics: {
        openDeals: toNumber(data.statistics?.openDeals),
        closedDeals: toNumber(data.statistics?.closedDeals),
        lostDeals: toNumber(data.statistics?.lostDeals),
        conversionRate: toNumber(data.statistics?.conversionRate),
      },
      trends: {
        totalRevenue: toNumber(data.trends?.totalRevenue),
        dealsWon: toNumber(data.trends?.dealsWon),
        dealsLost: toNumber(data.trends?.dealsLost),
        companyCommission: toNumber(data.trends?.companyCommission),
        openDeals: toNumber(data.trends?.openDeals),
        closedDeals: toNumber(data.trends?.closedDeals),
        conversionRate: toNumber(data.trends?.conversionRate),
        leadCount: toNumber(data.trends?.leadCount),
      },
      topPerformer: data.topPerformer
        ? {
            brokerId: String(data.topPerformer.brokerId || ''),
            name: String(data.topPerformer.name || 'N/A'),
            closedDeals: toNumber(data.topPerformer.closedDeals),
            brokerCommission: toNumber(data.topPerformer.brokerCommission),
          }
        : null,
      recentActivities: parseActivity(data.recentActivities),
    };
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    throw new Error(axiosError.response?.data?.message || 'Failed to fetch dashboard metrics');
  }
}

export function formatCurrency(amount: number): string {
  return formatRand(amount);
}

export function formatRelativeTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'just now';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
}
