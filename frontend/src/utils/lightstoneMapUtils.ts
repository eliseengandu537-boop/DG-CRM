// @ts-nocheck
/**
 * Lightstone Google Maps Integration Utilities
 * 
 * Helper functions and components for seamlessly integrating Lightstone
 * address data and static maps with Google Maps markers and InfoWindows.
 * 
 * @author CRM Development Team
 * @version 1.0.0
 */

import { AddressData } from '@/services/lightstoneService';

/**
 * Formats address data for display in Google Maps InfoWindow
 * 
 * @param address - AddressData from Lightstone API
 * @returns Formatted HTML string suitable for InfoWindow
 */
export const formatAddressForInfoWindow = (address: AddressData): string => {
  const streetNumber = address.streetNumber ? `${address.streetNumber} ` : '';
  const fullAddress = `${streetNumber}${address.streetName}`;

  return `
    <div class="lightstone-info-window" style="font-family: Arial, sans-serif; max-width: 300px;">
      <div style="margin-bottom: 8px;">
        <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold; color: #000;">
          ${fullAddress}
        </h3>
        <p style="margin: 0; font-size: 12px; color: #666;">
          ${address.suburbName}, ${address.province}
          ${address.postalCode ? `<br/>Postal Code: ${address.postalCode}` : ''}
        </p>
      </div>
      ${
        address.coordinates
          ? `<p style="margin: 4px 0; font-size: 11px; color: #999;">
               Coordinates: ${address.coordinates.latitude.toFixed(4)}, ${address.coordinates.longitude.toFixed(4)}
             </p>`
          : ''
      }
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; font-size: 11px; color: #999;">
        Address ID: ${address.addressId}
      </div>
    </div>
  `;
};

/**
 * Creates a marker icon for property markers on Google Maps
 * Color-coded by property type (sales/leasing)
 * 
 * @param propertyType - 'sales' or 'leasing'
 * @param isSelected - Whether marker is currently selected
 * @returns Google Maps marker icon object
 */
export const createPropertyMarkerIcon = (
  propertyType: 'sales' | 'leasing' = 'sales',
  isSelected: boolean = false
): google.maps.Icon => {
  const baseColor = propertyType === 'sales' ? '#a855f7' : '#3b82f6';
  const scale = isSelected ? 1.3 : 1;
  const strokeWeight = isSelected ? 3 : 2;

  return {
    path: 'M0,-28a14,14 0 0,1 28,0c0,28-14,56-14,56S0,28 0,0z',
    fillColor: baseColor,
    fillOpacity: isSelected ? 1 : 0.8,
    strokeColor: '#ffffff',
    strokeWeight,
    scale,
    anchor: new google.maps.Point(14, 56),
  };
};

/**
 * Converts Lightstone address to Google Maps LatLng
 * 
 * @param address - AddressData from Lightstone API
 * @returns google.maps.LatLng or null if no coordinates
 */
export const addressToLatLng = (address: AddressData): google.maps.LatLng | null => {
  if (!address.coordinates) return null;

  return new google.maps.LatLng(
    address.coordinates.latitude,
    address.coordinates.longitude
  );
};

/**
 * Calculates bounds for multiple addresses
 * Useful for auto-fitting map when displaying multiple properties
 * 
 * @param addresses - Array of AddressData
 * @returns google.maps.LatLngBounds or null if no valid coordinates
 */
export const getAddressesBounds = (addresses: AddressData[]): google.maps.LatLngBounds | null => {
  const validAddresses = addresses.filter(a => a.coordinates);

  if (validAddresses.length === 0) return null;

  const bounds = new google.maps.LatLngBounds();
  validAddresses.forEach(address => {
    if (address.coordinates) {
      bounds.extend({
        lat: address.coordinates.latitude,
        lng: address.coordinates.longitude,
      });
    }
  });

  return bounds;
};

/**
 * Builds Lightstone static map image URL
 * Can be used as overlay or InfoWindow content
 * 
 * @param params - Parameters for static map
 * @returns URL string for static map image
 */
export const buildStaticMapUrl = (params: {
  id: string;
  zoom: number;
  lat: number;
  lon: number;
  width?: number;
  height?: number;
  baseUrl?: string;
  apiKey?: string;
}): string => {
  const baseUrl = params.baseUrl || process.env.NEXT_PUBLIC_LIGHTSTONE_BASE_URL || 'https://apis.lightstone.co.za';
  const width = params.width || 400;
  const height = params.height || 300;

  const url = `${baseUrl}/maps/v1/static/${params.id}/${params.zoom}/${params.lat},${params.lon}/${width}x${height}`;

  // Add API key to URL if provided
  if (params.apiKey) {
    return `${url}?apiKey=${params.apiKey}`;
  }

  return url;
};

/**
 * Creates detailed HTML for InfoWindow with Lightstone static map
 * 
 * @param address - AddressData from Lightstone API
 * @param staticMapUrl - URL of Lightstone static map image
 * @param loading - Whether data is currently loading
 * @returns Formatted HTML string
 */
