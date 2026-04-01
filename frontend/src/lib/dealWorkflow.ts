export type DealWorkflowStatusToken =
  | 'LOI'
  | 'OTP'
  | 'OTL'
  | 'LEASE_AGREEMENT'
  | 'SALE_AGREEMENT'
  | 'CLOSED'
  | 'WON'
  | 'AWAITING_PAYMENT';

export type DealWorkflowCompletion = {
  hasLoiDocument: boolean;
  hasStep2Document: boolean;
  hasAgreementDocument: boolean;
};

const STATUS_LABELS: Record<DealWorkflowStatusToken, string> = {
  LOI: 'LOI',
  OTP: 'OTP',
  OTL: 'OTL',
  LEASE_AGREEMENT: 'Lease Agreement',
  SALE_AGREEMENT: 'Sale Agreement',
  CLOSED: 'Closed',
  WON: 'Won',
  AWAITING_PAYMENT: 'Awaiting Payment',
};

const STEP_TWO_STATUSES: DealWorkflowStatusToken[] = ['OTP', 'OTL'];
const STEP_THREE_STATUSES: DealWorkflowStatusToken[] = ['LEASE_AGREEMENT', 'SALE_AGREEMENT'];
const FINAL_STATUSES: DealWorkflowStatusToken[] = ['CLOSED', 'WON', 'AWAITING_PAYMENT'];

function token(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function parseDealWorkflowStatus(
  value: string | null | undefined
): DealWorkflowStatusToken | null {
  const normalized = token(String(value || ''));
  if (!normalized) return null;

  if (normalized === 'loi' || normalized === 'letter_of_intent') return 'LOI';
  if (normalized === 'otp' || normalized === 'offer_to_purchase') return 'OTP';
  if (normalized === 'otl' || normalized === 'offer_to_lease') return 'OTL';
  if (normalized === 'lease_agreement') return 'LEASE_AGREEMENT';
  if (normalized === 'sale_agreement' || normalized === 'sales_agreement' || normalized === 'purchase_agreement') {
    return 'SALE_AGREEMENT';
  }
  if (normalized === 'closed' || normalized === 'completed') return 'CLOSED';
  if (normalized === 'won') return 'WON';
  if (normalized === 'awaiting_payment' || normalized === 'invoice') return 'AWAITING_PAYMENT';
  if (
    [
      'pending',
      'active',
      'open',
      'new',
      'contacted',
      'qualified',
      'proposal',
      'negotiating',
      'viewing',
    ].includes(normalized)
  ) {
    return 'LOI';
  }

  return null;
}

export function dealWorkflowStatusLabel(value: string): string {
  const parsed = parseDealWorkflowStatus(value);
  if (!parsed) {
    return String(value || '')
      .replace(/[_-]/g, ' ')
      .trim();
  }
  return STATUS_LABELS[parsed];
}

export function isFinalDealWorkflowStatus(value: string): boolean {
  const parsed = parseDealWorkflowStatus(value);
  return Boolean(parsed && FINAL_STATUSES.includes(parsed));
}

export function isWorkflowDocumentStatus(value: string): boolean {
  const parsed = parseDealWorkflowStatus(value);
  return Boolean(parsed && !FINAL_STATUSES.includes(parsed));
}

export function getWorkflowCompletionFromDocumentStatuses(statuses: string[]): DealWorkflowCompletion {
  const parsed = statuses.map(status => parseDealWorkflowStatus(status)).filter(Boolean) as DealWorkflowStatusToken[];
  const deduped = Array.from(new Set(parsed));

  return {
    hasLoiDocument: deduped.includes('LOI'),
    hasStep2Document: deduped.some(status => STEP_TWO_STATUSES.includes(status)),
    hasAgreementDocument: deduped.some(status => STEP_THREE_STATUSES.includes(status)),
  };
}

function stage(status: DealWorkflowStatusToken): 1 | 2 | 3 | 4 {
  if (status === 'LOI') return 1;
  if (STEP_TWO_STATUSES.includes(status)) return 2;
  if (STEP_THREE_STATUSES.includes(status)) return 3;
  return 4;
}

export function validateDealWorkflowTransition(input: {
  currentStatus: string;
  nextStatus: string;
  completion: DealWorkflowCompletion;
}): { valid: boolean; message?: string } {
  const current = parseDealWorkflowStatus(input.currentStatus);
  const next = parseDealWorkflowStatus(input.nextStatus);
  if (!current || !next) {
    return { valid: false, message: 'Invalid workflow status' };
  }

  const currentStage = stage(current);
  const nextStage = stage(next);

  if (nextStage < currentStage) {
    return { valid: false, message: 'Deal status cannot move backward in the workflow' };
  }

  if (nextStage > currentStage + 1) {
    return { valid: false, message: 'Deal status cannot skip required workflow steps' };
  }

  if (nextStage >= 2 && !input.completion.hasLoiDocument) {
    return { valid: false, message: 'LOI document is required before moving to OTP/OTL' };
  }

  if (nextStage >= 3 && !input.completion.hasStep2Document) {
    return { valid: false, message: 'OTP/OTL document is required before moving to Agreement' };
  }

  if (nextStage >= 4 && !input.completion.hasAgreementDocument) {
    return { valid: false, message: 'Agreement document is required before final statuses' };
  }

  return { valid: true };
}

export function availableWorkflowStatuses(): string[] {
  return [
    'LOI',
    'OTP',
    'OTL',
    'Lease Agreement',
    'Sale Agreement',
    'Closed',
    'Won',
    'Awaiting Payment',
  ];
}
