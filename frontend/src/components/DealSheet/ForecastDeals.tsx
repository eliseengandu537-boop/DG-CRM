'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiChevronLeft, FiFileText, FiSearch } from 'react-icons/fi';
import { calculateCommissionSplit } from '@/lib/dealSheetCalculations';
import { useDealSheetRealtime } from '@/hooks/useDealSheetRealtime';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { formatRand } from '@/lib/currency';
import { parseDealTitle } from '@/lib/dealTitle';
import {
  estimateForecastGrossCommission,
  normalizeDealType,
} from '@/services/dealSheetRealtimeService';
import { legalDocService } from '@/services/legalDocService';
import ForecastLeasingDeals from './ForecastLeasingDeals';
import ForecastSalesDeals from './ForecastSalesDeals';
import ForecastAuctionDeals from './ForecastAuctionDeals';

type ForecastType = 'Leasing' | 'Sales' | 'Auction';

const formatCurrency = (value: number) =>
  formatRand(value);

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' });
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

const LEGAL_DOC_REFRESH_EVENTS = [
  'legal-doc:created',
  'legal-doc:updated',
  'legal-doc:deleted',
  'legal-doc:linked',
];

export default function ForecastDeals() {
  const { data, isLoading, error, lastUpdated } = useDealSheetRealtime();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'All' | ForecastType>('All');
  const [monthFilter, setMonthFilter] = useState<string>('All');
  const [subTab, setSubTab] = useState<'all' | 'leasing' | 'sales' | 'auction'>('all');
  const [docCountByDealId, setDocCountByDealId] = useState<Record<string, number>>({});
  const [docCountByDealName, setDocCountByDealName] = useState<Record<string, number>>({});

  const loadDocumentLinks = useCallback(async () => {
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

      setDocCountByDealId(byId);
      setDocCountByDealName(byName);
    } catch {
      setDocCountByDealId({});
      setDocCountByDealName({});
    }
  }, []);

  useEffect(() => {
    void loadDocumentLinks();
    const interval = setInterval(() => void loadDocumentLinks(), 10000);

    return () => {
      clearInterval(interval);
    };
  }, [loadDocumentLinks]);

  useRealtimeRefresh(() => {
    void loadDocumentLinks();
  }, LEGAL_DOC_REFRESH_EVENTS);

  const brokerById = useMemo(
    () => new Map(data.brokers.map(broker => [broker.id, broker.name])),
    [data.brokers]
  );
  const dealById = useMemo(() => new Map(data.deals.map(deal => [deal.id, deal])), [data.deals]);
  const propertyById = useMemo(
    () => new Map(data.properties.map(property => [property.id, property])),
    [data.properties]
  );

  const forecastRows = useMemo(() => {
    return data.forecastDeals.map(deal => {
      const type = normalizeDealType(deal.moduleType);
      const grossComm = estimateForecastGrossCommission(deal);
      const split = calculateCommissionSplit(grossComm);
      const forecastedClose =
        deal.forecastedClosureDate || deal.expectedPaymentDate || deal.createdAt || '';
      const parsedTitle = parseDealTitle(deal.title);
      const linkedDealId = String(deal.dealId || '').trim();
      const linkedDeal = linkedDealId ? dealById.get(linkedDealId) : undefined;
      const linkedProperty = linkedDeal?.propertyId
        ? propertyById.get(linkedDeal.propertyId)
        : undefined;
      const fullLocation = formatFullLocation(linkedProperty);

      return {
        id: deal.id,
        dealId: linkedDealId,
        rawTitle: deal.title,
        dealName: parsedTitle.dealName,
        location: fullLocation || parsedTitle.location,
        broker: brokerById.get(deal.brokerId) || 'Unassigned',
        type,
        expectedValue: Number(deal.expectedValue || 0),
        grossComm: split.grossComm,
        companyComm: Number(deal.companyCommission || 0) > 0 ? Number(deal.companyCommission || 0) : split.companyComm,
        brokerComm: Number(deal.brokerCommission || 0) > 0 ? Number(deal.brokerCommission || 0) : split.brokerComm,
        forecastedClose,
        stage: deal.status,
      };
    });
  }, [data.forecastDeals, brokerById, dealById, propertyById]);

  const filteredRows = useMemo(() => {
    return forecastRows.filter(row => {
      const matchesType = filterType === 'All' || row.type === filterType;
      const matchesSearch =
        row.broker.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.dealName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.location.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesMonth =
        monthFilter === 'All' ||
        new Date(row.forecastedClose).toLocaleString('en-US', { month: 'short' }) === monthFilter;

      return matchesType && matchesSearch && matchesMonth;
    });
  }, [filterType, forecastRows, monthFilter, searchQuery]);

  const totals = useMemo(() => {
    return {
      dealCount: filteredRows.length,
      dealValue: filteredRows.reduce((sum, row) => sum + row.expectedValue, 0),
      grossComm: filteredRows.reduce((sum, row) => sum + row.grossComm, 0),
      companyComm: filteredRows.reduce((sum, row) => sum + row.companyComm, 0),
      brokerComm: filteredRows.reduce((sum, row) => sum + row.brokerComm, 0),
    };
  }, [filteredRows]);

  if (subTab === 'leasing') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSubTab('all')}
          className="flex items-center gap-2 px-4 py-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-all border border-green-200"
        >
          <FiChevronLeft size={18} />
          Back to All Deals
        </button>
        <ForecastLeasingDeals />
      </div>
    );
  }

  if (subTab === 'sales') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSubTab('all')}
          className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all border border-blue-200"
        >
          <FiChevronLeft size={18} />
          Back to All Deals
        </button>
        <ForecastSalesDeals />
      </div>
    );
  }

  if (subTab === 'auction') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSubTab('all')}
          className="flex items-center gap-2 px-4 py-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-all border border-amber-200"
        >
          <FiChevronLeft size={18} />
          Back to All Deals
        </button>
        <ForecastAuctionDeals />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap bg-white rounded-lg border border-stone-200 p-3 shadow-sm">
        <button
          onClick={() => setSubTab('all')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
            subTab === 'all' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-stone-700 border-stone-300'
          }`}
        >
          All Forecast Deals
        </button>
        <button
          onClick={() => setSubTab('leasing')}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-all border bg-white text-stone-700 border-stone-300 hover:border-green-300"
        >
          Leasing Forecast
        </button>
        <button
          onClick={() => setSubTab('sales')}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-all border bg-white text-stone-700 border-stone-300 hover:border-blue-300"
        >
          Sales Forecast
        </button>
        <button
          onClick={() => setSubTab('auction')}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-all border bg-white text-stone-700 border-stone-300 hover:border-amber-300"
        >
          Auction Forecast
        </button>
      </div>

      <div className="min-h-screen bg-gradient-to-br from-stone-50 via-stone-50 to-purple-50 p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-stone-950">Forecast Deals Pipeline</h1>
          <p className="text-stone-600">Live forecast pipeline and commission projections</p>
          <p className="text-xs text-stone-500 mt-1">
            {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Live sync pending...'}
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="relative md:col-span-2">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search by broker, deal name, or location..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-stone-300 rounded-lg"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as 'All' | ForecastType)}
              className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
            >
              <option value="All">All Types</option>
              <option value="Leasing">Leasing</option>
              <option value="Sales">Sales</option>
              <option value="Auction">Auction</option>
            </select>
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
            >
              <option value="All">All Months</option>
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-stone-200 p-4">
            <p className="text-xs text-stone-600 uppercase font-semibold">Total Deals</p>
            <p className="text-2xl font-bold text-stone-900">{totals.dealCount}</p>
          </div>
          <div className="bg-white rounded-lg border border-stone-200 p-4">
            <p className="text-xs text-stone-600 uppercase font-semibold">Deal Value</p>
            <p className="text-2xl font-bold text-stone-900">{formatCurrency(totals.dealValue)}</p>
          </div>
          <div className="bg-white rounded-lg border border-stone-200 p-4">
            <p className="text-xs text-stone-600 uppercase font-semibold">Gross Comm</p>
            <p className="text-2xl font-bold text-stone-900">{formatCurrency(totals.grossComm)}</p>
          </div>
          <div className="bg-white rounded-lg border border-stone-200 p-4">
            <p className="text-xs text-stone-600 uppercase font-semibold">Company (55%)</p>
            <p className="text-2xl font-bold text-blue-700">{formatCurrency(totals.companyComm)}</p>
          </div>
          <div className="bg-white rounded-lg border border-stone-200 p-4">
            <p className="text-xs text-stone-600 uppercase font-semibold">Broker (45%)</p>
            <p className="text-2xl font-bold text-emerald-700">{formatCurrency(totals.brokerComm)}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-stone-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-700">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-700">Deal Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-700">Broker</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-700">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-700">Expected Value</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-700">Gross Comm</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-700">Company</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-700">Broker</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-700">Forecast Close</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-700">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-700">Documents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredRows.map(row => {
                  const linkedDocCount =
                    (row.dealId ? docCountByDealId[row.dealId] : 0) ||
                    docCountByDealId[row.id] ||
                    docCountByDealName[row.rawTitle.toLowerCase()] ||
                    docCountByDealName[row.dealName.toLowerCase()] ||
                    0;
                  return (
                    <tr key={row.id} className="hover:bg-stone-50">
                      <td className="px-4 py-3 text-sm text-stone-700">{row.location}</td>
                      <td className="px-4 py-3 text-sm font-medium text-stone-900">{row.dealName}</td>
                      <td className="px-4 py-3 text-sm text-stone-700">{row.broker}</td>
                      <td className="px-4 py-3 text-sm text-stone-700">{row.type}</td>
                      <td className="px-4 py-3 text-sm text-right text-stone-900">
                        {formatCurrency(row.expectedValue)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-stone-900">
                        {formatCurrency(row.grossComm)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-blue-700">
                        {formatCurrency(row.companyComm)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-emerald-700">
                        {formatCurrency(row.brokerComm)}
                      </td>
                      <td className="px-4 py-3 text-sm text-stone-700">{formatDate(row.forecastedClose)}</td>
                      <td className="px-4 py-3 text-sm text-stone-700">{row.stage}</td>
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

        {!isLoading && filteredRows.length === 0 && (
          <div className="mt-6 text-center py-8 bg-stone-50 rounded-lg border border-stone-200">
            <p className="text-stone-500">No forecast deals found for the selected filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
