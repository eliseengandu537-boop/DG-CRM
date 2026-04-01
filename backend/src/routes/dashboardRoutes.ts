import { Router } from 'express';
import { authMiddleware } from '@/middlewares';
import { dashboardController } from '@/controllers/dashboardController';

const router = Router();

router.get('/metrics', authMiddleware, (req, res) => dashboardController.getMetrics(req, res));

export default router;
