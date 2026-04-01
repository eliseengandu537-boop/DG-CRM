import { Response } from 'express';
import { AuthRequest } from '@/types';
import { brochureService } from '@/services/brochureService';

function toPositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class BrochureController {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const filters = {
        search: String(req.query.search || '').trim() || undefined,
        page: toPositiveNumber(req.query.page, 1),
        limit: toPositiveNumber(req.query.limit, 50),
      };

      const result = await brochureService.getAllBrochures(filters, { user: req.user });
      return res.json({
        success: true,
        message: 'Brochures retrieved successfully',
        data: result,
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to fetch brochures',
        timestamp: new Date(),
      });
    }
  }

  async getById(req: AuthRequest, res: Response) {
    try {
      const brochure = await brochureService.getBrochureById(req.params.id, { user: req.user });
      return res.json({
        success: true,
        message: 'Brochure retrieved successfully',
        data: brochure,
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = String(error?.message || 'Brochure not found');
      const statusCode = message.toLowerCase().includes('forbidden') ? 403 : 404;
      return res.status(statusCode).json({
        success: false,
        message,
        timestamp: new Date(),
      });
    }
  }

  async create(req: AuthRequest, res: Response) {
    try {
      const brochure = await brochureService.createBrochure(req.body || {}, { user: req.user });
      return res.status(201).json({
        success: true,
        message: 'Brochure created successfully',
        data: brochure,
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to create brochure',
        timestamp: new Date(),
      });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      const brochure = await brochureService.updateBrochure(req.params.id, req.body || {}, {
        user: req.user,
      });
      return res.json({
        success: true,
        message: 'Brochure updated successfully',
        data: brochure,
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = String(error?.message || 'Failed to update brochure');
      const statusCode =
        message.toLowerCase().includes('forbidden')
          ? 403
          : message.toLowerCase().includes('not found')
          ? 404
          : 400;
      return res.status(statusCode).json({
        success: false,
        message,
        timestamp: new Date(),
      });
    }
  }

  async delete(req: AuthRequest, res: Response) {
    try {
      await brochureService.deleteBrochure(req.params.id, { user: req.user });
      return res.json({
        success: true,
        message: 'Brochure deleted successfully',
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = String(error?.message || 'Failed to delete brochure');
      const statusCode =
        message.toLowerCase().includes('forbidden')
          ? 403
          : message.toLowerCase().includes('not found')
          ? 404
          : 400;
      return res.status(statusCode).json({
        success: false,
        message,
        timestamp: new Date(),
      });
    }
  }

  async sendEmail(req: AuthRequest, res: Response) {
    try {
      const result = await brochureService.sendBrochureEmail(req.params.id, { user: req.user });
      return res.json({
        success: true,
        message: 'Brochure email sent successfully',
        data: result,
        timestamp: new Date(),
      });
    } catch (error: any) {
      const message = String(error?.message || 'Failed to send brochure email');
      const statusCode =
        message.toLowerCase().includes('forbidden')
          ? 403
          : message.toLowerCase().includes('not found')
          ? 404
          : 400;
      return res.status(statusCode).json({
        success: false,
        message,
        timestamp: new Date(),
      });
    }
  }
}

export const brochureController = new BrochureController();
