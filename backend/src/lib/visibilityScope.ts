import { User, VisibilityScope } from '@/types';
import { getEffectiveBrokerId } from '@/lib/departmentAccess';

type VisibilityScopedUser = Pick<User, 'role' | 'brokerId' | 'id'>;

export function buildVisibilityWhere(
  user?: VisibilityScopedUser | null,
  options?: {
    visibilityField?: string;
    brokerField?: string;
    brokerFields?: string[];
  }
): Record<string, unknown> {
  const visibilityField = options?.visibilityField || 'visibilityScope';
  const brokerFields = Array.from(
    new Set(
      (options?.brokerFields?.length
        ? options.brokerFields
        : [options?.brokerField || 'brokerId']
      ).filter(Boolean)
    )
  );

  if (!user || user.role === 'viewer') {
    return { [visibilityField]: 'shared' };
  }

  if (user.role === 'admin' || user.role === 'manager') {
    return {};
  }

  const effectiveBrokerId = getEffectiveBrokerId(user);
  if (!effectiveBrokerId) {
    return { [visibilityField]: 'shared' };
  }

  return {
    OR: [
      { [visibilityField]: 'shared' },
      ...brokerFields.map(brokerField => ({ [brokerField]: effectiveBrokerId })),
    ],
  };
}

export function canUserAccessVisibility(
  user: VisibilityScopedUser | null | undefined,
  visibilityScope?: VisibilityScope | string | null,
  brokerId?: string | null
): boolean {
  const normalizedScope: VisibilityScope =
    String(visibilityScope || '').trim().toLowerCase() === 'private' ? 'private' : 'shared';

  if (normalizedScope === 'shared') {
    return true;
  }

  if (!user) {
    return false;
  }

  if (user.role === 'admin' || user.role === 'manager') {
    return true;
  }

  const effectiveBrokerId = getEffectiveBrokerId(user);
  return Boolean(effectiveBrokerId && brokerId && effectiveBrokerId === brokerId);
}