export const createEnrichedInfoWindow = (
  address: AddressData,
  staticMapUrl: string | null = null,
  loading: boolean = false
): string => {
  const streetNumber = address.streetNumber ? `${address.streetNumber} ` : '';
  const fullAddress = `${streetNumber}${address.streetName}`;

  return `
    <div class="lightstone-enriched-info-window" style="font-family: Arial, sans-serif; width: 350px;">
      <!-- Header with address info -->
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px; border-radius: 4px 4px 0 0;">
        <h3 style="margin: 0 0 4px 0; font-size: 15px; font-weight: bold;">
          ${fullAddress}
        </h3>
        <p style="margin: 0; font-size: 12px; opacity: 0.9;">
          ${address.suburbName}, ${address.province}
        </p>
      </div>

      <!-- Static map image -->
      ${
        staticMapUrl
          ? `
        <div style="margin: 8px; text-align: center;">
          <img src="${staticMapUrl}" alt="Property Location" style="width: 100%; height: auto; border-radius: 4px; border: 1px solid #ddd;" />
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #999;">Lightstone Property Map</p>
        </div>
      `
          : loading
          ? `
        <div style="margin: 8px; text-align: center; padding: 20px;">
          <p style="margin: 0; font-size: 12px; color: #666;">Loading map...</p>
        </div>
      `
          : ''
      }

      <!-- Address details -->
      <div style="padding: 8px 12px;">
        <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #eee;">
          <label style="display: block; font-size: 11px; color: #999; font-weight: bold; margin-bottom: 2px;">FULL ADDRESS</label>
          <p style="margin: 0; font-size: 12px; color: #333;">
            ${address.fullAddress || fullAddress}
            ${address.postalCode ? `<br/>${address.postalCode}` : ''}
          </p>
        </div>

        ${
          address.coordinates
            ? `
        <div style="font-size: 11px; color: #666;">
          <p style="margin: 4px 0; display: flex; justify-content: space-between;">
            <span>Latitude:</span>
            <strong>${address.coordinates.latitude.toFixed(4)}</strong>
          </p>
          <p style="margin: 4px 0; display: flex; justify-content: space-between;">
            <span>Longitude:</span>
            <strong>${address.coordinates.longitude.toFixed(4)}</strong>
          </p>
        </div>
      `
            : ''
        }
      </div>

      <!-- Footer -->
      <div style="background: #f5f5f5; padding: 8px 12px; border-radius: 0 0 4px 4px; font-size: 10px; color: #999; text-align: center;">
        Powered by <strong>Lightstone</strong> | Address ID: ${address.addressId}
      </div>
    </div>
  `;
};

/**
 * Error display HTML for InfoWindow when address loading fails
 * 
 * @param error - Error message
 * @returns Formatted HTML string
 */
export const createErrorInfoWindow = (error: string): string => {
  return `
    <div class="lightstone-error-info-window" style="font-family: Arial, sans-serif; width: 300px;">
      <div style="background: #fee; padding: 12px; border-radius: 4px; color: #c33;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">
          ⚠️ Error Loading Address Details
        </h3>
        <p style="margin: 0; font-size: 12px;">
          ${error}
        </p>
        <p style="margin: 8px 0 0 0; font-size: 11px; color: #666;">
          Please try again or contact support.
        </p>
      </div>
    </div>
  `;
};

/**
 * Validates Lightstone API configuration
 * 
 * @returns { isConfigured: boolean; errors: string[] }
 */
export const validateLightstoneConfig = (): { isConfigured: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!process.env.NEXT_PUBLIC_LIGHTSTONE_API_KEY) {
    errors.push('NEXT_PUBLIC_LIGHTSTONE_API_KEY not set in environment variables');
  }

  if (!process.env.NEXT_PUBLIC_LIGHTSTONE_BASE_URL) {
    errors.push('NEXT_PUBLIC_LIGHTSTONE_BASE_URL not set in environment variables');
  }

  return {
    isConfigured: errors.length === 0,
    errors,
  };
};

/**
 * Calculates distance between two addresses (haversine formula)
 * Useful for proximity searches
 * 
 * @param addr1 - First address
 * @param addr2 - Second address
 * @returns Distance in kilometers, or null if coordinates missing
 */
export const calculateDistance = (addr1: AddressData, addr2: AddressData): number | null => {
  if (!addr1.coordinates || !addr2.coordinates) return null;

  const R = 6371; // Earth's radius in kilometers
  const dLat = (addr2.coordinates.latitude - addr1.coordinates.latitude) * (Math.PI / 180);
  const dLon = (addr2.coordinates.longitude - addr1.coordinates.longitude) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(addr1.coordinates.latitude * (Math.PI / 180)) *
      Math.cos(addr2.coordinates.latitude * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
