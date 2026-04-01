import { Router } from 'express';
import { authController } from '@/controllers/authController';
import { requireAuth } from '@/middlewares';
import { requireRoles } from '@/middlewares/roles';
import { createRateLimiter } from '@/middlewares/rateLimit';

const router = Router();

const registerRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyPrefix: 'auth:register',
});

const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  keyPrefix: 'auth:login',
  message: 'Too many login attempts. Please try again in a few minutes.',
});

const refreshRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 40,
  keyPrefix: 'auth:refresh',
});

router.post('/register', requireAuth, requireRoles('admin', 'manager'), registerRateLimiter, (req: any, res: any) =>
  authController.register(req, res)
);
router.post('/login', loginRateLimiter, (req: any, res: any) => authController.login(req, res));
router.post('/refresh', refreshRateLimiter, (req: any, res: any) => authController.refresh(req, res));
router.get('/me', requireAuth, (req: any, res: any) => authController.getCurrentUser(req, res));
router.post('/logout', (req: any, res: any) => authController.logout(req, res));

export default router;
