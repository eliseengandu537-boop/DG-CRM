import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { addDepartmentScope, normalizeModuleScope } from '@/lib/departmentAccess';
import {
  buildPropertyStockDetails,
  inferPropertyModuleType,
  inferStockModuleFromProperty,
  isStockEligiblePropertyStatus,
  normalizePropertyStatus,
  PROPERTY_STATUS_AUCTION,
  PROPERTY_STATUS_FOR_LEASE,
  PROPERTY_STATUS_FOR_SALE,
  toPropertyMetadata,
} from '@/lib/propertyStatus';
import { User } from '@/types';

type SyncableProperty = NonNullable<Awaited<ReturnType<typeof prisma.property.findFirst>>>;
type TransactionClient = Prisma.TransactionClient;

function stockDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function isPropertyListingStockItem(details: unknown): boolean {
  return String(stockDetails(details).stockKind || '').trim().toLowerCase() === 'property_listing';
}

function buildAuctionPayload(property: SyncableProperty): Record<string, unknown> {
  const metadata = toPropertyMetadata(property.metadata);

  return {
    propertyId: property.id,
    propertyName: property.title,
    location: [property.city, property.province].filter(Boolean).join(', '),
    mandatePrice: property.price,
    brokerId: property.brokerId || null,
    brokerName: String(metadata.assignedBrokerName || ''),
    propertyStatus: normalizePropertyStatus(property.status, { moduleType: property.moduleType }),
    propertyAddress: property.address,
    propertyType: property.type,
    latitude: property.latitude ?? null,
    longitude: property.longitude ?? null,
  };
}

async function syncAuctionRecord(
  tx: TransactionClient,
  property: SyncableProperty
): Promise<void> {
  const status = normalizePropertyStatus(property.status, { moduleType: property.moduleType });
  const existing = await tx.customRecord.findFirst({
    where: {
      entityType: 'auction',
      referenceId: property.id,
    },
  });

  if (status !== PROPERTY_STATUS_AUCTION || property.deletedAt) {
    if (existing) {
      await tx.customRecord.update({
        where: { id: existing.id },
        data: {
          status: 'No Longer Available',
          payload: {
            ...stockDetails(existing.payload),
            ...buildAuctionPayload(property),
            currentPropertyStatus: status,
          } as Prisma.InputJsonValue,
        },
      });
    }
    return;
  }

  const payload = buildAuctionPayload(property);
  if (existing) {
    await tx.customRecord.update({
      where: { id: existing.id },
      data: {
        name: property.title,
        status: 'Open',
        category: property.type,
        assignedBrokerId: property.brokerId || null,
        moduleType: 'auction',
        payload: payload as Prisma.InputJsonValue,
      },
    });
    return;
  }

  await tx.customRecord.create({
    data: {
      entityType: 'auction',
      name: property.title,
      status: 'Open',
      category: property.type,
      referenceId: property.id,
      assignedBrokerId: property.brokerId || null,
      moduleType: 'auction',
      visibilityScope: 'shared',
      payload: payload as Prisma.InputJsonValue,
    },
  });
}

export async function syncPropertyDerivedRecordsWithClient(
  tx: TransactionClient,
  property: SyncableProperty
): Promise<void> {
  const propertyListings = (await tx.stockItem.findMany({
    where: {
      propertyId: property.id,
    },
  })).filter(item => isPropertyListingStockItem(item.details));

  const normalizedStatus = normalizePropertyStatus(property.status, {
    moduleType: property.moduleType,
  });
  const targetModule =
    inferStockModuleFromProperty({
      status: normalizedStatus,
      moduleType: property.moduleType,
    }) ||
    inferPropertyModuleType({
      moduleType: property.moduleType,
      metadata: property.metadata,
      status: normalizedStatus,
      type: property.type,
    });

  if (property.deletedAt || !isStockEligiblePropertyStatus(normalizedStatus) || !targetModule) {
    for (const listing of propertyListings) {
      if (!listing.archivedAt) {
        await tx.stockItem.update({
          where: { id: listing.id },
          data: {
            archivedAt: new Date(),
          },
        });
      }
    }

    await syncAuctionRecord(tx, property);
    return;
  }

  const details = buildPropertyStockDetails({
    title: property.title,
    description: property.description,
    address: property.address,
    city: property.city,
    province: property.province,
    postalCode: property.postalCode,
    type: property.type,
    price: property.price,
    area: property.area,
    latitude: property.latitude,
    longitude: property.longitude,
    status: normalizedStatus,
    moduleType: property.moduleType,
    brokerId: property.brokerId,
    metadata: property.metadata,
  });

  const targetItem = propertyListings.find(
    listing => !listing.archivedAt && normalizeModuleScope(listing.module) === targetModule
  );

  if (targetItem) {
    await tx.stockItem.update({
      where: { id: targetItem.id },
      data: {
        name: String(details.itemName || property.title),
        address: String(details.address || property.address),
        latitude: property.latitude,
        longitude: property.longitude,
        createdBy: property.createdByBrokerId || property.brokerId || targetItem.createdBy,
        assignedBrokerId: property.brokerId || targetItem.assignedBrokerId,
        module: targetModule,
        archivedAt: null,
        details: details as Prisma.InputJsonValue,
      },
    });
  } else {
    await tx.stockItem.create({
      data: {
        propertyId: property.id,
        name: String(details.itemName || property.title),
        address: String(details.address || property.address),
        latitude: property.latitude,
        longitude: property.longitude,
        createdBy: property.createdByBrokerId || property.brokerId || null,
        assignedBrokerId: property.brokerId || null,
        module: targetModule,
        details: details as Prisma.InputJsonValue,
      },
    });
  }

  for (const listing of propertyListings) {
    if (targetItem && listing.id === targetItem.id) continue;

    if (!listing.archivedAt) {
      await tx.stockItem.update({
        where: { id: listing.id },
        data: {
          archivedAt: new Date(),
        },
      });
    }
  }

  await syncAuctionRecord(tx, property);
}

export async function reconcilePropertyDerivedRecords(
  filters?: {
    module?: string;
    propertyId?: string;
  },
  options?: { user?: User | null }
): Promise<void> {
  const moduleFilter = normalizeModuleScope(filters?.module);
  const eligibleStatuses =
    moduleFilter === 'leasing'
      ? [PROPERTY_STATUS_FOR_LEASE]
      : moduleFilter === 'auction'
      ? [PROPERTY_STATUS_AUCTION]
      : moduleFilter === 'sales'
      ? [PROPERTY_STATUS_FOR_SALE]
      : [PROPERTY_STATUS_FOR_SALE, PROPERTY_STATUS_FOR_LEASE, PROPERTY_STATUS_AUCTION];

  const where: Prisma.PropertyWhereInput = filters?.propertyId
    ? {
        id: filters.propertyId,
      }
    : {
        deletedAt: null,
        status: {
          in: eligibleStatuses,
        },
      };

  const scopedWhere = addDepartmentScope(where as Record<string, unknown>, options?.user, 'moduleType');
  const properties = await prisma.property.findMany({
    where: scopedWhere as Prisma.PropertyWhereInput,
  });

  if (properties.length === 0) {
    return;
  }

  await prisma.$transaction(async tx => {
    for (const property of properties) {
      await syncPropertyDerivedRecordsWithClient(tx, property as SyncableProperty);
    }
  });
}
