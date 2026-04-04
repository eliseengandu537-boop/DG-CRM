'use client';

import React, { useMemo } from 'react';
import { FiBriefcase, FiDollarSign, FiTarget, FiTrendingUp } from 'react-icons/fi';
import { calculateCommissionSplit } from '@/lib/dealSheetCalculations';
import { useDealSheetRealtime } from '@/hooks/useDealSheetRealtime';
import {
  estimateDealGrossCommission,
  estimateForecastGrossCommission,
  getDealGrossCommission,
  isClosedDeal,
  isClosedForecastDeal,
  isLostStatus,
  normalizeDealType,
} from '@/services/dealSheetRealtimeService';
import { formatRand } from '@/lib/currency';

type DealType = 'Leasing' | 'Sales' | 'Auction';

interface TypeSummary {
  revenue: number;
  deals: number;
  grossCommission: number;
  pipelineValue: number;
}

const formatCurrency = (value: number) =>
  formatRand(value);

function getQuarter(dateInput: string): string {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const month = date.getMonth();
  if (month <= 2) return 'Q1';
  if (month <= 5) return 'Q2';
  if (month <= 8) return 'Q3';
  return 'Q4';
}

export default function SummaryDashboard() {
  const { data, isLoading, error, lastUpdated } = useDealSheetRealtime();

  const summary = useMemo(() => {
    const typeSummary: Record<DealType, TypeSummary> = {
      Leasing: { revenue: 0, deals: 0, grossCommission: 0, pipelineValue: 0 },
      Sales: { revenue: 0, deals: 0, grossCommission: 0, pipelineValue: 0 },
      Auction: { revenue: 0, deals: 0, grossCommission: 0, pipelineValue: 0 },
    };

    const closedDeals = data.deals.filter(deal => isClosedDeal(deal) && !isLostStatus(deal.status));
    const closedDealIds = new Set(closedDeals.map(deal => String(deal.id)));
    const closedForecastDeals = data.forecastDeals.filter(
      deal =>
        isClosedForecastDeal(deal) &&
        !isLostStatus(deal.status) &&
        (!deal.dealId || !closedDealIds.has(String(deal.dealId)))
    );
    const pipelineForecastDeals = data.forecastDeals.filter(
      deal => !isClosedForecastDeal(deal) && !isLostStatus(deal.status)
    );

    const quarterlyRevenue: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };

    for (const deal of closedDeals) {
      const type = normalizeDealType(deal.type);
      const value = Number(deal.value || 0);
      const grossCommission = getDealGrossCommission(deal);
      typeSummary[type].revenue += value;
      typeSummary[type].deals += 1;
      typeSummary[type].grossCommission += grossCommission;

      const closedDate = deal.closedDate || deal.updatedAt || deal.createdAt;
      const quarter = getQuarter(String(closedDate || ''));
      if (quarterlyRevenue[quarter] !== undefined) {
        quarterlyRevenue[quarter] += value;
      }
    }

    for (const deal of closedForecastDeals) {
      const type = normalizeDealType(deal.moduleType);
      const value = Number(deal.expectedValue || 0);
      const grossCommission = estimateForecastGrossCommission(deal);
      typeSummary[type].revenue += value;
      typeSummary[type].deals += 1;
      typeSummary[type].grossCommission += grossCommission;

      const closedDate = deal.expectedPaymentDate || deal.forecastedClosureDate || deal.updatedAt || deal.createdAt;
      const quarter = getQuarter(String(closedDate || ''));
      if (quarterlyRevenue[quarter] !== undefined) {
        quarterlyRevenue[quarter] += value;
      }
    }

    for (const deal of pipelineForecastDeals) {
      const type = normalizeDealType(deal.moduleType);
      typeSummary[type].pipelineValue += Number(deal.expectedValue || 0);
    }

    const totalRevenue =
      typeSummary.Leasing.revenue + typeSummary.Sales.revenue + typeSummary.Auction.revenue;
    const totalDeals = typeSummary.Leasing.deals + typeSummary.Sales.deals + typeSummary.Auction.deals;
    const totalGrossCommission =
      typeSummary.Leasing.grossCommission +
      typeSummary.Sales.grossCommission +
      typeSummary.Auction.grossCommission;
    const split = calculateCommissionSplit(totalGrossCommission);
    const totalPipeline =
      typeSummary.Leasing.pipelineValue +
      typeSummary.Sales.pipelineValue +
      typeSummary.Auction.pipelineValue;

    return {
      typeSummary,
      totalRevenue,
      totalDeals,
      totalGrossCommission,
      split,
      totalPipeline,
      quarterlyRevenue,
    };
  }, [data.deals, data.forecastDeals]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-stone-900">Deal Summary</h1>
        <p className="text-stone-600">Live overview of completed and pipeline performance</p>
        <p className="text-xs text-stone-500 mt-1">
          {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Live sync pending...'}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-blue-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-stone-600 font-medium text-sm">Total Revenue</p>
            <div className="bg-blue-100 p-2 rounded-lg">
              <FiDollarSign className="text-blue-600 text-lg" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-stone-900">{formatCurrency(summary.totalRevenue)}</h3>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-green-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-stone-600 font-medium text-sm">Completed Deals</p>
            <div className="bg-green-100 p-2 rounded-lg">
              <FiBriefcase className="text-green-600 text-lg" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-stone-900">{summary.totalDeals}</h3>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-stone-600 font-medium text-sm">Gross Commission</p>
            <div className="bg-purple-100 p-2 rounded-lg">
              <FiTrendingUp className="text-purple-600 text-lg" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-stone-900">
            {formatCurrency(summary.totalGrossCommission)}
          </h3>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-orange-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-stone-600 font-medium text-sm">Company Share (55%)</p>
            <div className="bg-orange-100 p-2 rounded-lg">
              <FiTarget className="text-orange-600 text-lg" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-stone-900">{formatCurrency(summary.split.companyComm)}</h3>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-red-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-stone-600 font-medium text-sm">Pipeline Value</p>
            <div className="bg-red-100 p-2 rounded-lg">
              <FiTarget className="text-red-600 text-lg" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-stone-900">{formatCurrency(summary.totalPipeline)}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.keys(summary.typeSummary) as DealType[]).map(type => {
          const item = summary.typeSummary[type];
          return (
            <div key={type} className="bg-white rounded-lg border border-stone-200 p-5">
              <p className="text-sm font-semibold text-stone-700 mb-2">{type}</p>
              <p className="text-xl font-bold text-stone-900">{formatCurrency(item.revenue)}</p>
              <p className="text-xs text-stone-500 mt-1">{item.deals} completed deals</p>
              <p className="text-xs text-stone-600 mt-2">
                Gross Comm: <span className="font-semibold">{formatCurrency(item.grossCommission)}</span>
              </p>
              <p className="text-xs text-stone-600">
                Pipeline: <span className="font-semibold">{formatCurrency(item.pipelineValue)}</span>
              </p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-lg border border-stone-200 p-5">
        <h2 className="text-lg font-bold text-stone-900 mb-3">Quarterly Revenue</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map(quarter => (
            <div key={quarter} className="rounded-lg border border-stone-200 p-4 bg-stone-50">
              <p className="text-xs text-stone-600 font-semibold">{quarter}</p>
              <p className="text-xl font-bold text-stone-900 mt-1">
                {formatCurrency(summary.quarterlyRevenue[quarter] || 0)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-stone-500">Loading live deal sheet metrics...</div>
      )}
    </div>
  );
}
