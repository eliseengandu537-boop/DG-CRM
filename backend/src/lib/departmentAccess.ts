import { BrokerDepartment, DealType, ModuleScope, User } from '@/types';

export type ScopeField = 'moduleType' | 'type' | 'module';

type ScopedUser = Pick<User, 'role' | 'department' | 'brokerId' | 'id'>;

type BrokerScope = {
  unrestricted: boolean;
  department: BrokerDepartment | null;
  brokerId: string | null;
  modules: ModuleScope[];
  dealTypes: DealType[];
};

const SALES_ALIASES = new Set([
  'sales',
  'sale',
  'commercial real estate',
  'commercial',
  'commercial sales',
]);
const LEASING_ALIASES = new Set(['leasing', 'lease']);
const AUCTION_ALIASES = new Set(['auction']);

function normalizeValue(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function normalizeBrokerDepartment(value?: string | null): BrokerDepartment | null {
  const normalized = normalizeValue(value);
  if (!normalized) return null;
  if (SALES_ALIASES.has(normalized)) return 'sales';
  if (LEASING_ALIASES.has(normalized)) return 'leasing';
  return null;
}

export function normalizeModuleScope(value?: string | null): ModuleScope | null {
  const normalized = normalizeValue(value);
  if (!normalized) return null;
  if (SALES_ALIASES.has(normalized)) return 'sales';
  if (LEASING_ALIASES.has(normalized)) return 'leasing';
  if (AUCTION_ALIASES.has(normalized)) return 'auction';
  return null;
}

export function normalizeDealType(value?: string | null): DealType | null {
  const normalized = normalizeValue(value);
  if (!normalized) return null;
  if (normalized === 'sale' || normalized === 'sales') return 'sale';
  if (normalized === 'lease' || normalized === 'leasing') return 'lease';
  if (normalized === 'auction') return 'auction';
  return null;
}

export function normalizeDepartment(value?: string | null): ModuleScope | null {
  return normalizeModuleScope(value);
}

export function departmentLabel(value?: string | null): string {
  const normalized = normalizeModuleScope(value);
  return normalized ? normalized.toUpperCase() : String(value || '').trim();
}

export function brokerRoleLabel(user?: Pick<User, 'role' | 'department'> | null): string {
  if (!user) return 'System';
  if (user.role === 'admin') return 'Admin';
  if (user.role === 'manager') return 'Manager';
  if (user.role !== 'broker') return 'User';

  const department = normalizeBrokerDepartment(user.department);
  if (department === 'sales') return 'Sales Broker';
  if (department === 'leasing') return 'Leasing Broker';
  return 'Broker';
}

export function getEffectiveBrokerId(
  user?: Pick<User, 'role' | 'brokerId' | 'id'> | null
): string | null {
  if (!user || user.role !== 'broker') return null;
  return user.brokerId || user.id || null;
}

export function getBrokerScope(user?: ScopedUser | null): BrokerScope {
  if (!user || user.role === 'admin' || user.role === 'manager') {
    return {
      unrestricted: true,
      department: null,
      brokerId: null,
      modules: ['sales', 'leasing', 'auction'],
      dealTypes: ['sale', 'lease', 'auction'],
    };
  }

  const department = normalizeBrokerDepartment(user.department);
  const brokerId = getEffectiveBrokerId(user);

  if (department === 'leasing') {
    return {
      unrestricted: false,
      department,
      brokerId,
      modules: ['leasing', 'auction'],
      dealTypes: ['lease', 'auction'],
    };
  }

  if (department === 'sales') {
    return {
      unrestricted: false,
      department,
      brokerId,
      modules: ['sales', 'auction'],
      dealTypes: ['sale', 'auction'],
    };
  }

  return {
    unrestricted: false,
    department: null,
    brokerId,
    modules: [],
    dealTypes: [],
  };
}

function getAllowedValues(scope: BrokerScope, field: ScopeField): Array<DealType | ModuleScope> {
  if (field === 'type') {
    return scope.dealTypes;
  }

  return scope.modules;
}

function normalizeRecordScopeValue(value?: string | null): ModuleScope | null {
  const moduleScope = normalizeModuleScope(value);
  if (moduleScope) return moduleScope;

  const dealType = normalizeDealType(value);
  if (dealType === 'sale') return 'sales';
  if (dealType === 'lease') return 'leasing';
  if (dealType === 'auction') return 'auction';
  return null;
}

export function addDepartmentScope(
  where: Record<string, unknown>,
  user?: ScopedUser | null,
  field: ScopeField = 'moduleType'
): Record<string, unknown> {
  const scope = getBrokerScope(user);
  if (scope.unrestricted) {
    return where;
  }

  const allowedValues = getAllowedValues(scope, field);
  const accessFilter = { [field]: { in: allowedValues } };

  if (Object.keys(where).length === 0) {
    return accessFilter;
  }

  return {
    AND: [where, accessFilter],
  };
}

export function assertBrokerCanAccessDealType(
  user?: ScopedUser | null,
  dealType?: string | null
): void {
  const scope = getBrokerScope(user);
  if (scope.unrestricted) return;

  const normalizedDealType = normalizeDealType(dealType);
  if (normalizedDealType && scope.dealTypes.includes(normalizedDealType)) {
    return;
  }

  throw new Error('Forbidden: department cannot access this deal type');
}

export function assertBrokerCanAccessModule(
  user?: ScopedUser | null,
  moduleType?: string | null
): void {
  const scope = getBrokerScope(user);
  if (scope.unrestricted) return;

  const normalizedModule = normalizeModuleScope(moduleType);
  if (normalizedModule && scope.modules.includes(normalizedModule)) {
    return;
  }

  throw new Error('Forbidden: department cannot access this module');
}

export function assertAssignedBrokerMatchesDepartment(
  brokerDepartment?: string | null,
  moduleOrDealType?: string | null,
  entityLabel = 'record'
): void {
  const normalizedDepartment = normalizeBrokerDepartment(brokerDepartment);
  const normalizedScope = normalizeRecordScopeValue(moduleOrDealType);

  if (!normalizedDepartment || !normalizedScope || normalizedScope === 'auction') {
    return;
  }

  if (normalizedDepartment !== normalizedScope) {
    throw new Error(`Assigned broker department cannot own this ${entityLabel}`);
  }
}

export function canBrokerAccessRecord(
  user?: ScopedUser | null,
  moduleValue?: string | null,
  brokerId?: string | null
): boolean {
  const scope = getBrokerScope(user);
  if (scope.unrestricted) return true;

  const normalizedScope = normalizeRecordScopeValue(moduleValue);
  if (normalizedScope) {
    return scope.modules.includes(normalizedScope);
  }

  const safeBrokerId = String(brokerId || '').trim();
  return Boolean(scope.brokerId && safeBrokerId && scope.brokerId === safeBrokerId);
}

export function canAccessPrivateBrokerData(
  user?: ScopedUser | null,
  brokerId?: string | null
): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'manager') return true;

  const effectiveBrokerId = getEffectiveBrokerId(user);
  return Boolean(effectiveBrokerId && brokerId && effectiveBrokerId === brokerId);
}
