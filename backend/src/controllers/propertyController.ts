import { Response } from 'express';
import { AuthRequest } from '@/types';
import { propertyService } from '@/services/propertyService';
import { createPropertySchema, updatePropertySchema } from '@/validators';
import { canBrokerAccessRecord } from '@/lib/departmentAccess';
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
          const propertyName = firstNonEmptyString(
            record.name,
            record.Name,
            record.title,
            record.Title,
            record.property_title
          );
          const address = firstNonEmptyString(
            record.address,
            record.Address,
            record.Adress,
            record.street_address
          );
          const linkedCompanyName = firstNonEmptyString(
            record.company_name,
            record.CompanyName,
            record['Company Name'],
            record.registers_company_name,
            record.registered_company_name,
            record.RegistersCompanyName,
            record['Registers Company Name'],
            record['Registers Company name']
          );
          const registrationNumber = firstNonEmptyString(
            record.registration_number,
            record['Registration No.'],
            record['Registration No'],
            record.registrationNo,
            record.RegistrationNo,
            record.reg_number,
            record.regNumber,
            record['Registration Number'],
            record.RegistrationNumber
          );
          const ownerName = firstNonEmptyString(
            record['Owner Name & Surname'],
            record['Owner Name and Surname'],
            record['Owner Name'],
            record.contact_name,
            record.ContactName,
            record['Contact Name'],
            record.owner_name,
            record.OwnerName
          );
          const ownerContactNumber = firstNonEmptyString(
            record['Owner Number'],
            record.owner_number,
            record.OwnerNumber,
            record.contact_number,
            record.ContactNumber,
            record['Contact Number'],
            record.phone,
            record.Phone,
            record.owner_contact_number
          );
          const tenantNumber = firstNonEmptyString(
            record['Tenants No.'],
            record['Tenants No'],
            record.tenant_number,
            record.TenantNumber,
            record.tenants_no
          );
          const ownerEmail = firstNonEmptyString(
            record['Email'],
            record.email,
            record.Email,
            record.owner_email,
            record.OwnerEmail
          );
          const googleLink = firstNonEmptyString(
            record.google_link,
            record.GoogleLink,
            record['Google Link']
          );
          const importComment = firstNonEmptyString(
            record.comment,
            record.Comment,
            record.comments,
            record.Comments
          );
          const googleCoordinates = parseGoogleMapsCoordinates(googleLink);

          // Map CSV fields to property schema
          const propertyData = {
            title: propertyName || address || 'Imported Property',
            description:
              firstNonEmptyString(record.description, record.Description, importComment) || '',
            address: address || '',
            city: firstNonEmptyString(record.city, record.City) || '',
            province: firstNonEmptyString(record.province, record.Province, record.state) || '',
            postalCode:
              firstNonEmptyString(
                record.postalCode,
                record.postal_code,
                record.PostalCode,
                record.zip,
                record.zip_code
              ) || '',
            type:
              firstNonEmptyString(
                record.type,
                record.Type,
                record.property_type,
                record.propertyType
              ) || 'commercial',
            status: firstNonEmptyString(record.status, record.Status) || 'active',
            moduleType: moduleType,
            price: parseOptionalNumber(record.price || record.Price || record.amount) || 0,
            area:
              parseOptionalNumber(
                record.area || record.Area || record.square_feet || record.sqft
              ) || 0,
            latitude:
              parseOptionalNumber(record.latitude || record.lat) ?? googleCoordinates.latitude,
            longitude:
              parseOptionalNumber(record.longitude || record.lng) ?? googleCoordinates.longitude,
            bedrooms: parseOptionalNumber(record.bedrooms || record.beds),
            bathrooms: parseOptionalNumber(record.bathrooms || record.baths),
            brokerId:
              effectiveBrokerId ||
              firstNonEmptyString(record.brokerId, record.broker_id) ||
              undefined,
            metadata: {
              ...(record.metadata ? JSON.parse(record.metadata) : {}),
              importedFrom: 'csv',
              importDate: new Date().toISOString(),
              linkedCompanyName: linkedCompanyName || undefined,
              registrationNumber: registrationNumber || undefined,
              registrationName: linkedCompanyName || undefined,
              ownerName: ownerName || undefined,
              ownerEmail: ownerEmail || undefined,
              ownerContactNumber: ownerContactNumber || undefined,
              tenantContactNumber: tenantNumber || undefined,
              googleLink: googleLink || undefined,
              importComment: importComment || undefined,
              propertyType:
                firstNonEmptyString(
                  record.type,
                  record.Type,
                  record.property_type,
                  record.propertyType
                ) || 'commercial',
            },
          };

          // Validate required fields
          if (!propertyData.address || propertyData.address.length < 3) {
            throw new Error('Address is required and must be at least 3 characters');
          }
          if (!propertyData.type) {
            throw new Error('Property type is required');
          }

          // Create the property
          const property = await prisma.property.create({
            data: propertyData as any,
          });

          results.success++;
          results.imported.push(property);
        } catch (err: any) {
          results.failed++;
          results.errors.push(`Row ${results.success + results.failed}: ${err.message}`);
        }
      }

      // Emit realtime events for successful imports
      if (results.imported.length > 0) {
        try {
          for (const property of results.imported) {
            emitScopedEvent({
              event: 'property:created',
              payload: property,
              brokerId: property.brokerId || null,
            });
          }
          emitDashboardRefresh({
            type: 'properties:imported',
            count: results.imported.length,
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
