import { Property, PaginatedResponse, User } from '@/types';
import { CreatePropertyInput, UpdatePropertyInput } from '@/validators';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  addDepartmentScope,
  assertAssignedBrokerMatchesDepartment,
  assertBrokerCanAccessModule,
  getEffectiveBrokerId,
  normalizeBrokerDepartment,
  normalizeModuleScope,
} from '@/lib/departmentAccess';
import {
  inferPropertyModuleType,
  normalizePropertyStatus,
  toPropertyMetadata,
} from '@/lib/propertyStatus';
import { auditLogService } from '@/services/auditLogService';
import { syncPropertyDerivedRecordsWithClient } from '@/services/propertyModuleSyncService';

type PropertyWithBroker = Awaited<ReturnType<typeof prisma.property.findFirst>> & {
  broker?: { id: string; name: string } | null;
};

type PropertyMutationOptions = {
  user?: User | null;
  skipDerivedSync?: boolean;
};

type PropertyQueryOptions = {
  user?: User | null;
  globalVisibility?: boolean;
};

const propertyBrokerSelect = { id: true, name: true } as const;

const propertyWithBrokerSelect = {
  id: true,
  title: true,
  description: true,
  address: true,
  city: true,
  province: true,
  postalCode: true,
  type: true,
  price: true,
  area: true,
  latitude: true,
  longitude: true,
  status: true,
  moduleType: true,
  brokerId: true,
  createdByBrokerId: true,
  bedrooms: true,
  bathrooms: true,
  metadata: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  broker: { select: propertyBrokerSelect },
} as const;

const legacyPropertyWithBrokerSelect = {
  id: true,
  title: true,
  description: true,
  address: true,
  city: true,
  province: true,
  postalCode: true,
  type: true,
  price: true,
  area: true,
  latitude: true,
  longitude: true,
  status: true,
  brokerId: true,
  bedrooms: true,
  bathrooms: true,
  metadata: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  broker: { select: propertyBrokerSelect },
} as const;

function isLegacyPropertySchemaError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase();
  if (!message.includes('does not exist')) return false;
  return message.includes('module_type') || message.includes('created_by_broker_id');
}

function removeModuleTypeConstraints(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(item => removeModuleTypeConstraints(item))
      .filter(item =>
        !(
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          Object.keys(item as Record<string, unknown>).length === 0
        )
      );
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(record)) {
    if (key === 'moduleType') continue;
    next[key] = removeModuleTypeConstraints(nestedValue);
  }
  return next;
}

function buildLegacyPropertyWhere(
  scopedWhere: Prisma.PropertyWhereInput,
  user?: User | null
): Prisma.PropertyWhereInput {
  const stripped = (removeModuleTypeConstraints(scopedWhere) || {}) as Prisma.PropertyWhereInput;
  if (user?.role !== 'broker') {
    return stripped;
  }

  const effectiveBrokerId = getEffectiveBrokerId(user);
  if (!effectiveBrokerId) {
    return stripped;
  }

  if (Object.keys(stripped as Record<string, unknown>).length === 0) {
    return { brokerId: effectiveBrokerId };
  }

  return {
    AND: [
      stripped,
      { brokerId: effectiveBrokerId },
    ],
  };
}

