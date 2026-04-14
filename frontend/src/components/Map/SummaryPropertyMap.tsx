// @ts-nocheck
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { FiMapPin, FiX, FiZoomIn, FiZoomOut, FiPlus } from 'react-icons/fi';
import { formatRand } from '@/lib/currency';
import { propertyService, type PropertyRecord } from '@/services/propertyService';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

const GoogleMapWrapper = dynamic(() => import('./GoogleMapWrapper'), { ssr: false });

interface PropertyLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  value: number;
  status: string;
  type: 'sales' | 'leasing';
  contact: string;
  fund: string;
  details: string;
  contactNumber?: string;
  centerContact?: string;
  phone?: string;
  investor?: string;
  tenant?: string;
  occupancy?: number;
  dealValue?: number;
  monthlyRent?: number;
  propertyType?: string;
  dealStatus?: string;
  leaseStatus?: string;
  propertyId?: string;
}

const isCompletedSalesStatus = (value: string): boolean => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return ['closed', 'won', 'completed', 'awaiting_payment', 'invoice'].includes(normalized);
};

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

const toLocation = (record: PropertyRecord): PropertyLocation | null => {
  const lat = Number(record.latitude);
  const lng = Number(record.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const metadata =
    record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, unknown>)
      : {};
  const moduleScope = String(metadata.moduleScope || '').toLowerCase();
  const type = moduleScope === 'leasing' ? 'leasing' : 'sales';
  const leaseStatus = String(metadata.leaseStatus || '').toLowerCase();
  const saleStatus = String(metadata.saleStatus || record.status || '').toLowerCase();

  return {
    id: record.id,
    propertyId: record.id,
    name: String(metadata.displayName || record.title || record.address || 'Property'),
    address: record.address,
    lat,
    lng,
    value: Number(metadata.dealValue || metadata.monthlyRent || record.price || 0),
    status: type === 'sales' ? (isCompletedSalesStatus(saleStatus) ? 'completed' : 'active') : (leaseStatus === 'vacant' ? 'vacant' : 'occupied'),
    type,
    contact: String(metadata.contactNumber || ''),
    fund: String(metadata.linkedFundName || ''),
    details: normalizeMapPropertyType(metadata.propertyType || record.type || ''),
    contactNumber: String(metadata.contactNumber || ''),
    centerContact: String(metadata.linkedFundName || ''),
    phone: String(metadata.contactNumber || ''),
    investor: String(metadata.investor || metadata.linkedFundName || ''),
    tenant: String(metadata.tenant || 'Vacant'),
    occupancy: Number(metadata.occupancy || (type === 'leasing' && leaseStatus === 'vacant' ? 0 : 100)),
    dealValue: Number(metadata.dealValue || record.price || 0),
    monthlyRent: Number(metadata.monthlyRent || record.price || 0),
    propertyType: normalizeMapPropertyType(metadata.propertyType || record.type || ''),
    dealStatus: isCompletedSalesStatus(saleStatus) ? 'completed' : saleStatus || 'active',
    leaseStatus: leaseStatus || (type === 'leasing' ? 'occupied' : 'active'),
  };
};

