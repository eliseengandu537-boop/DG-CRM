import { Router } from 'express';
import { industryController } from '@/controllers/industryController';
import { authMiddleware } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';

const router = Router();

router.get('/', authMiddleware, (req, res) => industryController.getAll(req, res));
router.get('/:id', authMiddleware, (req, res) => industryController.getById(req, res));
router.post('/', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  industryController.create(req, res)
);
router.put('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  industryController.update(req, res)
);
router.delete('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  industryController.delete(req, res)
);

export default router;
