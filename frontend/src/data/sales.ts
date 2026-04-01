// Sales data types

export interface SalesLead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  propertyInterest: string; // Property ID
  dealType: "Purchase" | "Development" | "Investment" | "Partnership";
  leadSource: "Direct" | "Referral" | "Website" | "Cold Call" | "Email" | "Event";
  status: "New" | "Contacted" | "Qualified" | "Proposal" | "Negotiating" | "OTP" | "Won" | "Lost";
  estimatedValue: number;
  closingTimeline: string; // e.g., "Q2 2024"
  createdDate: string;
  lastContactDate: string;
  probability: number; // 0-100%
  notes: string;
  brokerAssigned?: string; // Broker name
  additionalBroker?: string; // Additional broker name
  commissionSplit?: {
    primaryBroker: number; // Percentage
    additionalBroker: number; // Percentage
  };
  linkedStock?: string; // Stock ID linked to this lead
}

export interface Investor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  investmentType: "Individual" | "Institutional" | "Fund" | "REIT" | "Partnership";
  investmentRange: string; // e.g., "R 1M - R 5M"
  focusAreas: string[]; // e.g., ["Residential", "Commercial"]
  linkedDeals: string[]; // Deal IDs
  linkedProperties: string[]; // Property IDs
  status: "Active" | "Inactive" | "Reviewing";
  totalInvested: number;
  createdDate: string;
  lastContactDate: string;
  notes: string;
}

export interface SalesStock {
  id: string;
  itemName: string;
  category: "Marketing Materials" | "Signage" | "Photography" | "Permits" | "Technical" | "Other";
  relatedProperty?: string; // Property ID (optional)
  quantity: number;
  location: string;
  condition: "Excellent" | "Good" | "Fair" | "Poor";
  purchaseDate: string;
  purchasePrice: number;
  usageStatus: "Available" | "In Use" | "Reserved" | "Archived";
  assignedTo?: string; // Contact ID
  expiryDate?: string; // For permits, marketing materials, etc.
  // New optional fields for Sales adjustments
  comments?: string;
  dealStatus?: "Pending" | "LOI" | "OTP" | "DD" | "Finance" | "Transfer" | "Won" | "Lost" | "Invoice";
  notes: string;
  linkedToLeasingStock?: string; // Cross-reference to leasing stock if shared
  documents?: { name: string; url?: string }[];
  address?: string;
  placeId?: string;
  selectedFromMap?: boolean;
  latitude?: number;
  longitude?: number;
  propertyName?: string;
  propertyType?: string;
  propertyStatus?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  area?: number;
  backendRecordId?: string;
}

