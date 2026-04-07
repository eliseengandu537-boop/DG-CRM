import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiArrowLeft, FiFilter, FiSearch } from 'react-icons/fi';
import { Broker } from './BrokerCard';
import { BrokerWipItem } from '@/services/brokerPerformanceService';
import { forecastDealApiService } from '@/services/forecastDealService';
import { legalDocService } from '@/services/legalDocService';
import { leadService } from '@/services/leadService';
import { customRecordService } from '@/services/customRecordService';
import { reminderService, ReminderRecord } from '@/services/reminderService';
import { LegalDocument } from '@/data/legaldocs';
import { DealDateModal } from './DealDateModal';
import { CommentModal } from './CommentModal';
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

function formatCommentTimestamp(timestamp?: string): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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

export const BrokerDetail: React.FC<BrokerDetailProps> = ({ broker, onBack, wipSheets = [] }) => {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDealType, setSelectedDealType] = useState<string>('all');
  const [wipSearchQuery, setWipSearchQuery] = useState<string>('');
  const [rows, setRows] = useState<BrokerWipItem[]>(wipSheets);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [legalDocuments, setLegalDocuments] = useState<LegalDocument[]>([]);
  const [loadingLegalDocuments, setLoadingLegalDocuments] = useState(false);
  const [legalDocumentsError, setLegalDocumentsError] = useState<string | null>(null);
  const [selectedViewDocument, setSelectedViewDocument] = useState<LegalDocument | null>(null);
  const [loadingViewDocumentId, setLoadingViewDocumentId] = useState<string | null>(null);
  const [selectedDealForDateModal, setSelectedDealForDateModal] = useState<BrokerWipItem | null>(null);
  const [selectedDealForCommentModal, setSelectedDealForCommentModal] = useState<{
    dealName: string;
    comment: string;
    id: string;
    updatedAt?: string;
  } | null>(null);
  const [outcomeReminders, setOutcomeReminders] = useState<ReminderRecord[]>([]);
  const [dismissedReminderIds, setDismissedReminderIds] = useState<Set<string>>(new Set());
  const [actioningReminderIds, setActioningReminderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setRows(wipSheets);
    setRowErrors({});
  }, [wipSheets]);

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

      setActioningReminderIds(prev => new Set([...prev, reminder.id]));
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

  if (!broker) return null;

  const brokerType = resolveBrokerType(broker, properties);

  const filteredProperties = properties
    .filter(item => selectedStatus === 'all' || canonicalStatus(item.status) === selectedStatus)
    .filter(item => selectedDealType === 'all' || canonicalDealType(item.dealType) === selectedDealType)
    .filter(item => {
      if (!wipSearchQuery.trim()) return true;
      const q = wipSearchQuery.toLowerCase();
      return (
        item.dealName.toLowerCase().includes(q) ||
        (item.address || '').toLowerCase().includes(q)
      );
    });

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

  const handleViewDocument = async (documentId: string) => {
    const normalizedId = String(documentId || '').trim();
    if (!normalizedId) return;

    setLoadingViewDocumentId(normalizedId);
    try {
      const fullDocument = await legalDocService.getDocumentById(normalizedId);
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

  const handleOpenWipDocument = async (item: BrokerWipItem) => {
    const preferredStatusDocument = pickPreferredStatusDocument(item);
    const filledDocumentRecordId = String(
      preferredStatusDocument?.filledDocumentRecordId || ''
    ).trim();
    const legalDocumentId = String(
      item.legalDocument || preferredStatusDocument?.legalDocumentId || ''
    ).trim();

    setRowErrors(current => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    if (filledDocumentRecordId) {
      setLoadingViewDocumentId(filledDocumentRecordId);
      try {
        const record = await customRecordService.getCustomRecordById<any>(filledDocumentRecordId);
        const payload = (record as any)?.payload || {};
        const content = String(
          payload.content || JSON.stringify(payload.filledContent || {}, null, 2)
        );
        const fileName = String(
          payload.filledDocumentName ||
            preferredStatusDocument?.filledDocumentName ||
            record.name ||
            'filled-document'
        ).trim();

        const today = new Date().toISOString().split('T')[0];

        setSelectedViewDocument({
          id: filledDocumentRecordId,
          documentName: fileName || 'Filled Document',
          documentType: 'Contract',
          createdDate: today,
          lastModifiedDate: today,
          createdBy: 'Current User',
          lastModifiedBy: 'Current User',
          status: 'Executed',
          fileSize: 0,
          fileName,
          description: 'Filled legal document captured from workflow',
          linkedAssets: [],
          linkedDeals: [],
          permissions: [],
          tags: [],
          version: 1,
          content,
          fileType: 'txt',
        });
      } catch (error) {
        setRowErrors(current => ({
          ...current,
          [item.id]:
            error instanceof Error ? error.message : 'Failed to open filled document from workflow',
        }));
      } finally {
        setLoadingViewDocumentId(null);
      }
      return;
    }

    if (!legalDocumentId) {
      setRowErrors(current => ({
        ...current,
        [item.id]: 'No linked legal document found for this workflow item',
      }));
      return;
    }

    await handleViewDocument(legalDocumentId);
  };

  const handleOpenStatusDocument = async (item: BrokerWipItem, statusDoc: WipStatusDocument) => {
    const filledDocumentRecordId = String(statusDoc.filledDocumentRecordId || '').trim();
    const legalDocumentId = String(statusDoc.legalDocumentId || '').trim();

    setRowErrors(current => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    if (filledDocumentRecordId) {
      setLoadingViewDocumentId(filledDocumentRecordId);
      try {
        const record = await customRecordService.getCustomRecordById<any>(filledDocumentRecordId);
        const payload = (record as any)?.payload || {};
        const content = String(
          payload.content || JSON.stringify(payload.filledContent || {}, null, 2)
        );
        const fileName = String(
          payload.filledDocumentName ||
            statusDoc.filledDocumentName ||
            record.name ||
            'filled-document'
        ).trim();
        const today = new Date().toISOString().split('T')[0];
        setSelectedViewDocument({
          id: filledDocumentRecordId,
          documentName: fileName || `${getStatusDocStepLabel(String(statusDoc.status))} Document`,
          documentType: 'Contract',
          createdDate: today,
          lastModifiedDate: today,
          createdBy: 'Current User',
          lastModifiedBy: 'Current User',
          status: 'Executed',
          fileSize: 0,
          fileName,
          description: 'Filled legal document captured from workflow',
          linkedAssets: [],
          linkedDeals: [],
          permissions: [],
          tags: [],
          version: 1,
          content,
          fileType: 'txt',
        });
      } catch (error) {
        setRowErrors(current => ({
          ...current,
          [item.id]:
            error instanceof Error ? error.message : 'Failed to open document',
        }));
      } finally {
        setLoadingViewDocumentId(null);
      }
      return;
    }

    if (!legalDocumentId) {
      setRowErrors(current => ({
        ...current,
        [item.id]: `No document linked for ${getStatusDocStepLabel(String(statusDoc.status))} step`,
      }));
      return;
    }

    await handleViewDocument(legalDocumentId);
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
    if (!linkedDealId && !linkedForecastId && !linkedLeadId) return;
    const normalizedComment = String(comment || '').trim();
    const currentStatusRequiresLegalDocument = statusRequiresLegalDocument(item.status);
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
      } else {
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
    } catch (error) {
      setRowErrors(current => ({
        ...current,
        [item.id]: error instanceof Error ? error.message : 'Failed to save comment',
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

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-violet-600 hover:text-violet-700 mb-4 text-sm font-semibold transition-colors"
        >
          <FiArrowLeft size={18} />
          Back to Brokers
        </button>

        <div className="flex items-center gap-5 bg-gradient-to-r from-white to-stone-50 rounded-xl shadow-sm border border-stone-200 p-6">
          <div className="relative">
            <img
              src={broker.profilePicture}
              alt={broker.name}
              className="w-20 h-20 rounded-full object-cover border-3 border-violet-200 shadow-md"
            />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-stone-950">{broker.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-stone-600">
                {broker.department && (
                  <>
                    <span className="font-semibold text-stone-700">{broker.department}</span> •{' '}
                  </>
                )}
                <span className="text-stone-500">{broker.segments.length} active segment(s)</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-gradient-to-br from-white to-stone-50 rounded-xl shadow-sm border border-stone-200 p-5">
          <p className="text-xs text-stone-600 font-semibold uppercase tracking-wide mb-2">Current Billing</p>
          <p className="text-2xl font-bold text-stone-950">{formatRand(currentBilling)}</p>
          <p className="text-xs text-stone-500 mt-2">
            Target: {formatRand(billingTarget)}
          </p>
        </div>
        <div className="bg-gradient-to-br from-white to-stone-50 rounded-xl shadow-sm border border-stone-200 p-5">
          <p className="text-xs text-stone-600 font-semibold uppercase tracking-wide mb-2">Billing Target</p>
          <p className="text-2xl font-bold text-violet-600">{formatRand(billingTarget)}</p>
        </div>
        <div className="bg-gradient-to-br from-white to-stone-50 rounded-xl shadow-sm border border-stone-200 p-5">
          <p className="text-xs text-stone-600 font-semibold uppercase tracking-wide mb-2">Progress</p>
          <div className="flex items-center gap-2">
            <p
              className={`text-2xl font-bold ${
                percentageAchieved >= 100 ? "text-green-600" : "text-violet-600"
              }`}
            >
              {percentageAchieved}%
            </p>
            {percentageAchieved >= 100 && <span className="text-lg">✓</span>}
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-stone-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                percentageAchieved >= 100 ? 'bg-green-500' : 'bg-violet-500'
              }`}
              style={{ width: `${Math.min(percentageAchieved, 100)}%` }}
            />
          </div>
        </div>
        <div className="bg-gradient-to-br from-white to-stone-50 rounded-xl shadow-sm border border-stone-200 p-5">
          <p className="text-xs text-stone-600 font-semibold uppercase tracking-wide mb-2">Won Deals</p>
          <p className="text-2xl font-bold text-emerald-600">{wonDealsCount}</p>
        </div>
        <div className="bg-gradient-to-br from-white to-stone-50 rounded-xl shadow-sm border border-stone-200 p-5">
          <p className="text-xs text-stone-600 font-semibold uppercase tracking-wide mb-2">Lost Deals</p>
          <p className="text-2xl font-bold text-red-600">{lostDealsCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-violet-100 rounded-lg">
            <FiFilter size={18} className="text-violet-600" />
          </div>
          <h3 className="font-semibold text-stone-950">Filter Deals</h3>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-stone-600 mb-2 block font-semibold uppercase tracking-wide">Search</label>
            <div className="relative">
              <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={wipSearchQuery}
                onChange={e => setWipSearchQuery(e.target.value)}
                placeholder="Search deals or address..."
                className="w-full pl-8 pr-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 hover:border-stone-400 transition-colors bg-white"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-600 mb-2 block font-semibold uppercase tracking-wide">Status</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 hover:border-stone-400 transition-colors bg-white"
            >
              <option value="all">All Statuses</option>
              {statuses.map(status => (
                <option key={status} value={status}>
                  {formatStatusLabel(status)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-stone-600 mb-2 block font-semibold uppercase tracking-wide">Deal Type</label>
            <select
              value={selectedDealType}
              onChange={e => setSelectedDealType(e.target.value)}
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 hover:border-stone-400 transition-colors bg-white"
            >
              <option value="all">All Deal Types</option>
              {dealTypes.map(dealType => (
                <option key={dealType} value={dealType}>
                  {formatDealTypeLabel(dealType)}
                </option>
              ))}
            </select>
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
                    setDismissedReminderIds(prev => new Set([...prev, reminder.id]))
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

      <div className="bg-white rounded-lg shadow-sm border border-stone-200 overflow-hidden">
        <div className="p-6 border-b border-stone-200 bg-gradient-to-r from-stone-50 to-white">
          <h2 className="text-xl font-bold text-stone-950">WIP Sheet ({filteredProperties.length})</h2>
          <p className="text-sm text-stone-500 mt-1">Manage deals and track their progress</p>
        </div>

        {filteredProperties.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-stone-600 font-medium">No deals found matching your filters.</p>
            <p className="text-sm text-stone-500 mt-2">Adjust your filters to see more deals.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-stone-100 to-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Property Name</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Address</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Deal Type</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Action Required</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-stone-700 uppercase tracking-wider">Expected Value</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-stone-700 uppercase tracking-wider">Broker Comm</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Closure Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Document</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredProperties.map((item, index) => {
                  const normalizedLegalDocument = String(item.legalDocument || '').trim();
                  const normalizedComment = String(item.comment || '').trim();
                  const preferredStatusDocument = pickPreferredStatusDocument(item);
                  const filledDocumentRecordId = String(
                    preferredStatusDocument?.filledDocumentRecordId || ''
                  ).trim();
                  const resolvedLegalDocumentId = String(
                    normalizedLegalDocument || preferredStatusDocument?.legalDocumentId || ''
                  ).trim();
                  const propertyName = parseDealTitle(item.dealName).dealName;
                  const requiresComment = statusRequiresComment(item.status);
                  const selectedLegalDocument = legalDocumentById.get(resolvedLegalDocumentId);
                  const hasSelectedLegalDocument = Boolean(selectedLegalDocument);
                  const hasFilledDocumentRecord = Boolean(filledDocumentRecordId);
                  const isMissingComment = requiresComment && !normalizedComment;
                  const rowError = rowErrors[item.id];
                  const isOpeningDocument =
                    loadingViewDocumentId === filledDocumentRecordId ||
                    loadingViewDocumentId === resolvedLegalDocumentId;

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors border-b border-stone-100 ${
                        index % 2 === 0 ? "bg-white" : "bg-stone-50/50"
                      } hover:bg-blue-50/40`}
                    >
                      <td className="px-6 py-4 text-sm font-semibold text-stone-950 whitespace-nowrap">{propertyName}</td>
                      <td className="px-6 py-4 text-sm text-stone-600">{item.address || "-"}</td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex px-3 py-1.5 rounded-lg text-xs font-semibold ${getDealTypeColor(item.dealType)}`}
                        >
                          {item.dealType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <select
                          value={toStatusValue(item.status)}
                          onChange={event => {
                            void handleStatusChange(item, event.target.value);
                          }}
                          disabled={updatingStatusId === item.id}
                          className={`w-full max-w-xs px-3 py-1.5 rounded-lg text-xs font-semibold border focus:outline-none focus:ring-2 transition-all ${
                            getStatusColor(item.status)
                          } ${
                            updatingStatusId === item.id ? "opacity-60 cursor-not-allowed" : ""
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
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {item.actionRequired && item.actionRequired !== '-' ? (
                          <span className="inline-flex px-2 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            {item.actionRequired}
                          </span>
                        ) : (
                          <span className="text-stone-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-stone-950 text-right">
                        {formatRand(item.expectedValue)}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-violet-600 text-right">
                        {formatRand(item.brokerCommission)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={() => setSelectedDealForDateModal(item)}
                          className="text-blue-600 hover:text-blue-700 font-medium hover:underline transition-colors cursor-pointer"
                        >
                          {item.forecastedClosureDate || item.updatedAt
                            ? new Date(item.forecastedClosureDate || item.updatedAt).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : "-"}
                        </button>
                        {item.forecastedClosureDate && (
                          <p className="text-xs text-stone-400 mt-0.5">Target</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-stone-600">
                        <div className="min-w-[200px] space-y-1.5">
                          {(item.statusDocuments || []).length > 0 ? (
                            <>
                              {(item.statusDocuments || []).map(statusDoc => {
                                const docFilledId = String(statusDoc.filledDocumentRecordId || '').trim();
                                const docLegalId = String(statusDoc.legalDocumentId || '').trim();
                                const isFilled = Boolean(docFilledId);
                                const isOpening =
                                  loadingViewDocumentId === docFilledId ||
                                  loadingViewDocumentId === docLegalId;
                                return (
                                  <button
                                    key={statusDoc.id}
                                    type="button"
                                    onClick={() => void handleOpenStatusDocument(item, statusDoc)}
                                    disabled={isOpening}
                                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                      isFilled
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                    } ${isOpening ? 'opacity-60 cursor-not-allowed' : ''}`}
                                  >
                                    <span>{getStatusDocStepLabel(String(statusDoc.status))}</span>
                                    <span className="ml-2 opacity-80 text-[10px]">
                                      {isOpening ? 'Opening…' : isFilled ? '✓ Filled' : 'View'}
                                    </span>
                                  </button>
                                );
                              })}
                            </>
                          ) : hasFilledDocumentRecord || hasSelectedLegalDocument || resolvedLegalDocumentId ? (
                            <button
                              type="button"
                              onClick={() => {
                                void handleOpenWipDocument(item);
                              }}
                              disabled={isOpeningDocument}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                            >
                              {isOpeningDocument
                                ? 'Opening...'
                                : hasFilledDocumentRecord
                                ? 'View Filled Document'
                                : 'View Document'}
                            </button>
                          ) : (
                            <p className="text-xs text-stone-500">No Documents</p>
                          )}
                          {!loadingLegalDocuments &&
                            resolvedLegalDocumentId &&
                            !hasSelectedLegalDocument &&
                            !hasFilledDocumentRecord &&
                            (item.statusDocuments || []).length === 0 && (
                            <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                              Linked document not found in Legal Docs.
                            </p>
                            )}
                          {rowError && (
                            <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded font-medium">
                              ❌ {rowError}
                            </p>
                          )}
                          {legalDocumentsError && (
                            <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                              Legal Docs load error: {legalDocumentsError}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-stone-600">
                        <div className="min-w-[180px]">
                          {item.comment ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedDealForCommentModal({
                                    dealName: item.dealName,
                                    comment: item.comment || '',
                                    id: item.id,
                                    updatedAt: item.updatedAt,
                                  })
                                }
                                className="w-full text-left px-3 py-2 bg-blue-50 border border-blue-300 rounded-lg text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer line-clamp-2"
                                title="Click to view and edit full comment"
                              >
                                {item.comment}
                              </button>
                              {formatCommentTimestamp(item.updatedAt) && (
                                <p className="text-xs text-stone-500 mt-1">
                                  Updated {formatCommentTimestamp(item.updatedAt)}
                                </p>
                              )}
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedDealForCommentModal({
                                  dealName: item.dealName,
                                  comment: '',
                                  id: item.id,
                                  updatedAt: item.updatedAt,
                                })
                              }
                              className="text-xs text-violet-600 hover:text-violet-700 font-semibold hover:underline transition-colors"
                            >
                              + Add Comment
                            </button>
                          )}
                          {isMissingComment && (
                            <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded font-medium mt-1">
                              ❌ Comment required for this status
                            </p>
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
      </div>

      {/* Deal Date Modal */}
      <DealDateModal
        isOpen={selectedDealForDateModal !== null}
        onClose={() => setSelectedDealForDateModal(null)}
        dealName={selectedDealForDateModal?.dealName || ''}
        createdAt={selectedDealForDateModal?.createdAt || ''}
        updatedAt={selectedDealForDateModal?.updatedAt || ''}
        status={selectedDealForDateModal?.status || ''}
      />

      {selectedViewDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-stone-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 bg-stone-50">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Document Viewer</h3>
                <p className="text-xs text-stone-500">{selectedViewDocument.documentName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedViewDocument(null)}
                className="px-3 py-1.5 rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100 text-sm"
              >
                Close
              </button>
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
        comment={selectedDealForCommentModal?.comment || ''}
        updatedAt={selectedDealForCommentModal?.updatedAt}
        onSave={async (updatedComment: string) => {
          if (selectedDealForCommentModal?.id) {
            const itemToUpdate = rows.find(r => r.id === selectedDealForCommentModal.id);
            if (itemToUpdate) {
              await handleCommentSave(itemToUpdate, updatedComment);
              setSelectedDealForCommentModal(null);
            }
          }
        }}
        isSaving={selectedDealForCommentModal?.id ? savingCommentId === selectedDealForCommentModal.id : false}
      />
    </div>
  );
};
