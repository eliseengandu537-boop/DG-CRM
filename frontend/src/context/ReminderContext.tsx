'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { reminderService } from '@/services/reminderService';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/RealtimeContext';

interface ReminderNotificationState {
  pendingCount: number;
  overdueCount: number;
  dueTodayCount: number;
  nextDueAt?: string;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const ReminderContext = createContext<ReminderNotificationState | undefined>(undefined);

const POLL_INTERVAL_MS = 45_000;

const getDayBoundaries = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const ReminderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const { socket } = useRealtime();
  const [pendingCount, setPendingCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [dueTodayCount, setDueTodayCount] = useState(0);
  const [nextDueAt, setNextDueAt] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user || !['admin', 'manager', 'broker'].includes(user.role)) {
      setPendingCount(0);
      setOverdueCount(0);
      setDueTodayCount(0);
      setNextDueAt(undefined);
      return;
    }

    setIsLoading(true);
    try {
      const result = await reminderService.getAllReminders({
        status: 'pending',
        limit: 500,
      });
      const now = new Date();
      const { start, end } = getDayBoundaries(now);

      const pending = (result.data || []).filter(item => item.status === 'pending');
      const overdue = pending.filter(item => new Date(item.dueAt).getTime() < now.getTime());
      const today = pending.filter(item => {
        const dueAt = new Date(item.dueAt).getTime();
        return dueAt >= start.getTime() && dueAt <= end.getTime();
      });
      const sorted = [...pending].sort(
        (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      );

      setPendingCount(pending.length);
      setOverdueCount(overdue.length);
      setDueTodayCount(today.length);
      setNextDueAt(sorted[0]?.dueAt);
    } catch {
      // Silent fallback keeps app usable if reminders endpoint is temporarily unavailable.
      setPendingCount(0);
      setOverdueCount(0);
      setDueTodayCount(0);
      setNextDueAt(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!socket || !isAuthenticated) return;

    const refreshHandler = () => {
      void refresh();
    };

    const events = [
      'dashboard:refresh',
      'reminder:created',
      'reminder:updated',
      'reminder:completed',
      'reminder:deleted',
    ];

    events.forEach(event => socket.on(event, refreshHandler));

    return () => {
      events.forEach(event => socket.off(event, refreshHandler));
    };
  }, [socket, isAuthenticated, refresh]);

  const value = useMemo(
    () => ({
      pendingCount,
      overdueCount,
      dueTodayCount,
      nextDueAt,
      isLoading,
      refresh,
    }),
    [pendingCount, overdueCount, dueTodayCount, nextDueAt, isLoading, refresh]
  );

  return <ReminderContext.Provider value={value}>{children}</ReminderContext.Provider>;
};

export const useReminderNotifications = () => {
  const context = useContext(ReminderContext);
  if (!context) {
    throw new Error('useReminderNotifications must be used within ReminderProvider');
  }
  return context;
};
