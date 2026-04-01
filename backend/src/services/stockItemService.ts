import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { propertyService } from '@/services/propertyService';
import { CreateStockItemInput, UpdateStockItemInput } from '@/validators';
import { PaginatedResponse, StockItem, User } from '@/types';
import {
  addDepartmentScope,
  assertBrokerCanAccessModule,
  normalizeBrokerDepartment,
  normalizeModuleScope,
} from '@/lib/departmentAccess';
import { normalizePropertyStatus } from '@/lib/propertyStatus';
import { auditLogService } from '@/services/auditLogService';
import { reconcilePropertyDerivedRecords } from '@/services/propertyModuleSyncService';

type StockItemRecord = Awaited<ReturnType<typeof prisma.stockItem.findFirst>>;
type PropertyListingPayload = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId: string;
  price: number;
  moduleScope: 'leasing' | 'sales' | 'auction';
  propertyType: string;
  propertyStatus: string;
  description: string;
  city: string;
  province: string;
  postalCode: string;
  area: number;
};

function toDetailsObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function detailString(details: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = normalizeText(details[key]);
    if (value) return value;
  }
  return fallback;
}

function detailNumber(details: Record<string, unknown>, keys: string[], fallback?: number): number | undefined {
  for (const key of keys) {
    const value = normalizeNumber(details[key]);
    if (value !== undefined) return value;
  }
  return fallback;
}

