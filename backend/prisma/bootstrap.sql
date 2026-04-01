-- Bootstrap schema for the DG-crm PostgreSQL database.
-- Run this after renaming the legacy database to "DG-crm".

CREATE TABLE IF NOT EXISTS "User" (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Broker" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  company TEXT,
  department TEXT,
  "billingTarget" DOUBLE PRECISION NOT NULL DEFAULT 0,
  avatar TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "archivedByUserId" TEXT,
  "archivedByName" TEXT,
  "archivedByEmail" TEXT,
  pin TEXT,
  "pinExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Broker_status_idx" ON "Broker" (status);
CREATE INDEX IF NOT EXISTS "Broker_archivedAt_idx" ON "Broker" ("archivedAt");

CREATE TABLE IF NOT EXISTS "properties" (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  province TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  type TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  area DOUBLE PRECISION NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'For Sale',
  broker_id TEXT,
  bedrooms INTEGER,
  bathrooms INTEGER,
  metadata JSONB,
  deleted_at TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "properties_broker_id_fkey"
    FOREIGN KEY (broker_id) REFERENCES "Broker"(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "properties_city_idx" ON "properties" (city);
CREATE INDEX IF NOT EXISTS "properties_type_idx" ON "properties" (type);
CREATE INDEX IF NOT EXISTS "properties_status_idx" ON "properties" (status);
CREATE INDEX IF NOT EXISTS "properties_brokerId_idx" ON "properties" (broker_id);
CREATE INDEX IF NOT EXISTS "properties_deleted_at_idx" ON "properties" (deleted_at);

CREATE TABLE IF NOT EXISTS "Lead" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  module_type TEXT,
  stage TEXT,
  company TEXT,
  lead_source TEXT,
  deal_type TEXT,
  probability INTEGER,
  closing_timeline TEXT,
  notes TEXT,
  comment TEXT,
  contact_id TEXT,
  broker_assigned TEXT,
  additional_broker TEXT,
  commission_split JSONB,
  property_address TEXT,
  lead_type TEXT,
  linked_stock_id TEXT,
  deal_id TEXT,
  forecast_deal_id TEXT,
  legal_document_id TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  value DOUBLE PRECISION,
  "brokerId" TEXT,
  "propertyId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lead_brokerId_fkey"
    FOREIGN KEY ("brokerId") REFERENCES "Broker"(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Lead_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Lead_legal_document_id_fkey"
    FOREIGN KEY (legal_document_id) REFERENCES "LegalDocument"(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Lead_brokerId_idx" ON "Lead" ("brokerId");
CREATE INDEX IF NOT EXISTS "Lead_propertyId_idx" ON "Lead" ("propertyId");
CREATE INDEX IF NOT EXISTS "Lead_legal_document_id_idx" ON "Lead" (legal_document_id);
CREATE INDEX IF NOT EXISTS "Lead_status_idx" ON "Lead" (status);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS comment TEXT;

CREATE TABLE IF NOT EXISTS "Contact" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  "linkedLeadId" TEXT,
  company TEXT,
  position TEXT,
  notes TEXT,
  module_type TEXT,
  linked_property_ids JSONB,
  linked_deal_ids JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Contact_type_idx" ON "Contact" (type);
CREATE INDEX IF NOT EXISTS "Contact_status_idx" ON "Contact" (status);

CREATE TABLE IF NOT EXISTS "Deal" (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  type TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  asset_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  gross_commission DOUBLE PRECISION NOT NULL DEFAULT 0,
  company_commission DOUBLE PRECISION NOT NULL DEFAULT 0,
  broker_commission DOUBLE PRECISION NOT NULL DEFAULT 0,
  broker_split_percent DOUBLE PRECISION NOT NULL DEFAULT 45,
  auction_referral_percent DOUBLE PRECISION NOT NULL DEFAULT 35,
  auction_commission_percent DOUBLE PRECISION NOT NULL DEFAULT 10,
  co_broker_splits JSONB,
  last_activity_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  inactivity_notified_at TIMESTAMP(3),
  "targetClosureDate" TIMESTAMP(3),
  "closedDate" TIMESTAMP(3),
  "leadId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "brokerId" TEXT NOT NULL,
  legal_document_id TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Deal_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Deal_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Deal_brokerId_fkey"
    FOREIGN KEY ("brokerId") REFERENCES "Broker"(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Deal_legal_document_id_fkey"
    FOREIGN KEY (legal_document_id) REFERENCES "LegalDocument"(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Deal_leadId_idx" ON "Deal" ("leadId");
CREATE INDEX IF NOT EXISTS "Deal_propertyId_idx" ON "Deal" ("propertyId");
CREATE INDEX IF NOT EXISTS "Deal_brokerId_idx" ON "Deal" ("brokerId");
CREATE INDEX IF NOT EXISTS "Deal_legal_document_id_idx" ON "Deal" (legal_document_id);
CREATE INDEX IF NOT EXISTS "Deal_status_idx" ON "Deal" (status);
CREATE INDEX IF NOT EXISTS "Deal_last_activity_at_idx" ON "Deal" (last_activity_at);
CREATE INDEX IF NOT EXISTS "Deal_inactivity_notified_at_idx" ON "Deal" (inactivity_notified_at);

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
);

CREATE INDEX IF NOT EXISTS "DealActivity_deal_id_idx" ON "DealActivity" (deal_id);
CREATE INDEX IF NOT EXISTS "DealActivity_broker_id_idx" ON "DealActivity" (broker_id);
CREATE INDEX IF NOT EXISTS "DealActivity_created_at_idx" ON "DealActivity" (created_at);

CREATE TABLE IF NOT EXISTS "RefreshToken" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken" ("userId");

CREATE TABLE IF NOT EXISTS "stock_items" (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_by TEXT,
  module TEXT NOT NULL,
  details JSONB NOT NULL,
  archived_at TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_items_created_by_fkey"
    FOREIGN KEY (created_by) REFERENCES "Broker"(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "stock_items_property_id_idx" ON "stock_items" (property_id);
CREATE INDEX IF NOT EXISTS "stock_items_created_by_idx" ON "stock_items" (created_by);
CREATE INDEX IF NOT EXISTS "stock_items_module_idx" ON "stock_items" (module);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  "companyName" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "businessName" TEXT,
  email TEXT,
  phone TEXT,
  "contactId" TEXT,
  "propertyId" TEXT,
  "linkedAssetId" TEXT,
  "linkedStockItemId" TEXT,
  "unitNumber" TEXT,
  "leaseStartDate" TEXT,
  "leaseEndDate" TEXT,
  "monthlyRent" DOUBLE PRECISION,
  "securityDeposit" DOUBLE PRECISION,
  "leaseStatus" TEXT,
  "squareFootage" DOUBLE PRECISION,
  status TEXT,
  "paymentStatus" TEXT,
  "maintenanceRequests" INTEGER,
  notes TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS tenants_property_id_idx ON tenants ("propertyId");
CREATE INDEX IF NOT EXISTS tenants_contact_id_idx ON tenants ("contactId");
CREATE INDEX IF NOT EXISTS tenants_linked_asset_id_idx ON tenants ("linkedAssetId");
CREATE INDEX IF NOT EXISTS tenants_linked_stock_item_id_idx ON tenants ("linkedStockItemId");
CREATE INDEX IF NOT EXISTS tenants_lease_status_idx ON tenants ("leaseStatus");
CREATE INDEX IF NOT EXISTS tenants_status_idx ON tenants (status);

CREATE TABLE IF NOT EXISTS landlords (
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
);

CREATE INDEX IF NOT EXISTS landlords_name_idx ON landlords (name);
CREATE INDEX IF NOT EXISTS landlords_status_idx ON landlords (status);

CREATE TABLE IF NOT EXISTS industries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  occupancy_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  average_rent DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS industries_name_idx ON industries (name);
CREATE INDEX IF NOT EXISTS industries_status_idx ON industries (status);

CREATE TABLE IF NOT EXISTS "Auction" (
  id TEXT PRIMARY KEY,
  "propertyId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "minimumBid" DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Auction_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Auction_propertyId_idx" ON "Auction" ("propertyId");
CREATE INDEX IF NOT EXISTS "Auction_status_idx" ON "Auction" (status);

CREATE TABLE IF NOT EXISTS "ForecastDeal" (
  id TEXT PRIMARY KEY,
  "dealId" TEXT,
  "brokerId" TEXT NOT NULL,
  deal_type TEXT,
  "moduleType" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'qualified',
  title TEXT NOT NULL,
  "expectedValue" DOUBLE PRECISION NOT NULL,
  asset_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  gross_commission DOUBLE PRECISION NOT NULL DEFAULT 0,
  "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "companyCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "brokerCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
  broker_split_percent DOUBLE PRECISION NOT NULL DEFAULT 45,
  auction_referral_percent DOUBLE PRECISION NOT NULL DEFAULT 35,
  auction_commission_percent DOUBLE PRECISION NOT NULL DEFAULT 10,
  co_broker_splits JSONB,
  "legal_document" TEXT,
  "forecastedClosureDate" TIMESTAMP(3),
  "expectedPaymentDate" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForecastDeal_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "Deal"(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ForecastDeal_brokerId_fkey"
    FOREIGN KEY ("brokerId") REFERENCES "Broker"(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ForecastDeal_dealId_idx" ON "ForecastDeal" ("dealId");
CREATE INDEX IF NOT EXISTS "ForecastDeal_brokerId_idx" ON "ForecastDeal" ("brokerId");
CREATE INDEX IF NOT EXISTS "ForecastDeal_status_idx" ON "ForecastDeal" (status);
CREATE INDEX IF NOT EXISTS "ForecastDeal_moduleType_idx" ON "ForecastDeal" ("moduleType");

CREATE TABLE IF NOT EXISTS "Reminder" (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  "reminderType" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  "dealId" TEXT,
  "brokerId" TEXT,
  "assignedUserId" TEXT,
  "assignedToRole" TEXT,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "createdByUserId" TEXT,
  "createdByName" TEXT,
  "createdByEmail" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reminder_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "Deal"(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Reminder_brokerId_fkey"
    FOREIGN KEY ("brokerId") REFERENCES "Broker"(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Reminder_dueAt_idx" ON "Reminder" ("dueAt");
CREATE INDEX IF NOT EXISTS "Reminder_status_idx" ON "Reminder" (status);
CREATE INDEX IF NOT EXISTS "Reminder_reminderType_idx" ON "Reminder" ("reminderType");
CREATE INDEX IF NOT EXISTS "Reminder_brokerId_idx" ON "Reminder" ("brokerId");
CREATE INDEX IF NOT EXISTS "Reminder_assignedUserId_idx" ON "Reminder" ("assignedUserId");
CREATE INDEX IF NOT EXISTS "Reminder_createdByUserId_idx" ON "Reminder" ("createdByUserId");

CREATE TABLE IF NOT EXISTS "LegalDocument" (
  id TEXT PRIMARY KEY,
  "documentName" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "createdDate" TEXT NOT NULL,
  "lastModifiedDate" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "lastModifiedBy" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  "fileSize" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fileName" TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  "linkedAssets" JSONB NOT NULL,
  "linkedDeals" JSONB NOT NULL,
  permissions JSONB NOT NULL,
  content TEXT,
  tags JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  "expiryDate" TEXT,
  "filePath" TEXT,
  "fileType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "LegalDocument_documentName_idx" ON "LegalDocument" ("documentName");
CREATE INDEX IF NOT EXISTS "LegalDocument_status_idx" ON "LegalDocument" (status);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  actor_user_id TEXT,
  actor_name TEXT,
  actor_email TEXT,
  actor_role TEXT,
  metadata JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_actor_user_id_fkey"
    FOREIGN KEY (actor_user_id) REFERENCES "User"(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog" (action);
CREATE INDEX IF NOT EXISTS "AuditLog_entity_type_idx" ON "AuditLog" (entity_type);
CREATE INDEX IF NOT EXISTS "AuditLog_entity_id_idx" ON "AuditLog" (entity_id);
CREATE INDEX IF NOT EXISTS "AuditLog_actor_user_id_idx" ON "AuditLog" (actor_user_id);
CREATE INDEX IF NOT EXISTS "AuditLog_created_at_idx" ON "AuditLog" (created_at);

CREATE TABLE IF NOT EXISTS "CustomRecord" (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  category TEXT,
  reference_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CustomRecord_entity_type_idx" ON "CustomRecord" (entity_type);
CREATE INDEX IF NOT EXISTS "CustomRecord_name_idx" ON "CustomRecord" (name);
CREATE INDEX IF NOT EXISTS "CustomRecord_status_idx" ON "CustomRecord" (status);
CREATE INDEX IF NOT EXISTS "CustomRecord_category_idx" ON "CustomRecord" (category);
CREATE INDEX IF NOT EXISTS "CustomRecord_reference_id_idx" ON "CustomRecord" (reference_id);

ALTER TABLE "ForecastDeal"
  ADD COLUMN IF NOT EXISTS "legal_document" TEXT,
  ADD COLUMN IF NOT EXISTS deal_type TEXT,
  ADD COLUMN IF NOT EXISTS asset_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_commission DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS broker_split_percent DOUBLE PRECISION NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS auction_referral_percent DOUBLE PRECISION NOT NULL DEFAULT 35,
  ADD COLUMN IF NOT EXISTS auction_commission_percent DOUBLE PRECISION NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS co_broker_splits JSONB;

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS asset_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_commission DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_commission DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS broker_commission DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS broker_split_percent DOUBLE PRECISION NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS auction_referral_percent DOUBLE PRECISION NOT NULL DEFAULT 35,
  ADD COLUMN IF NOT EXISTS auction_commission_percent DOUBLE PRECISION NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS co_broker_splits JSONB,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS inactivity_notified_at TIMESTAMP(3);

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "created_by_broker_id" TEXT;

CREATE INDEX IF NOT EXISTS "Lead_created_by_broker_id_idx" ON "Lead" ("created_by_broker_id");

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "created_by_broker_id" TEXT;

CREATE INDEX IF NOT EXISTS "Deal_created_by_broker_id_idx" ON "Deal" ("created_by_broker_id");
CREATE INDEX IF NOT EXISTS "Deal_last_activity_at_idx" ON "Deal" (last_activity_at);
CREATE INDEX IF NOT EXISTS "Deal_inactivity_notified_at_idx" ON "Deal" (inactivity_notified_at);

ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS broker_id TEXT,
  ADD COLUMN IF NOT EXISTS created_by_broker_id TEXT;

CREATE INDEX IF NOT EXISTS "Contact_module_type_idx" ON "Contact" (module_type);
CREATE INDEX IF NOT EXISTS "Contact_broker_id_idx" ON "Contact" (broker_id);
CREATE INDEX IF NOT EXISTS "Contact_created_by_broker_id_idx" ON "Contact" (created_by_broker_id);

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS module_type TEXT,
  ADD COLUMN IF NOT EXISTS created_by_broker_id TEXT;

CREATE INDEX IF NOT EXISTS "properties_module_type_idx" ON "properties" (module_type);
CREATE INDEX IF NOT EXISTS "properties_created_by_broker_id_idx" ON "properties" (created_by_broker_id);

ALTER TABLE "stock_items"
  ADD COLUMN IF NOT EXISTS assigned_broker_id TEXT;

CREATE INDEX IF NOT EXISTS "stock_items_assigned_broker_id_idx" ON "stock_items" (assigned_broker_id);

ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS broker_id TEXT,
  ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'shared',
  ADD COLUMN IF NOT EXISTS previous_values JSONB,
  ADD COLUMN IF NOT EXISTS next_values JSONB;

CREATE INDEX IF NOT EXISTS "AuditLog_broker_id_idx" ON "AuditLog" (broker_id);
CREATE INDEX IF NOT EXISTS "AuditLog_visibility_scope_idx" ON "AuditLog" (visibility_scope);

CREATE TABLE IF NOT EXISTS "Notification" (
  id TEXT PRIMARY KEY,
  activity_id TEXT UNIQUE,
  actor_user_id TEXT,
  actor_name TEXT,
  actor_role TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  broker_id TEXT,
  sound BOOLEAN NOT NULL DEFAULT false,
  read BOOLEAN NOT NULL DEFAULT false,
  visibility_scope TEXT NOT NULL DEFAULT 'shared',
  payload JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_activity_id_fkey"
    FOREIGN KEY (activity_id) REFERENCES "AuditLog"(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Notification_actor_user_id_fkey"
    FOREIGN KEY (actor_user_id) REFERENCES "User"(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Notification_entity_type_idx" ON "Notification" (entity_type);
CREATE INDEX IF NOT EXISTS "Notification_entity_id_idx" ON "Notification" (entity_id);
CREATE INDEX IF NOT EXISTS "Notification_broker_id_idx" ON "Notification" (broker_id);
CREATE INDEX IF NOT EXISTS "Notification_visibility_scope_idx" ON "Notification" (visibility_scope);
CREATE INDEX IF NOT EXISTS "Notification_created_at_idx" ON "Notification" (created_at);

ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS sound BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CustomRecord"
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS created_by_broker_id TEXT,
  ADD COLUMN IF NOT EXISTS assigned_broker_id TEXT,
  ADD COLUMN IF NOT EXISTS module_type TEXT,
  ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'shared';

CREATE INDEX IF NOT EXISTS "CustomRecord_created_by_user_id_idx" ON "CustomRecord" (created_by_user_id);
CREATE INDEX IF NOT EXISTS "CustomRecord_created_by_broker_id_idx" ON "CustomRecord" (created_by_broker_id);
CREATE INDEX IF NOT EXISTS "CustomRecord_assigned_broker_id_idx" ON "CustomRecord" (assigned_broker_id);
CREATE INDEX IF NOT EXISTS "CustomRecord_module_type_idx" ON "CustomRecord" (module_type);
CREATE INDEX IF NOT EXISTS "CustomRecord_visibility_scope_idx" ON "CustomRecord" (visibility_scope);
