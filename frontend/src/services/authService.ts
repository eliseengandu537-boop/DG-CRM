/**
 * Authentication Service
 * Handles login, registration, and user session management
 */

import apiClient, { setAuthToken, clearAuthToken, getAuthToken } from '@/lib/api';
import { AxiosError } from 'axios';

const LOGIN_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_LOGIN_TIMEOUT_MS || 15000);

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'broker' | 'viewer';
  brokerId?: string | null;
  department?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  tokens: {
    accessToken: string;
    refreshToken?: string;
  };
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data: LoginResponse;
  timestamp: string;
}

class AuthService {
  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<User> {
    try {
      const response = await apiClient.post<AuthResponse>('/auth/login', {
        email,
        password,
      }, {
        timeout: LOGIN_TIMEOUT_MS,
      });

      const { tokens, user } = response.data.data;
      setAuthToken(tokens.accessToken);
      return user;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      if (axiosError.code === 'ECONNABORTED') {
        throw new Error('Login timed out while the backend was still initializing. Please try again.');
      }
      if (!axiosError.response) {
        throw new Error('Unable to connect to server. Please check backend status and try again.');
      }
      throw new Error(
        axiosError.response?.data?.message || 'Login failed. Please check your credentials.'
      );
    }
  }

  /**
   * Register new user
   */
  async register(email: string, name: string, password: string): Promise<User> {
    try {
      const response = await apiClient.post<AuthResponse>('/auth/register', {
        email,
        name,
        password,
      });

      const { tokens, user } = response.data.data;
      setAuthToken(tokens.accessToken);
      return user;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Registration failed');
    }
  }

  /**
   * Get current user session
   */
  async getCurrentUser(): Promise<User> {
    try {
      const response = await apiClient.get<{ success: boolean; data: User }>('/auth/me');
      return response.data.data;
    } catch (error) {
      clearAuthToken();
      throw new Error('Failed to fetch current user');
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuthToken();
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!getAuthToken();
  }

  /**
   * Get stored token
   */
  getToken(): string | null {
    return getAuthToken();
  }
}

export const authService = new AuthService();
export default authService;
