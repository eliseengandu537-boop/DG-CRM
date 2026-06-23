'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiActivity,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiChevronUp,
  FiClock,
  FiFilter,
  FiRefreshCw,
  FiSearch,
  FiUser,
} from 'react-icons/fi';
import { auditLogService, type AuditLogRecord } from '@/services/auditLogService';

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
  { value: 'canvassing_sheet', label: 'Canvassing Sheets' },
  { value: 'wip_comment_entry', label: 'WIP Comments' },
  { value: 'comment_audit', label: 'Comment Audit' },
  { value: 'master_db_potential', label: 'Master DB · Potential B&S' },
  { value: 'master_db_buyer', label: 'Master DB · Buyer Briefs' },
  { value: 'fund_company', label: 'Companies' },
  { value: 'fund', label: 'Funds' },
];

const PAGE_SIZE = 50;

type AuditFieldRow = {
  label: string;
  value: string;
  multiline?: boolean;
};

type AuditChangeRow = {
  label: string;
  previous: string;
  next: string;
};

type AuditDetailSection = {
  title: string;
  rows: AuditFieldRow[];
  full?: boolean;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isObjectRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function normalizeText(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function formatDayHeading(iso: string): string {
  try {
    return new Date(iso)
      .toLocaleDateString('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      .toUpperCase();
  } catch {
    return iso;
  }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function formatEntityType(entityType: string): string {
  return String(entityType || '')
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function prettifyLabel(label: string): string {
  return String(label || '')
    .replace(/\./g, ' / ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function actionToneClass(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes('created') || lower.includes('added')) return 'bg-emerald-100 text-emerald-700';
  if (lower.includes('deleted') || lower.includes('archived') || lower.includes('removed')) {
    return 'bg-rose-100 text-rose-700';
  }
  if (lower.includes('updated') || lower.includes('changed') || lower.includes('edited')) {
    return 'bg-blue-100 text-blue-700';
  }
  if (lower.includes('status')) return 'bg-violet-100 text-violet-700';
  if (lower.includes('login') || lower.includes('auth')) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

function prettyAction(action: string): string {
  return String(action || '')
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function valueToText(value: unknown, key?: string): string {
  if (value == null) return '-';
  if (typeof value === 'string') return value.trim() || '-';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    if (key === 'rows') return `${value.length} row${value.length === 1 ? '' : 's'}`;
    if (value.every(item => !isObjectRecord(item) && !Array.isArray(item))) {
      return value.map(item => String(item)).join(', ');
    }
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (isObjectRecord(value)) {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function addField(rows: AuditFieldRow[], label: string, value: unknown, multiline = false): void {
  if (!hasMeaningfulValue(value)) return;
  rows.push({
    label,
    value: valueToText(value),
    multiline: multiline || (typeof value === 'string' && String(value).includes('\n')),
  });
}

function flattenRows(
  source: Record<string, unknown>,
  prefix = '',
  depth = 0,
  exclude: Set<string> = new Set()
): AuditFieldRow[] {
  const rows: AuditFieldRow[] = [];

  for (const [key, rawValue] of Object.entries(source)) {
    if (!prefix && exclude.has(key)) continue;
    if (!hasMeaningfulValue(rawValue)) continue;

    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (isObjectRecord(rawValue) && depth < 1) {
      rows.push(...flattenRows(rawValue, nextKey, depth + 1));
      continue;
    }

    rows.push({
      label: prettifyLabel(nextKey),
      value: valueToText(rawValue, key),
      multiline: typeof rawValue === 'string' && rawValue.includes('\n'),
    });
  }

  return rows;
}

function flattenForDiff(source: unknown, prefix = ''): Record<string, string> {
  if (!isObjectRecord(source)) return {};

  const rows: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(source)) {
    if (!hasMeaningfulValue(rawValue)) continue;

    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (isObjectRecord(rawValue)) {
      Object.assign(rows, flattenForDiff(rawValue, nextKey));
      continue;
    }

    if (Array.isArray(rawValue)) {
      rows[nextKey] = JSON.stringify(rawValue);
      continue;
    }

    rows[nextKey] = valueToText(rawValue, key);
  }

  return rows;
}

function dedupeRows(rows: AuditFieldRow[]): AuditFieldRow[] {
  const seen = new Set<string>();
  const result: AuditFieldRow[] = [];

  for (const row of rows) {
    const signature = `${row.label}:${row.value}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(row);
  }

  return result;
}

function pickSnapshot(record: AuditLogRecord): Record<string, unknown> | null {
  return (isObjectRecord(record.nextValues) ? record.nextValues : null) ||
    (isObjectRecord(record.previousValues) ? record.previousValues : null) ||
    null;
}

function getRecordSubtitle(record: AuditLogRecord): string {
  const snapshot = pickSnapshot(record);
  const payload = isObjectRecord(snapshot?.payload) ? snapshot.payload : null;

  if (record.entityType === 'wip_comment_entry') {
    return normalizeText(payload?.text) || normalizeText(payload?.dealName) || record.description;
  }

  if (record.entityType === 'comment_audit') {
    return (
      normalizeText(payload?.description) ||
      normalizeText(payload?.currentContent) ||
      normalizeText(payload?.nextContent) ||
      record.description
    );
  }

  if (record.entityType === 'canvassing_sheet') {
    const brokerName = normalizeText(payload?.brokerName);
    const rowCount = Array.isArray(payload?.rows) ? payload.rows.length : 0;
    const parts = [brokerName, rowCount ? `${rowCount} rows` : ''].filter(Boolean);
    return parts.join(' · ') || record.description;
  }

  return record.description || prettyAction(record.action);
}

function buildChangeRows(record: AuditLogRecord): AuditChangeRow[] {
  const previousFlat = flattenForDiff(record.previousValues);
  const nextFlat = flattenForDiff(record.nextValues);
  const keys = Array.from(new Set([...Object.keys(previousFlat), ...Object.keys(nextFlat)]));

  return keys
    .filter(key => (previousFlat[key] || '-') !== (nextFlat[key] || '-'))
    .map(key => ({
      label: prettifyLabel(key),
      previous: previousFlat[key] || '-',
      next: nextFlat[key] || '-',
    }));
}

function buildSections(record: AuditLogRecord): AuditDetailSection[] {
  const snapshot = pickSnapshot(record);
  const previousSnapshot = isObjectRecord(record.previousValues) ? record.previousValues : null;
  const nextSnapshot = isObjectRecord(record.nextValues) ? record.nextValues : null;
  const payload = isObjectRecord(snapshot?.payload) ? snapshot.payload : null;
  const metadata = isObjectRecord(record.metadata) ? record.metadata : null;

  const sections: AuditDetailSection[] = [];

  const recordInfo: AuditFieldRow[] = [];
  addField(recordInfo, 'Record Name', snapshot?.name || record.description);
  addField(recordInfo, 'Entity Type', formatEntityType(record.entityType));
  addField(recordInfo, 'Record ID', record.entityId);
  addField(recordInfo, 'Reference ID', snapshot?.referenceId);
  addField(recordInfo, 'Visibility Scope', snapshot?.visibilityScope);
  addField(recordInfo, 'Category', snapshot?.category ?? metadata?.category);
  addField(recordInfo, 'Status', snapshot?.status ?? metadata?.status);
  addField(recordInfo, 'Module Type', snapshot?.moduleType ?? metadata?.moduleType);
  addField(recordInfo, 'Assigned Broker ID', snapshot?.assignedBrokerId);
  if (recordInfo.length > 0) {
    sections.push({ title: 'Record Info', rows: dedupeRows(recordInfo) });
  }

  if (record.entityType === 'wip_comment_entry' && payload) {
    const commentText: AuditFieldRow[] = [];
    addField(commentText, 'Comment Text', payload.text, true);
    if (commentText.length > 0) {
      sections.push({ title: 'Comment Text', rows: commentText, full: true });
    }

    const commentInfo: AuditFieldRow[] = [];
    addField(commentInfo, 'Deal Name', payload.dealName);
    addField(commentInfo, 'Lead Name', payload.leadName);
    addField(commentInfo, 'Author', payload.actorName);
    addField(commentInfo, 'Author Role', payload.actorRole);
    addField(commentInfo, 'Commented At', payload.commentedAt);
    addField(commentInfo, 'Thread Key', payload.threadKey);
    addField(commentInfo, 'Item ID', payload.itemId);
    addField(commentInfo, 'Deal ID', payload.dealId);
    addField(commentInfo, 'Forecast Deal ID', payload.forecastDealId);
    addField(commentInfo, 'Lead ID', payload.leadId);
    addField(commentInfo, 'Broker ID', payload.brokerId);
    addField(commentInfo, 'Imported From Legacy', payload.importedFromLegacy);
    if (commentInfo.length > 0) {
      sections.push({ title: 'Comment Details', rows: dedupeRows(commentInfo) });
    }
  } else if (record.entityType === 'comment_audit' && payload) {
    const auditInfo: AuditFieldRow[] = [];
    addField(auditInfo, 'Action', payload.actionLabel || payload.action);
    addField(auditInfo, 'Description', payload.description);
    addField(auditInfo, 'Current Comment', payload.currentContent, true);
    addField(auditInfo, 'Previous Comment', payload.previousContent, true);
    addField(auditInfo, 'Updated Comment', payload.nextContent, true);
    addField(auditInfo, 'Deal Name', payload.dealName);
    addField(auditInfo, 'Lead Name', payload.leadName);
    addField(auditInfo, 'Actor', payload.actorName);
    addField(auditInfo, 'Actor Role', payload.actorRole);
    addField(auditInfo, 'Status', payload.status);
    addField(auditInfo, 'Thread Key', payload.threadKey);
    if (auditInfo.length > 0) {
      sections.push({ title: 'Audit Details', rows: dedupeRows(auditInfo), full: true });
    }
  } else if (record.entityType === 'canvassing_sheet' && payload) {
    const sheetInfo: AuditFieldRow[] = [];
    addField(sheetInfo, 'Sheet Title', snapshot?.name);
    addField(sheetInfo, 'Broker Name', payload.brokerName);
    addField(sheetInfo, 'Broker ID', payload.brokerId);
    addField(sheetInfo, 'Rows', payload.rows);
    if (sheetInfo.length > 0) {
      sections.push({ title: 'Sheet Details', rows: dedupeRows(sheetInfo) });
    }
  } else if (payload) {
    const payloadRows = dedupeRows(flattenRows(payload, '', 0, new Set(['rows'])));
    if (Array.isArray(payload.rows)) {
      payloadRows.unshift({ label: 'Rows', value: valueToText(payload.rows, 'rows') });
    }
    if (payloadRows.length > 0) {
      sections.push({ title: 'Exact Info', rows: payloadRows, full: payloadRows.length > 8 });
    }
  }

  if (metadata) {
    const metadataRows = dedupeRows(flattenRows(metadata));
    if (metadataRows.length > 0) {
      sections.push({ title: 'Metadata', rows: metadataRows });
    }
  }

  if (sections.length === 0 && snapshot) {
    const fallbackRows = dedupeRows(flattenRows(snapshot));
    if (fallbackRows.length > 0) {
      sections.push({ title: 'Exact Info', rows: fallbackRows, full: true });
    }
  }

  if (sections.length === 0 && (previousSnapshot || nextSnapshot)) {
    const fallbackRows = dedupeRows(
      flattenRows(nextSnapshot || previousSnapshot || {}, '', 0, new Set())
    );
    if (fallbackRows.length > 0) {
      sections.push({ title: 'Exact Info', rows: fallbackRows, full: true });
    }
  }

  return sections;
}

const DetailCard: React.FC<{ section: AuditDetailSection }> = ({ section }) => (
  <section
    className={`${section.full ? 'xl:col-span-2' : ''} rounded-2xl border border-slate-200 bg-white p-4 shadow-sm`}
  >
    <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
      {section.title}
    </h4>
    <dl className="mt-4 space-y-3">
      {section.rows.map(row => (
        <div
          key={`${section.title}-${row.label}-${row.value}`}
          className="grid gap-1 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[150px_minmax(0,1fr)] md:gap-4"
        >
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            {row.label}
          </dt>
          <dd
            className={`text-sm text-slate-800 ${row.multiline ? 'whitespace-pre-wrap' : 'break-words'}`}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  </section>
);

const ChangeCard: React.FC<{ rows: AuditChangeRow[] }> = ({ rows }) => (
  <section className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
      Changed Fields
    </h4>
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
      <div className="hidden grid-cols-[minmax(140px,0.9fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 bg-slate-50 px-4 py-3 md:grid">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Field</p>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Previous</p>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Next</p>
      </div>
      <div className="divide-y divide-slate-200">
        {rows.map(row => (
          <div
            key={`${row.label}-${row.previous}-${row.next}`}
            className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(140px,0.9fr)_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 md:hidden">
                Field
              </p>
              <p className="text-sm font-semibold text-slate-900">{row.label}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 md:hidden">
                Previous
              </p>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-600">{row.previous}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 md:hidden">
                Next
              </p>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{row.next}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

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
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
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
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const grouped = useMemo(() => {
    const groups: Array<{ day: string; items: AuditLogRecord[] }> = [];
    let current: { day: string; items: AuditLogRecord[] } | null = null;

    for (const rec of records) {
      const day = formatDayHeading(rec.createdAt);
      if (!current || current.day !== day) {
        current = { day, items: [] };
        groups.push(current);
      }
      current.items.push(rec);
    }

    return groups;
  }, [records]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <FiActivity size={22} />
            </span>
            Events & Audit Trail
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Review every system change with exact details, actors, timestamps, and record history.
          </p>
        </div>

        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_auto]">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search description, actor, comment text, deal name, or action..."
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Search
          </button>
        </form>

        <div className="mt-4 grid gap-3 lg:grid-cols-[auto_auto_auto_auto_1fr]">
          <div className="flex items-center gap-2">
            <FiFilter size={14} className="text-slate-400" />
            <select
              value={entityType}
              onChange={e => {
                setPage(1);
                setEntityType(e.target.value);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ENTITY_TYPES.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>From</span>
            <input
              type="date"
              value={from}
              onChange={e => {
                setPage(1);
                setFrom(e.target.value);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </label>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>To</span>
            <input
              type="date"
              value={to}
              onChange={e => {
                setPage(1);
                setTo(e.target.value);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
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
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Clear Filters
            </button>
          )}

          <div className="flex items-center justify-start lg:justify-end text-sm text-slate-500">
            {totalCount.toLocaleString()} event{totalCount === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading && records.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading audit records...</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center">
            <FiActivity className="mx-auto mb-3 text-slate-300" size={32} />
            <p className="text-sm text-slate-500">No events match your filters.</p>
          </div>
        ) : (
          <div className="space-y-0">
            {grouped.map(group => (
              <div key={group.day} className="border-b border-slate-100 last:border-b-0">
                <div className="bg-slate-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {group.day}
                </div>

                <div className="space-y-4 p-4 md:p-5">
                  {group.items.map(rec => {
                    const isExpanded = expanded.has(rec.id);
                    const sections = buildSections(rec);
                    const changes = buildChangeRows(rec);
                    const hasDetails = sections.length > 0 || changes.length > 0;
                    const subtitle = getRecordSubtitle(rec);

                    return (
                      <article
                        key={rec.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300"
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-3">
                              <span
                                className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${actionToneClass(rec.action)}`}
                              >
                                {prettyAction(rec.action)}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                {formatEntityType(rec.entityType)}
                              </span>
                            </div>

                            <p className="mt-3 text-base font-semibold text-slate-900 break-words">
                              {rec.description || prettyAction(rec.action)}
                            </p>
                            {subtitle && subtitle !== rec.description && (
                              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                                {subtitle}
                              </p>
                            )}

                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                              <span className="inline-flex items-center gap-1.5">
                                <FiUser size={12} />
                                {rec.actorName || 'System'}
                                {rec.actorRole ? ` · ${rec.actorRole}` : ''}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <FiClock size={12} />
                                {formatTimestamp(rec.createdAt)}
                              </span>
                              {rec.entityId && (
                                <span className="font-mono text-[11px] text-slate-400 break-all">
                                  ID: {rec.entityId}
                                </span>
                              )}
                            </div>
                          </div>

                          {hasDetails && (
                            <button
                              onClick={() => toggleExpanded(rec.id)}
                              className="shrink-0 rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
                              title={isExpanded ? 'Hide exact info' : 'Show exact info'}
                            >
                              {isExpanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                            </button>
                          )}
                        </div>

                        {isExpanded && hasDetails && (
                          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:p-5">
                            <div className="grid gap-4 xl:grid-cols-2">
                              {sections.map(section => (
                                <DetailCard key={`${rec.id}-${section.title}`} section={section} />
                              ))}
                              {changes.length > 0 && <ChangeCard rows={changes} />}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <button
            onClick={() => setPage(current => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <FiChevronLeft size={14} />
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page <span className="font-semibold">{page}</span> of {totalPages}
          </span>
          <button
            onClick={() => setPage(current => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Next
            <FiChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default AuditTrail;
