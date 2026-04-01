import { Router } from 'express';
import { emailController } from '@/controllers/emailController';
import { authMiddleware, adminMiddleware } from '@/middlewares';

const router = Router();

router.get('/health', authMiddleware, adminMiddleware, (req, res) =>
  emailController.health(req, res)
);
router.post('/test', authMiddleware, adminMiddleware, (req, res) =>
  emailController.test(req, res)
);

export default router;
