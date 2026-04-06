import { Router } from 'express';
import { brochureController } from '@/controllers/brochureController';
import { authMiddleware, requireRoles } from '@/middlewares';

const router = Router();

router.get('/', authMiddleware, (req, res) => brochureController.getAll(req, res));
router.get('/:id', authMiddleware, (req, res) => brochureController.getById(req, res));
router.post('/', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) => brochureController.create(req, res));
router.put('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) => brochureController.update(req, res));
router.delete('/:id', authMiddleware, requireRoles('admin', 'manager'), (req, res) => brochureController.delete(req, res));
router.post('/:id/send-email', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) => brochureController.sendEmail(req, res));

export default router;
