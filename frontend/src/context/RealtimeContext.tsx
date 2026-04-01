"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getAuthToken } from '@/lib/api';
import { clientEnv } from '@/lib/env';

type RealtimeContextType = { socket: any | null };

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<any | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setSocket(null);
      return;
    }

    let mounted = true;
    let activeSocket: any | null = null;

    async function init() {
      try {
        const token = getAuthToken();
        if (!token) return;

        const mod = await import('socket.io-client');
        const { io } = mod;
        const s = io(clientEnv.NEXT_PUBLIC_SOCKET_URL, {
          auth: {
            token: `Bearer ${token}`,
          },
          withCredentials: true,
          transports: ['websocket', 'polling'],
          autoConnect: false,
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 5000,
        });
        activeSocket = s;
        if (!mounted) return;
        setSocket(s);

        s.on('connect', () => {
          console.log('Realtime: connected', s.id);
        });

        s.on('connect_error', (error: Error) => {
          console.error('Realtime: connect error', error.message);
        });

        s.on('disconnect', (reason: any) => {
          console.log('Realtime: disconnected', reason);
        });

        s.io.on('reconnect_attempt', (attempt: number) => {
          console.warn('Realtime: reconnect attempt', attempt);
        });

        s.io.on('reconnect', (attempt: number) => {
          console.log('Realtime: reconnected', attempt);
        });

        s.io.on('reconnect_error', (error: Error) => {
          console.error('Realtime: reconnect error', error.message);
        });

        s.io.on('reconnect_failed', () => {
          console.error('Realtime: reconnect failed');
        });

        s.connect();
      } catch (err) {
        console.error('Realtime init failed:', err);
      }
    }

    init();

    return () => {
      mounted = false;
      if (activeSocket) activeSocket.disconnect();
      setSocket(null);
    };
  }, [isAuthenticated]);

  const value = useMemo(() => ({ socket }), [socket]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};

export const useRealtime = () => {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider');
  return ctx;
};
