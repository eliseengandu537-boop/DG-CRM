// Property Funds Data Types and Mock Data

export interface FundContact {
  name: string;
  phone: string;
  email: string;
  address: string;
  role: string;
}

export interface FundAsset {
  assetId: string;
  propertyName: string;
  type: 'Commercial' | 'Residential' | 'Industrial' | 'Mixed-Use';
  value: number;
  acquisitionDate: string;
  status: 'Active' | 'For Sale' | 'Under Development';
}

export interface Subsidiary {
  subsidiaryId: string;
  name: string;
  type: 'Operating Company' | 'Property Holding' | 'Management Company';
  registrationNumber: string;
  country: string;
}

export interface VacancySchedule {
  propertyId: string;
  propertyName: string;
  vacancyRate: number; // percentage
  vacantUnits: number;
  totalUnits: number;
  expectedLeaseDate?: string;
  notes?: string;
}

export interface Fund {
  id: string;
  name: string;
  type: 'Listed' | 'Non-Listed';
  fundManager: string;
  launchDate: string;
  totalAssets: number;
  unitPrice?: number; // For listed funds
  minimumInvestment?: number; // For non-listed funds
  currency: string;
  status: 'Active' | 'Closed' | 'In Formation';
  description: string;
  contacts: FundContact[];
  assets: FundAsset[];
  subsidiaries: Subsidiary[];
  vacancySchedules: VacancySchedule[];
  linkedFundIds: string[]; // IDs of linked funds
}

// Mock Listed Funds Data
export const listedFunds: Fund[] = [];
export const nonListedFunds: Fund[] = [];
export const allFunds: Fund[] = [];
