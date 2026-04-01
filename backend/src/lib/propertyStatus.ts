import { normalizeModuleScope } from '@/lib/departmentAccess';
import { ModuleScope } from '@/types';

export const PROPERTY_STATUS_FOR_SALE = 'For Sale';
export const PROPERTY_STATUS_FOR_LEASE = 'For Lease';
export const PROPERTY_STATUS_AUCTION = 'Auction';
export const PROPERTY_STATUS_OWNED = 'Owned';
export const PROPERTY_STATUS_LEASED = 'Leased';
export const PROPERTY_STATUS_MORTGAGED = 'Mortgaged';
export const PROPERTY_STATUS_ACTIVE = 'Active';
export const PROPERTY_STATUS_ARCHIVED = 'Archived';

export const STOCK_ELIGIBLE_PROPERTY_STATUSES = [
  PROPERTY_STATUS_FOR_SALE,
  PROPERTY_STATUS_FOR_LEASE,
  PROPERTY_STATUS_AUCTION,
] as const;

type NormalizePropertyStatusOptions = {
  moduleType?: string | null;
  fallback?: string | null;
};

function normalizeText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function toPropertyMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function normalizePropertyStatus(
  value: unknown,
  options?: NormalizePropertyStatusOptions
): string {
  const normalized = normalizeText(value);

  if (
    ['for sale', 'for_sale', 'sale', 'sales', 'listed for sale', 'on sale'].includes(normalized)
  ) {
    return PROPERTY_STATUS_FOR_SALE;
  }

  if (
    ['for lease', 'for_lease', 'lease', 'leasing', 'available for lease'].includes(normalized)
  ) {
    return PROPERTY_STATUS_FOR_LEASE;
  }

  if (normalized === 'auction') {
    return PROPERTY_STATUS_AUCTION;
  }

  if (normalized === 'owned') {
    return PROPERTY_STATUS_OWNED;
  }

  if (normalized === 'leased') {
    return PROPERTY_STATUS_LEASED;
  }

  if (normalized === 'mortgaged' || normalized === 'mortgage') {
    return PROPERTY_STATUS_MORTGAGED;
  }

  if (normalized === 'archived' || normalized === 'deleted' || normalized === 'inactive') {
    return PROPERTY_STATUS_ARCHIVED;
  }

  if (normalized === 'active' || normalized === 'available' || normalized === 'open') {
    const inferred = normalizeModuleScope(options?.moduleType);
    if (inferred === 'leasing') return PROPERTY_STATUS_FOR_LEASE;
    if (inferred === 'auction') return PROPERTY_STATUS_AUCTION;
    if (inferred === 'sales') return PROPERTY_STATUS_FOR_SALE;
    return PROPERTY_STATUS_ACTIVE;
  }

  if (normalized) {
    return String(value).trim();
  }

  const fallbackModule = normalizeModuleScope(options?.moduleType);
  if (fallbackModule === 'leasing') return PROPERTY_STATUS_FOR_LEASE;
  if (fallbackModule === 'auction') return PROPERTY_STATUS_AUCTION;
  if (fallbackModule === 'sales') return PROPERTY_STATUS_FOR_SALE;

  const fallbackStatus = normalizeText(options?.fallback);
  if (fallbackStatus) {
    return normalizePropertyStatus(options?.fallback);
  }

  return PROPERTY_STATUS_ACTIVE;
}

export function isStockEligiblePropertyStatus(value: unknown): boolean {
  const normalized = normalizePropertyStatus(value);
  return STOCK_ELIGIBLE_PROPERTY_STATUSES.includes(
    normalized as (typeof STOCK_ELIGIBLE_PROPERTY_STATUSES)[number]
  );
}

export function inferPropertyModuleType(input: {
  moduleType?: unknown;
  metadata?: unknown;
  status?: unknown;
  type?: unknown;
  fallback?: unknown;
}): ModuleScope | undefined {
  const direct = normalizeModuleScope(String(input.moduleType || ''));
  if (direct) return direct;

  const metadata = toPropertyMetadata(input.metadata);
  const metadataScope = normalizeModuleScope(String(metadata.moduleScope || metadata.moduleType || ''));
  if (metadataScope) return metadataScope;

  const status = normalizePropertyStatus(input.status, { fallback: String(input.fallback || '') });
  if (status === PROPERTY_STATUS_FOR_LEASE) return 'leasing';
  if (status === PROPERTY_STATUS_AUCTION) return 'auction';
  if (status === PROPERTY_STATUS_FOR_SALE) return 'sales';

  const typeValue = normalizeText(input.type);
  if (typeValue.includes('lease')) return 'leasing';
  if (typeValue.includes('auction')) return 'auction';
  if (typeValue.includes('sale')) return 'sales';

  const fallback = normalizeModuleScope(String(input.fallback || ''));
  if (fallback) return fallback;

  return undefined;
}

