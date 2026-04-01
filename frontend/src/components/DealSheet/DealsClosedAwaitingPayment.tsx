'use client';

import React, { useMemo, useState } from 'react';
import {
  calculateCommissionSplit,
  calculateInvoiceAmount,
  calculatePendingAmount,
  derivePaymentStatus,
  type DealPaymentStatus,
} from '@/lib/dealSheetCalculations';
import { useDealSheetRealtime } from '@/hooks/useDealSheetRealtime';
import {
  estimateDealGrossCommission,
  estimateForecastGrossCommission,
  getIsoDate,
  isAwaitingPaymentStatus,
  normalizeDealType,
} from '@/services/dealSheetRealtimeService';
import { formatRand } from '@/lib/currency';

interface DealAwaitingPayment {
  id: string;
  broker: string;
  dealName: string;
  dealType: 'Leasing' | 'Sales' | 'Auction';
  closedDate: string;
  expectedPaymentDate: string;
  grossComm: number;
  companyComm: number;
  brokerComm: number;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: DealPaymentStatus;
  counterparty: string;
}

function addThirtyDays(isoDate: string): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + 30);
  return date.toISOString().split('T')[0];
}

const formatCurrency = (value: number) =>
  formatRand(value);

const formatDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Paid':
      return 'bg-emerald-50 border-l-4 border-emerald-500';
    case 'Awaiting payment':
      return 'bg-amber-50 border-l-4 border-amber-500';
    case 'Overdue':
      return 'bg-red-50 border-l-4 border-red-600';
    case 'Due Soon':
      return 'bg-orange-50 border-l-4 border-orange-500';
    case 'On Track':
      return 'bg-green-50 border-l-4 border-green-500';
    default:
      return 'bg-white';
  }
};

const getStatusBadgeColor = (status: string) => {
  switch (status) {
    case 'Paid':
      return 'bg-emerald-100 text-emerald-800 border border-emerald-300';
    case 'Awaiting payment':
      return 'bg-amber-100 text-amber-800 border border-amber-300';
    case 'Overdue':
      return 'bg-red-100 text-red-800 border border-red-300';
    case 'Due Soon':
      return 'bg-orange-100 text-orange-800 border border-orange-300';
    case 'On Track':
      return 'bg-green-100 text-green-800 border border-green-300';
    default:
      return 'bg-stone-100 text-stone-800';
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case 'Sales':
      return 'bg-blue-100 text-blue-700 border border-blue-300';
    case 'Leasing':
      return 'bg-green-100 text-green-700 border border-green-300';
    case 'Auction':
      return 'bg-amber-100 text-amber-700 border border-amber-300';
    default:
      return 'bg-stone-100 text-stone-700';
  }
};

