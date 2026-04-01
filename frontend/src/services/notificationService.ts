import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface NotificationRecord {
  id: string;
  activityId?: string;
  actorUserId?: string;
  actorName?: string;
  actorRole?: string;
  title: string;
  message: string;
  type: string;
  entityType: string;
  entityId?: string;
  brokerId?: string;
  sound?: boolean;
  read?: boolean;
  visibilityScope?: 'shared' | 'private';
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationFilters {
  entityType?: string;
  type?: string;
  brokerId?: string;
  userId?: string;
  read?: boolean;
  page?: number;
  limit?: number;
}

export interface PaginatedNotifications {
  data: NotificationRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  unreadCount: number;
}

class NotificationService {
  async getNotifications(filters?: NotificationFilters): Promise<PaginatedNotifications> {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.entityType) params.append('entityType', filters.entityType);
      if (filters?.type) params.append('type', filters.type);
      if (filters?.brokerId) params.append('brokerId', filters.brokerId);
      if (filters?.userId) params.append('userId', filters.userId);
      if (typeof filters?.read === 'boolean') params.append('read', String(filters.read));

      const response = await apiClient.get<{
        success: boolean;
        data: PaginatedNotifications;
      }>('/notifications', { params: Object.fromEntries(params) });

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch notifications');
    }
  }

  async markNotificationRead(id: string): Promise<NotificationRecord> {
    try {
      const response = await apiClient.patch<{
        success: boolean;
        data: NotificationRecord;
      }>(`/notifications/${id}/read`);

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to mark notification as read');
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
