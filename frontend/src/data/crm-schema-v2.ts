// Updated CRM Data Types - Post-Migration Schema
// Reflects new entity relationships, broker ownership, and Forecast Deal logic

/**
 * CORE ENTITY TYPES
 */

export type DocumentStatus = 'Draft' | 'Under Review' | 'Approved' | 'Executed' | 'Archived';
export type PermissionLevel = 'View Only' | 'Edit' | 'Approve' | 'Admin';
export type ModuleType = 'leasing' | 'sales' | 'auction';

/**
 * INDUSTRIES - Categorization entity
 */
export interface Industry {
  id: string;
  name: string;
  description?: string;
  status: 'Active' | 'Inactive' | 'Expanding' | 'Declining';
  createdDate: string;
  updatedDate: string;
}

/**
 * BROKERS - Sales representatives / ownership tracking
 */
export interface Broker {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization?: string;
  assignedAssets?: string[]; // Stock IDs
  linkedDeals?: string[]; // Deal IDs
  status: 'Active' | 'Inactive' | 'Archived';
  createdDate: string;
  updatedDate: string;
  avatar?: string;
  notes?: string;
}

/**
 * CONTACTS - People (Tenants, Landlords, Investors, etc.)
 * Single entity replacing fragmented contact models
 */
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  position?: string;
  type: 'Investor' | 'Tenant' | 'Landlord' | 'Broker' | 'Other';
  status: 'Active' | 'Inactive' | 'Archived';
  linkedTenants?: string[]; // Tenant IDs
  linkedLandlords?: string[]; // Landlord IDs
  linkedLeads?: string[]; // Lead IDs
  createdDate: string;
  updatedDate: string;
  notes?: string;
}

/**
 * TENANTS - Occupants of properties
 * Relationships: Contact (many-to-one), Industry (many-to-one), Stock (many-to-one via lease)
 */
export interface Tenant {
  id: string;
  companyName: string;
  contactId: string; // FK to Contact
  industryId?: string; // FK to Industry
  propertyId?: string; // Property location
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: number;
  securityDeposit: number;
  leaseStatus: 'Active' | 'Expiring Soon' | 'Expired' | 'Pending' | 'Cancelled';
  squareFootage: number;
  unitNumber?: string;
  paymentStatus: 'Current' | 'Overdue' | 'Partial';
  maintenanceRequests: number;
  status: 'Active' | 'Inactive' | 'Archived';
  createdDate: string;
  updatedDate: string;
  notes?: string;
}

/**
 * LANDLORDS - Property owners
 * Relationships: Contact (many-to-one), Industry (many-to-one)
 */
export interface Landlord {
  id: string;
  companyName: string;
  contactId: string; // FK to Contact
  industryId?: string; // FK to Industry
  propertyId?: string;
  commissionRate: number; // Percentage
  paymentTerms: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankRoutingNumber: string;
  status: 'Found' | 'Private' | 'Reviewing' | 'Inactive' | 'Archived';
  agreementDate: string;
  createdDate: string;
  updatedDate: string;
  notes?: string;
}

/**
 * STOCK - Properties / Units available for lease or sale
 * Relationships: Broker (many-to-one, ownership), Industry (many-to-one)
 * Ownership Rule: A Stock can only belong to ONE broker (broker_id NOT NULL)
 */
export interface StockItem {
  id: string;
  itemName: string;
  category: 'Shopping Center' | 'Stand alone Building' | 'Industries' | 'Land' | 'Office';
  propertyId: string;
  brokerId: string; // FK to Broker - OWNERSHIP TRACKING
  industryId?: string; // FK to Industry
  quantity: number;
  location: string;
  condition: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  purchaseDate: string;
  purchasePrice: number;
  status: 'Viewing' | 'OTP' | 'Pending' | 'Active' | 'Inactive' | 'Sold' | 'Invoice';
  
  // Optional fields
  lastMaintenance?: string;
  maintenanceSchedule?: string;
  assignedTo?: string; // Contact ID
  availability: 'In Stock' | 'In Use' | 'Reserved' | 'Out of Service' | 'Sold';
  linkedDeals?: string[]; // Deal IDs
  linkedInvoices?: string[];
  paymentStatus: 'Paid' | 'Pending' | 'Overdue' | 'Partial';
  documents?: { name: string; url?: string }[];
  
