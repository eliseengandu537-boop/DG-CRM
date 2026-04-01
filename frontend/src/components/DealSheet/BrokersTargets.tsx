'use client';

import React, { useMemo, useState } from 'react';
import { IoSearch } from 'react-icons/io5';
import { formatRand } from '@/lib/currency';
import { useDealSheetRealtime } from '@/hooks/useDealSheetRealtime';
import {
  getIsoDate,
} from '@/services/dealSheetRealtimeService';

interface BrokerTargetRow {
  id: string;
  name: string;
  billingTarget: number;
  currentStanding: number;
  quarterly: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number>;
}

const getPercentage = (current: number, target: number) =>
  target > 0 ? Math.round((current / target) * 100) : 0;

const getQuarter = (isoDate: string): 'Q1' | 'Q2' | 'Q3' | 'Q4' => {
  const date = new Date(isoDate);
  const month = date.getMonth();
  if (month <= 2) return 'Q1';
  if (month <= 5) return 'Q2';
  if (month <= 8) return 'Q3';
  return 'Q4';
};

export default function BrokersTargets() {
  const { data, isLoading, error, lastUpdated } = useDealSheetRealtime();
  const [searchQuery, setSearchQuery] = useState('');

  const brokers = useMemo<BrokerTargetRow[]>(() => {
    const brokerMap = new Map<string, BrokerTargetRow>();

    for (const broker of data.brokers) {
      brokerMap.set(broker.id, {
        id: broker.id,
        name: broker.name,
        billingTarget: Math.round(Number(broker.billingTarget || 0)),
        currentStanding: Math.round(Number(broker.currentBilling || 0)),
        quarterly: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
      });
    }

    const applyValue = (brokerId: string, value: number, isoDate: string) => {
      const broker = brokerMap.get(brokerId);
      if (!broker) return;
      const quarter = getQuarter(isoDate);
      broker.quarterly[quarter] += value;
    };

    for (const deal of data.deals) {
      const isoDate = getIsoDate(deal.closedDate || deal.updatedAt || deal.createdAt);
      if (!isoDate) continue;
      applyValue(deal.brokerId, Number(deal.value || 0), isoDate);
    }

    return Array.from(brokerMap.values()).sort(
      (a, b) => b.currentStanding - a.currentStanding || a.name.localeCompare(b.name)
    );
  }, [data.brokers, data.deals]);

  const filteredBrokers = useMemo(
    () => brokers.filter(broker => broker.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [brokers, searchQuery]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-stone-900">Broker Targets Dashboard</h1>
        <p className="text-stone-600">
          Real-time target achievement based on broker-linked deals
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
            className="w-full pl-12 pr-4 py-3 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {filteredBrokers.map(broker => {
          const percentage = getPercentage(broker.currentStanding, broker.billingTarget);
          const remaining = Math.max(broker.billingTarget - broker.currentStanding, 0);
          return (
            <div key={broker.id} className="bg-white rounded-lg border border-stone-200 p-5 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-stone-900">{broker.name}</h3>
                  <p className="text-sm text-stone-600">
                    Current Billing {formatRand(broker.currentStanding)} / Target {formatRand(broker.billingTarget)}
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-2xl font-bold text-emerald-700">{percentage}%</p>
                  <p className="text-xs text-stone-500">Remaining: {formatRand(remaining)}</p>
                </div>
              </div>

              <div className="w-full h-3 bg-stone-200 rounded-full overflow-hidden mt-3">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-700 rounded-full"
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map(quarter => (
                  <div key={quarter} className="rounded-md border border-stone-200 bg-stone-50 p-3">
                    <p className="text-xs font-semibold text-stone-600">{quarter}</p>
                    <p className="text-sm font-bold text-stone-900 mt-1">
                      {formatRand(Math.round(broker.quarterly[quarter]))}
                    </p>
                    <p className="text-xs text-stone-500">
                      Req: {formatRand(Math.round((broker.billingTarget || 0) / 4))}
                    </p>
                  </div>
                ))}
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
