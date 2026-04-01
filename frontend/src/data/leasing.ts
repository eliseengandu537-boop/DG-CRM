// Leasing data types

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  propertyInterest?: string;
  leadSource?: string;
  status?: string;
  value?: number;
  createdDate?: string;
  lastContactDate?: string;
  notes?: string;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  position?: string;
  type?: string;
  linkedProperties?: string[];
  linkedDeals?: string[];
  status?: string;
  createdDate?: string;
  notes?: string;
}

export interface Tenant {
  id: string;
  companyName: string;
  contactId?: string;
  propertyId?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  monthlyRent?: number;
  securityDeposit?: number;
  leaseStatus?: string;
  squareFootage?: number;
  unitNumber?: string;
  paymentStatus?: string;
  maintenanceRequests?: number;
  notes?: string;
}

export interface Landlord {
  id: string;
  companyName: string;
  contactId?: string;
  propertyId?: string;
  commissionRate?: number;
  paymentTerms?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankRoutingNumber?: string;
  status?: string;
  agreementDate?: string;
  notes?: string;
}

export interface StockItem {
  id: string;
  itemName: string;
  category?: string;
  propertyId?: string;
  quantity?: number;
  location?: string;
  condition?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  lastMaintenance?: string;
  availability?: string;
  notes?: string;
}

