import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  normalizeLegalDocumentReference,
  resolveLegalDocumentReferenceId,
} from '@/lib/legalDocumentReferences';
import { logInfo, logWarn } from '@/lib/logger';

type PrismaLike = Prisma.TransactionClient | typeof prisma;

type IntegrityFix = {
  entity: string;
  recordId: string;
  field: string;
  previousValue: string | null;
  nextValue: string | null;
  reason: string;
};

type IntegrityIssue = {
  entity: string;
  recordId: string;
  field: string;
  value: string | null;
  reason: string;
};

type IntegrityReport = {
  fixes: IntegrityFix[];
  fatalIssues: IntegrityIssue[];
};

function normalizeRef(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function toIdSet(rows: Array<{ id: string }>): Set<string> {
  return new Set(rows.map(row => row.id));
}

function collectDanglingIssues(
  entity: string,
  field: string,
  rows: Array<Record<string, unknown>>,
  validIds: Set<string>,
  reason: string
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  for (const row of rows) {
    const recordId = String(row.id || '').trim();
    const value = normalizeRef(row[field]);
    if (!recordId || !value || validIds.has(value)) {
      continue;
    }

    issues.push({
      entity,
      recordId,
      field,
      value,
      reason,
    });
  }

  return issues;
}

async function applyNullFix(
  label: string,
  invalidRows: IntegrityIssue[],
  field: string,
  update: (ids: string[]) => Promise<void>
): Promise<IntegrityFix[]> {
  if (invalidRows.length === 0) {
    return [];
  }

  await update(invalidRows.map(row => row.recordId));
  return invalidRows.map(row => ({
    entity: row.entity,
    recordId: row.recordId,
    field,
    previousValue: row.value,
    nextValue: null,
    reason: label,
  }));
}

async function normalizeForecastLegalDocuments(tx: PrismaLike): Promise<IntegrityFix[]> {
  const forecastDeals = await tx.forecastDeal.findMany({
    where: {
      NOT: [{ legalDocument: null }, { legalDocument: '' }],
    },
    select: {
      id: true,
      legalDocument: true,
    },
  });

  const fixes: IntegrityFix[] = [];

  for (const forecastDeal of forecastDeals) {
    const reference = normalizeLegalDocumentReference(forecastDeal.legalDocument);
    if (reference === null || reference === undefined) {
      continue;
    }

    const resolvedId = await resolveLegalDocumentReferenceId(tx, reference);
    if (!resolvedId) {
      await tx.forecastDeal.update({
        where: { id: forecastDeal.id },
        data: { legalDocument: null },
      });

      fixes.push({
        entity: 'ForecastDeal',
        recordId: forecastDeal.id,
        field: 'legalDocument',
        previousValue: reference,
        nextValue: null,
        reason: 'Cleared missing legal document reference',
      });
      continue;
    }

    if (resolvedId !== reference) {
      await tx.forecastDeal.update({
        where: { id: forecastDeal.id },
        data: { legalDocument: resolvedId },
      });

      fixes.push({
        entity: 'ForecastDeal',
        recordId: forecastDeal.id,
        field: 'legalDocument',
        previousValue: reference,
        nextValue: resolvedId,
        reason: 'Normalized legal document reference to document ID',
      });
    }
  }

  return fixes;
}

export async function ensureDatabaseConsistency(): Promise<IntegrityReport> {
  const report = await prisma.$transaction(async tx => {
    const [
      users,
      brokers,
      deals,
      forecastDeals,
      contacts,
      properties,
      legalDocuments,
      refreshTokens,
      leads,
      reminders,
      stockItems,
      notifications,
      auditLogs,
      dealStatusHistory,
      dealStatusDocuments,
    ] = await Promise.all([
      tx.user.findMany({ select: { id: true } }),
      tx.broker.findMany({ select: { id: true } }),
      tx.deal.findMany({
        select: {
          id: true,
          leadId: true,
          propertyId: true,
          brokerId: true,
          createdByBrokerId: true,
          legalDocumentId: true,
        },
      }),
      tx.forecastDeal.findMany({
        select: {
          id: true,
          dealId: true,
          brokerId: true,
          legalDocument: true,
        },
      }),
      tx.contact.findMany({
        select: {
          id: true,
          brokerId: true,
          createdByBrokerId: true,
        },
      }),
      tx.property.findMany({
        select: {
          id: true,
          brokerId: true,
          createdByBrokerId: true,
        },
      }),
      tx.legalDocument.findMany({ select: { id: true } }),
      tx.refreshToken.findMany({ select: { id: true, userId: true } }),
      tx.lead.findMany({
        select: {
          id: true,
          dealId: true,
          forecastDealId: true,
          contactId: true,
          brokerId: true,
          createdByBrokerId: true,
          propertyId: true,
          legalDocumentId: true,
        },
      }),
      tx.reminder.findMany({
        select: {
          id: true,
          dealId: true,
          brokerId: true,
        },
      }),
      tx.stockItem.findMany({
        select: {
          id: true,
          createdBy: true,
          assignedBrokerId: true,
        },
      }),
      tx.notification.findMany({
        select: {
          id: true,
          activityId: true,
          actorUserId: true,
        },
      }),
      tx.auditLog.findMany({
        select: {
          id: true,
          actorUserId: true,
        },
      }),
      tx.dealStatusHistory.findMany({
        select: {
          id: true,
          changedByUserId: true,
        },
      }),
      tx.dealStatusDocument.findMany({
        select: {
          id: true,
          dealId: true,
          legalDocumentId: true,
          linkedByUserId: true,
        },
      }),
    ]);

    const userIds = toIdSet(users);
    const brokerIds = toIdSet(brokers);
    const dealIds = toIdSet(deals.map(deal => ({ id: deal.id })));
    const forecastDealIds = toIdSet(forecastDeals.map(forecastDeal => ({ id: forecastDeal.id })));
    const contactIds = toIdSet(contacts.map(contact => ({ id: contact.id })));
    const propertyIds = toIdSet(properties.map(property => ({ id: property.id })));
    const legalDocumentIds = toIdSet(legalDocuments);
    const auditLogIds = toIdSet(auditLogs.map(auditLog => ({ id: auditLog.id })));
    const leadIds = toIdSet(leads.map(lead => ({ id: lead.id })));

    const fatalIssues: IntegrityIssue[] = [
      ...collectDanglingIssues(
        'Deal',
        'leadId',
        deals as Array<Record<string, unknown>>,
        leadIds,
        'Required lead reference is missing'
      ),
      ...collectDanglingIssues(
        'Deal',
        'propertyId',
        deals as Array<Record<string, unknown>>,
        propertyIds,
        'Required property reference is missing'
      ),
      ...collectDanglingIssues(
        'Deal',
        'brokerId',
        deals as Array<Record<string, unknown>>,
        brokerIds,
        'Required broker reference is missing'
      ),
      ...collectDanglingIssues(
        'ForecastDeal',
        'brokerId',
        forecastDeals as Array<Record<string, unknown>>,
        brokerIds,
        'Required broker reference is missing'
      ),
      ...collectDanglingIssues(
        'DealStatusDocument',
        'dealId',
        dealStatusDocuments as Array<Record<string, unknown>>,
        dealIds,
        'Required deal reference is missing'
      ),
      ...collectDanglingIssues(
        'DealStatusDocument',
        'legalDocumentId',
        dealStatusDocuments as Array<Record<string, unknown>>,
        legalDocumentIds,
        'Required legal document reference is missing'
      ),
    ];

    if (fatalIssues.length > 0) {
      return {
        fixes: [],
        fatalIssues,
      };
    }

    const fixes: IntegrityFix[] = [];

    fixes.push(
      ...(
        await Promise.all([
          applyNullFix(
            'Cleared missing lead legal document reference',
            collectDanglingIssues(
              'Lead',
              'legalDocumentId',
              leads as Array<Record<string, unknown>>,
              legalDocumentIds,
              'Optional legal document reference is missing'
            ),
            'legalDocumentId',
            ids => tx.lead.updateMany({ where: { id: { in: ids } }, data: { legalDocumentId: null } }).then(() => undefined)
          ),
          applyNullFix(
            'Cleared missing lead deal reference',
            collectDanglingIssues(
              'Lead',
              'dealId',
              leads as Array<Record<string, unknown>>,
              dealIds,
              'Optional deal reference is missing'
            ),
            'dealId',
            ids => tx.lead.updateMany({ where: { id: { in: ids } }, data: { dealId: null } }).then(() => undefined)
          ),
          applyNullFix(
            'Cleared missing lead forecast reference',
            collectDanglingIssues(
              'Lead',
              'forecastDealId',
              leads as Array<Record<string, unknown>>,
              forecastDealIds,
              'Optional forecast reference is missing'
            ),
            'forecastDealId',
            ids =>
              tx.lead.updateMany({ where: { id: { in: ids } }, data: { forecastDealId: null } }).then(
                () => undefined
              )
          ),
          applyNullFix(
            'Cleared missing lead contact reference',
            collectDanglingIssues(
              'Lead',
              'contactId',
              leads as Array<Record<string, unknown>>,
              contactIds,
              'Optional contact reference is missing'
            ),
            'contactId',
            ids =>
              tx.lead.updateMany({ where: { id: { in: ids } }, data: { contactId: null } }).then(
                () => undefined
              )
          ),
          applyNullFix(
            'Cleared missing lead broker reference',
            collectDanglingIssues(
              'Lead',
              'brokerId',
              leads as Array<Record<string, unknown>>,
              brokerIds,
              'Optional broker reference is missing'
            ),
            'brokerId',
            ids =>
              tx.lead.updateMany({ where: { id: { in: ids } }, data: { brokerId: null } }).then(
                () => undefined
              )
          ),
          applyNullFix(
            'Cleared missing lead creator broker reference',
            collectDanglingIssues(
              'Lead',
              'createdByBrokerId',
              leads as Array<Record<string, unknown>>,
              brokerIds,
              'Optional creator broker reference is missing'
            ),
            'createdByBrokerId',
            ids =>
              tx.lead.updateMany({
                where: { id: { in: ids } },
                data: { createdByBrokerId: null },
              }).then(() => undefined)
          ),
          applyNullFix(
            'Cleared missing lead property reference',
            collectDanglingIssues(
              'Lead',
              'propertyId',
              leads as Array<Record<string, unknown>>,
              propertyIds,
              'Optional property reference is missing'
            ),
            'propertyId',
            ids =>
              tx.lead.updateMany({ where: { id: { in: ids } }, data: { propertyId: null } }).then(
                () => undefined
              )
          ),
          applyNullFix(
            'Cleared missing deal legal document reference',
            collectDanglingIssues(
              'Deal',
              'legalDocumentId',
              deals as Array<Record<string, unknown>>,
              legalDocumentIds,
              'Optional legal document reference is missing'
            ),
            'legalDocumentId',
            ids =>
              tx.deal.updateMany({ where: { id: { in: ids } }, data: { legalDocumentId: null } }).then(
                () => undefined
              )
          ),
          applyNullFix(
            'Cleared missing deal creator broker reference',
            collectDanglingIssues(
              'Deal',
              'createdByBrokerId',
              deals as Array<Record<string, unknown>>,
              brokerIds,
              'Optional creator broker reference is missing'
            ),
            'createdByBrokerId',
            ids =>
              tx.deal.updateMany({
                where: { id: { in: ids } },
                data: { createdByBrokerId: null },
              }).then(() => undefined)
          ),
          applyNullFix(
            'Cleared missing forecast deal reference',
            collectDanglingIssues(
              'ForecastDeal',
              'dealId',
              forecastDeals as Array<Record<string, unknown>>,
              dealIds,
              'Optional deal reference is missing'
            ),
            'dealId',
            ids =>
              tx.forecastDeal.updateMany({ where: { id: { in: ids } }, data: { dealId: null } }).then(
                () => undefined
              )
          ),
          applyNullFix(
            'Cleared missing reminder deal reference',
            collectDanglingIssues(
              'Reminder',
              'dealId',
              reminders as Array<Record<string, unknown>>,
              dealIds,
              'Optional deal reference is missing'
            ),
            'dealId',
            ids =>
              tx.reminder.updateMany({ where: { id: { in: ids } }, data: { dealId: null } }).then(
                () => undefined
              )
          ),
          applyNullFix(
            'Cleared missing reminder broker reference',
            collectDanglingIssues(
              'Reminder',
              'brokerId',
              reminders as Array<Record<string, unknown>>,
              brokerIds,
              'Optional broker reference is missing'
            ),
            'brokerId',
            ids =>
              tx.reminder.updateMany({ where: { id: { in: ids } }, data: { brokerId: null } }).then(
                () => undefined
              )
          ),
          applyNullFix(
            'Cleared missing contact broker reference',
            collectDanglingIssues(
              'Contact',
              'brokerId',
              contacts as Array<Record<string, unknown>>,
              brokerIds,
              'Optional broker reference is missing'
            ),
            'brokerId',
            ids =>
              tx.contact.updateMany({ where: { id: { in: ids } }, data: { brokerId: null } }).then(
                () => undefined
              )
          ),
          applyNullFix(
            'Cleared missing contact creator broker reference',
            collectDanglingIssues(
              'Contact',
              'createdByBrokerId',
              contacts as Array<Record<string, unknown>>,
              brokerIds,
              'Optional creator broker reference is missing'
            ),
            'createdByBrokerId',
            ids =>
              tx.contact.updateMany({
                where: { id: { in: ids } },
                data: { createdByBrokerId: null },
              }).then(() => undefined)
          ),
          applyNullFix(
            'Cleared missing property broker reference',
            collectDanglingIssues(
              'Property',
              'brokerId',
              properties as Array<Record<string, unknown>>,
              brokerIds,
              'Optional broker reference is missing'
            ),
            'brokerId',
            ids =>
              tx.property.updateMany({ where: { id: { in: ids } }, data: { brokerId: null } }).then(
                () => undefined
              )
          ),
          applyNullFix(
            'Cleared missing property creator broker reference',
            collectDanglingIssues(
              'Property',
              'createdByBrokerId',
              properties as Array<Record<string, unknown>>,
              brokerIds,
              'Optional creator broker reference is missing'
            ),
            'createdByBrokerId',
            ids =>
              tx.property.updateMany({
                where: { id: { in: ids } },
                data: { createdByBrokerId: null },
              }).then(() => undefined)
          ),
          applyNullFix(
            'Deleted refresh tokens for missing users',
            collectDanglingIssues(
              'RefreshToken',
              'userId',
              refreshTokens as Array<Record<string, unknown>>,
              userIds,
              'Refresh token user reference is missing'
            ),
            'userId',
            ids =>
              tx.refreshToken.deleteMany({ where: { id: { in: ids } } }).then(() => undefined)
          ),
          applyNullFix(
            'Cleared missing stock-item creator reference',
            collectDanglingIssues(
              'StockItem',
              'createdBy',
              stockItems as Array<Record<string, unknown>>,
              brokerIds,
              'Optional creator broker reference is missing'
            ),
            'createdBy',
            ids =>
              tx.stockItem.updateMany({ where: { id: { in: ids } }, data: { createdBy: null } }).then(
                () => undefined
              )
          ),
          applyNullFix(
            'Cleared missing stock-item assigned broker reference',
            collectDanglingIssues(
              'StockItem',
              'assignedBrokerId',
              stockItems as Array<Record<string, unknown>>,
              brokerIds,
              'Optional assigned broker reference is missing'
            ),
            'assignedBrokerId',
            ids =>
              tx.stockItem.updateMany({
                where: { id: { in: ids } },
                data: { assignedBrokerId: null },
              }).then(() => undefined)
          ),
          applyNullFix(
            'Cleared missing notification activity reference',
            collectDanglingIssues(
              'Notification',
              'activityId',
              notifications as Array<Record<string, unknown>>,
              auditLogIds,
              'Optional activity reference is missing'
            ),
            'activityId',
            ids =>
              tx.notification.updateMany({
                where: { id: { in: ids } },
                data: { activityId: null },
              }).then(() => undefined)
          ),
          applyNullFix(
            'Cleared missing notification actor reference',
            collectDanglingIssues(
              'Notification',
              'actorUserId',
              notifications as Array<Record<string, unknown>>,
              userIds,
              'Optional actor user reference is missing'
            ),
            'actorUserId',
            ids =>
              tx.notification.updateMany({
                where: { id: { in: ids } },
                data: { actorUserId: null },
              }).then(() => undefined)
          ),
          applyNullFix(
            'Cleared missing audit-log actor reference',
            collectDanglingIssues(
              'AuditLog',
              'actorUserId',
              auditLogs as Array<Record<string, unknown>>,
              userIds,
              'Optional actor user reference is missing'
            ),
            'actorUserId',
            ids =>
              tx.auditLog.updateMany({
                where: { id: { in: ids } },
                data: { actorUserId: null },
              }).then(() => undefined)
          ),
          applyNullFix(
            'Cleared missing deal-status-history actor reference',
            collectDanglingIssues(
              'DealStatusHistory',
              'changedByUserId',
              dealStatusHistory as Array<Record<string, unknown>>,
              userIds,
              'Optional actor user reference is missing'
            ),
            'changedByUserId',
            ids =>
              tx.dealStatusHistory.updateMany({
                where: { id: { in: ids } },
                data: { changedByUserId: null },
              }).then(() => undefined)
          ),
          applyNullFix(
            'Cleared missing deal-status-document actor reference',
            collectDanglingIssues(
              'DealStatusDocument',
              'linkedByUserId',
              dealStatusDocuments as Array<Record<string, unknown>>,
              userIds,
              'Optional actor user reference is missing'
            ),
            'linkedByUserId',
            ids =>
              tx.dealStatusDocument.updateMany({
                where: { id: { in: ids } },
                data: { linkedByUserId: null },
              }).then(() => undefined)
          ),
        ])
      ).flat()
    );

    fixes.push(...(await normalizeForecastLegalDocuments(tx)));

    return {
      fixes,
      fatalIssues: [],
    };
  });

  if (report.fatalIssues.length > 0) {
    logWarn('Database consistency check found fatal issues', {
      fatalIssues: report.fatalIssues,
    });
    throw new Error(
      `Database consistency check failed: ${report.fatalIssues
        .map(issue => `${issue.entity}.${issue.field} (${issue.recordId})`)
        .join(', ')}`
    );
  }

  if (report.fixes.length > 0) {
    logInfo('Database consistency repairs applied', {
      fixes: report.fixes,
    });
  } else {
    logInfo('Database consistency check completed with no repairs needed');
  }

  return report;
}
