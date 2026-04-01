import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface IndustryRecord {
  id: string;
  name: string;
  category?: string;
  description?: string;
  occupancyRate: number;
  averageRent: number;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIndustryRequest {
  name: string;
  category?: string;
  description?: string;
  occupancyRate?: number;
  averageRent?: number;
  status?: string;
}

export interface IndustryFilters {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}

export interface PaginatedIndustries {
  data: IndustryRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

class IndustryService {
  async getAllIndustries(filters?: IndustryFilters): Promise<PaginatedIndustries> {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.status) params.append('status', filters.status);
      if (filters?.search) params.append('search', filters.search);

      const response = await apiClient.get<{
        success: boolean;
        data: PaginatedIndustries;
      }>('/industries', { params: Object.fromEntries(params) });

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch industries');
    }
  }

  async getIndustryById(id: string): Promise<IndustryRecord> {
    try {
      const response = await apiClient.get<{ success: boolean; data: IndustryRecord }>(
        `/industries/${id}`
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch industry');
    }
  }

  async createIndustry(data: CreateIndustryRequest): Promise<IndustryRecord> {
    try {
      const response = await apiClient.post<{ success: boolean; data: IndustryRecord }>(
        '/industries',
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create industry');
    }
  }

  async updateIndustry(
    id: string,
    data: Partial<CreateIndustryRequest>
  ): Promise<IndustryRecord> {
    try {
      const response = await apiClient.put<{ success: boolean; data: IndustryRecord }>(
        `/industries/${id}`,
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update industry');
    }
  }

  async deleteIndustry(id: string): Promise<void> {
    try {
      await apiClient.delete(`/industries/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete industry');
    }
  }
}

export const industryService = new IndustryService();
export default industryService;
