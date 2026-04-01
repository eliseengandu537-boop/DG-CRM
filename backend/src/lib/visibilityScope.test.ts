import { buildVisibilityWhere, canUserAccessVisibility } from '@/lib/visibilityScope';
import { User } from '@/types';

function createUser(role: User['role'], overrides?: Partial<User>): User {
  return {
    id: overrides?.id || 'user-1',
    email: overrides?.email || `${role}@example.com`,
    name: overrides?.name || role,
    role,
    permissions: overrides?.permissions || [],
    brokerId: overrides?.brokerId || (role === 'broker' ? 'broker-1' : null),
    department: overrides?.department || (role === 'broker' ? 'sales' : null),
    createdAt: overrides?.createdAt || new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: overrides?.updatedAt || new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('visibilityScope', () => {
  it('lets brokers query shared data plus their own private data', () => {
    expect(buildVisibilityWhere(createUser('broker'))).toEqual({
      OR: [{ visibilityScope: 'shared' }, { brokerId: 'broker-1' }],
    });
  });

  it('supports multiple ownership fields for visibility-scoped models', () => {
    expect(
      buildVisibilityWhere(createUser('broker'), {
        brokerFields: ['assignedBrokerId', 'createdByBrokerId'],
      })
    ).toEqual({
      OR: [
        { visibilityScope: 'shared' },
        { assignedBrokerId: 'broker-1' },
        { createdByBrokerId: 'broker-1' },
      ],
    });
  });

  it('lets admin and manager query all visibility scopes', () => {
    expect(buildVisibilityWhere(createUser('admin'))).toEqual({});
    expect(buildVisibilityWhere(createUser('manager'))).toEqual({});
  });

  it('keeps viewers and anonymous users on shared data only', () => {
    expect(buildVisibilityWhere(createUser('viewer', { brokerId: null, department: null }))).toEqual({
      visibilityScope: 'shared',
    });
    expect(buildVisibilityWhere(null)).toEqual({
      visibilityScope: 'shared',
    });
  });

  it('enforces private visibility ownership rules', () => {
    const broker = createUser('broker');
    expect(canUserAccessVisibility(broker, 'private', 'broker-1')).toBe(true);
    expect(canUserAccessVisibility(broker, 'private', 'broker-2')).toBe(false);
    expect(canUserAccessVisibility(createUser('admin'), 'private', 'broker-2')).toBe(true);
    expect(canUserAccessVisibility(null, 'private', 'broker-1')).toBe(false);
  });
});
