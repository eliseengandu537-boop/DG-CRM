// @ts-nocheck
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { FiMapPin, FiX, FiZoomIn, FiZoomOut, FiPlus } from 'react-icons/fi';
import { formatRand } from '@/lib/currency';
import { propertyService, type PropertyRecord } from '@/services/propertyService';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

interface PropertyLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  dealValue: number;
  status: string;
  investor: string;
  contactNumber?: string;
  fund?: string;
  propertyId?: string;
}

const isCompletedSalesStatus = (value: string): boolean => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return ['closed', 'won', 'completed', 'awaiting_payment', 'invoice'].includes(normalized);
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
  if (moduleScope && moduleScope !== 'sales') return null;

  const normalizedStatus = String(metadata.saleStatus || record.status || 'active');
  return {
    id: record.id,
    propertyId: record.id,
    name: String(metadata.displayName || record.title || record.address || 'Sales Property'),
    address: record.address,
    lat,
    lng,
    dealValue: Number(metadata.dealValue || record.price || 0),
    status: isCompletedSalesStatus(normalizedStatus) ? 'completed' : 'active',
    investor: String(metadata.investor || metadata.linkedFundName || 'Unassigned'),
    contactNumber: String(metadata.contactNumber || ''),
    fund: String(metadata.linkedFundName || ''),
  };
};

