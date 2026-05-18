import { Response } from 'express';
import { AuthRequest } from '@/types';
import { customRecordService } from '@/services/customRecordService';
import { createCustomRecordSchema, updateCustomRecordSchema } from '@/validators';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';
import { emitActivityNotification } from '@/lib/realtimeNotifications';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });
type UploadedFile = {
  originalname?: string;
  buffer: Buffer;
};

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function normalizeFundType(value: unknown): 'Listed' | 'Non-Listed' {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'false' ||
    normalized === '0' ||
    normalized === 'no' ||
    normalized === 'n' ||
    normalized === 'non' ||
    normalized === 'not listed' ||
    normalized === 'not-listed' ||
    normalized === 'notlisted' ||
    normalized === 'nonlisted' ||
    normalized === 'non-listed' ||
    normalized === 'non listed' ||
    normalized === 'unlisted' ||
    normalized === 'private'
  ) {
    return 'Non-Listed';
  }

  return 'Listed';
}

/** Normalize all keys to lowercase+trimmed and values to trimmed strings */
function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.trim().toLowerCase()] = String(value ?? '').trim();
  }
  return out;
}

function parseFileToRecords(file: UploadedFile): Record<string, string>[] {
  const originalName = (file.originalname || '').toLowerCase();

  if (originalName.endsWith('.csv')) {
    const rawRows = parse(file.buffer.toString('utf8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, unknown>[];
    return rawRows.map(normalizeRow);
  }

  // Excel (.xlsx / .xls) — pick the sheet with the most data rows
  const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: false, raw: false });
  if (!workbook.SheetNames.length) return [];

  let bestSheetName = workbook.SheetNames[0];
  let bestRowCount = 0;
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
    if (rows.length > bestRowCount) {
      bestRowCount = rows.length;
      bestSheetName = sheetName;
    }
  }

  const worksheet = workbook.Sheets[bestSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
    raw: false,
  });
  return rows.map(normalizeRow);
}

/** Skip completely blank rows that are common in Excel files */
function isEmptyRow(record: Record<string, string>): boolean {
  return Object.values(record).every((v) => !v || !v.trim());
}

export class CustomRecordController {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const filters = {
        entityType: req.query.entityType as string,
        status: req.query.status as string,
        category: req.query.category as string,
        search: req.query.search as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
      };

