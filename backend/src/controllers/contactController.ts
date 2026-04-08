import { Response } from 'express';
import { AuthRequest } from '@/types';
import { contactService } from '@/services/contactService';
import { createContactSchema, updateContactSchema } from '@/validators';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';
import { canBrokerAccessRecord } from '@/lib/departmentAccess';
import { emitActivityNotification } from '@/lib/realtimeNotifications';

function getRequestBrokerId(req: AuthRequest): string | null {
  if (!req.user || req.user.role !== 'broker') return null;
  return req.user.brokerId || req.user.id;
}

export class ContactController {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const filters = {
        type: req.query.type as string,
        status: req.query.status as string,
        moduleType: req.query.moduleType as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 10,
      };

      const result = await contactService.getAllContacts(filters, { user: req.user });

      res.json({
        success: true,
        message: 'Contacts retrieved successfully',
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
      const contact = await contactService.getContactById(req.params.id);
      if (!canBrokerAccessRecord(req.user, contact.moduleType, contact.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        message: 'Contact retrieved successfully',
        data: contact,
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
      const validated = createContactSchema.parse(req.body);
      const contact = await contactService.createContact(validated, { user: req.user });
      const brokerId = getRequestBrokerId(req);

      try {
        emitScopedEvent({
          event: 'contact:created',
          payload: contact,
          brokerId: contact.brokerId || brokerId,
        });
        emitActivityNotification({
          action: 'contact_created',
          entityType: 'contact',
          entityId: contact.id,
          entityName: contact.name,
          brokerId: contact.brokerId || brokerId,
          actor: req.user,
          payload: {
            contactId: contact.id,
            moduleType: contact.moduleType || null,
          },
        });
        emitDashboardRefresh({
          type: 'contact:created',
          id: contact.id,
          brokerId: contact.brokerId || brokerId,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.status(201).json({
        success: true,
        message: 'Contact created successfully',
        data: contact,
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
      const validated = updateContactSchema.parse(req.body);
      const brokerId = getRequestBrokerId(req);
      const existing = await contactService.getContactById(req.params.id);
      if (!canBrokerAccessRecord(req.user, existing.moduleType, existing.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      if (brokerId && validated.brokerId && validated.brokerId !== brokerId) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: broker cannot be reassigned',
          timestamp: new Date(),
        });
      }

      const contact = await contactService.updateContact(req.params.id, validated, { user: req.user });

      try {
        emitScopedEvent({
          event: 'contact:updated',
          payload: contact,
          brokerId: contact.brokerId || brokerId,
        });
        emitActivityNotification({
          action: 'contact_updated',
          entityType: 'contact',
          entityId: contact.id,
          entityName: contact.name,
          brokerId: contact.brokerId || brokerId,
          actor: req.user,
          payload: {
            contactId: contact.id,
            moduleType: contact.moduleType || null,
          },
        });
        emitDashboardRefresh({
          type: 'contact:updated',
          id: contact.id,
          brokerId: contact.brokerId || brokerId,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Contact updated successfully',
        data: contact,
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
      const existing = await contactService.getContactById(req.params.id);
      if (!canBrokerAccessRecord(req.user, existing.moduleType, existing.brokerId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: cross-broker access denied',
          timestamp: new Date(),
        });
      }

      const brokerId = getRequestBrokerId(req);
      await contactService.deleteContact(req.params.id, { user: req.user });

      try {
        emitScopedEvent({
          event: 'contact:deleted',
          payload: { id: req.params.id },
          brokerId: existing.brokerId || brokerId,
        });
        emitActivityNotification({
          action: 'contact_deleted',
          entityType: 'contact',
          entityId: req.params.id,
          entityName: existing.name,
          brokerId: existing.brokerId || brokerId,
          actor: req.user,
          payload: {
            contactId: req.params.id,
            moduleType: existing.moduleType || null,
          },
        });
        emitDashboardRefresh({
          type: 'contact:deleted',
          id: req.params.id,
          brokerId: existing.brokerId || brokerId,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Contact deleted successfully',
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

export const contactController = new ContactController();
