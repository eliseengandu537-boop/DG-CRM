import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiArrowLeft,
  FiCalendar,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiClock,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiFilter,
  FiSearch,
  FiTrash2,
} from 'react-icons/fi';
import { useAuth } from '@/context/AuthContext';
import { Broker } from './BrokerCard';
import { BrokerWipItem } from '@/services/brokerPerformanceService';
import { forecastDealApiService } from '@/services/forecastDealService';
import { dealService } from '@/services/dealService';
import { legalDocService } from '@/services/legalDocService';
import { propertyService } from '@/services/propertyService';
import { leadService } from '@/services/leadService';
import { customRecordService } from '@/services/customRecordService';
import { reminderService, ReminderRecord } from '@/services/reminderService';
import { LegalDocument } from '@/data/legaldocs';
import { DealDateModal } from './DealDateModal';
import { CommentModal } from './CommentModal';
import { commentAuditService } from '@/services/commentAuditService';
import { wipCommentService } from '@/services/wipCommentService';
import { CanvassingSheets } from '@/components/Canvassing/CanvassingSheets';
import { formatRand } from '@/lib/currency';
import { playNotificationSound } from '@/lib/notificationAudio';
import { parseDealTitle } from '@/lib/dealTitle';
import {
  availableWorkflowStatuses,
  dealWorkflowStatusLabel,
  getWorkflowCompletionFromDocumentStatuses,
  isFinalDealWorkflowStatus,
  isWorkflowDocumentStatus,
  parseDealWorkflowStatus,
  validateDealWorkflowTransition,
} from '@/lib/dealWorkflow';

const CLOSED_STATUSES = new Set(['closed', 'awaiting_payment', 'won']);
const LOST_STATUSES = new Set(['lost', 'cancelled', 'canceled', 'rejected']);
const DEFAULT_STATUS_FILTERS = [
  'otp',
  'otl',
  'loi',
  'sale_agreement',
  'lease_agreement',
  'awaiting_payment',
  'closed',
  'won',
  'lost',
  'cancelled',
  'rejected',
];
const DEFAULT_DEAL_TYPE_FILTERS = ['leasing', 'sales', 'auction'];
const LEASING_STATUS_OPTIONS = availableWorkflowStatuses();
const SALES_STATUS_OPTIONS = availableWorkflowStatuses();
const AUCTION_STATUS_OPTIONS = availableWorkflowStatuses();
const COMMENT_REQUIRED_STATUSES = new Set(['loi', 'otp']);
const SALES_REQUIRED_STATUS_OPTIONS = ['LOI', 'OTP', 'OTL', 'Sale Agreement'];
const LEASING_REQUIRED_STATUS_OPTIONS = ['LOI', 'OTP', 'OTL', 'Lease Agreement'];
const NON_WORKFLOW_STATUS_OPTIONS = ['Lost'];
const SALES_BROKER_STATUS_OPTIONS = Array.from(
  new Set([
    ...SALES_STATUS_OPTIONS,
    ...SALES_REQUIRED_STATUS_OPTIONS,
    ...NON_WORKFLOW_STATUS_OPTIONS,
  ])
);
const LEASING_BROKER_STATUS_OPTIONS = Array.from(
  new Set([
    ...LEASING_STATUS_OPTIONS,
    ...LEASING_REQUIRED_STATUS_OPTIONS,
    ...NON_WORKFLOW_STATUS_OPTIONS,
  ])
);

interface BrokerDetailProps {
  broker: Broker | null;
  onBack: () => void;
  wipSheets?: BrokerWipItem[];
}

type WipStatusDocument = NonNullable<BrokerWipItem['statusDocuments']>[number];

interface WipDocumentBrowserState {
  dealName: string;
  item: BrokerWipItem;
  documents: WipStatusDocument[];
}

function getStatusDocumentDisplayName(document: WipStatusDocument): string {
  return (
    String(document.filledDocumentName || '').trim() ||
    String(document.legalDocumentName || '').trim() ||
    `${getStatusDocStepLabel(String(document.status))} Document`
  );
}

function getStatusDocumentLoadingKey(document: WipStatusDocument): string {
  return String(document.filledDocumentRecordId || document.legalDocumentId || document.id || '').trim();
}
function normalizeStatus(status: string): string {
  return String(status || '').trim().toLowerCase();
}

function canonicalStatus(status: string): string {
  const normalized = normalizeStatus(status).replace(/[\s-]+/g, '_');
  return normalized === 'canceled' ? 'cancelled' : normalized;
}

function canonicalDealType(type: string): string {
  const normalized = String(type || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, ' ');

  if (normalized === 'lease' || normalized === 'leasing') return 'leasing';
  if (normalized === 'sale' || normalized === 'sales') return 'sales';
  if (normalized === 'auction') return 'auction';
  return normalized.replace(/\s+/g, '_');
}

function canonicalBrokerType(value: string): 'sales' | 'leasing' | 'auction' | 'unknown' {
  const normalized = canonicalDealType(value);
  if (normalized === 'sales' || normalized === 'leasing' || normalized === 'auction') {
    return normalized;
  }
  return 'unknown';
}

function isClosedStatus(status: string): boolean {
  return isFinalDealWorkflowStatus(status) || CLOSED_STATUSES.has(normalizeStatus(status));
}

function isLostStatus(status: string): boolean {
  return LOST_STATUSES.has(normalizeStatus(status));
}

function formatStatusLabel(status: string): string {
  if (isLostStatus(status)) {
    const normalized = canonicalStatus(status);
    if (normalized === 'cancelled') return 'Cancelled';
    if (normalized === 'rejected') return 'Rejected';
    return 'Lost';
  }
  const label = dealWorkflowStatusLabel(status);
  return label || 'Unknown';
}

