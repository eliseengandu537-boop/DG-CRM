import { Response } from 'express';
import { AuthRequest } from '@/types';
import { notificationService } from '@/services/notificationService';
import { emitScopedEvent } from '@/realtime';

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

function errorStatusFromMessage(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes('forbidden')) return 403;
  if (lower.includes('not found')) return 404;
  return 400;
}

export class NotificationController {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const filters = {
        entityType: req.query.entityType as string,
        type: req.query.type as string,
        brokerId: req.query.brokerId as string,
        userId: req.query.userId as string,
        read: parseOptionalBoolean(req.query.read),
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 25,
      };

      const result = await notificationService.getNotifications(filters, req.user);
      return res.json({
        success: true,
        message: 'Notifications retrieved successfully',
        data: result,
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = String(error?.message || 'Failed to load notifications');
      return res.status(errorStatusFromMessage(message)).json({
        success: false,
        message,
        timestamp: new Date(),
      });
    }
  }

  async getById(req: AuthRequest, res: Response) {
    try {
      const notification = await notificationService.getNotificationById(req.params.id, req.user);
      return res.json({
        success: true,
        message: 'Notification retrieved successfully',
        data: notification,
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = String(error?.message || 'Notification not found');
      return res.status(errorStatusFromMessage(message)).json({
        success: false,
        message,
        timestamp: new Date(),
      });
    }
  }

  async markRead(req: AuthRequest, res: Response) {
    try {
      const notification = await notificationService.markNotificationRead(req.params.id, req.user);

      try {
        emitScopedEvent({
          event: 'notification:read',
          payload: {
            id: notification.id,
            read: true,
            brokerId: notification.brokerId || null,
          },
          brokerId: notification.brokerId || null,
          includePrivileged: true,
        });
      } catch {
        console.warn('Realtime not initialized - skipping notification read emit');
      }

      return res.json({
        success: true,
        message: 'Notification marked as read',
        data: notification,
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = String(error?.message || 'Failed to mark notification as read');
      return res.status(errorStatusFromMessage(message)).json({
        success: false,
        message,
        timestamp: new Date(),
      });
    }
  }
}

export const notificationController = new NotificationController();
