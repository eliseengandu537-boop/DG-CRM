import { Response } from 'express';
import { AuthRequest } from '@/types';
import { propertyService } from '@/services/propertyService';
import { createPropertySchema, updatePropertySchema } from '@/validators';
import { canBrokerAccessRecord } from '@/lib/departmentAccess';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';
import { emitActivityNotification } from '@/lib/realtimeNotifications';

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
}

export const propertyController = new PropertyController();
