'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  FiBarChart2,
  FiClock,
  FiDollarSign,
  FiPercent,
  FiTrendingUp,
  FiUserCheck,
} from 'react-icons/fi';
import { IconType } from 'react-icons';
import { useAuth } from '@/context/AuthContext';
import { Deal, dealService } from '@/services/dealService';
import { leadService } from '@/services/leadService';
import { contactService } from '@/services/contactService';
import { isClosedDeal } from '@/services/dealSheetRealtimeService';
import { formatRand } from '@/lib/currency';

/**
 * Reports Component
 * Management-only analytics overview. Surfaces deal performance and
 * conversion metrics across the CRM. Access is restricted to admin and
 * manager roles (defense-in-depth in addition to page-level gating).
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

interface ReportMetrics {
  averageDealTimeDays: number;
  dealConversionRate: number;
  contactToLeadRate: number;
  totalDeals: number;
  averageDealValue: number;
}

const computeMetrics = (
  deals: Deal[],
  totalLeads: number,
  totalContacts: number
): ReportMetrics => {
  const closedDeals = deals.filter((deal) => isClosedDeal(deal));

  // Deal time: average days from createdAt to closedDate for closed/won deals.
  const dealDurations = closedDeals
    .map((deal) => {
      if (!deal.closedDate || !deal.createdAt) return null;
      const created = new Date(deal.createdAt).getTime();
      const closed = new Date(deal.closedDate).getTime();
      if (!Number.isFinite(created) || !Number.isFinite(closed)) return null;
      const days = (closed - created) / MS_PER_DAY;
      return days >= 0 ? days : null;
    })
    .filter((days): days is number => days !== null);

  const averageDealTimeDays =
    dealDurations.length > 0
      ? dealDurations.reduce((sum, days) => sum + days, 0) / dealDurations.length
      : 0;

  // Deal conversion rate: closed/won deals over total deals.
  const dealConversionRate =
    deals.length > 0 ? (closedDeals.length / deals.length) * 100 : 0;

  // Contact-to-lead conversion rate: leads over contacts.
  const contactToLeadRate =
    totalContacts > 0 ? (totalLeads / totalContacts) * 100 : 0;

  // Average deal value: mean of deal value across all deals.
  const totalValue = deals.reduce(
    (sum, deal) => sum + (Number.isFinite(deal.value) ? deal.value : 0),
    0
  );
  const averageDealValue = deals.length > 0 ? totalValue / deals.length : 0;

  return {
    averageDealTimeDays,
    dealConversionRate,
    contactToLeadRate,
    totalDeals: deals.length,
    averageDealValue,
  };
};

export const Reports: React.FC = () => {
  const { user } = useAuth();
  const isManagement = user?.role === 'admin' || user?.role === 'manager';

  const [deals, setDeals] = useState<Deal[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalContacts, setTotalContacts] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isManagement) return;

    let mounted = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [dealsResult, leadsResult, contactsResult] = await Promise.all([
          dealService.getAllDeals({ limit: 10000 }),
          leadService.getAllLeads({ limit: 10000 }),
          contactService.getAllContacts({ limit: 10000 }),
        ]);

        if (!mounted) return;

        setDeals(dealsResult.data || []);
        setTotalLeads(
          leadsResult.pagination?.total ?? leadsResult.data?.length ?? 0
        );
        setTotalContacts(
          contactsResult.pagination?.total ?? contactsResult.data?.length ?? 0
        );
      } catch (err) {
        if (!mounted) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load report data'
        );
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [isManagement]);

  const metrics = useMemo(
    () => computeMetrics(deals, totalLeads, totalContacts),
    [deals, totalLeads, totalContacts]
  );

  if (!isManagement) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-8 text-center">
        <FiBarChart2 size={28} className="mx-auto mb-3 text-stone-400" />
        <h2 className="text-lg font-semibold text-stone-900">Reports</h2>
        <p className="mt-1 text-sm text-stone-500">
          Access restricted to management.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Reports</h1>
        <p className="text-sm text-stone-500">
          Management performance and conversion metrics
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={idx}
              className="h-28 animate-pulse rounded border border-stone-300 bg-stone-100"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Deal Time"
            value={`${metrics.averageDealTimeDays.toFixed(1)} days`}
            caption="Average days from creation to close"
            Icon={FiClock}
          />
          <StatCard
            title="Deal Conversion Rate"
            value={`${metrics.dealConversionRate.toFixed(1)}%`}
            caption="Closed/won deals out of total deals"
            Icon={FiPercent}
          />
          <StatCard
            title="Contact-to-Lead Conversion"
            value={`${metrics.contactToLeadRate.toFixed(1)}%`}
            caption="Leads generated out of total contacts"
            Icon={FiUserCheck}
          />
          <StatCard
            title="Amount of Deals"
            value={metrics.totalDeals.toLocaleString()}
            caption="Total deal count"
            Icon={FiTrendingUp}
          />
          <StatCard
            title="Average Deal Value"
            value={formatRand(metrics.averageDealValue)}
            caption="Mean value across all deals"
            Icon={FiDollarSign}
          />
        </div>
      )}
    </div>
  );
};

const StatCard = ({
  title,
  value,
  caption,
  Icon,
}: {
  title: string;
  value: string;
  caption: string;
  Icon: IconType;
}) => {
  return (
    <div className="p-4 rounded border border-stone-300">
      <div className="flex mb-8 items-start justify-between">
        <div>
          <h3 className="text-stone-500 mb-2 text-sm">{title}</h3>
          <p className="text-3xl font-semibold">{value}</p>
        </div>
        <span className="flex items-center justify-center rounded bg-violet-100 p-2 text-violet-600">
          <Icon size={16} />
        </span>
      </div>

      <p className="text-xs text-stone-500">{caption}</p>
    </div>
  );
};

export default Reports;
