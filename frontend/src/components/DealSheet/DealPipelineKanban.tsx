'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiCalendar,
  FiClock,
  FiUser,
  FiSearch,
  FiAlertCircle,
  FiRefreshCw,
} from 'react-icons/fi';
import { dealService, type Deal } from '@/services/dealService';
import { brokerService, type Broker } from '@/services/brokerService';
import { useAuth } from '@/context/AuthContext';
import { formatRand } from '@/lib/currency';

// Active-pipeline columns only. Closed / Won / Awaiting-Payment live elsewhere
// (Completed tab + Awaiting Payment tab) — they don't need a Kanban view.
const PIPELINE_STATUSES: Array<{ key: Deal['status']; label: string; color: string }> = [
  { key: 'LOI', label: 'LOI', color: 'bg-sky-500' },
  { key: 'OTP', label: 'OTP', color: 'bg-indigo-500' },
  { key: 'OTL', label: 'OTL', color: 'bg-violet-500' },
  { key: 'LEASE_AGREEMENT', label: 'Lease Agreement', color: 'bg-purple-500' },
  { key: 'SALE_AGREEMENT', label: 'Sale Agreement', color: 'bg-fuchsia-500' },
];

const STATUS_LABEL_TO_KEY: Record<string, string> = {
  LOI: 'LOI',
  OTP: 'OTP',
  OTL: 'OTL',
  'Lease Agreement': 'LEASE_AGREEMENT',
  LEASE_AGREEMENT: 'LEASE_AGREEMENT',
  'Sale Agreement': 'SALE_AGREEMENT',
  SALE_AGREEMENT: 'SALE_AGREEMENT',
};