export function inferStockModuleFromProperty(input: {
  status?: unknown;
  moduleType?: unknown;
}): ModuleScope | undefined {
  const normalizedStatus = normalizePropertyStatus(input.status, {
    moduleType: String(input.moduleType || ''),
  });

  if (normalizedStatus === PROPERTY_STATUS_AUCTION) {
    return 'auction';
  }

  const moduleType = normalizeModuleScope(String(input.moduleType || ''));
  if (moduleType === 'sales' || moduleType === 'leasing') {
    return moduleType;
  }

  if (normalizedStatus === PROPERTY_STATUS_FOR_LEASE) {
    return 'leasing';
  }

  if (normalizedStatus === PROPERTY_STATUS_FOR_SALE) {
    return 'sales';
  }

  return undefined;
}

export function buildPropertyStockDetails(input: {
  title: string;
  description: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  type: string;
  price: number;
  area: number;
  latitude?: number | null;
  longitude?: number | null;
  status: string;
  moduleType?: string | null;
  brokerId?: string | null;
  metadata?: unknown;
}): Record<string, unknown> {
  const metadata = toPropertyMetadata(input.metadata);
  const propertyName =
    String(metadata.displayName || metadata.propertyName || input.title || input.address).trim() ||
    input.address;
  const moduleScope =
    inferPropertyModuleType({
      moduleType: input.moduleType,
      metadata,
      status: input.status,
      type: input.type,
    }) || inferStockModuleFromProperty({ status: input.status, moduleType: input.moduleType });
  const propertyStatus = normalizePropertyStatus(input.status, { moduleType: input.moduleType });
  const numericArea = Number(metadata.area ?? metadata.sizeSquareMeter ?? input.area ?? 0) || 0;
  const numericPrice =
    Number(metadata.price ?? metadata.purchasePrice ?? metadata.value ?? input.price ?? 0) || 0;

  return {
    ...metadata,
    stockKind: 'property_listing',
    stockSource: metadata.stockSource || 'properties',
    moduleScope: moduleScope || metadata.moduleScope || null,
    itemName: propertyName,
    centreItemName: String(metadata.centreItemName || propertyName),
    propertyName,
    propertyAddress: input.address,
    address: input.address,
    location: String(metadata.location || input.address),
    locationWithinCentre: String(metadata.locationWithinCentre || input.address),
    category: String(metadata.category || metadata.propertyType || input.type || ''),
    propertyType: String(metadata.propertyType || input.type || ''),
    propertyStatus,
    status: propertyStatus,
    price: numericPrice,
    value: Number(metadata.value ?? numericPrice) || 0,
    purchasePrice: Number(metadata.purchasePrice ?? numericPrice) || 0,
    sizeSquareMeter: Number(metadata.sizeSquareMeter ?? numericArea) || 0,
    area: numericArea,
    latitude:
      typeof input.latitude === 'number' ? input.latitude : Number(metadata.latitude || 0) || null,
    longitude:
      typeof input.longitude === 'number'
        ? input.longitude
        : Number(metadata.longitude || 0) || null,
    city: input.city,
    province: input.province,
    postalCode: input.postalCode,
    comments: String(metadata.comments || input.description || ''),
    notes: String(metadata.notes || input.description || ''),
    assignedBrokerId: String(metadata.assignedBrokerId || input.brokerId || ''),
    linkedFundName: String(metadata.linkedFundName || ''),
    contactNumber: String(metadata.contactNumber || metadata.centreContactNumber || ''),
    googlePlaceId: String(metadata.googlePlaceId || metadata.placeId || ''),
    placeId: String(metadata.placeId || metadata.googlePlaceId || ''),
    selectedFromMap: Boolean(
      metadata.selectedFromMap || metadata.googlePlaceId || metadata.placeId
    ),
  };
}
