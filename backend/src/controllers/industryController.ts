import { Response } from 'express';
import { AuthRequest } from '@/types';
import { industryService } from '@/services/industryService';
import { createIndustrySchema, updateIndustrySchema } from '@/validators';

export class IndustryController {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const filters = {
        status: req.query.status as string,
        search: req.query.search as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
      };

      const result = await industryService.getAllIndustries(filters);

      res.json({
        success: true,
        message: 'Industries retrieved successfully',
        data: result,
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }

  async getById(req: AuthRequest, res: Response) {
    try {
      const industry = await industryService.getIndustryById(req.params.id);

      res.json({
        success: true,
        message: 'Industry retrieved successfully',
        data: industry,
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }

  async create(req: AuthRequest, res: Response) {
    try {
      const validated = createIndustrySchema.parse(req.body);
      const industry = await industryService.createIndustry(validated);

      res.status(201).json({
        success: true,
        message: 'Industry created successfully',
        data: industry,
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      const validated = updateIndustrySchema.parse(req.body);
      const industry = await industryService.updateIndustry(req.params.id, validated);

      res.json({
        success: true,
        message: 'Industry updated successfully',
        data: industry,
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }

  async delete(req: AuthRequest, res: Response) {
    try {
      await industryService.deleteIndustry(req.params.id);

      res.json({
        success: true,
        message: 'Industry deleted successfully',
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }
}

export const industryController = new IndustryController();
