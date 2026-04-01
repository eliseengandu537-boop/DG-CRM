import { Response } from 'express';
import { AuthRequest } from '@/types';
import { stockItemService } from '@/services/stockItemService';
import { createStockItemSchema, updateStockItemSchema } from '@/validators';
import { canBrokerAccessRecord } from '@/lib/departmentAccess';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';
import { emitActivityNotification } from '@/lib/realtimeNotifications';

export class StockItemController {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const filters = {
        module: (req.query.module as string) || (req.query.moduleType as string),
        moduleType: req.query.moduleType as string,
        propertyId: req.query.propertyId as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
      };

      const result = await stockItemService.getAllStockItems(filters, { user: req.user });

      res.json({
        success: true,
        message: 'Stock items retrieved successfully',
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
      const stockItem = await stockItemService.getStockItemById(req.params.id);
      if (!canBrokerAccessRecord(req.user, stockItem.module, stockItem.assignedBrokerId || stockItem.createdBy)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        message: 'Stock item retrieved successfully',
        data: stockItem,
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
      const validated = createStockItemSchema.parse(req.body);
      const stockItem = await stockItemService.createStockItem(validated, { user: req.user });

      try {
        emitScopedEvent({
          event: 'stock:created',
          payload: stockItem,
          brokerId: stockItem.assignedBrokerId || stockItem.createdBy || null,
        });
        emitActivityNotification({
          action: 'stock_created',
          entityType: 'stock',
          entityId: stockItem.id,
          entityName: stockItem.name,
          brokerId: stockItem.assignedBrokerId || stockItem.createdBy || null,
          actor: req.user,
          payload: {
            stockId: stockItem.id,
            module: stockItem.module,
            propertyId: stockItem.propertyId,
          },
        });
        emitDashboardRefresh({
          type: 'stock:created',
          id: stockItem.id,
          brokerId: stockItem.assignedBrokerId || stockItem.createdBy || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.status(201).json({
        success: true,
        message: 'Stock item created successfully',
        data: stockItem,
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
      const validated = updateStockItemSchema.parse(req.body);
      const existing = await stockItemService.getStockItemById(req.params.id);
      if (!canBrokerAccessRecord(req.user, existing.module, existing.assignedBrokerId || existing.createdBy)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      const stockItem = await stockItemService.updateStockItem(req.params.id, validated, {
        user: req.user,
      });

      try {
        emitScopedEvent({
          event: 'stock:updated',
          payload: stockItem,
          brokerId: stockItem.assignedBrokerId || stockItem.createdBy || null,
        });
        emitActivityNotification({
          action: 'stock_updated',
          entityType: 'stock',
          entityId: stockItem.id,
          entityName: stockItem.name,
          brokerId: stockItem.assignedBrokerId || stockItem.createdBy || null,
          actor: req.user,
          payload: {
            stockId: stockItem.id,
            module: stockItem.module,
            propertyId: stockItem.propertyId,
          },
        });
        emitDashboardRefresh({
          type: 'stock:updated',
          id: stockItem.id,
          brokerId: stockItem.assignedBrokerId || stockItem.createdBy || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Stock item updated successfully',
        data: stockItem,
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
      const existing = await stockItemService.getStockItemById(req.params.id);
      if (!canBrokerAccessRecord(req.user, existing.module, existing.assignedBrokerId || existing.createdBy)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      await stockItemService.deleteStockItem(req.params.id, { user: req.user });

      try {
        emitScopedEvent({
          event: 'stock:deleted',
          payload: { id: req.params.id },
          brokerId: existing.assignedBrokerId || existing.createdBy || null,
        });
        emitActivityNotification({
          action: 'stock_deleted',
          entityType: 'stock',
          entityId: req.params.id,
          entityName: existing.name,
          brokerId: existing.assignedBrokerId || existing.createdBy || null,
          actor: req.user,
          payload: {
            stockId: req.params.id,
            module: existing.module,
            propertyId: existing.propertyId,
          },
        });
        emitDashboardRefresh({
          type: 'stock:deleted',
          id: req.params.id,
          brokerId: existing.assignedBrokerId || existing.createdBy || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Stock item deleted successfully',
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

export const stockItemController = new StockItemController();
