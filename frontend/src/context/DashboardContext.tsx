'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { DashboardMetrics, DashboardTrends, fetchDashboardMetrics } from '@/lib/dashboardService';
import { useRealtime } from '@/context/RealtimeContext';
import { useAuth } from '@/context/AuthContext';

interface DashboardContextType {
  metrics: DashboardMetrics | null;
  trends: DashboardTrends;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refreshMetrics: (showLoader?: boolean) => Promise<void>;
}

const ZERO_TRENDS: DashboardTrends = {
  totalRevenue: 0,
  dealsWon: 0,
  dealsLost: 0,
  companyCommission: 0,
  openDeals: 0,
  closedDeals: 0,
  conversionRate: 0,
  leadCount: 0,
};

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

function calculateTrend(currentValue: number, previousValue: number): number {
  const current = Number.isFinite(currentValue) ? currentValue : 0;
  const previous = Number.isFinite(previousValue) ? previousValue : 0;
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function buildTrends(
  previous: DashboardMetrics | null,
  current: DashboardMetrics
): DashboardTrends {
  if (!previous) return ZERO_TRENDS;

  return {
    totalRevenue: calculateTrend(current.totalRevenue, previous.totalRevenue),
    dealsWon: calculateTrend(current.dealsWon, previous.dealsWon),
    dealsLost: calculateTrend(current.dealsLost, previous.dealsLost),
    companyCommission: calculateTrend(current.companyCommission, previous.companyCommission),
    openDeals: calculateTrend(current.statistics.openDeals, previous.statistics.openDeals),
    closedDeals: calculateTrend(current.statistics.closedDeals, previous.statistics.closedDeals),
    conversionRate: calculateTrend(
      current.statistics.conversionRate,
      previous.statistics.conversionRate
    ),
    leadCount: calculateTrend(current.leadCount, previous.leadCount),
  };
}

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useRealtime();
  const { isAuthenticated } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [trends, setTrends] = useState<DashboardTrends>(ZERO_TRENDS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const previousMetricsRef = useRef<DashboardMetrics | null>(null);

  const refreshMetrics = useCallback(
    async (showLoader: boolean = true) => {
      if (!isAuthenticated) {
        previousMetricsRef.current = null;
        setMetrics(null);
        setTrends(ZERO_TRENDS);
        setIsLoading(false);
        return;
      }

      try {
        if (showLoader) setIsLoading(true);
        setError(null);

        const data = await fetchDashboardMetrics();
        const nextTrends = data.trends || buildTrends(previousMetricsRef.current, data);

        previousMetricsRef.current = data;
        setMetrics(data);
        setTrends(nextTrends);
        setLastUpdated(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
      } finally {
        setIsLoading(false);
      }
    },
    [isAuthenticated]
  );

  useEffect(() => {
    void refreshMetrics(true);
  }, [refreshMetrics]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      void refreshMetrics(false);
    }, 10000);

    return () => clearInterval(interval);
  }, [isAuthenticated, refreshMetrics]);

  useEffect(() => {
    if (!socket || !isAuthenticated) return;

    const refreshHandler = () => void refreshMetrics(false);

    socket.on('dashboard:refresh', refreshHandler);
    socket.on('lead:created', refreshHandler);
    socket.on('lead:updated', refreshHandler);
    socket.on('lead:deleted', refreshHandler);
    socket.on('deal:created', refreshHandler);
    socket.on('deal:updated', refreshHandler);
    socket.on('deal:deleted', refreshHandler);
    socket.on('forecast-deal:created', refreshHandler);
    socket.on('forecast-deal:updated', refreshHandler);
    socket.on('forecast-deal:deleted', refreshHandler);
    socket.on('contact:created', refreshHandler);
    socket.on('contact:updated', refreshHandler);
    socket.on('contact:deleted', refreshHandler);
    socket.on('broker:created', refreshHandler);
    socket.on('broker:updated', refreshHandler);
    socket.on('broker:deleted', refreshHandler);
    socket.on('new_activity', refreshHandler);
    socket.on('activity:created', refreshHandler);
    socket.on('activity:deleted', refreshHandler);
    socket.on('notification:created', refreshHandler);

    return () => {
      socket.off('dashboard:refresh', refreshHandler);
      socket.off('lead:created', refreshHandler);
      socket.off('lead:updated', refreshHandler);
      socket.off('lead:deleted', refreshHandler);
      socket.off('deal:created', refreshHandler);
      socket.off('deal:updated', refreshHandler);
      socket.off('deal:deleted', refreshHandler);
      socket.off('forecast-deal:created', refreshHandler);
      socket.off('forecast-deal:updated', refreshHandler);
      socket.off('forecast-deal:deleted', refreshHandler);
      socket.off('contact:created', refreshHandler);
      socket.off('contact:updated', refreshHandler);
      socket.off('contact:deleted', refreshHandler);
      socket.off('broker:created', refreshHandler);
      socket.off('broker:updated', refreshHandler);
      socket.off('broker:deleted', refreshHandler);
      socket.off('new_activity', refreshHandler);
      socket.off('activity:created', refreshHandler);
      socket.off('activity:deleted', refreshHandler);
      socket.off('notification:created', refreshHandler);
    };
  }, [socket, isAuthenticated, refreshMetrics]);

  return (
    <DashboardContext.Provider
      value={{ metrics, trends, isLoading, error, lastUpdated, refreshMetrics }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within DashboardProvider');
  }
  return context;
};
