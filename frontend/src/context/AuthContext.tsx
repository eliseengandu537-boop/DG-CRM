'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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

export interface LoginResult {
  ok: boolean;
  otpRequired?: boolean;
  email?: string;
  devCode?: string;
  error?: string;
}

/** Auto sign-out after this much inactivity. */
const IDLE_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyOtp: (email: string, code: string) => Promise<boolean>;
  resendOtp: (email: string) => Promise<{ devCode?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: (reason?: 'idle' | 'manual') => Promise<void>;
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

  // Step 1: verify credentials. Does not establish a session — returns an OTP
  // challenge that must be completed via verifyOtp.
  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      try {
        setError(null);
        const challenge = await authService.login(email, password);
        return {
          ok: true,
          otpRequired: true,
          email: challenge.email,
          devCode: challenge.devCode,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Login failed';
        setError(message);
        return { ok: false, error: message };
      }
    },
    []
  );

  // Step 2: complete sign-in with the emailed OTP code.
  const verifyOtp = useCallback(
    async (email: string, code: string): Promise<boolean> => {
      try {
        setError(null);
        const currentUser = await authService.verifyOtp(email, code);
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
        const message = err instanceof Error ? err.message : 'Verification failed';
        setError(message);
        return false;
      }
    },
    [router]
  );

  const resendOtp = useCallback(async (email: string): Promise<{ devCode?: string }> => {
    return authService.resendOtp(email);
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      await authService.changePassword(currentPassword, newPassword);
    },
    []
  );

  const logout = useCallback(async (reason: 'idle' | 'manual' = 'manual') => {
    setError(null);
    await authService.logout();
    setUser(null);
    // Hard navigation: clears all in-memory state (caches, stores) and forces
    // the browser to fetch fresh CSS/JS chunks for /login. Avoids the dev-mode
    // issue where soft `router.push` can land on the login page with stale or
    // missing style chunks.
    const target = reason === 'idle' ? '/login?reason=idle' : '/login';
    if (typeof window !== 'undefined') {
      window.location.href = target;
    } else {
      router.push(target);
    }
  }, [router]);

  // ── Idle auto-logout ────────────────────────────────────────────────────
  // While authenticated, sign the user out after IDLE_TIMEOUT_MS of no activity.
  // Any meaningful interaction resets the timer.
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    if (typeof window === 'undefined') return;

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        void logout('idle');
      }, IDLE_TIMEOUT_MS);
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'focus',
    ];
    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [user, logout]);

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
        verifyOtp,
        resendOtp,
        changePassword,
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
