import { Router } from 'express';
import { customRecordController } from '@/controllers/customRecordController';
import { authMiddleware } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authMiddleware, (req, res) => customRecordController.getAll(req, res));
router.get('/:id', authMiddleware, (req, res) => customRecordController.getById(req, res));
router.post(
  '/',
  authMiddleware,
  requireRoles('admin', 'manager', 'broker'),
  (req, res) => customRecordController.create(req, res)
);
router.post(
  '/import-funds',
  authMiddleware,
  requireRoles('admin', 'manager'),
  upload.single('file'),
  (req, res) => customRecordController.importFunds(req, res)
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
