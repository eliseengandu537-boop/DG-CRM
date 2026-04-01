import { Router } from 'express';
import { customRecordController } from '@/controllers/customRecordController';
import { authMiddleware } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';

const router = Router();

router.get('/', authMiddleware, (req, res) => customRecordController.getAll(req, res));
router.get('/:id', authMiddleware, (req, res) => customRecordController.getById(req, res));
router.post(
  '/',
  authMiddleware,
  requireRoles('admin', 'manager', 'broker'),
  (req, res) => customRecordController.create(req, res)
);
router.put(
  '/:id',
  authMiddleware,
  requireRoles('admin', 'manager', 'broker'),
  (req, res) => customRecordController.update(req, res)
);
router.delete(
  '/:id',
  authMiddleware,
  requireRoles('admin', 'manager', 'broker'),
  (req, res) => customRecordController.delete(req, res)
);

export default router;
