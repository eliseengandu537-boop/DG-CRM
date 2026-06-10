export interface Property {
  id: string;
  assetId: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  markerShape?: "circle" | "square";
  markerColor?: string;
  details: {
    type: string; // "Office", "Retail", "Residential", "Industrial", "Flat", "Filling Station", "Student Accommodation", "Land"
    squareFeet: number;
    gla?: number;
    yearBuilt: number;
    condition: string;
    ownershipStatus: string;
  };
  linkedDeals: Array<{
    id: string;
    dealName: string;
    dealType: string;
    status: string;
    value: string;
  }>;
  leasingSalesRecords: Array<{
    id: string;
    recordType: "Lease" | "Sale";
    date: string;
    tenant: string;
    amount: string;
    duration?: string;
  }>;
  auctionRecords?: Array<{
    id: string;
    auctionDate: string;
    auctionHouse: string;
    estimatedValue: string;
    finalPrice?: string;
    status: string;
  }>;
  linkedDocuments?: Array<{
    id: string;
    name: string;
    type: string; // "Contract", "Deed", "Lease", "Insurance", "Survey", "Appraisal", "Other"
    uploadDate: string;
    url?: string;
    description?: string;
  }>;
  linkedContacts?: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
  }>;
  linkedCompanyId?: string;
  linkedCompanyName?: string;
  linkedFundId?: string;
  linkedFundName?: string;
  registrationNumber?: string;
  registrationName?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerContactNumber?: string;
  tenantName?: string;
  tenantContactNumber?: string;
  /** Tenants saved from the Assets editor (multi-tenant). */
  tenants?: Array<{ name: string; leaseExpiry?: string; contactNumber?: string }>;
  /** Centre contacts (centre manager, etc.) saved from the Assets/Maps editors. */
  centreContacts?: Array<{ name: string; role?: string; phone?: string; email?: string }>;
  /** Original backend metadata, retained so edits don't drop unmapped fields. */
  rawMetadata?: Record<string, unknown>;
  brokerName: string;
  brokerId?: string;
  brokerEmail?: string;
}