      const result = await customRecordService.getAllCustomRecords(filters, { user: req.user });
      res.json({
        success: true,
        message: 'Records retrieved successfully',
        data: result,
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }

  async getById(req: AuthRequest, res: Response) {
    try {
      const record = await customRecordService.getCustomRecordById(req.params.id, { user: req.user });
      res.json({
        success: true,
        message: 'Record retrieved successfully',
        data: record,
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }

  async create(req: AuthRequest, res: Response) {
    try {
      const validated = createCustomRecordSchema.parse(req.body);
      const record = await customRecordService.createCustomRecord(validated, { user: req.user });

      try {
        emitScopedEvent({
          event: 'custom-record:created',
          payload: record,
          brokerId: record.visibilityScope === 'private' ? record.assignedBrokerId || null : null,
          roles: record.visibilityScope === 'shared' ? ['broker'] : undefined,
          includePrivileged: true,
        });
        emitActivityNotification({
          action: `${record.entityType}_created`,
          entityType: record.entityType,
          entityId: record.id,
          entityName: record.name,
          brokerId: record.assignedBrokerId || null,
          actor: req.user,
          visibilityScope: record.visibilityScope || 'shared',
        });
        emitDashboardRefresh({
          type: `custom-record:${record.entityType}:created`,
          id: record.id,
          brokerId: record.visibilityScope === 'private' ? record.assignedBrokerId || null : null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.status(201).json({
        success: true,
        message: 'Record created successfully',
        data: record,
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      const validated = updateCustomRecordSchema.parse(req.body);
      const record = await customRecordService.updateCustomRecord(req.params.id, validated, {
        user: req.user,
      });

      try {
        emitScopedEvent({
          event: 'custom-record:updated',
          payload: record,
          brokerId: record.visibilityScope === 'private' ? record.assignedBrokerId || null : null,
          roles: record.visibilityScope === 'shared' ? ['broker'] : undefined,
          includePrivileged: true,
        });
        emitActivityNotification({
          action: `${record.entityType}_updated`,
          entityType: record.entityType,
          entityId: record.id,
          entityName: record.name,
          brokerId: record.assignedBrokerId || null,
          actor: req.user,
          visibilityScope: record.visibilityScope || 'shared',
        });
        emitDashboardRefresh({
          type: `custom-record:${record.entityType}:updated`,
          id: record.id,
          brokerId: record.visibilityScope === 'private' ? record.assignedBrokerId || null : null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Record updated successfully',
        data: record,
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }

  async delete(req: AuthRequest, res: Response) {
    try {
      const existing = await customRecordService.getCustomRecordById(req.params.id, {
        user: req.user,
      });
      await customRecordService.deleteCustomRecord(req.params.id, { user: req.user });

      try {
        emitScopedEvent({
          event: 'custom-record:deleted',
          payload: { id: req.params.id, entityType: existing.entityType },
          brokerId:
            existing.visibilityScope === 'private' ? existing.assignedBrokerId || null : null,
          roles: existing.visibilityScope === 'shared' ? ['broker'] : undefined,
          includePrivileged: true,
        });
        emitActivityNotification({
          action: `${existing.entityType}_deleted`,
          entityType: existing.entityType,
          entityId: req.params.id,
          entityName: existing.name,
          brokerId: existing.assignedBrokerId || null,
          actor: req.user,
          visibilityScope: existing.visibilityScope || 'shared',
        });
        emitDashboardRefresh({
          type: `custom-record:${existing.entityType}:deleted`,
          id: req.params.id,
          brokerId:
            existing.visibilityScope === 'private' ? existing.assignedBrokerId || null : null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Record deleted successfully',
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }

  async importFunds(req: AuthRequest, res: Response) {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
          timestamp: new Date(),
        });
      }

      // Parse CSV or Excel
      let records: Record<string, string>[];
      try {
        records = parseFileToRecords(file);
      } catch (parseErr: any) {
        return res.status(400).json({
          success: false,
          message: `Failed to parse file: ${parseErr.message}`,
          timestamp: new Date(),
        });
      }

      if (!records || records.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'File is empty or has no data rows',
          timestamp: new Date(),
        });
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
        imported: [] as any[],
      };

      for (const record of records) {
        // Skip completely blank rows (common in Excel files)
        if (isEmptyRow(record)) continue;

        try {
          // All keys are lowercased by parseFileToRecords
          const name =
            firstNonEmptyString(
              record['fund name'],
              record['name'],
              record['fund_name'],
              record['fundname'],
            ) || '';
          const address =
            firstNonEmptyString(
              record['head office'],
              record['head office location'],
              record['headoffice'],
              record['address'],
              record['street address'],
              record['location'],
            ) || '';
          const email =
            firstNonEmptyString(
              record['email'],
              record['email address'],
              record['contact email'],
              record['fund email'],
            ) || '';
          const registrationNumber =
            firstNonEmptyString(
              record['reg. number'],
              record['reg.number'],
              record['registration no.'],
              record['registration no'],
              record['reg no.'],
              record['reg no'],
              record['company reg no.'],
              record['company reg no'],
              record['registration number'],
              record['reg number'],
              record['ref no.'],
              record['ref no'],
              record['registrationnumber'],
              record['regnumber'],
            ) || '';
          const overview =
            firstNonEmptyString(
              record['overview'],
              record['description'],
              record['summary'],
            ) || '';
          const fundType = normalizeFundType(
            firstNonEmptyString(
              record['listed/nonlisted'],
              record['listed/non-listed'],
              record['fund type'],
              record['fundtype'],
              record['type'],
              record['listed'],
            )
          );
          const contactName = firstNonEmptyString(
            record['contact name'],
            record['primary contact'],
            record['contactname'],
          );
          const fundManager = firstNonEmptyString(
            record['fund manager'],
            record['manager'],
            record['fundmanager'],
          );
          const linkedCompanyName = firstNonEmptyString(
            record['company name'],
            record['linked company'],
            record['registered company name'],
            record['companyname'],
            record['entity name'],
          );

          // Validate required fields – only name is truly required
          if (!name || name.length < 1) {
            throw new Error('Fund name is required');
          }
          const resolvedAddress = address || name;

          // Upsert logic: match by name or registrationNumber
          const existing = await prisma.customRecord.findFirst({
            where: {
              entityType: 'fund',
              OR: [
                { name },
                ...(registrationNumber ? [{ referenceId: registrationNumber }] : []),
              ],
            },
          });

          let fund;
          const fundPayload = {
            fundType,
            registrationNumber,
            headOfficeLocation: resolvedAddress,
            overview,
            fundManager: fundManager || '',
            totalAssets: 0,
            currency: 'ZAR',
            linkedCompanyId: '',
            linkedCompanyName: linkedCompanyName || '',
            primaryContactId: '',
            primaryContactName: contactName || '',
            secondaryContactId: '',
            secondaryContactName: '',
            linkedProperties: [],
            linkedDeals: [],
            linkedCompanies: linkedCompanyName ? [linkedCompanyName] : [],
            importEmail: email || '',
          };

          if (existing) {
            fund = await prisma.customRecord.update({
              where: { id: existing.id },
              data: {
                name,
                status: 'Active',
                category: fundType,
                referenceId: registrationNumber || undefined,
                payload: {
                  ...(existing.payload as object),
                  ...fundPayload,
                },
              },
            });
          } else {
            fund = await prisma.customRecord.create({
              data: {
                entityType: 'fund',
                name,
                status: 'Active',
                category: fundType,
                referenceId: registrationNumber || undefined,
                payload: fundPayload,
              },
            });
          }

          results.success++;
          results.imported.push(fund);
        } catch (err: any) {
          results.failed++;
          results.errors.push(`Row ${results.success + results.failed}: ${err.message}`);
        }
      }

      // Emit realtime events for successful imports
      if (results.imported.length > 0) {
        try {
          for (const fund of results.imported) {
            emitScopedEvent({
              event: 'fund:created',
              payload: fund,
              brokerId: null,
            });
          }
          emitDashboardRefresh({
            type: 'funds:imported',
            count: results.imported.length,
            brokerId: null,
          });
        } catch {
          console.warn('Realtime not initialized - skipping emit');
        }
      }

      res.json({
        success: true,
        message: `Import completed: ${results.success} funds imported, ${results.failed} failed`,
        data: results,
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }
}

export const customRecordController = new CustomRecordController();
