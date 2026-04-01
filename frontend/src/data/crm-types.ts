// Comprehensive CRM Data Types - Core Entities

/**
 * FUNDS - Investment Vehicles
 */
export interface Fund {
  id: string;
  name: string;
  fundCode: string; // Unique fund code (e.g., P3, P4, etc.)
  fundType: 'Listed' | 'Non-Listed';
  registrationNumber: string;
  headOfficeLocation: string;
  overview: string; // industrial, retail, mixed-use, etc.
  fundManager?: string;
  totalAssets: number;
  currency: string;
  status: 'Active' | 'Closed' | 'In Formation';
  // Company and Contact Linking
  linkedCompanyId?: string; // Primary company managing the fund
  linkedCompanyName?: string; // Denormalized company name
  primaryContactId?: string; // Primary contact person
  primaryContactName?: string; // Denormalized primary contact name
  secondaryContactId?: string; // Secondary contact person
  secondaryContactName?: string; // Denormalized secondary contact name
  // Entity Relationships
  linkedProperties?: string[]; // Asset IDs linked to this fund
  linkedDeals?: string[]; // Deal IDs linked to this fund
  linkedCompanies?: string[]; // Company IDs linked to this fund (multiple companies can be linked)
  createdDate: string;
  updatedDate: string;
}

/**
 * ASSETS - Properties linked to Funds
 */
export interface Asset {
  id: string;
  propertyName: string;
  propertyAddress: string;
  centreContactNumber: string;
  linkedFundId: string;
  fundType: 'Listed' | 'Non-Listed'; // Denormalized from Fund
  latitude?: number;
  longitude?: number;
  squareFeet?: number;
  centerContacts: CentreContact[];
  leasingStock: LeasingStockItem[];
  tenants: string[]; // Tenant IDs
  createdDate: string;
  updatedDate: string;
}

/**
 * CENTRE CONTACTS - People managing/operating a centre
 */
export interface CentreContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  position: string;
  assetId: string;
  linkedContactId?: string; // Link to main Contact
  createdDate: string;
}

/**
 * LEASING STOCK - Available units/spaces within an asset
 */
export interface LeasingStockItem {
  id: string;
  centreItemName: string;
  retailCategory: string;
  sizeSquareMeter: number;
  locationWithinCentre: string;
  pricingType: 'per_sqm' | 'gross_rental'; // Only one allowed
  price: number;
  dateObtained: string;
  assignedBrokerId?: string;
  comments: string;
  assetId: string;
  linkedTenantId?: string; // If leased
  status: 'Available' | 'Leased' | 'Reserved' | 'Maintenance';
  createdDate: string;
}

/**
 * TENANTS - Occupants of stock items
 */
export interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  phone: string;
  linkedAssetId: string; // Asset ID
  linkedStockItemId?: string; // Leasing stock item
  leaseStartDate?: string;
  leaseEndDate?: string;
  monthlyRent?: number;
  status: 'Active' | 'Prospect' | 'Inactive';
  leaseStatus?: 'Active' | 'Pending' | 'Expired' | 'Cancelled';
  createdDate: string;
  updatedDate: string;
}

/**
 * LEADS - Sales opportunities (auto-populated from Tenants)
 */
export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  businessName?: string;
  linkedAssetId: string;
  linkedTenantId?: string;
  leadSource: 'Tenant' | 'Direct' | 'Referral' | 'Website' | 'Cold Call';
  status: 'New' | 'Contacted' | 'Qualified' | 'Negotiating' | 'Converted' | 'Lost';
  value?: number;
  createdDate: string;
  lastContactDate?: string;
  notes?: string;
}

/**
 * BROKERS - Sales representatives
 */
export interface Broker {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization?: string;
  assignedAssets?: string[]; // Asset IDs
  status: 'Active' | 'Inactive';
  createdDate: string;
  avatar?: string; // Avatar URL or initials
  notes?: string; // Optional broker profile notes
}
