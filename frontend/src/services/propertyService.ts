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

export interface GetPropertiesOptions {
  /** Bypass the short-lived cache and fetch fresh from the server. */
  force?: boolean;
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

// Short-lived cache for property list fetches. The property list is large
// (15k+ rows) and several screens request it on mount; caching + in-flight
// de-duplication means switching screens reuses one response instead of
// re-downloading everything each time. Any property mutation clears it.
const LIST_CACHE_TTL_MS = 60_000;
const listCache = new Map<string, { ts: number; data: PaginatedProperties }>();
const listInflight = new Map<string, Promise<PaginatedProperties>>();

export function clearPropertyCache(): void {
  listCache.clear();
  listInflight.clear();
}

class PropertyService {
  async getAllProperties(
    filters?: PropertyFilters,
    options?: GetPropertiesOptions
  ): Promise<PaginatedProperties> {
    const cacheKey = JSON.stringify(filters || {});

    if (!options?.force) {
      const cached = listCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < LIST_CACHE_TTL_MS) {
        return cached.data;
      }
      const pending = listInflight.get(cacheKey);
      if (pending) return pending;
    }

    const request = (async () => {
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

      const data = response.data.data;
      listCache.set(cacheKey, { ts: Date.now(), data });
      return data;
    })()
      .catch((error) => {
        const axiosError = error as AxiosError<any>;
        throw new Error(axiosError.response?.data?.message || 'Failed to fetch properties');
      })
      .finally(() => {
        listInflight.delete(cacheKey);
      });

    listInflight.set(cacheKey, request);
    return request;
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
      clearPropertyCache();
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
      clearPropertyCache();
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update property');
    }
  }

  async deleteProperty(id: string): Promise<void> {
    try {
      await apiClient.delete(`/properties/${id}`);
      clearPropertyCache();
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

      clearPropertyCache();
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
