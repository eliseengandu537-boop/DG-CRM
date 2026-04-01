import { emitScopedEvent } from '@/realtime';
import { User, VisibilityScope } from '@/types';
import { brokerRoleLabel } from '@/lib/departmentAccess';

type ActivityNotificationArgs = {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  brokerId?: string | null;
  actor?: User | null;
  visibilityScope?: VisibilityScope;
  description?: string | null;
  payload?: Record<string, unknown>;
};

function actionLabel(action: string): string {
  const normalized = String(action || '').trim().toLowerCase();
  if (normalized.includes('deleted')) return 'deleted';
  if (normalized.includes('status') || normalized.includes('changed')) return 'changed';
  if (normalized.includes('updated')) return 'updated';
  return 'created';
}

function entityLabel(entityType: string): string {
  return String(entityType || 'record')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildMessage(args: ActivityNotificationArgs): string {
  const actorName = args.actor?.name || 'System';
  const roleLabel = args.actor ? brokerRoleLabel(args.actor) : 'System';
  const verb = actionLabel(args.action);
  const label = args.entityName
    ? `${entityLabel(args.entityType)} "${args.entityName}"`
    : entityLabel(args.entityType);
  const timeLabel = new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return `${actorName} (${roleLabel}) ${verb} ${label} at ${timeLabel}`;
}

export function emitActivityNotification(args: ActivityNotificationArgs): void {
  const visibilityScope = args.visibilityScope || 'shared';
  const message = buildMessage(args);
  const timestamp = new Date().toISOString();
  const actorUser = {
    id: args.actor?.id || null,
    name: args.actor?.name || 'System',
    role: args.actor?.role || null,
  };
  const payload = {
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId || null,
    brokerId: args.brokerId || null,
    visibilityScope,
    message,
    description: args.description || null,
    payload: args.payload || {},
    createdAt: timestamp,
    user: actorUser,
    timestamp,
  };

  const notificationPayload = {
    title: args.description || 'New activity',
    message,
    type: args.action,
    entityType: args.entityType,
    entityId: args.entityId || null,
    brokerId: args.brokerId || null,
    visibilityScope,
    payload: args.payload || {},
    createdAt: timestamp,
    timestamp,
    user: actorUser,
  };

  emitScopedEvent({
    event: 'new_activity',
    payload: {
      message,
      user: actorUser,
      timestamp,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId || null,
      brokerId: args.brokerId || null,
      visibilityScope,
      description: args.description || null,
      payload: args.payload || {},
    },
    brokerId: visibilityScope === 'private' ? args.brokerId || null : null,
    roles: visibilityScope === 'shared' ? ['broker'] : undefined,
    includePrivileged: true,
  });

  emitScopedEvent({
    event: 'activity:created',
    payload,
    brokerId: visibilityScope === 'private' ? args.brokerId || null : null,
    roles: visibilityScope === 'shared' ? ['broker'] : undefined,
    includePrivileged: true,
  });

  emitScopedEvent({
    event: 'notification',
    payload: notificationPayload,
    brokerId: visibilityScope === 'private' ? args.brokerId || null : null,
    roles: visibilityScope === 'shared' ? ['broker'] : undefined,
    includePrivileged: true,
  });

  emitScopedEvent({
    event: 'notification:created',
    payload: notificationPayload,
    brokerId: visibilityScope === 'private' ? args.brokerId || null : null,
    roles: visibilityScope === 'shared' ? ['broker'] : undefined,
    includePrivileged: true,
  });
}
