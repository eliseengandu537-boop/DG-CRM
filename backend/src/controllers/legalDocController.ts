import { Response } from 'express';
import { AuthRequest } from '@/types';
import { prisma } from '@/lib/prisma';
import { config } from '@/config';
import { resolveDealStatus, statusRequiresWorkflowDocument } from '@/lib/dealWorkflow';
import { upsertDealStatusDocumentWithClient } from '@/lib/dealWorkflowPersistence';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';
import { emitActivityNotification } from '@/lib/realtimeNotifications';
import { emailService } from '@/services/emailService';

// Legal-doc statuses that count as completed/approved (case-insensitive).
const LEGAL_DOC_TERMINAL_STATUSES = ['completed', 'approved', 'final'];

function isTerminalLegalDocStatus(status: unknown): boolean {
  return LEGAL_DOC_TERMINAL_STATUSES.includes(String(status || '').trim().toLowerCase());
}

// Resolves recipient admin email addresses: ADMIN_EMAIL plus any users with role 'admin'.
async function resolveAdminRecipients(): Promise<string[]> {
  const recipients = new Set<string>();
  const adminEmail = String(config.ADMIN_EMAIL || '').trim().toLowerCase();
  if (adminEmail) recipients.add(adminEmail);

  try {
    const adminUsers = await prisma.user.findMany({
      where: { role: 'admin' },
      select: { email: true },
    });
    for (const user of adminUsers) {
      const email = String(user.email || '').trim().toLowerCase();
      if (email) recipients.add(email);
    }
  } catch {
    // Best-effort - fall back to ADMIN_EMAIL only.
  }

  return [...recipients];
}

// Resolves the email/name of a legal-doc creator. `createdBy` may be a user id,
// broker id, an email, or a display name. Returns null when it can't be resolved.
async function resolveCreatorContact(
  createdBy: string
): Promise<{ email: string; name: string } | null> {
  const value = String(createdBy || '').trim();
  if (!value) return null;

  try {
    // Try as user id.
    const userById = await prisma.user.findUnique({
      where: { id: value },
      select: { email: true, name: true },
    });
    if (userById?.email) return { email: userById.email, name: userById.name };

    // Try as broker id.
    const brokerById = await prisma.broker.findUnique({
      where: { id: value },
      select: { email: true, name: true },
    });
    if (brokerById?.email) return { email: brokerById.email, name: brokerById.name };

    // Try as an email address.
    if (value.includes('@')) {
      const normalized = value.toLowerCase();
      const userByEmail = await prisma.user.findUnique({
        where: { email: normalized },
        select: { email: true, name: true },
      });
      if (userByEmail?.email) return { email: userByEmail.email, name: userByEmail.name };
      return { email: normalized, name: value };
    }

    // Try as a display name.
    const userByName = await prisma.user.findFirst({
      where: { name: value },
      select: { email: true, name: true },
    });
    if (userByName?.email) return { email: userByName.email, name: userByName.name };

    const brokerByName = await prisma.broker.findFirst({
      where: { name: value },
      select: { email: true, name: true },
    });
    if (brokerByName?.email) return { email: brokerByName.email, name: brokerByName.name };
  } catch {
    // Best-effort - resolution failed.
  }

  return null;
}

const ensureArray = (value: unknown) => (Array.isArray(value) ? value : []);
const ensureString = (value: unknown, fallback: string = '') =>
  typeof value === 'string' ? value : fallback;
