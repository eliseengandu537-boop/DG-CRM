'use client';

import React, { useMemo, useState } from 'react';
import { formatRand } from '@/lib/currency';
import { parseDealTitle } from '@/lib/dealTitle';
import { useDealSheetRealtime } from '@/hooks/useDealSheetRealtime';
import { normalizeDealType } from '@/services/dealSheetRealtimeService';

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

export default function ForecastAuctionDeals() {
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

  const auctionDeals = useMemo(() => {
    return data.forecastDeals
      .filter(deal => normalizeDealType(deal.moduleType) === 'Auction')
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
          forecastedClosureDate: deal.forecastedClosureDate || deal.createdAt,
        };
      });
  }, [data.forecastDeals, brokerById, dealById, propertyById]);

  const filteredDeals = useMemo(() => {
    return auctionDeals.filter(deal => {
      const query = searchTerm.toLowerCase();
      const matchesSearch =
        deal.dealName.toLowerCase().includes(query) ||
        deal.contactName.toLowerCase().includes(query) ||
        deal.propertyName.toLowerCase().includes(query);
      const matchesQuarter = selectedQuarter === 'all' || deal.quarter === selectedQuarter;
      return matchesSearch && matchesQuarter;
    });
  }, [auctionDeals, searchTerm, selectedQuarter]);

  const totalExpectedValue = filteredDeals.reduce((sum, d) => sum + d.expectedValue, 0);
  const totalWeightedValue = filteredDeals.reduce((sum, d) => sum + d.weightedValue, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-900">Forecast Deals - Auction</h2>
        <p className="text-sm text-stone-600 mt-1">Live auction pipeline forecast by quarter</p>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Search auctions, brokers..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
          <select
            value={selectedQuarter}
            onChange={e => setSelectedQuarter(e.target.value)}
            className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
          >
            {quarters.map(quarter => (
              <option key={quarter} value={quarter}>
                {quarter === 'all' ? 'All Quarters' : quarter}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <p className="text-sm font-medium text-stone-600">Total Expected Value</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{formatRand(totalExpectedValue)}</p>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <p className="text-sm font-medium text-stone-600">Weighted Pipeline Value</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatRand(totalWeightedValue)}</p>
        </div>
        <div className="bg-purple-50 rounded-lg border border-purple-200 p-4">
          <p className="text-sm font-medium text-stone-600">Deal Count</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{filteredDeals.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="text-left text-xs font-semibold text-stone-700 px-4 py-3">Auction Name</th>
                <th className="text-left text-xs font-semibold text-stone-700 px-4 py-3">Broker</th>
                <th className="text-left text-xs font-semibold text-stone-700 px-4 py-3">Property</th>
                <th className="text-left text-xs font-semibold text-stone-700 px-4 py-3">Quarter</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Expected Value</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Probability</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Weighted Value</th>
                <th className="text-left text-xs font-semibold text-stone-700 px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-stone-700 px-4 py-3">Forecast Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {filteredDeals.map(deal => (
                <tr key={deal.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-stone-900 font-medium">{deal.dealName}</td>
                  <td className="px-4 py-3 text-sm text-stone-600">{deal.contactName}</td>
                  <td className="px-4 py-3 text-sm text-stone-600">{deal.propertyName}</td>
                  <td className="px-4 py-3 text-sm text-stone-700 font-medium">{deal.quarter}</td>
                  <td className="px-4 py-3 text-sm text-stone-900 font-medium text-right">
                    {formatRand(deal.expectedValue)}
                  </td>
                  <td className="px-4 py-3 text-sm text-stone-900 text-right font-semibold">
                    {deal.probability}%
                  </td>
                  <td className="px-4 py-3 text-sm text-stone-900 text-right font-medium">
                    {formatRand(deal.weightedValue)}
                  </td>
                  <td className="px-4 py-3 text-sm text-stone-700">{deal.status}</td>
                  <td className="px-4 py-3 text-sm text-stone-600">
                    {new Date(deal.forecastedClosureDate).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!isLoading && filteredDeals.length === 0 && (
        <div className="text-center py-8 bg-stone-50 rounded-lg border border-stone-200">
          <p className="text-stone-500">No auction deals found for the selected filters</p>
        </div>
      )}
    </div>
  );
}
