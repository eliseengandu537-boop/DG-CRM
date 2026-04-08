import { Broker, BrokerDepartment } from '@/types';
import { CreateBrokerInput, UpdateBrokerInput } from '@/validators';
import { generateRandomString, hashPassword, verifyPassword } from '@/helpers';
import { emailService } from '@/services/emailService';
import { auditLogService } from '@/services/auditLogService';
import { prisma } from '@/lib/prisma';
import { deleteRefreshTokenHash } from '@/lib/refreshTokenStore';
import { departmentLabel, normalizeBrokerDepartment } from '@/lib/departmentAccess';
import { User } from '@/types';

const DEFAULT_BROKER_PHONE = '0000000000';
const BILLING_QUALIFYING_STATUSES = ['CLOSED', 'WON', 'AWAITING_PAYMENT'] as const;
const WIP_DEAL_STATUSES = ['LOI', 'OTP', 'OTL', 'LEASE_AGREEMENT', 'SALE_AGREEMENT'] as const;

export interface CreateBrokerResult {
  broker: Broker;
  passwordSent: boolean;
  passwordError?: string;
  temporaryPassword?: string;
}

export interface GenerateBrokerPasswordResult {
  passwordSent: boolean;
  passwordError?: string;
  temporaryPassword?: string;
}

export interface BrokerWorkloadSummary {
  leadsCount: number;
  dealsCount: number;
  forecastDealsCount: number;
  wipDealsCount: number;
}

export interface ArchivedBrokerRecord {
  broker: Broker;
  workload: BrokerWorkloadSummary;
}

type BrokerRecord = Awaited<ReturnType<typeof prisma.broker.findUnique>>;
type BrokerBillingMetrics = Pick<Broker, 'currentBilling' | 'progressPercentage'>;
type BrokerBillingSeed = {
  id: string;
  billingTarget?: number | null;
};

type BillingDealRecord = {
  id: string;
  brokerId: string;
  value: number;
  commissionPercent: number;
  brokerCommission: number;
};

type BillingForecastRecord = {
  dealId: string | null;
  commissionRate: number;
  commissionPercent: number;
  brokerCommission: number;
  createdAt: Date;
  updatedAt: Date;
};

