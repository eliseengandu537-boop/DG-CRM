import { AxiosError } from 'axios';
import apiClient from '@/lib/api';

export interface AppUserRecord {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'broker' | 'viewer';
  createdAt: string;
  updatedAt: string;
}

export interface CreateManagerRequest {
  email: string;
  name?: string;
  password: string;
}

export interface CreateManagerResult {
  user: AppUserRecord;
  passwordSent: boolean;
  passwordError?: string;
  temporaryPassword?: string;
  message?: string;
}

class UserService {
  async getAllUsers(): Promise<AppUserRecord[]> {
    try {
      const response = await apiClient.get<{ success: boolean; data: AppUserRecord[] }>('/users');
      return response.data.data || [];
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to load users');
    }
  }

  async createManager(data: CreateManagerRequest): Promise<CreateManagerResult> {
    try {
      const payload = {
        email: data.email.trim().toLowerCase(),
        name: data.name?.trim() || '',
        password: data.password,
      };

      const response = await apiClient.post<{
        success: boolean;
        message?: string;
        data: AppUserRecord;
        meta?: {
          passwordSent?: boolean;
          passwordError?: string;
          temporaryPassword?: string;
        };
      }>(
        '/users',
        payload
      );
      return {
        user: response.data.data,
        passwordSent: response.data.meta?.passwordSent ?? false,
        passwordError: response.data.meta?.passwordError,
        temporaryPassword: response.data.meta?.temporaryPassword,
        message: response.data.message,
      };
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create manager');
    }
  }
}

export const userService = new UserService();
export default userService;
