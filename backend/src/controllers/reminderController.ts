import { Response } from 'express';
import { AuthRequest } from '@/types';
import { reminderService } from '@/services/reminderService';
import { createReminderSchema, updateReminderSchema } from '@/validators';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';
import { emitActivityNotification } from '@/lib/realtimeNotifications';

export class ReminderController {
  private getScope(req: AuthRequest) {
    if (!req.user) {
      throw new Error('Authentication required');
    }

    return {
      role: req.user.role,
      userId: req.user.id,
      brokerId: req.user.brokerId,
      userName: req.user.name,
      userEmail: req.user.email,
    };
  }

  async getAll(req: AuthRequest, res: Response) {
    try {
      const filters = {
        status: req.query.status as any,
        reminderType: req.query.reminderType as any,
        priority: req.query.priority as any,
        dealId: req.query.dealId as string,
        brokerId: req.query.brokerId as string,
        from: req.query.from as string,
        to: req.query.to as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
      };

      const result = await reminderService.getAllReminders(filters, this.getScope(req));

      return res.json({
        success: true,
        message: 'Reminders retrieved successfully',
        data: result,
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to load reminders',
        timestamp: new Date(),
      });
    }
  }

  async getById(req: AuthRequest, res: Response) {
    try {
      const reminder = await reminderService.getReminderById(req.params.id, this.getScope(req));

      return res.json({
        success: true,
        message: 'Reminder retrieved successfully',
        data: reminder,
        timestamp: new Date(),
      });
    } catch (error: any) {
      const status = String(error?.message || '').toLowerCase().includes('forbidden') ? 403 : 404;
      return res.status(status).json({
        success: false,
        message: error?.message || 'Reminder not found',
        timestamp: new Date(),
      });
    }
  }

  async create(req: AuthRequest, res: Response) {
    try {
      const validated = createReminderSchema.parse(req.body);
      const reminder = await reminderService.createReminder(validated, this.getScope(req));

      try {
        emitScopedEvent({
          event: 'reminder:created',
          payload: reminder,
          brokerId: reminder.brokerId || null,
          includePrivileged: true,
        });
        emitActivityNotification({
          action: 'reminder_created',
          entityType: 'reminder',
          entityId: reminder.id,
          entityName: reminder.title,
          brokerId: reminder.brokerId || null,
          actor: req.user,
          visibilityScope: 'private',
          payload: {
            reminderId: reminder.id,
            dealId: reminder.dealId || null,
          },
        });
        emitDashboardRefresh({
          type: 'reminder:created',
          id: reminder.id,
          brokerId: reminder.brokerId || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      return res.status(201).json({
        success: true,
        message: 'Reminder created successfully',
        data: reminder,
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to create reminder',
        timestamp: new Date(),
      });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      const validated = updateReminderSchema.parse(req.body);
      const reminder = await reminderService.updateReminder(req.params.id, validated, this.getScope(req));

      try {
        emitScopedEvent({
          event: 'reminder:updated',
          payload: reminder,
          brokerId: reminder.brokerId || null,
          includePrivileged: true,
        });
        emitActivityNotification({
          action: 'reminder_updated',
          entityType: 'reminder',
          entityId: reminder.id,
          entityName: reminder.title,
          brokerId: reminder.brokerId || null,
          actor: req.user,
          visibilityScope: 'private',
          payload: {
            reminderId: reminder.id,
            dealId: reminder.dealId || null,
            status: reminder.status,
          },
        });
        emitDashboardRefresh({
          type: 'reminder:updated',
          id: reminder.id,
          brokerId: reminder.brokerId || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      return res.json({
        success: true,
        message: 'Reminder updated successfully',
        data: reminder,
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = error?.message || 'Failed to update reminder';
      const normalized = String(message).toLowerCase();
      const status = normalized.includes('forbidden') ? 403 : normalized.includes('not found') ? 404 : 400;
      return res.status(status).json({
        success: false,
        message,
        timestamp: new Date(),
      });
    }
  }

  async complete(req: AuthRequest, res: Response) {
    try {
      const reminder = await reminderService.markReminderCompleted(req.params.id, this.getScope(req));

      try {
        emitScopedEvent({
          event: 'reminder:completed',
          payload: reminder,
          brokerId: reminder.brokerId || null,
          includePrivileged: true,
        });
        emitActivityNotification({
          action: 'reminder_status_changed',
          entityType: 'reminder',
          entityId: reminder.id,
          entityName: reminder.title,
          brokerId: reminder.brokerId || null,
          actor: req.user,
          visibilityScope: 'private',
          payload: {
            reminderId: reminder.id,
            status: reminder.status,
          },
        });
        emitDashboardRefresh({
          type: 'reminder:completed',
          id: reminder.id,
          brokerId: reminder.brokerId || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      return res.json({
        success: true,
        message: 'Reminder marked as completed',
        data: reminder,
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = error?.message || 'Failed to complete reminder';
      const normalized = String(message).toLowerCase();
      const status = normalized.includes('forbidden') ? 403 : normalized.includes('not found') ? 404 : 400;
      return res.status(status).json({
        success: false,
        message,
        timestamp: new Date(),
      });
    }
  }

  async delete(req: AuthRequest, res: Response) {
    try {
      const existing = await reminderService.getReminderById(req.params.id, this.getScope(req));
      await reminderService.deleteReminder(req.params.id, this.getScope(req));

      try {
        emitScopedEvent({
          event: 'reminder:deleted',
          payload: { id: req.params.id },
          brokerId: existing.brokerId || null,
          includePrivileged: true,
        });
        emitActivityNotification({
          action: 'reminder_deleted',
          entityType: 'reminder',
          entityId: req.params.id,
          entityName: existing.title,
          brokerId: existing.brokerId || null,
          actor: req.user,
          visibilityScope: 'private',
          payload: {
            reminderId: req.params.id,
          },
        });
        emitDashboardRefresh({
          type: 'reminder:deleted',
          id: req.params.id,
          brokerId: existing.brokerId || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      return res.json({
        success: true,
        message: 'Reminder deleted successfully',
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = error?.message || 'Failed to delete reminder';
      const normalized = String(message).toLowerCase();
      const status = normalized.includes('forbidden') ? 403 : normalized.includes('not found') ? 404 : 400;
      return res.status(status).json({
        success: false,
        message,
        timestamp: new Date(),
      });
    }
  }
}

export const reminderController = new ReminderController();
