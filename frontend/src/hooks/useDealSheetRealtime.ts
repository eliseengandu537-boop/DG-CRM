'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRealtime } from '@/context/RealtimeContext';
import {
  DealSheetRealtimeData,
  fetchDealSheetRealtimeData,
} from '@/services/dealSheetRealtimeService';

interface UseDealSheetRealtimeResult {
  data: DealSheetRealtimeData;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: (showLoader?: boolean) => Promise<void>;
}

const EMPTY_DEAL_SHEET_DATA: DealSheetRealtimeData = {
  deals: [],
  forecastDeals: [],
  brokers: [],
  properties: [],
};

export function useDealSheetRealtime(): UseDealSheetRealtimeResult {
  const { socket } = useRealtime();
  const [data, setData] = useState<DealSheetRealtimeData>(EMPTY_DEAL_SHEET_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async (showLoader: boolean = false) => {
    try {
      if (showLoader) setIsLoading(true);
      setError(null);
      const nextData = await fetchDealSheetRealtimeData();
      setData(nextData);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deal sheet data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refresh(false);
    }, 10000);

    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!socket) return;

    const refreshHandler = () => void refresh(false);

    socket.on('dashboard:refresh', refreshHandler);
    socket.on('deal:created', refreshHandler);
    socket.on('deal:updated', refreshHandler);
    socket.on('deal:deleted', refreshHandler);
    socket.on('forecast-deal:created', refreshHandler);
    socket.on('forecast-deal:updated', refreshHandler);
    socket.on('forecast-deal:deleted', refreshHandler);
    socket.on('broker:created', refreshHandler);
    socket.on('broker:updated', refreshHandler);
    socket.on('broker:deleted', refreshHandler);

    return () => {
      socket.off('dashboard:refresh', refreshHandler);
      socket.off('deal:created', refreshHandler);
      socket.off('deal:updated', refreshHandler);
      socket.off('deal:deleted', refreshHandler);
      socket.off('forecast-deal:created', refreshHandler);
      socket.off('forecast-deal:updated', refreshHandler);
      socket.off('forecast-deal:deleted', refreshHandler);
      socket.off('broker:created', refreshHandler);
      socket.off('broker:updated', refreshHandler);
      socket.off('broker:deleted', refreshHandler);
    };
  }, [socket, refresh]);

  return {
    data,
    isLoading,
    error,
    lastUpdated,
    refresh,
  };
}
