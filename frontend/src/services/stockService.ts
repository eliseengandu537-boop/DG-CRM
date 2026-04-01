import apiClient from '@/lib/api';
import { AxiosError } from 'axios';

export interface StockItemRecord {
  id: string;
  propertyId: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  createdBy?: string;
  assignedBrokerId?: string;
  module: string;
  moduleType?: string;
  details: Record<string, unknown>;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockItemRequest {
  propertyId?: string;
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  createdBy?: string;
  module?: string;
  moduleType?: string;
  details: Record<string, unknown>;
}

export interface StockItemFilters {
  module?: string;
  moduleType?: string;
  propertyId?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedStockItems {
  data: StockItemRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

const toStringArray = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

const toDocuments = (value: unknown): { name: string; url?: string }[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = String(record.name || '').trim();
      if (!name) return null;
      const url = typeof record.url === 'string' ? record.url : undefined;
      return { name, url };
    })
    .filter(Boolean) as { name: string; url?: string }[];
};

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

export function serializeLeasingStock(stock: any): Record<string, unknown> {
  const latitude =
    stock.latitude === '' || stock.latitude === null || stock.latitude === undefined
      ? undefined
      : Number(stock.latitude);
  const longitude =
    stock.longitude === '' || stock.longitude === null || stock.longitude === undefined
      ? undefined
      : Number(stock.longitude);
  const normalizedLatitude = Number.isFinite(latitude) ? latitude : undefined;
  const normalizedLongitude = Number.isFinite(longitude) ? longitude : undefined;

  return {
    itemName: String(stock.itemName ?? '').trim(),
    centreItemName: String(stock.centreItemName ?? stock.itemName ?? '').trim(),
    propertyName: String(stock.propertyName ?? stock.itemName ?? '').trim(),
    category: String(stock.category ?? 'Shopping Center'),
    retailCategory: String(stock.retailCategory ?? stock.category ?? ''),
    condition: String(stock.condition ?? 'Good'),
    location: String(stock.location ?? stock.address ?? ''),
    locationWithinCentre: String(stock.locationWithinCentre ?? stock.location ?? stock.address ?? ''),
    formatted_address: String(stock.formattedAddress ?? stock.address ?? stock.location ?? ''),
    address: String(stock.address ?? stock.location ?? ''),
    quantity: Number(stock.quantity ?? 1) || 1,
    sizeSquareMeter: Number(stock.sizeSquareMeter ?? stock.area ?? 0) || 0,
    value: Number(stock.value ?? stock.purchasePrice ?? 0) || 0,
    purchasePrice: Number(stock.purchasePrice ?? stock.value ?? 0) || 0,
    price: Number(stock.price ?? stock.purchasePrice ?? stock.value ?? 0) || 0,
    purchaseDate: String(stock.purchaseDate ?? ''),
    dateObtained: String(stock.dateObtained ?? stock.purchaseDate ?? ''),
    lastMaintenance: String(stock.lastMaintenance ?? ''),
    comments: String(stock.comments ?? ''),
    assignedBroker: String(stock.assignedBroker ?? ''),
    assignedBrokerId: String(stock.assignedBrokerId ?? ''),
    linkedDeals: toStringArray(stock.linkedDeals),
    notes: String(stock.notes ?? ''),
    availability: String(stock.availability ?? 'In Stock'),
    pricingType: String(stock.pricingType ?? 'gross_rental'),
    assetId: String(stock.assetId ?? stock.propertyId ?? ''),
    status: String(stock.status ?? stock.availability ?? 'Available'),
    linkedInvoices: toStringArray(stock.linkedInvoices),
    paymentStatus: String(stock.paymentStatus ?? 'Paid'),
    documents: toDocuments(stock.documents),
    stockKind: String(stock.stockKind ?? ''),
    placeId: String(stock.placeId ?? ''),
    selectedFromMap: Boolean(stock.selectedFromMap),
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
    propertyType: String(stock.propertyType ?? stock.category ?? ''),
    propertyStatus: String(stock.propertyStatus ?? ''),
    city: String(stock.city ?? ''),
    areaName: String(stock.areaName ?? stock.locality ?? ''),
    locality: String(stock.locality ?? stock.areaName ?? ''),
    province: String(stock.province ?? ''),
    postalCode: String(stock.postalCode ?? ''),
    area: Number(stock.area ?? stock.sizeSquareMeter ?? 0) || 0,
  };
}

export function serializeSalesStock(stock: any): Record<string, unknown> {
  const latitude =
    stock.latitude === '' || stock.latitude === null || stock.latitude === undefined
      ? undefined
      : Number(stock.latitude);
  const longitude =
    stock.longitude === '' || stock.longitude === null || stock.longitude === undefined
      ? undefined
      : Number(stock.longitude);
  const normalizedLatitude = Number.isFinite(latitude) ? latitude : undefined;
  const normalizedLongitude = Number.isFinite(longitude) ? longitude : undefined;

  return {
    itemName: String(stock.itemName ?? '').trim(),
    propertyName: String(stock.propertyName ?? stock.itemName ?? '').trim(),
    category: String(stock.category ?? 'Other'),
    condition: String(stock.condition ?? 'Good'),
    location: String(stock.location ?? ''),
    formatted_address: String(stock.formattedAddress ?? stock.address ?? stock.location ?? ''),
    address: String(stock.address ?? stock.location ?? ''),
    quantity: Number(stock.quantity ?? 1) || 1,
    purchaseDate: String(stock.purchaseDate ?? ''),
    purchasePrice: Number(stock.purchasePrice ?? stock.value ?? 0) || 0,
    price: Number(stock.price ?? stock.purchasePrice ?? stock.value ?? 0) || 0,
    value: Number(stock.value ?? stock.purchasePrice ?? 0) || 0,
    usageStatus: String(stock.usageStatus ?? 'Available'),
    assignedTo: String(stock.assignedTo ?? ''),
    expiryDate: String(stock.expiryDate ?? ''),
    comments: String(stock.comments ?? ''),
    dealStatus: String(stock.dealStatus ?? 'Pending'),
    notes: String(stock.notes ?? ''),
    relatedProperty: String(stock.relatedProperty ?? stock.propertyId ?? ''),
    linkedToLeasingStock: String(stock.linkedToLeasingStock ?? ''),
    documents: toDocuments(stock.documents),
    stockKind: String(stock.stockKind ?? ''),
    placeId: String(stock.placeId ?? ''),
    selectedFromMap: Boolean(stock.selectedFromMap),
    propertyStatus: String(stock.propertyStatus ?? ''),
    propertyType: String(stock.propertyType ?? stock.category ?? ''),
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
    city: String(stock.city ?? ''),
    areaName: String(stock.areaName ?? stock.locality ?? ''),
    locality: String(stock.locality ?? stock.areaName ?? ''),
    province: String(stock.province ?? ''),
    postalCode: String(stock.postalCode ?? ''),
    area: Number(stock.area ?? 0) || 0,
  };
}

export function mapStockRecordToLeasingStock(record: StockItemRecord): any {
  const details = detailsToRecord(record.details);
  const latitude = detailNumber(details, 'latitude', record.latitude ?? 0);
  const longitude = detailNumber(details, 'longitude', record.longitude ?? 0);
  const itemName =
    record.name ||
    detailString(details, 'itemName', detailString(details, 'propertyName', ''));
  const address =
    record.address || detailString(details, 'address', detailString(details, 'location', ''));
  const availability = detailString(details, 'availability', 'In Stock');
  return {
    id: record.id,
    itemName,
    centreItemName: detailString(details, 'centreItemName', itemName),
    propertyName: detailString(details, 'propertyName', itemName),
    category: detailString(details, 'category', 'Shopping Center'),
    retailCategory: detailString(details, 'retailCategory', detailString(details, 'category', '')),
    condition: detailString(details, 'condition', 'Good'),
    location: record.address || detailString(details, 'location', detailString(details, 'address', '')),
    locationWithinCentre: detailString(
      details,
      'locationWithinCentre',
      detailString(details, 'location', address)
    ),
    address,
    formattedAddress: detailString(details, 'formatted_address', address),
    quantity: detailNumber(details, 'quantity', 1),
    sizeSquareMeter: detailNumber(details, 'sizeSquareMeter', detailNumber(details, 'area', 0)),
    value: detailNumber(details, 'value', detailNumber(details, 'purchasePrice', 0)),
    purchasePrice: detailNumber(details, 'purchasePrice', detailNumber(details, 'value', 0)),
    price: detailNumber(
      details,
      'price',
      detailNumber(details, 'purchasePrice', detailNumber(details, 'value', 0))
    ),
    purchaseDate: detailString(details, 'purchaseDate', ''),
    dateObtained: detailString(details, 'dateObtained', detailString(details, 'purchaseDate', '')),
    lastMaintenance: detailString(details, 'lastMaintenance', ''),
    comments: detailString(details, 'comments', detailString(details, 'notes', '')),
    assignedBroker: detailString(details, 'assignedBroker', ''),
    assignedBrokerId: String(record.assignedBrokerId || detailString(details, 'assignedBrokerId', record.createdBy || '')),
    linkedDeals: toStringArray(details.linkedDeals),
    propertyId: record.propertyId,
    notes: detailString(details, 'notes', ''),
    availability,
    pricingType: detailString(details, 'pricingType', 'gross_rental'),
    assetId: detailString(details, 'assetId', record.propertyId),
    status: detailString(details, 'status', availability === 'In Stock' ? 'Available' : availability),
    linkedInvoices: toStringArray(details.linkedInvoices),
    paymentStatus: detailString(details, 'paymentStatus', 'Paid'),
    documents: toDocuments(details.documents),
    stockKind: detailString(details, 'stockKind', ''),
    placeId: detailString(details, 'placeId', ''),
    selectedFromMap:
      String(details.selectedFromMap || '').toLowerCase() === 'true' ||
      Boolean(details.selectedFromMap),
    latitude,
    longitude,
    propertyType: detailString(details, 'propertyType', detailString(details, 'category', '')),
    propertyStatus: detailString(details, 'propertyStatus', ''),
    city: detailString(details, 'city', ''),
    areaName: detailString(details, 'areaName', detailString(details, 'locality', '')),
    province: detailString(details, 'province', ''),
    postalCode: detailString(details, 'postalCode', ''),
    area: detailNumber(details, 'area', detailNumber(details, 'sizeSquareMeter', 0)),
    createdBy: record.createdBy,
    backendRecordId: record.id,
    module: record.module,
  };
}

export function mapStockRecordToSalesStock(record: StockItemRecord): any {
  const details = detailsToRecord(record.details);
  const latitudeValue =
    details.latitude === undefined || details.latitude === null || details.latitude === ''
      ? record.latitude
      : details.latitude;
  const longitudeValue =
    details.longitude === undefined || details.longitude === null || details.longitude === ''
      ? record.longitude
      : details.longitude;
  const parsedLatitude = Number(latitudeValue);
  const parsedLongitude = Number(longitudeValue);
  const latitude = Number.isFinite(parsedLatitude) ? parsedLatitude : undefined;
  const longitude = Number.isFinite(parsedLongitude) ? parsedLongitude : undefined;

  return {
    id: record.id,
    itemName: detailString(details, 'itemName', detailString(details, 'propertyName', record.name)),
    category: detailString(details, 'category', 'Other'),
    quantity: detailNumber(details, 'quantity', 1),
    location: detailString(details, 'location', detailString(details, 'address', record.address)),
    address: detailString(details, 'address', detailString(details, 'location', record.address)),
    formattedAddress: detailString(
      details,
      'formatted_address',
      detailString(details, 'address', detailString(details, 'location', record.address))
    ),
    condition: detailString(details, 'condition', 'Good'),
    purchaseDate: detailString(details, 'purchaseDate', ''),
    purchasePrice: detailNumber(details, 'purchasePrice', detailNumber(details, 'value', 0)),
    usageStatus: detailString(details, 'usageStatus', 'Available'),
    assignedTo: detailString(details, 'assignedTo', ''),
    expiryDate: detailString(details, 'expiryDate', ''),
    comments: detailString(details, 'comments', detailString(details, 'notes', '')),
    dealStatus: detailString(details, 'dealStatus', 'Pending'),
    notes: detailString(details, 'notes', ''),
    assignedBroker: detailString(
      details,
      'assignedBroker',
      detailString(details, 'assignedTo', '')
    ),
    assignedBrokerId: String(
      record.assignedBrokerId || detailString(details, 'assignedBrokerId', '')
    ),
    relatedProperty: detailString(details, 'relatedProperty', record.propertyId),
    linkedToLeasingStock: detailString(details, 'linkedToLeasingStock', ''),
    documents: toDocuments(details.documents),
    createdBy: record.createdBy,
    propertyId: record.propertyId,
    propertyName: detailString(details, 'propertyName', record.name),
    stockKind: detailString(details, 'stockKind', ''),
    placeId: detailString(details, 'placeId', ''),
    selectedFromMap:
      String(details.selectedFromMap || '').toLowerCase() === 'true' ||
      Boolean(details.selectedFromMap),
    latitude,
    longitude,
    propertyStatus: detailString(details, 'propertyStatus', ''),
    propertyType: detailString(details, 'propertyType', detailString(details, 'category', '')),
    city: detailString(details, 'city', ''),
    areaName: detailString(details, 'areaName', detailString(details, 'locality', '')),
    province: detailString(details, 'province', ''),
    postalCode: detailString(details, 'postalCode', ''),
    area: detailNumber(details, 'area', 0),
    backendRecordId: record.id,
    module: record.module,
  };
}

class StockService {
  async getAllStockItems(filters?: StockItemFilters): Promise<PaginatedStockItems> {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', String(filters.page));
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.module) params.append('module', filters.module);
      if (filters?.moduleType) params.append('moduleType', filters.moduleType);
      if (filters?.propertyId) params.append('propertyId', filters.propertyId);

      const response = await apiClient.get<{ success: boolean; data: PaginatedStockItems }>(
        '/stock-items',
        { params: Object.fromEntries(params) }
      );

      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch stock items');
    }
  }

  async getStockItemById(id: string): Promise<StockItemRecord> {
    try {
      const response = await apiClient.get<{ success: boolean; data: StockItemRecord }>(
        `/stock-items/${id}`
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch stock item');
    }
  }

  async createStockItem(data: CreateStockItemRequest): Promise<StockItemRecord> {
    try {
      const response = await apiClient.post<{ success: boolean; data: StockItemRecord }>(
        '/stock-items',
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create stock item');
    }
  }

  async updateStockItem(
    id: string,
    data: Partial<CreateStockItemRequest>
  ): Promise<StockItemRecord> {
    try {
      const response = await apiClient.put<{ success: boolean; data: StockItemRecord }>(
        `/stock-items/${id}`,
        data
      );
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update stock item');
    }
  }

  async deleteStockItem(id: string): Promise<void> {
    try {
      await apiClient.delete(`/stock-items/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete stock item');
    }
  }
}

export const stockService = new StockService();
export default stockService;
