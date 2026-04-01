/**
 * UNIFIED CRM SCHEMA
 * Single source of truth for all CRM entities
 * Consolidates: crm-types.ts, crm-schema-v2.ts, leasing.ts, sales.ts
 * Last Updated: 2026-02-19
 */

// ============================================================================
// ENUMS & TYPES
// ============================================================================

export type DocumentStatus = 'Draft' | 'Under Review' | 'Approved' | 'Executed' | 'Archived';
export type PermissionLevel = 'View Only' | 'Edit' | 'Approve' | 'Admin';
export type ModuleType = 'leasing' | 'sales' | 'auction' | 'property_funds';
export type BrokerRole = 'Admin' | 'Senior Broker' | 'Broker' | 'Junior Broker' | 'Analyst';
export type ContactType = 'Investor' | 'Tenant' | 'Landlord' | 'Broker' | 'Vendor' | 'Other';
export type LeadType = 'Leasing' | 'Sales' | 'Auction';
export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Negotiating' | 'Proposal' | 'Won' | 'Lost';
export type DealType = 'Purchase' | 'Development' | 'Investment' | 'Partnership' | 'Lease';
export type PropertyType = 'Office' | 'Retail' | 'Residential' | 'Industrial' | 'Flat' | 'Filling Station' | 'Student Accommodation' | 'Land';
export type FacilityType = 'Shopping Centre' | 'Office Park' | 'Residential Complex' | 'Mixed-Use' | 'Industrial Park';

// ============================================================================
// BASE ENTITIES
// ============================================================================

/**
 * BROKERS - Sales representatives / Account managers
 */
export interface Broker {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: BrokerRole;
  department: string;
  status: 'Active' | 'Inactive' | 'On Leave';
  permissionLevel: PermissionLevel;
  specialization: string[];
  joinDate: string;
  avatar?: string;
  address?: string;
  licenseNumber?: string;
  assignedAssets?: string[];
  linkedDeals?: string[];
  linkedLeads?: string[];
  pinSentDate?: string;
  pinStatus?: 'Pending' | 'Sent' | 'Used' | 'Expired';
  createdDate: string;
  updatedDate: string;
  notes?: string;
}

/**
 * CONTACTS - Unified contact entity for all contact types
 */
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  position?: string;
  type: ContactType;
  status: 'Active' | 'Inactive' | 'Archived';
  linkedPartners?: string[]; // Partner IDs (for partnerships)
  linkedDeals?: string[]; // Deal IDs
  linkedLeads?: string[]; // Lead IDs
  linkedProperties?: string[]; // Property IDs
  linkedAssets?: string[]; // Asset IDs
  createdDate: string;
  updatedDate: string;
  notes?: string;
}

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

// ============================================================================
// PROPERTY ENTITIES
// ============================================================================

/**
 * PROPERTIES/ASSETS - Physical real estate
 */
export interface Property {
  id: string;
  propertyName: string;
  propertyAddress: string;
  propertyType: PropertyType;
  facilityType?: FacilityType;
  latitude?: number;
  longitude?: number;
  squareFeet?: number;
  squareMeter?: number;
  centreContactNumber?: string;
  linkedFundId?: string;
  fundType?: 'Listed' | 'Non-Listed';
  linkedBrokerId?: string;
  linkedContacts?: string[]; // Centre contact IDs or main contact IDs
  linkedTenants?: string[];
  linkedStockItems?: string[];
  centerContacts?: CentreContact[];
  status: 'Active' | 'Inactive' | 'Sold' | 'Archived';
  createdDate: string;
  updatedDate: string;
  notes?: string;
}

/**
 * CENTRE CONTACTS - People managing/operating a facility
 */
export interface CentreContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  position: string;
  propertyId: string;
  linkedContactId?: string;
  createdDate: string;
  updatedDate?: string;
}

/**
 * STOCK ITEMS - Available units/spaces within properties
 */
export interface StockItem {
  id: string;
  itemName: string;
  category: string;
  propertyId: string;
  sizeSquareMeter: number;
  sizeSquareFeet?: number;
  location: string;
  pricingType: 'per_sqm' | 'per_sqft' | 'gross_rental' | 'net_rental';
  price: number;
  currency: string;
  dateObtained: string;
  assignedBrokerId?: string;
  linkedTenantId?: string;
  linkedLeadsIds?: string[];
  status: 'Available' | 'Leased' | 'Reserved' | 'Maintenance' | 'Sold';
  createdDate: string;
  updatedDate: string;
  comments?: string;
}

/**
 * TENANTS - Occupants of properties
 */
export interface Tenant {
  id: string;
  companyName: string;
  contactId: string;
  industriesId?: string;
  propertyId: string;
  stockItemId?: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: number;
  annualRent?: number;
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
 */
export interface Landlord {
  id: string;
  companyName: string;
  contactId: string;
  industriesId?: string;
  propertyId?: string;
  commissionRate: number;
  linkedAssets?: string[];
  linkedLeases?: string[];
  status: 'Active' | 'Inactive' | 'Archived';
  createdDate: string;
  updatedDate: string;
  notes?: string;
}

// ============================================================================
// LEAD & DEAL ENTITIES
// ============================================================================

/**
 * LEADS - Unified lead entity for all modules
 */
export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  propertyInterest?: string;
  stockItemInterest?: string;
  leadType: LeadType;
  leadSource: 'Direct' | 'Referral' | 'Website' | 'Cold Call' | 'Email' | 'Event' | 'Trade Show';
  status: LeadStatus;
  estimatedValue: number;
  currency: string;
  probability?: number; // 0-100% for sales leads
  closingTimeline?: string;
  dealType?: DealType;
  assignedBrokerId?: string;
  additionalBrokerId?: string;
  commissionSplit?: {
    primaryBroker: number;
    additionalBroker: number;
  };
  contactId?: string;
  createdDate: string;
  lastContactDate: string;
  updatedDate: string;
  notes: string;
}

