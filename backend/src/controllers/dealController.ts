import { Request, Response } from 'express';
import { AuthRequest } from '@/types';
import { dealService } from '@/services/dealService';
import { createDealSchema, updateDealSchema } from '@/validators';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';
import { canBrokerAccessRecord } from '@/lib/departmentAccess';
import { emitActivityNotification } from '@/lib/realtimeNotifications';
import { runDealInactivityScan } from '@/services/dealInactivityService';

export class DealController {
  private getEffectiveBrokerId(req: AuthRequest): string | null {
    if (!req.user || req.user.role !== 'broker') return null;
    return req.user.brokerId || req.user.id;
  }

  private withDealTypeAlias(body: Record<string, unknown>): Record<string, unknown> {
    const payload = { ...body };
    if (!payload.type && payload.dealType) {
      payload.type = payload.dealType;
    }
    if (
      (payload.value === undefined || payload.value === null || payload.value === '') &&
      payload.assetValue !== undefined
    ) {
      payload.value = payload.assetValue;
    }
    return payload;
  }

  async getAll(req: AuthRequest, res: Response) {
    try {
      const isWipFilter = String(req.query.wip || '').trim().toLowerCase() === 'true';
      const filters = {
        status: req.query.status as string,
        type: req.query.type as string,
        brokerId: req.query.brokerId as string,
        propertyId: req.query.propertyId as string,
        wip: isWipFilter,
        page: Math.max(1, parseInt(req.query.page as string) || 1),
        limit: Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10)),
      };
      if (req.user?.role === 'broker') {
        filters.brokerId = req.user.brokerId || req.user.id;
      }

      const result = await dealService.getAllDeals(filters, { user: req.user });

      res.json({
        success: true,
        message: 'Deals retrieved successfully',
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
      const deal = await dealService.getDealById(req.params.id);
      if (!canBrokerAccessRecord(req.user, deal.type, deal.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        message: 'Deal retrieved successfully',
        data: deal,
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

  async getActivities(req: AuthRequest, res: Response) {
    try {
      const deal = await dealService.getDealById(req.params.id);
      if (!canBrokerAccessRecord(req.user, deal.type, deal.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      const activities = await dealService.getDealActivities(req.params.id);
      return res.json({
        success: true,
        message: 'Deal activities retrieved successfully',
        data: activities,
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = String(error?.message || '');
      const status = message.toLowerCase().includes('not found') ? 404 : 400;
      return res.status(status).json({
        success: false,
        message: message || 'Failed to load deal activities',
        timestamp: new Date(),
      });
    }
  }

  async create(req: AuthRequest, res: Response) {
    try {
      const validated = createDealSchema.parse(this.withDealTypeAlias(req.body as Record<string, unknown>));
      const effectiveBrokerId = this.getEffectiveBrokerId(req);
      const payload = effectiveBrokerId
        ? { ...validated, brokerId: effectiveBrokerId }
        : validated;
      const deal = await dealService.createDeal(payload, { user: req.user });

      try {
        emitScopedEvent({
          event: 'deal:created',
          payload: deal,
          brokerId: deal.brokerId,
        });
        emitActivityNotification({
          action: 'deal_created',
          entityType: 'deal',
          entityId: deal.id,
          entityName: deal.title,
          brokerId: deal.brokerId,
          actor: req.user,
          payload: {
            dealId: deal.id,
            type: deal.type,
          },
        });
        emitDashboardRefresh({
          type: 'deal:created',
          id: deal.id,
          brokerId: deal.brokerId,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.status(201).json({
        success: true,
        message: 'Deal created successfully',
        data: deal,
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
      const validated = updateDealSchema.parse(this.withDealTypeAlias(req.body as Record<string, unknown>));
      const existingDeal = await dealService.getDealById(req.params.id);
      const effectiveBrokerId = this.getEffectiveBrokerId(req);

      if (!canBrokerAccessRecord(req.user, existingDeal.type, existingDeal.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      if (effectiveBrokerId && validated.brokerId && validated.brokerId !== effectiveBrokerId) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: brokerId cannot be reassigned',
          timestamp: new Date(),
        });
      }

      const payload = effectiveBrokerId
        ? { ...validated, brokerId: effectiveBrokerId }
        : validated;
      const deal = await dealService.updateDeal(req.params.id, payload, { user: req.user });

      try {
        emitScopedEvent({
          event: 'deal:updated',
          payload: deal,
          brokerId: deal.brokerId,
        });
        emitActivityNotification({
          action:
            String(existingDeal.status || '').trim() !== String(deal.status || '').trim()
              ? 'deal_status_changed'
              : 'deal_updated',
          entityType: 'deal',
          entityId: deal.id,
          entityName: deal.title,
          brokerId: deal.brokerId,
          actor: req.user,
          payload: {
            dealId: deal.id,
            type: deal.type,
            status: deal.status,
          },
        });
        emitDashboardRefresh({
          type: 'deal:updated',
          id: deal.id,
          brokerId: deal.brokerId,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Deal updated successfully',
        data: deal,
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
      const existingDeal = await dealService.getDealById(req.params.id);

      await dealService.deleteDeal(req.params.id, { user: req.user });

      try {
        emitScopedEvent({
          event: 'deal:deleted',
          payload: { id: req.params.id },
          brokerId: existingDeal.brokerId,
        });
        emitActivityNotification({
          action: 'deal_deleted',
          entityType: 'deal',
          entityId: req.params.id,
          entityName: existingDeal.title,
          brokerId: existingDeal.brokerId,
          actor: req.user,
          payload: {
            dealId: req.params.id,
            type: existingDeal.type,
          },
        });
        emitDashboardRefresh({
          type: 'deal:deleted',
          id: req.params.id,
          brokerId: existingDeal.brokerId,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Deal deleted successfully',
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

  async runInactivityScan(req: AuthRequest, res: Response) {
    try {
      const result = await runDealInactivityScan(new Date());
      return res.json({
        success: true,
        message: 'Deal inactivity scan completed',
        data: result,
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message || 'Deal inactivity scan failed',
        timestamp: new Date(),
      });
    }
  }
}

export const dealController = new DealController();
