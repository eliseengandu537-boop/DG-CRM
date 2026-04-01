// @ts-nocheck
'use client';

import React, { useState, useMemo } from "react";
import { useEffect } from "react";
import dynamic from 'next/dynamic';
import { Property } from "../../data/properties";
import { PropertyPin } from "./PropertyPin";
import { FiMapPin, FiX, FiPlus, FiTrash2 } from "react-icons/fi";
import { Asset } from "../../data/crm-types";
import { customRecordService, type CustomRecord } from "@/services/customRecordService";
import { propertyService } from "@/services/propertyService";
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { useAuth } from '@/context/AuthContext';

const GoogleMapWrapper = dynamic(() => import('./GoogleMapWrapper'), { ssr: false });

interface MapPropertiesProps {
  onPageChange?: (page: string) => void;
}

const OWNERSHIP_STATUS_OPTIONS = ['Owned', 'For Lease', 'Mortgaged', 'For Sale', 'Auction'] as const;

const isForSaleStatus = (status?: string): boolean =>
  ['for sale', 'for_sale'].includes(String(status || '').trim().toLowerCase());

const isForLeaseStatus = (status?: string): boolean =>
  ['for lease', 'for_lease', 'leased'].includes(String(status || '').trim().toLowerCase());

const isAuctionStatus = (status?: string): boolean =>
  String(status || '').trim().toLowerCase() === 'auction';

const shouldAppearInStock = (status?: string): boolean =>
  isForSaleStatus(status) || isForLeaseStatus(status) || isAuctionStatus(status);

const toPropertyRecordStatus = (status?: string): string => {
  if (isForSaleStatus(status)) return 'For Sale';
  if (isForLeaseStatus(status)) return 'For Lease';
  if (isAuctionStatus(status)) return 'Auction';

  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'mortgaged') return 'Mortgaged';
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
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
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
    latitude,
    longitude,
    markerColor: String(raw.markerColor || '#16a34a'),
    details: {
      type: String(raw.details?.type || (metadata as Record<string, unknown>).propertyType || raw.type || 'Unknown'),
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
  };
};

const mapBackendPropertyToMapProperty = (
  raw: any
): Property | null => {
  const latitude = Number(raw?.latitude);
  const longitude = Number(raw?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const metadata = raw?.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
    ? (raw.metadata as Record<string, unknown>)
    : {};

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
    linkedDeals: [],
    leasingSalesRecords: [],
    linkedContacts: [],
    linkedCompanyId: metadata.linkedCompanyId ? String(metadata.linkedCompanyId) : undefined,
    linkedCompanyName: metadata.linkedCompanyName ? String(metadata.linkedCompanyName) : undefined,
    linkedFundId: metadata.linkedFundId ? String(metadata.linkedFundId) : undefined,
    linkedFundName: metadata.linkedFundName ? String(metadata.linkedFundName) : undefined,
    brokerName: raw.assignedBrokerName || metadata.assignedBrokerName || 'Unassigned',
    brokerId: raw.assignedBrokerId || raw.brokerId,
  });
};

