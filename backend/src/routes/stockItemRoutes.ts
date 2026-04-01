import { Router } from 'express';
import { stockItemController } from '@/controllers/stockItemController';
import { authMiddleware } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';

const router = Router();

router.get('/', authMiddleware, (req, res) => stockItemController.getAll(req, res));
router.get('/:id', authMiddleware, (req, res) => stockItemController.getById(req, res));
router.post('/', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  stockItemController.create(req, res)
);
router.put('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  stockItemController.update(req, res)
);
router.delete('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  stockItemController.delete(req, res)
);

export default router;
