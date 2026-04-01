'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import authService from '@/services/authService';
import { initAuthToken } from '@/lib/api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissionLevel: string;
  brokerId?: string | null;
  department?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      if (!authService.isAuthenticated()) {
        setUser(null);
        return;
      }

      const currentUser = await authService.getCurrentUser();
      setUser({
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name,
        role: currentUser.role,
        permissionLevel: currentUser.role === 'admin' ? 'Full Access' : 'Limited Access',
        brokerId: currentUser.brokerId,
        department: currentUser.department,
      });
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setIsLoading(true);
      await initAuthToken();
      if (!mounted) return;
      await refreshUser();
      if (!mounted) return;
      setIsLoading(false);
    };
    void init();

    return () => {
      mounted = false;
    };
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      try {
        setError(null);
        const currentUser = await authService.login(email, password);
        setUser({
          id: currentUser.id,
          email: currentUser.email,
          name: currentUser.name,
          role: currentUser.role,
          permissionLevel: currentUser.role === 'admin' ? 'Full Access' : 'Limited Access',
          brokerId: currentUser.brokerId,
          department: currentUser.department,
        });
        router.push('/');
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Login failed';
        setError(message);
        return false;
      }
    },
    [router]
  );

  const logout = useCallback(async () => {
    setError(null);
    await authService.logout();
    setUser(null);
    router.push('/login');
  }, [router]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        error,
        login,
        logout,
        clearError,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
