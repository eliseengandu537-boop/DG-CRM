import { Response } from 'express';
import { AuthRequest } from '@/types';
import { customRecordService } from '@/services/customRecordService';
import { createCustomRecordSchema, updateCustomRecordSchema } from '@/validators';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';
import { emitActivityNotification } from '@/lib/realtimeNotifications';

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
}

export const customRecordController = new CustomRecordController();
