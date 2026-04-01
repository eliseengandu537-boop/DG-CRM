import { Router } from 'express';
import { requireAuth, requireRoles } from '@/middlewares';
import { notificationController } from '@/controllers/notificationController';

const router = Router();

router.get('/', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  notificationController.getAll(req, res)
);
router.get('/:id', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  notificationController.getById(req, res)
);
router.patch('/:id/read', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  notificationController.markRead(req, res)
);

export default router;
