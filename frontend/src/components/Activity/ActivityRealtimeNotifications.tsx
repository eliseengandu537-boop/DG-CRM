'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/RealtimeContext';
import { activityService } from '@/services/activityService';
import { playNotificationSound } from '@/lib/notificationAudio';

type IncomingActivityPayload = {
  id?: string;
  message?: string;
  description?: string;
  action?: string;
  entityType?: string;
  timestamp?: string;
  createdAt?: string;
  actorName?: string;
  actorDisplayName?: string;
  user?: {
    id?: string | null;
    name?: string | null;
    role?: string | null;
  } | null;
};

type ToastActivity = {
  id: string;
  message: string;
  actor: string;
  timestamp: string;
};

const TOAST_DURATION_MS = 5000;
const FALLBACK_POLL_MS = 15000;

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'just now';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toToast(payload: IncomingActivityPayload): ToastActivity | null {
  const timestamp = String(payload.timestamp || payload.createdAt || new Date().toISOString());
  const actor =
    String(
      payload.user?.name ||
        payload.actorDisplayName ||
        payload.actorName ||
        'System'
    ).trim() || 'System';
  const message =
    String(payload.message || payload.description || '').trim() ||
    'New activity';

  const key = String(payload.id || `${actor}-${message}-${timestamp}`).trim();
  if (!key) return null;

  return {
    id: key,
    message,
    actor,
    timestamp,
  };
}

export const ActivityRealtimeNotifications: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { socket } = useRealtime();
  const [toasts, setToasts] = useState<ToastActivity[]>([]);
  const [socketConnected, setSocketConnected] = useState<boolean>(Boolean(socket?.connected));
  const seenKeysRef = useRef<Set<string>>(new Set());
  const lastPolledActivityIdRef = useRef<string | null>(null);

  const canReceive = useMemo(
    () => isAuthenticated && ['admin', 'manager', 'broker'].includes(String(user?.role || '')),
    [isAuthenticated, user?.role]
  );

  const pushToast = useCallback((payload: IncomingActivityPayload) => {
    const toast = toToast(payload);
    if (!toast) return;
    if (seenKeysRef.current.has(toast.id)) return;
    seenKeysRef.current.add(toast.id);

    void playNotificationSound();
    setToasts(current => [toast, ...current].slice(0, 4));
    window.setTimeout(() => {
      setToasts(current => current.filter(item => item.id !== toast.id));
    }, TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    if (!socket) {
      setSocketConnected(false);
      return;
    }

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    setSocketConnected(Boolean(socket.connected));
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket || !canReceive) return;

    const onNewActivity = (payload: IncomingActivityPayload) => pushToast(payload);
    const onLegacyActivity = (payload: IncomingActivityPayload) => pushToast(payload);
    const onNotification = (payload: IncomingActivityPayload) => pushToast(payload);

    socket.on('new_activity', onNewActivity);
    socket.on('notification', onNotification);
    socket.on('activity:created', onLegacyActivity);
    socket.on('notification:created', onLegacyActivity);

    return () => {
      socket.off('new_activity', onNewActivity);
      socket.off('notification', onNotification);
      socket.off('activity:created', onLegacyActivity);
      socket.off('notification:created', onLegacyActivity);
    };
  }, [socket, canReceive, pushToast]);

  useEffect(() => {
    if (!canReceive) return;
    if (socket && socketConnected) return;

    let active = true;
    const pollLatestActivity = async () => {
      try {
        const result = await activityService.getActivities({ page: 1, limit: 1 });
        const latest = result.data?.[0];
        if (!active || !latest) return;

        if (!lastPolledActivityIdRef.current) {
          lastPolledActivityIdRef.current = latest.id;
          return;
        }

        if (latest.id !== lastPolledActivityIdRef.current) {
          pushToast({
            id: latest.id,
            message: latest.description,
            actorName: latest.actorDisplayName || latest.actorName,
            createdAt: latest.createdAt,
          });
          lastPolledActivityIdRef.current = latest.id;
        }
      } catch {
        // Silent fallback keeps dashboard stable during temporary API/network interruptions.
      }
    };

    void pollLatestActivity();
    const timer = window.setInterval(() => {
      void pollLatestActivity();
    }, FALLBACK_POLL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [canReceive, socket, socketConnected, pushToast]);

  if (!canReceive || toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[1200] flex w-[320px] flex-col gap-2">
      {toasts.map(toast => (
        <button
          key={toast.id}
          type="button"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent('navigation:page-change', {
                detail: { page: 'Dashboard' },
              })
            );
            window.location.hash = 'recent-activities';
            window.dispatchEvent(new Event('activity:open-history'));
            setToasts(current => current.filter(item => item.id !== toast.id));
          }}
          className="pointer-events-auto rounded-xl border border-blue-200 bg-white px-4 py-3 text-left shadow-lg transition hover:bg-blue-50"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">New Activity</p>
          <p className="mt-1 text-sm font-medium text-stone-900">{toast.actor}</p>
          <p className="mt-1 text-sm text-stone-700">{toast.message}</p>
          <p className="mt-1 text-[11px] text-stone-500">{formatTime(toast.timestamp)}</p>
        </button>
      ))}
    </div>
  );
};

export default ActivityRealtimeNotifications;
