import { Response } from 'express';
import { AuthRequest } from '@/types';
import { auditLogService } from '@/services/auditLogService';

export class AuditLogController {
  async list(req: AuthRequest, res: Response) {
    try {
      const q = req.query;
      const parseDate = (v: unknown): Date | undefined => {
        if (!v || typeof v !== 'string') return undefined;
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? undefined : d;
      };

      const result = await auditLogService.list({
        entityType: typeof q.entityType === 'string' ? q.entityType : undefined,
        entityId: typeof q.entityId === 'string' ? q.entityId : undefined,
        action: typeof q.action === 'string' ? q.action : undefined,
        actorUserId: typeof q.actorUserId === 'string' ? q.actorUserId : undefined,
        brokerId: typeof q.brokerId === 'string' ? q.brokerId : undefined,
        search: typeof q.search === 'string' ? q.search : undefined,
        from: parseDate(q.from),
        to: parseDate(q.to),
        page: Number(q.page) || 1,
        limit: Number(q.limit) || 50,
      });

      res.json({
        success: true,
        message: 'Audit logs retrieved successfully',
        data: result,
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch audit logs',
        timestamp: new Date(),
      });
    }
  }
}

export const auditLogController = new AuditLogController();
