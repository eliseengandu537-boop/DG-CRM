import { Contact, PaginatedResponse, User } from '@/types';
import { CreateContactInput, UpdateContactInput } from '@/validators';
import { prisma } from '@/lib/prisma';
import {
  addDepartmentScope,
  assertAssignedBrokerMatchesDepartment,
  assertBrokerCanAccessModule,
  getEffectiveBrokerId,
  normalizeBrokerDepartment,
  normalizeModuleScope,
} from '@/lib/departmentAccess';
import { auditLogService } from '@/services/auditLogService';

type ContactRecord = Awaited<ReturnType<typeof prisma.contact.findFirst>> & {
  broker?: { id: string; name: string } | null;
};

function resolveContactName(data: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const explicit = data.name?.trim();
  if (explicit) return explicit;

  const first = data.firstName?.trim() || '';
  const last = data.lastName?.trim() || '';
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;

  return data.email?.trim() || 'Unnamed Contact';
}

function mapContact(record: NonNullable<ContactRecord>): Contact {
  return {
    id: record.id,
    name: record.name,
    firstName: record.firstName ?? undefined,
    lastName: record.lastName ?? undefined,
    email: record.email,
    phone: record.phone,
    type: record.type,
    status: record.status,
    linkedLeadId: record.linkedLeadId ?? undefined,
    company: record.company ?? undefined,
    position: record.position ?? undefined,
    notes: record.notes ?? undefined,
    moduleType: (record.moduleType as Contact['moduleType']) ?? undefined,
    brokerId: record.brokerId ?? undefined,
    createdByBrokerId: record.createdByBrokerId ?? undefined,
    assignedBrokerId: record.brokerId ?? undefined,
    linkedPropertyIds: (record.linkedPropertyIds as string[] | null) ?? undefined,
    linkedDealIds: (record.linkedDealIds as string[] | null) ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildAuditSnapshot(record: Contact): Record<string, unknown> {
  return {
    name: record.name,
    email: record.email,
    phone: record.phone,
    type: record.type,
    status: record.status,
    moduleType: record.moduleType ?? null,
    brokerId: record.brokerId ?? null,
    createdByBrokerId: record.createdByBrokerId ?? null,
    linkedLeadId: record.linkedLeadId ?? null,
    company: record.company ?? null,
    position: record.position ?? null,
  };
}

async function resolveModuleType(
  inputModuleType: string | undefined,
  brokerId: string | undefined,
  linkedLeadId: string | undefined,
  user?: User | null,
  existingModuleType?: string | null
) {
  if (user?.role === 'broker') {
    const moduleType = normalizeBrokerDepartment(user.department);
    if (!moduleType) {
      throw new Error('Broker department is required before creating contacts');
    }
    return moduleType;
  }

  const normalizedInput = normalizeModuleScope(inputModuleType);
  if (normalizedInput) {
    return normalizedInput;
  }

  if (linkedLeadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: linkedLeadId },
      select: { id: true, moduleType: true },
    });
    if (!lead) {
      throw new Error('Linked lead not found');
    }
    const leadModule = normalizeModuleScope(lead.moduleType);
    if (leadModule) {
      return leadModule;
    }
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

  throw new Error('Contact module is required');
}

async function assertAssignedBroker(
  brokerId: string | undefined,
  moduleType: string | undefined
): Promise<void> {
  if (!brokerId) return;

  const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
  if (!broker) throw new Error('Assigned broker not found');
  if (broker.status === 'archived') throw new Error('Assigned broker is archived');
  assertAssignedBrokerMatchesDepartment(broker.department || broker.company, moduleType, 'contact');
}

export class ContactService {
  async getAllContacts(
    filters?: {
      type?: string;
      status?: string;
      brokerId?: string;
      moduleType?: string;
      page?: number;
      limit?: number;
    },
    options?: { user?: User | null }
  ): Promise<PaginatedResponse<Contact>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const where: any = {};

    if (filters?.type) where.type = filters.type;
    if (filters?.status) where.status = filters.status;
    if (filters?.brokerId) where.brokerId = filters.brokerId;
    if (filters?.moduleType) where.moduleType = filters.moduleType.toLowerCase();

    const scopedWhere = addDepartmentScope(where, options?.user, 'moduleType');

