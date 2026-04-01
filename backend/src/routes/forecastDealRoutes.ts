import { Router } from 'express';
import { forecastDealController } from '@/controllers/forecastDealController';
import { authMiddleware } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';

const router = Router();

router.get('/', authMiddleware, (req, res) => forecastDealController.getAll(req, res));
router.post('/wip/status', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  forecastDealController.updateWipStatus(req, res)
);
router.get('/:id', authMiddleware, (req, res) => forecastDealController.getById(req, res));
router.post('/', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  forecastDealController.create(req, res)
);
router.put('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  forecastDealController.update(req, res)
);
router.delete('/:id', authMiddleware, requireRoles('admin', 'manager', 'broker'), (req, res) =>
  forecastDealController.delete(req, res)
);

export default router;
