import { Router } from 'express';
import { dealController } from '@/controllers/dealController';
import { authMiddleware } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';

const router = Router();

router.get('/', authMiddleware, (req, res) => dealController.getAll(req, res));
router.post(
  '/inactivity/scan',
  authMiddleware,
  requireRoles('admin', 'manager'),
  (req, res) => dealController.runInactivityScan(req, res)
);
router.get('/:id', authMiddleware, (req, res) => dealController.getById(req, res));
router.get('/:id/activities', authMiddleware, (req, res) => dealController.getActivities(req, res));
router.post('/', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  dealController.create(req, res)
);
router.put('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  dealController.update(req, res)
);
router.delete('/:id', authMiddleware, requireRoles('admin'), (req, res) => dealController.delete(req, res));

export default router;
