import { customRecordService, type CustomRecord } from '@/services/customRecordService';

export const USER_PROFILE_ENTITY = 'user_profile';
export const BROKER_PROFILE_ENTITY = 'broker_profile';
const PROFILE_CATEGORY = 'profile';

type ProfilePayload = Record<string, unknown>;

type ProfileIdentity = {
  id?: string;
  email?: string;
  name?: string;
  referenceId?: string;
};

const BROKER_BILLING_KEYS = new Set([
  'billingTarget',
  'billingYTD',
  'currentBilling',
  'annualTarget',
  'progressPercentage',
]);

function normalizeKey(value?: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function matchesIdentity(record: CustomRecord<ProfilePayload>, identity: ProfileIdentity): boolean {
  const candidates = [
    identity.referenceId,
    identity.id,
    identity.email,
    identity.name,
  ]
    .map(normalizeKey)
    .filter(Boolean);

  if (candidates.length === 0) {
    return false;
  }

  const recordCandidates = [
    record.referenceId,
    record.name,
    typeof record.payload === 'object' && record.payload && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>).id
      : undefined,
    typeof record.payload === 'object' && record.payload && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>).backendId
      : undefined,
    typeof record.payload === 'object' && record.payload && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>).email
      : undefined,
  ]
    .map(normalizeKey)
    .filter(Boolean);

  return candidates.some(candidate => recordCandidates.includes(candidate));
}

function sanitizeProfilePayload(
  entityType: string,
  payload: ProfilePayload
): {
  payload: ProfilePayload;
  changed: boolean;
} {
  if (
    entityType !== BROKER_PROFILE_ENTITY ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return { payload, changed: false };
  }

  const sanitized = { ...payload };
  let changed = false;

  BROKER_BILLING_KEYS.forEach(key => {
    if (key in sanitized) {
      delete sanitized[key];
      changed = true;
    }
  });

  return { payload: sanitized, changed };
}

async function sanitizePersistedRecord(
  record: CustomRecord<ProfilePayload>
): Promise<CustomRecord<ProfilePayload>> {
  const { payload, changed } = sanitizeProfilePayload(record.entityType, record.payload);
  if (!changed) {
    return {
      ...record,
      payload,
    };
  }

  try {
    return await customRecordService.updateCustomRecord(record.id, {
      entityType: record.entityType,
      name: record.name,
      status: record.status,
      category: record.category,
      referenceId: record.referenceId,
      payload,
    });
  } catch {
    return {
      ...record,
      payload,
    };
  }
}

async function listRecords(entityType: string): Promise<CustomRecord<ProfilePayload>[]> {
  const response = await customRecordService.getAllCustomRecords<ProfilePayload>({
    entityType,
    limit: 1000,
  });

  return Promise.all(response.data.map(record => sanitizePersistedRecord(record)));
}

async function findRecord(
  entityType: string,
  identity: ProfileIdentity
): Promise<CustomRecord<ProfilePayload> | null> {
  const records = await listRecords(entityType);
  return records.find(record => matchesIdentity(record, identity)) || null;
}

async function upsertRecord(params: {
  entityType: string;
  identity: ProfileIdentity;
  name: string;
  payload: ProfilePayload;
}): Promise<CustomRecord<ProfilePayload>> {
  const records = await listRecords(params.entityType);
  const existing = records.find(record => matchesIdentity(record, params.identity));
  const referenceId =
    params.identity.referenceId || params.identity.id || params.identity.email || params.identity.name;
  const sanitizedPayload = sanitizeProfilePayload(params.entityType, params.payload).payload;
  const request = {
    entityType: params.entityType,
    referenceId: referenceId ? String(referenceId) : undefined,
    name: params.name.trim(),
    category: PROFILE_CATEGORY,
    payload: sanitizedPayload,
  };

  if (existing) {
    return customRecordService.updateCustomRecord(existing.id, request);
  }

  return customRecordService.createCustomRecord(request);
}

export async function loadUserProfileRecord(identity: ProfileIdentity): Promise<CustomRecord<ProfilePayload> | null> {
  return findRecord(USER_PROFILE_ENTITY, identity);
}

export async function saveUserProfileRecord(
  identity: ProfileIdentity,
  payload: ProfilePayload
): Promise<CustomRecord<ProfilePayload>> {
  return upsertRecord({
    entityType: USER_PROFILE_ENTITY,
    identity,
    name: identity.email || identity.name || identity.referenceId || identity.id || 'user-profile',
    payload,
  });
}

export async function loadBrokerProfileRecords(): Promise<CustomRecord<ProfilePayload>[]> {
  return listRecords(BROKER_PROFILE_ENTITY);
}

export async function loadBrokerProfileRecord(
  identity: ProfileIdentity
): Promise<CustomRecord<ProfilePayload> | null> {
  return findRecord(BROKER_PROFILE_ENTITY, identity);
}

export async function saveBrokerProfileRecord(
  identity: ProfileIdentity,
  payload: ProfilePayload
): Promise<CustomRecord<ProfilePayload>> {
  return upsertRecord({
    entityType: BROKER_PROFILE_ENTITY,
    identity,
    name: identity.email || identity.name || identity.referenceId || identity.id || 'broker-profile',
    payload,
  });
}
