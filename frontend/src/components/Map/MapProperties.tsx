// @ts-nocheck
'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import dynamic from 'next/dynamic';
import { Property } from "../../data/properties";
import { PropertyPin } from "./PropertyPin";
import { FiMapPin, FiX, FiPlus, FiTrash2, FiUpload, FiDownload, FiEdit2, FiSave } from "react-icons/fi";
import { Asset } from "../../data/crm-types";
import { customRecordService, type CustomRecord } from "@/services/customRecordService";
import { propertyService } from "@/services/propertyService";
import { brokerService } from "@/services/brokerService";
import { contactService } from "@/services/contactService";
import { landlordService } from "@/services/landlordService";
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { useAuth } from '@/context/AuthContext';
import { consumeNavFocus } from '@/lib/crmNavigation';
import { geocodeAddress, searchPlaces, autocompleteAddress } from '@/lib/nominatim';

const GoogleMapWrapper = dynamic(() => import('./GoogleMapWrapper'), { ssr: false });

interface MapPropertiesProps {
  onPageChange?: (page: string) => void;
}

const OWNERSHIP_STATUS_OPTIONS = ['Owned', 'For Lease', 'For Sale', 'Auction'] as const;

const isForSaleStatus = (status?: string): boolean =>
  ['for sale', 'for_sale'].includes(String(status || '').trim().toLowerCase());

const isForLeaseStatus = (status?: string): boolean =>
  ['for lease', 'for_lease', 'leased'].includes(String(status || '').trim().toLowerCase());

const isAuctionStatus = (status?: string): boolean =>
  String(status || '').trim().toLowerCase() === 'auction';

const shouldAppearInStock = (status?: string): boolean =>
  isForSaleStatus(status) || isForLeaseStatus(status) || isAuctionStatus(status);

const hasPropertyCoordinates = (property?: { latitude?: number; longitude?: number } | null): boolean =>
  Number.isFinite(property?.latitude) && Number.isFinite(property?.longitude);

const normalizeMapPropertyType = (typeValue: unknown): string => {
  const rawType = String(typeValue || '').trim();
  if (!rawType) return 'Unknown';

  const normalized = rawType
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized === 'marketing materials') {
    return 'Unknown';
  }

  return rawType;
};

const toPropertyRecordStatus = (status?: string): string => {
  if (isForSaleStatus(status)) return 'For Sale';
  if (isForLeaseStatus(status)) return 'For Lease';
  if (isAuctionStatus(status)) return 'Auction';

  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'owned') return 'Owned';
  return 'Active';
};

const inferModuleTypeFromOwnershipStatus = (
  status?: string
): 'sales' | 'leasing' | 'auction' => {
  if (isAuctionStatus(status)) return 'auction';
  if (isForLeaseStatus(status)) return 'leasing';
  return 'sales';
};

type FundOption = {
  id: string;
  name: string;
  fundType: 'Listed' | 'Non-Listed';
};

type CompanyOption = {
  id: string;
  name: string;
};

type AssetPayload = {
  propertyName: string;
  propertyAddress: string;
  centreContactNumber: string;
  linkedFundId: string;
  fundType: 'Listed' | 'Non-Listed';
  centerContacts: Asset['centerContacts'];
  leasingStock: Asset['leasingStock'];
  tenants: Asset['tenants'];
};

const ASSET_ENTITY_TYPE = 'asset';

const toAsset = (record: CustomRecord<Record<string, unknown>>): Asset => {
  const payload = (record.payload || {}) as Partial<AssetPayload>;
  return {
    id: record.id,
    propertyName: String(payload.propertyName || record.name || ''),
    propertyAddress: String(payload.propertyAddress || ''),
    centreContactNumber: String(payload.centreContactNumber || ''),
    linkedFundId: String(payload.linkedFundId || record.referenceId || ''),
    fundType: (payload.fundType || (record.category as Asset['fundType']) || 'Listed') as Asset['fundType'],
    latitude: typeof payload.latitude === 'number' ? payload.latitude : undefined,
    longitude: typeof payload.longitude === 'number' ? payload.longitude : undefined,
    squareFeet: typeof payload.squareFeet === 'number' ? payload.squareFeet : undefined,
    centerContacts: Array.isArray(payload.centerContacts) ? payload.centerContacts : [],
    leasingStock: Array.isArray(payload.leasingStock) ? payload.leasingStock : [],
    tenants: Array.isArray(payload.tenants) ? payload.tenants.map(String) : [],
    createdDate: new Date(record.createdAt).toISOString().split('T')[0],
    updatedDate: new Date(record.updatedAt).toISOString().split('T')[0],
  };
};

const normalizeProperty = (raw: any): Property | null => {
  if (!raw) return null;

  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  const normalizedLatitude = Number.isFinite(latitude) ? latitude : undefined;
  const normalizedLongitude = Number.isFinite(longitude) ? longitude : undefined;
  const metadata = raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
    ? raw.metadata
    : {};
  const ownershipStatus = String(
    (metadata as Record<string, unknown>).ownershipStatus ||
      raw.ownershipStatus ||
      (shouldAppearInStock(raw.status) ? toPropertyRecordStatus(raw.status) : 'Owned')
  );

    return {
      id: String(raw.id || `prop-${Date.now()}`),
      assetId: String(raw.assetId || `AST-${Date.now()}`),
    name: String(raw.name || raw.title || (metadata as Record<string, unknown>).displayName || 'Untitled Property'),
    address: String(raw.address || ''),
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
    markerColor: String(raw.markerColor || '#16a34a'),
    details: {
      type: normalizeMapPropertyType(
        raw.details?.type ||
          (metadata as Record<string, unknown>).propertyType ||
          raw.type ||
          'Unknown'
      ),
      squareFeet: Number(raw.details?.squareFeet || (metadata as Record<string, unknown>).squareFeet || 0),
      gla: Number(raw.details?.gla || raw.details?.squareFeet || (metadata as Record<string, unknown>).gla || 0),
      yearBuilt: Number(raw.details?.yearBuilt || (metadata as Record<string, unknown>).yearBuilt || new Date().getFullYear()),
      condition: String(raw.details?.condition || (metadata as Record<string, unknown>).condition || 'Unknown'),
      ownershipStatus,
    },
    linkedDeals: Array.isArray(raw.linkedDeals) ? raw.linkedDeals : [],
    leasingSalesRecords: Array.isArray(raw.leasingSalesRecords) ? raw.leasingSalesRecords : [],
    linkedContacts: Array.isArray(raw.linkedContacts) ? raw.linkedContacts : [],
    linkedCompanyId: raw.linkedCompanyId ? String(raw.linkedCompanyId) : (metadata as Record<string, unknown>).linkedCompanyId ? String((metadata as Record<string, unknown>).linkedCompanyId) : undefined,
    linkedCompanyName: raw.linkedCompanyName ? String(raw.linkedCompanyName) : (metadata as Record<string, unknown>).linkedCompanyName ? String((metadata as Record<string, unknown>).linkedCompanyName) : undefined,
    linkedFundId: raw.linkedFundId ? String(raw.linkedFundId) : (metadata as Record<string, unknown>).linkedFundId ? String((metadata as Record<string, unknown>).linkedFundId) : undefined,
    linkedFundName: raw.linkedFundName ? String(raw.linkedFundName) : (metadata as Record<string, unknown>).linkedFundName ? String((metadata as Record<string, unknown>).linkedFundName) : undefined,
    brokerName: String(raw.brokerName || 'Unassigned'),
    brokerId: raw.brokerId ? String(raw.brokerId) : undefined,
    brokerEmail: raw.brokerEmail ? String(raw.brokerEmail) : undefined,
    centreContacts: Array.isArray(raw.centreContacts) ? raw.centreContacts : undefined,
    rawMetadata:
      raw.rawMetadata && typeof raw.rawMetadata === 'object' ? raw.rawMetadata : undefined,
  };
};

