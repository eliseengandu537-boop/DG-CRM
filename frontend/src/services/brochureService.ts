import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface BrochureRecord<T = Record<string, unknown>> {
  id: string;
  entityType: string;
  name: string;
  status?: string;
  category?: string;
  referenceId?: string;
  payload: T;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrochureFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export interface BrochureMutationInput<T = Record<string, unknown>> {
  name?: string;
  status?: string;
  category?: string;
  referenceId?: string;
  payload?: T;
}

export interface PaginatedBrochures<T = Record<string, unknown>> {
  data: BrochureRecord<T>[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

class BrochureService {
  async getAllBrochures<T = Record<string, unknown>>(
    filters?: BrochureFilters
  ): Promise<PaginatedBrochures<T>> {
    try {
      const params = new URLSearchParams();
      if (filters?.search) params.append('search', filters.search);
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));

      const response = await apiClient.get<{
        success: boolean;
        data: PaginatedBrochures<T>;
      }>('/brochures', { params: Object.fromEntries(params) });

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch brochures');
    }
  }

  async createBrochure<T = Record<string, unknown>>(
    data: BrochureMutationInput<T>
  ): Promise<BrochureRecord<T>> {
    try {
      const response = await apiClient.post<{ success: boolean; data: BrochureRecord<T> }>(
        '/brochures',
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create brochure');
    }
  }

  async updateBrochure<T = Record<string, unknown>>(
    id: string,
    data: BrochureMutationInput<T>
  ): Promise<BrochureRecord<T>> {
    try {
      const response = await apiClient.put<{ success: boolean; data: BrochureRecord<T> }>(
        `/brochures/${id}`,
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update brochure');
    }
  }

  async deleteBrochure(id: string): Promise<void> {
    try {
      await apiClient.delete(`/brochures/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete brochure');
    }
  }

  async sendBrochureEmail(id: string): Promise<{ to: string }> {
    try {
      const response = await apiClient.post<{ success: boolean; data: { to: string } }>(
        `/brochures/${id}/send-email`
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to send brochure email');
    }
  }
}

export const brochureService = new BrochureService();
export default brochureService;
