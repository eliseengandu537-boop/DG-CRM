import { Router } from 'express';
import { auditLogController } from '@/controllers/auditLogController';
import { authMiddleware } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';

const router = Router();

// Admin + manager only — the audit trail can expose every system change.
router.get('/', authMiddleware, requireRoles('admin', 'manager'), (req, res) =>
  auditLogController.list(req, res)
);

export default router;
