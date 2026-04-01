import { Router } from 'express';
import { tenantController } from '@/controllers/tenantController';
import { authMiddleware } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';

const router = Router();

router.get('/', authMiddleware, (req, res) => tenantController.getAll(req, res));
router.get('/:id', authMiddleware, (req, res) => tenantController.getById(req, res));
router.post('/', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  tenantController.create(req, res)
);
router.put('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  tenantController.update(req, res)
);
router.delete('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  tenantController.delete(req, res)
);

export default router;
