import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { CreateLandlordInput, UpdateLandlordInput } from '@/validators';
import { Landlord, PaginatedResponse } from '@/types';

type LandlordRecord = Awaited<ReturnType<typeof prisma.landlord.findFirst>>;

function toDetailsObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mapLandlord(record: NonNullable<LandlordRecord>): Landlord {
  return {
    id: record.id,
    name: record.name,
    contact: record.contact ?? undefined,
    email: record.email ?? undefined,
    phone: record.phone ?? undefined,
    address: record.address ?? undefined,
    status: record.status ?? undefined,
    notes: record.notes ?? undefined,
    details: toDetailsObject(record.details),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class LandlordService {
  async getAllLandlords(filters?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Landlord>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const where: Prisma.LandlordWhereInput = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    const search = String(filters?.search || '').trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contact: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await prisma.$transaction([
      prisma.landlord.count({ where }),
      prisma.landlord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map(row => mapLandlord(row as NonNullable<LandlordRecord>)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getLandlordById(id: string): Promise<Landlord> {
    const record = await prisma.landlord.findUnique({ where: { id } });
    if (!record) throw new Error('Landlord not found');
    return mapLandlord(record as NonNullable<LandlordRecord>);
  }

  async createLandlord(data: CreateLandlordInput): Promise<Landlord> {
    const name = String(data.name || '').trim();
    if (!name) {
      throw new Error('Landlord name is required');
    }

    const created = await prisma.landlord.create({
      data: {
        name,
        contact: data.contact?.trim() || undefined,
        email: data.email?.trim().toLowerCase() || undefined,
        phone: data.phone?.trim() || undefined,
        address: data.address?.trim() || undefined,
        status: data.status?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
        details: (toDetailsObject(data.details) as Prisma.InputJsonValue) || undefined,
      },
    });

    return mapLandlord(created as NonNullable<LandlordRecord>);
  }

  async updateLandlord(id: string, data: UpdateLandlordInput): Promise<Landlord> {
    const existing = await prisma.landlord.findUnique({ where: { id } });
    if (!existing) throw new Error('Landlord not found');

    const mergedDetails = {
      ...toDetailsObject(existing.details),
      ...toDetailsObject(data.details),
    };

    const updated = await prisma.landlord.update({
      where: { id },
      data: {
        name: data.name?.trim() || undefined,
        contact: data.contact?.trim() || undefined,
        email: data.email?.trim().toLowerCase() || undefined,
        phone: data.phone?.trim() || undefined,
        address: data.address?.trim() || undefined,
        status: data.status?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
        details:
          Object.keys(mergedDetails).length > 0
            ? (mergedDetails as Prisma.InputJsonValue)
            : undefined,
      },
    });

    return mapLandlord(updated as NonNullable<LandlordRecord>);
  }

  async deleteLandlord(id: string): Promise<void> {
    const existing = await prisma.landlord.findUnique({ where: { id } });
    if (!existing) throw new Error('Landlord not found');
    await prisma.landlord.delete({ where: { id } });
  }
}

export const landlordService = new LandlordService();
