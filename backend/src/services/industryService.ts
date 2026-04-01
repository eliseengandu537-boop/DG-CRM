import { prisma } from '@/lib/prisma';
import { Industry, PaginatedResponse } from '@/types';
import { CreateIndustryInput, UpdateIndustryInput } from '@/validators';
import { Prisma } from '@prisma/client';

type IndustryRecord = Awaited<ReturnType<typeof prisma.industry.findFirst>>;

function mapIndustry(record: NonNullable<IndustryRecord>): Industry {
  return {
    id: record.id,
    name: record.name,
    category: record.category ?? undefined,
    description: record.description ?? undefined,
    occupancyRate: Number(record.occupancyRate || 0),
    averageRent: Number(record.averageRent || 0),
    status: record.status ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class IndustryService {
  async getAllIndustries(filters?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Industry>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const where: Prisma.IndustryWhereInput = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    const search = String(filters?.search || '').trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await prisma.$transaction([
      prisma.industry.count({ where }),
      prisma.industry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map(row => mapIndustry(row as NonNullable<IndustryRecord>)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getIndustryById(id: string): Promise<Industry> {
    const record = await prisma.industry.findUnique({ where: { id } });
    if (!record) throw new Error('Industry not found');
    return mapIndustry(record as NonNullable<IndustryRecord>);
  }

  async createIndustry(data: CreateIndustryInput): Promise<Industry> {
    const name = String(data.name || '').trim();
    if (!name) {
      throw new Error('Industry name is required');
    }

    const created = await prisma.industry.create({
      data: {
        name,
        category: data.category?.trim() || undefined,
        description: data.description?.trim() || undefined,
        occupancyRate: Number(data.occupancyRate || 0),
        averageRent: Number(data.averageRent || 0),
        status: data.status?.trim() || undefined,
      },
    });

    return mapIndustry(created as NonNullable<IndustryRecord>);
  }

  async updateIndustry(id: string, data: UpdateIndustryInput): Promise<Industry> {
    const existing = await prisma.industry.findUnique({ where: { id } });
    if (!existing) throw new Error('Industry not found');

    const updated = await prisma.industry.update({
      where: { id },
      data: {
        name: data.name?.trim() || undefined,
        category: data.category?.trim() || undefined,
        description: data.description?.trim() || undefined,
        occupancyRate:
          data.occupancyRate === undefined ? undefined : Number(data.occupancyRate || 0),
        averageRent: data.averageRent === undefined ? undefined : Number(data.averageRent || 0),
        status: data.status?.trim() || undefined,
      },
    });

    return mapIndustry(updated as NonNullable<IndustryRecord>);
  }

  async deleteIndustry(id: string): Promise<void> {
    const existing = await prisma.industry.findUnique({ where: { id } });
    if (!existing) throw new Error('Industry not found');
    await prisma.industry.delete({ where: { id } });
  }
}

export const industryService = new IndustryService();
