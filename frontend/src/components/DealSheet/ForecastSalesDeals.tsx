'use client';

import React, { useMemo, useState } from 'react';
import { formatRand } from '@/lib/currency';
import { parseDealTitle } from '@/lib/dealTitle';
import { useDealSheetRealtime } from '@/hooks/useDealSheetRealtime';
import { normalizeDealType } from '@/services/dealSheetRealtimeService';
import { calculateCommissionSplit } from '@/lib/dealSheetCalculations';

const getProbability = (status: string): number => {
  const value = String(status || '').toLowerCase();
  if (value.includes('invoice') || value.includes('won') || value.includes('closed')) return 100;
  if (value.includes('finance')) return 90;
  if (value.includes('negoti')) return 75;
  if (value.includes('proposal')) return 60;
  if (value.includes('qual')) return 40;
  return 30;
};

function formatFullLocation(property?: {
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}): string {
  const parts = [
    String(property?.address || '').trim(),
    String(property?.city || '').trim(),
    String(property?.province || '').trim(),
    String(property?.postalCode || '').trim(),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : '';
}

export default function ForecastSalesDeals() {
  const { data, isLoading } = useDealSheetRealtime();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQuarter, setSelectedQuarter] = useState<string>('all');
  const quarters = ['all', 'Q1', 'Q2', 'Q3', 'Q4'];

  const brokerById = useMemo(
    () => new Map(data.brokers.map(broker => [broker.id, broker.name])),
    [data.brokers]
  );
  const dealById = useMemo(() => new Map(data.deals.map(deal => [deal.id, deal])), [data.deals]);
  const propertyById = useMemo(
    () => new Map(data.properties.map(property => [property.id, property])),
    [data.properties]
  );

  const salesDeals = useMemo(() => {
    return data.forecastDeals
      .filter(deal => normalizeDealType(deal.moduleType) === 'Sales')
      .map(deal => {
        const date = new Date(deal.forecastedClosureDate || deal.createdAt);
        const month = date.getMonth();
        const quarter = month <= 2 ? 'Q1' : month <= 5 ? 'Q2' : month <= 8 ? 'Q3' : 'Q4';
        const probability = getProbability(deal.status);
        const expectedValue = Number(deal.expectedValue || 0);
        const parsedTitle = parseDealTitle(deal.title);
        const linkedDealId = String(deal.dealId || '').trim();
        const linkedDeal = linkedDealId ? dealById.get(linkedDealId) : undefined;
        const linkedProperty = linkedDeal?.propertyId
          ? propertyById.get(linkedDeal.propertyId)
          : undefined;
        return {
          id: deal.id,
          dealName: parsedTitle.dealName,
          contactName: brokerById.get(deal.brokerId) || 'Unassigned',
          propertyName: formatFullLocation(linkedProperty) || parsedTitle.location,
          quarter,
          expectedValue,
          probability,
          weightedValue: Math.round((expectedValue * probability) / 100),
          status: deal.status,
          grossComm: Number(deal.commissionAmount || 0) > 0
            ? Number(deal.commissionAmount)
            : Math.round(expectedValue * Number(deal.commissionRate || 0.05)),
          companyComm: Number(deal.companyCommission || 0) > 0
            ? Number(deal.companyCommission)
            : calculateCommissionSplit(Number(deal.commissionAmount || expectedValue * Number(deal.commissionRate || 0.05))).companyComm,
          brokerComm: Number(deal.brokerCommission || 0) > 0
            ? Number(deal.brokerCommission)
            : calculateCommissionSplit(Number(deal.commissionAmount || expectedValue * Number(deal.commissionRate || 0.05))).brokerComm,
        };
      });
  }, [data.forecastDeals, brokerById, dealById, propertyById]);

  const filteredDeals = useMemo(() => {
    return salesDeals.filter(deal => {
      const query = searchTerm.toLowerCase();
      const matchesSearch =
        deal.dealName.toLowerCase().includes(query) ||
        deal.contactName.toLowerCase().includes(query) ||
        deal.propertyName.toLowerCase().includes(query);
      const matchesQuarter = selectedQuarter === 'all' || deal.quarter === selectedQuarter;
      return matchesSearch && matchesQuarter;
    });
  }, [salesDeals, searchTerm, selectedQuarter]);

  const totalExpectedValue = filteredDeals.reduce((sum, d) => sum + d.expectedValue, 0);
  const totalWeightedValue = filteredDeals.reduce((sum, d) => sum + d.weightedValue, 0);
  const totalGrossComm = filteredDeals.reduce((sum, d) => sum + d.grossComm, 0);
  const totalCompanyComm = filteredDeals.reduce((sum, d) => sum + d.companyComm, 0);
  const totalBrokerComm = filteredDeals.reduce((sum, d) => sum + d.brokerComm, 0);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-stone-950">Sales Forecast</h2>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="p-4 bg-stone-50 rounded-lg border border-stone-200">
          <p className="text-stone-600 text-sm font-medium">Total Asset Value</p>
          <p className="text-3xl font-bold text-stone-900 mt-2">{formatRand(totalExpectedValue)}</p>
          <p className="text-stone-500 text-xs mt-1">{filteredDeals.length} deals</p>
        </div>
        <div className="p-4 bg-stone-50 rounded-lg border border-stone-200">
          <p className="text-stone-600 text-sm font-medium">Weighted Pipeline Value</p>
          <p className="text-3xl font-bold text-stone-900 mt-2">{formatRand(totalWeightedValue)}</p>
        </div>
        <div className="p-4 bg-stone-50 rounded-lg border border-stone-200">
          <p className="text-stone-600 text-sm font-medium">Gross Commission</p>
          <p className="text-3xl font-bold text-stone-900 mt-2">{formatRand(totalGrossComm)}</p>
        </div>
        <div className="p-4 bg-sky-50 rounded-lg border border-sky-200">
          <p className="text-stone-600 text-sm font-medium">Company (55%)</p>
          <p className="text-3xl font-bold text-sky-700 mt-2">{formatRand(totalCompanyComm)}</p>
        </div>
        <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
          <p className="text-stone-600 text-sm font-medium">Broker (45%)</p>
          <p className="text-3xl font-bold text-emerald-700 mt-2">{formatRand(totalBrokerComm)}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-lg border border-stone-200">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search deals..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
        </div>
        <div className="flex gap-2">
          {quarters.map(q => (
            <button
              key={q}
              onClick={() => setSelectedQuarter(q)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedQuarter === q
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th className="px-4 py-3 text-left font-medium text-stone-700">Deal Name</th>
              <th className="px-4 py-3 text-left font-medium text-stone-700">Broker</th>
              <th className="px-4 py-3 text-left font-medium text-stone-700">Property</th>
              <th className="px-4 py-3 text-left font-medium text-stone-700">Quarter</th>
              <th className="px-4 py-3 text-right font-medium text-stone-700">Asset Value</th>
              <th className="px-4 py-3 text-right font-medium text-stone-700">Probability</th>
              <th className="px-4 py-3 text-right font-medium text-stone-700">Gross Commission</th>
              <th className="px-4 py-3 text-right font-medium text-stone-700">Company (55%)</th>
              <th className="px-4 py-3 text-right font-medium text-stone-700">Broker (45%)</th>
              <th className="px-4 py-3 text-left font-medium text-stone-700">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredDeals.map(deal => (
              <tr key={deal.id} className="border-b border-stone-200 hover:bg-stone-50">
                <td className="px-4 py-3 font-medium text-stone-900">{deal.dealName}</td>
                <td className="px-4 py-3 text-stone-700">{deal.contactName}</td>
                <td className="px-4 py-3 text-stone-700">{deal.propertyName}</td>
                <td className="px-4 py-3 text-stone-700">{deal.quarter}</td>
                <td className="px-4 py-3 text-right text-stone-900 font-medium">{formatRand(deal.expectedValue)}</td>
                <td className="px-4 py-3 text-right text-stone-700">{deal.probability}%</td>
                <td className="px-4 py-3 text-right text-stone-900 font-medium">{formatRand(deal.grossComm)}</td>
                <td className="px-4 py-3 text-right text-sky-700 font-medium">{formatRand(deal.companyComm)}</td>
                <td className="px-4 py-3 text-right text-emerald-700 font-medium">{formatRand(deal.brokerComm)}</td>
                <td className="px-4 py-3 text-stone-700">{deal.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isLoading && filteredDeals.length === 0 && (
        <div className="text-center py-8 bg-stone-50 rounded-lg border border-stone-200">
          <p className="text-stone-500">No sales forecast deals found for the selected filters</p>
        </div>
      )}
    </div>
  );
}
