import { Response } from 'express';
import { AuthRequest } from '@/types';
import { landlordService } from '@/services/landlordService';
import { createLandlordSchema, updateLandlordSchema } from '@/validators';

export class LandlordController {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const filters = {
        status: req.query.status as string,
        search: req.query.search as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
      };

      const result = await landlordService.getAllLandlords(filters);

      res.json({
        success: true,
        message: 'Landlords retrieved successfully',
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
      const landlord = await landlordService.getLandlordById(req.params.id);

      res.json({
        success: true,
        message: 'Landlord retrieved successfully',
        data: landlord,
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
      const validated = createLandlordSchema.parse(req.body);
      const landlord = await landlordService.createLandlord(validated);

      res.status(201).json({
        success: true,
        message: 'Landlord created successfully',
        data: landlord,
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
      const validated = updateLandlordSchema.parse(req.body);
      const landlord = await landlordService.updateLandlord(req.params.id, validated);

      res.json({
        success: true,
        message: 'Landlord updated successfully',
        data: landlord,
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
      await landlordService.deleteLandlord(req.params.id);

      res.json({
        success: true,
        message: 'Landlord deleted successfully',
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

export const landlordController = new LandlordController();