const SalesMap: React.FC = () => {
  const [selectedProperty, setSelectedProperty] = useState<PropertyLocation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [zoom, setZoom] = useState(3);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [properties, setProperties] = useState<PropertyLocation[]>([]);
  const [newProperty, setNewProperty] = useState({
    name: '',
    address: '',
    contactNumber: '',
    linkedFund: '',
    dealValue: 0,
  });

  const loadProperties = React.useCallback(async () => {
    try {
      const response = await propertyService.getAllProperties({ limit: 1000, moduleType: 'sales' });
      const mapped = response.data
        .map((record) => toLocation(record))
        .filter((item): item is PropertyLocation => Boolean(item));
      setProperties(mapped);
    } catch (error) {
      console.warn('Failed to load sales properties from the database.', error);
      setProperties([]);
    }
  }, []);

  useEffect(() => {
    void loadProperties();
  }, [loadProperties]);

  useRealtimeRefresh(() => {
    void loadProperties();
  });

  const salesLocations: PropertyLocation[] = useMemo(() => {
    if (filterStatus === 'all') return properties;
    return properties.filter((loc) => loc.status === filterStatus);
  }, [filterStatus, properties]);

  const filteredLocations = useMemo(() => {
    if (!searchQuery.trim()) return salesLocations;
    const query = searchQuery.toLowerCase();
    return salesLocations.filter(
      loc =>
        loc.name.toLowerCase().includes(query) ||
        loc.address.toLowerCase().includes(query) ||
        loc.investor.toLowerCase().includes(query)
    );
  }, [searchQuery, salesLocations]);

  const handleZoom = (direction: 'in' | 'out') => {
    if (direction === 'in' && zoom < 8) setZoom(zoom + 1);
    if (direction === 'out' && zoom > 1) setZoom(zoom - 1);
  };

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
        console.warn('Failed to geocode sales property address.', error);
      }
    }

    try {
      const createdProperty = await propertyService.createProperty({
        title: newProperty.name.trim(),
        description: 'Sales property created from the map screen.',
        address,
        city: '',
        province: '',
        postalCode: '',
        type: 'Sales',
        moduleType: 'sales',
        status: 'For Sale',
        price: newProperty.dealValue || 0,
        area: 0,
        latitude: lat,
        longitude: lng,
        metadata: {
          moduleScope: 'sales',
          displayName: newProperty.name.trim(),
          contactNumber: newProperty.contactNumber.trim(),
          linkedFundName: newProperty.linkedFund.trim(),
          investor: newProperty.linkedFund.trim(),
          dealValue: newProperty.dealValue || 0,
          saleStatus: 'active',
        },
      });

      const mapped = toLocation(createdProperty);
      if (mapped) {
        setProperties((prev) => [mapped, ...prev]);
      }

      setNewProperty({ name: '', address: '', contactNumber: '', linkedFund: '', dealValue: 0 });
      setShowAddModal(false);
    } catch (error) {
      alert(
        `Failed to save property to the database: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'completed':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return '🟢 Active';
      case 'completed':
        return '✓ Completed';
      default:
        return 'Pending';
    }
  };

  return (
    <div className="w-full bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-violet-500 p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FiMapPin className="text-2xl" />
            <h2 className="text-2xl font-bold">Sales Properties Map</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-white/20 px-4 py-2 rounded-full text-sm font-medium">
              {filteredLocations.length} Properties
            </span>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-white text-purple-600 px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-purple-50 transition-colors"
            >
              <FiPlus className="text-lg" />
              Add Property
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by property name, address, or investor..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 rounded-lg bg-white/20 text-white placeholder-white/60 text-sm focus:outline-none focus:bg-white/30"
          />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
            className="px-4 py-2 rounded-lg bg-white/20 text-white text-sm focus:outline-none focus:bg-white/30 cursor-pointer"
          >
            <option value="all" className="text-stone-900">All Status</option>
            <option value="active" className="text-stone-900">Active</option>
            <option value="completed" className="text-stone-900">Completed</option>
          </select>
        </div>
      </div>

      {/* Map Area */}
      <div className="flex flex-col lg:flex-row gap-4 p-6">
        {/* Map Visualization */}
        <div className="flex-1 relative bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg border border-stone-200 p-4" style={{ minHeight: '500px' }}>
          {/* Map Grid */}
          <svg viewBox="0 0 1000 600" className="w-full h-full absolute inset-0">
            {/* Background */}
            <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="1000" height="600" fill="url(#grid)" />

            {/* Property Pins */}
            {filteredLocations.map(location => {
              const x = (location.lng + 35) * 10;
              const y = (location.lat + 34) * 10;
              const isSelected = selectedProperty?.id === location.id;

              return (
                <g key={location.id} onClick={() => setSelectedProperty(location)} style={{ cursor: 'pointer' }}>
                  {/* Pin */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 16 : 12}
                    className={`${getStatusColor(location.status)} transition-all ${isSelected ? 'filter drop-shadow-lg' : ''}`}
                    opacity="0.9"
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 8 : 6}
                    fill="white"
                  />
                  {/* Label */}
                  <text
                    x={x}
                    y={y - 25}
                    textAnchor="middle"
                    className="text-xs font-bold fill-stone-900 pointer-events-none"
                    fontSize="12"
                  >
                    {location.name.slice(0, 8)}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Zoom Controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
            <button
              onClick={() => handleZoom('in')}
              className="bg-white rounded-lg p-2 shadow-lg hover:shadow-xl transition-shadow"
            >
              <FiZoomIn className="text-stone-700" />
            </button>
            <button
              onClick={() => handleZoom('out')}
              className="bg-white rounded-lg p-2 shadow-lg hover:shadow-xl transition-shadow"
            >
              <FiZoomOut className="text-stone-700" />
            </button>
          </div>

          {/* Info: No Selection */}
          {!selectedProperty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-white/90 px-6 py-4 rounded-lg shadow-lg text-center">
                <p className="text-stone-600 text-sm">Click on a pin to view property details</p>
              </div>
            </div>
          )}
        </div>

        {/* Properties List & Details */}
        <div className="w-full lg:w-80 flex flex-col gap-4">
          {/* Properties List */}
          <div className="bg-stone-50 rounded-lg border border-stone-200 overflow-hidden flex flex-col max-h-96 overflow-y-auto">
            <div className="bg-stone-200 px-4 py-3 font-semibold text-stone-900">Properties ({filteredLocations.length})</div>
            {filteredLocations.length > 0 ? (
              <div className="divide-y divide-stone-200">
                {filteredLocations.map(location => (
                  <div
                    key={location.id}
                    onClick={() => setSelectedProperty(location)}
                    className={`p-4 cursor-pointer transition-all ${
                      selectedProperty?.id === location.id
                        ? 'bg-purple-100 border-l-4 border-purple-500'
                        : 'hover:bg-stone-100'
                    }`}
                  >
                    <p className="font-semibold text-sm text-stone-900 mb-1">{location.name}</p>
                    <p className="text-xs text-stone-600 mb-2">{location.address}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-purple-600">{formatRand(location.dealValue)}</span>
                      <span className="text-xs font-medium">{getStatusLabel(location.status)}</span>
                    </div>
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
            <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-lg border-2 border-purple-200 p-4">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-stone-900">{selectedProperty.name}</h3>
                <button
                  onClick={() => setSelectedProperty(null)}
                  className="text-stone-400 hover:text-stone-600 transition-colors"
                >
                  <FiX />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-stone-600 font-medium mb-1">Address</p>
                  <p className="text-stone-900">{selectedProperty.address}</p>
                </div>
                <div>
                  <p className="text-stone-600 font-medium mb-1">Investor</p>
                  <p className="text-stone-900">{selectedProperty.investor}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-stone-600 font-medium mb-1">Deal Value</p>
                    <p className="text-lg font-bold text-purple-600">{formatRand(selectedProperty.dealValue)}</p>
                  </div>
                  <div>
                    <p className="text-stone-600 font-medium mb-1">Status</p>
                    <p className="text-stone-900 font-semibold">{getStatusLabel(selectedProperty.status)}</p>
                  </div>
                </div>
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
                  setNewProperty({ name: '', address: '', contactNumber: '', linkedFund: '', dealValue: 0 });
                }}
                className="text-stone-400 hover:text-stone-600"
              >
                <FiX className="text-2xl" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Property Name *</label>
                <input
                  type="text"
                  value={newProperty.name}
                  onChange={e => setNewProperty({ ...newProperty, name: e.target.value })}
                  placeholder="e.g., Commercial Complex - Sandton"
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Property Address (Google) *</label>
                <input
                  type="text"
                  value={newProperty.address}
                  onChange={e => setNewProperty({ ...newProperty, address: e.target.value })}
                  placeholder="e.g., 100 Rivonia Road, Sandton"
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Centre Contact Number (Landline) *</label>
                <input
                  type="tel"
                  value={newProperty.contactNumber}
                  onChange={e => setNewProperty({ ...newProperty, contactNumber: e.target.value })}
                  placeholder="e.g., +27 11 234 5678"
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Link to Fund *</label>
                <select
                  value={newProperty.linkedFund}
                  onChange={e => setNewProperty({ ...newProperty, linkedFund: e.target.value })}
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                >
                  <option value="">Select a fund</option>
                  <option value="fund-001">Prime Properties Fund</option>
                  <option value="fund-002">Retail Growth Partners</option>
                  <option value="fund-003">Commercial Investment Fund</option>
                  <option value="fund-004">Growth Capital</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Deal Value (R)</label>
                <input
                  type="number"
                  value={newProperty.dealValue || ''}
                  onChange={e => setNewProperty({ ...newProperty, dealValue: parseInt(e.target.value) || 0 })}
                  placeholder="e.g., 1500000"
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewProperty({ name: '', address: '', contactNumber: '', linkedFund: '', dealValue: 0 });
                }}
                className="flex-1 px-4 py-2 bg-stone-200 text-stone-900 rounded-lg font-medium hover:bg-stone-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProperty}
                className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 transition-colors"
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

export default SalesMap;
