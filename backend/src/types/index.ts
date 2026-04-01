import type { Request } from 'express';

export type BrokerDepartment = 'sales' | 'leasing';
export type ModuleScope = 'sales' | 'leasing' | 'auction';
export type DealType = 'sale' | 'lease' | 'auction';
export type VisibilityScope = 'shared' | 'private';

export interface CoBrokerSplit {
  brokerId: string;
  splitPercent: number;
  brokerShare?: number;
}

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'broker' | 'viewer';
  permissions: string[];
  brokerId?: string | null;
  department?: BrokerDepartment | null;
  createdAt: Date;
  updatedAt: Date;
}

// Lead types
export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  moduleType?: ModuleScope;
  stage?: string;
  company?: string;
  leadSource?: string;
  dealType?: string;
  probability?: number;
  closingTimeline?: string;
  notes?: string;
  comment?: string;
  contactId?: string;
  brokerAssigned?: string;
  additionalBroker?: string;
  commissionSplit?: Record<string, number> | null;
  propertyAddress?: string;
  leadType?: string;
  linkedStockId?: string;
  dealId?: string;
  forecastDealId?: string;
  legalDocumentId?: string;
  status: string;
  brokerId?: string;
  createdByBrokerId?: string;
  assignedBrokerId?: string;
  assignedBrokerName?: string;
  propertyId?: string;
  broker?: string;
  property?: string;
  value?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Deal types