function mapProperty(record: NonNullable<PropertyWithBroker>): Property {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    address: record.address,
    city: record.city,
    province: record.province,
    postalCode: record.postalCode,
    type: record.type,
    price: record.price,
    area: record.area,
    latitude: record.latitude ?? undefined,
    longitude: record.longitude ?? undefined,
    status: record.status,
    moduleType: (record.moduleType as Property['moduleType']) ?? undefined,
    brokerId: record.brokerId ?? undefined,
    createdByBrokerId: record.createdByBrokerId ?? undefined,
    assignedBrokerId: record.brokerId ?? undefined,
    assignedBrokerName: record.broker?.name ?? undefined,
    bedrooms: record.bedrooms ?? undefined,
    bathrooms: record.bathrooms ?? undefined,
    metadata: record.metadata ?? undefined,
    deletedAt: record.deletedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildAuditSnapshot(record: Property): Record<string, unknown> {
  return {
    title: record.title,
    address: record.address,
    city: record.city,
    province: record.province,
    postalCode: record.postalCode,
    type: record.type,
    status: record.status,
    moduleType: record.moduleType ?? null,
    brokerId: record.brokerId ?? null,
    createdByBrokerId: record.createdByBrokerId ?? null,
    price: record.price,
    area: record.area,
  };
}

async function resolveModuleType(
  inputModuleType: string | undefined,
  brokerId: string | undefined,
  user?: User | null,
  existingModuleType?: string | null,
  input?: Partial<CreatePropertyInput & UpdatePropertyInput>
) {
  if (user?.role === 'broker') {
    const moduleType = normalizeBrokerDepartment(user.department);
    if (!moduleType) {
      throw new Error('Broker department is required before creating properties');
    }
    return moduleType;
  }

  const normalizedInput = normalizeModuleScope(inputModuleType);
  if (normalizedInput) {
    return normalizedInput;
  }

  const inferredInput = inferPropertyModuleType({
    moduleType: inputModuleType,
    metadata: input?.metadata,
    status: input?.status,
    type: input?.type,
    fallback: existingModuleType,
  });
  if (inferredInput) {
    return inferredInput;
  }

  if (brokerId) {
    const broker = await prisma.broker.findUnique({
      where: { id: brokerId },
      select: { department: true, company: true },
    });
    const brokerModule =
      normalizeBrokerDepartment(broker?.department) || normalizeBrokerDepartment(broker?.company);
    if (brokerModule) {
      return brokerModule;
    }
  }

  const existingModule = normalizeModuleScope(existingModuleType);
  if (existingModule) {
    return existingModule;
  }

  return 'sales';
}

function buildPropertyMetadata(input: {
  currentMetadata?: unknown;
  nextMetadata?: unknown;
  moduleType: string;
  status: string;
  type: string;
  title: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  price: number;
  area: number;
  latitude?: number;
  longitude?: number;
}): Prisma.InputJsonValue {
  const currentMetadata = toPropertyMetadata(input.currentMetadata);
  const nextMetadata = toPropertyMetadata(input.nextMetadata);

  return {
    ...currentMetadata,
    ...nextMetadata,
    moduleScope: input.moduleType,
    propertyType: input.type,
    propertyStatus: input.status,
    status: input.status,
    propertyName: String(nextMetadata.propertyName || nextMetadata.displayName || input.title),
    propertyAddress: input.address,
    city: input.city,
    province: input.province,
    postalCode: input.postalCode,
    price: input.price,
    area: input.area,
    latitude: input.latitude,
    longitude: input.longitude,
  } as Prisma.InputJsonValue;
}

async function assertAssignedBroker(
  brokerId: string | undefined,
  moduleType: string | undefined,
  user?: User | null
): Promise<void> {
  if (!brokerId) return;
  if (user?.role === 'admin' || user?.role === 'manager') return;

  const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
  if (!broker) throw new Error('Assigned broker not found');
  if (broker.status === 'archived') throw new Error('Assigned broker is archived');
  assertAssignedBrokerMatchesDepartment(broker.department || broker.company, moduleType, 'property');
}

export class PropertyService {
  async getAllProperties(
    filters?: {
      brokerId?: string;
      type?: string;
      moduleType?: string;
      status?: string;
      statuses?: string[];
      stockOnly?: boolean;
      includeDeleted?: boolean;
      page?: number;
      limit?: number;
    },
    options?: PropertyQueryOptions
  ): Promise<PaginatedResponse<Property>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const where: Prisma.PropertyWhereInput = {};

    if (filters?.brokerId) where.brokerId = filters.brokerId;
    if (filters?.type) where.type = filters.type;
    if (filters?.moduleType) {
      where.moduleType = normalizeModuleScope(filters.moduleType) || filters.moduleType;
    }
    if (!filters?.includeDeleted) {
      where.deletedAt = null;
    }

    const requestedStatuses = [
      ...(filters?.status ? [filters.status] : []),
      ...(filters?.statuses || []),
    ]
      .map(status => normalizePropertyStatus(status, { moduleType: filters?.moduleType }))
      .filter(Boolean);

    if (filters?.stockOnly) {
      where.status = {
        in: ['For Sale', 'For Lease', 'Auction'],
      };
    } else if (requestedStatuses.length > 0) {
      where.status = {
        in: Array.from(new Set(requestedStatuses)),
      };
    }

    const scopedWhere = options?.globalVisibility
      ? (where as unknown as Record<string, unknown>)
      : addDepartmentScope(
          where as unknown as Record<string, unknown>,
          options?.user,
          'moduleType'
        );

    let total = 0;
    let properties: PropertyWithBroker[] = [];

    try {
      const result = await prisma.$transaction([
        prisma.property.count({ where: scopedWhere as Prisma.PropertyWhereInput }),
        prisma.property.findMany({
          where: scopedWhere as Prisma.PropertyWhereInput,
          select: propertyWithBrokerSelect,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      total = result[0];
      properties = result[1] as unknown as PropertyWithBroker[];
    } catch (error) {
      if (!isLegacyPropertySchemaError(error)) {
        throw error;
      }

      const legacyWhere = buildLegacyPropertyWhere(
        scopedWhere as Prisma.PropertyWhereInput,
        options?.user
      );
      const result = await prisma.$transaction([
        prisma.property.count({ where: legacyWhere }),
        prisma.property.findMany({
          where: legacyWhere,
          select: legacyPropertyWithBrokerSelect,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      total = result[0];
      properties = result[1] as unknown as PropertyWithBroker[];
    }

    return {
      data: properties.map(property => mapProperty(property as NonNullable<PropertyWithBroker>)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getPropertyById(id: string): Promise<Property> {
    let property: PropertyWithBroker | null = null;
    try {
      property = (await prisma.property.findUnique({
        where: { id },
        select: propertyWithBrokerSelect,
      })) as PropertyWithBroker | null;
    } catch (error) {
      if (!isLegacyPropertySchemaError(error)) {
        throw error;
      }

      property = (await prisma.property.findUnique({
        where: { id },
        select: legacyPropertyWithBrokerSelect,
      })) as PropertyWithBroker | null;
    }

    if (!property) throw new Error('Property not found');
    return mapProperty(property as NonNullable<PropertyWithBroker>);
  }

  async createProperty(
    data: CreatePropertyInput,
    options?: PropertyMutationOptions
  ): Promise<Property> {
    const effectiveBrokerId = getEffectiveBrokerId(options?.user);
    const brokerId = effectiveBrokerId || data.brokerId || undefined;
    const moduleType = await resolveModuleType(
      data.moduleType,
      brokerId,
      options?.user,
      undefined,
      data
    );
    const title = data.title?.trim() || data.address;
    const description = data.description?.trim() || '';
    const city = data.city?.trim() || 'Unknown';
    const province = data.province?.trim() || 'Unknown';
    const postalCode = data.postalCode?.trim() || 'Unknown';
    const price = data.price ?? 0;
    const area = data.area ?? 0;
    const status = normalizePropertyStatus(data.status, { moduleType });

    assertBrokerCanAccessModule(options?.user, moduleType);
    await assertAssignedBroker(brokerId, moduleType, options?.user);

    const created = await prisma.$transaction(async tx => {
      let property: PropertyWithBroker;
      try {
        property = (await tx.property.create({
          data: {
            title,
            description,
            address: data.address,
            city,
            province,
            postalCode,
            type: data.type,
            price,
            area,
            latitude: data.latitude,
            longitude: data.longitude,
            status,
            moduleType,
            bedrooms: data.bedrooms,
            bathrooms: data.bathrooms,
            brokerId: brokerId || null,
            createdByBrokerId: effectiveBrokerId || null,
            metadata: buildPropertyMetadata({
              nextMetadata: data.metadata,
              moduleType,
              status,
              type: data.type,
              title,
              address: data.address,
              city,
              province,
              postalCode,
              price,
              area,
              latitude: data.latitude,
              longitude: data.longitude,
            }),
          },
          select: propertyWithBrokerSelect,
        })) as PropertyWithBroker;
      } catch (error) {
        if (!isLegacyPropertySchemaError(error)) {
          throw error;
        }

        property = (await tx.property.create({
          data: {
            title,
            description,
            address: data.address,
            city,
            province,
            postalCode,
            type: data.type,
            price,
            area,
            latitude: data.latitude,
            longitude: data.longitude,
            status,
            bedrooms: data.bedrooms,
            bathrooms: data.bathrooms,
            brokerId: brokerId || null,
            metadata: buildPropertyMetadata({
              nextMetadata: data.metadata,
              moduleType,
              status,
              type: data.type,
              title,
              address: data.address,
              city,
              province,
              postalCode,
              price,
              area,
              latitude: data.latitude,
              longitude: data.longitude,
            }),
          },
          select: legacyPropertyWithBrokerSelect,
        })) as PropertyWithBroker;
      }

      if (!options?.skipDerivedSync) {
        await syncPropertyDerivedRecordsWithClient(tx, property as NonNullable<PropertyWithBroker>);
      }

      const mapped = mapProperty(property as NonNullable<PropertyWithBroker>);
      await auditLogService.recordWithClient(tx, {
        action: 'property_created',
        entityType: 'property',
        entityId: property.id,
        description: `Property "${property.title}" created`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: brokerId || null,
        visibilityScope: 'shared',
        nextValues: buildAuditSnapshot(mapped),
        metadata: {
          moduleType,
          brokerId: brokerId || null,
        },
        notification: {
          title: 'Property Created',
          message: `Property "${property.title}" created`,
          type: 'property_created',
          payload: {
            propertyId: property.id,
            brokerId: brokerId || null,
            moduleType,
          },
        },
      });

      return mapped;
    });

    return created;
  }

  async updateProperty(
    id: string,
    data: UpdatePropertyInput,
    options?: PropertyMutationOptions
  ): Promise<Property> {
    let existing: PropertyWithBroker | null = null;
    try {
      existing = (await prisma.property.findUnique({
        where: { id },
        select: propertyWithBrokerSelect,
      })) as PropertyWithBroker | null;
    } catch (error) {
      if (!isLegacyPropertySchemaError(error)) {
        throw error;
      }

      existing = (await prisma.property.findUnique({
        where: { id },
        select: legacyPropertyWithBrokerSelect,
      })) as PropertyWithBroker | null;
    }

    if (!existing) throw new Error('Property not found');

    const effectiveBrokerId = getEffectiveBrokerId(options?.user);
    const brokerId = effectiveBrokerId || data.brokerId || existing.brokerId || undefined;
    const moduleType = await resolveModuleType(
      data.moduleType,
      brokerId,
      options?.user,
      existing.moduleType,
      data
    );
    const title = data.title === undefined ? existing.title : data.title?.trim() || existing.title;
    const description =
      data.description === undefined
        ? existing.description
        : data.description?.trim() || existing.description;
    const address = data.address ?? existing.address;
    const city = data.city?.trim() || existing.city;
    const province = data.province?.trim() || existing.province;
    const postalCode = data.postalCode?.trim() || existing.postalCode;
    const type = data.type ?? existing.type;
    const price = data.price ?? existing.price;
    const area = data.area ?? existing.area;
    const status = normalizePropertyStatus(data.status ?? existing.status, { moduleType });
    const latitude = data.latitude ?? existing.latitude ?? undefined;
    const longitude = data.longitude ?? existing.longitude ?? undefined;

    assertBrokerCanAccessModule(options?.user, moduleType);
    await assertAssignedBroker(brokerId, moduleType, options?.user);

    const existingMapped = mapProperty(existing as NonNullable<PropertyWithBroker>);
    const updated = await prisma.$transaction(async tx => {
      let property: PropertyWithBroker;
      try {
        property = (await tx.property.update({
          where: { id },
          data: {
            title,
            description,
            address,
            city,
            province,
            postalCode,
            type,
            price,
            area,
            latitude,
            longitude,
            status,
            moduleType,
            bedrooms: data.bedrooms,
            bathrooms: data.bathrooms,
            brokerId: brokerId || null,
            createdByBrokerId: existing.createdByBrokerId || effectiveBrokerId || null,
            metadata: buildPropertyMetadata({
              currentMetadata: existing.metadata,
              nextMetadata: data.metadata,
              moduleType,
              status,
              type,
              title,
              address,
              city,
              province,
              postalCode,
              price,
              area,
              latitude,
              longitude,
            }),
          },
          select: propertyWithBrokerSelect,
        })) as PropertyWithBroker;
      } catch (error) {
        if (!isLegacyPropertySchemaError(error)) {
          throw error;
        }

        property = (await tx.property.update({
          where: { id },
          data: {
            title,
            description,
            address,
            city,
            province,
            postalCode,
            type,
            price,
            area,
            latitude,
            longitude,
            status,
            bedrooms: data.bedrooms,
            bathrooms: data.bathrooms,
            brokerId: brokerId || null,
            metadata: buildPropertyMetadata({
              currentMetadata: existing.metadata,
              nextMetadata: data.metadata,
              moduleType,
              status,
              type,
              title,
              address,
              city,
              province,
              postalCode,
              price,
              area,
              latitude,
              longitude,
            }),
          },
          select: legacyPropertyWithBrokerSelect,
        })) as PropertyWithBroker;
      }

      if (!options?.skipDerivedSync) {
        await syncPropertyDerivedRecordsWithClient(tx, property as NonNullable<PropertyWithBroker>);
      }

      const mapped = mapProperty(property as NonNullable<PropertyWithBroker>);
      await auditLogService.recordWithClient(tx, {
        action:
          String(existing.status || '').trim() !== String(property.status || '').trim()
            ? 'property_status_changed'
            : 'property_updated',
        entityType: 'property',
        entityId: property.id,
        description: `Property "${property.title}" updated`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: brokerId || existing.brokerId || null,
        visibilityScope: 'shared',
        previousValues: buildAuditSnapshot(existingMapped),
        nextValues: buildAuditSnapshot(mapped),
        metadata: {
          moduleType,
          brokerId: brokerId || existing.brokerId || null,
        },
        notification: {
          title: 'Property Updated',
          message: `Property "${property.title}" updated`,
          type: 'property_updated',
          payload: {
            propertyId: property.id,
            brokerId: brokerId || existing.brokerId || null,
            moduleType,
          },
        },
      });

      return mapped;
    });

    return updated;
  }

  async deleteProperty(id: string, options?: PropertyMutationOptions): Promise<void> {
    if (options?.user?.role !== 'admin') {
      throw new Error('Forbidden: only admin can delete properties from the Maps module');
    }

    let existing: PropertyWithBroker | null = null;
    try {
      existing = (await prisma.property.findUnique({
        where: { id },
        select: propertyWithBrokerSelect,
      })) as PropertyWithBroker | null;
    } catch (error) {
      if (!isLegacyPropertySchemaError(error)) {
        throw error;
      }

      existing = (await prisma.property.findUnique({
        where: { id },
        select: legacyPropertyWithBrokerSelect,
      })) as PropertyWithBroker | null;
    }

    if (!existing) throw new Error('Property not found');

    const existingMapped = mapProperty(existing as NonNullable<PropertyWithBroker>);
    await prisma.$transaction(async tx => {
      let property: PropertyWithBroker;
      try {
        property = (await tx.property.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            status: normalizePropertyStatus('archived'),
            metadata: buildPropertyMetadata({
              currentMetadata: existing.metadata,
              nextMetadata: existing.metadata,
              moduleType: existing.moduleType || 'sales',
              status: normalizePropertyStatus('archived'),
              type: existing.type,
              title: existing.title,
              address: existing.address,
              city: existing.city,
              province: existing.province,
              postalCode: existing.postalCode,
              price: existing.price,
              area: existing.area,
              latitude: existing.latitude ?? undefined,
              longitude: existing.longitude ?? undefined,
            }),
          },
          select: propertyWithBrokerSelect,
        })) as PropertyWithBroker;
      } catch (error) {
        if (!isLegacyPropertySchemaError(error)) {
          throw error;
        }

        property = (await tx.property.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            status: normalizePropertyStatus('archived'),
            metadata: buildPropertyMetadata({
              currentMetadata: existing.metadata,
              nextMetadata: existing.metadata,
              moduleType: existing.moduleType || 'sales',
              status: normalizePropertyStatus('archived'),
              type: existing.type,
              title: existing.title,
              address: existing.address,
              city: existing.city,
              province: existing.province,
              postalCode: existing.postalCode,
              price: existing.price,
              area: existing.area,
              latitude: existing.latitude ?? undefined,
              longitude: existing.longitude ?? undefined,
            }),
          },
          select: legacyPropertyWithBrokerSelect,
        })) as PropertyWithBroker;
      }

      if (!options?.skipDerivedSync) {
        await syncPropertyDerivedRecordsWithClient(tx, property as NonNullable<PropertyWithBroker>);
      }

      await auditLogService.recordWithClient(tx, {
        action: 'property_deleted',
        entityType: 'property',
        entityId: id,
        description: `Property "${existing.title}" archived`,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        brokerId: existing.brokerId || null,
        visibilityScope: 'shared',
        previousValues: buildAuditSnapshot(existingMapped),
        metadata: {
          moduleType: existing.moduleType || null,
          brokerId: existing.brokerId || null,
        },
        notification: {
          title: 'Property Archived',
          message: `Property "${existing.title}" archived`,
          type: 'property_deleted',
          payload: {
            propertyId: id,
            brokerId: existing.brokerId || null,
            moduleType: existing.moduleType || null,
          },
        },
      });
    });
  }

  async searchProperties(query: string, options?: { user?: User | null }): Promise<Property[]> {
    const q = query.trim();
    if (!q) return [];

    const where = addDepartmentScope(
      {
        deletedAt: null,
        OR: [
          { title: { contains: q } },
          { address: { contains: q } },
          { city: { contains: q } },
          { province: { contains: q } },
        ],
      },
      options?.user,
      'moduleType'
    );

    let properties: PropertyWithBroker[] = [];
    try {
      properties = (await prisma.property.findMany({
        where,
        select: propertyWithBrokerSelect,
        orderBy: { createdAt: 'desc' },
      })) as PropertyWithBroker[];
    } catch (error) {
      if (!isLegacyPropertySchemaError(error)) {
        throw error;
      }

      const legacyWhere = buildLegacyPropertyWhere(where, options?.user);
      properties = (await prisma.property.findMany({
        where: legacyWhere,
        select: legacyPropertyWithBrokerSelect,
        orderBy: { createdAt: 'desc' },
      })) as PropertyWithBroker[];
    }

    return properties.map(property => mapProperty(property as NonNullable<PropertyWithBroker>));
  }

  async getPropertiesByType(type: string, options?: { user?: User | null }): Promise<Property[]> {
    const where = addDepartmentScope({ type, deletedAt: null }, options?.user, 'moduleType');
    let properties: PropertyWithBroker[] = [];
    try {
      properties = (await prisma.property.findMany({
        where,
        select: propertyWithBrokerSelect,
        orderBy: { createdAt: 'desc' },
      })) as PropertyWithBroker[];
    } catch (error) {
      if (!isLegacyPropertySchemaError(error)) {
        throw error;
      }

      const legacyWhere = buildLegacyPropertyWhere(where, options?.user);
      properties = (await prisma.property.findMany({
        where: legacyWhere,
        select: legacyPropertyWithBrokerSelect,
        orderBy: { createdAt: 'desc' },
      })) as PropertyWithBroker[];
    }
    return properties.map(property => mapProperty(property as NonNullable<PropertyWithBroker>));
  }

  async getPropertiesByPrice(
    minPrice: number,
    maxPrice: number,
    options?: { user?: User | null }
  ): Promise<Property[]> {
    const where = addDepartmentScope(
      {
        deletedAt: null,
        price: { gte: minPrice, lte: maxPrice },
      },
      options?.user,
      'moduleType'
    );
    let properties: PropertyWithBroker[] = [];
    try {
      properties = (await prisma.property.findMany({
        where,
        select: propertyWithBrokerSelect,
        orderBy: { createdAt: 'desc' },
      })) as PropertyWithBroker[];
    } catch (error) {
      if (!isLegacyPropertySchemaError(error)) {
        throw error;
      }

      const legacyWhere = buildLegacyPropertyWhere(where, options?.user);
      properties = (await prisma.property.findMany({
        where: legacyWhere,
        select: legacyPropertyWithBrokerSelect,
        orderBy: { createdAt: 'desc' },
      })) as PropertyWithBroker[];
    }
    return properties.map(property => mapProperty(property as NonNullable<PropertyWithBroker>));
  }
}

export const propertyService = new PropertyService();
