/**
 * useLightstone Hook
 * 
 * React hook for managing Lightstone API calls with loading states,
 * error handling, and caching. Integrates seamlessly with Google Maps.
 * 
 * @author CRM Development Team
 * @version 1.0.0
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import lightstoneService, { AddressData, SuburbAddressResponse, ApiError } from '@/services/lightstoneService';

interface UseLightstoneState {
  addresses: AddressData[];
  staticMapUrl: string | null;
  loading: boolean;
  error: ApiError | null;
  success: boolean;
}

interface UseLightstoneAddressesReturn extends UseLightstoneState {
  fetchAddresses: (suburbId: string, options?: any) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

interface UseLightstoneMapReturn {
  mapUrl: string | null;
  loading: boolean;
  error: ApiError | null;
  fetchStaticMap: (params: {
    id: string;
    zoom: number;
    lat: number;
    lon: number;
    width?: number;
    height?: number;
  }) => Promise<void>;
  clearError: () => void;
}

/**
 * Hook for fetching addresses from a suburb/street
 * 
 * Usage:
 * ```
 * const { addresses, loading, error, fetchAddresses } = useLightstoneAddresses();
 * 
 * useEffect(() => {
 *   if (suburbId) {
 *     fetchAddresses(suburbId);
 *   }
 * }, [suburbId]);
 * ```
 */
export const useLightstoneAddresses = (): UseLightstoneAddressesReturn => {
  const [state, setState] = useState<UseLightstoneState>({
    addresses: [],
    staticMapUrl: null,
    loading: false,
    error: null,
    success: false,
  });

  const fetchAddresses = useCallback(
    async (suburbId: string, options?: { pageSize?: number; pageNumber?: number; searchTerm?: string }) => {
      setState(prev => ({ ...prev, loading: true, error: null }));

      try {
        if (!suburbId) {
          throw {
            code: 'INVALID_INPUT',
            message: 'Suburb ID is required',
            status: 400,
          } as ApiError;
        }

        const response: SuburbAddressResponse = await lightstoneService.getSuburbStreetAddresses(
          suburbId,
          options
        );

        setState(prev => ({
          ...prev,
          addresses: response.data || [],
          loading: false,
          success: true,
          error: null,
        }));
      } catch (err) {
        const error = err as ApiError;
        setState(prev => ({
          ...prev,
          loading: false,
          error,
          success: false,
          addresses: [],
        }));
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const reset = useCallback(() => {
    setState({
      addresses: [],
      staticMapUrl: null,
      loading: false,
      error: null,
      success: false,
    });
  }, []);

  return {
    ...state,
    fetchAddresses,
    clearError,
    reset,
  };
};

/**
 * Hook for fetching static map images
 * 
 * Usage:
 * ```
 * const { mapUrl, loading, error, fetchStaticMap } = useLightstoneStaticMap();
 * 
 * const handleSelectAddress = (address) => {
 *   fetchStaticMap({
 *     id: address.id,
 *     zoom: 15,
 *     lat: address.coordinates.latitude,
 *     lon: address.coordinates.longitude,
 *   });
 * };
 * ```
 */
export const useLightstoneStaticMap = (): UseLightstoneMapReturn => {
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const fetchStaticMap = useCallback(
    async (params: {
      id: string;
      zoom: number;
      lat: number;
      lon: number;
      width?: number;
      height?: number;
    }) => {
      setLoading(true);
      setError(null);

      try {
        const url = await lightstoneService.getStaticMapImage({
          ...params,
          width: params.width || 400,
          height: params.height || 300,
        });

        setMapUrl(url);
      } catch (err) {
        setError(err as ApiError);
        setMapUrl(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    mapUrl,
    loading,
    error,
    fetchStaticMap,
    clearError,
  };
};

/**
 * Hook combining both address fetching and static map fetching
 * Useful for complete suburb/address/map workflows
 */
export const useLightstone = () => {
  const addresses = useLightstoneAddresses();
  const staticMap = useLightstoneStaticMap();

  const selectAddress = useCallback(
    async (address: AddressData) => {
      if (!address.coordinates) {
        console.error('Selected address does not have valid coordinates');
        return;
      }

      await staticMap.fetchStaticMap({
        id: address.addressId,
        zoom: 15,
        lat: address.coordinates.latitude,
        lon: address.coordinates.longitude,
      });
    },
    [staticMap]
  );

  return {
    addresses,
    staticMap,
    selectAddress,
  };
};
