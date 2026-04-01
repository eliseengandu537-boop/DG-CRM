-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('LOI', 'OTP', 'OTL', 'LEASE_AGREEMENT', 'SALE_AGREEMENT', 'CLOSED', 'WON', 'AWAITING_PAYMENT');

-- CreateEnum
CREATE TYPE "DealDocumentType" AS ENUM ('LOI', 'OTP', 'OTL', 'AGREEMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "module_type" TEXT,
    "stage" TEXT,
    "company" TEXT,
    "lead_source" TEXT,
    "deal_type" TEXT,
    "probability" INTEGER,
    "closing_timeline" TEXT,
    "notes" TEXT,
    "comment" TEXT,
    "contact_id" TEXT,
    "broker_assigned" TEXT,
    "additional_broker" TEXT,
    "commission_split" JSONB,
    "property_address" TEXT,
    "lead_type" TEXT,
    "linked_stock_id" TEXT,
    "deal_id" TEXT,
    "forecast_deal_id" TEXT,
    "legal_document_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "value" DOUBLE PRECISION,
    "brokerId" TEXT,
    "created_by_broker_id" TEXT,
    "propertyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "DealStatus" NOT NULL DEFAULT 'LOI',
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "asset_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commission_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gross_commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "company_commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "broker_commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "broker_split_percent" DOUBLE PRECISION NOT NULL DEFAULT 45,
    "auction_referral_percent" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "auction_commission_percent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "co_broker_splits" JSONB,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inactivity_notified_at" TIMESTAMP(3),
    "targetClosureDate" TIMESTAMP(3),
    "closedDate" TIMESTAMP(3),
    "leadId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "created_by_broker_id" TEXT,
    "legal_document_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStatusHistory" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "status" "DealStatus" NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_user_id" TEXT,
    "metadata" JSONB,

    CONSTRAINT "DealStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStatusDocument" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "status" "DealStatus" NOT NULL,
    "document_type" "DealDocumentType" NOT NULL,
    "legal_document_id" TEXT NOT NULL,
    "linked_by_user_id" TEXT,
    "filled_document_record_id" TEXT,
    "filled_document_download_url" TEXT,
    "filled_document_name" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealStatusDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealActivity" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "broker_name" TEXT NOT NULL,
    "previous_status" TEXT NOT NULL,
    "new_status" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "company" TEXT,
    "department" TEXT,
    "billingTarget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avatar" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "archivedAt" TIMESTAMP(3),
    "archivedByUserId" TEXT,
    "archivedByName" TEXT,
    "archivedByEmail" TEXT,
    "pin" TEXT,
    "pinExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "linkedLeadId" TEXT,
    "company" TEXT,
    "position" TEXT,
    "notes" TEXT,
    "module_type" TEXT,
    "broker_id" TEXT,
    "created_by_broker_id" TEXT,
    "linked_property_ids" JSONB,
    "linked_deal_ids" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "area" DOUBLE PRECISION NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'For Sale',
    "module_type" TEXT,
    "broker_id" TEXT,
    "created_by_broker_id" TEXT,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "metadata" JSONB,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "created_by" TEXT,
    "assigned_broker_id" TEXT,
    "module" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "companyName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "businessName" TEXT,
    "email" TEXT,
    "phone" TEXT,
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
    "status" TEXT,
    "paymentStatus" TEXT,
    "maintenanceRequests" INTEGER,
    "notes" TEXT,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landlords" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landlords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "occupancy_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "average_rent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "minimumBid" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastDeal" (
    "id" TEXT NOT NULL,
    "dealId" TEXT,
    "brokerId" TEXT NOT NULL,
    "deal_type" TEXT,
    "moduleType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'qualified',
    "title" TEXT NOT NULL,
    "expectedValue" DOUBLE PRECISION NOT NULL,
    "asset_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commission_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gross_commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "companyCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "brokerCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "broker_split_percent" DOUBLE PRECISION NOT NULL DEFAULT 45,
    "auction_referral_percent" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "auction_commission_percent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "co_broker_splits" JSONB,
    "legal_document" TEXT,
    "forecastedClosureDate" TIMESTAMP(3),
    "expectedPaymentDate" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reminderType" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'medium',
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "createdDate" TEXT NOT NULL,
    "lastModifiedDate" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "lastModifiedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "fileSize" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fileName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "linkedAssets" JSONB NOT NULL,
    "linkedDeals" JSONB NOT NULL,
    "permissions" JSONB NOT NULL,
    "content" TEXT,
    "tags" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "expiryDate" TEXT,
    "filePath" TEXT,
    "fileType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "actor_user_id" TEXT,
    "actor_name" TEXT,
    "actor_email" TEXT,
    "actor_role" TEXT,
    "broker_id" TEXT,
    "visibility_scope" TEXT NOT NULL DEFAULT 'shared',
    "previous_values" JSONB,
    "next_values" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT,
    "actor_user_id" TEXT,
    "actor_name" TEXT,
    "actor_role" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "broker_id" TEXT,
    "sound" BOOLEAN NOT NULL DEFAULT false,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "visibility_scope" TEXT NOT NULL DEFAULT 'shared',
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRecord" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "category" TEXT,
    "reference_id" TEXT,
    "created_by_user_id" TEXT,
    "created_by_broker_id" TEXT,
    "assigned_broker_id" TEXT,
    "module_type" TEXT,
    "visibility_scope" TEXT NOT NULL DEFAULT 'shared',
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_userId_key" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "Lead_brokerId_idx" ON "Lead"("brokerId");

-- CreateIndex
CREATE INDEX "Lead_created_by_broker_id_idx" ON "Lead"("created_by_broker_id");

-- CreateIndex
CREATE INDEX "Lead_propertyId_idx" ON "Lead"("propertyId");

-- CreateIndex
CREATE INDEX "Lead_legal_document_id_idx" ON "Lead"("legal_document_id");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Deal_leadId_idx" ON "Deal"("leadId");

-- CreateIndex
CREATE INDEX "Deal_propertyId_idx" ON "Deal"("propertyId");

-- CreateIndex
CREATE INDEX "Deal_brokerId_idx" ON "Deal"("brokerId");

-- CreateIndex
CREATE INDEX "Deal_created_by_broker_id_idx" ON "Deal"("created_by_broker_id");

-- CreateIndex
CREATE INDEX "Deal_legal_document_id_idx" ON "Deal"("legal_document_id");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "Deal_last_activity_at_idx" ON "Deal"("last_activity_at");

-- CreateIndex
CREATE INDEX "Deal_inactivity_notified_at_idx" ON "Deal"("inactivity_notified_at");

-- CreateIndex
CREATE INDEX "DealStatusHistory_deal_id_idx" ON "DealStatusHistory"("deal_id");

-- CreateIndex
CREATE INDEX "DealStatusHistory_status_idx" ON "DealStatusHistory"("status");

-- CreateIndex
CREATE INDEX "DealStatusHistory_changed_at_idx" ON "DealStatusHistory"("changed_at");

-- CreateIndex
CREATE INDEX "DealStatusHistory_changed_by_user_id_idx" ON "DealStatusHistory"("changed_by_user_id");

-- CreateIndex
CREATE INDEX "DealStatusDocument_deal_id_idx" ON "DealStatusDocument"("deal_id");

-- CreateIndex
CREATE INDEX "DealStatusDocument_status_idx" ON "DealStatusDocument"("status");

-- CreateIndex
CREATE INDEX "DealStatusDocument_document_type_idx" ON "DealStatusDocument"("document_type");

-- CreateIndex
CREATE INDEX "DealStatusDocument_legal_document_id_idx" ON "DealStatusDocument"("legal_document_id");

-- CreateIndex
CREATE INDEX "DealStatusDocument_linked_by_user_id_idx" ON "DealStatusDocument"("linked_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "DealStatusDocument_deal_id_status_key" ON "DealStatusDocument"("deal_id", "status");

-- CreateIndex
CREATE INDEX "DealActivity_deal_id_idx" ON "DealActivity"("deal_id");

-- CreateIndex
CREATE INDEX "DealActivity_broker_id_idx" ON "DealActivity"("broker_id");

-- CreateIndex
CREATE INDEX "DealActivity_created_at_idx" ON "DealActivity"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Broker_email_key" ON "Broker"("email");

-- CreateIndex
CREATE INDEX "Broker_status_idx" ON "Broker"("status");

-- CreateIndex
CREATE INDEX "Broker_archivedAt_idx" ON "Broker"("archivedAt");

-- CreateIndex
CREATE INDEX "Contact_type_idx" ON "Contact"("type");

-- CreateIndex
CREATE INDEX "Contact_status_idx" ON "Contact"("status");

-- CreateIndex
CREATE INDEX "Contact_module_type_idx" ON "Contact"("module_type");

-- CreateIndex
CREATE INDEX "Contact_broker_id_idx" ON "Contact"("broker_id");

-- CreateIndex
CREATE INDEX "Contact_created_by_broker_id_idx" ON "Contact"("created_by_broker_id");

-- CreateIndex
CREATE INDEX "properties_city_idx" ON "properties"("city");

-- CreateIndex
CREATE INDEX "properties_type_idx" ON "properties"("type");

-- CreateIndex
CREATE INDEX "properties_status_idx" ON "properties"("status");

-- CreateIndex
CREATE INDEX "properties_deleted_at_idx" ON "properties"("deleted_at");

-- CreateIndex
CREATE INDEX "properties_module_type_idx" ON "properties"("module_type");

-- CreateIndex
CREATE INDEX "properties_broker_id_idx" ON "properties"("broker_id");

-- CreateIndex
CREATE INDEX "properties_created_by_broker_id_idx" ON "properties"("created_by_broker_id");

-- CreateIndex
CREATE INDEX "stock_items_property_id_idx" ON "stock_items"("property_id");

-- CreateIndex
CREATE INDEX "stock_items_created_by_idx" ON "stock_items"("created_by");

-- CreateIndex
CREATE INDEX "stock_items_assigned_broker_id_idx" ON "stock_items"("assigned_broker_id");

-- CreateIndex
CREATE INDEX "stock_items_module_idx" ON "stock_items"("module");

-- CreateIndex
CREATE INDEX "tenants_propertyId_idx" ON "tenants"("propertyId");

-- CreateIndex
CREATE INDEX "tenants_contactId_idx" ON "tenants"("contactId");

-- CreateIndex
CREATE INDEX "tenants_linkedAssetId_idx" ON "tenants"("linkedAssetId");

-- CreateIndex
CREATE INDEX "tenants_linkedStockItemId_idx" ON "tenants"("linkedStockItemId");

-- CreateIndex
CREATE INDEX "tenants_leaseStatus_idx" ON "tenants"("leaseStatus");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "landlords_name_idx" ON "landlords"("name");

-- CreateIndex
CREATE INDEX "landlords_status_idx" ON "landlords"("status");

-- CreateIndex
CREATE INDEX "industries_name_idx" ON "industries"("name");

-- CreateIndex
CREATE INDEX "industries_status_idx" ON "industries"("status");

-- CreateIndex
CREATE INDEX "Auction_propertyId_idx" ON "Auction"("propertyId");

-- CreateIndex
CREATE INDEX "Auction_status_idx" ON "Auction"("status");

-- CreateIndex
CREATE INDEX "ForecastDeal_dealId_idx" ON "ForecastDeal"("dealId");

-- CreateIndex
CREATE INDEX "ForecastDeal_brokerId_idx" ON "ForecastDeal"("brokerId");

-- CreateIndex
CREATE INDEX "ForecastDeal_status_idx" ON "ForecastDeal"("status");

-- CreateIndex
CREATE INDEX "ForecastDeal_moduleType_idx" ON "ForecastDeal"("moduleType");

-- CreateIndex
CREATE INDEX "Reminder_dueAt_idx" ON "Reminder"("dueAt");

-- CreateIndex
CREATE INDEX "Reminder_status_idx" ON "Reminder"("status");

-- CreateIndex
CREATE INDEX "Reminder_reminderType_idx" ON "Reminder"("reminderType");

-- CreateIndex
CREATE INDEX "Reminder_brokerId_idx" ON "Reminder"("brokerId");

-- CreateIndex
CREATE INDEX "Reminder_assignedUserId_idx" ON "Reminder"("assignedUserId");

-- CreateIndex
CREATE INDEX "Reminder_createdByUserId_idx" ON "Reminder"("createdByUserId");

-- CreateIndex
CREATE INDEX "LegalDocument_documentName_idx" ON "LegalDocument"("documentName");

-- CreateIndex
CREATE INDEX "LegalDocument_status_idx" ON "LegalDocument"("status");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entity_type_idx" ON "AuditLog"("entity_type");

-- CreateIndex
CREATE INDEX "AuditLog_entity_id_idx" ON "AuditLog"("entity_id");

-- CreateIndex
CREATE INDEX "AuditLog_actor_user_id_idx" ON "AuditLog"("actor_user_id");

-- CreateIndex
CREATE INDEX "AuditLog_broker_id_idx" ON "AuditLog"("broker_id");

-- CreateIndex
CREATE INDEX "AuditLog_visibility_scope_idx" ON "AuditLog"("visibility_scope");

-- CreateIndex
CREATE INDEX "AuditLog_created_at_idx" ON "AuditLog"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_activity_id_key" ON "Notification"("activity_id");

-- CreateIndex
CREATE INDEX "Notification_entity_type_idx" ON "Notification"("entity_type");

-- CreateIndex
CREATE INDEX "Notification_entity_id_idx" ON "Notification"("entity_id");

-- CreateIndex
CREATE INDEX "Notification_broker_id_idx" ON "Notification"("broker_id");

-- CreateIndex
CREATE INDEX "Notification_visibility_scope_idx" ON "Notification"("visibility_scope");

-- CreateIndex
CREATE INDEX "Notification_created_at_idx" ON "Notification"("created_at");

-- CreateIndex
CREATE INDEX "CustomRecord_entity_type_idx" ON "CustomRecord"("entity_type");

-- CreateIndex
CREATE INDEX "CustomRecord_name_idx" ON "CustomRecord"("name");

-- CreateIndex
CREATE INDEX "CustomRecord_status_idx" ON "CustomRecord"("status");

-- CreateIndex
CREATE INDEX "CustomRecord_category_idx" ON "CustomRecord"("category");

-- CreateIndex
CREATE INDEX "CustomRecord_reference_id_idx" ON "CustomRecord"("reference_id");

-- CreateIndex
CREATE INDEX "CustomRecord_created_by_user_id_idx" ON "CustomRecord"("created_by_user_id");

-- CreateIndex
CREATE INDEX "CustomRecord_created_by_broker_id_idx" ON "CustomRecord"("created_by_broker_id");

-- CreateIndex
CREATE INDEX "CustomRecord_assigned_broker_id_idx" ON "CustomRecord"("assigned_broker_id");

-- CreateIndex
CREATE INDEX "CustomRecord_module_type_idx" ON "CustomRecord"("module_type");

-- CreateIndex
CREATE INDEX "CustomRecord_visibility_scope_idx" ON "CustomRecord"("visibility_scope");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_created_by_broker_id_fkey" FOREIGN KEY ("created_by_broker_id") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_legal_document_id_fkey" FOREIGN KEY ("legal_document_id") REFERENCES "LegalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_created_by_broker_id_fkey" FOREIGN KEY ("created_by_broker_id") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_legal_document_id_fkey" FOREIGN KEY ("legal_document_id") REFERENCES "LegalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStatusHistory" ADD CONSTRAINT "DealStatusHistory_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStatusHistory" ADD CONSTRAINT "DealStatusHistory_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStatusDocument" ADD CONSTRAINT "DealStatusDocument_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStatusDocument" ADD CONSTRAINT "DealStatusDocument_legal_document_id_fkey" FOREIGN KEY ("legal_document_id") REFERENCES "LegalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStatusDocument" ADD CONSTRAINT "DealStatusDocument_linked_by_user_id_fkey" FOREIGN KEY ("linked_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealActivity" ADD CONSTRAINT "DealActivity_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_created_by_broker_id_fkey" FOREIGN KEY ("created_by_broker_id") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_created_by_broker_id_fkey" FOREIGN KEY ("created_by_broker_id") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_assigned_broker_id_fkey" FOREIGN KEY ("assigned_broker_id") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastDeal" ADD CONSTRAINT "ForecastDeal_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastDeal" ADD CONSTRAINT "ForecastDeal_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "AuditLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