const mapBackendPropertyToMapProperty = (
  raw: any
): Property | null => {
  const metadata = raw?.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
    ? (raw.metadata as Record<string, unknown>)
    : {};
  // Prefer the top-level columns, but fall back to coordinates stored in
  // metadata (some imports only populate metadata) so the pin still appears.
  const latitude = Number(raw?.latitude ?? (metadata as Record<string, unknown>).latitude);
  const longitude = Number(raw?.longitude ?? (metadata as Record<string, unknown>).longitude);

  return normalizeProperty({
    id: raw.id,
    assetId: `AST-${String(raw.id).slice(-6).toUpperCase()}`,
    name: raw.title || (metadata.displayName as string) || raw.address || `Property ${String(raw.id).slice(-6)}`,
    address: raw.address,
    latitude,
    longitude,
    markerColor: '#16a34a',
    details: {
      type: String(metadata.propertyType || raw.type || 'Unknown'),
      squareFeet: Number(metadata.squareFeet || raw.area || 0),
      gla: Number(metadata.gla || raw.area || 0),
      yearBuilt: Number(metadata.yearBuilt || (raw.createdAt ? new Date(raw.createdAt).getFullYear() : new Date().getFullYear())),
      condition: String(metadata.condition || 'Unknown'),
      ownershipStatus: String(metadata.ownershipStatus || raw.status || 'Owned'),
    },
    linkedDeals: Array.isArray(metadata.linkedDeals) ? metadata.linkedDeals : [],
    leasingSalesRecords: Array.isArray(metadata.leasingSalesRecords) ? metadata.leasingSalesRecords : [],
    linkedContacts: Array.isArray(metadata.linkedContacts) ? metadata.linkedContacts : [],
    linkedDocuments: Array.isArray(metadata.linkedDocuments) ? metadata.linkedDocuments : undefined,
    auctionRecords: Array.isArray(metadata.auctionRecords) ? metadata.auctionRecords : undefined,
    linkedCompanyId: metadata.linkedCompanyId ? String(metadata.linkedCompanyId) : undefined,
    linkedCompanyName: metadata.linkedCompanyName ? String(metadata.linkedCompanyName) : undefined,
    linkedFundId: metadata.linkedFundId ? String(metadata.linkedFundId) : undefined,
    linkedFundName: metadata.linkedFundName ? String(metadata.linkedFundName) : undefined,
    registrationNumber: metadata.registrationNumber ? String(metadata.registrationNumber) : undefined,
    registrationName: metadata.registrationName ? String(metadata.registrationName) : undefined,
    ownerName: metadata.ownerName ? String(metadata.ownerName) : undefined,
    ownerEmail: metadata.ownerEmail ? String(metadata.ownerEmail) : undefined,
    ownerContactNumber: metadata.ownerContactNumber ? String(metadata.ownerContactNumber) : undefined,
    rawMetadata: metadata as Record<string, unknown>,
    centreContacts: Array.isArray(metadata.centreContacts)
      ? (metadata.centreContacts as any[])
          .map((c) =>
            c && typeof c === 'object'
              ? {
                  name: String((c as any).name || '').trim(),
                  role: (c as any).role ? String((c as any).role) : undefined,
                  phone: (c as any).phone ? String((c as any).phone) : undefined,
                  email: (c as any).email ? String((c as any).email) : undefined,
                }
              : null
          )
          .filter(Boolean) as Array<{ name: string; role?: string; phone?: string; email?: string }>
      : undefined,
    tenantName: metadata.tenantName ? String(metadata.tenantName) : undefined,
    tenantContactNumber: metadata.tenantContactNumber ? String(metadata.tenantContactNumber) : undefined,
    tenants: Array.isArray(metadata.tenants)
      ? (metadata.tenants as any[])
          .map((t) =>
            t && typeof t === 'object'
              ? {
                  name: String((t as any).name || '').trim(),
                  leaseExpiry: (t as any).leaseExpiry ? String((t as any).leaseExpiry) : undefined,
                  contactNumber: (t as any).contactNumber ? String((t as any).contactNumber) : undefined,
                }
              : null
          )
          .filter((t): t is { name: string; leaseExpiry?: string; contactNumber?: string } =>
            Boolean(t && t.name)
          )
      : undefined,
    brokerName: raw.assignedBrokerName || metadata.assignedBrokerName || 'Unassigned',
    brokerId: raw.assignedBrokerId || raw.brokerId,
  });
};

