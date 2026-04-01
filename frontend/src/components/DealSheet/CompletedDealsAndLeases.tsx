'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FiFileText, FiFilter, FiSearch } from 'react-icons/fi';
import { calculateCommissionSplit } from '@/lib/dealSheetCalculations';
import { formatRand } from '@/lib/currency';
import { useDealSheetRealtime } from '@/hooks/useDealSheetRealtime';
import { legalDocService } from '@/services/legalDocService';
import {
  estimateDealGrossCommission,
  estimateForecastGrossCommission,
  getIsoDate,
  isAwaitingPaymentStatus,
  isClosedDeal,
  isClosedForecastDeal,
  isLostStatus,
  normalizeDealType,
} from '@/services/dealSheetRealtimeService';

interface CompletedDealRow {
  id: string;
  dealRefId: string;
  dealName: string;
  dealType: 'Leasing' | 'Sales' | 'Auction';
  closedDate: string;
  actualValue: number;
  category: 'Lease' | 'Sale' | 'Auction';
  counterparty: string;
  propertyName: string;
  commissionRate: number;
  commissionAmount: number;
  status: string;
}

const categoryMap: Record<'Leasing' | 'Sales' | 'Auction', 'Lease' | 'Sale' | 'Auction'> = {
  Leasing: 'Lease',
  Sales: 'Sale',
  Auction: 'Auction',
};

