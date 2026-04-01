import bcryptjs from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { config } from '@/config';
import { logInfo } from '@/lib/logger';

function normalizeDealStatusSql(columnSql: string): string {
  return `
    CASE
      WHEN ${columnSql} IS NULL OR BTRIM(${columnSql}::TEXT) = '' THEN 'LOI'
      WHEN LOWER(BTRIM(${columnSql}::TEXT)) IN ('loi', 'letter_of_intent') THEN 'LOI'
      WHEN LOWER(BTRIM(${columnSql}::TEXT)) IN ('otp', 'offer_to_purchase') THEN 'OTP'
      WHEN LOWER(BTRIM(${columnSql}::TEXT)) IN ('otl', 'offer_to_lease') THEN 'OTL'
      WHEN LOWER(BTRIM(${columnSql}::TEXT)) IN ('lease_agreement', 'lease agreement') THEN 'LEASE_AGREEMENT'
      WHEN LOWER(BTRIM(${columnSql}::TEXT)) IN ('sale_agreement', 'sale agreement', 'agreement') THEN 'SALE_AGREEMENT'
      WHEN LOWER(BTRIM(${columnSql}::TEXT)) IN ('closed', 'completed') THEN 'CLOSED'
      WHEN LOWER(BTRIM(${columnSql}::TEXT)) = 'won' THEN 'WON'
      WHEN LOWER(BTRIM(${columnSql}::TEXT)) IN ('awaiting_payment', 'awaiting payment', 'invoice') THEN 'AWAITING_PAYMENT'
      ELSE 'LOI'
    END
  `;
}

function normalizeDealDocumentTypeSql(columnSql: string): string {
  return `
    CASE
      WHEN ${columnSql} IS NULL OR BTRIM(${columnSql}::TEXT) = '' THEN 'AGREEMENT'
      WHEN LOWER(BTRIM(${columnSql}::TEXT)) = 'loi' THEN 'LOI'
      WHEN LOWER(BTRIM(${columnSql}::TEXT)) = 'otp' THEN 'OTP'
      WHEN LOWER(BTRIM(${columnSql}::TEXT)) = 'otl' THEN 'OTL'
      WHEN LOWER(BTRIM(${columnSql}::TEXT)) IN ('agreement', 'lease_agreement', 'sale_agreement', 'lease agreement', 'sale agreement') THEN 'AGREEMENT'
      ELSE 'AGREEMENT'
    END
  `;
}

const DEAL_STATUS_CANONICAL_VALUES = [
  'LOI',
  'OTP',
  'OTL',
  'LEASE_AGREEMENT',
  'SALE_AGREEMENT',
  'CLOSED',
  'WON',
  'AWAITING_PAYMENT',
];

const DEAL_DOCUMENT_TYPE_CANONICAL_VALUES = ['LOI', 'OTP', 'OTL', 'AGREEMENT'];

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS "exists"
  `;

  return Boolean(rows[0]?.exists);
}

async function getColumnTypeName(
  tableName: string,
  columnName: string
): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ udt_name: string | null }>>`
    SELECT udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    LIMIT 1
  `;

  const value = rows[0]?.udt_name;
  return value ? String(value) : null;
}

async function hasNonCanonicalValues(
  tableName: string,
  columnName: string,
  allowedValues: string[]
): Promise<boolean> {
  const escapedAllowedValues = allowedValues
    .map(value => `'${value.replace(/'/g, "''")}'`)
    .join(', ');

  const query = `
    SELECT EXISTS (
      SELECT 1
      FROM "${tableName}"
      WHERE COALESCE(BTRIM("${columnName}"::TEXT), '') NOT IN (${escapedAllowedValues})
    ) AS "exists"
  `;

  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(query);
  return Boolean(rows[0]?.exists);
}

