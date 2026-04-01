-- Repair Deal workflow enum/schema drift for legacy databases.
-- Safe to run multiple times.

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

ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'LOI';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'OTP';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'OTL';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'LEASE_AGREEMENT';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'SALE_AGREEMENT';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'WON';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT';

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

ALTER TYPE "DealDocumentType" ADD VALUE IF NOT EXISTS 'LOI';
ALTER TYPE "DealDocumentType" ADD VALUE IF NOT EXISTS 'OTP';
ALTER TYPE "DealDocumentType" ADD VALUE IF NOT EXISTS 'OTL';
ALTER TYPE "DealDocumentType" ADD VALUE IF NOT EXISTS 'AGREEMENT';

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
);

CREATE INDEX IF NOT EXISTS "DealStatusHistory_deal_id_idx" ON "DealStatusHistory" (deal_id);
CREATE INDEX IF NOT EXISTS "DealStatusHistory_status_idx" ON "DealStatusHistory" (status);
CREATE INDEX IF NOT EXISTS "DealStatusHistory_changed_at_idx" ON "DealStatusHistory" (changed_at);
CREATE INDEX IF NOT EXISTS "DealStatusHistory_changed_by_user_id_idx" ON "DealStatusHistory" (changed_by_user_id);

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
);

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
);

CREATE UNIQUE INDEX IF NOT EXISTS "DealStatusDocument_deal_id_status_key"
  ON "DealStatusDocument" (deal_id, status);
CREATE INDEX IF NOT EXISTS "DealStatusDocument_deal_id_idx" ON "DealStatusDocument" (deal_id);
CREATE INDEX IF NOT EXISTS "DealStatusDocument_status_idx" ON "DealStatusDocument" (status);
CREATE INDEX IF NOT EXISTS "DealStatusDocument_document_type_idx" ON "DealStatusDocument" (document_type);
CREATE INDEX IF NOT EXISTS "DealStatusDocument_legal_document_id_idx" ON "DealStatusDocument" (legal_document_id);
CREATE INDEX IF NOT EXISTS "DealStatusDocument_linked_by_user_id_idx" ON "DealStatusDocument" (linked_by_user_id);

ALTER TABLE IF EXISTS "Deal"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE IF EXISTS "Deal"
  ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

UPDATE "Deal"
SET "status" = CASE
  WHEN "status" IS NULL OR BTRIM("status"::TEXT) = '' THEN 'LOI'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('loi', 'letter_of_intent') THEN 'LOI'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('otp', 'offer_to_purchase') THEN 'OTP'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('otl', 'offer_to_lease') THEN 'OTL'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('lease_agreement', 'lease agreement') THEN 'LEASE_AGREEMENT'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('sale_agreement', 'sale agreement', 'agreement') THEN 'SALE_AGREEMENT'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('closed', 'completed') THEN 'CLOSED'
  WHEN LOWER(BTRIM("status"::TEXT)) = 'won' THEN 'WON'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('awaiting_payment', 'awaiting payment', 'invoice') THEN 'AWAITING_PAYMENT'
  ELSE 'LOI'
END;

ALTER TABLE IF EXISTS "Deal"
  ALTER COLUMN "status" TYPE "DealStatus"
  USING (
    CASE
      WHEN "status" IS NULL OR BTRIM("status"::TEXT) = '' THEN 'LOI'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('loi', 'letter_of_intent') THEN 'LOI'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('otp', 'offer_to_purchase') THEN 'OTP'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('otl', 'offer_to_lease') THEN 'OTL'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('lease_agreement', 'lease agreement') THEN 'LEASE_AGREEMENT'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('sale_agreement', 'sale agreement', 'agreement') THEN 'SALE_AGREEMENT'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('closed', 'completed') THEN 'CLOSED'
      WHEN LOWER(BTRIM("status"::TEXT)) = 'won' THEN 'WON'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('awaiting_payment', 'awaiting payment', 'invoice') THEN 'AWAITING_PAYMENT'
      ELSE 'LOI'
    END
  )::"DealStatus";

ALTER TABLE IF EXISTS "Deal"
  ALTER COLUMN "status" SET DEFAULT 'LOI'::"DealStatus";

ALTER TABLE IF EXISTS "Deal"
  ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE IF EXISTS "DealStatusHistory"
  ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

UPDATE "DealStatusHistory"
SET "status" = CASE
  WHEN "status" IS NULL OR BTRIM("status"::TEXT) = '' THEN 'LOI'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('loi', 'letter_of_intent') THEN 'LOI'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('otp', 'offer_to_purchase') THEN 'OTP'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('otl', 'offer_to_lease') THEN 'OTL'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('lease_agreement', 'lease agreement') THEN 'LEASE_AGREEMENT'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('sale_agreement', 'sale agreement', 'agreement') THEN 'SALE_AGREEMENT'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('closed', 'completed') THEN 'CLOSED'
  WHEN LOWER(BTRIM("status"::TEXT)) = 'won' THEN 'WON'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('awaiting_payment', 'awaiting payment', 'invoice') THEN 'AWAITING_PAYMENT'
  ELSE 'LOI'