export default function CompletedDealsAndLeases() {
  const { data, isLoading, error, lastUpdated } = useDealSheetRealtime();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [docCountByDealId, setDocCountByDealId] = useState<Record<string, number>>({});
  const [docCountByDealName, setDocCountByDealName] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;

    const loadDocumentLinks = async () => {
      try {
        const docs = await legalDocService.getAllDocuments();
        const byId: Record<string, number> = {};
        const byName: Record<string, number> = {};

        docs.forEach(doc => {
          const linkedDeals = Array.isArray(doc.linkedDeals) ? doc.linkedDeals : [];
          linkedDeals.forEach((linkedDeal: any) => {
            const dealId = String(linkedDeal?.dealId || '').trim();
            const dealName = String(linkedDeal?.dealName || '').trim();
            if (dealId) byId[dealId] = (byId[dealId] || 0) + 1;
            if (dealName) byName[dealName.toLowerCase()] = (byName[dealName.toLowerCase()] || 0) + 1;
          });
        });

        if (active) {
          setDocCountByDealId(byId);
          setDocCountByDealName(byName);
        }
      } catch {
        if (active) {
          setDocCountByDealId({});
          setDocCountByDealName({});
        }
      }
    };

    void loadDocumentLinks();
    const interval = setInterval(() => void loadDocumentLinks(), 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const categories = ['all', 'Lease', 'Sale', 'Auction'];
  const dealTypes = ['all', 'Leasing', 'Sales', 'Auction'];

  const completedDeals = useMemo<CompletedDealRow[]>(() => {
    const closedDeals = data.deals.filter(
      deal =>
        isClosedDeal(deal) && !isLostStatus(deal.status) && !isAwaitingPaymentStatus(deal.status)
    );
    const closedDealIds = new Set(closedDeals.map(deal => String(deal.id)));

    const dealRows: CompletedDealRow[] = closedDeals.map(deal => {
      const dealType = normalizeDealType(deal.type);
      const commissionAmount = estimateDealGrossCommission(deal.value);
      return {
        id: deal.id,
        dealRefId: deal.id,
        dealName: deal.title,
        dealType,
        closedDate: getIsoDate(deal.closedDate || deal.updatedAt || deal.createdAt),
        actualValue: Number(deal.value || 0),
        category: categoryMap[dealType],
        counterparty: '-',
        propertyName: '-',
        commissionRate: 5,
        commissionAmount,
        status: String(deal.status || 'Closed'),
      };
    });

    const forecastRows: CompletedDealRow[] = data.forecastDeals
      .filter(
        deal =>
          isClosedForecastDeal(deal) &&
          !isLostStatus(deal.status) &&
          !isAwaitingPaymentStatus(deal.status) &&
          (!deal.dealId || !closedDealIds.has(String(deal.dealId)))
      )
      .map(deal => {
        const dealType = normalizeDealType(deal.moduleType);
        const commissionAmount = estimateForecastGrossCommission(deal);
        const commissionRate = Number(deal.commissionRate || 0) > 0 ? Number(deal.commissionRate) * 100 : 5;
        return {
          id: `forecast-${deal.id}`,
          dealRefId: String(deal.id),
          dealName: deal.title,
          dealType,
          closedDate: getIsoDate(
            deal.expectedPaymentDate || deal.forecastedClosureDate || deal.updatedAt || deal.createdAt
          ),
          actualValue: Number(deal.expectedValue || 0),
          category: categoryMap[dealType],
          counterparty: '-',
          propertyName: '-',
          commissionRate,
          commissionAmount,
          status: String(deal.status || 'Closed'),
        };
      });

    return [...dealRows, ...forecastRows].sort((a, b) => b.closedDate.localeCompare(a.closedDate));
  }, [data.deals, data.forecastDeals]);

  const filteredDeals = useMemo(() => {
    return completedDeals.filter(deal => {
      const query = searchTerm.toLowerCase();
      const matchesSearch =
        deal.dealName.toLowerCase().includes(query) ||
        deal.counterparty.toLowerCase().includes(query) ||
        deal.propertyName.toLowerCase().includes(query);

      const matchesCategory = selectedCategory === 'all' || deal.category === selectedCategory;
      const matchesType = selectedType === 'all' || deal.dealType === selectedType;

      return matchesSearch && matchesCategory && matchesType;
    });
  }, [completedDeals, searchTerm, selectedCategory, selectedType]);

  const categoryTotals = useMemo(() => {
    const totals: Record<'Lease' | 'Sale' | 'Auction', { value: number; commission: number; companyComm: number; brokerComm: number; count: number }> = {
      Lease: { value: 0, commission: 0, companyComm: 0, brokerComm: 0, count: 0 },
      Sale: { value: 0, commission: 0, companyComm: 0, brokerComm: 0, count: 0 },
      Auction: { value: 0, commission: 0, companyComm: 0, brokerComm: 0, count: 0 },
    };

    completedDeals.forEach(deal => {
      const split = calculateCommissionSplit(deal.commissionAmount);
      totals[deal.category].value += deal.actualValue;
      totals[deal.category].commission += deal.commissionAmount;
      totals[deal.category].companyComm += split.companyComm;
      totals[deal.category].brokerComm += split.brokerComm;
      totals[deal.category].count += 1;
    });

    return totals;
  }, [completedDeals]);

  const totalValue = filteredDeals.reduce((sum, deal) => sum + deal.actualValue, 0);
  const totalCommission = filteredDeals.reduce((sum, deal) => sum + deal.commissionAmount, 0);
  const totalCommissionSplit = calculateCommissionSplit(totalCommission);
  const averageCommissionRate =
    filteredDeals.length > 0
      ? filteredDeals.reduce((sum, deal) => sum + deal.commissionRate, 0) / filteredDeals.length
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-900">Completed Leases & Sales</h2>
        <p className="text-sm text-stone-600 mt-1">
          Historical record of all closed deals with commission tracking
        </p>
        <p className="text-xs text-stone-500 mt-1">
          {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Live sync pending...'}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {categories.slice(1).map(category => (
          <div key={category} className="bg-white rounded-lg border border-stone-200 p-4 shadow-sm">
            <p className="text-sm font-medium text-stone-600 mb-2">{category}s</p>
            <p className="text-xl font-bold text-stone-900">
              {formatRand(categoryTotals[category as 'Lease' | 'Sale' | 'Auction'].value)}
            </p>
            <div className="mt-2 space-y-1">
              <p className="text-xs text-stone-600">
                Commission: R
                {formatRand(categoryTotals[category as 'Lease' | 'Sale' | 'Auction'].commission)}
              </p>
              <p className="text-xs text-blue-700">
                Company (55%): R
                {formatRand(categoryTotals[category as 'Lease' | 'Sale' | 'Auction'].companyComm)}
              </p>
              <p className="text-xs text-emerald-700">
                Broker (45%): R
                {formatRand(categoryTotals[category as 'Lease' | 'Sale' | 'Auction'].brokerComm)}
              </p>
              <p className="text-xs text-stone-600">
                {categoryTotals[category as 'Lease' | 'Sale' | 'Auction'].count} deals completed
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-stone-200 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2 bg-stone-50 rounded px-3 py-2">
            <FiSearch className="text-stone-400" />
            <input
              type="text"
              placeholder="Search deals, counterparties..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-transparent outline-none text-sm flex-1 text-stone-900 placeholder-stone-500"
            />
          </div>
          <div className="flex items-center gap-2 bg-stone-50 rounded px-3 py-2">
            <FiFilter className="text-stone-400" />
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="bg-transparent outline-none text-sm flex-1 text-stone-900"
            >
              <option value="all">All Categories</option>
              <option value="Lease">Leases</option>
              <option value="Sale">Sales</option>
              <option value="Auction">Auctions</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-stone-50 rounded px-3 py-2">
            <FiFilter className="text-stone-400" />
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="bg-transparent outline-none text-sm flex-1 text-stone-900"
            >
              {dealTypes.map(type => (
                <option key={type} value={type}>
                  {type === 'all' ? 'All Deal Types' : type}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <p className="text-sm font-medium text-stone-600">Total Revenue</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{formatRand(totalValue)}</p>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <p className="text-sm font-medium text-stone-600">Gross Commission</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatRand(totalCommission)}</p>
        </div>
        <div className="bg-sky-50 rounded-lg border border-sky-200 p-4">
          <p className="text-sm font-medium text-stone-600">Company (55%)</p>
          <p className="text-2xl font-bold text-sky-700 mt-1">
            {formatRand(totalCommissionSplit.companyComm)}
          </p>
        </div>
        <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4">
          <p className="text-sm font-medium text-stone-600">Broker (45%)</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">
            {formatRand(totalCommissionSplit.brokerComm)}
          </p>
        </div>
        <div className="bg-purple-50 rounded-lg border border-purple-200 p-4">
          <p className="text-sm font-medium text-stone-600">Avg Commission Rate</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{averageCommissionRate.toFixed(2)}%</p>
        </div>
        <div className="bg-orange-50 rounded-lg border border-orange-200 p-4">
          <p className="text-sm font-medium text-stone-600">Deal Count</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{filteredDeals.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="text-left text-xs font-semibold text-stone-700 px-4 py-3">Deal Name</th>
                <th className="text-left text-xs font-semibold text-stone-700 px-4 py-3">Category</th>
                <th className="text-left text-xs font-semibold text-stone-700 px-4 py-3">Counterparty</th>
                <th className="text-left text-xs font-semibold text-stone-700 px-4 py-3">Property</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Deal Value</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Commission Rate</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Commission Amount</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Company (55%)</th>
                <th className="text-right text-xs font-semibold text-stone-700 px-4 py-3">Broker (45%)</th>
                <th className="text-left text-xs font-semibold text-stone-700 px-4 py-3">Closed Date</th>
                <th className="text-left text-xs font-semibold text-stone-700 px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-stone-700 px-4 py-3">Documents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {filteredDeals.map(deal => {
                const linkedDocCount =
                  docCountByDealId[deal.dealRefId] || docCountByDealName[deal.dealName.toLowerCase()] || 0;
                const split = calculateCommissionSplit(deal.commissionAmount);
                return (
                  <tr key={deal.id} className="hover:bg-stone-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-stone-900 font-medium">{deal.dealName}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          deal.category === 'Lease'
                            ? 'bg-blue-100 text-blue-800'
                            : deal.category === 'Sale'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}
                      >
                        {deal.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-600">{deal.counterparty}</td>
                    <td className="px-4 py-3 text-sm text-stone-600">{deal.propertyName}</td>
                    <td className="px-4 py-3 text-sm text-stone-900 font-medium text-right">
                      {formatRand(deal.actualValue)}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-900 text-right">
                      {deal.commissionRate.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-900 text-right font-medium">
                      {formatRand(deal.commissionAmount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-sky-700 text-right font-medium">
                      {formatRand(split.companyComm)}
                    </td>
                    <td className="px-4 py-3 text-sm text-emerald-700 text-right font-medium">
                      {formatRand(split.brokerComm)}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-600">
                      {deal.closedDate ? new Date(deal.closedDate).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                        {deal.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {linkedDocCount > 0 ? (
                        <div className="flex items-center gap-2">
                          <FiFileText className="text-blue-600" size={16} />
                          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            {linkedDocCount} doc{linkedDocCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-stone-400">No documents</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!isLoading && filteredDeals.length === 0 && (
        <div className="text-center py-8 bg-stone-50 rounded-lg border border-stone-200">
          <p className="text-stone-500">No completed deals found for the selected filters</p>
        </div>
      )}
    </div>
  );
}
