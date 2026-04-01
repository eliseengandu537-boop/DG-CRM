'use client';

import { useEffect } from 'react';
import { useRealtime } from '@/context/RealtimeContext';

const DEFAULT_EVENTS = [
  'dashboard:refresh',
  'property:created',
  'property:updated',
  'property:deleted',
  'stock:created',
  'stock:updated',
  'stock:deleted',
];

export function useRealtimeRefresh(
  onRefresh: () => void,
  events: string[] = DEFAULT_EVENTS
): void {
  const { socket } = useRealtime();

  useEffect(() => {
    if (!socket) return;

    for (const event of events) {
      socket.on(event, onRefresh);
    }

    return () => {
      for (const event of events) {
        socket.off(event, onRefresh);
      }
    };
  }, [events, onRefresh, socket]);
}