  createdDate: string;
  updatedDate: string;
  notes?: string;
}

/**
 * LEADS - Sales opportunities
 * Relationships: Contact (many-to-one), Tenant (many-to-one), Landlord (many-to-one), Stock (many-to-one), Broker (many-to-one)
 */
export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  propertyInterest?: string; // Property address
  leadSource: 'Direct' | 'Referral' | 'Website' | 'Cold Call' | 'Email' | 'Event';
  status: 'New' | 'Contacted' | 'Qualified' | 'Negotiating' | 'Lease Agreement' | 'Converted' | 'Lost';
  value: number; // Estimated deal value
  
  // Foreign Keys (all optional - lead may not be fully linked initially)
  contactId?: string; // FK to Contact
  tenantId?: string; // FK to Tenant
  landlordId?: string; // FK to Landlord
  stockId?: string; // FK to Stock
  brokerId?: string; // FK to Broker
  
  // Additional tracking
  leadType?: 'Leasing' | 'Sales' | 'Auction';
  brokerAssigned?: string; // Broker name (denormalized)
  additionalBroker?: string;
  commissionSplit?: {
    primaryBroker: number;
    additionalBroker: number;
  };
  
  createdDate: string;
  lastContactDate: string;
  closingDate?: string;
  updatedDate: string;
  notes?: string;
}

/**
 * DEALS - Executed transactions
 * Relationships: Stock (many-to-one), Broker (many-to-one)
 * Ownership Rule: Deals are tracked by broker_id
 */
export interface Deal {
  id: string;
  dealName: string;
  dealType: 'Leasing' | 'Sales' | 'Auction';
  stockId?: string; // FK to Stock
  brokerId: string; // FK to Broker - OWNERSHIP
  status: 'Pipeline' | 'Qualified' | 'Proposal' | 'Negotiating' | 'OTP' | 'DD' | 'Finance' | 'Invoice' | 'Won' | 'Lost';
  
  expectedValue: number;
  actualValue?: number;
  closedDate?: string;
  probability?: number; // 0-100%
  
  contactName: string;
  propertyName: string;
  counterparty?: string;
  
  commissionRate?: number;
  commissionAmount?: number;
  
  createdDate: string;
  updatedDate: string;
  forecastedClosureDate?: string;
  notes?: string;
}

/**
 * FORECAST DEALS - Forward-looking pipeline
 * Driven by trigger logic (status → ForecastDeal mapping)
 * Ownership Rule: Filtered by broker_id
 * Schema Rule: Must have stock_id, broker_id, module_type
 */
export interface ForecastDeal {
  id: string;
  dealName: string;
  dealType: 'Leasing' | 'Sales' | 'Auction';
  moduleType: ModuleType; // 'leasing', 'sales', 'auction'
  
  stockId: string; // FK to Stock - MANDATORY
  brokerId: string; // FK to Broker - MANDATORY, OWNERSHIP
  
  quarter: string; // e.g., 'Q1'
  year: number;
  expectedValue: number;
  probability: number; // 0-100%
  status: 'Pipeline' | 'Qualified' | 'Proposal' | 'Negotiating' | 'OTP' | 'DD' | 'Finance';
  
  contactName: string;
  propertyName: string;
  forecastedClosureDate: string;
  weightedValue: number; // expectedValue * (probability / 100)
  
  createdDate: string;
  updatedDate: string;
  notes?: string;
  
  // Trigger source
  triggeredBy?: 'status_change' | 'manual_entry';
  sourceStatus?: string; // e.g., 'Viewing', 'LOI'
}

/**
 * COMPLETED DEALS - Closed transactions
 * Ownership Rule: Filtered by broker_id
 */
export interface CompletedDeal {
  id: string;
  dealName: string;
  dealType: 'Leasing' | 'Sales' | 'Auction';
  brokerId: string; // FK to Broker
  closedDate: string;
  actualValue: number;
  category: 'Lease' | 'Sale' | 'Auction';
  counterparty: string;
  propertyName: string;
  commissionRate: number;
  commissionAmount: number;
  status: 'Completed' | 'In Progress';
  
  createdDate: string;
  updatedDate: string;
  notes?: string;
}

/**
 * AWAITING PAYMENT - Deals awaiting payment (triggered by Invoice status)
 * Ownership Rule: Filtered by broker_id
 */