function formatDealTypeLabel(type: string): string {
  const normalized = String(type || '').replace(/[_-]/g, ' ').trim();
  if (!normalized) return 'Unknown';
  return normalized
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatWipDealType(type: string): string {
  const normalized = canonicalDealType(type);
  if (normalized === 'sales') return 'Sale';
  if (normalized === 'leasing') return 'Lease';
  if (normalized === 'auction') return 'Auction';
  return formatDealTypeLabel(type);
}

function formatAddressText(address?: string): string {
  const normalized = String(address || '').trim();
  if (!normalized) return '-';
  return normalized
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .join(', ');
}



function formatWipCloseDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getVisiblePageNumbers(currentPage: number, totalPages: number): number[] {
  const maxVisible = 4;
  const safeTotalPages = Math.max(1, totalPages);
  const start = Math.max(
    1,
    Math.min(currentPage - 1, safeTotalPages - maxVisible + 1)
  );
  const end = Math.min(safeTotalPages, start + maxVisible - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function toStatusValue(labelOrStatus: string): string {
  return canonicalStatus(labelOrStatus);
}

function statusRequiresLegalDocument(status: string): boolean {
  return isWorkflowDocumentStatus(status);
}

function getStatusDocStepLabel(status: string): string {
  const s = canonicalStatus(status);
  if (s === 'loi') return 'LOI';
  if (s === 'otp') return 'OTP';
  if (s === 'otl') return 'OTL';
  if (s === 'lease_agreement') return 'Lease Agmt';
  if (s === 'sale_agreement') return 'Sale Agmt';
  return formatStatusLabel(status);
}

function statusRequiresComment(status: string): boolean {
  return COMMENT_REQUIRED_STATUSES.has(canonicalStatus(status));
}

function statusOptionsByDealType(dealType: string): string[] {
  switch (canonicalDealType(dealType)) {
    case 'leasing':
      return LEASING_STATUS_OPTIONS;
    case 'sales':
      return SALES_STATUS_OPTIONS;
    case 'auction':
      return AUCTION_STATUS_OPTIONS;
    default:
      return LEASING_STATUS_OPTIONS;
  }
}

function resolveBrokerType(
  broker: Broker,
  properties: BrokerWipItem[]
): 'sales' | 'leasing' | 'auction' | 'unknown' {
  const directType = canonicalBrokerType(String(broker.type || broker.department || ''));
  if (directType !== 'unknown') return directType;

  for (const segment of broker.segments || []) {
    const segmentType = canonicalBrokerType(segment);
    if (segmentType !== 'unknown') return segmentType;
  }

  const inferredFromRows = properties
    .map(item => canonicalDealType(item.dealType))
    .find(type => type === 'sales' || type === 'leasing' || type === 'auction');

  if (inferredFromRows === 'sales' || inferredFromRows === 'leasing' || inferredFromRows === 'auction') {
    return inferredFromRows;
  }

  return 'unknown';
}

function statusOptionsForRow(
  dealType: string,
  brokerType: 'sales' | 'leasing' | 'auction' | 'unknown'
): string[] {
  if (brokerType === 'sales') {
    return SALES_BROKER_STATUS_OPTIONS;
  }
  if (brokerType === 'leasing') {
    return LEASING_BROKER_STATUS_OPTIONS;
  }

  const baseOptions = statusOptionsByDealType(dealType);
  const brokerSpecificOptions =
    canonicalDealType(dealType) === 'sales'
      ? SALES_REQUIRED_STATUS_OPTIONS
      : canonicalDealType(dealType) === 'leasing'
      ? LEASING_REQUIRED_STATUS_OPTIONS
      : [];

  return Array.from(
    new Set([...baseOptions, ...brokerSpecificOptions, ...NON_WORKFLOW_STATUS_OPTIONS])
  );
}

function deriveActionRequired(status: string): string {
  const normalized = canonicalStatus(status);
  if (statusRequiresComment(normalized)) return 'Legal document + comment required';
  if (statusRequiresLegalDocument(normalized)) return 'Legal document required';
  if (normalized === 'sale_agreement' || normalized === 'lease_agreement') return 'Ready to finalize';
  if (normalized === 'closed' || normalized === 'won') return 'Finalized';
  if (normalized === 'lost' || normalized === 'cancelled' || normalized === 'rejected') {
    return 'Deal lost';
  }
  if (normalized === 'awaiting_payment') return 'Collect payment';
  return '-';
}

function statusDocumentSortTime(document: WipStatusDocument): number {
  const candidates = [document.completedAt, document.lastModifiedAt, document.uploadedAt];
  for (const value of candidates) {
    const timestamp = new Date(String(value || '')).getTime();
    if (!Number.isNaN(timestamp) && timestamp > 0) return timestamp;
  }
  return 0;
}

function pickStatusDocumentForStatus(
  item: BrokerWipItem,
  status: string
): WipStatusDocument | null {
  const statusDocuments = Array.isArray(item.statusDocuments) ? item.statusDocuments : [];
  if (statusDocuments.length === 0) return null;

  const normalizedStatus = canonicalStatus(status);
  const matchingDocuments = statusDocuments.filter(
    document => canonicalStatus(String(document.status || '')) === normalizedStatus
  );
  if (matchingDocuments.length === 0) return null;

  return (
    [...matchingDocuments].sort(
      (left, right) => statusDocumentSortTime(right) - statusDocumentSortTime(left)
    )[0] || null
  );
}

function pickPreferredStatusDocument(item: BrokerWipItem): WipStatusDocument | null {
  const statusDocuments = Array.isArray(item.statusDocuments) ? item.statusDocuments : [];
  if (statusDocuments.length === 0) return null;

  const sameStatusDocument = pickStatusDocumentForStatus(item, item.status);
  const sameStatusDocuments = sameStatusDocument ? [sameStatusDocument] : [];
  const candidates = sameStatusDocuments.length > 0 ? sameStatusDocuments : statusDocuments;

  return (
    [...candidates].sort((left, right) => statusDocumentSortTime(right) - statusDocumentSortTime(left))[0] ||
    null
  );
}

/**
 * De-duplicates the status documents to one entry per workflow status (LOI / OTP / OTL /
 * Agreement) keeping the most recently completed/modified record. This guarantees that every
 * status that required a document keeps its own visible row even after the deal advances.
 */
function dedupeStatusDocumentsByStatus(item: BrokerWipItem): WipStatusDocument[] {
  const statusDocuments = Array.isArray(item.statusDocuments) ? item.statusDocuments : [];
  const byStatus = new Map<string, WipStatusDocument>();
  for (const document of statusDocuments) {
    const key = canonicalStatus(String(document.status || ''));
    if (!key) continue;
    const existing = byStatus.get(key);
    if (!existing || statusDocumentSortTime(document) >= statusDocumentSortTime(existing)) {
      byStatus.set(key, document);
    }
  }
  const stageOrder = ['loi', 'otp', 'otl', 'lease_agreement', 'sale_agreement'];
  return Array.from(byStatus.values()).sort((left, right) => {
    const leftIndex = stageOrder.indexOf(canonicalStatus(String(left.status || '')));
    const rightIndex = stageOrder.indexOf(canonicalStatus(String(right.status || '')));
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
  });
}

function isStatusDocumentFilled(document: WipStatusDocument): boolean {
  return Boolean(
    String(document.filledDocumentRecordId || '').trim() ||
      String(document.filledDocumentDownloadUrl || '').trim() ||
      String(document.completedAt || '').trim()
  );
}

/** Builds the plain-text body of a filled document for in-app viewing and file download. */
function buildFilledDocumentText(params: {
  documentName: string;
  statusLabel: string;
  content?: string;
  filledFields?: Record<string, unknown> | null;
}): string {
  const lines: string[] = [];
  lines.push(params.documentName || 'Filled Document');
  lines.push(`Workflow step: ${params.statusLabel}`);
  lines.push(`Generated: ${new Date().toLocaleString('en-ZA')}`);
  lines.push('');
  lines.push('========================================');
  lines.push('');

  const filledFields = params.filledFields || {};
  const fieldEntries = Object.entries(filledFields).filter(([, value]) =>
    String(value ?? '').trim()
  );
  if (fieldEntries.length > 0) {
    lines.push('FILLED FIELDS');
    lines.push('');
    for (const [key, value] of fieldEntries) {
      const label = String(key).replace(/[_[\]]+/g, ' ').trim();
      lines.push(`${label}: ${String(value).trim()}`);
    }
    lines.push('');
    lines.push('========================================');
    lines.push('');
  }

  const content = String(params.content || '').trim();
  if (content) {
    lines.push('DOCUMENT CONTENT');
    lines.push('');
    lines.push(content);
  } else if (fieldEntries.length === 0) {
    lines.push('No filled content was captured for this document.');
  }

  return lines.join('\n');
}

/** Triggers a browser file download for a text payload. */
function downloadTextFile(fileName: string, contents: string): void {
  if (typeof window === 'undefined') return;
  const safeName = String(fileName || 'filled-document')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName.toLowerCase().endsWith('.txt') ? safeName : `${safeName}.txt`;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const BrokerDetail: React.FC<BrokerDetailProps> = ({ broker, onBack, wipSheets = [] }) => {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDealType, setSelectedDealType] = useState<string>('all');
  const [wipSearchQuery, setWipSearchQuery] = useState<string>('');
  const [wipPage, setWipPage] = useState(1);
  const [wipRowsPerPage, setWipRowsPerPage] = useState(10);
  const [rows, setRows] = useState<BrokerWipItem[]>(wipSheets);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [legalDocuments, setLegalDocuments] = useState<LegalDocument[]>([]);
  const [loadingLegalDocuments, setLoadingLegalDocuments] = useState(false);
  const [legalDocumentsError, setLegalDocumentsError] = useState<string | null>(null);
  const [selectedViewDocument, setSelectedViewDocument] = useState<LegalDocument | null>(null);
  const [selectedDocumentBrowser, setSelectedDocumentBrowser] = useState<WipDocumentBrowserState | null>(null);
  const [selectedBrowserDocument, setSelectedBrowserDocument] = useState<LegalDocument | null>(null);
  const [documentBrowserError, setDocumentBrowserError] = useState<string | null>(null);
  const [loadingViewDocumentId, setLoadingViewDocumentId] = useState<string | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [selectedDealForDateModal, setSelectedDealForDateModal] = useState<BrokerWipItem | null>(null);
  const [selectedDealForCommentModal, setSelectedDealForCommentModal] = useState<{
    dealName: string;
    id: string;
  } | null>(null);
  const [outcomeReminders, setOutcomeReminders] = useState<ReminderRecord[]>([]);
  const [dismissedReminderIds, setDismissedReminderIds] = useState<Set<string>>(new Set());
  const [actioningReminderIds, setActioningReminderIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingCommissionId, setEditingCommissionId] = useState<string | null>(null);
  const [editingCommissionValue, setEditingCommissionValue] = useState<string>('');
  const [savingCommissionId, setSavingCommissionId] = useState<string | null>(null);
  const [viewingLeadId, setViewingLeadId] = useState<string | null>(null);
  const [viewingLead, setViewingLead] = useState<import('@/services/leadService').Lead | null>(null);
  const [loadingLeadDetail, setLoadingLeadDetail] = useState(false);
  const [timelineItemId, setTimelineItemId] = useState<string | null>(null);
  const [allProperties, setAllProperties] = useState<Array<{ id: string; title: string; address: string; ownerName?: string; ownerEmail?: string; ownerContactNumber?: string }>>([]);
  const [ownerPopup, setOwnerPopup] = useState<{ title: string; ownerName?: string; ownerEmail?: string; ownerContactNumber?: string } | null>(null);

  useEffect(() => {
    setRows(wipSheets);
    setRowErrors({});
  }, [wipSheets]);

  useEffect(() => {
    if (!viewingLeadId) {
      setViewingLead(null);
      return;
    }
    setLoadingLeadDetail(true);
    leadService.getLeadById(viewingLeadId)
      .then(lead => setViewingLead(lead))
      .catch(() => setViewingLead(null))
      .finally(() => setLoadingLeadDetail(false));
  }, [viewingLeadId]);

  const handleSaveCommission = async (item: BrokerWipItem) => {
    const parsed = parseFloat(editingCommissionValue.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditingCommissionId(null);
      return;
    }
    setSavingCommissionId(item.id);
    try {
      const forecastId = String(item.forecastDealId || item.id || '').trim();
      if (forecastId) {
        await forecastDealApiService.updateForecastDeal(forecastId, {
          brokerCommission: parsed,
        } as any);
      }
      setRows(current =>
        current.map(row =>
          row.id === item.id ? { ...row, brokerCommission: parsed } : row
        )
      );
    } catch {
      // silently revert
    } finally {
      setSavingCommissionId(null);
      setEditingCommissionId(null);
    }
  };

  const handleDeleteDeal = async (item: BrokerWipItem) => {
    setDeletingId(item.id);
    try {
      // Delete the forecast deal if one is linked
      const forecastId = String(item.forecastDealId || '').trim();
      if (forecastId) {
        await forecastDealApiService.deleteForecastDeal(forecastId);
      }
      // Delete the underlying real deal if one is linked (and it's a real deal id, not just the forecast id)
      const dealId = String(item.dealId || '').trim();
      if (dealId && dealId !== forecastId) {
        await dealService.deleteDeal(dealId);
      }
      setRows(prev => prev.filter(r => r.id !== item.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete deal');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    let active = true;

    const loadLegalDocuments = async () => {
      try {
        setLoadingLegalDocuments(true);
        setLegalDocumentsError(null);
        const docs = await legalDocService.getAllDocuments();
        if (!active) return;
        setLegalDocuments(docs);
      } catch (error) {
        if (!active) return;
        setLegalDocuments([]);
        setLegalDocumentsError(
          error instanceof Error ? error.message : 'Failed to load legal documents'
        );
      } finally {
        if (active) {
          setLoadingLegalDocuments(false);
        }
      }
    };

    void loadLegalDocuments();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    propertyService.getAllProperties({ limit: 1000 }).then((result) => {
      if (!active) return;
      setAllProperties(
        result.data.map((p) => ({
          id: p.id,
          title: String(p.title || p.address || ''),
          address: String(p.address || ''),
          ownerName: p.metadata?.ownerName ? String(p.metadata.ownerName) : undefined,
          ownerEmail: p.metadata?.ownerEmail ? String(p.metadata.ownerEmail) : undefined,
          ownerContactNumber: p.metadata?.ownerContactNumber ? String(p.metadata.ownerContactNumber) : undefined,
        }))
      );
    }).catch(() => { if (active) setAllProperties([]); });
    return () => { active = false; };
  }, []);

  // Load due outcome-check reminders for this broker's deals
  const loadOutcomeReminders = useCallback(async () => {
    if (!broker?.id) return;
    const due = await reminderService.getDueOutcomeReminders(broker.id);
    setOutcomeReminders(due);
  }, [broker?.id]);

  useEffect(() => {
    void loadOutcomeReminders();
    const interval = window.setInterval(() => void loadOutcomeReminders(), 60_000);
    return () => window.clearInterval(interval);
  }, [loadOutcomeReminders]);

  const handleOutcomeAction = useCallback(
    async (reminder: ReminderRecord, outcomeStatus: 'won' | 'lost' | 'awaiting_payment') => {
      const dealId = String(reminder.dealId || '').trim();
      if (!dealId) return;

      setActioningReminderIds(prev => new Set(Array.from(prev).concat(reminder.id)));
      try {
        await forecastDealApiService.updateWipStatus({
          dealId,
          status: outcomeStatus,
          brokerId: String(reminder.brokerId || '').trim() || undefined,
        });
        await reminderService.completeReminder(reminder.id);
        setOutcomeReminders(prev => prev.filter(r => r.id !== reminder.id));
        // Refresh the row status
        setRows(current =>
          current.map(row =>
            resolveDealId(row) === dealId
              ? {
                  ...row,
                  status: dealWorkflowStatusLabel(outcomeStatus) || outcomeStatus,
                  actionRequired: deriveActionRequired(outcomeStatus),
                  updatedAt: new Date().toISOString(),
                }
              : row
          )
        );
      } catch {
        // Silent — don't disrupt the UX, they can still update manually
      } finally {
        setActioningReminderIds(prev => {
          const next = new Set(prev);
          next.delete(reminder.id);
          return next;
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const properties = useMemo(() => rows, [rows]);
  const legalDocumentById = useMemo(
    () => new Map(legalDocuments.map(document => [document.id, document])),
    [legalDocuments]
  );
  const getAvailableDocumentsForItem = useCallback(
    (item: BrokerWipItem): WipStatusDocument[] => {
      const statusDocuments = dedupeStatusDocumentsByStatus(item);
      if (statusDocuments.length > 0) return statusDocuments;

      const normalizedLegalDocument = String(item.legalDocument || '').trim();
      if (!normalizedLegalDocument) return [];

      const fallbackLegalDocument = legalDocumentById.get(normalizedLegalDocument);
      return [
        {
          id: `legal-${item.id}`,
          status: item.status,
          documentType: '',
          legalDocumentId: normalizedLegalDocument,
          legalDocumentName: fallbackLegalDocument?.documentName || '',
          version: 1,
          uploadedAt: item.updatedAt,
          lastModifiedAt: item.updatedAt,
        } as WipStatusDocument,
      ];
    },
    [legalDocumentById]
  );

  const filteredProperties = useMemo(() => {
    return properties
      .filter(item => selectedStatus === 'all' || canonicalStatus(item.status) === selectedStatus)
      .filter(
        item => selectedDealType === 'all' || canonicalDealType(item.dealType) === selectedDealType
      )
      .filter(item => {
        if (!wipSearchQuery.trim()) return true;
        const q = wipSearchQuery.toLowerCase();
        return (
          item.dealName.toLowerCase().includes(q) ||
          (item.leadName || '').toLowerCase().includes(q) ||
          (item.address || '').toLowerCase().includes(q) ||
          (item.comment || '').toLowerCase().includes(q)
        );
      });
  }, [properties, selectedStatus, selectedDealType, wipSearchQuery]);

  const wipTotalPages = Math.max(1, Math.ceil(filteredProperties.length / wipRowsPerPage));
  const safeWipPage = Math.min(wipPage, wipTotalPages);
  const wipRangeStart =
    filteredProperties.length === 0 ? 0 : (safeWipPage - 1) * wipRowsPerPage + 1;
  const wipRangeEnd =
    filteredProperties.length === 0
      ? 0
      : Math.min(filteredProperties.length, safeWipPage * wipRowsPerPage);
  const paginatedProperties = filteredProperties.slice(
    (safeWipPage - 1) * wipRowsPerPage,
    safeWipPage * wipRowsPerPage
  );
  const visibleWipPages = getVisiblePageNumbers(safeWipPage, wipTotalPages);

  useEffect(() => {
    setWipPage(1);
  }, [selectedStatus, selectedDealType, wipSearchQuery, wipRowsPerPage]);

  useEffect(() => {
    if (wipPage > wipTotalPages) {
      setWipPage(wipTotalPages);
    }
  }, [wipPage, wipTotalPages]);

  if (!broker) return null;

  const brokerType = resolveBrokerType(broker, properties);

  const fromDataDealTypes = Array.from(
    new Set(properties.map(p => canonicalDealType(p.dealType)).filter(Boolean))
  );
  const dealTypes = Array.from(new Set([...DEFAULT_DEAL_TYPE_FILTERS, ...fromDataDealTypes]));
  const fromDataStatuses = Array.from(
    new Set(properties.map(p => canonicalStatus(p.status)).filter(Boolean))
  );
  const statuses = Array.from(new Set([...DEFAULT_STATUS_FILTERS, ...fromDataStatuses]));
  const billingTarget = Math.max(0, Number(broker.billingTarget || 0));
  const currentBilling = Math.max(0, Number(broker.currentBilling || 0));
  const percentageAchieved = Math.round(
    Number.isFinite(Number(broker.progressPercentage))
      ? Number(broker.progressPercentage)
      : billingTarget > 0
      ? (currentBilling / billingTarget) * 100
      : 0
  );
  const wonDealsCount = properties.filter(item => isClosedStatus(item.status)).length;
  const lostDealsCount = properties.filter(item => isLostStatus(item.status)).length;

  const getStatusColor = (status: string) => {
    if (isClosedStatus(status)) return 'bg-green-100 text-green-800';
    if (isLostStatus(status)) return 'bg-red-100 text-red-800';
    return 'bg-stone-100 text-stone-800';
  };

  const resolveDealId = (item: BrokerWipItem): string => {
    return String(item.dealId || '').trim();
  };

  const fetchLegalDocumentById = async (documentId: string): Promise<LegalDocument> => {
    const normalizedId = String(documentId || '').trim();
    if (!normalizedId) {
      throw new Error('No legal document linked');
    }

    return legalDocService.getDocumentById(normalizedId);
  };

  const handleViewDocument = async (documentId: string) => {
    const normalizedId = String(documentId || '').trim();
    if (!normalizedId) return;

    setLoadingViewDocumentId(normalizedId);
    try {
      const fullDocument = await fetchLegalDocumentById(normalizedId);
      setSelectedViewDocument(fullDocument);
    } catch (error) {
      setLegalDocumentsError(
        error instanceof Error ? error.message : 'Failed to open legal document'
      );
    } finally {
      setLoadingViewDocumentId(null);
    }
  };

  const formatDateTime = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const redirectToLegalDocs = (item: BrokerWipItem, nextStatus: string, comment: string) => {
    const linkedDealId = resolveDealId(item);
    if (!linkedDealId) {
      setRowErrors(current => ({
        ...current,
        [item.id]: 'Linked deal is required before opening Legal Docs',
      }));
      return;
    }

    const query = new URLSearchParams({
      dealId: linkedDealId,
      status: canonicalStatus(nextStatus),
      source: 'broker-wip',
    });
    if (item.brokerId) query.set('brokerId', String(item.brokerId));
    if (item.forecastDealId) query.set('forecastDealId', String(item.forecastDealId));
    if (item.id) query.set('wipId', String(item.id));
    if (comment.trim()) query.set('comment', comment.trim());

    const statusMatchedDocument = pickStatusDocumentForStatus(item, nextStatus);
    const isSameStatus = canonicalStatus(item.status) === canonicalStatus(nextStatus);
    const preferredStatusDocument = statusMatchedDocument || pickPreferredStatusDocument(item);
    const preferredLegalDocumentId = String(
      statusMatchedDocument?.legalDocumentId ||
        (isSameStatus ? item.legalDocument : '') ||
        preferredStatusDocument?.legalDocumentId ||
        ''
    ).trim();
    if (preferredLegalDocumentId) {
      query.set('legalDocumentId', preferredLegalDocumentId);
    }

    void playNotificationSound();
    router.push(`/legal-docs?${query.toString()}`);
  };

  /**
   * Resolves the displayable payload of a filled workflow document. Tries the explicit
   * filled-document record first, then falls back to searching custom records by the original
   * legal document id (so a filled document still shows even if the record link was lost).
   */
  const resolveFilledDocument = async (params: {
    filledDocumentRecordId?: string;
    legalDocumentId?: string;
    fallbackName?: string;
  }): Promise<{
    fileName: string;
    content: string;
    filledFields: Record<string, unknown>;
    fileType: 'pdf' | 'txt';
    filePath?: string;
  }> => {
    const filledDocumentRecordId = String(params.filledDocumentRecordId || '').trim();
    const legalDocumentId = String(params.legalDocumentId || '').trim();

    let payload: Record<string, any> = {};
    let recordName = '';
    let referenceId = '';

    if (filledDocumentRecordId) {
      const record = await customRecordService.getCustomRecordById<any>(filledDocumentRecordId);
      payload = ((record as any)?.payload as Record<string, any>) || {};
      recordName = String(record?.name || '');
      referenceId = String(record?.referenceId || '');
    } else if (legalDocumentId) {
      // No explicit record link — search for the most recent filled record for this document.
      try {
        const result = await customRecordService.getAllCustomRecords<any>({
          entityType: 'filled-document',
          limit: 500,
        });
        const latest = result.data
          .filter(record => String(record.referenceId || '') === legalDocumentId)
          .sort(
            (left, right) =>
              new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
          )[0];
        if (latest) {
          payload = (latest.payload as Record<string, any>) || {};
          recordName = String(latest.name || '');
          referenceId = String(latest.referenceId || '');
        }
      } catch {
        // ignore — falls through to the original document below
      }
    }

    const fileName = String(
      payload.filledDocumentName || params.fallbackName || recordName || 'filled-document'
    ).trim();
    const filledFields = (payload.filledContent || {}) as Record<string, unknown>;

    let content = String(payload.content || '').trim();
    let fileType: 'pdf' | 'txt' = 'txt';
    let filePath: string | undefined;

    if (!content && Object.keys(filledFields).length === 0) {
      const originalDocId = String(payload.originalDocId || referenceId || legalDocumentId || '').trim();
      if (originalDocId) {
        try {
          const originalDoc = await legalDocService.getDocumentById(originalDocId);
          if (
            originalDoc.fileType === 'pdf' &&
            originalDoc.filePath &&
            !String(originalDoc.filePath).startsWith('blob:')
          ) {
            fileType = 'pdf';
            filePath = originalDoc.filePath;
          } else if (originalDoc.content) {
            content = originalDoc.content;
          }
        } catch {
          // ignore — viewer will show a fallback message
        }
      }
    }

    return { fileName, content, filledFields, fileType, filePath };
  };

  const buildStatusDocumentPreview = async (
    statusDoc: WipStatusDocument
  ): Promise<LegalDocument> => {
    const filledDocumentRecordId = String(statusDoc.filledDocumentRecordId || '').trim();
    const legalDocumentId = String(statusDoc.legalDocumentId || '').trim();
    const stepLabel = getStatusDocStepLabel(String(statusDoc.status));
    const isFilled = isStatusDocumentFilled(statusDoc);

    if (isFilled || filledDocumentRecordId) {
      const resolved = await resolveFilledDocument({
        filledDocumentRecordId,
        legalDocumentId,
        fallbackName: statusDoc.filledDocumentName || `${stepLabel} Document`,
      });

      const displayContent =
        resolved.fileType === 'pdf' && resolved.filePath
          ? resolved.content
          : buildFilledDocumentText({
              documentName: resolved.fileName,
              statusLabel: stepLabel,
              content: resolved.content,
              filledFields: resolved.filledFields,
            });

      const today = new Date().toISOString().split('T')[0];
      return {
        id: filledDocumentRecordId || statusDoc.id,
        documentName: resolved.fileName || `${stepLabel} Document`,
        documentType: 'Contract',
        createdDate: today,
        lastModifiedDate: today,
        createdBy: 'Current User',
        lastModifiedBy: 'Current User',
        status: 'Executed',
        fileSize: 0,
        fileName: resolved.fileName,
        description: `Filled ${stepLabel} document captured from the deal workflow`,
        linkedAssets: [],
        linkedDeals: [],
        permissions: [],
        tags: [],
        version: 1,
        content: displayContent,
        fileType: resolved.fileType,
        filePath: resolved.filePath,
      };
    }

    if (!legalDocumentId) {
      throw new Error(`No document linked for the ${stepLabel} step`);
    }

    return fetchLegalDocumentById(legalDocumentId);
  };

  /** Opens a filled or template document for a specific workflow status in the in-app viewer. */
  const handleOpenStatusDocument = async (item: BrokerWipItem, statusDoc: WipStatusDocument) => {
    const stepLabel = getStatusDocStepLabel(String(statusDoc.status));
    const loadingKey = getStatusDocumentLoadingKey(statusDoc) || statusDoc.id;

    setRowErrors(current => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    setLoadingViewDocumentId(loadingKey);
    try {
      const previewDocument = await buildStatusDocumentPreview(statusDoc);
      setSelectedViewDocument(previewDocument);
    } catch (error) {
      setRowErrors(current => ({
        ...current,
        [item.id]: error instanceof Error ? error.message : `Failed to open ${stepLabel} document`,
      }));
    } finally {
      setLoadingViewDocumentId(null);
    }
  };

  const openDocumentBrowser = (item: BrokerWipItem) => {
    const documents = getAvailableDocumentsForItem(item);
    if (documents.length === 0) return;

    setSelectedDocumentBrowser({
      dealName: item.leadName || parseDealTitle(item.dealName).dealName,
      item,
      documents,
    });
    setSelectedBrowserDocument(null);
    setDocumentBrowserError(null);
  };

  const closeDocumentBrowser = () => {
    setSelectedDocumentBrowser(null);
    setSelectedBrowserDocument(null);
    setDocumentBrowserError(null);
  };

  const handleOpenDocumentFromBrowser = async (statusDoc: WipStatusDocument) => {
    const loadingKey = getStatusDocumentLoadingKey(statusDoc) || statusDoc.id;
    setDocumentBrowserError(null);
    setLoadingViewDocumentId(loadingKey);

    try {
      const previewDocument = await buildStatusDocumentPreview(statusDoc);
      setSelectedBrowserDocument(previewDocument);
    } catch (error) {
      setDocumentBrowserError(
        error instanceof Error ? error.message : 'Failed to open document preview'
      );
    } finally {
      setLoadingViewDocumentId(null);
    }
  };

  /** Downloads the filled content of a workflow document as a .txt file. */
  const handleDownloadStatusDocument = async (item: BrokerWipItem, statusDoc: WipStatusDocument) => {
    const filledDocumentRecordId = String(statusDoc.filledDocumentRecordId || '').trim();
    const legalDocumentId = String(statusDoc.legalDocumentId || '').trim();
    const stepLabel = getStatusDocStepLabel(String(statusDoc.status));

    setRowErrors(current => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    setDownloadingDocumentId(statusDoc.id);
    try {
      const resolved = await resolveFilledDocument({
        filledDocumentRecordId,
        legalDocumentId,
        fallbackName: statusDoc.filledDocumentName || `${stepLabel} Document`,
      });

      const text = buildFilledDocumentText({
        documentName: resolved.fileName,
        statusLabel: stepLabel,
        content: resolved.content,
        filledFields: resolved.filledFields,
      });

      const dealName = parseDealTitle(item.dealName).dealName || item.dealName || 'deal';
      downloadTextFile(`${dealName} - ${stepLabel} - ${resolved.fileName}`, text);
    } catch (error) {
      setRowErrors(current => ({
        ...current,
        [item.id]:
          error instanceof Error ? error.message : `Failed to download ${stepLabel} document`,
      }));
    } finally {
      setDownloadingDocumentId(null);
    }
  };

  const handleStatusChange = async (item: BrokerWipItem, nextStatus: string) => {
    const latestRow = rows.find(row => row.id === item.id) || item;
    const normalizedNextStatus = canonicalStatus(nextStatus);
    const isLostTransition = isLostStatus(normalizedNextStatus);
    const nextStatusRequiresLegalDocument = statusRequiresLegalDocument(normalizedNextStatus);
    const comment = String(latestRow.comment || '').trim();
    const linkedDealId = resolveDealId(item);

    if (nextStatusRequiresLegalDocument) {
      setRowErrors(current => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      redirectToLegalDocs(item, normalizedNextStatus, comment);
      return;
    }

    const linkedForecastId = String(item.forecastDealId || item.id || '').trim();
    if (!isLostTransition) {
      const completion = getWorkflowCompletionFromDocumentStatuses(
        (latestRow.statusDocuments || []).map(doc => String(doc.status || ''))
      );
      const transition = validateDealWorkflowTransition({
        currentStatus: latestRow.status,
        nextStatus: normalizedNextStatus,
        completion,
      });

      if (!transition.valid) {
        setRowErrors(current => ({
          ...current,
          [item.id]: transition.message || 'Invalid status transition',
        }));
        return;
      }

      if (statusRequiresComment(normalizedNextStatus) && !comment) {
        setRowErrors(current => ({
          ...current,
          [item.id]: 'Comment is required for this status',
        }));
        return;
      }
    }

    setRowErrors(current => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    const previousStatus = item.status;
    setRows(current =>
      current.map(row =>
        row.id === item.id
          ? {
              ...row,
              status: dealWorkflowStatusLabel(normalizedNextStatus),
              actionRequired: deriveActionRequired(normalizedNextStatus),
              updatedAt: new Date().toISOString(),
            }
          : row
      )
    );

    setUpdatingStatusId(item.id);
    try {
      if (linkedDealId) {
        const updated = await forecastDealApiService.updateWipStatus({
          dealId: linkedDealId,
          status: normalizedNextStatus,
          brokerId: item.brokerId,
          ...(comment ? { comment } : {}),
        });
        setRows(current =>
          current.map(row =>
            row.id === item.id
              ? {
                  ...row,
                  status: updated.status,
                  legalDocument: updated.legalDocument || row.legalDocument || '',
                  comment: updated.comment ?? row.comment,
                  forecastDealId: updated.forecastDeal?.id,
                  actionRequired: deriveActionRequired(updated.status),
                  updatedAt: updated.forecastDeal?.updatedAt || new Date().toISOString(),
                }
              : row
          )
        );
      } else if (linkedForecastId) {
        const updated = await forecastDealApiService.updateForecastDeal(linkedForecastId, {
          status: normalizedNextStatus,
          ...(comment ? { comment } : {}),
        });
        setRows(current =>
          current.map(row =>
            row.id === item.id
              ? {
                  ...row,
                  status: updated.status,
                  legalDocument: updated.legalDocument || row.legalDocument || '',
                  actionRequired: deriveActionRequired(updated.status),
                  updatedAt: updated.updatedAt || row.updatedAt,
                }
              : row
          )
        );
      } else {
        throw new Error('Linked deal is required to update status');
      }
    } catch (error) {
      setRows(current =>
        current.map(row =>
          row.id === item.id
            ? {
                ...row,
                status: previousStatus,
                actionRequired: deriveActionRequired(previousStatus),
              }
            : row
        )
      );
      setRowErrors(current => ({
        ...current,
        [item.id]: error instanceof Error ? error.message : 'Failed to update status',
      }));
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleCommentChange = (id: string, comment: string) => {
    setRows(current => current.map(row => (row.id === id ? { ...row, comment } : row)));
    if (comment.trim()) {
      setRowErrors(current => {
        const next = { ...current };
        if (next[id] === 'Comment is required for this status') {
          delete next[id];
        }
        return next;
      });
    }
  };

  const handleCommentSave = async (item: BrokerWipItem, comment: string) => {
    const linkedDealId = resolveDealId(item);
    const linkedForecastId = String(item.forecastDealId || item.id || '').trim();
    const linkedLeadId = String(item.leadId || '').trim();
    const normalizedComment = String(comment || '').trim();
    const currentStatusRequiresLegalDocument = statusRequiresLegalDocument(item.status);
    let commentAddedToThread = false;

    if (statusRequiresComment(item.status) && !normalizedComment) {
      setRowErrors(current => ({
        ...current,
        [item.id]: 'Comment is required for this status',
      }));
      return;
    }

    setRowErrors(current => {
      const next = { ...current };
      if (next[item.id] === 'Comment is required for this status') {
        delete next[item.id];
      }
      return next;
    });

    setSavingCommentId(item.id);
    try {
      await wipCommentService.addComment({
        item,
        text: normalizedComment,
        legacyComment: item.comment,
        legacyCreatedAt: item.createdAt,
        legacyUpdatedAt: item.updatedAt,
        actor: user
          ? {
              id: user.id,
              name: user.name,
              role: user.role,
              brokerId: user.brokerId,
            }
          : null,
      });
      commentAddedToThread = true;

      if (linkedLeadId) {
        await leadService.updateLeadComment(linkedLeadId, normalizedComment);
        setRows(current =>
          current.map(row =>
            row.id === item.id
              ? {
                  ...row,
                  comment: normalizedComment,
                  updatedAt: new Date().toISOString(),
                }
              : row
          )
        );
      }

      if (linkedDealId) {
        const updated = await forecastDealApiService.updateWipStatus({
          dealId: linkedDealId,
          status: item.status,
          brokerId: item.brokerId,
          ...(currentStatusRequiresLegalDocument && item.legalDocument
            ? { legalDocument: item.legalDocument }
            : {}),
          comment: normalizedComment,
        });
        setRows(current =>
          current.map(row =>
            row.id === item.id
              ? {
                  ...row,
                  status: updated.status,
                  legalDocument: updated.legalDocument || row.legalDocument || '',
                  comment: updated.comment ?? normalizedComment,
                  forecastDealId: updated.forecastDeal?.id,
                  actionRequired: deriveActionRequired(updated.status),
                  updatedAt: updated.forecastDeal?.updatedAt || new Date().toISOString(),
                }
              : row
          )
        );
      } else if (linkedForecastId) {
        const updated = await forecastDealApiService.updateForecastDeal(linkedForecastId, {
          ...(currentStatusRequiresLegalDocument && item.legalDocument
            ? { legalDocument: item.legalDocument }
            : {}),
          comment: normalizedComment,
        });
        setRows(current =>
          current.map(row =>
            row.id === item.id
              ? {
                  ...row,
                  status: updated.status,
                  legalDocument: updated.legalDocument || row.legalDocument || '',
                  comment: normalizedComment,
                  actionRequired: deriveActionRequired(updated.status),
                  updatedAt: updated.updatedAt || new Date().toISOString(),
                }
              : row
          )
        );
      } else if (!linkedLeadId) {
        setRows(current =>
          current.map(row =>
            row.id === item.id
              ? {
                  ...row,
                  comment: normalizedComment,
                  updatedAt: new Date().toISOString(),
                }
              : row
          )
        );
      }

      try {
        await commentAuditService.recordCommentAudit({
          item,
          previousComment: '',
          nextComment: normalizedComment,
          actor: user
            ? {
                id: user.id,
                name: user.name,
                role: user.role,
                brokerId: user.brokerId,
              }
            : null,
        });
      } catch (auditError) {
        setRowErrors(current => ({
          ...current,
          [item.id]:
            auditError instanceof Error
              ? `Comment added, but audit tracking failed: ${auditError.message}`
              : 'Comment added, but audit tracking failed',
        }));
      }
    } catch (error) {
      if (commentAddedToThread) {
        setRows(current =>
          current.map(row =>
            row.id === item.id
              ? {
                  ...row,
                  comment: normalizedComment,
                  updatedAt: new Date().toISOString(),
                }
              : row
          )
        );
      }

      setRowErrors(current => ({
        ...current,
        [item.id]:
          commentAddedToThread
            ? error instanceof Error
              ? `Comment added, but summary sync failed: ${error.message}`
              : 'Comment added, but summary sync failed'
            : error instanceof Error
            ? error.message
            : 'Failed to add comment',
      }));
    } finally {
      setSavingCommentId(null);
    }
  };

  const getDealTypeColor = (dealType: string) => {
    switch (canonicalDealType(dealType)) {
      case 'leasing':
        return 'bg-blue-50 text-blue-700';
      case 'sales':
        return 'bg-purple-50 text-purple-700';
      case 'auction':
        return 'bg-orange-50 text-orange-700';
      default:
        return 'bg-stone-50 text-stone-700';
    }
  };

  const getStatusBadgeColor = (status: string): string => {
    const s = canonicalStatus(status);
    if (s === 'new_lead' || s === 'new') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (s === 'proposal') return 'bg-purple-100 text-purple-700 border-purple-200';
    if (s === 'loi') return 'bg-orange-100 text-orange-700 border-orange-200';
    if (s === 'otp' || s === 'otl') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (s === 'due_diligence') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (s === 'finance') return 'bg-teal-100 text-teal-700 border-teal-200';
    if (s === 'transfer') return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    if (s === 'invoice') return 'bg-slate-100 text-slate-700 border-slate-200';
    if (s === 'sale_agreement' || s === 'lease_agreement') return 'bg-violet-100 text-violet-700 border-violet-200';
    if (isClosedStatus(status)) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (isLostStatus(status)) return 'bg-red-100 text-red-700 border-red-200';
    if (s === 'awaiting_payment') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-stone-100 text-stone-600 border-stone-200';
  };

  const openLeadOrOwnerDetails = (item: BrokerWipItem) => {
    if (item.leadId) {
      setViewingLeadId(item.leadId);
      return;
    }

    const property = allProperties.find(p => p.id === item.propertyId);
    setOwnerPopup({
      title: item.leadName || parseDealTitle(item.dealName).dealName,
      ownerName: property?.ownerName,
      ownerEmail: property?.ownerEmail,
      ownerContactNumber: property?.ownerContactNumber,
    });
  };

  const openCommentEditor = (item: BrokerWipItem) => {
    setSelectedDealForCommentModal({
      dealName: item.leadName || parseDealTitle(item.dealName).dealName,
      id: item.id,
    });
  };

  // KPI display-only computed values (UI only, no business logic)
  const totalDeals = properties.length;
  const totalExpectedValue = properties.reduce((sum, p) => sum + Number(p.expectedValue || 0), 0);
  const totalGrossCommission = properties.reduce((sum, p) => sum + Number(p.brokerCommission || 0), 0);
  const _nowDate = new Date();
  const dealsClosingThisMonth = properties.filter(p => {
    if (!p.forecastedClosureDate) return false;
    const d = new Date(p.forecastedClosureDate);
    return d.getFullYear() === _nowDate.getFullYear() && d.getMonth() === _nowDate.getMonth();
  }).length;

  const activeCommentItem = selectedDealForCommentModal
    ? rows.find(row => row.id === selectedDealForCommentModal.id) || null
    : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] space-y-5 p-1">
      {/* Page Header */}
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[#2563EB] hover:text-blue-800 mb-4 text-sm font-medium transition-colors"
        >
          <FiArrowLeft size={15} />
          Back to Brokers
        </button>

        <div className="flex items-center gap-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex-shrink-0">
            <img
              src={broker.profilePicture}
              alt={broker.name}
              className="w-14 h-14 rounded-full object-cover border-2 border-blue-100 shadow-sm"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{broker.name}</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {broker.department && (
                    <span className="font-medium text-gray-600">{broker.department} · </span>
                  )}
                  WIP Deals · {broker.segments.length} active segment(s)
                </p>
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-[#2563EB] text-xs font-semibold border border-blue-100">
                {totalDeals} Active Deal{totalDeals !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Total Deals */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 flex-shrink-0">
            <svg className="w-5 h-5 text-[#2563EB]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold text-gray-900">{totalDeals}</p>
            <p className="text-xs text-gray-500 mt-0.5 font-medium">Total Deals</p>
          </div>
        </div>
        {/* Total Expected Value */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 flex-shrink-0">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-gray-900 truncate">{formatRand(totalExpectedValue)}</p>
            <p className="text-xs text-gray-500 mt-0.5 font-medium">Total Expected Value</p>
          </div>
        </div>
        {/* Total Gross Commission */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-purple-50 flex-shrink-0">
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-gray-900 truncate">{formatRand(totalGrossCommission)}</p>
            <p className="text-xs text-gray-500 mt-0.5 font-medium">Total Gross Commission</p>
          </div>
        </div>
        {/* Deals Closing This Month */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-orange-50 flex-shrink-0">
            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold text-gray-900">{dealsClosingThisMonth}</p>
            <p className="text-xs text-gray-500 mt-0.5 font-medium">Closing This Month</p>
          </div>
        </div>
        {/* Current Billing */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-sky-50 flex-shrink-0">
            <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-gray-900 truncate">{formatRand(currentBilling)}</p>
            <p className="text-xs text-gray-500 mt-0.5 font-medium">Current Billing</p>
          </div>
        </div>
        {/* Billing Target */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-green-50 flex-shrink-0">
            <svg className="w-5 h-5 text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-gray-900 truncate">{formatRand(billingTarget)}</p>
            <p className="text-xs text-gray-500 mt-0.5 font-medium">Billing Target</p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${percentageAchieved >= 100 ? 'bg-[#10B981]' : 'bg-[#2563EB]'}`}
                style={{ width: `${Math.min(percentageAchieved, 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{percentageAchieved}% of target</p>
          </div>
        </div>
      </div>

      {/* Modern Filter Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[180px]">
            <label className="text-[11px] text-gray-500 mb-1.5 block font-medium uppercase tracking-wide">Search Deals</label>
            <div className="relative">
              <FiSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={wipSearchQuery}
                onChange={e => setWipSearchQuery(e.target.value)}
                placeholder="Search leads, addresses..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent hover:border-gray-300 transition-colors bg-white"
              />
            </div>
          </div>
          {/* Status */}
          <div className="min-w-[150px]">
            <label className="text-[11px] text-gray-500 mb-1.5 block font-medium uppercase tracking-wide">Status</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent hover:border-gray-300 transition-colors bg-white"
            >
              <option value="all">All Statuses</option>
              {statuses.map(status => (
                <option key={status} value={status}>{formatStatusLabel(status)}</option>
              ))}
            </select>
          </div>
          {/* Deal Type */}
          <div className="min-w-[150px]">
            <label className="text-[11px] text-gray-500 mb-1.5 block font-medium uppercase tracking-wide">Deal Type</label>
            <select
              value={selectedDealType}
              onChange={e => setSelectedDealType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent hover:border-gray-300 transition-colors bg-white"
            >
              <option value="all">All Types</option>
              {dealTypes.map(dealType => (
                <option key={dealType} value={dealType}>{formatDealTypeLabel(dealType)}</option>
              ))}
            </select>
          </div>
          {/* Action buttons */}
          <div className="flex items-end gap-2 ml-auto">
            <button
              type="button"
              onClick={() => { setWipSearchQuery(''); setSelectedStatus('all'); setSelectedDealType('all'); }}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Reset
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg hover:bg-blue-700 transition-colors"
            >
              <FiFilter size={13} />
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Outcome Check Notifications */}
      {outcomeReminders
        .filter(r => !dismissedReminderIds.has(r.id))
        .filter(r => {
          const dealId = String(r.dealId || '').trim();
          return rows.some(
            row =>
              String(row.dealId || '').trim() === dealId &&
              !isClosedStatus(row.status) &&
              !isLostStatus(row.status)
          );
        })
        .map(reminder => {
          const dealId = String(reminder.dealId || '').trim();
          const matchedRow = rows.find(row => String(row.dealId || '').trim() === dealId);
          const dealName = matchedRow?.dealName || 'this deal';
          const isActioning = actioningReminderIds.has(reminder.id);
          return (
            <div
              key={reminder.id}
              className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-900">🔔 Deal Outcome Check</p>
                <p className="text-sm text-amber-800 mt-1">
                  All documents for <strong>{dealName}</strong> are complete. What is the outcome
                  of this deal?
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0 flex-wrap">
                <button
                  onClick={() => void handleOutcomeAction(reminder, 'won')}
                  disabled={isActioning}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                >
                  ✅ Won
                </button>
                <button
                  onClick={() => void handleOutcomeAction(reminder, 'awaiting_payment')}
                  disabled={isActioning}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  ⏳ Awaiting Payment
                </button>
                <button
                  onClick={() => void handleOutcomeAction(reminder, 'lost')}
                  disabled={isActioning}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  ❌ Lost
                </button>
                <button
                  onClick={() =>
                    setDismissedReminderIds(prev => new Set(Array.from(prev).concat(reminder.id)))
                  }
                  disabled={isActioning}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-200 text-stone-700 hover:bg-stone-300 disabled:opacity-60 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}

      {/* WIP Deals Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-900">WIP Deals</h2>
            <p className="text-sm text-gray-500">Track and manage your Work In Progress deals</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-50 text-[#2563EB] text-xs font-semibold border border-blue-100">
              {filteredProperties.length} deal{filteredProperties.length === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
              <FiCheckCircle size={12} />
              {filteredProperties.reduce(
                (total, deal) =>
                  total +
                  dedupeStatusDocumentsByStatus(deal).filter(isStatusDocumentFilled).length,
                0
              )}{' '}
              filled
            </span>
            {loadingLegalDocuments && (
              <span className="text-xs font-medium text-stone-400">Syncing docs...</span>
            )}
          </div>
        </div>

        {legalDocumentsError && (
          <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Legal documents could not be loaded: {legalDocumentsError}
          </div>
        )}

        {filteredProperties.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <FiSearch size={20} className="text-gray-400" />
            </div>
            <p className="text-gray-700 font-semibold">No deals found</p>
            <p className="text-sm text-gray-400 mt-1">Adjust your filters to see more deals.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-separate border-spacing-0 [&_th]:border-b [&_th]:border-stone-200 [&_th]:border-r [&_th:first-child]:border-l [&_td]:border-b [&_td]:border-stone-200 [&_td]:border-r [&_td:first-child]:border-l">
              <thead className="bg-stone-50/80 border-b border-stone-200">
                <tr>
                  <th className="w-[16%] px-5 py-3 text-left text-xs font-semibold text-stone-700">Lead Name</th>
                  <th className="w-[19%] px-5 py-3 text-left text-xs font-semibold text-stone-700">Address</th>
                  <th className="w-[5%] px-5 py-3 text-left text-xs font-semibold text-stone-700">Deal Type</th>
                  <th className="w-[10%] px-5 py-3 text-left text-xs font-semibold text-stone-700">Status</th>
                  <th className="w-[8%] px-5 py-3 text-right text-xs font-semibold text-stone-700 whitespace-nowrap">Expected Value</th>
                  <th className="w-[7%] px-4 py-3 text-right text-xs font-semibold text-stone-700 whitespace-nowrap">Gross Comm</th>
                  <th className="w-[11%] px-4 py-3 text-left text-xs font-semibold text-stone-700 whitespace-nowrap">Closure Date</th>
                  <th className="w-[5%] px-5 py-3 text-left text-xs font-semibold text-stone-700">Doc</th>
                  <th className="w-[10%] px-5 py-3 text-left text-xs font-semibold text-stone-700">Comment</th>
                  <th className="w-[8%] px-5 py-3 text-center text-xs font-semibold text-stone-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {paginatedProperties.map((item, index) => {
                  const normalizedComment = String(item.comment || '').trim();
                  const documents = getAvailableDocumentsForItem(item);
                  const requiresComment = statusRequiresComment(item.status);
                  const isMissingComment = requiresComment && !normalizedComment;
                  const rowError = rowErrors[item.id];
                  const documentCount = documents.length;
                  const rowTone = index % 2 === 0 ? 'bg-white' : 'bg-stone-50/40';
                  const actionButtonClass =
                    'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-stone-500 transition-colors hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40';

                  return (
                    <tr key={item.id} className={`${rowTone} transition-colors hover:bg-blue-50/40`}>
                      <td className="px-5 py-4 text-sm font-semibold text-stone-900 align-top whitespace-normal break-words">
                        <button
                          type="button"
                          onClick={() => openLeadOrOwnerDetails(item)}
                          className="block w-full text-left leading-6 text-stone-900 transition-colors hover:text-blue-700 whitespace-normal break-words"
                        >
                          {item.leadName || parseDealTitle(item.dealName).dealName}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-sm text-stone-600 align-top whitespace-normal break-words">
                        <button
                          type="button"
                          onClick={() => openLeadOrOwnerDetails(item)}
                          className="block w-full text-left leading-5 transition-colors hover:text-blue-700 whitespace-normal break-words"
                        >
                          {formatAddressText(item.address)}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-stone-700 align-top whitespace-nowrap">
                        {formatWipDealType(item.dealType)}
                      </td>
                      <td className="px-3 py-4 text-sm align-top overflow-hidden">
                        <div
                          className={`flex w-full min-w-0 max-w-full overflow-hidden rounded-md border px-2 py-1 ${getStatusBadgeColor(
                            item.status
                          )}`}
                        >
                          <select
                            value={toStatusValue(item.status)}
                            onChange={event => {
                              void handleStatusChange(item, event.target.value);
                            }}
                            disabled={updatingStatusId === item.id}
                            className={`block w-full min-w-0 truncate bg-transparent pr-5 text-xs font-semibold focus:outline-none ${
                              updatingStatusId === item.id ? 'cursor-not-allowed' : 'cursor-pointer'
                            }`}
                          >
                            {Array.from(
                              new Set([
                                toStatusValue(item.status),
                                ...statusOptionsForRow(item.dealType, brokerType).map(option =>
                                  toStatusValue(option)
                                ),
                              ])
                            ).map(statusOption => (
                              <option key={statusOption} value={statusOption}>
                                {formatStatusLabel(statusOption)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-stone-900 text-right align-top whitespace-nowrap">
                        {formatRand(item.expectedValue)}
                      </td>
                      <td className="px-4 py-4 text-sm text-right align-top whitespace-nowrap">
                        {editingCommissionId === item.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={editingCommissionValue}
                              onChange={e => setEditingCommissionValue(e.target.value)}
                              onBlur={() => {
                                void handleSaveCommission(item);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  void handleSaveCommission(item);
                                }
                                if (e.key === 'Escape') {
                                  setEditingCommissionId(null);
                                }
                              }}
                              disabled={savingCommissionId === item.id}
                              autoFocus
                              className="w-28 rounded-lg border border-blue-200 px-2 py-1 text-right text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommissionId(item.id);
                              setEditingCommissionValue(String(item.brokerCommission ?? 0));
                            }}
                            title="Edit gross commission"
                            className="font-semibold text-stone-900 transition-colors hover:text-blue-700"
                          >
                            {formatRand(item.brokerCommission)}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm align-top whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedDealForDateModal(item)}
                          className="inline-flex items-center gap-2 text-left transition-colors hover:text-amber-700"
                          title="View deal dates"
                        >
                          <FiCalendar size={14} className="text-stone-400" />
                          <span className="font-medium text-amber-700">
                            {formatWipCloseDate(item.forecastedClosureDate || item.createdAt)}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <button
                          type="button"
                          onClick={() => openDocumentBrowser(item)}
                          disabled={documentCount === 0}
                          className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100 disabled:text-stone-400"
                          title={documentCount > 0 ? 'Open linked documents' : 'No documents linked'}
                        >
                          <FiFileText
                            size={15}
                            className={documentCount > 0 ? 'text-stone-500' : 'text-stone-300'}
                          />
                          <span>{documentCount}</span>
                        </button>
                      </td>
                      <td className="px-5 py-4 text-sm text-stone-600 align-top whitespace-normal break-words">
                        <div className="w-full">
                          <button
                            type="button"
                            onClick={() => openCommentEditor(item)}
                            className={`w-full text-left leading-5 transition-colors ${
                              item.comment ? 'text-stone-700 hover:text-blue-700' : 'text-stone-400 hover:text-blue-700'
                            }`}
                            title="View or edit comment"
                          >
                            <span className="line-clamp-2">
                              {item.comment || 'Add comment'}
                            </span>
                          </button>
                          {isMissingComment && (
                            <p className="mt-1 text-[11px] font-medium text-red-600">
                              Comment required for this status
                            </p>
                          )}
                          {rowError && (
                            <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700">
                              {rowError}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex items-center justify-center gap-1">

                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommissionId(item.id);
                              setEditingCommissionValue(String(item.brokerCommission ?? 0));
                            }}
                            className={actionButtonClass}
                            title="Edit gross commission"
                          >
                            <FiEdit2 size={15} />
                          </button>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                void handleDeleteDeal(item);
                              }}
                              disabled={deletingId === item.id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-red-500 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Delete deal"
                            >
                              <FiTrash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredProperties.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-200 px-6 py-4">
            <p className="text-sm text-stone-500">
              Showing {wipRangeStart} to {wipRangeEnd} of {filteredProperties.length} deals
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setWipPage(1)}
                  disabled={safeWipPage === 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title="First page"
                >
                  <FiChevronsLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setWipPage(current => Math.max(1, current - 1))}
                  disabled={safeWipPage === 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Previous page"
                >
                  <FiChevronLeft size={14} />
                </button>
                {visibleWipPages.map(page => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setWipPage(page)}
                    className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm font-semibold transition-colors ${
                      page === safeWipPage
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setWipPage(current => Math.min(wipTotalPages, current + 1))}
                  disabled={safeWipPage === wipTotalPages}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Next page"
                >
                  <FiChevronRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setWipPage(wipTotalPages)}
                  disabled={safeWipPage === wipTotalPages}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Last page"
                >
                  <FiChevronsRight size={14} />
                </button>
              </div>

              <label className="flex items-center gap-2 text-sm text-stone-500">
                <span>Rows per page</span>
                <select
                  value={wipRowsPerPage}
                  onChange={event => setWipRowsPerPage(Number(event.target.value))}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[5, 10, 25, 50].map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Canvassing Sheets */}
      <CanvassingSheets broker={{ id: broker.id, name: broker.name }} />

      {/* Deal Date Modal */}
      <DealDateModal
        isOpen={selectedDealForDateModal !== null}
        onClose={() => setSelectedDealForDateModal(null)}
        dealName={selectedDealForDateModal?.dealName || ''}
        createdAt={selectedDealForDateModal?.createdAt || ''}
        updatedAt={selectedDealForDateModal?.updatedAt || ''}
        status={selectedDealForDateModal?.status || ''}
      />

      {selectedDocumentBrowser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeDocumentBrowser}>
          <div className="w-full max-w-5xl rounded-2xl border border-stone-200 bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {selectedBrowserDocument ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-5 py-4">
                  <div className="min-w-0 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBrowserDocument(null);
                        setDocumentBrowserError(null);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-stone-600 transition-colors hover:bg-white hover:text-stone-900"
                      title="Back to document list"
                    >
                      <FiArrowLeft size={16} />
                    </button>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-stone-900">Linked Documents</h3>
                      <p className="truncate text-xs text-stone-500">{selectedBrowserDocument.documentName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {selectedBrowserDocument.fileType !== 'pdf' && selectedBrowserDocument.content && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextFile(
                            selectedBrowserDocument.fileName || selectedBrowserDocument.documentName,
                            selectedBrowserDocument.content || ''
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
                      >
                        <FiDownload size={14} />
                        Download
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={closeDocumentBrowser}
                      className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="h-[70vh] overflow-auto">
                  {selectedBrowserDocument.fileType === 'pdf' &&
                  selectedBrowserDocument.filePath &&
                  !String(selectedBrowserDocument.filePath).startsWith('blob:') ? (
                    <iframe
                      src={`${selectedBrowserDocument.filePath}#toolbar=1&navpanes=0&scrollbar=1`}
                      className="h-full w-full border-none"
                      title={selectedBrowserDocument.documentName}
                    />
                  ) : selectedBrowserDocument.content ? (
                    <pre className="whitespace-pre-wrap p-5 font-mono text-sm text-stone-800">
                      {selectedBrowserDocument.content}
                    </pre>
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-stone-500">
                      This document does not have a readable preview.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-5 py-4">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-stone-900">Linked Documents</h3>
                    <p className="truncate text-xs text-stone-500">{selectedDocumentBrowser.dealName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeDocumentBrowser}
                    className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
                  >
                    Close
                  </button>
                </div>

                <div className="max-h-[70vh] overflow-y-auto p-5">
                  <p className="mb-4 text-sm text-stone-500">Choose a document to view, then use Back to return and open another one.</p>
                  {documentBrowserError && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {documentBrowserError}
                    </div>
                  )}
                  <div className="space-y-3">
                    {selectedDocumentBrowser.documents.map(statusDoc => {
                      const loadingKey = getStatusDocumentLoadingKey(statusDoc) || statusDoc.id;
                      const isLoading = loadingViewDocumentId === loadingKey;
                      const stepLabel = getStatusDocStepLabel(String(statusDoc.status));
                      const updatedAtLabel = formatDateTime(statusDoc.lastModifiedAt || statusDoc.uploadedAt);
                      const isFilled = isStatusDocumentFilled(statusDoc);
                      return (
                        <button
                          key={statusDoc.id}
                          type="button"
                          onClick={() => {
                            void handleOpenDocumentFromBrowser(statusDoc);
                          }}
                          disabled={isLoading}
                          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <FiFileText size={15} className="text-stone-400" />
                                <p className="truncate text-sm font-semibold text-stone-900">{getStatusDocumentDisplayName(statusDoc)}</p>
                              </div>
                              <p className="mt-1 text-xs font-medium text-stone-500">{stepLabel}</p>
                              <p className="mt-1 text-xs text-stone-400">{updatedAtLabel}</p>
                            </div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${isFilled ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                              {isLoading ? 'Opening...' : isFilled ? 'Filled' : 'Template'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {selectedViewDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-stone-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 bg-stone-50">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-stone-900">Document Viewer</h3>
                <p className="text-xs text-stone-500 truncate">{selectedViewDocument.documentName}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {selectedViewDocument.fileType !== 'pdf' && selectedViewDocument.content && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadTextFile(
                        selectedViewDocument.fileName || selectedViewDocument.documentName,
                        selectedViewDocument.content || ''
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700 text-sm font-semibold transition-colors"
                  >
                    <FiDownload size={14} />
                    Download
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedViewDocument(null)}
                  className="px-3 py-1.5 rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 text-sm"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="h-[70vh] overflow-auto">
              {selectedViewDocument.fileType === 'pdf' &&
              selectedViewDocument.filePath &&
              !String(selectedViewDocument.filePath).startsWith('blob:') ? (
                <iframe
                  src={`${selectedViewDocument.filePath}#toolbar=1&navpanes=0&scrollbar=1`}
                  className="w-full h-full border-none"
                  title={selectedViewDocument.documentName}
                />
              ) : selectedViewDocument.content ? (
                <pre className="p-5 whitespace-pre-wrap text-sm text-stone-800 font-mono">
                  {selectedViewDocument.content}
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-stone-500 p-6 text-center">
                  This document does not have a readable preview.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comment Modal */}
            <CommentModal
        isOpen={selectedDealForCommentModal !== null}
        onClose={() => setSelectedDealForCommentModal(null)}
        dealName={selectedDealForCommentModal?.dealName || ''}
        comment={activeCommentItem?.comment || ''}
        createdAt={activeCommentItem?.createdAt}
        updatedAt={activeCommentItem?.updatedAt}
        item={activeCommentItem}
        onAddComment={async (updatedComment: string) => {
          if (activeCommentItem) {
            await handleCommentSave(activeCommentItem, updatedComment);
          }
        }}
        isSaving={selectedDealForCommentModal?.id ? savingCommentId === selectedDealForCommentModal.id : false}
      />

      {/* Status Timeline Modal */}
      {timelineItemId && (() => {
        const timelineItem = rows.find(r => r.id === timelineItemId);
        if (!timelineItem) return null;
        const sortedHistory = Array.isArray(timelineItem.statusHistory)
          ? [...timelineItem.statusHistory].sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime())
          : [];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setTimelineItemId(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50">
                <div>
                  <h3 className="text-sm font-bold text-stone-950">{timelineItem.leadName || parseDealTitle(timelineItem.dealName).dealName}</h3>
                  <p className="text-xs text-stone-500 mt-0.5">Status Timeline</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTimelineItemId(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              {/* Timeline body */}
              <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
                <div className="relative">
                  {/* Vertical connector line */}
                  <div className="absolute left-[7px] top-3 bottom-3 w-px bg-stone-200" />
                  <ol className="space-y-5">
                    {/* Created entry */}
                    <li className="flex items-start gap-4">
                      <span className="relative z-10 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white shadow flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Deal Created</p>
                        <p className="text-sm font-semibold text-stone-800 mt-0.5">
                          {new Date(timelineItem.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                        <p className="text-xs text-stone-400">
                          {new Date(timelineItem.createdAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </li>
                    {/* Status change entries */}
                    {sortedHistory.map((h, idx) => {
                      const isLatest = idx === sortedHistory.length - 1;
                      return (
                        <li key={h.id} className="flex items-start gap-4">
                          <span className={`relative z-10 w-3.5 h-3.5 rounded-full border-2 border-white shadow flex-shrink-0 mt-0.5 ${
                            isLatest ? 'bg-blue-500' : 'bg-stone-300'
                          }`} />
                          <div>
                            <p className={`text-xs font-bold uppercase tracking-wide ${isLatest ? 'text-blue-600' : 'text-stone-400'}`}>
                              {isLatest ? 'Current Status' : `Step ${idx + 1}`}
                            </p>
                            <p className={`text-sm font-semibold mt-0.5 ${isLatest ? 'text-blue-800' : 'text-stone-700'}`}>
                              {formatStatusLabel(h.status)}
                            </p>
                            <p className="text-xs text-stone-400">
                              {new Date(h.changedAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}
                              {' · '}
                              {new Date(h.changedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                    {/* Target close if set */}
                    {timelineItem.forecastedClosureDate && (
                      <li className="flex items-start gap-4">
                        <span className="relative z-10 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white shadow flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-amber-600 uppercase tracking-wide">Target Close</p>
                          <p className="text-sm font-semibold text-amber-800 mt-0.5">
                            {new Date(timelineItem.forecastedClosureDate).toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </p>
                        </div>
                      </li>
                    )}
                  </ol>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Lead Detail Modal */}
      {viewingLeadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 relative">
            <button
              type="button"
              onClick={() => setViewingLeadId(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 text-xl font-bold"
              aria-label="Close"
            >
              ×
            </button>
            <h3 className="text-lg font-bold text-stone-950 mb-4">Lead Details</h3>
            {loadingLeadDetail ? (
              <p className="text-stone-500 text-sm">Loading…</p>
            ) : !viewingLead ? (
              <p className="text-stone-500 text-sm">Could not load lead details.</p>
            ) : (
              <dl className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <dt className="w-32 text-stone-500 font-medium flex-shrink-0">Name</dt>
                  <dd className="text-stone-950 font-semibold">{viewingLead.name || '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-32 text-stone-500 font-medium flex-shrink-0">Email</dt>
                  <dd className="text-stone-700 break-all">{viewingLead.email || '—'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-32 text-stone-500 font-medium flex-shrink-0">Phone</dt>
                  <dd className="text-stone-700">{viewingLead.phone || '—'}</dd>
                </div>
                {viewingLead.company && (
                  <div className="flex gap-2">
                    <dt className="w-32 text-stone-500 font-medium flex-shrink-0">Company</dt>
                    <dd className="text-stone-700">{viewingLead.company}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="w-32 text-stone-500 font-medium flex-shrink-0">Status</dt>
                  <dd className="text-stone-700">{viewingLead.status || '—'}</dd>
                </div>
                {viewingLead.stage && (
                  <div className="flex gap-2">
                    <dt className="w-32 text-stone-500 font-medium flex-shrink-0">Stage</dt>
                    <dd className="text-stone-700">{viewingLead.stage}</dd>
                  </div>
                )}
                {viewingLead.leadSource && (
                  <div className="flex gap-2">
                    <dt className="w-32 text-stone-500 font-medium flex-shrink-0">Source</dt>
                    <dd className="text-stone-700">{viewingLead.leadSource}</dd>
                  </div>
                )}
                {viewingLead.propertyAddress && (
                  <div className="flex gap-2">
                    <dt className="w-32 text-stone-500 font-medium flex-shrink-0">Property</dt>
                    <dd className="text-stone-700">{viewingLead.propertyAddress}</dd>
                  </div>
                )}
                {viewingLead.notes && (
                  <div className="flex gap-2">
                    <dt className="w-32 text-stone-500 font-medium flex-shrink-0">Notes</dt>
                    <dd className="text-stone-600 italic">{viewingLead.notes}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </div>
      )}

      {/* Owner Info Popup */}
      {ownerPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOwnerPopup(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-stone-900">{ownerPopup.title}</h3>
                <p className="text-xs text-stone-500 mt-0.5">Owner Details</p>
              </div>
              <button onClick={() => setOwnerPopup(null)} className="text-stone-400 hover:text-stone-600 text-xl leading-none">&times;</button>
            </div>
            {ownerPopup.ownerName || ownerPopup.ownerEmail || ownerPopup.ownerContactNumber ? (
              <div className="space-y-3">
                {ownerPopup.ownerName && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-stone-500 w-16 shrink-0">Name</span>
                    <span className="text-sm text-stone-900">{ownerPopup.ownerName}</span>
                  </div>
                )}
                {ownerPopup.ownerEmail && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-stone-500 w-16 shrink-0">Email</span>
                    <a href={`mailto:${ownerPopup.ownerEmail}`} className="text-sm text-violet-600 hover:underline">{ownerPopup.ownerEmail}</a>
                  </div>
                )}
                {ownerPopup.ownerContactNumber && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-stone-500 w-16 shrink-0">Phone</span>
                    <a href={`tel:${ownerPopup.ownerContactNumber}`} className="text-sm text-violet-600 hover:underline">{ownerPopup.ownerContactNumber}</a>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-stone-400 italic">No owner details have been added for this property. You can add them in the Map module.</p>
            )}
            <button onClick={() => setOwnerPopup(null)} className="mt-5 w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium rounded-lg transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};










