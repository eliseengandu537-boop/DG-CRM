import { Router } from 'express';
import { userController } from '@/controllers/userController';
import { requireAuth } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';

const router = Router();

// Only admin/manager can manage users
router.post('/', requireAuth, requireRoles('admin'), (req, res) => userController.createManager(req, res));
router.get('/', requireAuth, requireRoles('admin', 'manager'), (req, res) => userController.listUsers(req, res));
router.get('/export', requireAuth, requireRoles('admin', 'manager'), (req, res) => userController.exportUsers(req, res));
router.put('/:id', requireAuth, requireRoles('admin'), (req, res) => userController.updateUser(req, res));
router.delete('/:id', requireAuth, requireRoles('admin'), (req, res) => userController.deleteUser(req, res));

export default router;
