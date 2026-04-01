import { Router } from 'express';
import { legalDocController } from '@/controllers/legalDocController';
import { requireAuth, requireRoles } from '@/middlewares';

const router = Router();

router.get('/', requireAuth, (req, res) => legalDocController.getAll(req, res));
router.post('/link', requireAuth, (req, res) => legalDocController.linkToDeal(req, res));
router.get('/:id', requireAuth, (req, res) => legalDocController.getById(req, res));
router.delete('/cleanup/temporary', requireAuth, requireRoles('admin', 'manager'), (req, res) =>
  legalDocController.cleanupTemporary(req, res)
);
router.post('/', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  legalDocController.create(req, res)
);
router.put('/:id', requireAuth, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  legalDocController.update(req, res)
);
router.delete('/:id', requireAuth, requireRoles('admin', 'manager'), (req, res) =>
  legalDocController.delete(req, res)
);

export default router;