const ensureNumber = (value: unknown, fallback: number = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const isTemporaryBlobPath = (value: string) => value.trim().toLowerCase().startsWith('blob:');
const normalizeDealTypeLabel = (value: unknown) => String(value || '').trim().toLowerCase();
const toDate = () => new Date().toISOString().split('T')[0];

type LegalDocRealtimeArgs = {
  action: 'created' | 'updated' | 'deleted' | 'linked';
  documentId: string;
  documentName: string;
  actor?: AuthRequest['user'] | null;
  brokerId?: string | null;
  visibilityScope?: 'shared' | 'private';
  payload?: Record<string, unknown>;
};

function emitLegalDocRealtime(args: LegalDocRealtimeArgs): void {
  const visibilityScope = args.visibilityScope || 'shared';
  const event = `legal-doc:${args.action}`;
  const timestamp = new Date().toISOString();

  try {
    emitScopedEvent({
      event,
      payload: {
        id: args.documentId,
        documentName: args.documentName,
        brokerId: args.brokerId || null,
        ...(args.payload || {}),
        timestamp,
      },
      brokerId: visibilityScope === 'private' ? args.brokerId || null : null,
      roles: visibilityScope === 'shared' ? ['broker'] : undefined,
      includePrivileged: true,
    });

    emitActivityNotification({
      action: `legal_document_${args.action}`,
      entityType: 'legal_document',
      entityId: args.documentId,
      entityName: args.documentName,
      brokerId: args.brokerId || null,
      actor: args.actor || null,
      visibilityScope,
      description:
        args.action === 'linked'
          ? 'Legal document linked to deal'
          : args.action === 'deleted'
          ? 'Legal document deleted'
          : args.action === 'updated'
          ? 'Legal document updated'
          : 'Legal document created',
      payload: args.payload,
    });

    emitDashboardRefresh({
      type: event,
      id: args.documentId,
      brokerId: args.brokerId || null,
    });
  } catch {
    console.warn('Realtime not initialized - skipping legal document emit');
  }
}

export class LegalDocController {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const includeFileData =
        String(req.query.includeFileData || '').trim().toLowerCase() === 'true';

      const records = await prisma.legalDocument.findMany({
        orderBy: { updatedAt: 'desc' },
        ...(includeFileData
          ? {}
          : {
              select: {
                id: true,
                documentName: true,
                documentType: true,
                createdDate: true,
                lastModifiedDate: true,
                createdBy: true,
                lastModifiedBy: true,
                status: true,
                fileSize: true,
                fileName: true,
                description: true,
                linkedAssets: true,
                linkedDeals: true,
                permissions: true,
                tags: true,
                version: true,
                expiryDate: true,
                fileType: true,
                createdAt: true,
                updatedAt: true,
              },
            }),
      });

      return res.json({
        success: true,
        data: records,
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to load legal documents',
        timestamp: new Date(),
      });
    }
  }

  async getById(req: AuthRequest, res: Response) {
    try {
      const record = await prisma.legalDocument.findUnique({
        where: { id: req.params.id },
      });

      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Legal document not found',
          timestamp: new Date(),
        });
      }

      return res.json({
        success: true,
        data: record,
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to load legal document',
        timestamp: new Date(),
      });
    }
  }

  async create(req: AuthRequest, res: Response) {
    try {
      const body = req.body || {};
      const documentName = ensureString(body.documentName).trim();
      const fileName = ensureString(body.fileName).trim();
      const filePath = ensureString(body.filePath).trim();

      if (!documentName || !fileName) {
        return res.status(400).json({
          success: false,
          message: 'documentName and fileName are required',
          timestamp: new Date(),
        });
      }

      if (filePath && isTemporaryBlobPath(filePath)) {
        return res.status(400).json({
          success: false,
          message: 'Temporary blob file URLs are not allowed. Upload a permanent file.',
          timestamp: new Date(),
        });
      }

      const today = new Date().toISOString().split('T')[0];
      const createdBy =
        ensureString(body.createdBy).trim() ||
        req.user?.name ||
        req.user?.email ||
        'Current User';

      const created = await prisma.legalDocument.create({
        data: {
          documentName,
          documentType: ensureString(body.documentType, 'Contract'),
          createdDate: ensureString(body.createdDate, today),
          lastModifiedDate: ensureString(body.lastModifiedDate, today),
          createdBy,
          lastModifiedBy:
            ensureString(body.lastModifiedBy).trim() ||
            req.user?.name ||
            req.user?.email ||
            createdBy,
          status: ensureString(body.status, 'Draft'),
          fileSize: ensureNumber(body.fileSize, 0),
          fileName,
          description: ensureString(body.description, ''),
          linkedAssets: ensureArray(body.linkedAssets),
          linkedDeals: ensureArray(body.linkedDeals),
          permissions: ensureArray(body.permissions),
          content: ensureString(body.content) || undefined,
          tags: ensureArray(body.tags),
          version: Math.max(1, Math.floor(ensureNumber(body.version, 1))),
          expiryDate: ensureString(body.expiryDate) || undefined,
          filePath: filePath || undefined,
          fileType: ensureString(body.fileType) || undefined,
        },
      });

      emitLegalDocRealtime({
        action: 'created',
        documentId: created.id,
        documentName: created.documentName,
        actor: req.user,
        payload: {
          status: created.status,
          documentType: created.documentType,
        },
      });

      // Best-effort: notify admins that a new legal document needs review.
      try {
        const adminRecipients = await resolveAdminRecipients();
        await Promise.all(
          adminRecipients.map(adminEmail =>
            emailService.sendLegalDocCreatedToAdmin({
              adminEmail,
              documentName: created.documentName,
              documentType: created.documentType,
              createdBy: created.createdBy,
              description: created.description || undefined,
              fileName: created.fileName || undefined,
              status: created.status || undefined,
              createdDate: created.createdDate || undefined,
            })
          )
        );
      } catch (error: any) {
        console.warn(
          `Legal document created admin notification failed: ${String(error?.message || error)}`
        );
      }

      return res.status(201).json({
        success: true,
        message: 'Legal document created successfully',
        data: created,
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to create legal document',
        timestamp: new Date(),
      });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      const body = req.body || {};
      const data: Record<string, unknown> = {};

      if (body.documentName !== undefined) data.documentName = ensureString(body.documentName);
      if (body.documentType !== undefined) data.documentType = ensureString(body.documentType);
      if (body.createdDate !== undefined) data.createdDate = ensureString(body.createdDate);
      if (body.createdBy !== undefined) data.createdBy = ensureString(body.createdBy);
      if (body.status !== undefined) data.status = ensureString(body.status);
      if (body.fileSize !== undefined) data.fileSize = ensureNumber(body.fileSize, 0);
      if (body.fileName !== undefined) data.fileName = ensureString(body.fileName);
      if (body.description !== undefined) data.description = ensureString(body.description);
      if (body.linkedAssets !== undefined) data.linkedAssets = ensureArray(body.linkedAssets);
      if (body.linkedDeals !== undefined) data.linkedDeals = ensureArray(body.linkedDeals);
      if (body.permissions !== undefined) data.permissions = ensureArray(body.permissions);
      if (body.content !== undefined) data.content = ensureString(body.content) || null;
      if (body.tags !== undefined) data.tags = ensureArray(body.tags);
      if (body.version !== undefined) {
        data.version = Math.max(1, Math.floor(ensureNumber(body.version, 1)));
      }
      if (body.expiryDate !== undefined) data.expiryDate = ensureString(body.expiryDate) || null;
      if (body.filePath !== undefined) {
        const filePath = ensureString(body.filePath).trim();
        if (filePath && isTemporaryBlobPath(filePath)) {
          return res.status(400).json({
            success: false,
            message: 'Temporary blob file URLs are not allowed. Upload a permanent file.',
            timestamp: new Date(),
          });
        }
        data.filePath = filePath || null;
      }
      if (body.fileType !== undefined) data.fileType = ensureString(body.fileType) || null;

      data.lastModifiedDate =
        ensureString(body.lastModifiedDate).trim() || new Date().toISOString().split('T')[0];
      data.lastModifiedBy =
        ensureString(body.lastModifiedBy).trim() ||
        req.user?.name ||
        req.user?.email ||
        'Current User';

      // Capture the previous status to detect a transition into a completed state.
      const previous = await prisma.legalDocument.findUnique({
        where: { id: req.params.id },
        select: { status: true },
      });

      const updated = await prisma.legalDocument.update({
        where: { id: req.params.id },
        data: data as any,
      });

      emitLegalDocRealtime({
        action: 'updated',
        documentId: updated.id,
        documentName: updated.documentName,
        actor: req.user,
        payload: {
          status: updated.status,
          documentType: updated.documentType,
        },
      });

      // Best-effort: when the status changes to completed/approved, notify the creator.
      try {
        const statusBecameTerminal =
          isTerminalLegalDocStatus(updated.status) &&
          !isTerminalLegalDocStatus(previous?.status);
        if (statusBecameTerminal) {
          const creator = await resolveCreatorContact(updated.createdBy);
          if (creator?.email) {
            await emailService.sendLegalDocCompletedToBroker({
              recipientEmail: creator.email,
              recipientName: creator.name,
              documentName: updated.documentName,
              documentType: updated.documentType || undefined,
              status: updated.status,
            });
          }
        }
      } catch (error: any) {
        console.warn(
          `Legal document completion notification failed: ${String(error?.message || error)}`
        );
      }

      return res.json({
        success: true,
        message: 'Legal document updated successfully',
        data: updated,
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to update legal document',
        timestamp: new Date(),
      });
    }
  }

  async delete(req: AuthRequest, res: Response) {
    try {
      const existing = await prisma.legalDocument.findUnique({
        where: { id: req.params.id },
        select: { id: true, documentName: true },
      });
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Legal document not found',
          timestamp: new Date(),
        });
      }

      const linkedWorkflowDocuments = await prisma.dealStatusDocument.count({
        where: { legalDocumentId: req.params.id },
      });
      if (linkedWorkflowDocuments > 0) {
        return res.status(400).json({
          success: false,
          message:
            'Cannot delete this legal document because it is linked to one or more deal workflow steps',
          timestamp: new Date(),
        });
      }

      await prisma.legalDocument.delete({ where: { id: req.params.id } });

      emitLegalDocRealtime({
        action: 'deleted',
        documentId: existing.id,
        documentName: existing.documentName,
        actor: req.user,
      });

      return res.json({
        success: true,
        message: 'Legal document deleted successfully',
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to delete legal document',
        timestamp: new Date(),
      });
    }
  }

  async cleanupTemporary(req: AuthRequest, res: Response) {
    try {
      const deleted = await prisma.legalDocument.deleteMany({
        where: {
          filePath: { startsWith: 'blob:' },
        },
      });

      return res.json({
        success: true,
        message: `Removed ${deleted.count} temporary documents`,
        data: { deletedCount: deleted.count },
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to clean temporary documents',
        timestamp: new Date(),
      });
    }
  }

  async linkToDeal(req: AuthRequest, res: Response) {
    const documentId = ensureString(req.body?.documentId).trim();
    const dealId = ensureString(req.body?.dealId).trim();
    const statusInput = ensureString(req.body?.status).trim();
    const filledDocumentRecordId = ensureString(req.body?.filledDocumentRecordId).trim() || null;
    const filledDocumentDownloadUrl =
      ensureString(req.body?.filledDocumentDownloadUrl).trim() || null;
    const filledDocumentName = ensureString(req.body?.filledDocumentName).trim() || null;
    const completedAtRaw = ensureString(req.body?.completedAt).trim();

    if (!documentId || !dealId) {
      return res.status(400).json({
        success: false,
        message: 'documentId and dealId are required',
        timestamp: new Date(),
      });
    }

    try {
      const linkedDealContext = await prisma.$transaction(async tx => {
        const [document, deal] = await Promise.all([
          tx.legalDocument.findUnique({
            where: { id: documentId },
            select: { id: true, documentName: true, linkedDeals: true },
          }),
          tx.deal.findUnique({
            where: { id: dealId },
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              brokerId: true,
              lead: { select: { id: true, name: true } },
            },
          }),
        ]);

        if (!document) {
          throw new Error('Legal document not found');
        }
        if (!deal) {
          throw new Error('Deal not found');
        }

        if (req.user?.role === 'broker') {
          const effectiveBrokerId = req.user.brokerId || req.user.id;
          if (!effectiveBrokerId || deal.brokerId !== effectiveBrokerId) {
            throw new Error('Forbidden: cross-broker access denied');
          }
        }

        const activityAt = new Date();
        await tx.deal.update({
          where: { id: deal.id },
          data: {
            legalDocumentId: documentId,
            lastActivityAt: activityAt,
            inactivityNotifiedAt: null,
          },
        });

        await tx.forecastDeal.updateMany({
          where: { dealId: deal.id },
          data: { legalDocument: documentId },
        });

        const completedAt =
          completedAtRaw && !Number.isNaN(new Date(completedAtRaw).getTime())
            ? new Date(completedAtRaw)
            : null;

        if (statusInput) {
          const status = resolveDealStatus(statusInput, {
            allowLegacyMapping: true,
          });
          if (!statusRequiresWorkflowDocument(status)) {
            throw new Error('Only LOI/OTP/OTL/Agreement statuses can be linked to legal documents');
          }

          await upsertDealStatusDocumentWithClient(tx, {
            dealId: deal.id,
            status,
            legalDocumentId: documentId,
            linkedByUserId: req.user?.id || null,
            filledDocumentRecordId,
            filledDocumentDownloadUrl,
            filledDocumentName,
            completedAt: completedAt || undefined,
            metadata: {
              source: 'legal_docs_module',
            },
          });
        }

        const linkedDealEntry = {
          dealId: deal.id,
          dealName: deal.title,
          dealType: normalizeDealTypeLabel(deal.type),
          status: statusInput || String(deal.status || ''),
          clientName: String(deal.lead?.name || ''),
        };

        const currentLinks = Array.isArray(document.linkedDeals) ? document.linkedDeals : [];
        const filteredLinks = currentLinks.filter((item: any) => {
          const linkedDealId = String(item?.dealId || '');
          const linkedStatus = String(item?.status || '');
          if (linkedDealId !== deal.id) return true;
          if (!statusInput) return false;
          return linkedStatus !== statusInput;
        });
        const nextLinks = [...filteredLinks, linkedDealEntry];

        const updatedDocument = await tx.legalDocument.update({
          where: { id: documentId },
          data: {
            linkedDeals: nextLinks,
            lastModifiedDate: toDate(),
            lastModifiedBy:
              req.user?.name || req.user?.email || 'Current User',
          },
        });

        return {
          updatedDocument,
          deal: {
            id: deal.id,
            title: deal.title,
            type: deal.type,
            brokerId: deal.brokerId,
          },
        };
      });

      emitLegalDocRealtime({
        action: 'linked',
        documentId: linkedDealContext.updatedDocument.id,
        documentName: linkedDealContext.updatedDocument.documentName,
        actor: req.user,
        brokerId: linkedDealContext.deal.brokerId,
        visibilityScope: 'private',
        payload: {
          dealId: linkedDealContext.deal.id,
          dealName: linkedDealContext.deal.title,
          dealType: linkedDealContext.deal.type,
          status: statusInput || null,
          filledDocumentRecordId,
          filledDocumentName,
        },
      });

      return res.json({
        success: true,
        message: 'Document linked to deal successfully',
        data: linkedDealContext.updatedDocument,
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = String(error?.message || 'Failed to link document to deal');
      const statusCode = message.toLowerCase().includes('forbidden') ? 403 : 400;
      return res.status(statusCode).json({
        success: false,
        message,
        timestamp: new Date(),
      });
    }
  }
}

export const legalDocController = new LegalDocController();
