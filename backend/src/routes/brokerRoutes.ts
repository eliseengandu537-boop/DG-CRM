import { Router } from 'express';
import { brokerController } from '@/controllers/brokerController';
import { authMiddleware } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';
import { createRateLimiter } from '@/middlewares/rateLimit';

const router = Router();
const brokerValidationRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyPrefix: 'broker:validate-password',
  message: 'Too many broker validation attempts. Please try again later.',
});

router.get('/', authMiddleware, (req, res) => brokerController.getAll(req, res));
router.get('/archived', authMiddleware, requireRoles('admin', 'manager'), (req, res) =>
  brokerController.getArchived(req, res)
);
router.get('/stats', authMiddleware, (req, res) => brokerController.getStats(req, res));
// Must be BEFORE /:id so it doesn't get swallowed as an id lookup
router.get('/me', authMiddleware, (req, res) => brokerController.getMe(req, res));
router.get('/:id', authMiddleware, (req, res) => brokerController.getById(req, res));
router.post('/', authMiddleware, requireRoles('admin', 'manager'), (req, res) =>
  brokerController.create(req, res)
);
router.put('/:id', authMiddleware, requireRoles('admin', 'manager'), (req, res) =>
  brokerController.update(req, res)
);
router.delete('/:id', authMiddleware, requireRoles('admin'), (req, res) =>
  brokerController.delete(req, res)
);
router.delete('/:id/permanent', authMiddleware, requireRoles('admin'), (req, res) =>
  brokerController.purgeArchived(req, res)
);
router.post('/:id/generate-password', authMiddleware, requireRoles('admin', 'manager'), (req, res) =>
  brokerController.generatePassword(req, res)
);
router.post(
  '/:id/validate-password',
  authMiddleware,
  requireRoles('admin', 'manager'),
  brokerValidationRateLimiter,
  (req, res) => brokerController.validatePassword(req, res)
);
// Backward-compatible aliases
router.post('/:id/generate-pin', authMiddleware, requireRoles('admin', 'manager'), (req, res) =>
  brokerController.generatePin(req, res)
);
router.post(
  '/:id/validate-pin',
  authMiddleware,
  requireRoles('admin', 'manager'),
  brokerValidationRateLimiter,
  (req, res) => brokerController.validatePin(req, res)
);

export default router;