/**
 * DEALS - Transactions and agreements
 */
export interface Deal {
  id: string;
  dealName: string;
  dealType: DealType;
  propertyId: string;
  stockItemId?: string;
  contactId: string;
  brokerId: string;
  additionalBrokerId?: string;
  commissionalRate?: number;
  dealValue: number;
  currency: string;
  dealStatus: 'Proposal' | 'Negotiating' | 'OTP' | 'Execution Pending' | 'Completed' | 'Cancelled';
  dealDate: string;
  expectedClosingDate: string;
  actualClosingDate?: string;
  linkedLeadId?: string;
  linkedDocuments?: string[];
  participants?: string[]; // Contact IDs involved in deal
  createdDate: string;
  updatedDate: string;
  notes?: string;
}

// ============================================================================
// INVESTMENT & FUND ENTITIES
// ============================================================================

/**
 * FUNDS - Investment vehicles
 */
export interface Fund {
  id: string;
  name: string;
  fundCode: string;
  fundType: 'Listed' | 'Non-Listed';
  registrationNumber: string;
  headOfficeLocation: string;
  overview: string;
  fundManager?: string;
  totalAssets: number;
  currency: string;
  status: 'Active' | 'Closed' | 'In Formation';
  linkedCompanyId?: string;
  linkedCompanyName?: string;
  primaryContactId?: string;
  primaryContactName?: string;
  secondaryContactId?: string;
  linkedProperties?: string[];
  linkedDeals?: string[];
  linkedCompanies?: string[];
  createdDate: string;
  updatedDate: string;
  notes?: string;
}

/**
 * INVESTORS - Investment entities
 */
export interface Investor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  investmentType: 'Individual' | 'Institutional' | 'Fund' | 'REIT' | 'Partnership';
  investmentRange: string;
  focusAreas: string[];
  linkedDeals: string[];
  linkedProperties: string[];
  status: 'Active' | 'Inactive' | 'Reviewing';
  totalInvested: number;
  createdDate: string;
  lastContactDate: string;
  updatedDate: string;
  notes?: string;
}

// ============================================================================
// AUCTION ENTITIES
// ============================================================================

/**
 * AUCTIONS - Auction listings and bids
 */
export interface Auction {
  id: string;
  auctionName: string;
  propertyId: string;
  brokerId: string;
  status: 'Upcoming' | 'Live' | 'Closed' | 'Completed';
  startDate: string;
  endDate: string;
  reservePrice: number;
  estimatedValue: number;
  currency: string;
  totalBids: number;
  highestBid?: number;
  winnerContactId?: string;
  participantContactIds?: string[];
  linkedLeads?: string[];
  createdDate: string;
  updatedDate: string;
  notes?: string;
}

// ============================================================================
// DOCUMENT ENTITIES
// ============================================================================

/**
 * DOCUMENTS - All types of documents
 */
export interface Document {
  id: string;
  documentName: string;
  documentType: 'Contract' | 'Lease' | 'Agreement' | 'Report' | 'Other';
  status: DocumentStatus;
  linkedDealId?: string;
  linkedPropertyId?: string;
  linkedContactId?: string;
  brokerId: string;
  fileUrl: string;
  fileSize: number;
  uploadedBy: string;
  approvedBy?: string;
  createdDate: string;
  updatedDate: string;
  expiryDate?: string;
  notes?: string;
}

// ============================================================================
// SYSTEM ENTITIES
// ============================================================================

/**
 * ACTIVITIES - User activities and system logs
 */
export interface Activity {
  id: string;
  activityType: 'Create' | 'Update' | 'Delete' | 'View' | 'Export';
  entityType: string;
  entityId: string;
  userId: string;
  details: string;
  changedFields?: Record<string, { old: any; new: any }>;
  timestamp: string;
}

/**
 * SYSTEM SETTINGS - Global system configuration
 */
export interface SystemSettings {
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  timezone: string;
  documentRetentionDays: number;
  autoArchiveMonths: number;
  sessionTimeoutMinutes: number;
  maxLoginAttempts?: number;
  pinValidityHours?: number;
}

// ============================================================================
// PIN MANAGEMENT
// ============================================================================

/**
 * BROKER PIN - Login PIN for brokers
 */
export interface BrokerPin {
  brokerId: string;
  pin: string;
  createdDate: string;
  expiresDate: string;
  attempts: number;
  isUsed: boolean;
  usedDate?: string;
}

// ============================================================================
// COMBINED ENTITIES FOR COMPLEX OPERATIONS
// ============================================================================

/**
 * DEAL SUMMARY - Complete deal with related entities
 */
export interface DealSummary extends Deal {
  property?: Property;
  broker?: Broker;
  contact?: Contact;
  documents?: Document[];
  activities?: Activity[];
}

/**
 * PROPERTY SUMMARY - Complete property with related entities
 */
export interface PropertySummary extends Property {
  broker?: Broker;
  tenants?: Tenant[];
  stockItems?: StockItem[];
  contacts?: Contact[];
  fund?: Fund;
  recentDeals?: Deal[];
  activeLeases?: Tenant[];
}

/**
 * LEAD SUMMARY - Complete lead with related entities
 */
export interface LeadSummary extends Lead {
  contact?: Contact;
  broker?: Broker;
  property?: Property;
  linkedDeal?: Deal;
  activities?: Activity[];
}
