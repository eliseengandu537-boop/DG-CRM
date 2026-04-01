import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface TenantRecord {
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
  createdAt: string;
  updatedAt: string;
}

export interface CreateTenantRequest {
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
  details?: Record<string, unknown>;
}

export interface TenantFilters {
  page?: number;
  limit?: number;
  status?: string;
  leaseStatus?: string;
  search?: string;
}

export interface PaginatedTenants {
  data: TenantRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

const detailsToRecord = (details: unknown): Record<string, unknown> => {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  return details as Record<string, unknown>;
};

const detailString = (details: Record<string, unknown>, key: string, fallback = '') => {
  const value = details[key];
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
};

const detailNumber = (details: Record<string, unknown>, key: string, fallback = 0) => {
  const value = details[key];
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function serializeLeasingTenant(tenant: any): Record<string, unknown> {
  return {
    companyName: String(tenant.companyName ?? tenant.businessName ?? '').trim(),
    contactId: String(tenant.contactId ?? ''),
    propertyId: String(tenant.propertyId ?? ''),
    leaseStartDate: String(tenant.leaseStartDate ?? ''),
    leaseEndDate: String(tenant.leaseEndDate ?? ''),
    monthlyRent: Number(tenant.monthlyRent ?? 0) || 0,
    securityDeposit: Number(tenant.securityDeposit ?? 0) || 0,
    leaseStatus: String(tenant.leaseStatus ?? 'Pending'),
    squareFootage: Number(tenant.squareFeet ?? tenant.squareFootage ?? 0) || 0,
    unitNumber: String(tenant.unit ?? tenant.unitNumber ?? ''),
    paymentStatus: String(tenant.paymentStatus ?? 'Current'),
    maintenanceRequests: Number(
      tenant.maintenanceRequired ? 1 : tenant.maintenanceRequests ?? 0
    ) || 0,
    notes: String(tenant.notes ?? ''),
    status: String(tenant.status ?? 'Prospect'),
  };
}

export function serializePropertyFundsTenant(tenant: any): Record<string, unknown> {
  return {
    firstName: String(tenant.firstName ?? '').trim(),
    lastName: String(tenant.lastName ?? '').trim(),
    businessName: String(tenant.businessName ?? '').trim(),
    email: String(tenant.email ?? '').trim(),
    phone: String(tenant.phone ?? '').trim(),
    linkedAssetId: String(tenant.linkedAssetId ?? ''),
    linkedStockItemId: String(tenant.linkedStockItemId ?? ''),
    leaseStartDate: String(tenant.leaseStartDate ?? ''),
    leaseEndDate: String(tenant.leaseEndDate ?? ''),
    monthlyRent: Number(tenant.monthlyRent ?? 0) || 0,
    status: String(tenant.status ?? 'Prospect'),
    leaseStatus: String(tenant.leaseStatus ?? 'Pending'),
  };
}

export function mapTenantRecordToLeasingTenant(record: TenantRecord): any {
  const details = detailsToRecord(record.details);
  return {
    id: record.id,
    companyName: record.companyName || detailString(details, 'companyName', ''),
    contactId: record.contactId || detailString(details, 'contactId', ''),
    propertyId: record.propertyId || detailString(details, 'propertyId', ''),
    leaseStartDate: record.leaseStartDate || detailString(details, 'leaseStartDate', ''),
    leaseEndDate: record.leaseEndDate || detailString(details, 'leaseEndDate', ''),
    monthlyRent: record.monthlyRent ?? detailNumber(details, 'monthlyRent', 0),
    securityDeposit: record.securityDeposit ?? detailNumber(details, 'securityDeposit', 0),
    leaseStatus: record.leaseStatus || detailString(details, 'leaseStatus', 'Pending'),
    squareFootage: record.squareFootage ?? detailNumber(details, 'squareFootage', 0),
    unitNumber: record.unitNumber || detailString(details, 'unitNumber', ''),
    paymentStatus: record.paymentStatus || detailString(details, 'paymentStatus', 'Current'),
    maintenanceRequests:
      record.maintenanceRequests ?? detailNumber(details, 'maintenanceRequests', 0),
    notes: record.notes || detailString(details, 'notes', ''),
    backendRecordId: record.id,
  };
}

export function mapTenantRecordToPropertyFundsTenant(record: TenantRecord): any {
  const details = detailsToRecord(record.details);
  const createdAt = new Date(record.createdAt);
  const updatedAt = new Date(record.updatedAt);
  return {
    id: record.id,
    firstName: record.firstName || detailString(details, 'firstName', ''),
    lastName: record.lastName || detailString(details, 'lastName', ''),
    businessName: record.businessName || detailString(details, 'businessName', ''),
    email: record.email || detailString(details, 'email', ''),
    phone: record.phone || detailString(details, 'phone', ''),
    linkedAssetId: record.linkedAssetId || detailString(details, 'linkedAssetId', ''),
    linkedStockItemId: record.linkedStockItemId || detailString(details, 'linkedStockItemId', ''),
    leaseStartDate: record.leaseStartDate || detailString(details, 'leaseStartDate', ''),
    leaseEndDate: record.leaseEndDate || detailString(details, 'leaseEndDate', ''),
    monthlyRent: record.monthlyRent ?? detailNumber(details, 'monthlyRent', 0),
    status: record.status || detailString(details, 'status', 'Prospect'),
    leaseStatus: record.leaseStatus || detailString(details, 'leaseStatus', 'Pending'),
    createdDate: createdAt.toISOString().split('T')[0],
    updatedDate: updatedAt.toISOString().split('T')[0],
    backendRecordId: record.id,
  };
}

class TenantService {
  async getAllTenants(filters?: TenantFilters): Promise<PaginatedTenants> {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.status) params.append('status', filters.status);
      if (filters?.leaseStatus) params.append('leaseStatus', filters.leaseStatus);
      if (filters?.search) params.append('search', filters.search);

      const response = await apiClient.get<{
        success: boolean;
        data: PaginatedTenants;
      }>('/tenants', { params: Object.fromEntries(params) });

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch tenants');
    }
  }

  async getTenantById(id: string): Promise<TenantRecord> {
    try {
      const response = await apiClient.get<{ success: boolean; data: TenantRecord }>(
        `/tenants/${id}`
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch tenant');
    }
  }

  async createTenant(data: CreateTenantRequest): Promise<TenantRecord> {
    try {
      const response = await apiClient.post<{ success: boolean; data: TenantRecord }>(
        '/tenants',
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create tenant');
    }
  }

  async updateTenant(id: string, data: Partial<CreateTenantRequest>): Promise<TenantRecord> {
    try {
      const response = await apiClient.put<{ success: boolean; data: TenantRecord }>(
        `/tenants/${id}`,
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update tenant');
    }
  }

  async deleteTenant(id: string): Promise<void> {
    try {
      await apiClient.delete(`/tenants/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete tenant');
    }
  }
}

export const tenantService = new TenantService();
export default tenantService;
