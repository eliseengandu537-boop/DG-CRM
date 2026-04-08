import { Request, Response } from 'express';
import { AuthRequest } from '@/types';
import { leadService } from '@/services/leadService';
import {
  createLeadSchema,
  leadWorkflowSyncSchema,
  updateLeadCommentSchema,
  updateLeadSchema,
} from '@/validators';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';
import { canBrokerAccessRecord } from '@/lib/departmentAccess';
import { leadWorkflowService } from '@/services/leadWorkflowService';
import { emitActivityNotification } from '@/lib/realtimeNotifications';

export class LeadController {
  private getEffectiveBrokerId(req: AuthRequest): string | null {
    if (!req.user || req.user.role !== 'broker') return null;
    return req.user.brokerId || req.user.id;
  }

  async getAll(req: AuthRequest, res: Response) {
    try {
      const rawSearch = String(req.query.search || '').trim().slice(0, 150);
      const filters = {
        status: req.query.status as string,
        brokerId: (req.query.brokerId as string) || (req.query.broker as string),
        search: rawSearch || undefined,
        moduleType: req.query.moduleType as string,
        page: Math.max(1, parseInt(req.query.page as string) || 1),
        limit: Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10)),
      };

      const result = await leadService.getAllLeads(filters, { user: req.user });

      res.json({
        success: true,
        message: 'Leads retrieved successfully',
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
      const lead = await leadService.getLeadById(req.params.id);
      if (!canBrokerAccessRecord(req.user, lead.moduleType, lead.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        message: 'Lead retrieved successfully',
        data: lead,
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
      const validated = createLeadSchema.parse(req.body);
      const effectiveBrokerId = this.getEffectiveBrokerId(req);
      const payload = {
        ...validated,
        brokerId: effectiveBrokerId || validated.brokerId,
      };
      const lead = await leadService.createLead(payload, { user: req.user });

      try {
        emitScopedEvent({
          event: 'lead:created',
          payload: lead,
          brokerId: lead.brokerId || null,
        });
        emitActivityNotification({
          action: 'lead_created',
          entityType: 'lead',
          entityId: lead.id,
          entityName: lead.name,
          brokerId: lead.brokerId || null,
          actor: req.user,
          payload: {
            leadId: lead.id,
            moduleType: lead.moduleType || null,
          },
        });
        emitDashboardRefresh({
          type: 'lead:created',
          id: lead.id,
          brokerId: lead.brokerId || null,
        });
      } catch (e) {
        // Realtime may not be initialized in some environments; ignore
        console.warn('Realtime not initialized - skipping emit');
      }

      res.status(201).json({
        success: true,
        message: 'Lead created successfully',
        data: lead,
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
      const validated = updateLeadSchema.parse(req.body);
      const existingLead = await leadService.getLeadById(req.params.id);
      const effectiveBrokerId = this.getEffectiveBrokerId(req);

      if (!canBrokerAccessRecord(req.user, existingLead.moduleType, existingLead.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      if (effectiveBrokerId && validated.brokerId && validated.brokerId !== effectiveBrokerId) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: broker cannot be reassigned',
          timestamp: new Date(),
        });
      }

      const payload = effectiveBrokerId
        ? { ...validated, brokerId: effectiveBrokerId }
        : validated;
      const lead = await leadService.updateLead(req.params.id, payload, { user: req.user });

      try {
        emitScopedEvent({
          event: 'lead:updated',
          payload: lead,
          brokerId: lead.brokerId || null,
        });
        emitActivityNotification({
          action:
            String(existingLead.status || '').trim() !== String(lead.status || '').trim()
              ? 'lead_status_changed'
              : 'lead_updated',
          entityType: 'lead',
          entityId: lead.id,
          entityName: lead.name,
          brokerId: lead.brokerId || null,
          actor: req.user,
          payload: {
            leadId: lead.id,
            moduleType: lead.moduleType || null,
          },
        });
        emitDashboardRefresh({
          type: 'lead:updated',
          id: lead.id,
          brokerId: lead.brokerId || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Lead updated successfully',
        data: lead,
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

  async updateComment(req: AuthRequest, res: Response) {
    try {
      const validated = updateLeadCommentSchema.parse(req.body);
      const existingLead = await leadService.getLeadById(req.params.id);
      if (!canBrokerAccessRecord(req.user, existingLead.moduleType, existingLead.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      const lead = await leadService.updateLeadComment(req.params.id, validated.comment, {
        user: req.user,
      });

      try {
        emitScopedEvent({
          event: 'lead:updated',
          payload: lead,
          brokerId: lead.brokerId || null,
        });
        emitActivityNotification({
          action: 'lead_comment_updated',
          entityType: 'lead',
          entityId: lead.id,
          entityName: lead.name,
          brokerId: lead.brokerId || null,
          actor: req.user,
          payload: {
            leadId: lead.id,
            dealId: lead.dealId || null,
            comment: lead.comment || null,
            moduleType: lead.moduleType || null,
          },
        });
        emitDashboardRefresh({
          type: 'lead:comment-updated',
          id: lead.id,
          brokerId: lead.brokerId || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Lead comment updated successfully',
        data: lead,
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

  async delete(req: AuthRequest, res: Response) {
    try {
      const existingLead = await leadService.getLeadById(req.params.id);
      if (!canBrokerAccessRecord(req.user, existingLead.moduleType, existingLead.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      await leadService.deleteLead(req.params.id, { user: req.user });

      try {
        emitScopedEvent({
          event: 'lead:deleted',
          payload: { id: req.params.id },
          brokerId: existingLead.brokerId || null,
        });
        emitActivityNotification({
          action: 'lead_deleted',
          entityType: 'lead',
          entityId: req.params.id,
          entityName: existingLead.name,
          brokerId: existingLead.brokerId || null,
          actor: req.user,
          payload: {
            leadId: req.params.id,
            moduleType: existingLead.moduleType || null,
          },
        });
        emitDashboardRefresh({
          type: 'lead:deleted',
          id: req.params.id,
          brokerId: existingLead.brokerId || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Lead deleted successfully',
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

  async workflow(req: AuthRequest, res: Response) {
    try {
      const validated = leadWorkflowSyncSchema.parse(req.body);
      const result = await leadWorkflowService.syncLeadWorkflow(req.params.id, validated, req.user);

      try {
        emitScopedEvent({
          event: 'lead:workflow',
          payload: result,
          brokerId: result.lead.brokerId || null,
        });
        emitActivityNotification({
          action: 'lead_workflow_synced',
          entityType: 'lead',
          entityId: result.lead.id,
          entityName: result.lead.name,
          brokerId: result.lead.brokerId || null,
          actor: req.user,
          payload: {
            leadId: result.lead.id,
            dealId: result.deal?.id || null,
            propertyId: result.propertyId,
            stockId: result.stockId,
            moduleType: result.lead.moduleType || null,
          },
        });
        emitDashboardRefresh({
          type: 'lead:workflow',
          id: result.lead.id,
          brokerId: result.lead.brokerId || null,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Lead workflow synced successfully',
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

  async getAnalytics(req: AuthRequest, res: Response) {
    try {
      const analytics = await leadService.getLeadAnalytics({ user: req.user });

      res.json({
        success: true,
        message: 'Analytics retrieved successfully',
        data: analytics,
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

export const leadController = new LeadController();
