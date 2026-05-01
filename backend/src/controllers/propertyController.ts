import { Response } from 'express';
import { AuthRequest } from '@/types';
import { propertyService } from '@/services/propertyService';
import { createPropertySchema, updatePropertySchema } from '@/validators';
import { canBrokerAccessRecord } from '@/lib/departmentAccess';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';
import { emitActivityNotification } from '@/lib/realtimeNotifications';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
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

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseGoogleMapsCoordinates(link?: string): { latitude?: number; longitude?: number } {
  const normalized = String(link || '').trim();
  if (!normalized) return {};

  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  return {};
}

/** Normalize a single row's keys to lowercase+trimmed and values to trimmed strings */
function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.trim().toLowerCase();
    const normalizedValue = String(value ?? '').trim();
    out[normalizedKey] = normalizedValue;
  }
  return out;
}

function parseFileToRecords(file: Express.Multer.File): Record<string, string>[] {
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

/** Return true when every value in a row is blank — skip these rows entirely */
function isEmptyRow(record: Record<string, string>): boolean {
  return Object.values(record).every((v) => !v || !v.trim());
}

export class PropertyController {
  private getEffectiveBrokerId(req: AuthRequest): string | null {
    if (!req.user || req.user.role !== 'broker') return null;
    return req.user.brokerId || req.user.id;
  }

  async getAll(req: AuthRequest, res: Response) {
    try {
      const filters = {
        brokerId: req.query.brokerId as string,
        type: req.query.type as string,
        moduleType: req.query.moduleType as string,
        status: req.query.status as string,
        statuses:
          typeof req.query.statuses === 'string'
            ? req.query.statuses
                .split(',')
                .map(value => value.trim())
                .filter(Boolean)
            : undefined,
        stockOnly: String(req.query.stockOnly || '').trim().toLowerCase() === 'true',
        includeDeleted: String(req.query.includeDeleted || '').trim().toLowerCase() === 'true',
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
      };

      const result = await propertyService.getAllProperties(filters, {
        user: req.user,
        globalVisibility: true,
      });

      res.json({
        success: true,
        message: 'Properties retrieved successfully',
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
      const property = await propertyService.getPropertyById(req.params.id);
      if (!canBrokerAccessRecord(req.user, property.moduleType, property.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        message: 'Property retrieved successfully',
        data: property,
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
      const validated = createPropertySchema.parse(req.body);
      const effectiveBrokerId = this.getEffectiveBrokerId(req);
      const payload = effectiveBrokerId ? { ...validated, brokerId: effectiveBrokerId } : validated;
      const property = await propertyService.createProperty(payload, { user: req.user });

      try {
        emitScopedEvent({
          event: 'property:created',
          payload: property,
          brokerId: property.brokerId || null,
        });
        emitActivityNotification({
          action: 'property_created',
          entityType: 'property',
          entityId: property.id,
          entityName: property.title,
          brokerId: property.brokerId || null,
          actor: req.user,
          payload: {
            propertyId: property.id,
            moduleType: property.moduleType || null,
          },
        });
        emitDashboardRefresh({
          type: 'property:created',
          id: property.id,
          brokerId: property.brokerId || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.status(201).json({
        success: true,
        message: 'Property created successfully',
        data: property,
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
      const validated = updatePropertySchema.parse(req.body);
      const existing = await propertyService.getPropertyById(req.params.id);
      const effectiveBrokerId = this.getEffectiveBrokerId(req);

      if (!canBrokerAccessRecord(req.user, existing.moduleType, existing.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      const payload = effectiveBrokerId ? { ...validated, brokerId: effectiveBrokerId } : validated;
      const property = await propertyService.updateProperty(req.params.id, payload, {
        user: req.user,
      });

      try {
        emitScopedEvent({
          event: 'property:updated',
          payload: property,
          brokerId: property.brokerId || null,
        });
        emitActivityNotification({
          action: 'property_updated',
          entityType: 'property',
          entityId: property.id,
          entityName: property.title,
          brokerId: property.brokerId || null,
          actor: req.user,
          payload: {
            propertyId: property.id,
            moduleType: property.moduleType || null,
          },
        });
        emitDashboardRefresh({
          type: 'property:updated',
          id: property.id,
          brokerId: property.brokerId || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Property updated successfully',
        data: property,
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
      const existing = await propertyService.getPropertyById(req.params.id);
      if (!canBrokerAccessRecord(req.user, existing.moduleType, existing.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      await propertyService.deleteProperty(req.params.id, { user: req.user });

      try {
        emitScopedEvent({
          event: 'property:deleted',
          payload: { id: req.params.id },
          brokerId: existing.brokerId || null,
        });
        emitActivityNotification({
          action: 'property_deleted',
          entityType: 'property',
          entityId: req.params.id,
          entityName: existing.title,
          brokerId: existing.brokerId || null,
          actor: req.user,
          payload: {
            propertyId: req.params.id,
            moduleType: existing.moduleType || null,
          },
        });
        emitDashboardRefresh({
          type: 'property:deleted',
          id: req.params.id,
          brokerId: existing.brokerId || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Property archived successfully',
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

  async importProperties(req: AuthRequest, res: Response) {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
          timestamp: new Date(),
        });
      }

      const moduleType = req.body.moduleType as string || 'sales';
      const effectiveBrokerId = this.getEffectiveBrokerId(req);

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

      // ── First pass: validate + build all property objects ─────────────────
      const validProperties: any[] = [];

      for (let rowIdx = 0; rowIdx < records.length; rowIdx++) {
        const record = records[rowIdx];

        // Skip completely blank rows (common in Excel files)
        if (isEmptyRow(record)) continue;

        try {
          // ── All keys are lowercased by parseFileToRecords ──────────────────
          const propertyName = firstNonEmptyString(
            record['property name'],
            record['building name'],
            record['building'],
            record['property'],
            record['site name'],
            record['complex name'],
            record['name'],
            record['title'],
            record['property_title'],
            record['erf name'],
            record['stand name'],
          );
          const address = firstNonEmptyString(
            record['physical address'],
            record['street address'],
            record['full address'],
            record['street'],
            record['address'],
            record['adress'],
            record['street_address'],
          );

          // Skip rows that have no property name AND no address — these are
          // partial rows (e.g. rows with only Type/Area set) with no useful data
          if (!propertyName && !address) {
            results.errors.push(`Row ${rowIdx + 2}: Skipped — no property name or address`);
            results.failed++;
            continue;
          }

          const city = firstNonEmptyString(
            record['city'],
            record['suburb'],
            record['suburb/town'],
            record['town'],
            record['locality'],
            record['area'],
            record['municipal area'],
          );
          const province = firstNonEmptyString(
            record['province'],
            record['region'],
            record['state'],
          );
          const postalCode = firstNonEmptyString(
            record['postal code'],
            record['postcode'],
            record['post code'],
            record['postalcode'],
            record['zip'],
            record['zip code'],
            record['postal'],
          );
          const linkedCompanyName = firstNonEmptyString(
            record['registers company name'],
            record['registered company name'],
            record['registered company'],
            record['company name'],
            record['company'],
            record['entity name'],
            record['owner company'],
            record['company_name'],
          );
          const registrationNumber = firstNonEmptyString(
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
            record['registration_number'],
          );
          const ownerName = firstNonEmptyString(
            record['owner name & surname'],
            record['owner name and surname'],
            record['owner name'],
            record['owner / landlord'],
            record['owner/landlord'],
            record['landlord name'],
            record['landlord'],
            record['property owner'],
            record['owner'],
            record['contact name'],
            record['owner_name'],
          );
          const ownerContactNumber = firstNonEmptyString(
            record['owner number'],
            record['owner no.'],
            record['owner no'],
            record['owner cell'],
            record['owner tel'],
            record['owner tel no.'],
            record['owner contact'],
            record['owner contact no.'],
            record['landlord tel'],
            record['landlord tel no.'],
            record['landlord cell'],
            record['landlord contact'],
            record['landlord contact no.'],
            record['contact number'],
            record['contact no.'],
            record['contact no'],
            record['phone'],
            record['tel'],
            record['cell'],
            record['mobile'],
            record['owner_number'],
            record['owner_contact_number'],
          );
          const tenantName = firstNonEmptyString(
            record['tenant name'],
            record['current tenant'],
            record['tenant'],
            record['occupant'],
            record['lessee'],
            record['tenant_name'],
          );
          const tenantNumber = firstNonEmptyString(
            record['tenants no.'],
            record['tenants no'],
            record['tenant no.'],
            record['tenant no'],
            record['tenant number'],
            record['tenant tel'],
            record['tenant cell'],
            record['tenant contact'],
            record['tenant_number'],
          );
          const ownerEmail = firstNonEmptyString(
            record['email'],
            record['owner email'],
            record['landlord email'],
            record['contact email'],
            record['owner_email'],
          );
          const googleLink = firstNonEmptyString(
            record['google link'],
            record['google maps'],
            record['google maps link'],
            record['map link'],
            record['gps link'],
            record['coordinates link'],
            record['google'],
            record['google_link'],
          );
          const importComment = firstNonEmptyString(
            record['comment'],
            record['comments'],
            record['notes'],
            record['note'],
            record['remarks'],
            record['remark'],
            record['brokers comments & date'],
            record['broker comments'],
          );
          const rawSize = firstNonEmptyString(
            record['size (sqm)'],
            record['size (m\u00b2)'],
            record['size (m2)'],
            record['size'],
            record['gla (m\u00b2)'],
            record['gla (m2)'],
            record['gla (sqm)'],
            record['gla sqm'],
            record['gla'],
            record['gross lettable area'],
            record['nla'],
            record['net lettable area'],
            record['floor area'],
            record['erf size'],
            record['stand size'],
            record['plot size'],
            record['extent (m\u00b2)'],
            record['extent'],
            record['sqm'],
            record['m\u00b2'],
            record['square meters'],
            record['square footage'],
            record['sqft'],
          );
          const rawType = firstNonEmptyString(
            record['property type'],
            record['type'],
            record['category'],
            record['land use'],
            record['usage'],
            record['class'],
            record['use'],
            record['property category'],
          );
          const rawStatus = firstNonEmptyString(
            record['ownership status'],
            record['occupation status'],
            record['lease status'],
            record['status'],
            record['tenure'],
            record['ownership'],
          );
          const linkedFundName = firstNonEmptyString(
            record['fund name'],
            record['fund'],
            record['linked fund'],
          );
          const googleCoordinates = parseGoogleMapsCoordinates(googleLink);

          const title = propertyName || address!;
          const resolvedAddress = address || title;

          validProperties.push({
            title,
            description: firstNonEmptyString(record['description'], importComment) || '',
            address: resolvedAddress,
            city: city || '',
            province: province || '',
            postalCode: postalCode || '',
            type: rawType || 'commercial',
            status: rawStatus || 'active',
            moduleType,
            price: parseOptionalNumber(record['price'] || record['amount'] || record['value']) || 0,
            area: parseOptionalNumber(rawSize) || 0,
            latitude:
              parseOptionalNumber(record['latitude'] || record['lat']) ?? googleCoordinates.latitude,
            longitude:
              parseOptionalNumber(record['longitude'] || record['lng'] || record['long']) ?? googleCoordinates.longitude,
            bedrooms: parseOptionalNumber(record['bedrooms'] || record['beds']),
            bathrooms: parseOptionalNumber(record['bathrooms'] || record['baths']),
            brokerId:
              effectiveBrokerId ||
              firstNonEmptyString(record['brokerid'], record['broker_id']) ||
              undefined,
            metadata: {
              importedFrom: 'excel',
              importDate: new Date().toISOString(),
              linkedCompanyName: linkedCompanyName || undefined,
              registrationNumber: registrationNumber || undefined,
              registrationName: linkedCompanyName || undefined,
              ownerName: ownerName || undefined,
              ownerEmail: ownerEmail || undefined,
              ownerContactNumber: ownerContactNumber || undefined,
              tenantName: tenantName || undefined,
              tenantContactNumber: tenantNumber || undefined,
              googleLink: googleLink || undefined,
              importComment: importComment || undefined,
              linkedFundName: linkedFundName || undefined,
              propertyType: rawType || 'commercial',
              squareFeet: parseOptionalNumber(rawSize) || undefined,
              gla: parseOptionalNumber(record['gla (m\u00b2)'] || record['gla (m2)'] || record['gla (sqm)'] || record['gla sqm'] || record['gla']) || undefined,
              ownershipStatus: rawStatus || undefined,
            },
          });
        } catch (err: any) {
          results.failed++;
          results.errors.push(`Row ${rowIdx + 2}: ${err.message}`);
        }
      }

      // ── Second pass: bulk insert all valid properties in ONE DB call ───────
      // This avoids the nginx 120s proxy_read_timeout that kills sequential inserts
      if (validProperties.length > 0) {
        try {
          const createResult = await prisma.property.createMany({
            data: validProperties as any,
          });
          results.success = createResult.count;
        } catch (bulkErr: any) {
          // Bulk failed — fall back to individual inserts to identify which rows fail
          for (let i = 0; i < validProperties.length; i++) {
            try {
              const property = await prisma.property.create({ data: validProperties[i] as any });
              results.imported.push(property);
              results.success++;
            } catch (rowErr: any) {
              results.failed++;
              results.errors.push(`Row ${i + 2}: ${rowErr.message}`);
            }
          }
        }
      }

      // Emit realtime events
      if (results.success > 0) {
        try {
          emitDashboardRefresh({
            type: 'properties:imported',
            count: results.success,
            brokerId: effectiveBrokerId || null,
          });
        } catch {
          console.warn('Realtime not initialized - skipping emit');
        }
      }

      res.json({
        success: true,
        message: `Import completed: ${results.success} properties imported, ${results.failed} failed`,
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

export const propertyController = new PropertyController();
