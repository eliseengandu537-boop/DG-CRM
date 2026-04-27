import { Router } from 'express';
import { propertyController } from '@/controllers/propertyController';
import { authMiddleware } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authMiddleware, (req, res) =>
  propertyController.getAll(req, res)
);
router.get('/:id', authMiddleware, (req, res) =>
  propertyController.getById(req, res)
);
router.post('/', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  propertyController.create(req, res)
);
router.post('/import', authMiddleware, requireRoles('admin', 'manager'), upload.single('file'), (req, res) =>
  propertyController.importProperties(req, res)
);
router.put('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  propertyController.update(req, res)
);
router.delete('/:id', authMiddleware, requireRoles('admin'), (req, res) =>
  propertyController.delete(req, res)
);

export default router;
