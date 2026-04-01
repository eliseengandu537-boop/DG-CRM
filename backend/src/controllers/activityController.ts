import { Response } from 'express';
import { AuthRequest } from '@/types';
import { activityService } from '@/services/activityService';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';

export class ActivityController {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const filters = {
        action: req.query.action as string,
        entityType: req.query.entityType as string,
        entityId: req.query.entityId as string,
        brokerId: req.query.brokerId as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 25,
      };

      const result = await activityService.getActivities(filters, req.user);
      return res.json({
        success: true,
        message: 'Activities retrieved successfully',
        data: result,
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to load activities',
        timestamp: new Date(),
      });
    }
  }

  async getById(req: AuthRequest, res: Response) {
    try {
      const activity = await activityService.getActivityById(req.params.id, req.user);
      return res.json({
        success: true,
        message: 'Activity retrieved successfully',
        data: activity,
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = String(error?.message || '');
      const status = message.toLowerCase().includes('forbidden') ? 403 : 404;
      return res.status(status).json({
        success: false,
        message: message || 'Activity not found',
        timestamp: new Date(),
      });
    }
  }

  async delete(req: AuthRequest, res: Response) {
    try {
      const role = String(req.user?.role || '').trim().toLowerCase();
      if (role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: only admin can delete activities',
          timestamp: new Date(),
        });
      }

      await activityService.deleteActivity(req.params.id, req.user);

      try {
        emitScopedEvent({
          event: 'activity:deleted',
          payload: { id: req.params.id },
          includePrivileged: true,
        });
        emitDashboardRefresh({
          type: 'activity:deleted',
          id: req.params.id,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      return res.json({
        success: true,
        message: 'Activity deleted successfully',
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = String(error?.message || '');
      const lower = message.toLowerCase();
      const status = lower.includes('forbidden') ? 403 : lower.includes('not found') ? 404 : 400;
      return res.status(status).json({
        success: false,
        message: message || 'Failed to delete activity',
        timestamp: new Date(),
      });
    }
  }
}

export const activityController = new ActivityController();
