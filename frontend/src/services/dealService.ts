/**
 * Deal Service
 * Handles all deal-related CRUD operations via API
 */

import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface Deal {
  id: string;
  title: string;
  description?: string;
  status: string;
  type: 'sale' | 'lease' | 'auction';
  value: number;
  targetClosureDate?: string;
  closedDate?: string;
  leadId: string;
  propertyId: string;
  brokerId: string;
  legalDocumentId?: string;
  documentLinked?: boolean;
  clientName?: string;
  legalDocument?: {
    id: string;
    documentName: string;
    status?: string;
    fileName?: string;
    filePath?: string;
    fileType?: string;
  };
  assignedBrokerId?: string;
  assignedBrokerName?: string;
  statusDocuments?: Array<{
    id: string;
    status: string;
    documentType: string;
    legalDocumentId: string;
    legalDocumentName: string;
    legalDocumentType?: string;
    legalDocumentStatus?: string;
    fileName?: string;
    filePath?: string;
    fileType?: string;
    version: number;
    uploadedAt: string;
    completedAt?: string;
    lastModifiedAt: string;
    filledDocumentRecordId?: string;
    filledDocumentDownloadUrl?: string;
    filledDocumentName?: string;
  }>;
  statusHistory?: Array<{
    id: string;
    status: string;
    changedAt: string;
    changedByUserId?: string;
    changedByName?: string;
  }>;
  workflowProgress?: {
    hasLoiDocument: boolean;
    hasStep2Document: boolean;
    hasAgreementDocument: boolean;
    step2Status?: string;
    agreementStatus?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DealFilters {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  brokerId?: string;
  wip?: boolean;
}

export interface CreateDealRequest {
  title: string;
  description: string;
  status?: string;
  type: string;
  value: number;
  targetClosureDate?: string;
  closedDate?: string;
  leadId?: string;
  propertyId?: string;
  brokerId?: string;
}

class DealService {
  /**
   * Get all deals with optional filtering
   */
  async getAllDeals(filters?: DealFilters): Promise<{
    data: Deal[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.status) params.append('status', filters.status);
      if (filters?.type) params.append('type', filters.type);
      if (filters?.brokerId) params.append('brokerId', filters.brokerId);
      if (filters?.wip) params.append('wip', 'true');

      const response = await apiClient.get<{
        success: boolean;
        data: { data: Deal[]; pagination: any };
      }>('/deals', { params: Object.fromEntries(params) });

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch deals');
    }
  }

  /**
   * Get a single deal by ID
   */
  async getDealById(id: string): Promise<Deal> {
    try {
      const response = await apiClient.get<{ success: boolean; data: Deal }>(`/deals/${id}`);
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch deal');
    }
  }

  /**
   * Create a new deal
   */
  async createDeal(data: CreateDealRequest): Promise<Deal> {
    try {
      const response = await apiClient.post<{ success: boolean; data: Deal }>('/deals', data);
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create deal');
    }
  }

  /**
   * Update an existing deal
   */
  async updateDeal(id: string, data: Partial<CreateDealRequest>): Promise<Deal> {
    try {
      const response = await apiClient.put<{ success: boolean; data: Deal }>(
        `/deals/${id}`,
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update deal');
    }
  }

  /**
   * Delete a deal
   */
  async deleteDeal(id: string): Promise<void> {
    try {
      await apiClient.delete(`/deals/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete deal');
    }
  }
}

export const dealService = new DealService();
export default dealService;