    const [total, contacts] = await prisma.$transaction([
      prisma.contact.count({ where: scopedWhere }),
      prisma.contact.findMany({
        where: scopedWhere,
        include: {
          broker: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: contacts.map(item => mapContact(item as NonNullable<ContactRecord>)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getContactById(id: string): Promise<Contact> {
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: {
        broker: { select: { id: true, name: true } },
      },
    });
    if (!contact) throw new Error('Contact not found');
    return mapContact(contact as NonNullable<ContactRecord>);
  }

  async createContact(data: CreateContactInput, options?: { user?: User | null }): Promise<Contact> {
    const effectiveBrokerId = getEffectiveBrokerId(options?.user);
    const brokerId = effectiveBrokerId || data.brokerId || undefined;
    const moduleType = await resolveModuleType(
      data.moduleType,
      brokerId,
      data.linkedLeadId,
      options?.user
    );

    assertBrokerCanAccessModule(options?.user, moduleType);
    await assertAssignedBroker(brokerId, moduleType);

    const created = await prisma.$transaction(async tx => {
      const contact = await tx.contact.create({
        data: {
          name: resolveContactName(data),
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email.trim().toLowerCase(),
          phone: data.phone?.trim() || '',
          type: data.type,
          status: data.status,
          linkedLeadId: data.linkedLeadId,
          company: data.company,
          position: data.position,
          notes: data.notes,
          moduleType,
          brokerId: brokerId || null,
          createdByBrokerId: effectiveBrokerId || null,
          linkedPropertyIds: data.linkedPropertyIds,
          linkedDealIds: data.linkedDealIds,
        },
        include: {
          broker: { select: { id: true, name: true } },
        },
      });

      const mapped = mapContact(contact as NonNullable<ContactRecord>);
      await auditLogService.recordWithClient(tx, {
        action: 'contact_created',
        entityType: 'contact',
        entityId: contact.id,
        description: `Contact "${contact.name}" created`,
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
          linkedLeadId: data.linkedLeadId || null,
        },
        notification: {
          title: 'Contact Created',
          message: `Contact "${contact.name}" created`,
          type: 'contact_created',
          payload: {
            contactId: contact.id,
            brokerId: brokerId || null,
            moduleType,
          },
        },
      });

      return mapped;
    });

    return created;
  }

  async updateContact(
    id: string,
    data: UpdateContactInput,
    options?: { user?: User | null }
  ): Promise<Contact> {
    const existing = await prisma.contact.findUnique({
      where: { id },
      include: {
        broker: { select: { id: true, name: true } },
      },
    });
    if (!existing) throw new Error('Contact not found');

    const effectiveBrokerId = getEffectiveBrokerId(options?.user);
    const brokerId = effectiveBrokerId || data.brokerId || existing.brokerId || undefined;
    const moduleType = await resolveModuleType(
      data.moduleType,
      brokerId,
      data.linkedLeadId || existing.linkedLeadId || undefined,
      options?.user,
      existing.moduleType
    );

    assertBrokerCanAccessModule(options?.user, moduleType);
    await assertAssignedBroker(brokerId, moduleType);

    const existingMapped = mapContact(existing as NonNullable<ContactRecord>);
    const updated = await prisma.$transaction(async tx => {
      const contact = await tx.contact.update({
        where: { id },
        data: {
          name: resolveContactName({ ...existing, ...data }),
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email ? data.email.trim().toLowerCase() : undefined,
          phone: data.phone !== undefined ? data.phone.trim() : undefined,
          type: data.type,
          status: data.status,
          linkedLeadId: data.linkedLeadId,
          company: data.company,
          position: data.position,
          notes: data.notes,
          moduleType,
          brokerId: brokerId || null,
          createdByBrokerId: existing.createdByBrokerId || effectiveBrokerId || null,
          linkedPropertyIds: data.linkedPropertyIds,
          linkedDealIds: data.linkedDealIds,
        },
        include: {
          broker: { select: { id: true, name: true } },
        },
      });

      const mapped = mapContact(contact as NonNullable<ContactRecord>);
      await auditLogService.recordWithClient(tx, {
        action:
          String(existing.status || '').trim() !== String(contact.status || '').trim()
            ? 'contact_status_changed'
            : 'contact_updated',
        entityType: 'contact',
        entityId: contact.id,
        description: `Contact "${contact.name}" updated`,
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
          linkedLeadId: contact.linkedLeadId || null,
        },
        notification: {
          title: 'Contact Updated',
          message: `Contact "${contact.name}" updated`,
          type: 'contact_updated',
          payload: {
            contactId: contact.id,
            brokerId: brokerId || existing.brokerId || null,
            moduleType,
          },
        },
      });

      return mapped;
    });

    return updated;
  }

  async deleteContact(id: string, options?: { user?: User | null }): Promise<void> {
    const existing = await prisma.contact.findUnique({
      where: { id },
      include: {
        broker: { select: { id: true, name: true } },
      },
    });
    if (!existing) throw new Error('Contact not found');

    const existingMapped = mapContact(existing as NonNullable<ContactRecord>);
    await prisma.$transaction(async tx => {
      await tx.contact.delete({ where: { id } });

      await auditLogService.recordWithClient(tx, {
        action: 'contact_deleted',
        entityType: 'contact',
        entityId: id,
        description: `Contact "${existing.name}" deleted`,
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
          linkedLeadId: existing.linkedLeadId || null,
        },
        notification: {
          title: 'Contact Deleted',
          message: `Contact "${existing.name}" deleted`,
          type: 'contact_deleted',
          payload: {
            contactId: id,
            brokerId: existing.brokerId || null,
            moduleType: existing.moduleType || null,
          },
        },
      });
    });
  }

  async getContactsByType(type: string, options?: { user?: User | null }): Promise<Contact[]> {
    const where = addDepartmentScope({ type }, options?.user, 'moduleType');
    const contacts = await prisma.contact.findMany({
      where,
      include: { broker: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return contacts.map(item => mapContact(item as NonNullable<ContactRecord>));
  }
}

export const contactService = new ContactService();
