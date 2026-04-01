import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface ActivityRecord {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
  actorUserId?: string;
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
  actorDisplayName?: string;
  brokerId?: string;
  visibilityScope?: 'shared' | 'private';
  previousValues?: Record<string, unknown> | null;
  nextValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActivityFilters {
  action?: string;
  entityType?: string;
  entityId?: string;
  brokerId?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedActivities {
  data: ActivityRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

class ActivityService {
  async getActivities(filters?: ActivityFilters): Promise<PaginatedActivities> {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.action) params.append('action', filters.action);
      if (filters?.entityType) params.append('entityType', filters.entityType);
      if (filters?.entityId) params.append('entityId', filters.entityId);
      if (filters?.brokerId) params.append('brokerId', filters.brokerId);

      const response = await apiClient.get<{
        success: boolean;
        data: PaginatedActivities;
      }>('/activities', { params: Object.fromEntries(params) });

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch activities');
    }
  }

  async deleteActivity(id: string): Promise<void> {
    try {
      await apiClient.delete(`/activities/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete activity');
    }
  }
}

export const activityService = new ActivityService();
export default activityService;
