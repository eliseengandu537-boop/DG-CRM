/**
 * Broker Service
 * Handles all broker-related CRUD operations via API
 */

import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface Broker {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  department?: string;
  billingTarget?: number;
  currentBilling?: number;
  progressPercentage?: number;
  avatar?: string;
  status: 'active' | 'inactive' | 'archived';
  archivedAt?: string;
  archivedByUserId?: string;
  archivedByName?: string;
  archivedByEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrokerWorkloadSummary {
  leadsCount: number;
  dealsCount: number;
  forecastDealsCount: number;
  wipDealsCount: number;
}

export interface ArchivedBrokerRecord {
  broker: Broker;
  workload: BrokerWorkloadSummary;
}

export interface CreateBrokerRequest {
  name: string;
  email: string;
  phone: string;
  company?: string;
  department?: string;
  billingTarget?: number;
  avatar?: string;
  status?: string;
}

export interface CreateBrokerResult {
  broker: Broker;
  passwordSent: boolean;
  passwordError?: string;
  temporaryPassword?: string;
  message?: string;
}

class BrokerService {
  private getFriendlyErrorMessage(error: AxiosError<any>, fallback: string): string {
    const responseMessage = String(error.response?.data?.message || '');
    const axiosMessage = String(error.message || '');
    const combined = `${responseMessage} ${axiosMessage}`.toLowerCase();

    if (
      combined.includes('server selection timeout') ||
      combined.includes('replicasetnoprimary') ||
      combined.includes('connectorerror') ||
      combined.includes('database') ||
      combined.includes('prisma')
    ) {
      return 'Database temporarily unavailable. Please try again shortly.';
    }

    return responseMessage || axiosMessage || fallback;
  }

  /**
   * Get all brokers
   */
  async getAllBrokers(options?: { includeArchived?: boolean }): Promise<Broker[]> {
    try {
      const response = await apiClient.get<{ success: boolean; data: Broker[] }>('/brokers', {
        timeout: 0,
        params: {
          includeArchived: options?.includeArchived ? 'true' : undefined,
        },
      });
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(this.getFriendlyErrorMessage(axiosError, 'Failed to fetch brokers'));
    }
  }

  /**
   * Get a single broker by ID
   */
  async getBrokerById(id: string): Promise<Broker> {
    try {
      const response = await apiClient.get<{ success: boolean; data: Broker }>(
        `/brokers/${id}`
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(this.getFriendlyErrorMessage(axiosError, 'Failed to fetch broker'));
    }
  }

  /**
   * Get the currently logged-in user's own broker profile (if any)
   */
  async getMyBrokerProfile(): Promise<Broker | null> {
    try {
      const response = await apiClient.get<{ success: boolean; data: Broker }>('/brokers/me');
      return response.data.data;
    } catch {
      return null;
    }
  }

  /**
   * Create a new broker (admin only)
   */
  async createBroker(data: CreateBrokerRequest): Promise<CreateBrokerResult> {
    try {
      const response = await apiClient.post<{
        success: boolean;
        message?: string;
        data: Broker;
        meta?: {
          passwordSent?: boolean;
          passwordError?: string;
          temporaryPassword?: string;
        };
      }>(
        '/brokers',
        data,
        {
          timeout: 0,
        }
      );

      return {
        broker: response.data.data,
        passwordSent: response.data.meta?.passwordSent ?? true,
        passwordError: response.data.meta?.passwordError,
        temporaryPassword: response.data.meta?.temporaryPassword,
        message: response.data.message,
      };
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(this.getFriendlyErrorMessage(axiosError, 'Failed to create broker'));
    }
  }

  /**
   * Get archived/deleted brokers with historical workload summary.
   */
  async getArchivedBrokers(): Promise<ArchivedBrokerRecord[]> {
    try {
      const response = await apiClient.get<{ success: boolean; data: ArchivedBrokerRecord[] }>(
        '/brokers/archived',
        { timeout: 0 }
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(this.getFriendlyErrorMessage(axiosError, 'Failed to fetch archived brokers'));
    }
  }

  /**
   * Update an existing broker (admin only)
   */
  async updateBroker(id: string, data: Partial<CreateBrokerRequest>): Promise<Broker> {
    try {
      const response = await apiClient.put<{ success: boolean; data: Broker }>(
        `/brokers/${id}`,
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(this.getFriendlyErrorMessage(axiosError, 'Failed to update broker'));
    }
  }

  /**
   * Archive/delete a broker login (admin only)
   */
  async deleteBroker(id: string, options?: { permanent?: boolean }): Promise<void> {
    try {
      await apiClient.delete(`/brokers/${id}`, {
        params: options?.permanent ? { permanent: 'true' } : undefined,
      });
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(
        this.getFriendlyErrorMessage(
          axiosError,
          options?.permanent ? 'Failed to permanently delete archived broker' : 'Failed to archive broker'
        )
      );
    }
  }

  /**
   * Generate a new temporary password for broker (admin only)
   */
  async generateBrokerPassword(
    brokerId: string
  ): Promise<{
    temporaryPassword?: string;
    passwordSent: boolean;
    passwordError?: string;
    message?: string;
  }> {
    try {
      const response = await apiClient.post<{
        success: boolean;
        message?: string;
        data?: { temporaryPassword?: string };
        meta?: { passwordSent?: boolean; passwordError?: string };
      }>(
        `/brokers/${brokerId}/generate-password`
      );
      return {
        temporaryPassword: response.data.data?.temporaryPassword,
        passwordSent: response.data.meta?.passwordSent ?? true,
        passwordError: response.data.meta?.passwordError,
        message: response.data.message,
      };
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(this.getFriendlyErrorMessage(axiosError, 'Failed to generate password'));
    }
  }

  // Backward-compatible alias used by older UI code.
  async generateBrokerPin(brokerId: string) {
    const result = await this.generateBrokerPassword(brokerId);
    return {
      pin: result.temporaryPassword,
      pinSent: result.passwordSent,
      pinError: result.passwordError,
      message: result.message,
    };
  }

  /**
   * Validate broker password
   */
  async validateBrokerPassword(brokerId: string, password: string): Promise<{ isValid: boolean }> {
    try {
      const response = await apiClient.post<{ success: boolean; data: { isValid: boolean } }>(
        `/brokers/${brokerId}/validate-password`,
        { password }
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(this.getFriendlyErrorMessage(axiosError, 'Failed to validate password'));
    }
  }

  /**
   * Get broker statistics
   */
  async getBrokerStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    archived?: number;
  }> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        data: { total: number; active: number; inactive: number; archived?: number };
      }>('/brokers/stats');
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(this.getFriendlyErrorMessage(axiosError, 'Failed to fetch broker stats'));
    }
  }
}

export const brokerService = new BrokerService();
export default brokerService;
