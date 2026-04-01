import { Response } from 'express';
import { AuthRequest } from '@/types';
import { forecastDealService } from '@/services/forecastDealService';
import { dealService } from '@/services/dealService';
import { createForecastDealSchema, updateForecastDealSchema, wipStatusChangeSchema } from '@/validators';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';
import { canBrokerAccessRecord } from '@/lib/departmentAccess';
import { emitActivityNotification } from '@/lib/realtimeNotifications';

export class ForecastDealController {
  private getEffectiveBrokerId(req: AuthRequest): string | null {
    if (!req.user || req.user.role !== 'broker') return null;
    return req.user.brokerId || req.user.id;
  }

  private withDealTypeAlias(body: Record<string, unknown>): Record<string, unknown> {
    const payload = { ...body };
    const dealType = String(payload.dealType || '').trim().toLowerCase();
    if (!payload.moduleType && dealType) {
      payload.moduleType =
        dealType === 'lease' || dealType === 'leasing'
          ? 'leasing'
          : dealType === 'auction'
          ? 'auction'
          : 'sales';
    }
    if (
      (payload.expectedValue === undefined || payload.expectedValue === null || payload.expectedValue === '') &&
      payload.assetValue !== undefined
    ) {
      payload.expectedValue = payload.assetValue;
    }
    return payload;
  }

  async getAll(req: AuthRequest, res: Response) {
    try {
      const filters = {
        status: req.query.status as string,
        moduleType: req.query.moduleType as string,
        brokerId: req.query.brokerId as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 25,
      };

      const result = await forecastDealService.getAllForecastDeals(filters, { user: req.user });

      res.json({
        success: true,
        message: 'Forecast deals retrieved successfully',
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
      const forecastDeal = await forecastDealService.getForecastDealById(req.params.id);
      if (!canBrokerAccessRecord(req.user, forecastDeal.moduleType, forecastDeal.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        message: 'Forecast deal retrieved successfully',
        data: forecastDeal,
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
      const validated = createForecastDealSchema.parse(
        this.withDealTypeAlias(req.body as Record<string, unknown>)
      );
      const effectiveBrokerId = this.getEffectiveBrokerId(req);
      const payload = effectiveBrokerId
        ? { ...validated, brokerId: effectiveBrokerId, createdByUserId: req.userId }
        : { ...validated, createdByUserId: req.userId };
      const forecastDeal = await forecastDealService.createForecastDeal(payload, { user: req.user });

      try {
        emitScopedEvent({
          event: 'forecast-deal:created',
          payload: forecastDeal,
          brokerId: forecastDeal.brokerId,
        });
        emitDashboardRefresh({
          type: 'forecast-deal:created',
          id: forecastDeal.id,
          brokerId: forecastDeal.brokerId,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.status(201).json({
        success: true,
        message: 'Forecast deal created successfully',
        data: forecastDeal,
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
      const validated = updateForecastDealSchema.parse(
        this.withDealTypeAlias(req.body as Record<string, unknown>)
      );
      const existing = await forecastDealService.getForecastDealById(req.params.id);
      const effectiveBrokerId = this.getEffectiveBrokerId(req);

      if (!canBrokerAccessRecord(req.user, existing.moduleType, existing.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      const payload = effectiveBrokerId
        ? { ...validated, brokerId: effectiveBrokerId }
        : validated;
      const forecastDeal = await forecastDealService.updateForecastDeal(req.params.id, payload, {
        user: req.user,
      });

      try {
        emitScopedEvent({
          event: 'forecast-deal:updated',
          payload: forecastDeal,
          brokerId: forecastDeal.brokerId,
        });
        emitDashboardRefresh({
          type: 'forecast-deal:updated',
          id: forecastDeal.id,
          brokerId: forecastDeal.brokerId,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Forecast deal updated successfully',
        data: forecastDeal,
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
      const existing = await forecastDealService.getForecastDealById(req.params.id);
      if (!canBrokerAccessRecord(req.user, existing.moduleType, existing.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      await forecastDealService.deleteForecastDeal(req.params.id, { user: req.user });

      try {
        emitScopedEvent({
          event: 'forecast-deal:deleted',
          payload: { id: req.params.id },
          brokerId: existing.brokerId,
        });
        emitDashboardRefresh({
          type: 'forecast-deal:deleted',
          id: req.params.id,
          brokerId: existing.brokerId,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Forecast deal deleted successfully',
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

  async updateWipStatus(req: AuthRequest, res: Response) {
    try {
      const validated = wipStatusChangeSchema.parse(req.body);
      const linkedDeal = await dealService.getDealById(validated.dealId);
      if (!canBrokerAccessRecord(req.user, linkedDeal.type, linkedDeal.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      const effectiveBrokerId = this.getEffectiveBrokerId(req);
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
      const result = await forecastDealService.handleWipStatusChange(payload, { user: req.user });

      try {
        if (result.previousStatus) {
          emitActivityNotification({
            action: 'deal_status_changed',
            entityType: 'deal',
            entityId: result.dealId,
            entityName: linkedDeal.title,
            brokerId: result.brokerId,
            actor: req.user,
            payload: {
              dealId: result.dealId,
              previousStatus: result.previousStatus,
              status: result.status,
              moduleType: result.moduleType,
            },
          });
        }
        emitDashboardRefresh({
          type: 'wip:status-changed',
          id: result.dealId,
          brokerId: result.brokerId,
        });
        if (result.forecastDeal) {
          emitScopedEvent({
            event: 'forecast-deal:updated',
            payload: result.forecastDeal,
            brokerId: result.brokerId,
          });
        } else {
          emitScopedEvent({
            event: 'forecast-deal:deleted',
            payload: { dealId: result.dealId },
            brokerId: result.brokerId,
          });
        }
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'WIP status updated successfully',
        data: result,
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      res.status(message.includes('forbidden') ? 403 : 400).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }
}

export const forecastDealController = new ForecastDealController();