function roundMoney(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

function calculateProgressPercentage(currentBilling: number, billingTarget: number): number {
  if (billingTarget <= 0) return 0;
  return roundMoney((currentBilling / billingTarget) * 100);
}

function resolveBillingCommissionRate(params: {
  deal: BillingDealRecord;
  forecast?: BillingForecastRecord;
}): number {
  const { deal, forecast } = params;

  const forecastRate = Number(forecast?.commissionRate || 0);
  if (Number.isFinite(forecastRate) && forecastRate > 0) {
    return forecastRate;
  }

  const forecastPercent = Number(forecast?.commissionPercent || 0);
  if (Number.isFinite(forecastPercent) && forecastPercent > 0) {
    return forecastPercent / 100;
  }

  const dealPercent = Number(deal.commissionPercent || 0);
  if (Number.isFinite(dealPercent) && dealPercent > 0) {
    return dealPercent / 100;
  }

  const dealValue = Number(deal.value || 0);
  if (dealValue <= 0) {
    return 0;
  }

  const forecastBrokerCommission = Number(forecast?.brokerCommission || 0);
  if (Number.isFinite(forecastBrokerCommission) && forecastBrokerCommission > 0) {
    return forecastBrokerCommission / dealValue;
  }

  const storedBrokerCommission = Number(deal.brokerCommission || 0);
  if (Number.isFinite(storedBrokerCommission) && storedBrokerCommission > 0) {
    return storedBrokerCommission / dealValue;
  }

  return 0;
}

function mapBroker(
  record: NonNullable<BrokerRecord>,
  metrics?: BrokerBillingMetrics
): Broker {
  const departmentValue = record.department ?? record.company ?? undefined;
  const normalizedDepartment = normalizeBrokerDepartment(departmentValue);
  const billingTarget = Number(record.billingTarget || 0);
  const currentBilling = roundMoney(Number(metrics?.currentBilling || 0));
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    phone: record.phone,
    company: record.company ?? record.department ?? undefined,
    department: normalizedDepartment || undefined,
    billingTarget,
    currentBilling,
    progressPercentage:
      metrics?.progressPercentage !== undefined
        ? roundMoney(Number(metrics.progressPercentage || 0))
        : calculateProgressPercentage(currentBilling, billingTarget),
    avatar: record.avatar ?? undefined,
    status: record.status as Broker['status'],
    archivedAt: record.archivedAt ?? undefined,
    archivedByUserId: record.archivedByUserId ?? undefined,
    archivedByName: record.archivedByName ?? undefined,
    archivedByEmail: record.archivedByEmail ?? undefined,
    pin: record.pin ?? undefined,
    pinExpiresAt: record.pinExpiresAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function isUnknownPrismaArgument(error: unknown, argumentName: string): boolean {
  const message = String((error as any)?.message || error || '');
  return message.includes(`Unknown argument \`${argumentName}\``);
}

export class BrokerService {
  private brokerProfileSyncInFlight: Promise<void> | null = null;

  private syncBrokerProfilesForBrokerUsersInBackground(): void {
    if (this.brokerProfileSyncInFlight) return;

    this.brokerProfileSyncInFlight = this.syncBrokerProfilesForBrokerUsers()
      .catch(error => {
        console.warn('Broker profile sync failed in background:', error);
      })
      .finally(() => {
        this.brokerProfileSyncInFlight = null;
      });
  }

  async getAllBrokers(options?: { includeArchived?: boolean }): Promise<Broker[]> {
    this.syncBrokerProfilesForBrokerUsersInBackground();
    const where = options?.includeArchived
      ? { status: { not: 'deleted' } }
      : { status: { notIn: ['archived', 'deleted'] } };
    const brokers = await prisma.broker.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const metricsByBrokerId = await this.getBillingMetricsByBrokerIds(
      brokers.map(broker => ({
        id: broker.id,
        billingTarget: broker.billingTarget,
      }))
    );

    return brokers.map(broker => mapBroker(broker, metricsByBrokerId.get(broker.id)));
  }

  async getArchivedBrokers(): Promise<ArchivedBrokerRecord[]> {
    let archived: any[] = [];
    try {
      archived = await prisma.broker.findMany({
        where: { status: 'archived' },
        orderBy: [{ archivedAt: 'desc' }, { updatedAt: 'desc' }],
        include: {
          _count: {
            select: {
              leads: true,
              deals: true,
              forecastDeals: true,
            },
          },
        },
      });
    } catch (error) {
      if (!isUnknownPrismaArgument(error, 'archivedAt')) {
        throw error;
      }

      // Compatibility fallback when Prisma client is still on the older schema.
      archived = await prisma.broker.findMany({
        where: { status: 'archived' },
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: {
              leads: true,
              deals: true,
              forecastDeals: true,
            },
          },
        },
      });
    }

    if (archived.length === 0) {
      return [];
    }

    const metricsByBrokerId = await this.getBillingMetricsByBrokerIds(
      archived.map(record => ({
        id: record.id,
        billingTarget: record.billingTarget,
      }))
    );

    const rows = await Promise.all(
      archived.map(async record => {
        const wipDealsCount = await prisma.deal.count({
          where: {
            brokerId: record.id,
            status: { in: [...WIP_DEAL_STATUSES] },
          },
        });

        return {
          broker: mapBroker(
            record as NonNullable<BrokerRecord>,
            metricsByBrokerId.get(record.id)
          ),
          workload: {
            leadsCount: record._count.leads,
            dealsCount: record._count.deals,
            forecastDealsCount: record._count.forecastDeals,
            wipDealsCount,
          },
        };
      })
    );

    return rows;
  }

  async getBrokerById(id: string): Promise<Broker> {
    const broker = await prisma.broker.findUnique({ where: { id } });
    if (!broker) throw new Error('Broker not found');
    const metricsByBrokerId = await this.getBillingMetricsByBrokerIds([
      { id: broker.id, billingTarget: broker.billingTarget },
    ]);
    return mapBroker(broker, metricsByBrokerId.get(broker.id));
  }

  async getBrokerByEmail(email: string): Promise<Broker | null> {
    const normalized = email.trim().toLowerCase();
    const broker = await prisma.broker.findUnique({ where: { email: normalized } });
    if (!broker) return null;
    const metricsByBrokerId = await this.getBillingMetricsByBrokerIds([
      { id: broker.id, billingTarget: broker.billingTarget },
    ]);
    return mapBroker(broker, metricsByBrokerId.get(broker.id));
  }

  async createBroker(data: CreateBrokerInput, options?: { user?: User }): Promise<CreateBrokerResult> {
    const normalizedEmail = data.email.trim().toLowerCase();
    const normalizedAvatar = data.avatar?.trim() || undefined;
    const normalizedDepartment = this.normalizeBrokerDepartment(data.department || data.company);
    const normalizedCompany = normalizedDepartment || data.company?.trim().toLowerCase() || undefined;
    const billingTarget = Number.isFinite(Number(data.billingTarget)) ? Number(data.billingTarget) : 0;
    const temporaryPassword = this.generateTemporaryPassword();
    const hashedPassword = await hashPassword(temporaryPassword);

    const brokerResult = await prisma.$transaction(async tx => {
      const existingUser = await tx.user.findUnique({ where: { email: normalizedEmail } });
      const existingBroker = await tx.broker.findUnique({
        where: { email: normalizedEmail },
        select: { status: true },
      });
      const canReuseArchivedViewer =
        existingUser?.role === 'viewer' && existingBroker?.status === 'archived';
      const isPrivilegedUser =
        existingUser?.role === 'admin' || existingUser?.role === 'manager';

      if (existingUser && existingUser.role !== 'broker' && !canReuseArchivedViewer && !isPrivilegedUser) {
        throw new Error('A non-broker account already exists with this email.');
      }

      const upsertedBroker = await tx.broker.upsert({
        where: { email: normalizedEmail },
        create: {
          name: data.name,
          email: normalizedEmail,
          phone: data.phone,
          company: normalizedCompany,
          department: normalizedDepartment,
          billingTarget,
          avatar: normalizedAvatar,
          status: data.status,
        },
        update: {
          name: data.name,
          phone: data.phone,
          company: normalizedCompany,
          department: normalizedDepartment,
          billingTarget,
          avatar: normalizedAvatar,
          status: data.status,
        },
      });

      // Preserve existing admin/manager role; only force 'broker' role for new or viewer users
      const preserveRole = existingUser?.role === 'admin' || existingUser?.role === 'manager';
      const upsertedUser = await tx.user.upsert({
        where: { email: normalizedEmail },
        create: {
          email: normalizedEmail,
          password: hashedPassword,
          name: data.name,
          role: 'broker',
        },
        update: {
          name: data.name,
          ...(preserveRole ? {} : { password: hashedPassword, role: 'broker' }),
        },
      });

      await auditLogService.recordWithClient(tx, {
        action: existingBroker ? 'broker_updated' : 'broker_created',
        entityType: 'broker',
        entityId: upsertedBroker.id,
        actorUserId: options?.user?.id || null,
        actorName: options?.user?.name || null,
        actorEmail: options?.user?.email || null,
        actorRole: options?.user?.role || null,
        metadata: {
          department: normalizedDepartment,
          billingTarget,
          status: data.status,
        },
      });

      return {
        broker: upsertedBroker,
        userId: upsertedUser.id,
        userExisted: Boolean(existingUser),
        brokerExisted: Boolean(existingBroker),
      };
    });

    try {
      await emailService.sendBrokerPasswordEmail({
        brokerEmail: brokerResult.broker.email,
        brokerName: brokerResult.broker.name,
        password: temporaryPassword,
      });
      const metricsByBrokerId = await this.getBillingMetricsByBrokerIds([
        {
          id: brokerResult.broker.id,
          billingTarget: brokerResult.broker.billingTarget,
        },
      ]);
      return {
        broker: mapBroker(
          brokerResult.broker,
          metricsByBrokerId.get(brokerResult.broker.id)
        ),
        passwordSent: true,
        temporaryPassword: process.env.NODE_ENV === 'production' ? undefined : temporaryPassword,
      };
    } catch (error: any) {
      const errorMessage = String(error?.message || 'unknown error');
      console.warn(
        `Password email failed for ${brokerResult.broker.email}. Broker will still be created: ${errorMessage}`
      );

      const metricsByBrokerId = await this.getBillingMetricsByBrokerIds([
        {
          id: brokerResult.broker.id,
          billingTarget: brokerResult.broker.billingTarget,
        },
      ]).catch(() => new Map());

      return {
        broker: mapBroker(
          brokerResult.broker,
          metricsByBrokerId.get(brokerResult.broker.id)
        ),
        passwordSent: false,
        passwordError: errorMessage,
        temporaryPassword,
      };
    }
  }

  async updateBroker(id: string, data: UpdateBrokerInput, options?: { user?: User }): Promise<Broker> {
    const current = await prisma.broker.findUnique({ where: { id } });
    if (!current) throw new Error('Broker not found');

    if (current.status === 'archived') {
      throw new Error('Archived broker records are read-only.');
    }

    const nextEmail = data.email?.trim().toLowerCase();
    const nextDepartment = this.normalizeBrokerDepartment(
      data.department || data.company || current.department || current.company
    );
    const nextCompany = nextDepartment || data.company?.trim().toLowerCase() || current.company || undefined;
    const nextBillingTarget =
      data.billingTarget !== undefined && Number.isFinite(Number(data.billingTarget))
        ? Number(data.billingTarget)
        : Number(current.billingTarget || 0);
    if (nextEmail && nextEmail !== current.email) {
      const userWithTargetEmail = await prisma.user.findUnique({ where: { email: nextEmail } });
      if (userWithTargetEmail && userWithTargetEmail.role !== 'broker' &&
          userWithTargetEmail.role !== 'admin' && userWithTargetEmail.role !== 'manager') {
        throw new Error('A non-broker account already exists with this email.');
      }
    }

    const billingTargetChanged = Math.abs(Number(current.billingTarget || 0) - nextBillingTarget) > 0.0001;
    const departmentChanged =
      String(current.department || current.company || '').trim().toLowerCase() !==
      String(nextDepartment || nextCompany || '').trim().toLowerCase();

    const updated = await prisma.$transaction(async tx => {
      const broker = await tx.broker.update({
        where: { id },
        data: {
          name: data.name,
          email: nextEmail,
          phone: data.phone,
          company: nextCompany,
          department: nextDepartment,
          billingTarget: nextBillingTarget,
          avatar: data.avatar === undefined ? undefined : data.avatar.trim() || null,
          status: data.status,
          },
        });

      if (billingTargetChanged || departmentChanged) {
        await auditLogService.recordWithClient(tx, {
          action: billingTargetChanged ? 'billing_target_updated' : 'broker_updated',
          entityType: 'broker',
          entityId: broker.id,
          actorUserId: options?.user?.id || null,
          actorName: options?.user?.name || null,
          actorEmail: options?.user?.email || null,
          actorRole: options?.user?.role || null,
          metadata: {
            previousBillingTarget: Number(current.billingTarget || 0),
            billingTarget: nextBillingTarget,
            previousDepartment: current.department || current.company || null,
            department: nextDepartment || nextCompany || null,
            email: broker.email,
          },
        });
      }

      const existingUser = await tx.user.findUnique({
        where: { email: current.email.trim().toLowerCase() },
      });

      if (existingUser) {
        const keepRole = existingUser.role === 'admin' || existingUser.role === 'manager';
        await tx.user.update({
          where: { id: existingUser.id },
          data: {
            email: nextEmail ?? existingUser.email,
            name: data.name ?? broker.name,
            ...(keepRole ? {} : { role: 'broker' }),
          },
        });
      }

      return broker;
    });

    const metricsByBrokerId = await this.getBillingMetricsByBrokerIds([
      { id: updated.id, billingTarget: updated.billingTarget },
    ]);

    return mapBroker(updated, metricsByBrokerId.get(updated.id));
  }

  // Keep historical data intact by archiving broker profile and removing login access.
  async deleteBroker(
    id: string,
    archivedBy?: { userId?: string; name?: string; email?: string },
    options?: { permanent?: boolean; actorRole?: User['role'] }
  ): Promise<void> {
    const broker = await prisma.broker.findUnique({ where: { id } });
    if (!broker) throw new Error('Broker not found');

    if (options?.permanent) {
      if (options.actorRole !== 'admin') {
        throw new Error('Only admins can permanently delete archived brokers.');
      }

      if (broker.status !== 'archived') {
        throw new Error('Only archived brokers can be permanently deleted.');
      }

      const deletedUserIds: string[] = [];

      await prisma.$transaction(async tx => {
        const brokerUsers = await tx.user.findMany({
          where: {
            email: broker.email.trim().toLowerCase(),
            role: { in: ['broker', 'viewer'] },
          },
          select: { id: true },
        });

        deletedUserIds.push(...brokerUsers.map(user => user.id));

        if (deletedUserIds.length > 0) {
          await tx.user.deleteMany({
            where: { id: { in: deletedUserIds } },
          });
        }

        await tx.broker.delete({
          where: { id },
        });

        await auditLogService.recordWithClient(tx, {
          action: 'broker_deleted_permanently',
          entityType: 'broker',
          entityId: id,
          actorUserId: archivedBy?.userId || null,
          actorName: archivedBy?.name || null,
          actorEmail: archivedBy?.email || null,
          actorRole: options.actorRole || null,
          metadata: {
            deletedAt: new Date().toISOString(),
            previousEmail: broker.email,
            previousName: broker.name,
          },
        });
      });

      await Promise.all(
        deletedUserIds.map(async userId => {
          try {
            await deleteRefreshTokenHash(userId);
          } catch (error) {
            console.warn(`Failed to revoke refresh token for removed broker user ${userId}`);
          }
        })
      );

      return;
    }

    if (broker.status === 'archived') {
      return;
    }

    const deletedUserIds: string[] = [];
    const archivedAt = new Date();

    await prisma.$transaction(async tx => {
      const brokerUsers = await tx.user.findMany({
        where: {
          email: broker.email.trim().toLowerCase(),
          role: { in: ['broker', 'viewer'] },
        },
        select: { id: true },
      });

      deletedUserIds.push(...brokerUsers.map(user => user.id));

      try {
        await tx.broker.update({
          where: { id },
          data: {
            status: 'archived',
            archivedAt,
            archivedByUserId: archivedBy?.userId || null,
            archivedByName: archivedBy?.name || null,
            archivedByEmail: archivedBy?.email?.trim().toLowerCase() || null,
            pin: null,
            pinExpiresAt: null,
          },
        });
      } catch (error) {
        if (
          !isUnknownPrismaArgument(error, 'archivedAt') &&
          !isUnknownPrismaArgument(error, 'archivedByUserId') &&
          !isUnknownPrismaArgument(error, 'archivedByName') &&
          !isUnknownPrismaArgument(error, 'archivedByEmail')
        ) {
          throw error;
        }

        // Compatibility fallback when Prisma client is still on the older schema.
        await tx.broker.update({
          where: { id },
          data: {
            status: 'archived',
            pin: null,
            pinExpiresAt: null,
          },
        });
      }

      if (deletedUserIds.length > 0) {
        await tx.user.deleteMany({
          where: { id: { in: deletedUserIds } },
        });
      }
    });

    await Promise.all(
      deletedUserIds.map(async userId => {
        try {
          await deleteRefreshTokenHash(userId);
        } catch (error) {
          console.warn(`Failed to revoke refresh token for removed broker user ${userId}`);
        }
      })
    );
  }

  // Permanently removes an archived broker from the archived list while preserving linked history.
  async purgeArchivedBroker(
    id: string,
    deletedBy?: { userId?: string; name?: string; email?: string; role?: string }
  ): Promise<void> {
    const broker = await prisma.broker.findUnique({ where: { id } });
    if (!broker) throw new Error('Broker not found');
    if (broker.status !== 'archived') {
      throw new Error('Only archived brokers can be permanently deleted.');
    }

    const previousEmail = broker.email.trim().toLowerCase();
    const deletedAt = new Date();
    const anonymizedEmail = `deleted+${broker.id.toLowerCase()}@archived.local`;
    const anonymizedName = `Deleted Broker (${broker.id.slice(-6)})`;
    const removedUserIds: string[] = [];

    await prisma.$transaction(async tx => {
      const brokerUsers = await tx.user.findMany({
        where: {
          email: previousEmail,
          role: { in: ['broker', 'viewer'] },
        },
        select: { id: true },
      });

      removedUserIds.push(...brokerUsers.map(user => user.id));

      await tx.broker.update({
        where: { id },
        data: {
          status: 'deleted',
          name: anonymizedName,
          email: anonymizedEmail,
          phone: DEFAULT_BROKER_PHONE,
          company: null,
          department: null,
          avatar: null,
          billingTarget: 0,
          pin: null,
          pinExpiresAt: null,
          archivedAt: deletedAt,
          archivedByUserId: deletedBy?.userId || broker.archivedByUserId || null,
          archivedByName: deletedBy?.name || broker.archivedByName || null,
          archivedByEmail:
            deletedBy?.email?.trim().toLowerCase() || broker.archivedByEmail || null,
        },
      });

      if (removedUserIds.length > 0) {
        await tx.user.deleteMany({
          where: { id: { in: removedUserIds } },
        });
      }

      await auditLogService.recordWithClient(tx, {
        action: 'broker_purged',
        entityType: 'broker',
        entityId: id,
        actorUserId: deletedBy?.userId || null,
        actorName: deletedBy?.name || null,
        actorEmail: deletedBy?.email || null,
        actorRole: deletedBy?.role || null,
        metadata: {
          previousEmail,
          anonymizedEmail,
          deletedAt: deletedAt.toISOString(),
        },
      });
    });

    await Promise.all(
      removedUserIds.map(async userId => {
        try {
          await deleteRefreshTokenHash(userId);
        } catch (error) {
          console.warn(`Failed to revoke refresh token for removed broker user ${userId}`);
        }
      })
    );
  }

  async getBrokerByEmail(email: string): Promise<Broker | undefined> {
    const broker = await prisma.broker.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!broker) return undefined;

    const metricsByBrokerId = await this.getBillingMetricsByBrokerIds([
      { id: broker.id, billingTarget: broker.billingTarget },
    ]);

    return mapBroker(broker, metricsByBrokerId.get(broker.id));
  }

  private generateTemporaryPassword(): string {
    return generateRandomString(10);
  }

  private async setBrokerLoginPassword(params: {
    email: string;
    name: string;
    temporaryPassword: string;
    allowCreateUser: boolean;
  }): Promise<void> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const brokerProfile = await prisma.broker.findUnique({ where: { email: normalizedEmail } });
    if (brokerProfile?.status === 'archived') {
      throw new Error('Archived brokers cannot receive login passwords.');
    }

    const hashed = await hashPassword(params.temporaryPassword);
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    const canReuseViewer = existing?.role === 'viewer' && !!brokerProfile;

    if (existing && existing.role !== 'broker' && !canReuseViewer) {
      throw new Error('A non-broker account already exists with this email.');
    }

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          password: hashed,
          name: params.name,
          role: 'broker',
        },
      });
      return;
    }

    if (!params.allowCreateUser) {
      throw new Error('Broker login account not found.');
    }

    await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashed,
        name: params.name,
        role: 'broker',
      },
    });
  }

  async generateAndSendPassword(brokerId: string): Promise<GenerateBrokerPasswordResult> {
    const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
    if (!broker) throw new Error('Broker not found');
    if (broker.status === 'archived') {
      throw new Error('Archived brokers cannot receive login passwords.');
    }

    const temporaryPassword = this.generateTemporaryPassword();
    await this.setBrokerLoginPassword({
      email: broker.email,
      name: broker.name,
      temporaryPassword,
      allowCreateUser: true,
    });

    try {
      await emailService.sendBrokerPasswordEmail({
        brokerEmail: broker.email,
        brokerName: broker.name,
        password: temporaryPassword,
      });
      return {
        passwordSent: true,
        temporaryPassword:
          process.env.NODE_ENV === 'production' ? undefined : temporaryPassword,
      };
    } catch (error: any) {
      const errorMessage = String(error?.message || 'unknown error');
      console.warn(`Password generated but email failed for ${broker.email}: ${errorMessage}`);
      return {
        passwordSent: false,
        passwordError: errorMessage,
        temporaryPassword:
          process.env.NODE_ENV === 'production' ? undefined : temporaryPassword,
      };
    }
  }

  // Kept for backward compatibility with legacy /validate-pin route.
  async validateBrokerPin(brokerId: string, password: string): Promise<boolean> {
    return this.validateBrokerPassword(brokerId, password);
  }

  async validateBrokerPassword(brokerId: string, password: string): Promise<boolean> {
    const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
    if (!broker) return false;
    if (broker.status === 'archived') return false;
    const user = await prisma.user.findUnique({
      where: { email: broker.email.trim().toLowerCase() },
    });
    if (!user) return false;
    return verifyPassword(password, user.password);
  }

  async getBrokerStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    archived: number;
  }> {
    this.syncBrokerProfilesForBrokerUsersInBackground();
    const [total, active, inactive, archived] = await Promise.all([
      prisma.broker.count({ where: { status: { not: 'deleted' } } }),
      prisma.broker.count({ where: { status: 'active' } }),
      prisma.broker.count({ where: { status: 'inactive' } }),
      prisma.broker.count({ where: { status: 'archived' } }),
    ]);

    return {
      total,
      active,
      inactive,
      archived,
    };
  }

  private async syncBrokerProfilesForBrokerUsers(): Promise<void> {
    const brokerUsers = await prisma.user.findMany({
      where: { role: 'broker' },
      select: { email: true, name: true },
    });

    if (brokerUsers.length === 0) return;

    const emails = brokerUsers.map(user => user.email.trim().toLowerCase());
    const existingProfiles = await prisma.broker.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    });
    const existingByEmail = new Set(existingProfiles.map(profile => profile.email.toLowerCase()));

    for (const user of brokerUsers) {
      const email = user.email.trim().toLowerCase();
      if (existingByEmail.has(email)) continue;
      try {
        await prisma.broker.create({
          data: {
            name: user.name || email.split('@')[0],
            email,
            phone: DEFAULT_BROKER_PHONE,
            company: 'sales',
            department: 'sales',
            billingTarget: 0,
            status: 'active',
          },
        });
      } catch (error) {
        // Safe to ignore duplicate races; this path is a data-repair utility.
      }
    }
  }

  private normalizeBrokerDepartment(value?: string | null): BrokerDepartment | undefined {
    const raw = String(value || '').trim();
    if (!raw) return undefined;

    const normalized = normalizeBrokerDepartment(raw);
    if (!normalized) {
      throw new Error('Broker department must be SALES or LEASING');
    }

    return normalized;
  }

  private async getBillingMetricsByBrokerIds(
    brokers: BrokerBillingSeed[]
  ): Promise<Map<string, BrokerBillingMetrics>> {
    const uniqueBrokers = brokers.filter(
      (broker, index, records) =>
        broker.id &&
        records.findIndex(candidate => candidate.id === broker.id) === index
    );

    if (uniqueBrokers.length === 0) {
      return new Map();
    }

    const brokerIds = uniqueBrokers.map(broker => broker.id);
    const qualifyingDeals = (await prisma.deal.findMany({
      where: {
        brokerId: { in: brokerIds },
        status: { in: [...BILLING_QUALIFYING_STATUSES] },
      },
      select: {
        id: true,
        brokerId: true,
        value: true,
        commissionPercent: true,
        brokerCommission: true,
      },
    })) as BillingDealRecord[];

    const latestForecastByDealId = new Map<string, BillingForecastRecord>();
    if (qualifyingDeals.length > 0) {
      const dealIds = qualifyingDeals.map(deal => deal.id);
      const forecasts = (await prisma.forecastDeal.findMany({
        where: {
          dealId: { in: dealIds },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          dealId: true,
          commissionRate: true,
          commissionPercent: true,
          brokerCommission: true,
          createdAt: true,
          updatedAt: true,
        },
      })) as BillingForecastRecord[];

      for (const forecast of forecasts) {
        const dealId = String(forecast.dealId || '').trim();
        if (!dealId || latestForecastByDealId.has(dealId)) continue;
        latestForecastByDealId.set(dealId, forecast);
      }
    }

    const billingByBrokerId = new Map<string, number>();
    for (const deal of qualifyingDeals) {
      const brokerId = String(deal.brokerId || '').trim();
      if (!brokerId) continue;

      const dealValue = Number(deal.value || 0);
      if (!Number.isFinite(dealValue) || dealValue <= 0) continue;

      const commissionRate = resolveBillingCommissionRate({
        deal,
        forecast: latestForecastByDealId.get(deal.id),
      });
      if (!Number.isFinite(commissionRate) || commissionRate <= 0) continue;

      const commission = roundMoney(dealValue * commissionRate);
      if (commission <= 0) continue;

      const currentTotal = billingByBrokerId.get(brokerId) || 0;
      billingByBrokerId.set(brokerId, roundMoney(currentTotal + commission));
    }

    return new Map(
      uniqueBrokers.map(broker => {
        const billingTarget = roundMoney(Number(broker.billingTarget || 0));
        const currentBilling = billingByBrokerId.get(broker.id) || 0;

        return [
          broker.id,
          {
            currentBilling,
            progressPercentage: calculateProgressPercentage(currentBilling, billingTarget),
          },
        ];
      })
    );
  }
}

export const brokerService = new BrokerService();
