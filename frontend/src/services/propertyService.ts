import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface PropertyRecord {
  id: string;
  title: string;
  description: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  type: string;
  price: number;
  area: number;
  latitude?: number;
  longitude?: number;
  status: string;
  moduleType?: string;
  bedrooms?: number;
  bathrooms?: number;
  metadata?: Record<string, unknown> | null;
  deletedAt?: string | null;
  brokerId?: string;
  assignedBrokerId?: string;
  assignedBrokerName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePropertyRequest {
  title?: string;
  description?: string;
  address: string;
  city?: string;
  province?: string;
  postalCode?: string;
  type: string;
  moduleType?: string;
  status?: string;
  price?: number;
  area?: number;
  latitude?: number;
  longitude?: number;
  bedrooms?: number;
  bathrooms?: number;
  brokerId?: string;
  metadata?: Record<string, unknown>;
}

export interface PropertyFilters {
  page?: number;
  limit?: number;
  brokerId?: string;
  type?: string;
  moduleType?: string;
  status?: string;
  statuses?: string[];
  stockOnly?: boolean;
  includeDeleted?: boolean;
}

export interface PaginatedProperties {
  data: PropertyRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

class PropertyService {
  async getAllProperties(filters?: PropertyFilters): Promise<PaginatedProperties> {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.brokerId) params.append('brokerId', filters.brokerId);
      if (filters?.type) params.append('type', filters.type);
      if (filters?.moduleType) params.append('moduleType', filters.moduleType);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.statuses?.length) params.append('statuses', filters.statuses.join(','));
      if (filters?.stockOnly) params.append('stockOnly', 'true');
      if (filters?.includeDeleted) params.append('includeDeleted', 'true');

      const response = await apiClient.get<{
        success: boolean;
        data: PaginatedProperties;
      }>('/properties', { params: Object.fromEntries(params) });

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch properties');
    }
  }

  async getPropertyById(id: string): Promise<PropertyRecord> {
    try {
      const response = await apiClient.get<{ success: boolean; data: PropertyRecord }>(
        `/properties/${id}`
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch property');
    }
  }

  async createProperty(data: CreatePropertyRequest): Promise<PropertyRecord> {
    try {
      const response = await apiClient.post<{ success: boolean; data: PropertyRecord }>(
        '/properties',
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create property');
    }
  }

  async updateProperty(id: string, data: Partial<CreatePropertyRequest>): Promise<PropertyRecord> {
    try {
      const response = await apiClient.put<{ success: boolean; data: PropertyRecord }>(
        `/properties/${id}`,
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update property');
    }
  }

  async deleteProperty(id: string): Promise<void> {
    try {
      await apiClient.delete(`/properties/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete property');
    }
  }

  async importProperties(file: File, moduleType = 'sales'): Promise<ImportResult> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('moduleType', moduleType);

      const response = await apiClient.post<{
        success: boolean;
        data: ImportResult;
      }>('/properties/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      if (!axiosError.response) {
        throw new Error('Unable to connect to server. Please check that the backend is running.');
      }
      throw new Error(axiosError.response?.data?.message || 'Failed to import properties');
    }
  }
}

export const propertyService = new PropertyService();
export default propertyService;
