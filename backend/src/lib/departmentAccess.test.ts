import {
  addDepartmentScope,
  canBrokerAccessRecord,
  getBrokerScope,
  normalizeBrokerDepartment,
} from '@/lib/departmentAccess';
import { User } from '@/types';

function createBrokerUser(
  department: User['department'],
  overrides?: Partial<User>
): User {
  return {
    id: overrides?.id || 'user-1',
    email: overrides?.email || 'broker@example.com',
    name: overrides?.name || 'Broker',
    role: overrides?.role || 'broker',
    permissions: overrides?.permissions || [],
    brokerId: overrides?.brokerId || 'broker-1',
    department,
    createdAt: overrides?.createdAt || new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: overrides?.updatedAt || new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('departmentAccess', () => {
  it('normalizes broker departments to sales or leasing only', () => {
    expect(normalizeBrokerDepartment('sales')).toBe('sales');
    expect(normalizeBrokerDepartment('leasing')).toBe('leasing');
    expect(normalizeBrokerDepartment('auction')).toBeNull();
  });

  it('gives sales brokers access to sales and auction only', () => {
    const scope = getBrokerScope(createBrokerUser('sales'));
    expect(scope.modules).toEqual(['sales', 'auction']);
    expect(scope.dealTypes).toEqual(['sale', 'auction']);
  });

  it('gives leasing brokers access to leasing and auction only', () => {
    const scope = getBrokerScope(createBrokerUser('leasing'));
    expect(scope.modules).toEqual(['leasing', 'auction']);
    expect(scope.dealTypes).toEqual(['lease', 'auction']);
  });

  it('scopes list queries by department instead of broker ownership', () => {
    const user = createBrokerUser('sales');
    expect(addDepartmentScope({}, user, 'moduleType')).toEqual({
      moduleType: { in: ['sales', 'auction'] },
    });
    expect(addDepartmentScope({ brokerId: 'broker-1' }, user, 'moduleType')).toEqual({
      AND: [{ brokerId: 'broker-1' }, { moduleType: { in: ['sales', 'auction'] } }],
    });
  });

  it('blocks cross-department records even if the broker owns them', () => {
    const salesBroker = createBrokerUser('sales', { brokerId: 'broker-1' });
    expect(canBrokerAccessRecord(salesBroker, 'sales', 'broker-1')).toBe(true);
    expect(canBrokerAccessRecord(salesBroker, 'auction', 'broker-1')).toBe(true);
    expect(canBrokerAccessRecord(salesBroker, 'leasing', 'broker-1')).toBe(false);
  });
});