export interface DealAwaitingPayment {
  id: string;
  dealName: string;
  dealType: 'Leasing' | 'Sales' | 'Auction';
  brokerId: string; // FK to Broker
  closedDate: string;
  expectedPaymentDate: string;
  dealValue: number;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: 'Overdue' | 'Due Soon' | 'On Track';
  counterparty: string;
  
  createdDate: string;
  updatedDate: string;
  notes?: string;
}

/**
 * LEGAL DOCUMENTS
 */
export interface LegalDocument {
  id: string;
  documentName: string;
  documentType: 'Purchase Agreement' | 'Lease Agreement' | 'Operating Agreement' | 'Fund Document' | 'Title Deed' | 'Survey' | 'Environmental Report' | 'Inspection Report' | 'Contract';
  createdDate: string;
  lastModifiedDate: string;
  createdBy: string;
  lastModifiedBy: string;
  status: DocumentStatus;
  fileSize: number;
  fileName: string;
  description?: string;
  linkedAssets?: { assetId: string; assetName: string; assetType: string }[];
  linkedDeals?: { dealId: string; dealName: string; dealType: string }[];
  permissions?: {
    brokerId: string;
    brokerName: string;
    email: string;
    permissionLevel: PermissionLevel;
    grantedDate: string;
    grantedBy: string;
  }[];
  content?: string;
  tags?: string[];
  version: number;
  expiryDate?: string;
  filePath?: string;
  fileType?: 'pdf' | 'doc' | 'docx' | 'txt';
  fileData?: ArrayBuffer | Blob;
  linkedDocuments?: {
    id: string;
    name: string;
    type: string;
    uploadDate: string;
    description?: string;
  }[];
}

/**
 * DEAL SHEET METRICS & VIEWS
 */
export interface ConversionMetrics {
  leasingOpportunities: number;
  leasingWon: number;
  leasingConversionRate: number;
  salesOpportunities: number;
  salesWon: number;
  salesConversionRate: number;
  auctionOpportunities: number;
  auctionWon: number;
  auctionConversionRate: number;
  overallConversionRate: number;
}

/**
 * BROKER PROFILE - User context for filtering
 * Used in Deal Sheet, Stock views, and Lead filters
 */
export interface BrokerProfile {
  brokerId: string;
  brokerName: string;
  email: string;
  managementGroup?: string; // Email group for Invoice notifications
  assignedTerritory?: string;
  focusAreas?: string[]; // Leasing, Sales, Auction, etc.
}

/**
 * SERVICE LAYER TYPES
 */

/**
 * Trigger Event - Emitted when stock/deal status changes
 * Used to populate ForecastDeals, AwaitingPayment, etc.
 */
export interface TriggerEvent {
  entityType: 'stock' | 'deal';
  entityId: string;
  brokerId: string;
  moduleType: ModuleType;
  previousStatus: string;
  newStatus: string;
  timestamp: string;
  data: {
    dealName?: string;
    propertyName?: string;
    expectedValue?: number;
    probability?: number;
  };
}

/**
 * Email Notification - Sent on Invoice status
 */
export interface EmailNotification {
  id: string;
  event: 'invoice_status_change';
  dealId: string;
  dealName: string;
  dealType: ModuleType;
  brokerId: string;
  brokerName: string;
  stockId?: string;
  dealValue: number;
  invoiceDate: string;
  paymentTerms?: string;
  recipientGroup: string; // Management email group
  sent: boolean;
  sentDate?: string;
  notes?: string;
}

/**
 * DATA INTEGRITY CONSTRAINTS
 * (Enforced at application layer)
 */

// Rule 1: Stock ownership
// Constraint: stock.broker_id NOT NULL (creates a 1:1 relationship)
// Constraint: Only broker_id owner can update stock.status

// Rule 2: ForecastDeal integrity
// Constraint: forecast_deal.stock_id NOT NULL
// Constraint: forecast_deal.broker_id NOT NULL
// Constraint: forecast_deal.module_type IN ('leasing', 'sales', 'auction')

// Rule 3: Deal Sheet filtering
// All queries filtered by: broker_id = current_user.broker_id

// Rule 4: Trigger logic
// On status change, emit TriggerEvent → evaluate rules → update ForecastDeals/AwaitingPayment

