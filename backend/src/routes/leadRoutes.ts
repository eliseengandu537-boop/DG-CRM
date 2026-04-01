import { Router } from 'express';
import { leadController } from '@/controllers/leadController';
import { authMiddleware } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';

const router = Router();

router.get('/', authMiddleware, (req, res) => leadController.getAll(req, res));
router.get('/analytics', authMiddleware, (req, res) => leadController.getAnalytics(req, res));
router.get('/:id', authMiddleware, (req, res) => leadController.getById(req, res));
router.post('/:id/workflow', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  leadController.workflow(req, res)
);
router.post('/', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  leadController.create(req, res)
);
router.patch('/:id/comment', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  leadController.updateComment(req, res)
);
router.put('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  leadController.update(req, res)
);
router.delete('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  leadController.delete(req, res)
);

export default router;
