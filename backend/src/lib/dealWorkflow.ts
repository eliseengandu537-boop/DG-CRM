import { DealDocumentType, DealStatus } from '@prisma/client';

export type DealWorkflowCompletion = {
  hasLoiDocument: boolean;
  hasStep2Document: boolean;
  hasAgreementDocument: boolean;
  step2Status?: DealStatus;
  agreementStatus?: DealStatus;
};

const LEGACY_LOI_STATUSES = new Set([
  'pending',
  'active',
  'action_required',
  'open',
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiating',
  'viewing',
]);

export const FINAL_DEAL_STATUSES = new Set<DealStatus>([
  DealStatus.CLOSED,
  DealStatus.WON,
  DealStatus.AWAITING_PAYMENT,
]);

export const WORKFLOW_DOCUMENT_STATUSES = new Set<DealStatus>([
  DealStatus.LOI,
  DealStatus.OTP,
  DealStatus.OTL,
  DealStatus.LEASE_AGREEMENT,
  DealStatus.SALE_AGREEMENT,
]);

const STEP_TWO_STATUSES = new Set<DealStatus>([DealStatus.OTP, DealStatus.OTL]);
const STEP_THREE_STATUSES = new Set<DealStatus>([
  DealStatus.LEASE_AGREEMENT,
  DealStatus.SALE_AGREEMENT,
]);

export function getDealStatusLabel(status: DealStatus): string {
  if (status === DealStatus.LOI) return 'LOI';
  if (status === DealStatus.OTP) return 'OTP';
  if (status === DealStatus.OTL) return 'OTL';
  if (status === DealStatus.LEASE_AGREEMENT) return 'Lease Agreement';
  if (status === DealStatus.SALE_AGREEMENT) return 'Sale Agreement';
  if (status === DealStatus.CLOSED) return 'Closed';
  if (status === DealStatus.WON) return 'Won';
  if (status === DealStatus.AWAITING_PAYMENT) return 'Awaiting Payment';
  return status;
}

