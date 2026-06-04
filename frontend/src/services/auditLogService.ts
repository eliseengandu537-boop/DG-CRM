import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface AuditLogRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  brokerId: string | null;
  visibilityScope: string;
  previousValues: unknown;
  nextValues: unknown;
  metadata: unknown;
  createdAt: string;
}

export interface AuditLogFilters {
  entityType?: string;
  entityId?: string;
  action?: string;
  actorUserId?: string;
  brokerId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogPage {
  data: AuditLogRecord[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

class AuditLogService {
  async list(filters?: AuditLogFilters): Promise<AuditLogPage> {
    try {
      const params: Record<string, string | number> = {};
      if (filters?.entityType) params.entityType = filters.entityType;
      if (filters?.entityId) params.entityId = filters.entityId;
      if (filters?.action) params.action = filters.action;
      if (filters?.actorUserId) params.actorUserId = filters.actorUserId;
      if (filters?.brokerId) params.brokerId = filters.brokerId;
      if (filters?.search) params.search = filters.search;
      if (filters?.from) params.from = filters.from;
      if (filters?.to) params.to = filters.to;
      if (filters?.page) params.page = filters.page;
      if (filters?.limit) params.limit = filters.limit;

      const response = await apiClient.get<{
        success: boolean;
        data: AuditLogPage;
      }>('/audit-logs', { params });
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(
        axiosError.response?.data?.message || 'Failed to fetch audit logs'
      );
    }
  }
}

export const auditLogService = new AuditLogService();
export default auditLogService;
