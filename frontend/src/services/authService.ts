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

export interface OtpChallenge {
  otpRequired: true;
  email: string;
  /** Only present in development when SMTP is unavailable. */
  devCode?: string;
}

interface OtpChallengeResponse {
  success: boolean;
  message: string;
  data: { otpRequired: true; email: string; devCode?: string };
  timestamp: string;
}

class AuthService {
  /**
   * Step 1 of login: submit email + password. On success the server emails a
   * one-time code and returns an OTP challenge — no session is established yet.
   */
  async login(email: string, password: string): Promise<OtpChallenge> {
    try {
      const response = await apiClient.post<OtpChallengeResponse>('/auth/login', {
        email,
        password,
      }, {
        timeout: LOGIN_TIMEOUT_MS,
      });

      const { email: challengeEmail, devCode } = response.data.data;
      return { otpRequired: true, email: challengeEmail || email, devCode };
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
   * Step 2 of login: submit the emailed OTP code to complete sign-in.
   */
  async verifyOtp(email: string, code: string): Promise<User> {
    try {
      const response = await apiClient.post<AuthResponse>('/auth/verify-otp', {
        email,
        code,
      }, {
        timeout: LOGIN_TIMEOUT_MS,
      });

      const { tokens, user } = response.data.data;
      setAuthToken(tokens.accessToken);
      return user;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      if (!axiosError.response) {
        throw new Error('Unable to connect to server. Please check backend status and try again.');
      }
      throw new Error(
        axiosError.response?.data?.message || 'Invalid or expired verification code.'
      );
    }
  }

  /**
   * Request a fresh OTP code for an in-progress sign-in.
   */
  async resendOtp(email: string): Promise<{ devCode?: string }> {
    try {
      const response = await apiClient.post<{ success: boolean; data: { devCode?: string } }>(
        '/auth/resend-otp',
        { email }
      );
      return response.data.data || {};
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to resend code.');
    }
  }

  /**
   * Change the signed-in user's password.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      await apiClient.post('/auth/change-password', { currentPassword, newPassword });
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to change password.');
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