function normalizeToken(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function resolveDealStatus(
  value: string | DealStatus | null | undefined,
  options?: { fallback?: DealStatus; allowLegacyMapping?: boolean }
): DealStatus {
  if (!value) {
    if (options?.fallback) return options.fallback;
    throw new Error('Deal status is required');
  }

  const token = normalizeToken(String(value));
  if (token === 'loi' || token === 'letter_of_intent') return DealStatus.LOI;
  if (token === 'otp' || token === 'offer_to_purchase') return DealStatus.OTP;
  if (token === 'otl' || token === 'offer_to_lease') return DealStatus.OTL;
  if (token === 'lease_agreement') return DealStatus.LEASE_AGREEMENT;
  if (token === 'sale_agreement' || token === 'sales_agreement' || token === 'purchase_agreement') {
    return DealStatus.SALE_AGREEMENT;
  }
  if (token === 'closed' || token === 'completed') return DealStatus.CLOSED;
  if (token === 'won') return DealStatus.WON;
  if (token === 'awaiting_payment' || token === 'invoice') return DealStatus.AWAITING_PAYMENT;

  if (options?.allowLegacyMapping && LEGACY_LOI_STATUSES.has(token)) {
    return DealStatus.LOI;
  }

  if (options?.fallback) return options.fallback;
  throw new Error('Invalid deal status');
}

export function resolveDealStatusOrNull(
  value: string | DealStatus | null | undefined,
  options?: { allowLegacyMapping?: boolean }
): DealStatus | null {
  if (!value) return null;
  try {
    return resolveDealStatus(value, { allowLegacyMapping: options?.allowLegacyMapping });
  } catch {
    return null;
  }
}

export function getDealStatusStage(status: DealStatus): 1 | 2 | 3 | 4 {
  if (status === DealStatus.LOI) return 1;
  if (STEP_TWO_STATUSES.has(status)) return 2;
  if (STEP_THREE_STATUSES.has(status)) return 3;
  return 4;
}

export function statusRequiresWorkflowDocument(status: DealStatus): boolean {
  return WORKFLOW_DOCUMENT_STATUSES.has(status);
}

export function isFinalDealStatus(status: DealStatus): boolean {
  return FINAL_DEAL_STATUSES.has(status);
}

export function getDocumentTypeForDealStatus(status: DealStatus): DealDocumentType {
  if (status === DealStatus.LOI) return DealDocumentType.LOI;
  if (status === DealStatus.OTP) return DealDocumentType.OTP;
  if (status === DealStatus.OTL) return DealDocumentType.OTL;
  if (status === DealStatus.LEASE_AGREEMENT || status === DealStatus.SALE_AGREEMENT) {
    return DealDocumentType.AGREEMENT;
  }
  throw new Error('Selected status does not support legal documents');
}

export function summarizeWorkflowCompletion(
  linkedStatuses: DealStatus[]
): DealWorkflowCompletion {
  const normalized = Array.from(new Set(linkedStatuses));
  const hasLoiDocument = normalized.includes(DealStatus.LOI);

  const step2Status = normalized.find(status => STEP_TWO_STATUSES.has(status));
  const hasStep2Document = Boolean(step2Status);

  const agreementStatus = normalized.find(status => STEP_THREE_STATUSES.has(status));
  const hasAgreementDocument = Boolean(agreementStatus);

  return {
    hasLoiDocument,
    hasStep2Document,
    hasAgreementDocument,
    step2Status,
    agreementStatus,
  };
}

export function isWorkflowDocumentCompleted(input: {
  completedAt?: Date | null;
  filledDocumentRecordId?: string | null;
  filledDocumentDownloadUrl?: string | null;
}): boolean {
  if (input.completedAt) return true;
  if (String(input.filledDocumentRecordId || '').trim()) return true;
  if (String(input.filledDocumentDownloadUrl || '').trim()) return true;
  return false;
}

export function assertDealStatusTransition(input: {
  currentStatus: DealStatus;
  nextStatus: DealStatus;
  completion: DealWorkflowCompletion;
}): void {
  const currentStage = getDealStatusStage(input.currentStatus);
  const nextStage = getDealStatusStage(input.nextStatus);

  if (nextStage < currentStage) {
    throw new Error('Deal status cannot move backward in the workflow');
  }

  if (nextStage > currentStage + 1) {
    throw new Error('Deal status cannot skip required workflow steps');
  }

  if (nextStage >= 2 && !input.completion.hasLoiDocument) {
    throw new Error('LOI document is required before moving to OTP/OTL');
  }

  if (nextStage >= 3 && !input.completion.hasStep2Document) {
    throw new Error('OTP or OTL document is required before moving to an agreement');
  }

  if (nextStage >= 4 && !input.completion.hasAgreementDocument) {
    throw new Error('Lease/Sale Agreement document is required before final statuses');
  }
}

function normalizedDocumentText(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(text: string, candidates: string[]): boolean {
  return candidates.some(candidate => text.includes(candidate));
}

export function isLegalDocumentCompatibleWithStatus(
  input: {
    documentType?: string | null;
    documentName?: string | null;
    tags?: unknown;
  },
  status: DealStatus
): boolean {
  const tags = Array.isArray(input.tags)
    ? input.tags.map(item => String(item || '')).join(' ')
    : '';
  const haystack = normalizedDocumentText(
    `${input.documentType || ''} ${input.documentName || ''} ${tags}`
  );

  if (!haystack) return false;

  if (status === DealStatus.LOI) {
    return containsAny(haystack, ['loi', 'letter of intent']);
  }

  if (status === DealStatus.OTP) {
    return containsAny(haystack, ['otp', 'offer to purchase']);
  }

  if (status === DealStatus.OTL) {
    return containsAny(haystack, ['otl', 'offer to lease']);
  }

  if (status === DealStatus.LEASE_AGREEMENT) {
    return containsAny(haystack, ['lease agreement']);
  }

  if (status === DealStatus.SALE_AGREEMENT) {
    return containsAny(haystack, ['sale agreement', 'sales agreement', 'purchase agreement']);
  }

  return false;
}

export function isClosedLikeDealStatus(value: string | DealStatus | null | undefined): boolean {
  const status = resolveDealStatusOrNull(value, { allowLegacyMapping: false });
  if (!status) return false;
  return isFinalDealStatus(status);
}
