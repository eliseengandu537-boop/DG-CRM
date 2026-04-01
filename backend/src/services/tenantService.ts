import { PaginatedResponse, Tenant } from '@/types';
import { CreateTenantInput, UpdateTenantInput } from '@/validators';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

type TenantRecord = Awaited<ReturnType<typeof prisma.tenant.findFirst>>;

function toDetailsObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function resolveTenantName(data: {
  companyName?: string | null;
  businessName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const companyName = data.companyName?.trim();
  if (companyName) return companyName;

  const businessName = data.businessName?.trim();
  if (businessName) return businessName;

  const first = data.firstName?.trim() || '';
  const last = data.lastName?.trim() || '';
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;

  return '';
}

function mapTenant(record: NonNullable<TenantRecord>): Tenant {
  return {
    id: record.id,
    companyName: record.companyName ?? undefined,
    firstName: record.firstName ?? undefined,
    lastName: record.lastName ?? undefined,
    businessName: record.businessName ?? undefined,
    email: record.email ?? undefined,
    phone: record.phone ?? undefined,
    contactId: record.contactId ?? undefined,
    propertyId: record.propertyId ?? undefined,
    linkedAssetId: record.linkedAssetId ?? undefined,
    linkedStockItemId: record.linkedStockItemId ?? undefined,
    unitNumber: record.unitNumber ?? undefined,
    leaseStartDate: record.leaseStartDate ?? undefined,
    leaseEndDate: record.leaseEndDate ?? undefined,
    monthlyRent: record.monthlyRent ?? undefined,
    securityDeposit: record.securityDeposit ?? undefined,
    leaseStatus: record.leaseStatus ?? undefined,
    squareFootage: record.squareFootage ?? undefined,
    status: record.status ?? undefined,
    paymentStatus: record.paymentStatus ?? undefined,
    maintenanceRequests: record.maintenanceRequests ?? undefined,
    notes: record.notes ?? undefined,
    details: toDetailsObject(record.details),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class TenantService {
  async getAllTenants(filters?: {
    status?: string;
    leaseStatus?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Tenant>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const where: any = {};

    if (filters?.status) where.status = filters.status;
    if (filters?.leaseStatus) where.leaseStatus = filters.leaseStatus;
    if (filters?.search) {
      const search = filters.search.trim();
      if (search) {
        where.OR = [
          { companyName: { contains: search } },
          { businessName: { contains: search } },
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { unitNumber: { contains: search } },
          { email: { contains: search } },
        ];
      }
    }

    const [total, tenants] = await prisma.$transaction([
      prisma.tenant.count({ where }),
      prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: tenants.map(item => mapTenant(item as any)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getTenantById(id: string): Promise<Tenant> {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new Error('Tenant not found');
    return mapTenant(tenant as any);
  }

  async createTenant(data: CreateTenantInput): Promise<Tenant> {
    const tenantName = resolveTenantName(data);
    if (!tenantName) throw new Error('Tenant name is required');

    const details = toDetailsObject(data.details);

    const created = await prisma.tenant.create({
      data: {
        companyName: data.companyName?.trim() || data.businessName?.trim() || tenantName,
        firstName: data.firstName?.trim() || undefined,
        lastName: data.lastName?.trim() || undefined,
        businessName: data.businessName?.trim() || undefined,
        email: data.email?.trim().toLowerCase() || undefined,
        phone: data.phone?.trim() || undefined,
        contactId: data.contactId,
        propertyId: data.propertyId,
        linkedAssetId: data.linkedAssetId,
        linkedStockItemId: data.linkedStockItemId,
        unitNumber: data.unitNumber?.trim() || undefined,
        leaseStartDate: data.leaseStartDate,
        leaseEndDate: data.leaseEndDate,
        monthlyRent: data.monthlyRent,
        securityDeposit: data.securityDeposit,
        leaseStatus: data.leaseStatus,
        squareFootage: data.squareFootage,
        status: data.status,
        paymentStatus: data.paymentStatus,
        maintenanceRequests: data.maintenanceRequests,
        notes: data.notes,
        details: details as Prisma.InputJsonValue,
      },
    });

    return mapTenant(created as any);
  }

  async updateTenant(id: string, data: UpdateTenantInput): Promise<Tenant> {
    const existing = await prisma.tenant.findUnique({ where: { id } });
    if (!existing) throw new Error('Tenant not found');

    const nextDetails = {
      ...toDetailsObject(existing.details),
      ...toDetailsObject(data.details),
    };

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        companyName: data.companyName?.trim() || data.businessName?.trim(),
        firstName: data.firstName?.trim(),
        lastName: data.lastName?.trim(),
        businessName: data.businessName?.trim(),
        email: data.email?.trim().toLowerCase(),
        phone: data.phone?.trim(),
        contactId: data.contactId,
        propertyId: data.propertyId,
        linkedAssetId: data.linkedAssetId,
        linkedStockItemId: data.linkedStockItemId,
        unitNumber: data.unitNumber?.trim(),
        leaseStartDate: data.leaseStartDate,
        leaseEndDate: data.leaseEndDate,
        monthlyRent: data.monthlyRent,
        securityDeposit: data.securityDeposit,
        leaseStatus: data.leaseStatus,
        squareFootage: data.squareFootage,
        status: data.status,
        paymentStatus: data.paymentStatus,
        maintenanceRequests: data.maintenanceRequests,
        notes: data.notes,
        details: nextDetails as Prisma.InputJsonValue,
      },
    });

    return mapTenant(updated as any);
  }

  async deleteTenant(id: string): Promise<void> {
    const existing = await prisma.tenant.findUnique({ where: { id } });
    if (!existing) throw new Error('Tenant not found');
    await prisma.tenant.delete({ where: { id } });
  }
}

export const tenantService = new TenantService();
