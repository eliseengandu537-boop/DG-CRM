import { Response } from 'express';
import { AuthRequest } from '@/types';
import { brokerService } from '@/services/brokerService';
import { createBrokerSchema, updateBrokerSchema } from '@/validators';
import { emitDashboardRefresh, emitScopedEvent } from '@/realtime';
import { isDatabaseConnectionError } from '@/lib/databaseErrors';

export class BrokerController {
  private formatErrorMessage(error: unknown): string {
    if (isDatabaseConnectionError(error)) {
      return 'Database temporarily unavailable. Broker data cannot be loaded right now.';
    }

    const message = String((error as any)?.message || '');
    const lower = message.toLowerCase();
    if (
      lower.includes('prisma.') ||
      lower.includes('server selection timeout') ||
      lower.includes('replicasetnoprimary') ||
      lower.includes('connectorerror') ||
      message.includes('C:\\') ||
      message.includes('/src/')
    ) {
      return 'Request failed due to a backend data error. Please try again.';
    }

    return message || 'Request failed';
  }

  private handleError(res: Response, error: unknown, fallbackStatus = 500) {
    const statusCode = isDatabaseConnectionError(error) ? 503 : fallbackStatus;
    return res.status(statusCode).json({
      success: false,
      message: this.formatErrorMessage(error),
      timestamp: new Date(),
    });
  }

  async getAll(req: AuthRequest, res: Response) {
    try {
      const includeArchived = String(req.query?.includeArchived || '').toLowerCase() === 'true';
      const brokers = await brokerService.getAllBrokers({ includeArchived });

      res.json({
        success: true,
        message: 'Brokers retrieved successfully',
        data: brokers,
        timestamp: new Date(),
      });
    } catch (error: unknown) {
      return this.handleError(res, error, 500);
    }
  }

  async getArchived(req: AuthRequest, res: Response) {
    try {
      const archivedBrokers = await brokerService.getArchivedBrokers();

      res.json({
        success: true,
        message: 'Archived brokers retrieved successfully',
        data: archivedBrokers,
        timestamp: new Date(),
      });
    } catch (error: unknown) {
      return this.handleError(res, error, 500);
    }
  }

  async getById(req: AuthRequest, res: Response) {
    try {
      const broker = await brokerService.getBrokerById(req.params.id);

      res.json({
        success: true,
        message: 'Broker retrieved successfully',
        data: broker,
        timestamp: new Date(),
      });
    } catch (error: unknown) {
      return this.handleError(res, error, 404);
    }
  }

  async create(req: AuthRequest, res: Response) {
    try {
      const validated = createBrokerSchema.parse(req.body);
      const result = await brokerService.createBroker(validated, { user: req.user });

      const message = result.passwordSent
        ? 'Broker created successfully and password email sent'
        : 'Broker created successfully, but password email could not be sent';

      try {
        emitScopedEvent({
          event: 'broker:created',
          payload: result.broker,
          brokerId: result.broker.id,
        });
        emitDashboardRefresh({
          type: 'broker:created',
          id: result.broker.id,
          brokerId: result.broker.id,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.status(201).json({
        success: true,
        message,
        data: result.broker,
        meta: {
          passwordSent: result.passwordSent,
          passwordError: result.passwordError,
          temporaryPassword: result.temporaryPassword,
        },
        timestamp: new Date(),
      });
    } catch (error: unknown) {
      return this.handleError(res, error, 400);
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      const validated = updateBrokerSchema.parse(req.body);
      const broker = await brokerService.updateBroker(req.params.id, validated, { user: req.user });

      try {
        emitScopedEvent({
          event: 'broker:updated',
          payload: broker,
          brokerId: broker.id,
        });
        emitDashboardRefresh({
          type: 'broker:updated',
          id: broker.id,
          brokerId: broker.id,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Broker updated successfully',
        data: broker,
        timestamp: new Date(),
      });
    } catch (error: unknown) {
      return this.handleError(res, error, 400);
    }
  }

  async delete(req: AuthRequest, res: Response) {
    try {
      const permanent = String(req.query?.permanent || '').toLowerCase() === 'true';

      await brokerService.deleteBroker(req.params.id, {
        userId: req.user?.id,
        name: req.user?.name,
        email: req.user?.email,
      }, {
        permanent,
        actorRole: req.user?.role,
      });

      try {
        emitScopedEvent({
          event: permanent ? 'broker:purged' : 'broker:deleted',
          payload: { id: req.params.id, permanent },
          brokerId: req.params.id,
        });
        emitDashboardRefresh({
          type: permanent ? 'broker:purged' : 'broker:deleted',
          id: req.params.id,
          brokerId: req.params.id,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: permanent
          ? 'Archived broker deleted permanently.'
          : 'Broker archived successfully. Login access revoked.',
        timestamp: new Date(),
      });
    } catch (error: unknown) {
      return this.handleError(res, error, 404);
    }
  }

  async purgeArchived(req: AuthRequest, res: Response) {
    try {
      await brokerService.deleteBroker(req.params.id, {
        userId: req.user?.id,
        name: req.user?.name,
        email: req.user?.email,
      }, {
        permanent: true,
        actorRole: req.user?.role,
      });

      try {
        emitScopedEvent({
          event: 'broker:purged',
          payload: { id: req.params.id },
          brokerId: req.params.id,
        });
        emitDashboardRefresh({
          type: 'broker:purged',
          id: req.params.id,
          brokerId: req.params.id,
        });
      } catch {
        console.warn('Realtime not initialized - skipping emit');
      }

      res.json({
        success: true,
        message: 'Archived broker deleted successfully.',
        timestamp: new Date(),
      });
    } catch (error: unknown) {
      return this.handleError(res, error, 400);
    }
  }

  async generatePassword(req: AuthRequest, res: Response) {
    try {
      const result = await brokerService.generateAndSendPassword(req.params.id);
      const message = result.passwordSent
        ? 'Password generated and sent successfully'
        : 'Password generated successfully, but email could not be sent';

      res.json({
        success: true,
        message,
        data: { temporaryPassword: result.temporaryPassword },
        meta: {
          passwordSent: result.passwordSent,
          passwordError: result.passwordError,
        },
        timestamp: new Date(),
      });
    } catch (error: unknown) {
      return this.handleError(res, error, 400);
    }
  }

  async validatePassword(req: AuthRequest, res: Response) {
    try {
      const { password } = req.body;
      const isValid = await brokerService.validateBrokerPassword(req.params.id, password);

      res.json({
        success: true,
        message: 'Password validation result',
        data: { isValid },
        timestamp: new Date(),
      });
    } catch (error: unknown) {
      return this.handleError(res, error, 400);
    }
  }

  // Backward-compatible wrappers
  async generatePin(req: AuthRequest, res: Response) {
    return this.generatePassword(req, res);
  }

  async validatePin(req: AuthRequest, res: Response) {
    const bodyWithPassword = {
      ...req.body,
      password: req.body?.password ?? req.body?.pin ?? '',
    };
    (req as any).body = bodyWithPassword;
    return this.validatePassword(req, res);
  }

  async getStats(req: AuthRequest, res: Response) {
    try {
      const stats = await brokerService.getBrokerStats();

      res.json({
        success: true,
        message: 'Broker statistics retrieved successfully',
        data: stats,
        timestamp: new Date(),
      });
    } catch (error: unknown) {
      return this.handleError(res, error, 500);
    }
  }
}

export const brokerController = new BrokerController();
