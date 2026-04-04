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
        const parsedTitle = parseDealTitle(deal.title);
        const linkedDealId = String(deal.dealId || '').trim();
        const linkedDeal = linkedDealId ? dealById.get(linkedDealId) : undefined;
        const linkedProperty = linkedDeal?.propertyId
          ? propertyById.get(linkedDeal.propertyId)
          : undefined;
        const auctionCommPercent = Number(deal.auctionCommissionPercent || 10);
        const referralPercent = Number(deal.auctionReferralPercent || 35);
        const assetVal = Number(deal.assetValue || deal.expectedValue || 0);
        // Auction chain: assetValue × auctionCommPercent% = auctionHouseComm; auctionHouseComm × referralPercent% = DG gross
        const auctionHouseComm = Math.round(assetVal * (auctionCommPercent / 100) * 100) / 100;
        // Use stored commissionAmount (DG gross) if available, otherwise calculate
        const dgGrossComm = Number(deal.commissionAmount || 0) > 0
          ? Number(deal.commissionAmount)
          : Math.round(auctionHouseComm * (referralPercent / 100) * 100) / 100;
        const split = calculateCommissionSplit(dgGrossComm);
        const companyComm = Number(deal.companyCommission || 0) > 0 ? Number(deal.companyCommission) : split.companyComm;
        const brokerComm = Number(deal.brokerCommission || 0) > 0 ? Number(deal.brokerCommission) : split.brokerComm;

        return {
          id: deal.id,
          dealName: parsedTitle.dealName,
          contactName: brokerById.get(deal.brokerId) || 'Unassigned',
          propertyName: formatFullLocation(linkedProperty) || parsedTitle.location,
          quarter,
          assetValue: assetVal,
          auctionHouseComm,
          auctionCommPercent,
          referralPercent,
          dgGrossComm,
          companyComm,
          brokerComm,
          probability,
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

  const totalAssetValue = filteredDeals.reduce((sum, d) => sum + d.assetValue, 0);
  const totalDgGrossComm = filteredDeals.reduce((sum, d) => sum + d.dgGrossComm, 0);
  const totalCompanyComm = filteredDeals.reduce((sum, d) => sum + d.companyComm, 0);
  const totalBrokerComm = filteredDeals.reduce((sum, d) => sum + d.brokerComm, 0);

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <p className="text-sm font-medium text-stone-600">Total Asset Value</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{formatRand(totalAssetValue)}</p>
          <p className="text-xs text-stone-500 mt-1">{filteredDeals.length} deals</p>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <p className="text-sm font-medium text-stone-600">DG Gross Commission</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatRand(totalDgGrossComm)}</p>
          <p className="text-xs text-stone-500 mt-1">After auction chain</p>
        </div>
        <div className="bg-sky-50 rounded-lg border border-sky-200 p-4">
          <p className="text-sm font-medium text-stone-600">Company (55%)</p>
          <p className="text-2xl font-bold text-sky-700 mt-1">{formatRand(totalCompanyComm)}</p>
        </div>
        <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4">
          <p className="text-sm font-medium text-stone-600">Broker (45%)</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{formatRand(totalBrokerComm)}</p>
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
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Asset Value</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Auction Comm %</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Auction Comm (R)</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">DG Referral %</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">DG Gross Comm</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Company (55%)</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Broker (45%)</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Probability</th>
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
                    {formatRand(deal.assetValue)}
                  </td>
                  <td className="px-4 py-3 text-sm text-stone-900 text-right font-semibold">
                    {deal.auctionCommPercent}%
                  </td>
                  <td className="px-4 py-3 text-sm text-stone-900 text-right">
                    {formatRand(deal.auctionHouseComm)}
                  </td>
                  <td className="px-4 py-3 text-sm text-stone-900 text-right font-semibold">
                    {deal.referralPercent}%
                  </td>
                  <td className="px-4 py-3 text-sm text-stone-900 font-bold text-right">
                    {formatRand(deal.dgGrossComm)}
                  </td>
                  <td className="px-4 py-3 text-sm text-sky-700 font-medium text-right">
                    {formatRand(deal.companyComm)}
                  </td>
                  <td className="px-4 py-3 text-sm text-emerald-700 font-medium text-right">
                    {formatRand(deal.brokerComm)}
                  </td>
                  <td className="px-4 py-3 text-sm text-stone-900 text-right font-semibold">
                    {deal.probability}%
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
