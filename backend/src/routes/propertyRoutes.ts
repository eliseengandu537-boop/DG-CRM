import { Router } from 'express';
import { propertyController } from '@/controllers/propertyController';
import { authMiddleware } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';

const router = Router();

router.get('/', authMiddleware, (req, res) =>
  propertyController.getAll(req, res)
);
router.get('/:id', authMiddleware, (req, res) =>
  propertyController.getById(req, res)
);
router.post('/', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  propertyController.create(req, res)
);
router.put('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  propertyController.update(req, res)
);
router.delete('/:id', authMiddleware, requireRoles('admin'), (req, res) =>
  propertyController.delete(req, res)
);

export default router;
