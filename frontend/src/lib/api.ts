/**
 * API Service - Client-side API client with axios
 * Handles all HTTP requests with interceptors, error handling, and token management
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import { clientEnv } from '@/lib/env';

const API_BASE_URL = clientEnv.NEXT_PUBLIC_API_URL;
const API_TIMEOUT_MS = clientEnv.NEXT_PUBLIC_API_TIMEOUT_MS;

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

type RefreshResponse = {
  data?: {
    accessToken?: string;
    refreshToken?: string;
  };
};

// In-memory access token only (refresh token is kept in httpOnly cookie).
let authToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export const setAuthToken = (token: string) => {
  authToken = token;
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const getAuthToken = (): string | null => authToken;

export const clearAuthToken = () => {
  authToken = null;
  delete apiClient.defaults.headers.common['Authorization'];
};

async function requestAccessTokenRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = axios
    .post<RefreshResponse>(
      `${API_BASE_URL}/auth/refresh`,
      {},
      {
        timeout: API_TIMEOUT_MS,
        withCredentials: true,
        headers: { 'Content-Type': 'application/json' },
      }
    )
    .then(response => {
      const nextToken = response.data?.data?.accessToken;
      if (!nextToken) {
        clearAuthToken();
        return null;
      }

      setAuthToken(nextToken);
      return nextToken;
    })
    .catch(() => {
      clearAuthToken();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export const initAuthToken = async () => {
  if (authToken) return;
  try {
    await requestAccessTokenRefresh();
  } catch {
    clearAuthToken();
  }
};

// Request interceptor
apiClient.interceptors.request.use(
  config => {
    const token = getAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && !originalRequest?._retry) {
      if ((originalRequest?.url as string)?.includes('/auth/refresh')) {
        clearAuthToken();
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        const refreshedToken = await requestAccessTokenRefresh();
        if (refreshedToken) {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${refreshedToken}`;
          return apiClient(originalRequest);
        }
      } catch {
        // Fall through to redirect below.
      }

      clearAuthToken();
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Error Handling
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Retry Logic
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0 || !(error instanceof ApiError) || error.statusCode < 500) {
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

export default apiClient;
export { retryWithBackoff };