export interface Deal {
  id: string;
  title: string;
  description?: string;
  status: string;
  type: DealType;
  value: number;
  assetValue?: number;
  commissionPercent?: number;
  grossCommission?: number;
  companyCommission?: number;
  brokerCommission?: number;
  brokerSplitPercent?: number;
  auctionReferralPercent?: number;
  auctionCommissionPercent?: number;
  coBrokerSplits?: CoBrokerSplit[] | null;
  targetClosureDate?: Date;
  closedDate?: Date;
  leadId: string;
  propertyId: string;
  brokerId: string;
  createdByBrokerId?: string;
  legalDocumentId?: string;
  documentLinked?: boolean;
  clientName?: string;
  legalDocument?: {
    id: string;
    documentName: string;
    status?: string;
    fileName?: string;
    filePath?: string;
    fileType?: string;
  };
  assignedBrokerId?: string;
  assignedBrokerName?: string;
  statusDocuments?: DealStatusDocumentLink[];
  statusHistory?: DealStatusTimelineEntry[];
  workflowProgress?: {
    hasLoiDocument: boolean;
    hasStep2Document: boolean;
    hasAgreementDocument: boolean;
    step2Status?: string;
    agreementStatus?: string;
  };
  lastActivityAt?: Date;
  inactivityNotifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DealStatusDocumentLink {
  id: string;
  status: string;
  documentType: string;
  legalDocumentId: string;
  legalDocumentName: string;
  legalDocumentType?: string;
  legalDocumentStatus?: string;
  fileName?: string;
  filePath?: string | null;
  fileType?: string | null;
  version: number;
  uploadedAt: Date;
  completedAt?: Date | null;
  lastModifiedAt: Date;
  filledDocumentRecordId?: string | null;
  filledDocumentDownloadUrl?: string | null;
  filledDocumentName?: string | null;
}

export interface DealStatusTimelineEntry {
  id: string;
  status: string;
  changedAt: Date;
  changedByUserId?: string | null;
  changedByName?: string | null;
}

export interface DealStatusActivity {
  id: string;
  dealId: string;
  brokerId: string;
  brokerName: string;
  previousStatus: string;
  newStatus: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

// Broker types
export interface Broker {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  department?: BrokerDepartment;
  billingTarget?: number;
  currentBilling?: number;
  progressPercentage?: number;
  avatar?: string;
  status: 'active' | 'inactive' | 'archived';
  archivedAt?: Date;
  archivedByUserId?: string;
  archivedByName?: string;
  archivedByEmail?: string;
  pin?: string;
  pinExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Contact types
export interface Contact {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  type: string;
  status: string;
  linkedLeadId?: string;
  company?: string;
  position?: string;
  notes?: string;
  moduleType?: ModuleScope;
  brokerId?: string;
  createdByBrokerId?: string;
  assignedBrokerId?: string;
  linkedPropertyIds?: string[];
  linkedDealIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Property types
export interface Property {
  id: string;
  title: string;
  description: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  type: string;
  price: number;
  area: number;
  latitude?: number;
  longitude?: number;
  status: string;
  moduleType?: ModuleScope;
  brokerId?: string;
  createdByBrokerId?: string;
  assignedBrokerId?: string;
  assignedBrokerName?: string;
  bedrooms?: number;
  bathrooms?: number;
  metadata?: unknown;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Stock item types
export interface StockItem {
  id: string;
  propertyId: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  createdBy?: string;
  assignedBrokerId?: string;
  module: ModuleScope;
  moduleType?: ModuleScope;
  details: Record<string, unknown>;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Tenant types
export interface Tenant {
  id: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  email?: string;
  phone?: string;
  contactId?: string;
  propertyId?: string;
  linkedAssetId?: string;
  linkedStockItemId?: string;
  unitNumber?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  monthlyRent?: number;
  securityDeposit?: number;
  leaseStatus?: string;
  squareFootage?: number;
  status?: string;
  paymentStatus?: string;
  maintenanceRequests?: number;
  notes?: string;
  details: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Landlord {
  id: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  address?: string;
  status?: string;
  notes?: string;
  details?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Industry {
  id: string;
  name: string;
  category?: string;
  description?: string;
  occupancyRate: number;
  averageRent: number;
  status?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Auction types
export interface Auction {
  id: string;
  propertyId: string;
  startDate: Date;
  endDate: Date;
  minimumBid: number;
  status: 'upcoming' | 'active' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// JWT Payload
export interface JwtPayload {
  userId: string;
  email: string;
  role: User['role'];
  permissions: string[];
  brokerId?: string | null;
  department?: BrokerDepartment | null;
  iat: number;
  exp: number;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
  actorUserId?: string;
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
  brokerId?: string;
  visibilityScope: VisibilityScope;
  previousValues?: Record<string, unknown> | null;
  nextValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ActivityRecord extends AuditLog {
  actorDisplayName?: string;
}

export interface CustomRecord {
  id: string;
  entityType: string;
  name: string;
  status?: string;
  category?: string;
  referenceId?: string;
  createdByUserId?: string;
  createdByBrokerId?: string;
  assignedBrokerId?: string;
  moduleType?: ModuleScope;
  visibilityScope?: VisibilityScope;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ForecastDeal {
  id: string;
  dealId?: string;
  brokerId: string;
  assignedBrokerId?: string;
  assignedBrokerName?: string;
  dealType?: DealType;
  moduleType: ModuleScope;
  status: string;
  title: string;
  expectedValue: number;
  assetValue?: number;
  commissionPercent?: number;
  grossCommission?: number;
  commissionRate: number;
  commissionAmount: number;
  companyCommission: number;
  brokerCommission: number;
  brokerSplitPercent?: number;
  auctionReferralPercent?: number;
  auctionCommissionPercent?: number;
  coBrokerSplits?: CoBrokerSplit[] | null;
  legalDocument?: string;
  forecastedClosureDate?: Date;
  expectedPaymentDate?: Date;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  reminderType: 'deal_follow_up' | 'call' | 'task' | 'email';
  dueAt: Date;
  status: 'pending' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  dealId?: string;
  brokerId?: string;
  assignedUserId?: string;
  assignedToRole?: 'admin' | 'manager' | 'broker';
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  createdByUserId?: string;
  createdByName?: string;
  createdByEmail?: string;
  completedAt?: Date;
  dealTitle?: string;
  brokerName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationRecord {
  id: string;
  activityId?: string;
  actorUserId?: string;
  actorName?: string;
  actorRole?: string;
  title: string;
  message: string;
  type: string;
  entityType: string;
  entityId?: string;
  brokerId?: string;
  sound?: boolean;
  read?: boolean;
  visibilityScope: VisibilityScope;
  payload?: Record<string, unknown> | null;
  createdAt: Date;
}

// Express Request with User
export interface AuthRequest extends Request {
  userId?: string;
  user?: User;
  token?: string;
}
