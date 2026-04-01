import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export type ReminderType = 'deal_follow_up' | 'call' | 'task' | 'email';
export type ReminderStatus = 'pending' | 'completed' | 'cancelled';
export type ReminderPriority = 'low' | 'medium' | 'high';

export interface ReminderRecord {
  id: string;
  title: string;
  description?: string;
  reminderType: ReminderType;
  dueAt: string;
  status: ReminderStatus;
  priority: ReminderPriority;
  dealId?: string;
  brokerId?: string;
  assignedUserId?: string;
  assignedToRole?: 'admin' | 'manager' | 'broker';
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  createdByUserId?: string;
  createdByName?: string;
  createdByEmail?: string;
  completedAt?: string;
  dealTitle?: string;
  brokerName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderFilters {
  page?: number;
  limit?: number;
  status?: ReminderStatus;
  reminderType?: ReminderType;
  priority?: ReminderPriority;
  dealId?: string;
  brokerId?: string;
  from?: string;
  to?: string;
}

export interface PaginatedReminders {
  data: ReminderRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CreateReminderRequest {
  title: string;
  description?: string;
  reminderType: ReminderType;
  dueAt: string;
  status?: ReminderStatus;
  priority?: ReminderPriority;
  dealId?: string;
  brokerId?: string;
  assignedUserId?: string;
  assignedToRole?: 'admin' | 'manager' | 'broker';
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

class ReminderService {
  async getAllReminders(filters?: ReminderFilters): Promise<PaginatedReminders> {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.status) params.append('status', filters.status);
      if (filters?.reminderType) params.append('reminderType', filters.reminderType);
      if (filters?.priority) params.append('priority', filters.priority);
      if (filters?.dealId) params.append('dealId', filters.dealId);
      if (filters?.brokerId) params.append('brokerId', filters.brokerId);
      if (filters?.from) params.append('from', filters.from);
      if (filters?.to) params.append('to', filters.to);

      const response = await apiClient.get<{ success: boolean; data: PaginatedReminders }>(
        '/reminders',
        { params: Object.fromEntries(params) }
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to load reminders');
    }
  }

  async createReminder(payload: CreateReminderRequest): Promise<ReminderRecord> {
    try {
      const response = await apiClient.post<{ success: boolean; data: ReminderRecord }>(
        '/reminders',
        payload
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create reminder');
    }
  }

  async updateReminder(
    id: string,
    payload: Partial<CreateReminderRequest> & { status?: ReminderStatus }
  ): Promise<ReminderRecord> {
    try {
      const response = await apiClient.put<{ success: boolean; data: ReminderRecord }>(
        `/reminders/${id}`,
        payload
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update reminder');
    }
  }

  async completeReminder(id: string): Promise<ReminderRecord> {
    try {
      const response = await apiClient.patch<{ success: boolean; data: ReminderRecord }>(
        `/reminders/${id}/complete`
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to complete reminder');
    }
  }

  async deleteReminder(id: string): Promise<void> {
    try {
      await apiClient.delete(`/reminders/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete reminder');
    }
  }
}

export const reminderService = new ReminderService();
export default reminderService;