function ageDays(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function ageBadgeClass(days: number): string {
  if (days <= 7) return 'bg-emerald-100 text-emerald-700';
  if (days <= 14) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-ZA', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

const DealPipelineKanban: React.FC = () => {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [brokerFilter, setBrokerFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [savingDealId, setSavingDealId] = useState<string | null>(null);

  const isBroker = user?.role === 'broker';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dealsRes, brokersRes] = await Promise.all([
        dealService.getAllDeals({ limit: 500 }),
        brokerService.getAllBrokers().catch(() => [] as Broker[]),
      ]);
      setDeals(dealsRes.data);
      setBrokers(Array.isArray(brokersRes) ? brokersRes : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deals.filter((d) => {
      if (brokerFilter !== 'all' && d.brokerId !== brokerFilter) return false;
      if (typeFilter !== 'all' && d.type !== typeFilter) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        (d.clientName || '').toLowerCase().includes(q) ||
        (d.assignedBrokerName || '').toLowerCase().includes(q)
      );
    });
  }, [deals, search, brokerFilter, typeFilter]);

  const dealsByColumn = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const col of PIPELINE_STATUSES) map[col.key] = [];
    for (const d of filteredDeals) {
      const key = STATUS_LABEL_TO_KEY[d.status] || d.status;
      if (map[key]) map[key].push(d);
    }
    return map;
  }, [filteredDeals]);

  const handleDrop = useCallback(
    async (targetStatus: string) => {
      if (!draggingId) return;
      const deal = deals.find((d) => d.id === draggingId);
      setDraggingId(null);
      setDragOverCol(null);
      if (!deal) return;
      const currentKey = STATUS_LABEL_TO_KEY[deal.status] || deal.status;
      if (currentKey === targetStatus) return;

      setSavingDealId(deal.id);
      // Optimistic update
      setDeals((prev) =>
        prev.map((d) => (d.id === deal.id ? { ...d, status: targetStatus } : d))
      );
      try {
        const updated = await dealService.updateDeal(deal.id, { status: targetStatus });
        setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      } catch (err) {
        // Revert on failure
        setDeals((prev) => prev.map((d) => (d.id === deal.id ? deal : d)));
        setError(err instanceof Error ? err.message : 'Could not move deal.');
        setTimeout(() => setError(null), 4000);
      } finally {
        setSavingDealId(null);
      }
    },
    [draggingId, deals]
  );

  const totalValue = (list: Deal[]) =>
    list.reduce((sum, d) => sum + (d.assetValue ?? d.value ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deal, client, broker..."
            className="w-full rounded-lg border border-stone-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        {!isBroker && (
          <select
            value={brokerFilter}
            onChange={(e) => setBrokerFilter(e.target.value)}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="all">All Brokers</option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="all">All Types</option>
          <option value="sale">Sale</option>
          <option value="lease">Lease</option>
          <option value="auction">Auction</option>
        </select>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        <div className="ml-auto text-xs text-stone-500">
          {filteredDeals.length} active {filteredDeals.length === 1 ? 'deal' : 'deals'}
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
          <FiAlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {PIPELINE_STATUSES.map((col) => {
          const colDeals = dealsByColumn[col.key] || [];
          const value = totalValue(colDeals);
          const isOver = dragOverCol === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(col.key);
              }}
              onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
              onDrop={() => void handleDrop(col.key)}
              className={`rounded-xl border-2 bg-stone-50 min-h-[300px] flex flex-col transition-colors ${
                isOver ? 'border-violet-400 bg-violet-50' : 'border-transparent'
              }`}
            >
              {/* Column header */}
              <div className="px-3 py-2 border-b border-stone-200/60 bg-white/60 rounded-t-xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full ${col.color} shrink-0`} />
                    <p className="text-sm font-semibold text-stone-900 truncate">{col.label}</p>
                  </div>
                  <span className="text-[11px] font-semibold bg-stone-100 text-stone-700 rounded-full px-2 py-0.5">
                    {colDeals.length}
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 mt-0.5">{formatRand(value)}</p>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
                {colDeals.length === 0 ? (
                  <div className="text-[11px] text-stone-400 italic text-center py-6">
                    No deals here
                  </div>
                ) : (
                  colDeals.map((deal) => {
                    const age = ageDays(deal.lastActivityAt || deal.updatedAt);
                    const isSaving = savingDealId === deal.id;
                    const dueSoon =
                      deal.nextActionDue &&
                      new Date(deal.nextActionDue).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000;
                    return (
                      <div
                        key={deal.id}
                        draggable={!isSaving}
                        onDragStart={() => setDraggingId(deal.id)}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverCol(null);
                        }}
                        className={`rounded-lg border border-stone-200 bg-white p-2.5 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${
                          draggingId === deal.id ? 'opacity-50' : ''
                        } ${isSaving ? 'opacity-60' : ''}`}
                      >
                        <p className="text-sm font-semibold text-stone-900 leading-tight line-clamp-2">
                          {deal.title}
                        </p>
                        {deal.clientName && (
                          <p className="text-[11px] text-stone-500 mt-0.5 truncate">
                            {deal.clientName}
                          </p>
                        )}
                        <p className="text-xs font-bold text-emerald-700 mt-1.5">
                          {formatRand(deal.assetValue ?? deal.value ?? 0)}
                        </p>

                        {deal.nextAction && (
                          <div className="mt-2 flex items-start gap-1 text-[11px] text-stone-600 bg-stone-50 rounded px-1.5 py-1">
                            <FiClock size={10} className="mt-0.5 shrink-0 text-stone-400" />
                            <span className="line-clamp-2">{deal.nextAction}</span>
                          </div>
                        )}

                        <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ageBadgeClass(age)}`}
                            title={`${age} day${age === 1 ? '' : 's'} since last activity`}
                          >
                            <FiClock size={9} />
                            {age}d
                          </span>
                          {deal.nextActionDue && (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                dueSoon ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-600'
                              }`}
                              title="Next action due"
                            >
                              <FiCalendar size={9} />
                              {formatDate(deal.nextActionDue)}
                            </span>
                          )}
                          {deal.assignedBrokerName && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-stone-600"
                              title={deal.assignedBrokerName}
                            >
                              <FiUser size={9} />
                              <span className="truncate max-w-[80px]">
                                {deal.assignedBrokerName}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {loading && deals.length === 0 && (
        <p className="text-center text-sm text-stone-400 py-8">Loading pipeline...</p>
      )}
    </div>
  );
};

export default DealPipelineKanban;