function mapStockItem(record: NonNullable<StockItemRecord>): StockItem {
  const details = toDetailsObject(record.details);
  const normalizedModule = normalizeModuleScope(record.module) || 'sales';
  return {
    id: record.id,
    propertyId: record.propertyId,
    name:
      normalizeText(record.name) ||
      detailString(details, ['itemName', 'propertyName', 'centreItemName', 'name']),
    address:
      normalizeText(record.address) ||
      detailString(details, ['formatted_address', 'location', 'address', 'propertyAddress']),
    latitude: record.latitude ?? detailNumber(details, ['latitude', 'lat']),
    longitude: record.longitude ?? detailNumber(details, ['longitude', 'lng']),
    createdBy: record.createdBy ?? undefined,
    assignedBrokerId: record.assignedBrokerId ?? undefined,
    module: normalizedModule,
    moduleType: normalizedModule,
    details,
    archivedAt: record.archivedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildAuditSnapshot(record: StockItem): Record<string, unknown> {
  return {
    propertyId: record.propertyId,
    name: record.name,
    address: record.address,
    module: record.module,
    createdBy: record.createdBy ?? null,
    assignedBrokerId: record.assignedBrokerId ?? null,
    archivedAt: record.archivedAt ?? null,
  };
}

function isPropertyListing(details: Record<string, unknown>): boolean {
  return normalizeText(details.stockKind).toLowerCase() === 'property_listing';
}

function extractPropertyListingPayload(input: {
  module: string;
  name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  details: Record<string, unknown>;
}): PropertyListingPayload | null {
  if (!isPropertyListing(input.details)) {
    return null;
  }

  const name =
    normalizeText(input.name) ||
    detailString(input.details, ['itemName', 'propertyName', 'centreItemName', 'name']);
  const address =
    normalizeText(input.address) ||
    detailString(input.details, ['formatted_address', 'address', 'location', 'propertyAddress']);
  const latitude =
    normalizeNumber(input.latitude) ?? detailNumber(input.details, ['latitude', 'lat']);
  const longitude =
    normalizeNumber(input.longitude) ?? detailNumber(input.details, ['longitude', 'lng']);
  const placeId = detailString(input.details, ['placeId', 'googlePlaceId']);
  const price = detailNumber(input.details, ['purchasePrice', 'value', 'price'], 0) || 0;

  if (!placeId || !name || !address || latitude === undefined || longitude === undefined) {
    throw new Error('Please select a valid property from the map');
  }

  if (price <= 0) {
    throw new Error('Price is required and must be greater than 0');
  }

  const normalizedModule = normalizeModuleScope(input.module) || 'sales';
  const moduleScope = normalizedModule === 'auction' ? 'auction' : normalizedModule;
  const propertyType = detailString(
    input.details,
    ['propertyType', 'category', 'type'],
    moduleScope === 'leasing' ? 'Leasing' : moduleScope === 'auction' ? 'Auction' : 'Sales'
  );
  const propertyStatus = detailString(
    input.details,
    ['propertyStatus', 'status'],
    moduleScope === 'leasing' ? 'For Lease' : moduleScope === 'auction' ? 'Auction' : 'For Sale'
  );

  return {
    name,
    address,
    latitude,
    longitude,
    placeId,
    price,
    moduleScope,
    propertyType,
    propertyStatus,
    description: detailString(input.details, ['comments', 'notes']),
    city: detailString(input.details, ['city', 'locality'], 'Unknown'),
    province: detailString(input.details, ['province'], 'Unknown'),
    postalCode: detailString(input.details, ['postalCode'], 'Unknown'),
    area: detailNumber(input.details, ['area'], 0) || 0,
  };
}

async function resolveCreatedByBrokerId(
  user?: User,
  fallbackBrokerId?: string
): Promise<string | undefined> {
  const brokerIdCandidate = normalizeText(user?.brokerId) || normalizeText(fallbackBrokerId);
  if (brokerIdCandidate) {
    const broker = await prisma.broker.findUnique({ where: { id: brokerIdCandidate } });
    if (broker && broker.status !== 'archived') {
      return broker.id;
    }
  }

  const emailCandidate = normalizeText(user?.email).toLowerCase();
  if (!emailCandidate) {
    return undefined;
  }

  const broker = await prisma.broker.findUnique({ where: { email: emailCandidate } });
  if (broker?.status === 'archived') {
    return undefined;
  }

  return broker?.id;
}

async function resolveModuleType(inputModule: string | undefined, user?: User | null): Promise<StockItem['module']> {
  const normalizedInput = normalizeModuleScope(inputModule);
  if (normalizedInput) {
    return normalizedInput;
  }

  const userDepartment = normalizeBrokerDepartment(user?.department);
  if (userDepartment) {
    return userDepartment;
  }

  throw new Error('Stock module is required');
}

async function resolvePropertyId(input: {
  propertyId?: string;
  module: StockItem['module'];
  details: Record<string, unknown>;
  createdByBrokerId?: string;
  name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  user?: User | null;
}): Promise<{
  propertyId: string;
  name: string;
  address: string;
  city?: string;
  area?: number;
  latitude?: number;
  longitude?: number;
}> {
  const listing = extractPropertyListingPayload(input);
  if (listing) {
    const existingById = input.propertyId
      ? await prisma.property.findUnique({ where: { id: input.propertyId } })
      : null;
    const existingByLocation = existingById
      ? null
      : await prisma.property.findFirst({
          where: {
            address: listing.address,
            latitude: listing.latitude,
            longitude: listing.longitude,
          },
        });
    const existingProperty = existingById || existingByLocation;
    const metadata = {
      ...toDetailsObject(existingProperty?.metadata),
      ...input.details,
      stockKind: 'property_listing',
      stockSource: 'google_places',
      googlePlaceId: listing.placeId,
      moduleScope: listing.moduleScope,
      displayName: listing.name,
      propertyName: listing.name,
      propertyAddress: listing.address,
      formatted_address: listing.address,
      address: listing.address,
      latitude: listing.latitude,
      longitude: listing.longitude,
      city: listing.city,
      area: listing.area,
    };

    const nextBrokerId = input.createdByBrokerId || existingProperty?.brokerId || undefined;
    const payload = {
      title: listing.name,
      description: listing.description || existingProperty?.description || '',
      address: listing.address,
      city: listing.city || existingProperty?.city || 'Unknown',
      province: listing.province || existingProperty?.province || 'Unknown',
      postalCode: listing.postalCode || existingProperty?.postalCode || 'Unknown',
      type: listing.propertyType || existingProperty?.type || listing.moduleScope,
      status: listing.propertyStatus || existingProperty?.status || 'for_sale',
      moduleType: listing.moduleScope,
      price: listing.price,
      area: listing.area,
      latitude: listing.latitude,
      longitude: listing.longitude,
      brokerId: nextBrokerId,
      metadata,
    };

    const property = existingProperty
      ? await propertyService.updateProperty(existingProperty.id, payload, {
          user: input.user,
          skipDerivedSync: true,
        })
      : await propertyService.createProperty(payload, {
          user: input.user,
          skipDerivedSync: true,
        });

    return {
      propertyId: property.id,
      name: listing.name,
      address: listing.address,
      city: property.city,
      area: property.area,
      latitude: listing.latitude,
      longitude: listing.longitude,
    };
  }

  if (input.propertyId) {
    const existing = await prisma.property.findUnique({ where: { id: input.propertyId } });
    if (existing) {
      return {
        propertyId: existing.id,
        name:
          normalizeText(input.name) ||
          existing.title ||
          detailString(input.details, ['itemName', 'propertyName', 'centreItemName', 'name']),
        address:
          normalizeText(input.address) ||
          existing.address ||
          detailString(input.details, ['formatted_address', 'location', 'address', 'propertyAddress']),
        city: existing.city,
        area: existing.area,
        latitude: existing.latitude ?? normalizeNumber(input.latitude),
        longitude: existing.longitude ?? normalizeNumber(input.longitude),
      };
    }
  }

  const itemName = detailString(
    input.details,
    ['itemName', 'propertyName', 'centreItemName', 'name'],
    normalizeText(input.name) || input.module || 'Stock Item'
  );
  const address = detailString(
    input.details,
    ['formatted_address', 'location', 'address', 'propertyAddress', 'unitNumber'],
    normalizeText(input.address) || itemName
  );
  const propertyType = detailString(input.details, ['category', 'type'], input.module || 'Stock');
  const priceValue =
    detailNumber(input.details, ['purchasePrice', 'value', 'price'], 0) || 0;

  const created = await propertyService.createProperty(
    {
      title: itemName,
      description: detailString(input.details, ['comments', 'notes']),
      address,
      city: detailString(input.details, ['city'], 'Unknown'),
      province: detailString(input.details, ['province'], 'Unknown'),
      postalCode: detailString(input.details, ['postalCode'], 'Unknown'),
      type: propertyType,
      moduleType: input.module,
      price: priceValue,
      area: detailNumber(input.details, ['area'], 0) || 0,
      latitude: normalizeNumber(input.latitude),
      longitude: normalizeNumber(input.longitude),
      brokerId: input.createdByBrokerId,
      status: normalizePropertyStatus(detailString(input.details, ['status'], 'For Sale'), {
        moduleType: input.module,
      }),
      metadata: input.details,
    },
    { user: input.user, skipDerivedSync: true }
  );

  return {
    propertyId: created.id,
    name: itemName,
    address,
    city: created.city,
    area: created.area,
    latitude: created.latitude ?? normalizeNumber(input.latitude),
    longitude: created.longitude ?? normalizeNumber(input.longitude),
  };
}

function normalizeStockTopLevel(input: {
  recordName?: string | null;
  recordAddress?: string | null;
  recordLatitude?: number | null;
  recordLongitude?: number | null;
  details: Record<string, unknown>;
}): {
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
} {
  return {
    name:
      normalizeText(input.recordName) ||
      detailString(input.details, ['itemName', 'propertyName', 'centreItemName', 'name']),
    address:
      normalizeText(input.recordAddress) ||
      detailString(input.details, ['formatted_address', 'address', 'location', 'propertyAddress']),
    latitude:
      normalizeNumber(input.recordLatitude) ?? detailNumber(input.details, ['latitude', 'lat']),
    longitude:
      normalizeNumber(input.recordLongitude) ?? detailNumber(input.details, ['longitude', 'lng']),
  };
}

export class StockItemService {
  async getAllStockItems(
    filters?: {
      module?: string;
      moduleType?: string;
      propertyId?: string;
      page?: number;
      limit?: number;
    },
    options?: { user?: User | null }
  ): Promise<PaginatedResponse<StockItem>> {
    await reconcilePropertyDerivedRecords(filters, options);

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const where: any = {
      archivedAt: null,
    };

    const resolvedModuleFilter = normalizeModuleScope(filters?.module || filters?.moduleType);
    if (resolvedModuleFilter) where.module = resolvedModuleFilter;
    if (filters?.propertyId) where.propertyId = filters.propertyId;

    const scopedWhere = addDepartmentScope(where, options?.user, 'module');

    const [total, stockItems] = await prisma.$transaction([
      prisma.stockItem.count({ where: scopedWhere }),
      prisma.stockItem.findMany({
        where: scopedWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: stockItems.map(item => mapStockItem(item as NonNullable<StockItemRecord>)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getStockItemById(id: string): Promise<StockItem> {
    const item = await prisma.stockItem.findUnique({ where: { id } });
    if (!item) throw new Error('Stock item not found');
    return mapStockItem(item as NonNullable<StockItemRecord>);
  }

  async createStockItem(
    data: CreateStockItemInput,
    options?: { user?: User | null }
  ): Promise<StockItem> {
    const moduleType = await resolveModuleType(data.module || data.moduleType, options?.user);
    assertBrokerCanAccessModule(options?.user, moduleType);

    const details = toDetailsObject(data.details);
    const createdByBrokerId = await resolveCreatedByBrokerId(options?.user || undefined);
    const property = await resolvePropertyId({
      propertyId: data.propertyId,
      module: moduleType,
      details,
      createdByBrokerId,
      name: data.name,
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      user: options?.user,
    });
    const topLevel = normalizeStockTopLevel({
      recordName: data.name || property.name,
      recordAddress: data.address || property.address,
      recordLatitude: data.latitude ?? property.latitude,
      recordLongitude: data.longitude ?? property.longitude,
      details,
    });
    const stockDetailsPayload: Record<string, unknown> = {
      ...details,
      formatted_address: detailString(
        details,
        ['formatted_address'],
        topLevel.address || property.address
      ),
      address: detailString(details, ['address'], topLevel.address || property.address),
      propertyAddress: detailString(
        details,
        ['propertyAddress'],
        topLevel.address || property.address
      ),
      city: detailString(details, ['city'], property.city || 'Unknown'),
      area: detailNumber(details, ['area'], property.area || 0) || property.area || 0,
    };

    const created = await prisma.$transaction(async tx => {
      const stockItem = await tx.stockItem.create({
        data: {
          propertyId: property.propertyId,
          name: topLevel.name,
          address: topLevel.address,
          latitude: topLevel.latitude,
          longitude: topLevel.longitude,
          createdBy: createdByBrokerId || null,
          assignedBrokerId: createdByBrokerId || null,
          module: moduleType,
          details: stockDetailsPayload as Prisma.InputJsonValue,
        },
      });

      const mapped = mapStockItem(stockItem as NonNullable<StockItemRecord>);
      await auditLogService.recordWithClient(tx, {
        action: 'stock_created',
        entityType: 'stock',
        entityId: stockItem.id,
        description: `Stock "${mapped.name}" created`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: createdByBrokerId || null,
        visibilityScope: 'shared',
        nextValues: buildAuditSnapshot(mapped),
        metadata: {
          propertyId: stockItem.propertyId,
          module: stockItem.module,
        },
        notification: {
          title: 'Stock Created',
          message: `Stock "${mapped.name}" created`,
          type: 'stock_created',
          payload: {
            stockId: stockItem.id,
            propertyId: stockItem.propertyId,
            module: stockItem.module,
          },
        },
      });

      return mapped;
    });

    return created;
  }

  async updateStockItem(
    id: string,
    data: UpdateStockItemInput,
    options?: { user?: User | null }
  ): Promise<StockItem> {
    const existing = await prisma.stockItem.findUnique({ where: { id } });
    if (!existing) throw new Error('Stock item not found');

    const moduleType = await resolveModuleType(
      data.module || data.moduleType || existing.module,
      options?.user
    );
    assertBrokerCanAccessModule(options?.user, moduleType);

    const details = {
      ...toDetailsObject(existing.details),
      ...toDetailsObject(data.details),
    };
    const createdByBrokerId =
      (await resolveCreatedByBrokerId(options?.user || undefined, existing.createdBy || data.createdBy)) ||
      existing.createdBy ||
      undefined;
    const property = await resolvePropertyId({
      propertyId: data.propertyId || existing.propertyId,
      module: moduleType,
      details,
      createdByBrokerId,
      name: data.name ?? existing.name,
      address: data.address ?? existing.address,
      latitude: data.latitude ?? existing.latitude,
      longitude: data.longitude ?? existing.longitude,
      user: options?.user,
    });
    const topLevel = normalizeStockTopLevel({
      recordName: data.name ?? existing.name ?? property.name,
      recordAddress: data.address ?? existing.address ?? property.address,
      recordLatitude: data.latitude ?? existing.latitude ?? property.latitude,
      recordLongitude: data.longitude ?? existing.longitude ?? property.longitude,
      details,
    });
    const stockDetailsPayload: Record<string, unknown> = {
      ...details,
      formatted_address: detailString(
        details,
        ['formatted_address'],
        topLevel.address || property.address
      ),
      address: detailString(details, ['address'], topLevel.address || property.address),
      propertyAddress: detailString(
        details,
        ['propertyAddress'],
        topLevel.address || property.address
      ),
      city: detailString(details, ['city'], property.city || 'Unknown'),
      area: detailNumber(details, ['area'], property.area || 0) || property.area || 0,
    };

    const existingMapped = mapStockItem(existing as NonNullable<StockItemRecord>);
    const updated = await prisma.$transaction(async tx => {
      const stockItem = await tx.stockItem.update({
        where: { id },
        data: {
          propertyId: property.propertyId,
          name: topLevel.name,
          address: topLevel.address,
          latitude: topLevel.latitude,
          longitude: topLevel.longitude,
          createdBy: createdByBrokerId ?? existing.createdBy,
          assignedBrokerId: createdByBrokerId ?? existing.assignedBrokerId ?? existing.createdBy,
          module: moduleType,
          details: stockDetailsPayload as Prisma.InputJsonValue,
        },
      });

      const mapped = mapStockItem(stockItem as NonNullable<StockItemRecord>);
      await auditLogService.recordWithClient(tx, {
        action: 'stock_updated',
        entityType: 'stock',
        entityId: stockItem.id,
        description: `Stock "${mapped.name}" updated`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: mapped.assignedBrokerId || null,
        visibilityScope: 'shared',
        previousValues: buildAuditSnapshot(existingMapped),
        nextValues: buildAuditSnapshot(mapped),
        metadata: {
          propertyId: stockItem.propertyId,
          module: stockItem.module,
        },
        notification: {
          title: 'Stock Updated',
          message: `Stock "${mapped.name}" updated`,
          type: 'stock_updated',
          payload: {
            stockId: stockItem.id,
            propertyId: stockItem.propertyId,
            module: stockItem.module,
          },
        },
      });

      return mapped;
    });

    return updated;
  }

  async deleteStockItem(id: string, options?: { user?: User | null }): Promise<void> {
    const existing = await prisma.stockItem.findUnique({ where: { id } });
    if (!existing) throw new Error('Stock item not found');

    const existingMapped = mapStockItem(existing as NonNullable<StockItemRecord>);
    await prisma.$transaction(async tx => {
      await tx.stockItem.update({
        where: { id },
        data: {
          archivedAt: new Date(),
        },
      });

      await auditLogService.recordWithClient(tx, {
        action: 'stock_deleted',
        entityType: 'stock',
        entityId: id,
        description: `Stock "${existingMapped.name}" archived`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: existing.assignedBrokerId || existing.createdBy || null,
        visibilityScope: 'shared',
        previousValues: buildAuditSnapshot(existingMapped),
        metadata: {
          propertyId: existing.propertyId,
          module: existing.module,
        },
        notification: {
          title: 'Stock Archived',
          message: `Stock "${existingMapped.name}" archived`,
          type: 'stock_deleted',
          payload: {
            stockId: id,
            propertyId: existing.propertyId,
            module: existing.module,
          },
        },
      });
    });
  }
}

export const stockItemService = new StockItemService();
