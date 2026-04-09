import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface CustomRecord<T = Record<string, unknown>> {
  id: string;
  entityType: string;
  name: string;
  status?: string;
  category?: string;
  referenceId?: string;
  payload: T;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomRecordRequest<T = Record<string, unknown>> {
  entityType: string;
  name: string;
  status?: string;
  category?: string;
  referenceId?: string;
  payload?: T;
}

export interface CustomRecordFilters {
  entityType?: string;
  status?: string;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedCustomRecords<T = Record<string, unknown>> {
  data: CustomRecord<T>[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

class CustomRecordService {
  async getAllCustomRecords<T = Record<string, unknown>>(
    filters?: CustomRecordFilters
  ): Promise<PaginatedCustomRecords<T>> {
    try {
      const params = new URLSearchParams();
      if (filters?.entityType) params.append('entityType', filters.entityType);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.category) params.append('category', filters.category);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));

      const response = await apiClient.get<{
        success: boolean;
        data: PaginatedCustomRecords<T>;
      }>('/custom-records', { params: Object.fromEntries(params) });

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch records');
    }
  }

  async getCustomRecordById<T = Record<string, unknown>>(id: string): Promise<CustomRecord<T>> {
    try {
      const response = await apiClient.get<{ success: boolean; data: CustomRecord<T> }>(
        `/custom-records/${id}`
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch record');
    }
  }

  async createCustomRecord<T = Record<string, unknown>>(
    data: CreateCustomRecordRequest<T>
  ): Promise<CustomRecord<T>> {
    try {
      const response = await apiClient.post<{ success: boolean; data: CustomRecord<T> }>(
        '/custom-records',
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      if (!axiosError.response) {
        throw new Error('Unable to connect to server. Please check that the backend is running.');
      }
      throw new Error(axiosError.response?.data?.message || 'Failed to create record');
    }
  }

  async updateCustomRecord<T = Record<string, unknown>>(
    id: string,
    data: Partial<CreateCustomRecordRequest<T>>
  ): Promise<CustomRecord<T>> {
    try {
      const response = await apiClient.put<{ success: boolean; data: CustomRecord<T> }>(
        `/custom-records/${id}`,
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update record');
    }
  }

  async deleteCustomRecord(id: string): Promise<void> {
    try {
      await apiClient.delete(`/custom-records/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete record');
    }
  }
}

export const customRecordService = new CustomRecordService();
export default customRecordService;
