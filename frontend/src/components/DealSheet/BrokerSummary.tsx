'use client';

import React, { useMemo, useState } from 'react';
import { IoSearch } from 'react-icons/io5';
import { formatRand } from '@/lib/currency';
import { calculateCommissionSplit } from '@/lib/dealSheetCalculations';
import { useDealSheetRealtime } from '@/hooks/useDealSheetRealtime';
import {
  getDealGrossCommission,
  getIsoDate,
  normalizeDealType,
} from '@/services/dealSheetRealtimeService';

interface MonthlyPerformance {
  month: string;
  candidateCommission: number;
  averageValue: number;
  nod: number;
  leases: number;
  sales: number;
  auction: number;
}

interface QuarterlyPerformance {
  quarter: string;
  requirement: number;
  currentStanding: number;
}

interface BrokerSummaryRow {
  id: string;
  name: string;
  billingTarget: number;
  currentStanding: number;
  monthly: MonthlyPerformance[];
  quarterly: QuarterlyPerformance[];
}

const getPercentage = (current: number, target: number) => {
  if (target <= 0) return 0;
  return Math.round((current / target) * 100);
};

const getQuarter = (isoDate: string): string => {
  const date = new Date(isoDate);
  const month = date.getMonth();
  if (month <= 2) return 'Q1';
  if (month <= 5) return 'Q2';
  if (month <= 8) return 'Q3';
  return 'Q4';
};

const getMonthKey = (isoDate: string) => {
  const date = new Date(isoDate);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
};

export default function BrokerSummary() {
  const { data, isLoading, error, lastUpdated } = useDealSheetRealtime();
  const [searchQuery, setSearchQuery] = useState('');

  const rows = useMemo<BrokerSummaryRow[]>(() => {
    const brokerMap = new Map<
      string,
      {
        id: string;
        name: string;
        billingTarget: number;
        currentStanding: number;
        monthlyMap: Map<
          string,
          {
            totalValue: number;
            candidateCommission: number;
            nod: number;
            leases: number;
            sales: number;
            auction: number;
          }
        >;
        quarterMap: Map<string, number>;
      }
    >();

    for (const broker of data.brokers) {
      brokerMap.set(broker.id, {
        id: broker.id,
        name: broker.name,
        billingTarget: Number(broker.billingTarget || 0),
        currentStanding: Number(broker.currentBilling || 0),
        monthlyMap: new Map(),
        quarterMap: new Map([
          ['Q1', 0],
          ['Q2', 0],
          ['Q3', 0],
          ['Q4', 0],
        ]),
      });
    }

    const applyEntry = (
      brokerId: string,
      value: number,
      grossCommission: number,
      dealType: 'Leasing' | 'Sales' | 'Auction',
      isoDate: string
    ) => {
      const broker = brokerMap.get(brokerId);
      if (!broker) return;

      const monthKey = getMonthKey(isoDate);
      const monthRow = broker.monthlyMap.get(monthKey) || {
        totalValue: 0,
        candidateCommission: 0,
        nod: 0,
        leases: 0,
        sales: 0,
        auction: 0,
      };

      monthRow.totalValue += value;
      monthRow.candidateCommission += calculateCommissionSplit(grossCommission).brokerComm;
      monthRow.nod += 1;
      if (dealType === 'Leasing') monthRow.leases += 1;
      if (dealType === 'Sales') monthRow.sales += 1;
      if (dealType === 'Auction') monthRow.auction += 1;
      broker.monthlyMap.set(monthKey, monthRow);

      const quarter = getQuarter(isoDate);
      broker.quarterMap.set(quarter, (broker.quarterMap.get(quarter) || 0) + value);
    };

    for (const deal of data.deals) {
      const isoDate = getIsoDate(deal.closedDate || deal.updatedAt || deal.createdAt);
      if (!isoDate) continue;
      applyEntry(
        deal.brokerId,
        Number(deal.value || 0),
        getDealGrossCommission(deal),
        normalizeDealType(deal.type),
        isoDate
      );
    }

    return Array.from(brokerMap.values())
      .map(broker => {
        const monthly = Array.from(broker.monthlyMap.entries())
          .sort((a, b) => b[0].localeCompare(a[0]))
          .slice(0, 6)
          .map(([monthKey, value]) => ({
            month: getMonthLabel(monthKey),
            candidateCommission: Math.round(value.candidateCommission),
            averageValue: value.nod > 0 ? Math.round(value.totalValue / value.nod) : 0,
            nod: value.nod,
            leases: value.leases,
            sales: value.sales,
            auction: value.auction,
          }));

        const quarterly: QuarterlyPerformance[] = ['Q1', 'Q2', 'Q3', 'Q4'].map(quarter => ({
          quarter,
          requirement: Math.round((broker.billingTarget || 0) / 4),
          currentStanding: Math.round(broker.quarterMap.get(quarter) || 0),
        }));

        return {
          id: broker.id,
          name: broker.name,
          billingTarget: Math.round(broker.billingTarget),
          currentStanding: Math.round(broker.currentStanding),
          monthly,
          quarterly,
        };
      })
      .sort((a, b) => b.currentStanding - a.currentStanding || a.name.localeCompare(b.name));
  }, [data.brokers, data.deals]);

  const filteredBrokers = useMemo(() => {
    return rows.filter(broker => broker.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [rows, searchQuery]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-stone-900">Broker Performance Dashboard</h1>
        <p className="text-stone-600">
          Live broker progress against billing target based on broker-linked deals
        </p>
        <p className="text-xs text-stone-500 mt-1">
          {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Live sync pending...'}
        </p>
      </div>

      <div className="max-w-md">
        <div className="relative">
          <IoSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search broker name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBrokers.map(broker => {
          const percentage = getPercentage(broker.currentStanding, broker.billingTarget);
          return (
            <div key={broker.id} className="bg-white rounded-lg border border-stone-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-stone-900">{broker.name}</h3>
                <span className="text-sm font-bold text-blue-700">{percentage}%</span>
              </div>
              <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-700 rounded-full"
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
              </div>
              <p className="text-sm text-stone-600">
                Current Billing: <span className="font-semibold text-stone-900">{formatRand(broker.currentStanding)}</span>
              </p>
              <p className="text-sm text-stone-600">
                Target: <span className="font-semibold text-stone-900">{formatRand(broker.billingTarget)}</span>
              </p>
              <div className="mt-4">
                <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide mb-2">
                  Recent Monthly Performance
                </p>
                {broker.monthly.length === 0 ? (
                  <p className="text-xs text-stone-500">No monthly billing activity yet.</p>
                ) : (
                  <div className="space-y-1">
                    {broker.monthly.slice(0, 3).map(row => (
                      <div key={row.month} className="flex items-center justify-between text-xs text-stone-700">
                        <span>{row.month}</span>
                        <span>{row.nod} deals</span>
                        <span className="font-semibold">{formatRand(row.averageValue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && filteredBrokers.length === 0 && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-8 text-center text-stone-500">
          No brokers found.
        </div>
      )}
    </div>
  );
}