const MapProperties: React.FC<MapPropertiesProps> = ({ onPageChange }) => {
  const { user } = useAuth();
  const canDeleteProperties = user?.role === 'admin';
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const zoom = 12;
  const [showAddPropertyModal, setShowAddPropertyModal] = useState(false);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(false);
  const [expandedPropertyId, setExpandedPropertyId] = useState<string | null>(null);
  const [fundOptions, setFundOptions] = useState<FundOption[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
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
    linkedCompanyName: "",
    linkedFundName: "",
  });

  const loadData = React.useCallback(async () => {
    try {
      const [apiResponse, fundResponse, assetResponse] = await Promise.all([
        propertyService.getAllProperties({ limit: 500 }),
        customRecordService.getAllCustomRecords({ entityType: 'fund', limit: 500 }),
        customRecordService.getAllCustomRecords<AssetPayload>({ entityType: 'asset', limit: 500 }),
      ]);

      const apiProperties = apiResponse.data
        .map((item) => mapBackendPropertyToMapProperty(item))
        .filter((item): item is Property => Boolean(item));
      setProperties(apiProperties);
      setFundOptions(
        fundResponse.data.map((record) => ({
          id: record.id,
          name: record.name,
          fundType: ((record.payload as Record<string, unknown>)?.fundType as FundOption['fundType']) || 'Listed',
        }))
      );
      setAssets(assetResponse.data.map((record) => toAsset(record)));
    } catch (error) {
      console.warn('Failed to load properties from API.', error);
      setProperties([]);
      setFundOptions([]);
      setAssets([]);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useRealtimeRefresh(() => {
    void loadData();
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
          alert(`"${remapped.name}" has been synced to stock automatically.`);
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
      alert('Only admins can delete properties from the Maps module.');
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
      alert(`"${property.name}" was deleted successfully.`);
    } catch (error) {
      console.warn('Failed to delete property from API.', error);
      persistProperties(previousProperties);
      setSelectedProperty(previousSelectedProperty);
      setExpandedPropertyId(previousExpandedPropertyId);
      alert(
        `Failed to delete property: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  };

  const filteredProperties = useMemo(() => properties, [properties]);

  const mapProperties = useMemo(() => {
    return filteredProperties
      .filter((property) => Number.isFinite(property.latitude) && Number.isFinite(property.longitude))
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

  const fetchAddressGeocode = async (
    address: string
  ): Promise<{ formattedAddress: string; lat: number; lng: number } | null> => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new Error('Google Maps API key is missing.');
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address
    )}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data?.results?.length) return null;

    const topResult = data.results[0];
    const lat = topResult.geometry?.location?.lat;
    const lng = topResult.geometry?.location?.lng;
    const formattedAddress = topResult.formatted_address || address;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;

    return { formattedAddress, lat, lng };
  };

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
      linkedCompanyName: "",
      linkedFundName: "",
    });
  };

  const handleCreateAsset = async () => {
    if (!newAsset.propertyName.trim()) {
      alert("Please enter property name");
      return;
    }
    if (!newAsset.propertyAddress.trim()) {
      alert("Please enter property address");
      return;
    }
    if (!newAsset.linkedFundId) {
      alert("Please select a fund to link");
      return;
    }

    const selectedFund = fundOptions.find((f) => f.id === newAsset.linkedFundId);
    if (!selectedFund) {
      alert("Invalid fund selected");
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
      alert(`Property "${newAsset.propertyName}" added successfully!`);
      resetForm();
      setShowAddPropertyModal(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save asset");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 relative">
      {/* Header */}
      <div className="bg-white shadow-md px-6 py-4 z-10">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowPropertiesPanel(!showPropertiesPanel)}
            className="flex items-center gap-2 bg-white text-stone-700 border border-stone-300 hover:border-stone-400 px-4 py-2 rounded-lg font-medium transition-all"
          >
            Properties
          </button>
          <button
            onClick={() => setShowAddPropertyModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg transition-colors font-medium shadow-md whitespace-nowrap"
          >
            <FiPlus size={20} />
            Add Property
          </button>
        </div>
        <p className="text-xs text-stone-500 mt-3">
          Use the single search bar inside the map to find any external place and exact Google address.
        </p>
      </div>

      {/* Main Map Area */}
      <div className="flex-1 relative overflow-hidden">
        <div className="w-full h-full bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-stone-200 p-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FiMapPin className="text-indigo-600 w-5 h-5" />
              <span className="font-semibold text-stone-900">Interactive Map</span>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
                {filteredProperties.length} properties
              </span>
            </div>

            <p className="text-xs text-stone-600">
              Google controls are active on the map itself.
            </p>
          </div>

          <div className="flex-1 relative overflow-hidden min-h-[530px]">
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
              enableMapSearch
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

          <div className="bg-stone-50 border-t border-stone-200 px-4 py-3 text-xs text-stone-600">
            <div className="flex items-center gap-2">
              <span>Google Maps Mode</span>
              <span className="ml-auto">Live place search, traffic, transit, and marker interactions are enabled.</span>
            </div>
            <p className="text-xs mt-2">Use the search bar for live Google place results and click any marker for property details.</p>
          </div>
        </div>

        {/* Floating Properties Panel - Left Side */}
        {showPropertiesPanel && (
          <div className="fixed left-4 bottom-24 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[600px] z-20 transition-all duration-300 ease-out">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 border-b border-indigo-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                    <FiMapPin className="text-white w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-base">Properties</h2>
                    <p className="text-xs text-indigo-100">{filteredProperties.length} total</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPropertiesPanel(false)}
                  className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-all duration-200"
                >
                  <FiX size={20} />
                </button>
              </div>
            </div>

            {/* Properties List */}
            <div className="overflow-y-auto flex-1">
              {filteredProperties.length > 0 ? (
                <div className="divide-y divide-gray-200">
                  {filteredProperties.map((property) => (
                    <div
                      key={property.id}
                      className={`transition-all duration-200 ${
                        selectedProperty?.id === property.id ? "bg-indigo-50 border-l-4 border-indigo-600" : "hover:bg-gray-50 border-l-4 border-transparent"
                      }`}
                    >
                      <button
                        onClick={() => {
                          setSelectedProperty(property);
                          setExpandedPropertyId(expandedPropertyId === property.id ? null : property.id);
                        }}
                        className="w-full text-left p-4 flex items-start justify-between gap-3 group"
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 text-sm mb-1 group-hover:text-indigo-600 transition-colors">
                            {property.name}
                          </h3>
                          <p className="text-xs text-gray-600 line-clamp-1 flex items-center gap-1">
                            📍 {property.address}
                          </p>
                          <div className="flex gap-2 mt-2">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                              {property.details.type}
                            </span>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              {property.assetId}
                            </span>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <div className={`transform transition-transform duration-200 ${expandedPropertyId === property.id ? "rotate-180" : ""}`}>
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                          </div>
                        </div>
                      </button>

                      {/* Expanded Details */}
                      {expandedPropertyId === property.id && (
                        <div className="px-4 pb-4 bg-white border-t border-gray-200 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-xs font-semibold text-gray-600 uppercase">Size</p>
                                <p className="text-sm font-medium text-gray-900">{property.details.squareFeet.toLocaleString()} sqm</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-600 uppercase">GLA</p>
                                <p className="text-sm font-medium text-gray-900">{(property.details.gla ?? property.details.squareFeet).toLocaleString()} sqm</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-600 uppercase">Year Built</p>
                                <p className="text-sm font-medium text-gray-900">{property.details.yearBuilt}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-600 uppercase">Condition</p>
                                <p className="text-sm font-medium text-gray-900">{property.details.condition}</p>
                              </div>
                              <div className="col-span-2">
                                <p className="text-xs font-semibold text-gray-600 uppercase">Status</p>
                                <select
                                  value={property.details.ownershipStatus}
                                  onChange={(event) =>
                                    handleOwnershipStatusChange(property.id, event.target.value)
                                  }
                                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm font-medium text-gray-900"
                                >
                                  {OWNERSHIP_STATUS_OPTIONS.map((status) => (
                                    <option key={status} value={status}>
                                      {status}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-600 uppercase">Latitude</p>
                                <p className="text-sm font-medium text-gray-900">{property.latitude.toFixed(6)}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-600 uppercase">Longitude</p>
                                <p className="text-sm font-medium text-gray-900">{property.longitude.toFixed(6)}</p>
                              </div>
                            </div>
                            <div className="border-t border-gray-200 pt-3">
                              <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Assigned Broker</p>
                              <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                👤 {property.brokerName}
                              </p>
                            </div>
                            <div className="border-t border-gray-200 pt-3">
                              {canDeleteProperties ? (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteProperty(property)}
                                  className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                                >
                                  <FiTrash2 size={14} />
                                  Delete Property
                                </button>
                              ) : (
                                <p className="text-xs font-medium text-gray-500">
                                  Only admins can delete properties.
                                </p>
                              )}
                            </div>
                            {property.linkedDeals.length > 0 && (
                              <div className="border-t border-gray-200 pt-3">
                                <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Deals</p>
                                <div className="space-y-1">
                                  {property.linkedDeals.map((deal) => (
                                    <div key={deal.id} className="text-xs text-gray-700 flex items-center gap-2">
                                      <span className="inline-block w-2 h-2 bg-indigo-600 rounded-full"></span>
                                      {deal.dealName}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                  <FiMapPin size={32} className="mb-2 opacity-50" />
                  <p className="text-sm font-medium">No properties found</p>
                  <p className="text-xs mt-1">Try adjusting your search</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 border-t border-gray-200 px-6 py-3">
              <p className="text-xs text-gray-600 text-center">Click a property to view details</p>
            </div>
          </div>
        )}

        {/* Layers Panel - Bottom Left */}
        <div className="fixed left-4 bottom-4 bg-white rounded-lg shadow-lg border border-stone-200 px-3 py-2 hidden">
          <button className="flex items-center gap-2 text-sm font-medium text-stone-700 hover:text-stone-900">
            🗂️ Layers
          </button>
        </div>
      </div>

      {selectedProperty && (
        <PropertyPin
          property={selectedProperty}
          onClose={() => setSelectedProperty(null)}
          onPageChange={onPageChange}
        />
      )}

      {showAddPropertyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-stone-950 flex items-center gap-2">
                <FiPlus className="text-indigo-600" />
                Add New Property
              </h2>
              <button
                onClick={() => {
                  setShowAddPropertyModal(false);
                  resetForm();
                }}
                className="text-stone-500 hover:text-stone-700"
              >
                <FiX size={24} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Basic Information Section */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-stone-900 mb-3">Basic Information</h3>
                
                <div>
                  <label className="block text-sm font-medium text-stone-900 mb-1">
                    Property Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Downtown Office Complex"
                    value={newProperty.name}
                    onChange={(e) =>
                      setNewProperty({ ...newProperty, name: e.target.value })
                    }
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="mt-3">
                  <label className="block text-sm font-medium text-stone-900 mb-1">
                    Property Address *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 123 Main Street, New York, NY 10001"
                    value={newProperty.address}
                    onChange={(e) =>
                      setNewProperty({ ...newProperty, address: e.target.value })
                    }
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Location Details Section */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-stone-900 mb-3">Location Details</h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-900 mb-1">
                      Latitude *
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="e.g., 40.7128"
                      value={newProperty.latitude}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, latitude: e.target.value })
                      }
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-900 mb-1">
                      Longitude *
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="e.g., -74.006"
                      value={newProperty.longitude}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, longitude: e.target.value })
                      }
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
              </div>

              {/* Property Details Section */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-stone-900 mb-3">Property Details</h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-900 mb-1">
                      Property Type *
                    </label>
                    <select
                      value={newProperty.type}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, type: e.target.value })
                      }
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">-- Select --</option>
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
                    <label className="block text-sm font-medium text-stone-900 mb-1">
                      Size (sqm) *
                    </label>
                    <input
                      type="number"
                      placeholder="e.g., 50000"
                      value={newProperty.squareFeet}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, squareFeet: e.target.value })
                      }
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-900 mb-1">
                      GLA (sqm) *
                    </label>
                    <input
                      type="number"
                      placeholder="e.g., 42000"
                      value={newProperty.gla}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, gla: e.target.value })
                      }
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-900 mb-1">
                      Year Built *
                    </label>
                    <input
                      type="number"
                      placeholder="e.g., 2005"
                      value={newProperty.yearBuilt}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, yearBuilt: e.target.value })
                      }
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-900 mb-1">
                      Condition *
                    </label>
                    <select
                      value={newProperty.condition}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, condition: e.target.value })
                      }
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">-- Select --</option>
                      <option value="Excellent">Excellent</option>
                      <option value="Good">Good</option>
                      <option value="Fair">Fair</option>
                      <option value="Poor">Poor</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-stone-900 mb-1">
                      Ownership Status *
                    </label>
                    <select
                      value={newProperty.ownershipStatus}
                      onChange={(e) =>
                        setNewProperty({ ...newProperty, ownershipStatus: e.target.value })
                      }
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">-- Select --</option>
                      <option value="Owned">Owned</option>
                      <option value="For Lease">For Lease</option>
                      <option value="Mortgaged">Mortgaged</option>
                      <option value="For Sale">For Sale</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Linking Section */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-stone-900 mb-3">Links & Associations</h3>
                
                <div>
                  <label className="block text-sm font-medium text-stone-900 mb-1">
                    Linked Company Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., TechCorp Inc."
                    value={newProperty.linkedCompanyName}
                    onChange={(e) =>
                      setNewProperty({ ...newProperty, linkedCompanyName: e.target.value })
                    }
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="mt-3">
                  <label className="block text-sm font-medium text-stone-900 mb-1">
                    Linked Fund Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Premium Commercial Fund"
                    value={newProperty.linkedFundName}
                    onChange={(e) =>
                      setNewProperty({ ...newProperty, linkedFundName: e.target.value })
                    }
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-stone-200">
              <button
                onClick={() => {
                  setShowAddPropertyModal(false);
                  resetForm();
                }}
                className="flex-1 px-4 py-2 border border-stone-300 rounded-lg text-stone-900 hover:bg-stone-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!newProperty.name.trim()) {
                    alert("Please enter property name");
                    return;
                  }
                  if (!newProperty.address.trim()) {
                    alert("Please enter property address");
                    return;
                  }
                  if (!newProperty.type) {
                    alert("Please select property type");
                    return;
                  }
                  if (!newProperty.squareFeet) {
                    alert("Please enter property size");
                    return;
                  }
                  if (!newProperty.gla) {
                    alert("Please enter GLA");
                    return;
                  }
                  if (!newProperty.yearBuilt) {
                    alert("Please enter year built");
                    return;
                  }
                  if (!newProperty.condition) {
                    alert("Please select condition");
                    return;
                  }
                  if (!newProperty.ownershipStatus) {
                    alert("Please select ownership status");
                    return;
                  }
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
                      alert(
                        "Could not resolve this address on Google Maps. Please provide valid coordinates."
                      );
                      return;
                    }
                    resolvedLat = parseFloat(newProperty.latitude);
                    resolvedLng = parseFloat(newProperty.longitude);
                  }

                  if (!Number.isFinite(resolvedLat) || !Number.isFinite(resolvedLng)) {
                    alert("Please enter valid latitude and longitude");
                    return;
                  }

                  let createdProperty;
                  try {
                    createdProperty = await propertyService.createProperty({
                      title: newProperty.name.trim(),
                      description: `${newProperty.ownershipStatus} property added from the map screen.`,
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
                        linkedCompanyName: newProperty.linkedCompanyName || undefined,
                        linkedFundName: newProperty.linkedFundName || undefined,
                        propertyType: newProperty.type,
                        squareFeet: parseInt(newProperty.squareFeet),
                        gla: parseInt(newProperty.gla),
                        yearBuilt: parseInt(newProperty.yearBuilt),
                        condition: newProperty.condition,
                      },
                    });
                  } catch (error) {
                    alert(
                      `Failed to save property to the database: ${
                        error instanceof Error ? error.message : String(error)
                      }`
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
                    linkedCompanyName: newProperty.linkedCompanyName || undefined,
                    linkedFundName: newProperty.linkedFundName || undefined,
                    brokerName: createdProperty.assignedBrokerName || "Unassigned",
                    brokerId: createdProperty.assignedBrokerId || createdProperty.brokerId,
                  };

                  const next = [newProp, ...properties];
                  persistProperties(next);
                  setSelectedProperty(newProp);
                  const addedToStock = syncPropertyToStockIfForSale(newProp);
                  setShowAddPropertyModal(false);
                  resetForm();
                  alert(
                    addedToStock
                      ? `Property "${newProperty.name}" added and synced to stock automatically.`
                      : `Property "${newProperty.name}" added. It will appear in stock when status is set to a stock status.`
                  );
                }}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <FiPlus size={18} />
                Add Property
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapProperties;