END;

ALTER TABLE IF EXISTS "DealStatusHistory"
  ALTER COLUMN "status" TYPE "DealStatus"
  USING (
    CASE
      WHEN "status" IS NULL OR BTRIM("status"::TEXT) = '' THEN 'LOI'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('loi', 'letter_of_intent') THEN 'LOI'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('otp', 'offer_to_purchase') THEN 'OTP'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('otl', 'offer_to_lease') THEN 'OTL'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('lease_agreement', 'lease agreement') THEN 'LEASE_AGREEMENT'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('sale_agreement', 'sale agreement', 'agreement') THEN 'SALE_AGREEMENT'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('closed', 'completed') THEN 'CLOSED'
      WHEN LOWER(BTRIM("status"::TEXT)) = 'won' THEN 'WON'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('awaiting_payment', 'awaiting payment', 'invoice') THEN 'AWAITING_PAYMENT'
      ELSE 'LOI'
    END
  )::"DealStatus";

ALTER TABLE IF EXISTS "DealStatusHistory"
  ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE IF EXISTS "DealStatusDocument"
  ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

UPDATE "DealStatusDocument"
SET "status" = CASE
  WHEN "status" IS NULL OR BTRIM("status"::TEXT) = '' THEN 'LOI'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('loi', 'letter_of_intent') THEN 'LOI'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('otp', 'offer_to_purchase') THEN 'OTP'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('otl', 'offer_to_lease') THEN 'OTL'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('lease_agreement', 'lease agreement') THEN 'LEASE_AGREEMENT'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('sale_agreement', 'sale agreement', 'agreement') THEN 'SALE_AGREEMENT'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('closed', 'completed') THEN 'CLOSED'
  WHEN LOWER(BTRIM("status"::TEXT)) = 'won' THEN 'WON'
  WHEN LOWER(BTRIM("status"::TEXT)) IN ('awaiting_payment', 'awaiting payment', 'invoice') THEN 'AWAITING_PAYMENT'
  ELSE 'LOI'
END;

ALTER TABLE IF EXISTS "DealStatusDocument"
  ALTER COLUMN "status" TYPE "DealStatus"
  USING (
    CASE
      WHEN "status" IS NULL OR BTRIM("status"::TEXT) = '' THEN 'LOI'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('loi', 'letter_of_intent') THEN 'LOI'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('otp', 'offer_to_purchase') THEN 'OTP'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('otl', 'offer_to_lease') THEN 'OTL'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('lease_agreement', 'lease agreement') THEN 'LEASE_AGREEMENT'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('sale_agreement', 'sale agreement', 'agreement') THEN 'SALE_AGREEMENT'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('closed', 'completed') THEN 'CLOSED'
      WHEN LOWER(BTRIM("status"::TEXT)) = 'won' THEN 'WON'
      WHEN LOWER(BTRIM("status"::TEXT)) IN ('awaiting_payment', 'awaiting payment', 'invoice') THEN 'AWAITING_PAYMENT'
      ELSE 'LOI'
    END
  )::"DealStatus";

ALTER TABLE IF EXISTS "DealStatusDocument"
  ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE IF EXISTS "DealStatusDocument"
  ALTER COLUMN "document_type" TYPE TEXT USING "document_type"::TEXT;

UPDATE "DealStatusDocument"
SET "document_type" = CASE
  WHEN "document_type" IS NULL OR BTRIM("document_type"::TEXT) = '' THEN 'AGREEMENT'
  WHEN LOWER(BTRIM("document_type"::TEXT)) = 'loi' THEN 'LOI'
  WHEN LOWER(BTRIM("document_type"::TEXT)) = 'otp' THEN 'OTP'
  WHEN LOWER(BTRIM("document_type"::TEXT)) = 'otl' THEN 'OTL'
  WHEN LOWER(BTRIM("document_type"::TEXT)) IN ('agreement', 'lease_agreement', 'sale_agreement', 'lease agreement', 'sale agreement') THEN 'AGREEMENT'
  ELSE 'AGREEMENT'
END;

ALTER TABLE IF EXISTS "DealStatusDocument"
  ALTER COLUMN "document_type" TYPE "DealDocumentType"
  USING (
    CASE
      WHEN "document_type" IS NULL OR BTRIM("document_type"::TEXT) = '' THEN 'AGREEMENT'
      WHEN LOWER(BTRIM("document_type"::TEXT)) = 'loi' THEN 'LOI'
      WHEN LOWER(BTRIM("document_type"::TEXT)) = 'otp' THEN 'OTP'
      WHEN LOWER(BTRIM("document_type"::TEXT)) = 'otl' THEN 'OTL'
      WHEN LOWER(BTRIM("document_type"::TEXT)) IN ('agreement', 'lease_agreement', 'sale_agreement', 'lease agreement', 'sale agreement') THEN 'AGREEMENT'
      ELSE 'AGREEMENT'
    END
  )::"DealDocumentType";

ALTER TABLE IF EXISTS "DealStatusDocument"
  ALTER COLUMN "document_type" SET NOT NULL;
