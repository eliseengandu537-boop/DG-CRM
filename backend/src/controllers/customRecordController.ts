import { Response } from 'express';
import { AuthRequest } from '@/types';
import { customRecordService } from '@/services/customRecordService';
import { createCustomRecordSchema, updateCustomRecordSchema } from '@/validators';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';
import { emitActivityNotification } from '@/lib/realtimeNotifications';
import { parse } from 'csv-parse/sync';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

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
    normalized === 'non-listed' ||
    normalized === 'non listed' ||
    normalized === 'unlisted' ||
    normalized === 'private'
  ) {
    return 'Non-Listed';
  }

  return 'Listed';
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

      // Parse CSV
      const records = parse(file.buffer.toString(), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      if (!records || records.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'CSV file is empty or invalid',
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
        try {
          const name =
            firstNonEmptyString(record.name, record.Name, record.fund_name, record.fundName) || '';
          const address =
            firstNonEmptyString(record.address, record.Address, record.street_address) || '';
          const email =
            firstNonEmptyString(record.email, record.Email, record.contact_email) || '';
          const registrationNumber =
            firstNonEmptyString(
              record.regNumber,
              record.reg_number,
              record.registration_number,
              record['Registration Number'],
              record.registrationNumber
            ) || '';
          const overview =
            firstNonEmptyString(record.overview, record.Overview, record.description) || '';
          const fundType = normalizeFundType(
            firstNonEmptyString(record.listed, record.Listed, record['Fund Type'], record.fundType)
          );
          const contactName = firstNonEmptyString(
            record.contactName,
            record.contact_name,
            record['Contact Name']
          );
          const fundManager = firstNonEmptyString(
            record.fundManager,
            record.fund_manager,
            record['Fund Manager']
          );
          const fundCode = firstNonEmptyString(
            record.fundCode,
            record.fund_code,
            record['Fund Code']
          );

          // Validate required fields
          if (!name || name.length < 1) {
            throw new Error('Fund name is required');
          }
          if (!address || address.length < 3) {
            throw new Error('Address is required and must be at least 3 characters');
          }

          const fund = await prisma.customRecord.create({
            data: {
              entityType: 'fund',
              name,
              status: 'Active',
              category: fundType,
              referenceId: fundCode || registrationNumber || undefined,
              payload: {
                fundCode: fundCode || registrationNumber || '',
                fundType,
                registrationNumber,
                headOfficeLocation: address,
                overview,
                fundManager: fundManager || '',
                totalAssets: 0,
                currency: 'ZAR',
                linkedCompanyId: '',
                linkedCompanyName: '',
                primaryContactId: '',
                primaryContactName: contactName || '',
                secondaryContactId: '',
                secondaryContactName: '',
                linkedProperties: [],
                linkedDeals: [],
                linkedCompanies: [],
                importEmail: email || '',
              },
            },
          });

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
