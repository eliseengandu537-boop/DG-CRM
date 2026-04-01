import { Router } from 'express';
import { requireAuth, requireRoles } from '@/middlewares';
import { activityController } from '@/controllers/activityController';

const router = Router();

router.get('/', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  activityController.getAll(req, res)
);
router.get('/:id', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  activityController.getById(req, res)
);
router.delete('/:id', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  activityController.delete(req, res)
);

export default router;