export default function DealsClosedAwaitingPayment() {
  const { data, isLoading, error, lastUpdated } = useDealSheetRealtime();
  const [filterStatus, setFilterStatus] = useState<string>('All');

  const rows = useMemo<DealAwaitingPayment[]>(() => {
    const brokerById = new Map(data.brokers.map(broker => [broker.id, broker.name]));
    const dealRows = data.deals
      .filter(deal => isAwaitingPaymentStatus(deal.status))
      .map(deal => {
        const grossComm = estimateDealGrossCommission(Number(deal.value || 0));
        const split = calculateCommissionSplit(grossComm);
        const closedDate = getIsoDate(deal.closedDate || deal.updatedAt || deal.createdAt);
        const expectedPaymentDate = addThirtyDays(closedDate);
        const paidAmount = 0;
        const pendingAmount = calculatePendingAmount(split.grossComm, paidAmount);

        return {
          id: deal.id,
          broker: brokerById.get(deal.brokerId) || 'Unassigned',
          dealName: deal.title,
          dealType: normalizeDealType(deal.type),
          closedDate,
          expectedPaymentDate,
          grossComm: split.grossComm,
          companyComm: split.companyComm,
          brokerComm: split.brokerComm,
          paidAmount,
          pendingAmount,
          paymentStatus: derivePaymentStatus({
            expectedPaymentDate,
            pendingAmount,
            paidAmount,
          }),
          counterparty: '-',
        };
      });

    const awaitingDealIds = new Set(dealRows.map(item => item.id));
    const forecastRows = data.forecastDeals
      .filter(
        deal =>
          isAwaitingPaymentStatus(deal.status) &&
          (!deal.dealId || !awaitingDealIds.has(String(deal.dealId)))
      )
      .map(deal => {
        const grossComm = estimateForecastGrossCommission(deal);
        const split = calculateCommissionSplit(grossComm);
        const closedDate = getIsoDate(deal.forecastedClosureDate || deal.updatedAt || deal.createdAt);
        const expectedPaymentDate = getIsoDate(deal.expectedPaymentDate) || addThirtyDays(closedDate);
        const paidAmount = 0;
        const pendingAmount = calculatePendingAmount(split.grossComm, paidAmount);

        return {
          id: `forecast-${deal.id}`,
          broker: brokerById.get(deal.brokerId) || 'Unassigned',
          dealName: deal.title,
          dealType: normalizeDealType(deal.moduleType),
          closedDate,
          expectedPaymentDate,
          grossComm: split.grossComm,
          companyComm: split.companyComm,
          brokerComm: split.brokerComm,
          paidAmount,
          pendingAmount,
          paymentStatus: derivePaymentStatus({
            expectedPaymentDate,
            pendingAmount,
            paidAmount,
          }),
          counterparty: '-',
        };
      });

    return [...dealRows, ...forecastRows].sort(
      (a, b) => b.expectedPaymentDate.localeCompare(a.expectedPaymentDate)
    );
  }, [data.brokers, data.deals, data.forecastDeals]);

  const filteredData =
    filterStatus === 'All' ? rows : rows.filter(deal => deal.paymentStatus === filterStatus);

  const totalGross = filteredData.reduce((sum, deal) => sum + deal.grossComm, 0);
  const totalCompany = filteredData.reduce((sum, deal) => sum + deal.companyComm, 0);
  const totalBroker = filteredData.reduce((sum, deal) => sum + deal.brokerComm, 0);
  const totalPaidAmount = filteredData.reduce((sum, deal) => sum + deal.paidAmount, 0);
  const totalPendingAmount = filteredData.reduce((sum, deal) => sum + deal.pendingAmount, 0);

  return (
    <div className="min-h-screen bg-stone-50 p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-stone-950 mb-2">Deals Awaiting Payment</h1>
        <p className="text-stone-600 mb-2">
          Commission payment tracking and collection status in real time
        </p>
        <p className="text-xs text-stone-500">
          {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Live sync pending...'}
        </p>
        <div className="border-b-2 border-stone-300 mt-4" />
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 flex items-center gap-4 flex-wrap">
        <span className="text-sm font-semibold text-stone-700">Filter by Status:</span>
        <div className="flex gap-2 flex-wrap">
          {['All', 'Paid', 'Awaiting payment', 'Overdue', 'Due Soon', 'On Track'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                filterStatus === status
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
        <span className="text-xs text-stone-500 ml-auto">
          Showing {filteredData.length} of {rows.length} deals
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-stone-800 to-stone-900 border-b border-stone-300">
              <tr>
                <th className="px-6 py-5 text-left font-bold text-white">Broker</th>
                <th className="px-6 py-5 text-left font-bold text-white">Deal Name</th>
                <th className="px-6 py-5 text-center font-bold text-white">Type</th>
                <th className="px-6 py-5 text-center font-bold text-white">Closed Date</th>
                <th className="px-6 py-5 text-center font-bold text-white">Expected Payment</th>
                <th className="px-6 py-5 text-right font-bold text-white">Gross Comm (excl. VAT)</th>
                <th className="px-6 py-5 text-right font-bold text-white">Company Comm (55%)</th>
                <th className="px-6 py-5 text-right font-bold text-white">Broker Comm (45%)</th>
                <th className="px-6 py-5 text-right font-bold text-white">Invoice Amt (incl. VAT)</th>
                <th className="px-6 py-5 text-right font-bold text-white">Paid Amount</th>
                <th className="px-6 py-5 text-right font-bold text-white">Pending Amount</th>
                <th className="px-6 py-5 text-center font-bold text-white">Payment Status</th>
                <th className="px-6 py-5 text-left font-bold text-white">Counterparty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredData.map(deal => (
                <tr key={deal.id} className={`hover:opacity-95 transition-all ${getStatusColor(deal.paymentStatus)}`}>
                  <td className="px-6 py-5 text-left">
                    <span className="font-semibold text-stone-900">{deal.broker}</span>
                  </td>
                  <td className="px-6 py-5 text-left">
                    <span className="text-stone-900 font-medium">{deal.dealName}</span>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span className={`inline-block px-3 py-1 rounded-md text-xs font-semibold ${getTypeColor(deal.dealType)}`}>
                      {deal.dealType}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span className="text-stone-700">{deal.closedDate ? formatDate(deal.closedDate) : '-'}</span>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span className="text-stone-700 font-medium">
                      {deal.expectedPaymentDate ? formatDate(deal.expectedPaymentDate) : '-'}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="font-mono text-stone-900 font-semibold">{formatCurrency(deal.grossComm)}</span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="font-mono text-blue-700 font-semibold">{formatCurrency(deal.companyComm)}</span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="font-mono text-emerald-700 font-semibold">{formatCurrency(deal.brokerComm)}</span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="font-mono text-stone-900 font-semibold">
                      {formatCurrency(calculateInvoiceAmount(deal.grossComm))}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="font-mono text-green-600 font-semibold">{formatCurrency(deal.paidAmount)}</span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="font-mono font-semibold text-amber-700">
                      {formatCurrency(deal.pendingAmount)}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span
                      className={`inline-block px-3 py-2 rounded-md text-xs font-semibold ${getStatusBadgeColor(
                        deal.paymentStatus
                      )}`}
                    >
                      {deal.paymentStatus}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-left">
                    <span className="text-stone-700">{deal.counterparty}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-stone-50 border-t border-stone-200 px-6 py-5 grid grid-cols-2 md:grid-cols-6 gap-8">
          <div>
            <p className="text-xs text-stone-600 font-semibold uppercase tracking-wide mb-2">Total Deals</p>
            <p className="text-2xl font-bold text-stone-950">{filteredData.length}</p>
          </div>
          <div>
            <p className="text-xs text-stone-600 font-semibold uppercase tracking-wide mb-2">Total Gross Comm</p>
            <p className="text-2xl font-bold text-stone-950">{formatCurrency(totalGross)}</p>
          </div>
          <div>
            <p className="text-xs text-blue-700 font-semibold uppercase tracking-wide mb-2">Company (55%)</p>
            <p className="text-2xl font-bold text-blue-700">{formatCurrency(totalCompany)}</p>
          </div>
          <div>
            <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide mb-2">Broker (45%)</p>
            <p className="text-2xl font-bold text-emerald-700">{formatCurrency(totalBroker)}</p>
          </div>
          <div>
            <p className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-2">Total Paid</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaidAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-2">Total Pending</p>
            <p className="text-2xl font-bold text-amber-700">{formatCurrency(totalPendingAmount)}</p>
          </div>
        </div>
      </div>

      {!isLoading && filteredData.length === 0 && (
        <div className="mt-6 text-center py-8 bg-stone-50 rounded-lg border border-stone-200">
          <p className="text-stone-500">No deals awaiting payment for the selected filters</p>
        </div>
      )}
    </div>
  );
}
