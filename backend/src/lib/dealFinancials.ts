export type FinancialDealType = 'sales' | 'leasing' | 'auction';

export interface CoBrokerSplitInput {
  brokerId: string;
  splitPercent: number;
}

export interface CoBrokerSplitResult extends CoBrokerSplitInput {
  brokerShare: number;
}

export interface DealFinancialInput {
  dealType?: string | null;
  assetValue?: number | null;
  commissionPercent?: number | null;
  grossCommission?: number | null;
  auctionReferralPercent?: number | null;
  auctionCommissionPercent?: number | null;
  brokerSplitPercent?: number | null;
  coBrokers?: CoBrokerSplitInput[] | null;
}

export interface DealFinancialResult {
  dealType: FinancialDealType;
  assetValue: number;
  commissionPercent: number;
  grossCommission: number;
  companyCommission: number;
  brokerCommission: number;
  brokerSplitPercent: number;
  auctionReferralPercent: number;
  auctionCommissionPercent: number;
  coBrokerSplits: CoBrokerSplitResult[] | null;
  commissionRate: number;
  commissionAmount: number;
}

const DEFAULT_SALES_COMMISSION_PERCENT = 5;
const DEFAULT_BROKER_SPLIT_PERCENT = 45;
const DEFAULT_AUCTION_COMMISSION_PERCENT = 10;
const DEFAULT_AUCTION_REFERRAL_PERCENT = 35;
const EPSILON = 0.01;

function roundMoney(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function normalizeDealType(value?: string | null): FinancialDealType {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (normalized === 'lease' || normalized === 'leasing') return 'leasing';
  if (normalized === 'auction') return 'auction';
  return 'sales';
}

function asFiniteNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function assertPercentInRange(label: string, value: number): void {
  if (value < 0 || value > 100) {
    throw new Error(`${label} must be between 0 and 100`);
  }
}

function normalizePercent(
  label: string,
  value: unknown,
  fallback: number
): number {
  const numeric = asFiniteNumber(value);
  const resolved = numeric === undefined ? fallback : numeric;
  assertPercentInRange(label, resolved);
  return roundMoney(resolved);
}

function normalizeOptionalPercent(label: string, value: unknown): number | undefined {
  const numeric = asFiniteNumber(value);
  if (numeric === undefined) return undefined;
  assertPercentInRange(label, numeric);
  return roundMoney(numeric);
}

function normalizeCoBrokerSplits(value: DealFinancialInput['coBrokers']): CoBrokerSplitInput[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const normalized = value.map((entry, index) => {
    const brokerId = String(entry?.brokerId || '').trim();
    if (!brokerId) {
      throw new Error(`coBrokers[${index}].brokerId is required`);
    }

    const splitPercent = asFiniteNumber(entry?.splitPercent);
    if (splitPercent === undefined) {
      throw new Error(`coBrokers[${index}].splitPercent is required`);
    }

    assertPercentInRange(`coBrokers[${index}].splitPercent`, splitPercent);

    return {
      brokerId,
      splitPercent: roundMoney(splitPercent),
    };
  });

  const totalSplit = roundMoney(normalized.reduce((sum, entry) => sum + entry.splitPercent, 0));
  if (Math.abs(totalSplit - 100) > EPSILON) {
    throw new Error('coBroker splits must total 100%');
  }

  return normalized;
}

function assertPositiveAmount(label: string, value: number): void {
  if (!(value > 0)) {
    throw new Error(`${label} must be greater than 0`);
  }
}

function deriveCommissionPercentFromAmount(assetValue: number, grossCommission: number): number {
  if (!(assetValue > 0)) return 0;
  return roundMoney((grossCommission / assetValue) * 100);
}

export function toPercentFromRate(rate: unknown): number | undefined {
  const numeric = asFiniteNumber(rate);
  if (numeric === undefined) return undefined;
  if (numeric > 0 && numeric <= 1) return roundMoney(numeric * 100);
  return roundMoney(numeric);
}

export function calculateDealFinancials(input: DealFinancialInput): DealFinancialResult {
  const dealType = normalizeDealType(input.dealType);

  const assetCandidate = asFiniteNumber(input.assetValue);
  const assetValue = roundMoney(assetCandidate ?? 0);

  const brokerSplitPercent = normalizePercent(
    'brokerSplitPercent',
    input.brokerSplitPercent,
    DEFAULT_BROKER_SPLIT_PERCENT
  );

  let commissionPercent = 0;
  let grossCommission = 0;
  let auctionReferralPercent = 0;
  let auctionCommissionPercent = 0;

  if (dealType === 'sales') {
    assertPositiveAmount('assetValue', assetValue);

    const inputCommissionPercent = normalizeOptionalPercent('commissionPercent', input.commissionPercent);
    const inputGross = asFiniteNumber(input.grossCommission);

    if (inputCommissionPercent !== undefined) {
      commissionPercent = inputCommissionPercent;
    } else if (inputGross !== undefined && inputGross >= 0) {
      commissionPercent = deriveCommissionPercentFromAmount(assetValue, inputGross);
    } else {
      commissionPercent = DEFAULT_SALES_COMMISSION_PERCENT;
    }

    grossCommission = roundMoney(assetValue * (commissionPercent / 100));
  } else if (dealType === 'leasing') {
    const inputGross = asFiniteNumber(input.grossCommission);
    if (inputGross === undefined) {
      throw new Error('grossCommission is required for leasing deals');
    }
    if (inputGross < 0) {
      throw new Error('grossCommission cannot be negative');
    }

    grossCommission = roundMoney(inputGross);
    commissionPercent =
      normalizeOptionalPercent('commissionPercent', input.commissionPercent) ??
      deriveCommissionPercentFromAmount(assetValue, grossCommission);
  } else {
    assertPositiveAmount('assetValue', assetValue);

    auctionCommissionPercent = normalizePercent(
      'auctionCommissionPercent',
      input.auctionCommissionPercent,
      DEFAULT_AUCTION_COMMISSION_PERCENT
    );
    auctionReferralPercent = normalizePercent(
      'auctionReferralPercent',
      input.auctionReferralPercent,
      DEFAULT_AUCTION_REFERRAL_PERCENT
    );

    const auctionCommission = roundMoney(assetValue * (auctionCommissionPercent / 100));
    const companyGross = roundMoney(auctionCommission * (auctionReferralPercent / 100));

    grossCommission = companyGross;
    commissionPercent = deriveCommissionPercentFromAmount(assetValue, companyGross);
  }

  const brokerCommission = roundMoney(grossCommission * (brokerSplitPercent / 100));
  const companyCommission = roundMoney(grossCommission - brokerCommission);

  const coBrokers = normalizeCoBrokerSplits(input.coBrokers);
  const coBrokerSplits = coBrokers
    ? coBrokers.map(entry => ({
        brokerId: entry.brokerId,
        splitPercent: entry.splitPercent,
        brokerShare: roundMoney(brokerCommission * (entry.splitPercent / 100)),
      }))
    : null;

  return {
    dealType,
    assetValue,
    commissionPercent: roundMoney(commissionPercent),
    grossCommission,
    companyCommission,
    brokerCommission,
    brokerSplitPercent,
    auctionReferralPercent,
    auctionCommissionPercent,
    coBrokerSplits,
    commissionRate: roundMoney(commissionPercent / 100),
    commissionAmount: grossCommission,
  };
}
