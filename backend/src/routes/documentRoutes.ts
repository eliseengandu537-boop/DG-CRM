import { Router } from 'express';
import { legalDocController } from '@/controllers/legalDocController';
import { requireAuth } from '@/middlewares';

const router = Router();

router.post('/link', requireAuth, (req, res) => legalDocController.linkToDeal(req, res));
router.get('/:id', requireAuth, (req, res) => legalDocController.getById(req, res));

export default router;