const SummaryPropertyMap: React.FC = () => {
  const [selectedProperty, setSelectedProperty] = useState<PropertyLocation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'sales' | 'leasing'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [properties, setProperties] = useState<PropertyLocation[]>([]);
  const [newProperty, setNewProperty] = useState({
    name: '',
    address: '',
    contactNumber: '',
    linkedFund: '',
    value: 0,
    type: 'sales' as 'sales' | 'leasing',
  });

  const loadProperties = React.useCallback(async () => {
    try {
      const response = await propertyService.getAllProperties({ limit: 1000 });
      const mapped = response.data
        .map((record) => toLocation(record))
        .filter((item): item is PropertyLocation => Boolean(item));
      setProperties(mapped);
    } catch (error) {
      console.warn('Failed to load summary properties from the database.', error);
      setProperties([]);
    }
  }, []);

  useEffect(() => {
    void loadProperties();
  }, [loadProperties]);

  useRealtimeRefresh(() => {
    void loadProperties();
  });

  const allProperties: PropertyLocation[] = useMemo(() => properties, [properties]);

  const filteredProperties = useMemo(() => {
    let filtered = allProperties;

    if (filterType !== 'all') {
      filtered = filtered.filter(p => p.type === filterType);
    }

    if (!searchQuery.trim()) return filtered;
    const query = searchQuery.toLowerCase();
    return filtered.filter(
      p =>
        p.name.toLowerCase().includes(query) ||
        p.address.toLowerCase().includes(query) ||
        p.fund.toLowerCase().includes(query)
    );
  }, [searchQuery, filterType, allProperties]);

  const handleAddProperty = async () => {
    if (!newProperty.name.trim()) {
      alert('Please enter property name');
      return;
    }
    if (!newProperty.address.trim()) {
      alert('Please enter property address');
      return;
    }
    if (!newProperty.contactNumber.trim()) {
      alert('Please enter contact number');
      return;
    }
    if (!newProperty.linkedFund) {
      alert('Please select a fund to link');
      return;
    }

    let lat = -28.8;
    let lng = 24.5;
    let address = newProperty.address.trim();
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (apiKey) {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
            address
          )}&key=${apiKey}`
        );
        const data = await response.json();
        const location = data?.results?.[0]?.geometry?.location;
        if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
          lat = location.lat;
          lng = location.lng;
          address = data.results[0].formatted_address || address;
        }
      } catch (error) {
        console.warn('Failed to geocode summary property address.', error);
      }
    }

    try {
      const createdProperty = await propertyService.createProperty({
        title: newProperty.name.trim(),
        description: `${newProperty.type === 'sales' ? 'Sales' : 'Leasing'} property created from the summary map.`,
        address,
        city: '',
        province: '',
        postalCode: '',
        type: newProperty.type === 'sales' ? 'Sales' : 'Leasing',
        moduleType: newProperty.type,
        status: newProperty.type === 'sales' ? 'For Sale' : 'For Lease',
        price: newProperty.value || 0,
        area: 0,
        latitude: lat,
        longitude: lng,
        metadata: {
          moduleScope: newProperty.type,
          displayName: newProperty.name.trim(),
          contactNumber: newProperty.contactNumber.trim(),
          linkedFundName: newProperty.linkedFund.trim(),
          dealValue: newProperty.type === 'sales' ? newProperty.value || 0 : undefined,
          monthlyRent: newProperty.type === 'leasing' ? newProperty.value || 0 : undefined,
          saleStatus: newProperty.type === 'sales' ? 'active' : undefined,
          leaseStatus: newProperty.type === 'leasing' ? 'vacant' : undefined,
          occupancy: newProperty.type === 'leasing' ? 0 : undefined,
        },
      });

      const mapped = toLocation(createdProperty);
      if (mapped) {
        setProperties((prev) => [mapped, ...prev]);
      }

      setNewProperty({
        name: '',
        address: '',
        contactNumber: '',
        linkedFund: '',
        value: 0,
        type: 'sales',
      });
      setShowAddModal(false);
    } catch (error) {
      alert(
        `Failed to save property to the database: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const getTypeColor = (type: 'sales' | 'leasing') => {
    return type === 'sales' ? 'bg-purple-500' : 'bg-blue-500';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'occupied':
        return 'text-green-600 bg-green-50';
      case 'vacant':
        return 'text-orange-600 bg-orange-50';
      case 'completed':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatCurrency = (value: number) => {
    return formatRand(value);
  };

  const getSalesCount = () => filteredProperties.filter(p => p.type === 'sales').length;
  const getLeasingCount = () => filteredProperties.filter(p => p.type === 'leasing').length;

  return (
    <div className="w-full bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 p-6 text-white">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FiMapPin className="text-2xl" />
            <div>
              <h2 className="text-2xl font-bold">Summary Property Map</h2>
              <p className="text-white/80 text-sm mt-1">Sales & Leasing Properties Combined</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-indigo-50 transition-colors"
          >
            <FiPlus className="text-lg" />
            Add Property
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white/20 rounded-lg p-3">
            <p className="text-white/80 text-xs font-medium">Total Properties</p>
            <p className="text-2xl font-bold text-white">{filteredProperties.length}</p>
          </div>
          <div className="bg-purple-500/30 rounded-lg p-3 border border-purple-300/30">
            <p className="text-white/80 text-xs font-medium">Sales Properties</p>
            <p className="text-2xl font-bold text-white">{getSalesCount()}</p>
          </div>
          <div className="bg-blue-500/30 rounded-lg p-3 border border-blue-300/30">
            <p className="text-white/80 text-xs font-medium">Leasing Properties</p>
            <p className="text-2xl font-bold text-white">{getLeasingCount()}</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Search by property name, address, or fund..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-white/20 text-white placeholder-white/60 text-sm focus:outline-none focus:bg-white/30"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                filterType === 'all'
                  ? 'bg-white text-indigo-600 shadow'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              All Properties
            </button>
            <button
              onClick={() => setFilterType('sales')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                filterType === 'sales'
                  ? 'bg-white text-purple-600 shadow'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              Sales
            </button>
            <button
              onClick={() => setFilterType('leasing')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                filterType === 'leasing'
                  ? 'bg-white text-blue-600 shadow'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              Leasing
            </button>
          </div>
        </div>
      </div>

      {/* Map and Details */}
      <div className="flex flex-col lg:flex-row gap-4 p-6">
        {/* Google Map */}
        <div className="flex-1 relative rounded-lg border border-stone-200 overflow-hidden" style={{ minHeight: '500px' }}>
          <GoogleMapWrapper
            properties={filteredProperties}
            selectedProperty={selectedProperty}
            setSelectedProperty={setSelectedProperty}
          />

          {/* Info */}
          {!selectedProperty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-white/95 px-6 py-4 rounded-lg shadow-lg text-center">
                <p className="text-stone-600 text-sm">Click on a pin to view property details</p>
              </div>
            </div>
          )}
        </div>

        {/* Properties List & Details */}
        <div className="w-full lg:w-96 flex flex-col gap-4">
          {/* Properties List */}
          <div className="bg-stone-50 rounded-lg border border-stone-200 overflow-hidden flex flex-col max-h-96 overflow-y-auto">
            <div className="bg-stone-200 px-4 py-3 font-semibold text-stone-900 sticky top-0">
              Properties ({filteredProperties.length})
            </div>
            {filteredProperties.length > 0 ? (
              <div className="divide-y divide-stone-200">
                {filteredProperties.map(location => (
                  <div
                    key={location.id}
                    onClick={() => setSelectedProperty(location)}
                    className={`p-4 cursor-pointer transition-all ${
                      selectedProperty?.id === location.id
                        ? 'bg-indigo-100 border-l-4 border-indigo-500'
                        : 'hover:bg-stone-100'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-stone-900">{location.name}</p>
                        <p className="text-xs text-stone-600 mb-2">{location.address}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded whitespace-nowrap ml-2 ${location.type === 'sales' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {location.type === 'sales' ? 'SALES' : 'LEASE'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="text-xs">
                        <p className="text-stone-500 font-medium">Type</p>
                        <p className="text-stone-900 font-semibold">{location.propertyType}</p>
                      </div>
                      <div className="text-xs">
                        <p className="text-stone-500 font-medium">Fund</p>
                        <p className="text-stone-900 font-semibold text-xs truncate">{location.fund}</p>
                      </div>
                    </div>
                    {location.type === 'sales' && (
                      <div className="flex justify-between items-center text-xs">
                        <span className={`font-medium px-2 py-1 rounded ${location.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {location.dealStatus}
                        </span>
                        <span className="font-bold text-purple-600">{formatCurrency(location.dealValue || 0)}</span>
                      </div>
                    )}
                    {location.type === 'leasing' && (
                      <div className="flex justify-between items-center text-xs">
                        <span className={`font-medium px-2 py-1 rounded ${location.status === 'occupied' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {location.leaseStatus}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-stone-300 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${location.occupancy === 0 ? 'bg-orange-500' : 'bg-blue-500'}`}
                              style={{ width: `${location.occupancy}%` }}
                            />
                          </div>
                          <span className="font-bold text-blue-600 w-8">{location.occupancy}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-stone-500">
                <FiX className="mx-auto mb-2 text-2xl opacity-30" />
                <p className="text-sm">No properties found</p>
              </div>
            )}
          </div>

          {/* Selected Property Details */}
          {selectedProperty && (
            <div className={`rounded-lg border-2 p-4 overflow-y-auto max-h-96 ${selectedProperty.type === 'sales' ? 'bg-purple-50 border-purple-200' : 'bg-blue-50 border-blue-200'}`}>
              <div className="flex justify-between items-start mb-4 pb-4 border-b border-stone-200">
                <div>
                  <h3 className="font-bold text-stone-900 text-lg">{selectedProperty.name}</h3>
                  <span className={`text-xs font-bold px-2 py-1 rounded inline-block mt-1 ${selectedProperty.type === 'sales' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {selectedProperty.type === 'sales' ? 'SALES PROPERTY' : 'LEASING PROPERTY'}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedProperty(null)}
                  className="text-stone-400 hover:text-stone-600 transition-colors"
                >
                  <FiX />
                </button>
              </div>
              <div className="space-y-4 text-sm">
                {/* Property Details */}
                <div className="space-y-2">
                  <p className="font-semibold text-stone-900 border-b border-stone-300 pb-2">Property Information</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/50 rounded p-2">
                      <p className="text-stone-600 font-medium text-xs mb-1">Property Type</p>
                      <p className="text-stone-900 font-semibold">{selectedProperty.propertyType}</p>
                    </div>
                    <div className="bg-white/50 rounded p-2">
                      <p className="text-stone-600 font-medium text-xs mb-1">Status</p>
                      <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${getStatusColor(selectedProperty.status)}`}>
                        {selectedProperty.status.charAt(0).toUpperCase() + selectedProperty.status.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div className="bg-white/50 rounded p-3">
                  <p className="text-stone-600 font-medium text-xs mb-1">Address</p>
                  <p className="text-stone-900">{selectedProperty.address}</p>
                </div>

                {/* Contact Information */}
                <div className="space-y-2">
                  <p className="font-semibold text-stone-900 border-b border-stone-300 pb-2">Contact Information</p>
                  {selectedProperty.centerContact && (
                    <div className="bg-white/50 rounded p-2">
                      <p className="text-stone-600 font-medium text-xs mb-1">Centre / Location</p>
                      <p className="text-stone-900 font-semibold">{selectedProperty.centerContact}</p>
                    </div>
                  )}
                  <div className="bg-white/50 rounded p-2">
                    <p className="text-stone-600 font-medium text-xs mb-1">Phone Number</p>
                    <p className="text-stone-900 font-mono">{selectedProperty.phone || selectedProperty.contactNumber}</p>
                  </div>
                  {selectedProperty.type === 'sales' && (
                    <div className="bg-white/50 rounded p-2">
                      <p className="text-stone-600 font-medium text-xs mb-1">Investor / Agent</p>
                      <p className="text-stone-900 font-semibold">{selectedProperty.investor}</p>
                    </div>
                  )}
                  {selectedProperty.type === 'leasing' && (
                    <div className="bg-white/50 rounded p-2">
                      <p className="text-stone-600 font-medium text-xs mb-1">Current Tenant</p>
                      <p className="text-stone-900 font-semibold">{selectedProperty.tenant}</p>
                    </div>
                  )}
                </div>

                {/* Fund Information */}
                <div className="bg-white/50 rounded p-3">
                  <p className="text-stone-600 font-medium text-xs mb-1">Linked Fund</p>
                  <p className="text-stone-900 font-semibold">{selectedProperty.fund}</p>
                </div>

                {/* Sales-Specific Details */}
                {selectedProperty.type === 'sales' && (
                  <div className="space-y-2">
                    <p className="font-semibold text-stone-900 border-b border-stone-300 pb-2">Sales Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-purple-100 rounded p-2">
                        <p className="text-stone-600 font-medium text-xs mb-1">Deal Value</p>
                        <p className="text-purple-700 font-bold">{formatCurrency(selectedProperty.dealValue || 0)}</p>
                      </div>
                      <div className="bg-white/50 rounded p-2">
                        <p className="text-stone-600 font-medium text-xs mb-1">Deal Status</p>
                        <p className="text-stone-900 font-semibold text-xs">{selectedProperty.dealStatus}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Leasing-Specific Details */}
                {selectedProperty.type === 'leasing' && (
                  <div className="space-y-2">
                    <p className="font-semibold text-stone-900 border-b border-stone-300 pb-2">Leasing Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-100 rounded p-2">
                        <p className="text-stone-600 font-medium text-xs mb-1">Monthly Rent</p>
                        <p className="text-blue-700 font-bold">{formatCurrency(selectedProperty.monthlyRent || 0)}</p>
                      </div>
                      <div className="bg-white/50 rounded p-2">
                        <p className="text-stone-600 font-medium text-xs mb-1">Occupancy Rate</p>
                        <p className="text-stone-900 font-semibold">{selectedProperty.occupancy}%</p>
                      </div>
                    </div>
                    {/* Occupancy Bar */}
                    <div className="bg-white/50 rounded p-2">
                      <p className="text-stone-600 font-medium text-xs mb-2">Occupancy Progress</p>
                      <div className="w-full h-2 bg-stone-300 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${selectedProperty.occupancy === 0 ? 'bg-orange-500' : 'bg-blue-500'}`}
                          style={{ width: `${selectedProperty.occupancy}%` }}
                        />
                      </div>
                    </div>
                    <div className="bg-white/50 rounded p-2">
                      <p className="text-stone-600 font-medium text-xs mb-1">Lease Status</p>
                      <p className="text-stone-900 font-semibold">{selectedProperty.leaseStatus}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Property Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-stone-900">Add New Property</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewProperty({
                    name: '',
                    address: '',
                    contactNumber: '',
                    linkedFund: '',
                    value: 0,
                    type: 'sales',
                  });
                }}
                className="text-stone-400 hover:text-stone-600"
              >
                <FiX className="text-2xl" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Property Type *</label>
                <select
                  value={newProperty.type}
                  onChange={e => setNewProperty({ ...newProperty, type: e.target.value as 'sales' | 'leasing' })}
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                >
                  <option value="sales">Sales Property</option>
                  <option value="leasing">Leasing Property</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Property Name *</label>
                <input
                  type="text"
                  value={newProperty.name}
                  onChange={e => setNewProperty({ ...newProperty, name: e.target.value })}
                  placeholder="e.g., Commercial Complex"
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Property Address (Google) *</label>
                <input
                  type="text"
                  value={newProperty.address}
                  onChange={e => setNewProperty({ ...newProperty, address: e.target.value })}
                  placeholder="e.g., 100 Main Street"
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Centre Contact Number (Landline) *</label>
                <input
                  type="tel"
                  value={newProperty.contactNumber}
                  onChange={e => setNewProperty({ ...newProperty, contactNumber: e.target.value })}
                  placeholder="e.g., +27 11 234 5678"
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Link to Fund *</label>
                <select
                  value={newProperty.linkedFund}
                  onChange={e => setNewProperty({ ...newProperty, linkedFund: e.target.value })}
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                >
                  <option value="">Select a fund</option>
                  <option value="fund-001">Prime Properties Fund</option>
                  <option value="fund-002">Retail Growth Partners</option>
                  <option value="fund-003">Commercial Investment Fund</option>
                  <option value="fund-004">Growth Capital</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  {newProperty.type === 'sales' ? 'Deal Value' : 'Monthly Rent'} (R)
                </label>
                <input
                  type="number"
                  value={newProperty.value || ''}
                  onChange={e => setNewProperty({ ...newProperty, value: parseInt(e.target.value) || 0 })}
                  placeholder={newProperty.type === 'sales' ? 'e.g., 1500000' : 'e.g., 45000'}
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewProperty({
                    name: '',
                    address: '',
                    contactNumber: '',
                    linkedFund: '',
                    value: 0,
                    type: 'sales',
                  });
                }}
                className="flex-1 px-4 py-2 bg-stone-200 text-stone-900 rounded-lg font-medium hover:bg-stone-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProperty}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
              >
                Add Property
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SummaryPropertyMap;
