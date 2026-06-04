'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiActivity,
  FiSearch,
  FiFilter,
  FiChevronLeft,
  FiChevronRight,
  FiRefreshCw,
  FiUser,
  FiClock,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi';
import {
  auditLogService,
  type AuditLogRecord,
} from '@/services/auditLogService';

const ENTITY_TYPES: Array<{ value: string; label: string }> = [
  { value: '', label: 'All entity types' },
  { value: 'deal', label: 'Deals' },
  { value: 'lead', label: 'Leads' },
  { value: 'property', label: 'Properties' },
  { value: 'broker', label: 'Brokers' },
  { value: 'contact', label: 'Contacts' },
  { value: 'stock_item', label: 'Stock' },
  { value: 'tenant', label: 'Tenants' },
  { value: 'landlord', label: 'Landlords' },
  { value: 'reminder', label: 'Reminders' },
  { value: 'brochure', label: 'Brochures' },
  { value: 'legal_document', label: 'Legal Docs' },
  { value: 'master_db_potential', label: 'Master DB · Potential B&S' },
  { value: 'master_db_buyer', label: 'Master DB · Buyer Briefs' },
  { value: 'fund_company', label: 'Companies' },
  { value: 'fund', label: 'Funds' },
];

const PAGE_SIZE = 50;

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function actionToneClass(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes('created') || lower.includes('added')) return 'bg-emerald-100 text-emerald-700';
  if (lower.includes('deleted') || lower.includes('archived') || lower.includes('removed'))
    return 'bg-red-100 text-red-700';
  if (lower.includes('updated') || lower.includes('changed') || lower.includes('edited'))
    return 'bg-blue-100 text-blue-700';
  if (lower.includes('status')) return 'bg-violet-100 text-violet-700';
  if (lower.includes('login') || lower.includes('auth')) return 'bg-amber-100 text-amber-700';
  return 'bg-stone-100 text-stone-700';
}

function prettyAction(action: string): string {
  return action.replace(/_/g, ' ');
}

const AuditTrail: React.FC = () => {
  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await auditLogService.list({
        search: search || undefined,
        entityType: entityType || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
        page,
        limit: PAGE_SIZE,
      });
      setRecords(res.data);
      setTotalPages(res.pagination.pages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [search, entityType, from, to, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const grouped = useMemo(() => {
    // Group records by day for nicer reading.
    const groups: Array<{ day: string; items: AuditLogRecord[] }> = [];
    let current: { day: string; items: AuditLogRecord[] } | null = null;
    for (const rec of records) {
      const day = new Date(rec.createdAt).toLocaleDateString('en-ZA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      if (!current || current.day !== day) {
        current = { day, items: [] };
        groups.push(current);
      }
      current.items.push(rec);
    }
    return groups;
  }, [records]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <FiActivity className="text-indigo-600" />
            Events & Audit Trail
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Every system change is captured here — who did what, when, and to which record.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-stone-200 bg-white p-3 space-y-3">
        <form
          onSubmit={handleSearchSubmit}
          className="flex items-center gap-3 flex-wrap"
        >
          <div className="relative flex-1 min-w-[260px]">
            <FiSearch
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              size={14}
            />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search description, actor, or action..."
              className="w-full rounded-lg border border-stone-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Search
          </button>
        </form>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FiFilter size={14} className="text-stone-400" />
            <select
              value={entityType}
              onChange={(e) => {
                setPage(1);
                setEntityType(e.target.value);
              }}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {ENTITY_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <label className="text-xs text-stone-500 flex items-center gap-1.5">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPage(1);
                setFrom(e.target.value);
              }}
              className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
            />
          </label>
          <label className="text-xs text-stone-500 flex items-center gap-1.5">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
              }}
              className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
            />
          </label>
          {(search || entityType || from || to) && (
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setSearch('');
                setSearchInput('');
                setEntityType('');
                setFrom('');
                setTo('');
              }}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Clear filters
            </button>
          )}
          <div className="ml-auto text-xs text-stone-500">
            {totalCount.toLocaleString()} event{totalCount === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* List */}
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        {loading && records.length === 0 ? (
          <div className="p-8 text-center text-sm text-stone-500">Loading…</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center">
            <FiActivity className="mx-auto text-stone-300 mb-2" size={32} />
            <p className="text-sm text-stone-500">No events match your filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {grouped.map((group) => (
              <div key={group.day}>
                <div className="bg-stone-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500 border-b border-stone-100 sticky top-0 z-10">
                  {group.day}
                </div>
                {group.items.map((rec) => {
                  const isExpanded = expanded.has(rec.id);
                  const hasDetails =
                    !!rec.previousValues || !!rec.nextValues || !!rec.metadata;
                  return (
                    <div
                      key={rec.id}
                      className="px-4 py-3 hover:bg-stone-50/40 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${actionToneClass(rec.action)}`}
                        >
                          {prettyAction(rec.action)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-stone-900">
                            {rec.description || prettyAction(rec.action)}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-stone-500">
                            {rec.actorName ? (
                              <span className="inline-flex items-center gap-1">
                                <FiUser size={10} />
                                {rec.actorName}
                                {rec.actorRole ? ` · ${rec.actorRole}` : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-stone-400">
                                <FiUser size={10} />
                                System
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <FiClock size={10} />
                              {formatTimestamp(rec.createdAt)}
                            </span>
                            <span className="inline-flex items-center rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">
                              {rec.entityType}
                            </span>
                            {rec.entityId && (
                              <span
                                className="text-stone-400 font-mono text-[10px] truncate max-w-[180px]"
                                title={rec.entityId}
                              >
                                #{rec.entityId.slice(0, 8)}
                              </span>
                            )}
                          </div>
                        </div>
                        {hasDetails && (
                          <button
                            onClick={() => toggleExpanded(rec.id)}
                            className="shrink-0 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                            title={isExpanded ? 'Hide details' : 'Show details'}
                          >
                            {isExpanded ? (
                              <FiChevronUp size={14} />
                            ) : (
                              <FiChevronDown size={14} />
                            )}
                          </button>
                        )}
                      </div>

                      {isExpanded && hasDetails && (
                        <div className="mt-3 pl-3 ml-3 border-l-2 border-stone-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                          {rec.previousValues != null && (
                            <DetailsBlock label="Previous values" value={rec.previousValues} />
                          )}
                          {rec.nextValues != null && (
                            <DetailsBlock label="Next values" value={rec.nextValues} />
                          )}
                          {rec.metadata != null && (
                            <DetailsBlock
                              label="Metadata"
                              value={rec.metadata}
                              full={!rec.previousValues && !rec.nextValues}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            <FiChevronLeft size={14} />
            Previous
          </button>
          <span className="text-xs text-stone-600">
            Page <span className="font-semibold">{page}</span> of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Next
            <FiChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

const DetailsBlock: React.FC<{ label: string; value: unknown; full?: boolean }> = ({
  label,
  value,
  full,
}) => (
  <div className={full ? 'md:col-span-2' : ''}>
    <p className="font-semibold uppercase tracking-wide text-stone-400 mb-1">
      {label}
    </p>
    <pre className="rounded bg-stone-50 px-2 py-1.5 text-[11px] text-stone-700 max-h-48 overflow-auto whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 2)}
    </pre>
  </div>
);

export default AuditTrail;
