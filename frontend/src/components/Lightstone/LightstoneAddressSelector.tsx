/**
 * LightstoneAddressSelector Component
 * 
 * Complete UI component for Lightstone API integration with Google Maps.
 * Allows users to:
 * - Select a suburb/street
 * - Browse addresses from Lightstone
 * - View Lightstone static maps in Google Maps InfoWindows
 * - Manage address selection and mapping
 * 
 * This component works alongside the existing SummaryPropertyMap.
 * 
 * @author CRM Development Team
 * @version 1.0.0
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FiSearch, FiMapPin, FiX, FiLoader } from 'react-icons/fi';
import { useLightstoneAddresses, useLightstoneStaticMap } from '@/hooks/useLightstone';
import { AddressData } from '@/services/lightstoneService';
import {
  createEnrichedInfoWindow,
  createErrorInfoWindow,
  addressToLatLng,
  validateLightstoneConfig,
} from '@/utils/lightstoneMapUtils';

interface LightstoneAddressSelectorProps {
  suburbId: string;
  onAddressSelect?: (address: AddressData) => void;
  onMapImageLoad?: (url: string) => void;
  maxAddressesToShow?: number;
}

export const LightstoneAddressSelector: React.FC<LightstoneAddressSelectorProps> = ({
  suburbId,
  onAddressSelect,
  onMapImageLoad,
  maxAddressesToShow = 50,
}) => {
  const { addresses, loading: addressesLoading, error: addressError, fetchAddresses } = useLightstoneAddresses();
  const { mapUrl, loading: mapLoading, error: mapError, fetchStaticMap } = useLightstoneStaticMap();
  const [selectedAddress, setSelectedAddress] = useState<AddressData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredAddresses, setFilteredAddresses] = useState<AddressData[]>([]);
  const [configError, setConfigError] = useState<string>('');

  // Validate configuration on mount
  useEffect(() => {
    const { isConfigured, errors } = validateLightstoneConfig();
    if (!isConfigured) {
      setConfigError(errors.join('; '));
    }
  }, []);

  // Fetch addresses when suburb changes
  useEffect(() => {
    if (suburbId) {
      fetchAddresses(suburbId, { pageSize: maxAddressesToShow });
    }
  }, [suburbId, maxAddressesToShow, fetchAddresses]);

  // Filter addresses based on search term
  useEffect(() => {
    if (!addresses) {
      setFilteredAddresses([]);
      return;
    }

    if (!searchTerm.trim()) {
      setFilteredAddresses(addresses.slice(0, maxAddressesToShow));
      return;
    }

    const term = searchTerm.toLowerCase();
    setFilteredAddresses(
      addresses.filter(
        addr =>
          addr.streetName.toLowerCase().includes(term) ||
          addr.fullAddress.toLowerCase().includes(term) ||
          addr.suburbName.toLowerCase().includes(term)
      )
    );
  }, [addresses, searchTerm, maxAddressesToShow]);

  /**
   * Handles address selection and static map fetching
   */
  const handleSelectAddress = useCallback(
    async (address: AddressData) => {
      setSelectedAddress(address);
      onAddressSelect?.(address);

      // Fetch static map image
      if (address.coordinates) {
        await fetchStaticMap({
          id: address.addressId,
          zoom: 15,
          lat: address.coordinates.latitude,
          lon: address.coordinates.longitude,
          width: 400,
          height: 300,
        });
      }
    },
    [fetchStaticMap, onAddressSelect]
  );

  // Show configuration error
  if (configError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-sm font-bold text-red-800 mb-2">Lightstone Configuration Error</h3>
        <p className="text-xs text-red-700">{configError}</p>
        <p className="text-xs text-red-600 mt-2">
          See LIGHTSTONE_SETUP.md for configuration instructions.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <FiSearch className="absolute left-3 top-3 text-stone-400" />
        <input
          type="text"
          placeholder="Search addresses by street name..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />
      </div>

      {/* Address List */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="bg-stone-200 px-4 py-3 sticky top-0">
          <p className="text-sm font-semibold text-stone-900">
            Addresses in {suburbId}
            {addresses && addresses.length > 0 && (
              <span className="text-xs text-stone-600 ml-2">({filteredAddresses.length} of {addresses.length})</span>
            )}
          </p>
        </div>

        {/* Loading State */}
        {addressesLoading && (
          <div className="p-8 text-center">
            <FiLoader className="inline animate-spin text-indigo-600 mb-2" size={24} />
            <p className="text-sm text-stone-600">Loading addresses...</p>
          </div>
        )}

        {/* Error State */}
        {addressError && !addressesLoading && (
          <div className="p-4 bg-red-50 border-b border-red-200">
            <p className="text-xs font-semibold text-red-700 mb-1">{addressError.code}</p>
            <p className="text-xs text-red-600">{addressError.message}</p>
          </div>
        )}

        {/* Empty State */}
        {!addressesLoading && !addressError && filteredAddresses.length === 0 && (
          <div className="p-8 text-center text-stone-500">
            <FiMapPin className="mx-auto mb-2 text-2xl opacity-30" />
            <p className="text-sm">
              {addresses.length === 0 ? 'No addresses found for this suburb' : 'No addresses match your search'}
            </p>
          </div>
        )}

        {/* Address Items */}
        {!addressesLoading && filteredAddresses.length > 0 && (
          <div className="divide-y divide-stone-200 max-h-96 overflow-y-auto">
            {filteredAddresses.map(address => (
              <button
                key={address.addressId}
                onClick={() => handleSelectAddress(address)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  selectedAddress?.addressId === address.addressId
                    ? 'bg-indigo-100 border-l-4 border-indigo-500'
                    : 'hover:bg-stone-100'
                }`}
              >
                <p className="text-sm font-semibold text-stone-900">
                  {address.streetNumber && `${address.streetNumber} `}
                  {address.streetName}
                </p>
                <p className="text-xs text-stone-600 mt-1">
                  {address.suburbName}, {address.province}
                  {address.postalCode && ` • ${address.postalCode}`}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Address Details */}
      {selectedAddress && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="font-semibold text-sm text-stone-900">Selected Address</h4>
              <p className="text-xs text-stone-600 mt-1">
                {selectedAddress.streetNumber && `${selectedAddress.streetNumber} `}
                {selectedAddress.streetName}
              </p>
            </div>
            <button
              onClick={() => setSelectedAddress(null)}
              className="text-stone-400 hover:text-stone-600"
            >
              <FiX />
            </button>
          </div>

          {/* Static Map Preview */}
          {mapLoading && (
            <div className="bg-white rounded-lg p-8 text-center mb-3 border border-indigo-100">
              <FiLoader className="inline animate-spin text-indigo-600 mb-2" size={20} />
              <p className="text-xs text-stone-600">Loading Lightstone map...</p>
            </div>
          )}

          {mapError && !mapLoading && (
            <div className="bg-red-50 rounded-lg p-3 mb-3 border border-red-200">
              <p className="text-xs font-semibold text-red-700">{mapError.code}</p>
              <p className="text-xs text-red-600">{mapError.message}</p>
            </div>
          )}

          {mapUrl && !mapLoading && (
            <div className="mb-3 bg-white rounded-lg overflow-hidden border border-indigo-100">
              <img src={mapUrl} alt="Lightstone Map" className="w-full h-auto" />
              <p className="text-xs text-stone-600 text-center py-2 bg-stone-50">
                Lightstone Static Map Preview
              </p>
            </div>
          )}

          {/* Coordinates Display */}
          {selectedAddress.coordinates && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white rounded p-2 border border-stone-200">
                <p className="text-stone-600 font-medium">Latitude</p>
                <p className="text-stone-900 font-mono font-semibold">{selectedAddress.coordinates.latitude.toFixed(6)}</p>
              </div>
              <div className="bg-white rounded p-2 border border-stone-200">
                <p className="text-stone-600 font-medium">Longitude</p>
                <p className="text-stone-900 font-mono font-semibold">{selectedAddress.coordinates.longitude.toFixed(6)}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LightstoneAddressSelector;
