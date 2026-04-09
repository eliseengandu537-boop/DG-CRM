/**
 * Lead Service
 * Handles all lead-related CRUD operations via API
 */

import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  moduleType?: string;
  stage?: string;
  company?: string;
  leadSource?: string;
  dealType?: string;
  probability?: number;
  closingTimeline?: string;
  notes?: string;
  comment?: string;
  contactId?: string;
  brokerAssigned?: string;
  additionalBroker?: string;
  commissionSplit?: Record<string, number>;
  propertyAddress?: string;
  leadType?: string;
  linkedStockId?: string;
  dealId?: string;
  forecastDealId?: string;
  legalDocumentId?: string;
  status: string;
  value: number;
  broker?: string;
  property?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeadRequest {
  name: string;
  email: string;
  phone?: string;
  status?: string;
  value?: number;
  brokerId?: string;
  propertyId?: string;
  moduleType?: string;
  stage?: string;
  company?: string;
  leadSource?: string;
  dealType?: string;
  probability?: number;
  closingTimeline?: string;
  notes?: string;
  comment?: string;
  contactId?: string;
  brokerAssigned?: string;
  additionalBroker?: string;
  commissionSplit?: Record<string, number>;
  propertyAddress?: string;
  leadType?: string;
  linkedStockId?: string;
  dealId?: string;
  forecastDealId?: string;
  legalDocumentId?: string;
}

export interface LeadFilters {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  broker?: string;
  brokerId?: string;
  moduleType?: string;
}

export interface PaginatedLeads {
  data: Lead[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

class LeadService {
  /**
   * Get all leads with optional filtering and pagination
   */
  async getAllLeads(filters?: LeadFilters): Promise<PaginatedLeads> {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.status) params.append('status', filters.status);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.broker) params.append('broker', filters.broker);
      if (filters?.brokerId) params.append('brokerId', filters.brokerId);
      if (filters?.moduleType) params.append('moduleType', filters.moduleType);

      const response = await apiClient.get<{
        success: boolean;
        data: PaginatedLeads;
      }>('/leads', { params: Object.fromEntries(params) });

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch leads');
    }
  }

  /**
   * Get a single lead by ID
   */
  async getLeadById(id: string): Promise<Lead> {
    try {
      const response = await apiClient.get<{ success: boolean; data: Lead }>(
        `/leads/${id}`
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch lead');
    }
  }

  /**
   * Create a new lead
   */
  async createLead(data: CreateLeadRequest): Promise<Lead> {
    try {
      const response = await apiClient.post<{ success: boolean; data: Lead }>(
        '/leads',
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create lead');
    }
  }

  /**
   * Update an existing lead
   */
  async updateLead(id: string, data: Partial<CreateLeadRequest>): Promise<Lead> {
    try {
      const response = await apiClient.put<{ success: boolean; data: Lead }>(
        `/leads/${id}`,
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update lead');
    }
  }

  async updateLeadComment(id: string, comment: string): Promise<Lead> {
    try {
      const response = await apiClient.patch<{ success: boolean; data: Lead }>(
        `/leads/${id}/comment`,
        { comment }
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update lead comment');
    }
  }

  /**
   * Sync a lead workflow atomically through the backend transaction endpoint
   */
  async syncLeadWorkflow(id: string, data: Record<string, unknown>): Promise<{
    lead: Lead;
    deal: unknown;
    forecastDeal: unknown;
    propertyId: string | null;
    stockId: string | null;
  }> {
    try {
      const response = await apiClient.post<{
        success: boolean;
        data: {
          lead: Lead;
          deal: unknown;
          forecastDeal: unknown;
          propertyId: string | null;
          stockId: string | null;
        };
      }>(`/leads/${id}/workflow`, data);
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to sync lead workflow');
    }
  }

  /**
   * Delete a lead
   */
  async deleteLead(id: string): Promise<void> {
    try {
      await apiClient.delete(`/leads/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete lead');
    }
  }

  /**
   * Get lead analytics
   */
  async getLeadAnalytics(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    totalValue: number;
    averageValue: number;
  }> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        data: {
          total: number;
          byStatus: Record<string, number>;
          totalValue: number;
          averageValue: number;
        };
      }>('/leads/analytics');

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch analytics');
    }
  }
}

export const leadService = new LeadService();
export default leadService;
