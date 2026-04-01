import { Response } from 'express';
import { AuthRequest } from '@/types';
import { tenantService } from '@/services/tenantService';
import { createTenantSchema, updateTenantSchema } from '@/validators';

export class TenantController {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const filters = {
        status: req.query.status as string,
        leaseStatus: req.query.leaseStatus as string,
        search: req.query.search as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
      };

      const result = await tenantService.getAllTenants(filters);

      res.json({
        success: true,
        message: 'Tenants retrieved successfully',
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
      const tenant = await tenantService.getTenantById(req.params.id);

      res.json({
        success: true,
        message: 'Tenant retrieved successfully',
        data: tenant,
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
      const validated = createTenantSchema.parse(req.body);
      const tenant = await tenantService.createTenant(validated);

      res.status(201).json({
        success: true,
        message: 'Tenant created successfully',
        data: tenant,
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
      const validated = updateTenantSchema.parse(req.body);
      const tenant = await tenantService.updateTenant(req.params.id, validated);

      res.json({
        success: true,
        message: 'Tenant updated successfully',
        data: tenant,
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
      await tenantService.deleteTenant(req.params.id);

      res.json({
        success: true,
        message: 'Tenant deleted successfully',
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

export const tenantController = new TenantController();
