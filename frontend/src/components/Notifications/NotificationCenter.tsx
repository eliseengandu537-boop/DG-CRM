'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiBell } from 'react-icons/fi';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/RealtimeContext';
import { formatRelativeTime } from '@/lib/dashboardService';
import { playNotificationSound } from '@/lib/notificationAudio';
import {
  NotificationRecord,
  notificationService,
} from '@/services/notificationService';

type IncomingNotificationPayload = {
  id?: string;
  title?: string;
  message?: string;
  type?: string;
  entityType?: string;
  entityId?: string;
  dealId?: string;
  brokerId?: string;
  sound?: boolean;
  read?: boolean;
  visibilityScope?: string;
  createdAt?: string;
  timestamp?: string;
  payload?: Record<string, unknown> | null;
};

const MAX_NOTIFICATIONS = 50;
const EVENT_DEDUP_MS = 3000;

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function toEventKey(payload: IncomingNotificationPayload): string {
  const id = normalizeText(payload.id);
  if (id) return id;

  const message = normalizeText(payload.message);
  const timestamp = normalizeText(payload.createdAt || payload.timestamp);
  const type = normalizeText(payload.type);
  return `${type}|${message}|${timestamp}`;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNotificationRecord(payload: IncomingNotificationPayload): NotificationRecord | null {
  const createdAt = normalizeText(payload.createdAt || payload.timestamp) || new Date().toISOString();
  const message = normalizeText(payload.message) || 'New notification';
  const title = normalizeText(payload.title) || 'Notification';
  const type = normalizeText(payload.type) || 'notification';
  const rawPayload = toObject(payload.payload);
  const payloadDealId = normalizeText(rawPayload?.dealId);
  const entityType = normalizeText(payload.entityType) || 'activity';
  const entityId = normalizeText(payload.entityId || payload.dealId || payloadDealId) || undefined;
  const brokerId = normalizeText(payload.brokerId || rawPayload?.brokerId) || undefined;
  const id = normalizeText(payload.id) || `${type}|${message}|${createdAt}`;

  if (!id) return null;

  return {
    id,
    title,
    message,
    type,
    entityType,
    entityId,
    brokerId,
    sound: Boolean(payload.sound),
    read: Boolean(payload.read),
    visibilityScope:
      String(payload.visibilityScope || '').trim().toLowerCase() === 'private'
        ? 'private'
        : 'shared',
    payload: rawPayload,
    createdAt,
  };
}

function formatUnreadCount(value: number): string {
  if (value <= 0) return '';
  if (value > 99) return '99+';
  return String(value);
}

export const NotificationCenter: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { socket } = useRealtime();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const recentEventsRef = useRef<Map<string, number>>(new Map());

  const canViewNotifications = useMemo(() => {
    const role = String(user?.role || '').trim().toLowerCase();
    return isAuthenticated && ['admin', 'manager', 'broker'].includes(role);
  }, [isAuthenticated, user?.role]);

  const loadNotifications = useCallback(
    async (showLoader = false) => {
      if (!canViewNotifications) {
        setNotifications([]);
        setUnreadCount(0);
        setError('');
        return;
      }

      // Keep the notification card empty by default and only show realtime events.
      setError('');
    },
    [canViewNotifications]
  );

  const handleIncomingNotification = useCallback(
    (payload: IncomingNotificationPayload) => {
      const key = toEventKey(payload);
      if (!key) return;

      const now = Date.now();
      const lastSeenAt = recentEventsRef.current.get(key);
      if (lastSeenAt && now - lastSeenAt < EVENT_DEDUP_MS) {
        return;
      }

      const incomingNotification = toNotificationRecord(payload);
      recentEventsRef.current.set(key, now);
      void playNotificationSound();
      if (incomingNotification) {
        setNotifications(current =>
          [incomingNotification, ...current.filter(item => item.id !== incomingNotification.id)].slice(
            0,
            MAX_NOTIFICATIONS
          )
        );
        if (!incomingNotification.read) {
          setUnreadCount(current => current + 1);
        }
      } else {
        setUnreadCount(current => current + 1);
      }

    },
    [loadNotifications]
  );

  const handleMarkRead = useCallback(async (notificationId: string) => {
    try {
      const updated = await notificationService.markNotificationRead(notificationId);
      setNotifications(current =>
        current.map(item =>
          item.id === notificationId
            ? {
                ...item,
                read: updated.read ?? true,
              }
            : item
        )
      );
      setUnreadCount(current => Math.max(0, current - 1));
    } catch {
      // Keep dashboard stable during transient network issues.
    }
  }, []);

  useEffect(() => {
    if (!socket || !canViewNotifications) return;

    socket.on('notification', handleIncomingNotification);
    socket.on('notification:created', handleIncomingNotification);

    return () => {
      socket.off('notification', handleIncomingNotification);
      socket.off('notification:created', handleIncomingNotification);
    };
  }, [socket, canViewNotifications, handleIncomingNotification]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!canViewNotifications) {
    return null;
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
        aria-label="Open notifications"
      >
        <FiBell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {formatUnreadCount(unreadCount)}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-[1200] mt-2 w-[360px] max-w-[92vw] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-stone-900">Notifications</p>
              <p className="text-[11px] text-stone-500">Unread: {unreadCount}</p>
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`notification-skeleton-${index}`}
                    className="h-14 animate-pulse rounded-lg bg-stone-100"
                  />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="min-h-[120px]" />
            ) : (
              <div className="divide-y divide-stone-100">
                {notifications.map(notification => {
                  const isUnread = !notification.read;
                  const createdAt = normalizeText(notification.createdAt);

                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => {
                        if (isUnread) {
                          void handleMarkRead(notification.id);
                        }

                        window.dispatchEvent(
                          new CustomEvent('navigation:page-change', {
                            detail: { page: 'Dashboard' },
                          })
                        );
                        window.location.hash = 'recent-activities';
                        window.dispatchEvent(new Event('activity:open-history'));
                      }}
                      className="w-full bg-white px-3 py-3 text-left transition-colors hover:bg-stone-50"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${
                            isUnread ? 'bg-blue-500' : 'bg-stone-300'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-stone-900">
                            {notification.title || 'Notification'}
                          </p>
                          <p className="mt-1 text-xs text-stone-700">{notification.message}</p>
                          <p className="mt-1 text-[11px] text-stone-500">
                            {createdAt ? formatRelativeTime(createdAt) : 'just now'}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="border-t border-stone-200 px-3 py-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