const MapProperties: React.FC<MapPropertiesProps> = ({ onPageChange }) => {
  const { user } = useAuth();
  const canDeleteProperties = user?.role === 'admin';
  const isGeocodingRef = useRef(false);
  const navFocusConsumedRef = useRef(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showNotification = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);
  const propertyAddressInputRef = useRef<HTMLInputElement | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const zoom = 12;
  const [showAddPropertyModal, setShowAddPropertyModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(false);
  const [expandedPropertyId, setExpandedPropertyId] = useState<string | null>(null);
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [propertyEditForm, setPropertyEditForm] = useState<Record<string, string>>({});
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = (e.currentTarget.closest('[data-panel]') as HTMLElement)?.getBoundingClientRect();
    if (!rect) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top };
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      setPanelPos({ x: dragState.current.originX + dx, y: dragState.current.originY + dy });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  const [fundOptions, setFundOptions] = useState<FundOption[]>([]);
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);
  const [showFundSuggestions, setShowFundSuggestions] = useState(false);
  const [newAsset, setNewAsset] = useState({
    propertyName: "",
    propertyAddress: "",
    centreContactNumber: "",
    linkedFundId: "",
  });
  const [newProperty, setNewProperty] = useState({
    name: "",
    address: "",
    type: "",
    squareFeet: "",
    gla: "",
    yearBuilt: "",
    condition: "",
    ownershipStatus: "",
    latitude: "",
    longitude: "",
    areaName: "",
    anchor: "",
    linkedCompanyId: "",
    linkedCompanyName: "",
    linkedFundId: "",
    linkedFundName: "",
    registrationNumber: "",
    registrationName: "",
    ownerName: "",
    ownerEmail: "",
    ownerContactNumber: "",
    tenantName: "",
    tenantEmail: "",
    tenantContactNumber: "",
  });
  const [newCentreContacts, setNewCentreContacts] = useState<
    Array<{ name: string; role: string; phone: string; email: string }>
  >([]);

  // ── Google Maps-style search state ──────────────────────────────────────
  const [mapSearch, setMapSearch] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [placesResults, setPlacesResults] = useState<Array<{
    id: string; name: string; address: string; lat: number; lng: number; rating?: number;
  }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPlacesResult, setSelectedPlacesResult] = useState<{
    id: string; name: string; address: string; lat: number; lng: number;
  } | null>(null);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [activePanel, setActivePanel] = useState<'search' | 'properties'>('search');
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [focusLocation, setFocusLocation] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mapSearchInputRef = useRef<HTMLInputElement | null>(null);
  // ────────────────────────────────────────────────────────────────────────

  const loadData = React.useCallback(async () => {
    try {
      const [apiResponse, fundResponse, assetResponse, brokerResponse, contactResponse, landlordResponse] = await Promise.all([
        propertyService.getAllProperties({ limit: 10000 }),
        customRecordService.getAllCustomRecords({ entityType: 'fund', limit: 10000 }),
        customRecordService.getAllCustomRecords<AssetPayload>({ entityType: 'asset', limit: 10000 }),
        brokerService.getAllBrokers().catch(() => []),
        contactService.getAllContacts({ limit: 1000 }).catch(() => ({ data: [] })),
        landlordService.getAllLandlords({ limit: 1000 }).catch(() => ({ data: [] })),
      ]);

      const apiProperties = apiResponse.data
        .map((item) => mapBackendPropertyToMapProperty(item))
        .filter((item): item is Property => Boolean(item));
      const nextFundOptions = fundResponse.data.map((record) => ({
        id: record.id,
        name: record.name,
        fundType: ((record.payload as Record<string, unknown>)?.fundType as FundOption['fundType']) || 'Listed',
      }));
      const companyMap = new Map<string, CompanyOption>();
      const addCompanyOption = (
        companyName: unknown,
        companyId: unknown,
        fallbackIdPrefix: string
      ) => {
        const name = String(companyName || '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (companyMap.has(key)) return;
        const derivedId = String(companyId || `${fallbackIdPrefix}:${key.replace(/\s+/g, '-')}`);
        companyMap.set(key, { id: derivedId, name });
      };

      fundResponse.data.forEach((fundRecord) => {
        const payload =
          fundRecord.payload && typeof fundRecord.payload === 'object' && !Array.isArray(fundRecord.payload)
            ? (fundRecord.payload as Record<string, unknown>)
            : {};
        addCompanyOption(
          payload.linkedCompanyName,
          payload.linkedCompanyId,
          `fund-company:${fundRecord.id}`
        );
      });
      brokerResponse.forEach((broker) => {
        addCompanyOption(broker.company, `broker:${broker.id}`, 'company');
      });
      contactResponse.data.forEach((contact) => {
        addCompanyOption(contact.company, `contact:${contact.id}`, 'company');
      });
      landlordResponse.data.forEach((landlord) => {
        addCompanyOption(landlord.name, `landlord:${landlord.id}`, 'company');
      });

      setProperties(apiProperties);
      setFundOptions(nextFundOptions);
      setCompanyOptions(
        Array.from(companyMap.values()).sort((a, b) => a.name.localeCompare(b.name))
      );
      setAssets(assetResponse.data.map((record) => toAsset(record)));
    } catch (error) {
      console.warn('Failed to load properties from API.', error);
      setProperties([]);
      setFundOptions([]);
      setCompanyOptions([]);
      setAssets([]);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useRealtimeRefresh(() => {
    if (!isGeocodingRef.current) {
      void loadData();
    }
  });

  const persistProperties = (next: Property[]) => {
    setProperties(next);
  };

  const syncPropertyToStockIfForSale = (property: Property): boolean =>
    shouldAppearInStock(property.details.ownershipStatus);

  const handleOwnershipStatusChange = async (propertyId: string, nextStatus: string) => {
    const current = properties.find((property) => property.id === propertyId);
    if (!current) return;
    const previousProperties = properties;
    const previousSelectedProperty = selectedProperty;

    const updatedProperty: Property = {
      ...current,
      details: {
        ...current.details,
        ownershipStatus: nextStatus,
      },
    };

    persistProperties(
      properties.map((property) => (property.id === propertyId ? updatedProperty : property))
    );

    if (selectedProperty?.id === propertyId) {
      setSelectedProperty(updatedProperty);
    }

    try {
      const updatedRecord = await propertyService.updateProperty(propertyId, {
        moduleType: inferModuleTypeFromOwnershipStatus(nextStatus),
        status: toPropertyRecordStatus(nextStatus),
        metadata: {
          ...(current as any).metadata,
          ownershipStatus: nextStatus,
          linkedCompanyId: current.linkedCompanyId,
          linkedCompanyName: current.linkedCompanyName,
          linkedFundId: current.linkedFundId,
          linkedFundName: current.linkedFundName,
          propertyType: current.details.type,
          squareFeet: current.details.squareFeet,
          gla: current.details.gla,
          yearBuilt: current.details.yearBuilt,
          condition: current.details.condition,
        },
      });
      const remapped = mapBackendPropertyToMapProperty(updatedRecord);
      if (remapped) {
        persistProperties(
          previousProperties.map((property) => (property.id === propertyId ? remapped : property))
        );
        if (selectedProperty?.id === propertyId) {
          setSelectedProperty(remapped);
        }
        const addedToStock = syncPropertyToStockIfForSale(remapped);
        if (addedToStock) {
          showNotification(`"${remapped.name}" has been synced to stock.`);
        }
      }
    } catch (error) {
      console.warn('Failed to persist ownership status change.', error);
      persistProperties(previousProperties);
      setSelectedProperty(previousSelectedProperty);
    }
  };

  const handleDeleteProperty = async (property: Property) => {
    if (!canDeleteProperties) {
      showNotification('Only admins can delete properties.', 'error');
      return;
    }

    const confirmed = window.confirm(
      `Delete property "${property.name}"?\n\nThis will archive the property and remove it from the active map list.`
    );
    if (!confirmed) return;

    const previousProperties = properties;
    const previousSelectedProperty = selectedProperty;
    const previousExpandedPropertyId = expandedPropertyId;

    persistProperties(properties.filter((item) => item.id !== property.id));
    if (selectedProperty?.id === property.id) {
      setSelectedProperty(null);
    }
    if (expandedPropertyId === property.id) {
      setExpandedPropertyId(null);
    }

    try {
      await propertyService.deleteProperty(property.id);
    } catch (error) {
      console.warn('Failed to delete property from API.', error);
      persistProperties(previousProperties);
      setSelectedProperty(previousSelectedProperty);
      setExpandedPropertyId(previousExpandedPropertyId);
      showNotification(
        `Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    }
  };

  const startEditProperty = (property: Property) => {
    setEditingPropertyId(property.id);
    setPropertyEditForm({
      squareFeet: String(property.details.squareFeet || ''),
      gla: String(property.details.gla ?? property.details.squareFeet ?? ''),
      yearBuilt: String(property.details.yearBuilt || ''),
      condition: property.details.condition || '',
      type: property.details.type || '',
      ownerName: property.ownerName || '',
      ownerEmail: property.ownerEmail || '',
      ownerContactNumber: property.ownerContactNumber || '',
      tenantName: property.tenantName || '',
      tenantContactNumber: property.tenantContactNumber || '',
      registrationNumber: property.registrationNumber || '',
      registrationName: property.registrationName || '',
      linkedCompanyName: property.linkedCompanyName || '',
      linkedFundName: property.linkedFundName || '',
    });
  };

  const handleSavePropertyEdit = async (property: Property) => {
    const form = propertyEditForm;
    const sqm = parseFloat(form.squareFeet) || 0;
    const gla = parseFloat(form.gla) || sqm;

    const updatedMetadata: Record<string, unknown> = {
      ...(property.rawMetadata && typeof property.rawMetadata === 'object' ? property.rawMetadata : {}),
      squareFeet: sqm,
      gla,
      yearBuilt: parseInt(form.yearBuilt) || property.details.yearBuilt,
      condition: form.condition || property.details.condition,
      propertyType: form.type || property.details.type,
      ownerName: form.ownerName || undefined,
      ownerEmail: form.ownerEmail || undefined,
      ownerContactNumber: form.ownerContactNumber || undefined,
      tenantName: form.tenantName || undefined,
      tenantContactNumber: form.tenantContactNumber || undefined,
      registrationNumber: form.registrationNumber || undefined,
      registrationName: form.registrationName || form.linkedCompanyName || undefined,
      linkedCompanyName: form.linkedCompanyName || undefined,
      linkedFundName: form.linkedFundName || undefined,
      ownershipStatus: property.details.ownershipStatus,
    };

    try {
      const updated = await propertyService.updateProperty(property.id, {
        area: sqm,
        type: form.type || property.details.type,
        metadata: updatedMetadata,
      });
      const remapped = mapBackendPropertyToMapProperty(updated);
      if (remapped) {
        setProperties((prev) => prev.map((p) => (p.id === property.id ? remapped : p)));
        if (selectedProperty?.id === property.id) setSelectedProperty(remapped);
      }
      setEditingPropertyId(null);
    } catch (err) {
      showNotification('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error');
    }
  };

  const filteredProperties = useMemo(() => properties, [properties]);

  const mapProperties = useMemo(() => {
    return filteredProperties
      .filter((property) => hasPropertyCoordinates(property))
      .map((property) => ({
        id: property.id,
        assetId: property.assetId,
      name: property.name,
      address: property.address,
      lat: property.latitude,
      lng: property.longitude,
      type:
        isForLeaseStatus(property.details.ownershipStatus) ? 'leasing' : 'sales',
      sqm: property.details.squareFeet,
      gla: property.details.gla ?? property.details.squareFeet,
      markerColor: property.markerColor ?? "#16a34a",
      propertyType: property.details.type,
      yearBuilt: property.details.yearBuilt,
      condition: property.details.condition,
      ownershipStatus: property.details.ownershipStatus,
      linkedCompanyName: property.linkedCompanyName,
      linkedFundName: property.linkedFundName,
      brokerName: property.brokerName,
      linkedDealsCount: property.linkedDeals.length,
      linkedContactsCount: property.linkedContacts?.length ?? 0,
    }));
  }, [filteredProperties]);

  const filteredCompanyOptions = useMemo(() => {
    const query = newProperty.linkedCompanyName.trim().toLowerCase();
    if (!query) return companyOptions.slice(0, 8);
    return companyOptions
      .filter((company) => company.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [companyOptions, newProperty.linkedCompanyName]);

  const filteredFundOptions = useMemo(() => {
    const query = newProperty.linkedFundName.trim().toLowerCase();
    if (!query) return fundOptions.slice(0, 8);
    return fundOptions
      .filter((fund) => fund.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [fundOptions, newProperty.linkedFundName]);

  const fetchAddressGeocode = async (
    address: string
  ): Promise<{ formattedAddress: string; lat: number; lng: number } | null> => {
    const geo = await geocodeAddress(address);
    if (!geo) return null;
    return {
      formattedAddress: geo.formattedAddress || address,
      lat: geo.latitude,
      lng: geo.longitude,
    };
  };

  const focusPropertyOnMap = React.useCallback(
    async (property: Property) => {
      setSelectedProperty(property);
      setShowSearchDropdown(false);
      setMapSearch(property.name);

      if (hasPropertyCoordinates(property)) {
        setFocusLocation({ lat: property.latitude, lng: property.longitude, zoom: 16 });
        return;
      }

      try {
        // No stored coordinates — geocode from the best available text. The exact
        // street number is often missing from OpenStreetMap, so progressively
        // broaden the address (drop the street number, then drop leading segments
        // down to the suburb/city/postcode) and finally try the centre name. This
        // lands the pin near the right place even when the precise address fails.
        const candidates: string[] = [];
        const pushCandidate = (value: string) => {
          const trimmed = value.trim();
          if (trimmed.length > 2 && !candidates.includes(trimmed)) candidates.push(trimmed);
        };

        const addr = String(property.address || '').trim();
        if (addr) {
          pushCandidate(addr);
          pushCandidate(addr.replace(/^\s*\d+[a-zA-Z]?\s+/, '')); // drop a leading street number
          const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
          for (let i = 1; i < parts.length; i += 1) pushCandidate(parts.slice(i).join(', '));
        }
        const name = String(property.name || '').trim();
        if (name && name !== addr) {
          pushCandidate(name);
          if (!/south africa/i.test(name)) pushCandidate(`${name}, South Africa`);
        }

        let geo: { formattedAddress: string; lat: number; lng: number } | null = null;
        for (const candidate of candidates) {
          geo = await fetchAddressGeocode(candidate);
          if (geo) break;
        }

        if (!geo) {
          console.warn(`Could not geocode "${property.name}" — address: ${property.address}`);
          showNotification(
            `Couldn't locate "${property.name}" on the map. Open it and add a street address or set its coordinates.`,
            'error'
          );
          return;
        }

        // Keep the imported address verbatim — only fill in coordinates.
        const updatedProperty: Property = {
          ...property,
          latitude: geo.lat,
          longitude: geo.lng,
        };

        setProperties((prev) =>
          prev.map((item) => (item.id === property.id ? updatedProperty : item))
        );
        setSelectedProperty(updatedProperty);
        setFocusLocation({ lat: geo.lat, lng: geo.lng, zoom: 16 });

        await propertyService.updateProperty(property.id, {
          latitude: geo.lat,
          longitude: geo.lng,
        });
      } catch (error) {
        console.warn('Failed to geocode property for map focus.', error);
      }
    },
    [fetchAddressGeocode]
  );

  // ── Deep-link receiver ───────────────────────────────────────────────────
  // When the Map module is opened with a pending property focus (e.g. from
  // another module), select and pan to that property once it has loaded.
  useEffect(() => {
    if (navFocusConsumedRef.current || properties.length === 0) return;

    const focus = consumeNavFocus('property');
    if (!focus) {
      navFocusConsumedRef.current = true;
      return;
    }

    navFocusConsumedRef.current = true;

    const focusName = String(focus.name || '').trim().toLowerCase();
    const match =
      (focus.id ? properties.find((p) => p.id === focus.id) : undefined) ||
      (focusName
        ? properties.find((p) => p.name.trim().toLowerCase() === focusName)
        : undefined);

    if (match) {
      void focusPropertyOnMap(match);
    }
  }, [properties, focusPropertyOnMap]);
  // ────────────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setNewAsset({
      propertyName: "",
      propertyAddress: "",
      centreContactNumber: "",
      linkedFundId: "",
    });
    setNewProperty({
      name: "",
      address: "",
      type: "",
      squareFeet: "",
      gla: "",
      yearBuilt: "",
      condition: "",
      ownershipStatus: "",
      latitude: "",
      longitude: "",
      areaName: "",
      anchor: "",
      linkedCompanyId: "",
      linkedCompanyName: "",
      linkedFundId: "",
      linkedFundName: "",
      registrationNumber: "",
      registrationName: "",
      ownerName: "",
      ownerEmail: "",
      ownerContactNumber: "",
      tenantName: "",
      tenantEmail: "",
      tenantContactNumber: "",
    });
    setNewCentreContacts([]);
    setShowCompanySuggestions(false);
    setShowFundSuggestions(false);
  };

  // Auto-geocode any properties that have an address but no coordinates.
  // Runs quietly in the background after load so all imported properties
  // appear on the map without the user having to click each one first.
  // Uses Nominatim (OpenStreetMap, free) — throttled internally to 1 req/sec.
  useEffect(() => {
    if (properties.length === 0) return;

    const missing = properties.filter(
      (p) => !hasPropertyCoordinates(p) && p.address && p.address.trim().length > 3
    );
    if (missing.length === 0) return;

    let cancelled = false;

    const geocodeAll = async () => {
      // Suppress realtime loadData() during geocoding to avoid
      // 63 concurrent reload calls flooding the server
      isGeocodingRef.current = true;
      const geocoded: { id: string; lat: number; lng: number }[] = [];

      for (const property of missing) {
        if (cancelled) break;
        try {
          const geo = await geocodeAddress(property.address);
          if (cancelled) break;
          if (!geo) continue;

          // Preserve the imported address verbatim — only fill in coordinates.
          // Nominatim's formatted_address is often less specific than the
          // address the user imported, so overwriting it loses information.
          geocoded.push({ id: property.id, lat: geo.latitude, lng: geo.longitude });

          // Update map state immediately so the pin appears
          setProperties((prev) =>
            prev.map((p) =>
              p.id === property.id
                ? { ...p, latitude: geo.latitude, longitude: geo.longitude }
                : p
            )
          );
        } catch {
          // Skip properties that fail to geocode
        }
      }

      if (cancelled) {
        isGeocodingRef.current = false;
        return;
      }

      // Persist all coordinates in sequence after the loop — one at a time
      // so we only emit a single final realtime refresh instead of N parallel ones
      for (const item of geocoded) {
        if (cancelled) break;
        try {
          await propertyService.updateProperty(item.id, {
            latitude: item.lat,
            longitude: item.lng,
          });
        } catch {
          // Non-critical — coordinates are already shown in state
        }
      }

      isGeocodingRef.current = false;
    };

    void geocodeAll();
    return () => { cancelled = true; isGeocodingRef.current = false; };
  }, [properties.length]);

  // Nominatim-powered address suggestions for the Add Property modal.
  const [addressSuggestions, setAddressSuggestions] = useState<
    Array<{ placeId: string; displayName: string; lat: number; lng: number }>
  >([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const addressSuggestQueryRef = useRef('');

  useEffect(() => {
    if (!showAddPropertyModal) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }

    const q = newProperty.address.trim();
    if (q.length < 4) {
      setAddressSuggestions([]);
      return;
    }
    addressSuggestQueryRef.current = q;
    const handle = setTimeout(async () => {
      const results = await autocompleteAddress(q);
      // Drop the response if the user has typed further since we requested.
      if (addressSuggestQueryRef.current !== q) return;
      setAddressSuggestions(
        results.map((r) => ({
          placeId: r.placeId,
          displayName: r.displayName,
          lat: r.latitude,
          lng: r.longitude,
        }))
      );
      setShowAddressSuggestions(true);
    }, 400);

    return () => clearTimeout(handle);
  }, [newProperty.address, showAddPropertyModal]);

  const applyAddressSuggestion = useCallback(
    (s: { displayName: string; lat: number; lng: number }) => {
      setNewProperty((prev) => ({
        ...prev,
        address: s.displayName,
        latitude: String(s.lat),
        longitude: String(s.lng),
      }));
      setShowAddressSuggestions(false);
    },
    []
  );

  const handleCreateAsset = async () => {
    if (!newAsset.propertyName.trim()) {
      showNotification('Please enter property name', 'error');
      return;
    }
    if (!newAsset.propertyAddress.trim()) {
      showNotification('Please enter property address', 'error');
      return;
    }
    if (!newAsset.linkedFundId) {
      showNotification('Please select a fund to link', 'error');
      return;
    }

    const selectedFund = fundOptions.find((f) => f.id === newAsset.linkedFundId);
    if (!selectedFund) {
      showNotification('Invalid fund selected', 'error');
      return;
    }

    try {
      const createdAsset = await customRecordService.createCustomRecord<AssetPayload>({
        entityType: ASSET_ENTITY_TYPE,
        name: newAsset.propertyName.trim(),
        status: 'active',
        category: selectedFund.fundType,
        referenceId: selectedFund.id,
        payload: {
          propertyName: newAsset.propertyName.trim(),
          propertyAddress: newAsset.propertyAddress.trim(),
          centreContactNumber: newAsset.centreContactNumber.trim(),
          linkedFundId: newAsset.linkedFundId,
          fundType: selectedFund.fundType,
          centerContacts: [],
          leasingStock: [],
          tenants: [],
        },
      });

      setAssets((prev) => [toAsset(createdAsset), ...prev]);
      showNotification(`Property "${newAsset.propertyName}" added successfully!`);
      resetForm();
      setShowAddPropertyModal(false);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : 'Failed to save asset', 'error');
    }
  };

  // ── Google Maps-style search helpers ────────────────────────────────────
  const crmMatches = React.useMemo(() => {
    if (!mapSearch.trim() || mapSearch.length < 2) return [];
    const q = mapSearch.toLowerCase();
    return filteredProperties.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.address?.toLowerCase() ?? '').includes(q)
    ).slice(0, 5);
  }, [mapSearch, filteredProperties]);

  const runTextSearch = React.useCallback(
    async (query: string) => {
      const q = query.trim();
      if (!q) return;
      setIsSearching(true);
      setShowSearchDropdown(false);
      try {
        const results = await searchPlaces(q, { limit: 10 });
        const mapped = results.map((r) => ({
          id: r.placeId,
          name: r.name || r.displayName.split(',')[0] || '',
          address: r.formattedAddress,
          lat: r.latitude,
          lng: r.longitude,
        }));
        setPlacesResults(mapped);
        setActivePanel('search');
        setShowResultsPanel(true);
        if (mapInstance && mapped.length > 0) {
          // mapInstance is a Leaflet L.Map; use its fitBounds.
          const latlngs: Array<[number, number]> = mapped.map((r) => [r.lat, r.lng]);
          mapInstance.fitBounds(latlngs, { padding: [80, 80] });
        }
      } finally {
        setIsSearching(false);
      }
    },
    [mapInstance]
  );

  const clearSearch = React.useCallback(() => {
    setMapSearch('');
    setShowSearchDropdown(false);
    setPlacesResults([]);
    setSelectedPlacesResult(null);
    setShowResultsPanel((prev) => (activePanel === 'search' ? false : prev));
  }, [activePanel]);

  const selectCrmProperty = React.useCallback((property: Property) => {
    void focusPropertyOnMap(property);
  }, [focusPropertyOnMap]);
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-[60] overflow-hidden' : 'relative w-full h-screen overflow-hidden'}>
      {/* ─── Inline notification banner (replaces all alert() dialogs) ─── */}
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          notification.type === 'error'
            ? 'bg-red-600 text-white'
            : 'bg-emerald-600 text-white'
        }`}>
          {notification.message}
          <button onClick={() => setNotification(null)} className="ml-1 opacity-70 hover:opacity-100 text-base leading-none">&times;</button>
        </div>
      )}
      {/* ─── Full-screen map ─────────────────────────────────────── */}
      <div className="absolute inset-0">
        <GoogleMapWrapper
          properties={mapProperties}
          selectedProperty={
            selectedProperty
              ? {
                  id: selectedProperty.id,
                  lat: selectedProperty.latitude,
                  lng: selectedProperty.longitude,
                }
              : null
          }
          zoom={zoom}
          mapTypeId="roadmap"
          enableGoogleMapControls
          enableMapSearch={false}
          searchResultMarkers={placesResults}
          onSearchResultMarkerClick={(m) => {
            setSelectedPlacesResult(m);
            setFocusLocation({ lat: m.lat, lng: m.lng, zoom: 16 });
          }}
          onMapReady={(map) => setMapInstance(map)}
          focusLocation={focusLocation}
          setSelectedProperty={(property) => {
            if (!property) {
              setSelectedProperty(null);
              return;
            }
            const matched = filteredProperties.find((p) => p.id === property.id) || null;
            setSelectedProperty(matched);
          }}
        />
      </div>

      {/* ─── Google Maps-style Search Bar — always visible above the map ─── */}
      <div className="absolute top-4 left-4 z-[1100]" style={{ width: '380px' }}>
        <div className="bg-white rounded-2xl shadow-xl overflow-visible">
          <div className="flex items-center px-4 py-3.5 gap-3">
            {isSearching ? (
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <svg className="w-5 h-5 text-stone-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            <input
              ref={mapSearchInputRef}
              value={mapSearch}
              onChange={(e) => {
                setMapSearch(e.target.value);
                setShowSearchDropdown(e.target.value.length > 1);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && mapSearch.trim()) runTextSearch(mapSearch);
                if (e.key === 'Escape') setShowSearchDropdown(false);
              }}
              onFocus={() => { if (mapSearch.length > 1) setShowSearchDropdown(true); }}
              placeholder="Search for places, e.g. Shoprite Johannesburg"
              className="flex-1 text-sm text-stone-900 placeholder-stone-400 outline-none bg-transparent"
            />
            {mapSearch && (
              <button
                onClick={clearSearch}
                className="text-stone-400 hover:text-stone-600 shrink-0 p-0.5 rounded-full hover:bg-stone-100 transition-colors"
              >
                <FiX size={16} />
              </button>
            )}
          </div>
          {/* Suggestions dropdown */}
          {showSearchDropdown && mapSearch.length > 1 && (
            <div className="border-t border-stone-100 rounded-b-2xl overflow-hidden">
              {crmMatches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectCrmProperty(p)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 text-left transition-colors"
                >
                  <FiMapPin className="text-indigo-500 shrink-0" size={14} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{p.name}</p>
                    <p className="text-xs text-stone-500 truncate">{p.address}</p>
                  </div>
                  <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium shrink-0">CRM</span>
                </button>
              ))}
              <button
                onClick={() => runTextSearch(mapSearch)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left border-t border-stone-100 transition-colors"
              >
                <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-sm text-blue-600">
                  Search Google Maps for &ldquo;<span className="font-semibold">{mapSearch}</span>&rdquo;
                </p>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Results / Properties Panel ─────────────────────────────── */}
      {showResultsPanel && (
        <div
          className="absolute z-[1100] bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col"
          style={{ top: '80px', left: '16px', width: '380px', maxHeight: 'calc(100vh - 100px)' }}
        >
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-semibold text-stone-900 text-sm">
                {activePanel === 'search' ? 'Search Results' : 'My Properties'}
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                {activePanel === 'search'
                  ? `${placesResults.length} place${placesResults.length !== 1 ? 's' : ''} found`
                  : `${filteredProperties.length} propert${filteredProperties.length !== 1 ? 'ies' : 'y'}`}
              </p>
            </div>
            <button
              onClick={() => setShowResultsPanel(false)}
              className="text-stone-400 hover:text-stone-600 p-1.5 rounded-full hover:bg-stone-100 transition-colors"
            >
              <FiX size={15} />
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {/* Google Places results */}
            {activePanel === 'search' && (
              <>
                {placesResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-stone-400">
                    <p className="text-sm">No results found</p>
                  </div>
                ) : (
                  placesResults.map((result, index) => (
                    <button
                      key={result.id}
                      onClick={() => {
                        setSelectedPlacesResult(result);
                        setFocusLocation({ lat: result.lat, lng: result.lng, zoom: 16 });
                      }}
                      className={`w-full flex items-start gap-3 px-4 py-3.5 hover:bg-stone-50 border-b border-stone-50 text-left transition-colors ${
                        selectedPlacesResult?.id === result.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                      }`}
                    >
                      <div className="w-7 h-7 bg-[#EA4335] text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-stone-900 leading-tight">{result.name}</p>
                        <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{result.address}</p>
                        {result.rating && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <span className="text-xs text-amber-500">★</span>
                            <span className="text-xs font-medium text-stone-600">{result.rating}</span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </>
            )}
            {/* CRM Properties list */}
            {activePanel === 'properties' && (
              <>
                {filteredProperties.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-stone-400">
                    <FiMapPin size={28} className="mb-2 opacity-50" />
                    <p className="text-sm">No properties found</p>
                  </div>
                ) : (
                  filteredProperties.map((property) => (
                    <div
                      key={property.id}
                      className={`border-b border-stone-50 transition-all ${
                        selectedProperty?.id === property.id
                          ? 'bg-indigo-50 border-l-4 border-indigo-500'
                          : 'hover:bg-stone-50'
                      }`}
                    >
                      <button
                        onClick={() => {
                          void focusPropertyOnMap(property);
                          setExpandedPropertyId(expandedPropertyId === property.id ? null : property.id);
                        }}
                        className="w-full text-left px-4 py-3.5 flex items-start justify-between gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-stone-900 text-sm leading-tight">{property.name}</h3>
                          <p className="text-xs text-stone-500 mt-0.5 line-clamp-1 flex items-center gap-1">
                            📍 {property.address}
                          </p>
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {!hasPropertyCoordinates(property) && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                No map coordinates
                              </span>
                            )}
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                              {property.details.type}
                            </span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-stone-100 text-stone-600">
                              {property.details.ownershipStatus}
                            </span>
                          </div>
                        </div>
                        <svg
                          className={`w-4 h-4 text-stone-400 mt-1 shrink-0 transition-transform ${expandedPropertyId === property.id ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {expandedPropertyId === property.id && (
                        <div className="px-4 pb-4 bg-white border-t border-stone-100">
                          {/* Edit / Save header */}
                          <div className="flex items-center justify-between mt-3 mb-2">
                            <p className="text-xs font-bold text-stone-600 uppercase tracking-wide">Property Details</p>
                            {editingPropertyId === property.id ? (
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => void handleSavePropertyEdit(property)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 text-white px-2.5 py-1 text-xs font-semibold hover:bg-indigo-700 transition-colors"
                                >
                                  <FiSave size={11} /> Save
                                </button>
                                <button
                                  onClick={() => setEditingPropertyId(null)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 text-stone-600 px-2.5 py-1 text-xs font-semibold hover:bg-stone-50 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditProperty(property)}
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 text-indigo-600 px-2.5 py-1 text-xs font-semibold hover:bg-indigo-50 transition-colors"
                              >
                                <FiEdit2 size={11} /> Edit
                              </button>
                            )}
                          </div>

                          {editingPropertyId === property.id ? (
                            /* ── Edit mode ── */
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-stone-500 font-semibold uppercase">Size (sqm)</label>
                                  <input type="number" value={propertyEditForm.squareFeet || ''} onChange={(e) => setPropertyEditForm((f) => ({ ...f, squareFeet: e.target.value }))} className="w-full border border-stone-200 rounded px-2 py-1 text-sm mt-0.5" placeholder="e.g. 500" />
                                </div>
                                <div>
                                  <label className="text-xs text-stone-500 font-semibold uppercase">GLA (sqm)</label>
                                  <input type="number" value={propertyEditForm.gla || ''} onChange={(e) => setPropertyEditForm((f) => ({ ...f, gla: e.target.value }))} className="w-full border border-stone-200 rounded px-2 py-1 text-sm mt-0.5" placeholder="e.g. 450" />
                                </div>
                                <div>
                                  <label className="text-xs text-stone-500 font-semibold uppercase">Year Built</label>
                                  <input type="number" value={propertyEditForm.yearBuilt || ''} onChange={(e) => setPropertyEditForm((f) => ({ ...f, yearBuilt: e.target.value }))} className="w-full border border-stone-200 rounded px-2 py-1 text-sm mt-0.5" placeholder="e.g. 2010" />
                                </div>
                                <div>
                                  <label className="text-xs text-stone-500 font-semibold uppercase">Condition</label>
                                  <input value={propertyEditForm.condition || ''} onChange={(e) => setPropertyEditForm((f) => ({ ...f, condition: e.target.value }))} className="w-full border border-stone-200 rounded px-2 py-1 text-sm mt-0.5" placeholder="e.g. Good" />
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-stone-500 font-semibold uppercase">Owner Name</label>
                                <input value={propertyEditForm.ownerName || ''} onChange={(e) => setPropertyEditForm((f) => ({ ...f, ownerName: e.target.value }))} className="w-full border border-stone-200 rounded px-2 py-1 text-sm mt-0.5" placeholder="Owner name & surname" />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-stone-500 font-semibold uppercase">Owner Number</label>
                                  <input value={propertyEditForm.ownerContactNumber || ''} onChange={(e) => setPropertyEditForm((f) => ({ ...f, ownerContactNumber: e.target.value }))} className="w-full border border-stone-200 rounded px-2 py-1 text-sm mt-0.5" placeholder="e.g. 0821234567" />
                                </div>
                                <div>
                                  <label className="text-xs text-stone-500 font-semibold uppercase">Owner Email</label>
                                  <input value={propertyEditForm.ownerEmail || ''} onChange={(e) => setPropertyEditForm((f) => ({ ...f, ownerEmail: e.target.value }))} className="w-full border border-stone-200 rounded px-2 py-1 text-sm mt-0.5" placeholder="owner@email.com" />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-stone-500 font-semibold uppercase">Tenant Name</label>
                                  <input value={propertyEditForm.tenantName || ''} onChange={(e) => setPropertyEditForm((f) => ({ ...f, tenantName: e.target.value }))} className="w-full border border-stone-200 rounded px-2 py-1 text-sm mt-0.5" placeholder="Tenant name" />
                                </div>
                                <div>
                                  <label className="text-xs text-stone-500 font-semibold uppercase">Tenant Number</label>
                                  <input value={propertyEditForm.tenantContactNumber || ''} onChange={(e) => setPropertyEditForm((f) => ({ ...f, tenantContactNumber: e.target.value }))} className="w-full border border-stone-200 rounded px-2 py-1 text-sm mt-0.5" placeholder="e.g. 0827654321" />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-stone-500 font-semibold uppercase">Reg. Company Name</label>
                                  <input value={propertyEditForm.linkedCompanyName || ''} onChange={(e) => setPropertyEditForm((f) => ({ ...f, linkedCompanyName: e.target.value }))} className="w-full border border-stone-200 rounded px-2 py-1 text-sm mt-0.5" placeholder="Registered company" />
                                </div>
                                <div>
                                  <label className="text-xs text-stone-500 font-semibold uppercase">Registration No.</label>
                                  <input value={propertyEditForm.registrationNumber || ''} onChange={(e) => setPropertyEditForm((f) => ({ ...f, registrationNumber: e.target.value }))} className="w-full border border-stone-200 rounded px-2 py-1 text-sm mt-0.5" placeholder="e.g. 2023/001234" />
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* ── View mode ── */
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-xs font-semibold text-stone-500 uppercase">Size</p>
                                  <p className="text-sm text-stone-900">{property.details.squareFeet ? `${property.details.squareFeet.toLocaleString()} sqm` : '—'}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-stone-500 uppercase">GLA</p>
                                  <p className="text-sm text-stone-900">{(property.details.gla ?? property.details.squareFeet) ? `${(property.details.gla ?? property.details.squareFeet).toLocaleString()} sqm` : '—'}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-stone-500 uppercase">Year Built</p>
                                  <p className="text-sm text-stone-900">{property.details.yearBuilt || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-stone-500 uppercase">Condition</p>
                                  <p className="text-sm text-stone-900">{property.details.condition || '—'}</p>
                                </div>
                              </div>
                              {(property.ownerName || property.ownerContactNumber || property.ownerEmail) && (
                                <div className="border-t border-stone-100 pt-2">
                                  <p className="text-xs font-bold text-stone-500 uppercase mb-1">Owner</p>
                                  {property.ownerName && <p className="text-sm text-stone-900">{property.ownerName}</p>}
                                  {property.ownerContactNumber && <p className="text-xs text-stone-600">📞 {property.ownerContactNumber}</p>}
                                  {property.ownerEmail && <p className="text-xs text-stone-600">✉️ {property.ownerEmail}</p>}
                                </div>
                              )}
                              {(property.tenantName || property.tenantContactNumber) && (
                                <div className="border-t border-stone-100 pt-2">
                                  <p className="text-xs font-bold text-stone-500 uppercase mb-1">Tenant</p>
                                  {property.tenantName && <p className="text-sm text-stone-900">{property.tenantName}</p>}
                                  {property.tenantContactNumber && <p className="text-xs text-stone-600">📞 {property.tenantContactNumber}</p>}
                                </div>
                              )}
                              {property.centreContacts && property.centreContacts.length > 0 && (
                                <div className="border-t border-stone-100 pt-2">
                                  <p className="text-xs font-bold text-stone-500 uppercase mb-1">Centre Contacts</p>
                                  <div className="space-y-1.5">
                                    {property.centreContacts.map((c, i) => (
                                      <div key={i}>
                                        <p className="text-sm text-stone-900">
                                          {c.name || '—'}
                                          {c.role && <span className="text-stone-500"> · {c.role}</span>}
                                        </p>
                                        {c.phone && <p className="text-xs text-stone-600">📞 {c.phone}</p>}
                                        {c.email && <p className="text-xs text-stone-600">✉️ {c.email}</p>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {(property.linkedCompanyName || property.registrationNumber) && (
                                <div className="border-t border-stone-100 pt-2">
                                  <p className="text-xs font-bold text-stone-500 uppercase mb-1">Registration</p>
                                  {property.linkedCompanyName && <p className="text-sm text-stone-900">{property.linkedCompanyName}</p>}
                                  {property.registrationNumber && <p className="text-xs text-stone-600">Reg No: {property.registrationNumber}</p>}
                                </div>
                              )}
                              {property.linkedFundName && (
                                <div className="border-t border-stone-100 pt-2">
                                  <p className="text-xs font-bold text-stone-500 uppercase mb-1">Linked Fund</p>
                                  <p className="text-sm text-stone-900">{property.linkedFundName}</p>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="mt-3">
                            <p className="text-xs font-semibold text-stone-500 uppercase mb-1">Ownership Status</p>
                            <select
                              value={property.details.ownershipStatus}
                              onChange={(e) => handleOwnershipStatusChange(property.id, e.target.value)}
                              className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              {OWNERSHIP_STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                          </div>
                          {canDeleteProperties && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteProperty(property)}
                              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                            >
                              <FiTrash2 size={12} />
                              Delete Property
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Selected Place Info Card ───────────────────────────────── */}
      {selectedPlacesResult && (
        <div
          className="absolute z-[1100] bg-white rounded-2xl shadow-xl overflow-hidden"
          style={{ bottom: '100px', left: '16px', width: '380px' }}
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-stone-900 text-base leading-tight">{selectedPlacesResult.name}</h3>
                <p className="text-sm text-stone-600 mt-1 line-clamp-2">{selectedPlacesResult.address}</p>
              </div>
              <button
                onClick={() => setSelectedPlacesResult(null)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-100 transition-colors shrink-0"
              >
                <FiX size={16} />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <div className="w-3 h-3 bg-[#EA4335] rounded-full shrink-0" />
              <span className="text-xs text-stone-500">
                {selectedPlacesResult.lat.toFixed(5)}, {selectedPlacesResult.lng.toFixed(5)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── My Properties toggle + Fullscreen (top-right) — always visible ─ */}
      <div className="absolute top-4 right-4 z-[1100] flex items-center gap-2">
        <button
          onClick={() => setIsFullscreen((v) => !v)}
          title={isFullscreen ? 'Exit fullscreen' : 'Expand map fullscreen'}
          className="bg-white text-stone-600 shadow-lg p-2.5 rounded-xl hover:shadow-xl transition-all hover:bg-stone-50"
        >
          {isFullscreen ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0h5m-5 0v5M15 9l5-5m0 0h-5m5 0v5M9 15l-5 5m0 0h5m-5 0v-5M15 15l5 5m0 0h-5m5 0v-5" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" /></svg>
          )}
        </button>
        <button
          onClick={() => {
            const next = activePanel !== 'properties' ? true : !showResultsPanel;
            setActivePanel('properties');
            setShowResultsPanel(next);
          }}
          className="bg-white text-stone-700 shadow-lg px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 hover:shadow-xl transition-all hover:bg-stone-50"
        >
          <FiMapPin size={14} className="text-indigo-600" />
          My Properties
          <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold">
            {filteredProperties.length}
          </span>
        </button>
      </div>

      {selectedProperty && (
        <PropertyPin
          property={selectedProperty}
          onClose={() => setSelectedProperty(null)}
          onPageChange={onPageChange}
          onPropertyUpdate={(updated) => {
            setProperties((prev) =>
              prev.map((p) => (p.id === updated.id ? updated : p))
            );
            setSelectedProperty(updated);
          }}
        />
      )}

      {/* ─── Floating Add Property Button (bottom right) ─────────────── */}
      <div className="absolute bottom-6 right-6 z-[1100] flex gap-3">
        <button
          onClick={() => setShowImportModal(true)}
          className="bg-white hover:bg-stone-50 text-indigo-600 shadow-xl rounded-full h-14 w-14 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          title="Import Properties from CSV"
        >
          <FiUpload size={24} />
        </button>
        <button
          onClick={() => setShowAddPropertyModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl rounded-full h-14 w-14 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          title="Add New Property"
        >
          <FiPlus size={24} />
        </button>
      </div>

      {showAddPropertyModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="text-lg font-semibold text-stone-900">Add New Property</h2>
              <button
                onClick={() => {
                  setShowAddPropertyModal(false);
                  resetForm();
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

              {/* Basic Information */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Basic Information</p>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Property Name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    placeholder="e.g., Downtown Office Complex"
                    value={newProperty.name}
                    onChange={(e) =>
                      setNewProperty({ ...newProperty, name: e.target.value })
                    }
                    className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-stone-700 mb-1">Property Address <span className="text-red-400">*</span></label>
                  <input
                    ref={propertyAddressInputRef}
                    type="text"
                    autoComplete="off"
                    placeholder="e.g., 123 Main Street, Sandton, 2196"
                    value={newProperty.address}
                    onChange={(e) =>
                      setNewProperty({ ...newProperty, address: e.target.value })
                    }
                    onFocus={() => {
                      if (addressSuggestions.length > 0) setShowAddressSuggestions(true);
                    }}
                    onBlur={() => {
                      // Delay so click on a suggestion still fires.
                      setTimeout(() => setShowAddressSuggestions(false), 150);
                    }}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  {showAddressSuggestions && addressSuggestions.length > 0 && (
                    <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
                      {addressSuggestions.map((s) => (
                        <li
                          key={s.placeId}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyAddressSuggestion(s);
                          }}
                          className="cursor-pointer px-3 py-2 text-xs text-stone-700 hover:bg-stone-50"
                        >
                          {s.displayName}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-xs text-stone-400">
                    Start typing to search OpenStreetMap addresses (free, no API key).
                  </p>
                </div>
              </div>

              <div className="border-t border-stone-100" />

              {/* Location */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Location</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Latitude <span className="text-red-400">*</span></label>
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="e.g., 40.7128"
                      value={newProperty.latitude}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, latitude: e.target.value })
                      }
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Longitude <span className="text-red-400">*</span></label>
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="e.g., -74.006"
                      value={newProperty.longitude}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, longitude: e.target.value })
                      }
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-stone-100" />

              {/* Property Details */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Property Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Type <span className="text-red-400">*</span></label>
                    <select
                      value={newProperty.type}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, type: e.target.value })
                      }
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                    >
                      <option value="">Select</option>
                      <option value="Office">Office</option>
                      <option value="Retail">Retail</option>
                      <option value="Residential">Residential</option>
                      <option value="Industrial">Industrial</option>
                      <option value="Flat">Flat</option>
                      <option value="Filling Station">Filling Station</option>
                      <option value="Student Accommodation">Student Accommodation</option>
                      <option value="Land">Land</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Size (sqm) <span className="text-red-400">*</span></label>
                    <input
                      type="number"
                      placeholder="e.g., 50000"
                      value={newProperty.squareFeet}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, squareFeet: e.target.value })
                      }
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">GLA (sqm) <span className="text-red-400">*</span></label>
                    <input
                      type="number"
                      placeholder="e.g., 42000"
                      value={newProperty.gla}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, gla: e.target.value })
                      }
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Year Built</label>
                    <input
                      type="number"
                      placeholder="e.g., 2005"
                      value={newProperty.yearBuilt}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, yearBuilt: e.target.value })
                      }
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Condition <span className="text-red-400">*</span></label>
                    <select
                      value={newProperty.condition}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, condition: e.target.value })
                      }
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                    >
                      <option value="">Select</option>
                      <option value="Excellent">Excellent</option>
                      <option value="Good">Good</option>
                      <option value="Fair">Fair</option>
                      <option value="Poor">Poor</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Area / Suburb</label>
                    <input
                      type="text"
                      placeholder="e.g., Sandton"
                      value={newProperty.areaName}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, areaName: e.target.value })
                      }
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Anchor Tenant</label>
                    <input
                      type="text"
                      placeholder="e.g., Shoprite"
                      value={newProperty.anchor}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, anchor: e.target.value })
                      }
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-stone-100" />

              {/* Owner & Registration */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Owner &amp; Registration</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Registration Number</label>
                    <input
                      type="text"
                      placeholder="e.g., T12345/2005"
                      value={newProperty.registrationNumber}
                      onChange={(e) => setNewProperty({ ...newProperty, registrationNumber: e.target.value })}
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Registration Name</label>
                    <input
                      type="text"
                      placeholder="e.g., John Smith Trust"
                      value={newProperty.registrationName}
                      onChange={(e) => setNewProperty({ ...newProperty, registrationName: e.target.value })}
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 pt-1">Owner Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Owner Name</label>
                    <input
                      type="text"
                      placeholder="e.g., John Smith"
                      value={newProperty.ownerName}
                      onChange={(e) => setNewProperty({ ...newProperty, ownerName: e.target.value })}
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Owner Email</label>
                    <input
                      type="email"
                      placeholder="e.g., owner@email.com"
                      value={newProperty.ownerEmail}
                      onChange={(e) => setNewProperty({ ...newProperty, ownerEmail: e.target.value })}
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Owner Phone Number</label>
                    <input
                      type="tel"
                      placeholder="e.g., +27 82 000 0000"
                      value={newProperty.ownerContactNumber}
                      onChange={(e) => setNewProperty({ ...newProperty, ownerContactNumber: e.target.value })}
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 pt-1">Tenant Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Tenant Name</label>
                    <input
                      type="text"
                      placeholder="e.g., Jane Doe"
                      value={newProperty.tenantName}
                      onChange={(e) => setNewProperty({ ...newProperty, tenantName: e.target.value })}
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Tenant Email</label>
                    <input
                      type="email"
                      placeholder="e.g., tenant@email.com"
                      value={newProperty.tenantEmail}
                      onChange={(e) => setNewProperty({ ...newProperty, tenantEmail: e.target.value })}
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Tenant Phone Number</label>
                    <input
                      type="tel"
                      placeholder="e.g., +27 83 000 0000"
                      value={newProperty.tenantContactNumber}
                      onChange={(e) => setNewProperty({ ...newProperty, tenantContactNumber: e.target.value })}
                      className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Centre Contacts</p>
                  <button
                    type="button"
                    onClick={() =>
                      setNewCentreContacts((prev) => [...prev, { name: "", role: "Centre Manager", phone: "", email: "" }])
                    }
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    + Add contact
                  </button>
                </div>
                {newCentreContacts.length === 0 ? (
                  <p className="text-xs text-stone-400 italic">Add the centre manager and other key contacts for this centre.</p>
                ) : (
                  <div className="space-y-3">
                    {newCentreContacts.map((contact, index) => (
                      <div key={index} className="rounded-lg border border-stone-200 p-3 space-y-2 bg-stone-50/60">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Name & surname"
                            value={contact.name}
                            onChange={(e) =>
                              setNewCentreContacts((prev) =>
                                prev.map((c, i) => (i === index ? { ...c, name: e.target.value } : c))
                              )
                            }
                            className="flex-1 min-w-0 border border-stone-200 rounded-lg px-3 py-2 text-stone-900 placeholder-stone-400 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => setNewCentreContacts((prev) => prev.filter((_, i) => i !== index))}
                            title="Remove contact"
                            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          >
                            ×
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Role (e.g. Centre Manager)"
                          value={contact.role}
                          onChange={(e) =>
                            setNewCentreContacts((prev) =>
                              prev.map((c, i) => (i === index ? { ...c, role: e.target.value } : c))
                            )
                          }
                          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-stone-900 placeholder-stone-400 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="tel"
                            placeholder="Contact number"
                            value={contact.phone}
                            onChange={(e) =>
                              setNewCentreContacts((prev) =>
                                prev.map((c, i) => (i === index ? { ...c, phone: e.target.value } : c))
                              )
                            }
                            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-stone-900 placeholder-stone-400 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <input
                            type="email"
                            placeholder="Email address"
                            value={contact.email}
                            onChange={(e) =>
                              setNewCentreContacts((prev) =>
                                prev.map((c, i) => (i === index ? { ...c, email: e.target.value } : c))
                              )
                            }
                            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-stone-900 placeholder-stone-400 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-stone-100" />

              {/* Links & Associations */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Links &amp; Associations</p>
                <div className="relative">
                  <label className="block text-sm font-medium text-stone-700 mb-1">Linked Company Name</label>
                  <input
                    type="text"
                    placeholder="Search CRM company..."
                    value={newProperty.linkedCompanyName}
                    onChange={(e) => {
                      setNewProperty({
                        ...newProperty,
                        linkedCompanyId: "",
                        linkedCompanyName: e.target.value,
                      });
                      setShowCompanySuggestions(true);
                    }}
                    onFocus={() => setShowCompanySuggestions(true)}
                    onBlur={() => {
                      setTimeout(() => setShowCompanySuggestions(false), 150);
                    }}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  {showCompanySuggestions && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                      {filteredCompanyOptions.length > 0 ? (
                        filteredCompanyOptions.map((company) => (
                          <button
                            key={company.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setNewProperty({
                                ...newProperty,
                                linkedCompanyId: company.id,
                                linkedCompanyName: company.name,
                              });
                              setShowCompanySuggestions(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 border-b border-stone-100 last:border-b-0"
                          >
                            {company.name}
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-xs text-stone-500">
                          No matching CRM company found.
                        </p>
                      )}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-stone-400">
                    {newProperty.linkedCompanyId ? "Company linked." : "Select an existing CRM company to link this property."}
                  </p>
                </div>

                <div className="mt-3 relative">
                  <label className="block text-sm font-medium text-stone-700 mb-1">Linked Fund Name</label>
                  <input
                    type="text"
                    placeholder="Search Property Funds..."
                    value={newProperty.linkedFundName}
                    onChange={(e) => {
                      setNewProperty({
                        ...newProperty,
                        linkedFundId: "",
                        linkedFundName: e.target.value,
                      });
                      setShowFundSuggestions(true);
                    }}
                    onFocus={() => setShowFundSuggestions(true)}
                    onBlur={() => {
                      setTimeout(() => setShowFundSuggestions(false), 150);
                    }}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  {showFundSuggestions && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                      {filteredFundOptions.length > 0 ? (
                        filteredFundOptions.map((fund) => (
                          <button
                            key={fund.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setNewProperty({
                                ...newProperty,
                                linkedFundId: fund.id,
                                linkedFundName: fund.name,
                              });
                              setShowFundSuggestions(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 border-b border-stone-100 last:border-b-0"
                          >
                            {fund.name}
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-xs text-stone-500">
                          No matching fund found in CRM Property Funds.
                        </p>
                      )}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-stone-400">
                    {newProperty.linkedFundId ? "Fund linked." : "Select an existing CRM fund to link this property."}
                  </p>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-stone-100">
              <button
                onClick={() => {
                  setShowAddPropertyModal(false);
                  resetForm();
                }}
                className="flex-1 px-4 py-2.5 border border-stone-200 rounded-lg text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!newProperty.name.trim()) {
                    showNotification('Please enter property name', 'error');
                    return;
                  }
                  if (!newProperty.address.trim()) {
                    showNotification('Please enter property address', 'error');
                    return;
                  }
                  if (!newProperty.type) {
                    showNotification('Please select property type', 'error');
                    return;
                  }
                  if (!newProperty.squareFeet) {
                    showNotification('Please enter property size', 'error');
                    return;
                  }
                  if (!newProperty.gla) {
                    showNotification('Please enter GLA', 'error');
                    return;
                  }
                  if (!newProperty.condition) {
                    showNotification('Please select condition', 'error');
                    return;
                  }
                  const linkedCompanyQuery = newProperty.linkedCompanyName.trim();
                  const linkedFundQuery = newProperty.linkedFundName.trim();
                  const selectedCompany = newProperty.linkedCompanyId
                    ? companyOptions.find((company) => company.id === newProperty.linkedCompanyId)
                    : companyOptions.find(
                        (company) => company.name.toLowerCase() === linkedCompanyQuery.toLowerCase()
                      );
                  const selectedFund = newProperty.linkedFundId
                    ? fundOptions.find((fund) => fund.id === newProperty.linkedFundId)
                    : fundOptions.find(
                        (fund) => fund.name.toLowerCase() === linkedFundQuery.toLowerCase()
                      );

                  if (linkedCompanyQuery && !selectedCompany) {
                    showNotification('Please select a valid linked company from CRM suggestions.', 'error');
                    return;
                  }

                  if (linkedFundQuery && !selectedFund) {
                    showNotification('Please select a valid linked fund from CRM Property Funds suggestions.', 'error');
                    return;
                  }

                  const linkedCompanyId = selectedCompany?.id || undefined;
                  const linkedCompanyName = selectedCompany?.name || undefined;
                  const linkedFundId = selectedFund?.id || undefined;
                  const linkedFundName = selectedFund?.name || undefined;

                  let resolvedLat: number | null = null;
                  let resolvedLng: number | null = null;
                  let resolvedAddress = newProperty.address.trim();

                  try {
                    const geo = await fetchAddressGeocode(newProperty.address.trim());
                    if (geo) {
                      resolvedLat = geo.lat;
                      resolvedLng = geo.lng;
                      resolvedAddress = geo.formattedAddress;
                    }
                  } catch (error) {
                    console.warn('Address geocode during add failed:', error);
                  }

                  if (resolvedLat === null || resolvedLng === null) {
                    if (!newProperty.latitude || !newProperty.longitude) {
                      showNotification('Could not resolve address. Please enter valid coordinates.', 'error');
                      return;
                    }
                    resolvedLat = parseFloat(newProperty.latitude);
                    resolvedLng = parseFloat(newProperty.longitude);
                  }

                  if (!Number.isFinite(resolvedLat) || !Number.isFinite(resolvedLng)) {
                    showNotification('Please enter valid latitude and longitude', 'error');
                    return;
                  }

                  let createdProperty;
                  try {
                    createdProperty = await propertyService.createProperty({
                      title: newProperty.name.trim(),
                      description: 'Property added from the map screen.',
                      address: resolvedAddress,
                      city: '',
                      province: '',
                      postalCode: '',
                      type: newProperty.type,
                      moduleType: inferModuleTypeFromOwnershipStatus(newProperty.ownershipStatus),
                      status: toPropertyRecordStatus(newProperty.ownershipStatus),
                      price: 0,
                      area: parseInt(newProperty.squareFeet),
                      latitude: resolvedLat,
                      longitude: resolvedLng,
                      metadata: {
                        displayName: newProperty.name.trim(),
                        ownershipStatus: newProperty.ownershipStatus,
                        linkedCompanyId,
                        linkedCompanyName,
                        linkedFundId,
                        linkedFundName,
                        propertyType: newProperty.type,
                        squareFeet: parseInt(newProperty.squareFeet),
                        gla: parseInt(newProperty.gla),
                        yearBuilt: parseInt(newProperty.yearBuilt),
                        condition: newProperty.condition,
                        areaName: newProperty.areaName.trim() || undefined,
                        anchor: newProperty.anchor.trim() || undefined,
                        registrationNumber: newProperty.registrationNumber.trim() || undefined,
                        registrationName: newProperty.registrationName.trim() || undefined,
                        ownerName: newProperty.ownerName.trim() || undefined,
                        ownerEmail: newProperty.ownerEmail.trim() || undefined,
                        ownerContactNumber: newProperty.ownerContactNumber.trim() || undefined,
                        tenantName: newProperty.tenantName.trim() || undefined,
                        tenantEmail: newProperty.tenantEmail.trim() || undefined,
                        tenantContactNumber: newProperty.tenantContactNumber.trim() || undefined,
                        centreContacts: newCentreContacts
                          .map((c) => ({
                            name: c.name.trim(),
                            role: c.role.trim(),
                            phone: c.phone.trim(),
                            email: c.email.trim(),
                          }))
                          .filter((c) => c.name || c.role || c.phone || c.email),
                      },
                    });
                  } catch (error) {
                    showNotification(
                      `Failed to save property: ${error instanceof Error ? error.message : String(error)}`,
                      'error'
                    );
                    return;
                  }

                  const newProp: Property = {
                    id: createdProperty.id,
                    assetId: `AST-${String(createdProperty.id).slice(-6).toUpperCase()}`,
                    name: newProperty.name,
                    address: createdProperty.address || resolvedAddress,
                    latitude: Number.isFinite(createdProperty.latitude)
                      ? Number(createdProperty.latitude)
                      : resolvedLat,
                    longitude: Number.isFinite(createdProperty.longitude)
                      ? Number(createdProperty.longitude)
                      : resolvedLng,
                    markerColor: "#16a34a",
                    details: {
                      type: createdProperty.type || newProperty.type,
                      squareFeet: parseInt(newProperty.squareFeet),
                      gla: parseInt(newProperty.gla),
                      yearBuilt: parseInt(newProperty.yearBuilt),
                      condition: newProperty.condition,
                      ownershipStatus: newProperty.ownershipStatus,
                    },
                    linkedDeals: [],
                    leasingSalesRecords: [],
                    linkedContacts: [],
                    linkedCompanyId,
                    linkedCompanyName,
                    linkedFundId,
                    linkedFundName,
                    brokerName: createdProperty.assignedBrokerName || "Unassigned",
                    brokerId: createdProperty.assignedBrokerId || createdProperty.brokerId,
                    registrationNumber: newProperty.registrationNumber.trim() || undefined,
                    registrationName: newProperty.registrationName.trim() || undefined,
                    ownerName: newProperty.ownerName.trim() || undefined,
                    ownerEmail: newProperty.ownerEmail.trim() || undefined,
                    ownerContactNumber: newProperty.ownerContactNumber.trim() || undefined,
                    tenantName: newProperty.tenantName.trim() || undefined,
                    tenantEmail: newProperty.tenantEmail.trim() || undefined,
                    tenantContactNumber: newProperty.tenantContactNumber.trim() || undefined,
                  };

                  const next = [newProp, ...properties];
                  persistProperties(next);
                  setSelectedProperty(newProp);
                  syncPropertyToStockIfForSale(newProp);
                  setShowAddPropertyModal(false);
                  resetForm();
                  showNotification(`Property "${newProperty.name}" added successfully.`);
                }}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                <FiPlus size={16} />
                Add Property
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Import Properties Modal ─────────────────────────────────────── */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="text-lg font-semibold text-stone-900">Import Properties from Excel / CSV</h2>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportResult(null);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 font-medium mb-2">Supported Formats: Excel (.xlsx, .xls) or CSV</p>
                <p className="text-xs text-blue-700 mb-1">
                  Column headers are <strong>case-insensitive</strong> — your canvassing sheet will work as-is.
                </p>
                <p className="text-xs text-blue-700">
                  Recognised columns include: <strong>Property Name</strong> / Building Name, <strong>Physical Address</strong> / Address / Street Address,
                  <strong> Suburb</strong> / City, Province / Region, <strong>Size (sqm)</strong> / GLA / GLA (m²) / Extent,
                  <strong> Owner Name &amp; Surname</strong> / Landlord / Owner,
                  <strong> Owner Number</strong> / Landlord Tel / Owner Cell,
                  Email, <strong>Tenants No.</strong> / Tenant Name, <strong>Registers Company Name</strong> / Company,
                  <strong> Registration No.</strong> / Reg No., Google Link, Notes / Comments, Status / Ownership Status.
                </p>
              </div>

              {/* Download Template */}
              <button
                onClick={() => {
                  const csv = 'Property Name,Physical Address,Suburb,Province,Property Type,Ownership Status,Size (sqm),GLA (m²),Owner Name & Surname,Owner Number,Email,Tenant Name,Tenants No.,Registers Company Name,Registration No.,Google Link,Notes\n"Sample Building","123 Main Street","Sandton","Gauteng","Commercial","Owned",1200,800,"John Smith","0821234567","john@example.com","ABC Tenant","0827654321","Sample Company (Pty) Ltd","2023/001234","https://maps.google.com/?q=-26.1,28.0","Sample note"';
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'canvassing_import_template.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
              >
                <FiDownload size={16} />
                Download Canvassing Template
              </button>

              {/* File Input */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Select Excel or CSV File</label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setIsImporting(true);
                      try {
                        const result = await propertyService.importProperties(file, 'sales');
                        setImportResult({
                          success: result.success,
                          failed: result.failed,
                          errors: result.errors || [],
                        });
                        await loadData();
                      } catch (err) {
                        alert('Import failed: ' + (err as Error).message);
                      } finally {
                        setIsImporting(false);
                        e.target.value = '';
                      }
                    }
                  }}
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              {/* Import Progress/Result */}
              {isImporting && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-3 text-sm text-stone-600">Importing properties...</span>
                </div>
              )}

              {/* Import Result */}
              {importResult && (
                <div className={`border rounded-lg p-4 ${importResult.failed === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                  <p className={`text-sm font-medium ${importResult.failed === 0 ? 'text-green-800' : 'text-amber-800'}`}>
                    Import Complete: {importResult.success} succeeded, {importResult.failed} failed
                  </p>
                  {importResult.errors.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto">
                      <p className="text-xs text-amber-700 font-medium">Errors:</p>
                      {importResult.errors.slice(0, 5).map((err, i) => (
                        <p key={i} className="text-xs text-amber-600">{err}</p>
                      ))}
                      {importResult.errors.length > 5 && (
                        <p className="text-xs text-amber-600">...and {importResult.errors.length - 5} more</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-stone-100">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportResult(null);
                }}
                className="flex-1 px-4 py-2.5 border border-stone-200 rounded-lg text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapProperties;


