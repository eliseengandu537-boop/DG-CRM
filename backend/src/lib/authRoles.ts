import { User } from '@/types';

const AUTHENTICATABLE_ROLES: Array<User['role']> = ['admin', 'manager', 'broker'];

export function isAuthenticatableRole(role: unknown): role is 'admin' | 'manager' | 'broker' {
  return AUTHENTICATABLE_ROLES.includes(String(role || '').trim().toLowerCase() as User['role']);
}

export function getAuthenticatableRoles(): Array<'admin' | 'manager' | 'broker'> {
  return [...AUTHENTICATABLE_ROLES] as Array<'admin' | 'manager' | 'broker'>;
}
