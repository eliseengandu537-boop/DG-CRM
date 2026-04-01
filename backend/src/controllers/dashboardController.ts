import { Response } from 'express';
import { AuthRequest } from '@/types';
import { dashboardService } from '@/services/dashboardService';

export class DashboardController {
  async getMetrics(req: AuthRequest, res: Response) {
    try {
      const data = await dashboardService.getMetrics(req);
      return res.json({
        success: true,
        message: 'Dashboard metrics retrieved successfully',
        data,
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to load dashboard metrics',
        timestamp: new Date(),
      });
    }
  }
}

export const dashboardController = new DashboardController();
