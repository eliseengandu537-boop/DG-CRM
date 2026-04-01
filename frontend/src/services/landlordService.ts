import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface LandlordRecord {
  id: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  address?: string;
  status?: string;
  notes?: string;
  details?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLandlordRequest {
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  address?: string;
  status?: string;
  notes?: string;
  details?: Record<string, unknown>;
}

export interface LandlordFilters {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}

export interface PaginatedLandlords {
  data: LandlordRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

class LandlordService {
  async getAllLandlords(filters?: LandlordFilters): Promise<PaginatedLandlords> {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.status) params.append('status', filters.status);
      if (filters?.search) params.append('search', filters.search);

      const response = await apiClient.get<{
        success: boolean;
        data: PaginatedLandlords;
      }>('/landlords', { params: Object.fromEntries(params) });

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch landlords');
    }
  }

  async getLandlordById(id: string): Promise<LandlordRecord> {
    try {
      const response = await apiClient.get<{ success: boolean; data: LandlordRecord }>(
        `/landlords/${id}`
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch landlord');
    }
  }

  async createLandlord(data: CreateLandlordRequest): Promise<LandlordRecord> {
    try {
      const response = await apiClient.post<{ success: boolean; data: LandlordRecord }>(
        '/landlords',
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create landlord');
    }
  }

  async updateLandlord(
    id: string,
    data: Partial<CreateLandlordRequest>
  ): Promise<LandlordRecord> {
    try {
      const response = await apiClient.put<{ success: boolean; data: LandlordRecord }>(
        `/landlords/${id}`,
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update landlord');
    }
  }

  async deleteLandlord(id: string): Promise<void> {
    try {
      await apiClient.delete(`/landlords/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete landlord');
    }
  }
}

export const landlordService = new LandlordService();
export default landlordService;
