import { Router } from 'express';
import { reminderController } from '@/controllers/reminderController';
import { requireAuth, requireRoles } from '@/middlewares';

const router = Router();

router.get('/', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  reminderController.getAll(req, res)
);
router.get('/:id', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  reminderController.getById(req, res)
);
router.post('/', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  reminderController.create(req, res)
);
router.put('/:id', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  reminderController.update(req, res)
);
router.patch('/:id/complete', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  reminderController.complete(req, res)
);
router.delete('/:id', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  reminderController.delete(req, res)
);

export default router;