export async function ensureSchemaCompatibility(): Promise<void> {
  await prisma.$executeRaw`
    ALTER TABLE "Lead"
      ADD COLUMN IF NOT EXISTS "comment" TEXT
  `;

  await prisma.$executeRaw`
    ALTER TABLE "ForecastDeal"
      ADD COLUMN IF NOT EXISTS "legal_document" TEXT
  `;

  await prisma.$executeRaw`
    ALTER TABLE "Deal"
      ADD COLUMN IF NOT EXISTS "asset_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "commission_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "gross_commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "company_commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "broker_commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "broker_split_percent" DOUBLE PRECISION NOT NULL DEFAULT 45,
      ADD COLUMN IF NOT EXISTS "auction_referral_percent" DOUBLE PRECISION NOT NULL DEFAULT 35,
      ADD COLUMN IF NOT EXISTS "auction_commission_percent" DOUBLE PRECISION NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS "co_broker_splits" JSONB,
      ADD COLUMN IF NOT EXISTS "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "inactivity_notified_at" TIMESTAMP(3)
  `;

  await prisma.$executeRaw`
    ALTER TABLE "ForecastDeal"
      ADD COLUMN IF NOT EXISTS "deal_type" TEXT,
      ADD COLUMN IF NOT EXISTS "asset_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "commission_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "gross_commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "broker_split_percent" DOUBLE PRECISION NOT NULL DEFAULT 45,
      ADD COLUMN IF NOT EXISTS "auction_referral_percent" DOUBLE PRECISION NOT NULL DEFAULT 35,
      ADD COLUMN IF NOT EXISTS "auction_commission_percent" DOUBLE PRECISION NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS "co_broker_splits" JSONB
  `;

  await prisma.$executeRaw`
    UPDATE "Deal"
    SET "asset_value" = value
    WHERE COALESCE("asset_value", 0) = 0 AND COALESCE(value, 0) > 0
  `;

  await prisma.$executeRaw`
    UPDATE "ForecastDeal"
    SET "asset_value" = "expectedValue"
    WHERE COALESCE("asset_value", 0) = 0 AND COALESCE("expectedValue", 0) > 0
  `;

  await prisma.$executeRaw`
    UPDATE "ForecastDeal"
    SET "commission_percent" = "commissionRate" * 100
    WHERE COALESCE("commission_percent", 0) = 0 AND COALESCE("commissionRate", 0) > 0
  `;

  await prisma.$executeRaw`
    UPDATE "ForecastDeal"
    SET "gross_commission" = "commissionAmount"
    WHERE COALESCE("gross_commission", 0) = 0 AND COALESCE("commissionAmount", 0) > 0
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "DealActivity" (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      broker_id TEXT NOT NULL,
      broker_name TEXT NOT NULL,
      previous_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DealActivity_deal_id_fkey"
        FOREIGN KEY (deal_id) REFERENCES "Deal"(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "DealActivity_deal_id_idx" ON "DealActivity" (deal_id)
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "DealActivity_broker_id_idx" ON "DealActivity" (broker_id)
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "DealActivity_created_at_idx" ON "DealActivity" (created_at)
  `;

  await prisma.$executeRaw`
    ALTER TABLE "Notification"
      ADD COLUMN IF NOT EXISTS sound BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "landlords" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      details JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "landlords_name_idx" ON "landlords"(name)
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "landlords_status_idx" ON "landlords"(status)
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "industries" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      occupancy_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
      average_rent DOUBLE PRECISION NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "industries_name_idx" ON "industries"(name)
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "industries_status_idx" ON "industries"(status)
  `;

  await prisma.$executeRaw`
    UPDATE "Deal"
    SET "last_activity_at" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
    WHERE "last_activity_at" IS NULL
  `;

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'DealStatus'
      ) THEN
        CREATE TYPE "DealStatus" AS ENUM (
          'LOI',
          'OTP',
          'OTL',
          'LEASE_AGREEMENT',
          'SALE_AGREEMENT',
          'CLOSED',
          'WON',
          'AWAITING_PAYMENT'
        );
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'LOI'`);
  await prisma.$executeRawUnsafe(`ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'OTP'`);
  await prisma.$executeRawUnsafe(`ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'OTL'`);
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'LEASE_AGREEMENT'`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'SALE_AGREEMENT'`
  );
  await prisma.$executeRawUnsafe(`ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'CLOSED'`);
  await prisma.$executeRawUnsafe(`ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'WON'`);
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT'`
  );

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'DealDocumentType'
      ) THEN
        CREATE TYPE "DealDocumentType" AS ENUM (
          'LOI',
          'OTP',
          'OTL',
          'AGREEMENT'
        );
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TYPE "DealDocumentType" ADD VALUE IF NOT EXISTS 'LOI'
  `);
  await prisma.$executeRawUnsafe(`ALTER TYPE "DealDocumentType" ADD VALUE IF NOT EXISTS 'OTP'`);
  await prisma.$executeRawUnsafe(`ALTER TYPE "DealDocumentType" ADD VALUE IF NOT EXISTS 'OTL'`);
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "DealDocumentType" ADD VALUE IF NOT EXISTS 'AGREEMENT'`
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DealStatusHistory" (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      status "DealStatus" NOT NULL,
      changed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      changed_by_user_id TEXT,
      metadata JSONB,
      CONSTRAINT "DealStatusHistory_deal_id_fkey"
        FOREIGN KEY (deal_id) REFERENCES "Deal"(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DealStatusHistory_changed_by_user_id_fkey"
        FOREIGN KEY (changed_by_user_id) REFERENCES "User"(id)
        ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DealStatusHistory_deal_id_idx" ON "DealStatusHistory" (deal_id)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DealStatusHistory_status_idx" ON "DealStatusHistory" (status)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DealStatusHistory_changed_at_idx" ON "DealStatusHistory" (changed_at)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DealStatusHistory_changed_by_user_id_idx" ON "DealStatusHistory" (changed_by_user_id)`
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DealStatusDocument" (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      status "DealStatus" NOT NULL,
      document_type "DealDocumentType" NOT NULL,
      legal_document_id TEXT NOT NULL,
      linked_by_user_id TEXT,
      filled_document_record_id TEXT,
      filled_document_download_url TEXT,
      filled_document_name TEXT,
      uploaded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP(3),
      version INTEGER NOT NULL DEFAULT 1,
      metadata JSONB,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DealStatusDocument_deal_id_fkey"
        FOREIGN KEY (deal_id) REFERENCES "Deal"(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DealStatusDocument_legal_document_id_fkey"
        FOREIGN KEY (legal_document_id) REFERENCES "LegalDocument"(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "DealStatusDocument_linked_by_user_id_fkey"
        FOREIGN KEY (linked_by_user_id) REFERENCES "User"(id)
        ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    WITH deduplicated AS (
      SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY deal_id, status ORDER BY id DESC) AS row_number
      FROM "DealStatusDocument"
    )
    DELETE FROM "DealStatusDocument"
    WHERE id IN (
      SELECT id
      FROM deduplicated
      WHERE row_number > 1
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "DealStatusDocument_deal_id_status_key"
      ON "DealStatusDocument" (deal_id, status)
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DealStatusDocument_deal_id_idx" ON "DealStatusDocument" (deal_id)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DealStatusDocument_status_idx" ON "DealStatusDocument" (status)`
  );
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "DealStatusDocument_document_type_idx"
      ON "DealStatusDocument" (document_type)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "DealStatusDocument_legal_document_id_idx"
      ON "DealStatusDocument" (legal_document_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "DealStatusDocument_linked_by_user_id_idx"
      ON "DealStatusDocument" (linked_by_user_id)
  `);

  const normalizedDealStatus = normalizeDealStatusSql('"status"');
  const dealStatusTypeName = (await getColumnTypeName('Deal', 'status'))?.toLowerCase() || '';
  const dealHasLegacyStatuses = await hasNonCanonicalValues(
    'Deal',
    'status',
    DEAL_STATUS_CANONICAL_VALUES
  );
  const dealNeedsStatusNormalization =
    dealStatusTypeName !== 'dealstatus' || dealHasLegacyStatuses;

  if (dealNeedsStatusNormalization) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE IF EXISTS "Deal" ALTER COLUMN "status" DROP DEFAULT`
    );
    await prisma.$executeRawUnsafe(`
      ALTER TABLE IF EXISTS "Deal"
        ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "Deal"
      SET "status" = ${normalizedDealStatus}
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE IF EXISTS "Deal"
        ALTER COLUMN "status" TYPE "DealStatus"
        USING (${normalizedDealStatus})::"DealStatus"
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE IF EXISTS "Deal"
        ALTER COLUMN "status" SET DEFAULT 'LOI'::"DealStatus"
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE IF EXISTS "Deal"
        ALTER COLUMN "status" SET NOT NULL
    `);
  }

  const normalizedHistoryStatus = normalizeDealStatusSql('"status"');
  if (await tableExists('DealStatusHistory')) {
    const historyStatusTypeName =
      (await getColumnTypeName('DealStatusHistory', 'status'))?.toLowerCase() || '';
    const historyHasLegacyStatuses = await hasNonCanonicalValues(
      'DealStatusHistory',
      'status',
      DEAL_STATUS_CANONICAL_VALUES
    );
    const historyNeedsStatusNormalization =
      historyStatusTypeName !== 'dealstatus' || historyHasLegacyStatuses;

    if (historyNeedsStatusNormalization) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE IF EXISTS "DealStatusHistory"
          ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT
      `);
      await prisma.$executeRawUnsafe(`
        UPDATE "DealStatusHistory"
        SET "status" = ${normalizedHistoryStatus}
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE IF EXISTS "DealStatusHistory"
          ALTER COLUMN "status" TYPE "DealStatus"
          USING (${normalizedHistoryStatus})::"DealStatus"
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE IF EXISTS "DealStatusHistory"
          ALTER COLUMN "status" SET NOT NULL
      `);
    }
  }

  const normalizedDocumentStatus = normalizeDealStatusSql('"status"');
  const normalizedDocumentType = normalizeDealDocumentTypeSql('"document_type"');
  if (await tableExists('DealStatusDocument')) {
    const documentStatusTypeName =
      (await getColumnTypeName('DealStatusDocument', 'status'))?.toLowerCase() || '';
    const documentHasLegacyStatuses = await hasNonCanonicalValues(
      'DealStatusDocument',
      'status',
      DEAL_STATUS_CANONICAL_VALUES
    );
    const documentNeedsStatusNormalization =
      documentStatusTypeName !== 'dealstatus' || documentHasLegacyStatuses;

    if (documentNeedsStatusNormalization) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE IF EXISTS "DealStatusDocument"
          ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT
      `);
      await prisma.$executeRawUnsafe(`
        UPDATE "DealStatusDocument"
        SET "status" = ${normalizedDocumentStatus}
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE IF EXISTS "DealStatusDocument"
          ALTER COLUMN "status" TYPE "DealStatus"
          USING (${normalizedDocumentStatus})::"DealStatus"
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE IF EXISTS "DealStatusDocument"
          ALTER COLUMN "status" SET NOT NULL
      `);
    }

    const documentTypeTypeName =
      (await getColumnTypeName('DealStatusDocument', 'document_type'))?.toLowerCase() || '';
    const documentHasLegacyDocumentTypes = await hasNonCanonicalValues(
      'DealStatusDocument',
      'document_type',
      DEAL_DOCUMENT_TYPE_CANONICAL_VALUES
    );
    const documentNeedsTypeNormalization =
      documentTypeTypeName !== 'dealdocumenttype' || documentHasLegacyDocumentTypes;

    if (documentNeedsTypeNormalization) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE IF EXISTS "DealStatusDocument"
          ALTER COLUMN "document_type" TYPE TEXT USING "document_type"::TEXT
      `);
      await prisma.$executeRawUnsafe(`
        UPDATE "DealStatusDocument"
        SET "document_type" = ${normalizedDocumentType}
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE IF EXISTS "DealStatusDocument"
          ALTER COLUMN "document_type" TYPE "DealDocumentType"
          USING (${normalizedDocumentType})::"DealDocumentType"
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE IF EXISTS "DealStatusDocument"
          ALTER COLUMN "document_type" SET NOT NULL
      `);
    }
  }
}

async function ensureRequiredUserRole(params: {
  role: 'admin' | 'manager';
  email: string;
  password?: string;
  name: string;
}): Promise<void> {
  const normalizedEmail = params.email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error(`At least one ${params.role} user is required`);
  }

  const existingRoleCount = await prisma.user.count({
    where: { role: params.role },
  });
  if (existingRoleCount > 0) {
    return;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    if (existingUser.role !== params.role) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          role: params.role,
          name: existingUser.name || params.name,
        },
      });
      logInfo('Promoted existing user to required role', {
        email: normalizedEmail,
        role: params.role,
      });
    }
    return;
  }

  if (!params.password) {
    throw new Error(
      `Missing ${params.role.toUpperCase()}_PASSWORD for ${normalizedEmail}. Either create the user in the database or provide seed credentials.`
    );
  }

  const hashedPassword = await bcryptjs.hash(params.password, 10);
  await prisma.user.create({
    data: {
      email: normalizedEmail,
      password: hashedPassword,
      name: params.name,
      role: params.role,
    },
  });

  logInfo('Created required user role during bootstrap', {
    email: normalizedEmail,
    role: params.role,
  });
}

export async function ensureRequiredUsers(): Promise<void> {
  await ensureRequiredUserRole({
    role: 'admin',
    email: config.ADMIN_EMAIL,
    password: config.ADMIN_PASSWORD,
    name: config.ADMIN_NAME,
  });

  await ensureRequiredUserRole({
    role: 'manager',
    email: config.MANAGER_EMAIL,
    password: config.MANAGER_PASSWORD,
    name: config.MANAGER_NAME,
  });
}

export async function ensureAdminUser(): Promise<void> {
  await ensureRequiredUsers();
}
