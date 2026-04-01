import apiClient from '@/lib/api';
import { AxiosError } from 'axios';
import { dealService } from '@/services/dealService';

export interface ForecastDealRecord {
  id: string;
  dealId?: string;
  brokerId: string;
  assignedBrokerId?: string;
  assignedBrokerName?: string;
  moduleType: 'leasing' | 'sales' | 'auction';
  status: string;
  title: string;
  expectedValue: number;
  commissionRate: number;
  commissionAmount: number;
  companyCommission: number;
  brokerCommission: number;
  legalDocument?: string;
  forecastedClosureDate?: string;
  expectedPaymentDate?: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateForecastDealRequest {
  dealId?: string;
  brokerId?: string;
  moduleType: 'leasing' | 'sales' | 'auction';
  status: string;
  title: string;
  expectedValue: number;
  commissionRate?: number;
  commissionAmount?: number;
  companyCommission?: number;
  brokerCommission?: number;
  legalDocument?: string | null;
  comment?: string | null;
  forecastedClosureDate?: string;
  expectedPaymentDate?: string;
}

export interface ForecastDealFilters {
  page?: number;
  limit?: number;
  brokerId?: string;
  moduleType?: string;
  status?: string;
}

export interface WipStatusChangeRequest {
  dealId: string;
  status: string;
  brokerId?: string;
  legalDocument?: string | null;
  comment?: string | null;
}

export interface WipStatusChangeResponse {
  dealId: string;
  brokerId: string;
  moduleType: 'leasing' | 'sales' | 'auction';
  status: string;
  legalDocument?: string;
  comment?: string;
  forecastDeal: ForecastDealRecord | null;
}

export interface PaginatedForecastDeals {
  data: ForecastDealRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

class ForecastDealService {
  private mapDealTypeToModuleType(type: string): 'leasing' | 'sales' | 'auction' {
    const normalized = String(type || '').trim().toLowerCase();
    if (normalized === 'lease' || normalized === 'leasing') return 'leasing';
    if (normalized === 'auction') return 'auction';
    return 'sales';
  }

  async getAllForecastDeals(filters?: ForecastDealFilters): Promise<PaginatedForecastDeals> {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.brokerId) params.append('brokerId', filters.brokerId);
      if (filters?.moduleType) params.append('moduleType', filters.moduleType);
      if (filters?.status) params.append('status', filters.status);

      const response = await apiClient.get<{
        success: boolean;
        data: PaginatedForecastDeals;
      }>('/forecast-deals', { params: Object.fromEntries(params) });

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch forecast deals');
    }
  }

  async createForecastDeal(data: CreateForecastDealRequest): Promise<ForecastDealRecord> {
    try {
      const response = await apiClient.post<{ success: boolean; data: ForecastDealRecord }>(
        '/forecast-deals',
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create forecast deal');
    }
  }

  async updateForecastDeal(
    id: string,
    data: Partial<CreateForecastDealRequest>
  ): Promise<ForecastDealRecord> {
    try {
      const response = await apiClient.put<{ success: boolean; data: ForecastDealRecord }>(
        `/forecast-deals/${id}`,
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update forecast deal');
    }
  }

  async deleteForecastDeal(id: string): Promise<void> {
    try {
      await apiClient.delete(`/forecast-deals/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete forecast deal');
    }
  }

  private async findForecastByDealId(dealId: string): Promise<ForecastDealRecord | null> {
    const targetDealId = String(dealId || '').trim();
    if (!targetDealId) return null;

    const limit = 200;
    let page = 1;
    let pages = 1;

    do {
      const response = await this.getAllForecastDeals({ page, limit });
      const found = (response.data || []).find(
        item => String(item.dealId || '').trim() === targetDealId
      );
      if (found) return found;

      pages = response.pagination?.pages || 1;
      page += 1;
    } while (page <= pages);

    return null;
  }

  async updateWipStatus(data: WipStatusChangeRequest): Promise<WipStatusChangeResponse> {
    try {
      const response = await apiClient.post<{ success: boolean; data: WipStatusChangeResponse }>(
        '/forecast-deals/wip/status',
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      const status = Number(axiosError.response?.status || 0);
      const message = String(axiosError.response?.data?.message || axiosError.message || '');

      const canFallbackToLegacy =
        status === 404 ||
        message.toLowerCase().includes('/forecast-deals/wip/status') ||
        message.toLowerCase().includes('route') ||
        message.toLowerCase().includes('not found');

      if (!canFallbackToLegacy) {
        throw new Error(message || 'Failed to update WIP status');
      }

      const linkedForecast = await this.findForecastByDealId(data.dealId);
      if (!linkedForecast) {
        const linkedDeal = await dealService.getDealById(data.dealId);
        const createdForecast = await this.createForecastDeal({
          dealId: data.dealId,
          brokerId: data.brokerId || linkedDeal.brokerId,
          moduleType: this.mapDealTypeToModuleType(linkedDeal.type),
          status: data.status,
          title: linkedDeal.title,
          expectedValue: Number(linkedDeal.value || 0),
          ...(data.legalDocument !== undefined ? { legalDocument: data.legalDocument } : {}),
          ...(data.comment !== undefined ? { comment: data.comment } : {}),
        });

        return {
          dealId: data.dealId,
          brokerId: createdForecast.brokerId,
          moduleType: createdForecast.moduleType,
          status: createdForecast.status,
          legalDocument: createdForecast.legalDocument,
          comment: data.comment ?? undefined,
          forecastDeal: createdForecast,
        };
      }

      const updatedForecast = await this.updateForecastDeal(linkedForecast.id, {
        ...(data.status ? { status: data.status } : {}),
        ...(data.brokerId ? { brokerId: data.brokerId } : {}),
        ...(data.legalDocument !== undefined ? { legalDocument: data.legalDocument } : {}),
        ...(data.comment !== undefined ? { comment: data.comment } : {}),
      });

      return {
        dealId: data.dealId,
        brokerId: updatedForecast.brokerId,
        moduleType: updatedForecast.moduleType,
        status: updatedForecast.status,
        legalDocument: updatedForecast.legalDocument,
        comment: data.comment ?? undefined,
        forecastDeal: updatedForecast,
      };
    }
  }
}

export const forecastDealApiService = new ForecastDealService();
export default forecastDealApiService;
