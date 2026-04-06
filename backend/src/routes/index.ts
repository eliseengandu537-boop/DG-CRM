import { Router, Request, Response } from 'express';
import authRoutes from './authRoutes';
import leadRoutes from './leadRoutes';
import dealRoutes from './dealRoutes';
import brokerRoutes from './brokerRoutes';
import contactRoutes from './contactRoutes';
import userRoutes from './userRoutes';
import emailRoutes from './emailRoutes';
import propertyRoutes from './propertyRoutes';
import stockItemRoutes from './stockItemRoutes';
import tenantRoutes from './tenantRoutes';
import landlordRoutes from './landlordRoutes';
import industryRoutes from './industryRoutes';
import forecastDealRoutes from './forecastDealRoutes';
import dashboardRoutes from './dashboardRoutes';
import legalDocRoutes from './legalDocRoutes';
import documentRoutes from './documentRoutes';
import reminderRoutes from './reminderRoutes';
import customRecordRoutes from './customRecordRoutes';
import activityRoutes from './activityRoutes';
import notificationRoutes from './notificationRoutes';
import brochureRoutes from './brochureRoutes';
import { createRateLimiter } from '@/middlewares/rateLimit';

const router = Router();

// Global rate limiter: 150 requests per minute per IP across all API routes
const globalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 150,
  keyPrefix: 'api:global',
  message: 'Too many requests. Please slow down.',
});

router.use(globalRateLimiter);

// Health check
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    uptime: process.uptime(),
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/leads', leadRoutes);
router.use('/deals', dealRoutes);
router.use('/brokers', brokerRoutes);
router.use('/contacts', contactRoutes);
router.use('/users', userRoutes);
router.use('/email', emailRoutes);
router.use('/properties', propertyRoutes);
router.use('/stock-items', stockItemRoutes);
router.use('/tenants', tenantRoutes);
router.use('/landlords', landlordRoutes);
router.use('/industries', industryRoutes);
router.use('/forecast-deals', forecastDealRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/legal-docs', legalDocRoutes);
router.use('/documents', documentRoutes);
router.use('/reminders', reminderRoutes);
router.use('/custom-records', customRecordRoutes);
router.use('/activities', activityRoutes);
router.use('/notifications', notificationRoutes);
router.use('/brochures', brochureRoutes);

export default router;
