"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete, GoogleMap, InfoWindow, Marker } from '@react-google-maps/api';
import { useGoogleMapsLoader } from '@/hooks/useGoogleMapsLoader';

type AnyObj = Record<string, any>;
type LatLngLiteral = google.maps.LatLngLiteral;
type LayerId = 'traffic' | 'transit';
type SupportedMapType = 'roadmap' | 'satellite' | 'hybrid' | 'terrain';

interface Props {
  properties: AnyObj[];
  selectedProperty: AnyObj | null;
  setSelectedProperty: (p: AnyObj | null) => void;
  zoom?: number;
  mapTypeId?: 'roadmap' | 'satellite' | 'hybrid' | 'terrain';
  enableGoogleMapControls?: boolean;
  enableMapSearch?: boolean;
}

const GoogleMapWrapper: React.FC<Props> = ({
  properties,
  selectedProperty,
  setSelectedProperty,
  zoom = 6,
  mapTypeId = 'roadmap',
  enableGoogleMapControls = false,
  enableMapSearch = false,
}) => {
  const { mapsApiKey, isLoaded, loadError } = useGoogleMapsLoader();
  const mapRef = useRef<google.maps.Map | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const transitLayerRef = useRef<google.maps.TransitLayer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMarker, setSearchMarker] = useState<AnyObj | null>(null);
  const [activeMapType, setActiveMapType] = useState<SupportedMapType>(mapTypeId);
  const [layerVisibility, setLayerVisibility] = useState<Record<LayerId, boolean>>({
    traffic: false,
    transit: false,
  });

  const safeProperties = useMemo(
    () =>
      properties.filter(
        (p) => typeof p?.lat === 'number' && Number.isFinite(p.lat) && typeof p?.lng === 'number' && Number.isFinite(p.lng)
      ),
    [properties]
  );

  const center = useMemo(() => {
    if (
      typeof selectedProperty?.lat === 'number' &&
      Number.isFinite(selectedProperty.lat) &&
      typeof selectedProperty?.lng === 'number' &&
      Number.isFinite(selectedProperty.lng)
    ) {
      return { lat: selectedProperty.lat, lng: selectedProperty.lng };
    }
    if (safeProperties.length > 0) {
      return { lat: safeProperties[0].lat, lng: safeProperties[0].lng };
    }
    return { lat: -29.4, lng: 24.5 };
  }, [safeProperties, selectedProperty]);

  const setLayerMap = useCallback((layer: LayerId, enabled: boolean) => {
    if (!mapRef.current) return;

    if (layer === 'traffic' && trafficLayerRef.current) {
      trafficLayerRef.current.setMap(enabled ? mapRef.current : null);
      return;
    }
    if (layer === 'transit' && transitLayerRef.current) {
      transitLayerRef.current.setMap(enabled ? mapRef.current : null);
    }
  }, []);

  const apply3DView = useCallback((map: google.maps.Map | null) => {
    if (!map) return;
    const currentZoom = map.getZoom() ?? zoom;
    if (currentZoom >= 18) {
      map.setTilt(45);
      map.setOptions({ rotateControl: true });
      return;
    }
    map.setTilt(0);
  }, [zoom]);

  const toggleLayer = useCallback((layer: LayerId) => {
    setLayerVisibility((prev) => {
      const nextValue = !prev[layer];
      setLayerMap(layer, nextValue);
      return {
        ...prev,
        [layer]: nextValue,
      };
    });
  }, [setLayerMap]);

  const toggleSatelliteView = useCallback(() => {
    setActiveMapType((prev) => {
      if (prev === 'satellite' || prev === 'hybrid') return 'roadmap';
      return 'hybrid';
    });
  }, []);

  const focusMyLocation = useCallback(() => {
    if (!mapRef.current) return;
    if (typeof window === 'undefined' || !navigator.geolocation) {
      alert('Geolocation is not supported in this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const currentPosition: LatLngLiteral = {
          lat: coords.latitude,
          lng: coords.longitude,
        };
        mapRef.current?.panTo(currentPosition);
        mapRef.current?.setZoom(17);
        setSearchMarker({
          id: 'my-location',
          name: 'My Location',
          address: 'Current position',
          lat: currentPosition.lat,
          lng: currentPosition.lng,
          markerColor: '#2563eb',
        });
      },
      () => {
        alert('Unable to access your location. Please allow location permissions.');
      }
    );
  }, []);

  const handleAutocompleteLoad = useCallback((autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRef.current = autocomplete;
  }, []);

  const clearMapSearch = useCallback(() => {
    setSearchQuery('');
    setSearchMarker(null);
    setSelectedProperty(null);
  }, [setSelectedProperty]);

  const resolveFormattedAddress = useCallback(
    (params: { placeId?: string; lat: number; lng: number; fallback: string }) =>
      new Promise<string>((resolve) => {
        if (!(window as any)?.google?.maps) {
          resolve(params.fallback);
          return;
        }

        const geocoder = new google.maps.Geocoder();
        const request = params.placeId
          ? { placeId: params.placeId }
          : { location: { lat: params.lat, lng: params.lng } };

        geocoder.geocode(request as any, (results, status) => {
          if (status === google.maps.GeocoderStatus.OK && results?.[0]?.formatted_address) {
            resolve(results[0].formatted_address);
            return;
          }
          resolve(params.fallback);
        });
      }),
    []
  );

  const handleAutocompletePlaceChanged = useCallback(async () => {
    if (!autocompleteRef.current || !mapRef.current) return;

    const place = autocompleteRef.current.getPlace();
    const location = place?.geometry?.location;
    if (!location) return;

    const lat = location.lat();
    const lng = location.lng();
    const nextPos = { lat, lng };

    const fallbackAddress = place.formatted_address || place.name || 'Selected location';
    const resolvedAddress = await resolveFormattedAddress({
      placeId: place.place_id,
      lat,
      lng,
      fallback: fallbackAddress,
    });

    setSearchQuery(resolvedAddress);
    mapRef.current.panTo(nextPos);
    mapRef.current.setZoom(17);

    const matched = safeProperties.find((item) => {
      const latDiff = Math.abs(Number(item.lat) - lat);
      const lngDiff = Math.abs(Number(item.lng) - lng);
      return latDiff < 0.0007 && lngDiff < 0.0007;
    });

    if (matched) {
      setSearchMarker(null);
      setSelectedProperty(matched);
      return;
    }

    setSelectedProperty(null);
    setSearchMarker({
      id: 'search-result',
      name: place.name || 'Search Result',
      address: resolvedAddress,
      lat,
      lng,
      markerColor: '#2563eb',
    });
  }, [resolveFormattedAddress, safeProperties, setSelectedProperty]);

  const handleManualSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query || !mapRef.current || !(window as any)?.google?.maps) return;

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: query }, async (results, status) => {
      if (status !== google.maps.GeocoderStatus.OK || !results?.[0]?.geometry?.location) {
        alert('Address not found. Please try a more specific address.');
        return;
      }

      const first = results[0];
      const lat = first.geometry.location.lat();
      const lng = first.geometry.location.lng();
      const resolvedAddress = await resolveFormattedAddress({
        placeId: first.place_id,
        lat,
        lng,
        fallback: first.formatted_address || query,
      });

      setSearchQuery(resolvedAddress);
      mapRef.current?.panTo({ lat, lng });
      mapRef.current?.setZoom(17);
      setSelectedProperty(null);
      setSearchMarker({
        id: 'search-result',
        name: first.formatted_address || query,
        address: resolvedAddress,
        lat,
        lng,
        markerColor: '#2563eb',
      });
    });
  }, [resolveFormattedAddress, searchQuery, setSelectedProperty]);

  const handleLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;

    if (safeProperties.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      safeProperties.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds);
    }

    trafficLayerRef.current = new google.maps.TrafficLayer();
    transitLayerRef.current = new google.maps.TransitLayer();

    apply3DView(map);
  }, [safeProperties, apply3DView]);

  const handleUnmount = useCallback(() => {
    if (trafficLayerRef.current) trafficLayerRef.current.setMap(null);
    if (transitLayerRef.current) transitLayerRef.current.setMap(null);
    mapRef.current = null;
  }, []);

  useEffect(() => {
    if (
      !mapRef.current ||
      typeof selectedProperty?.lat !== 'number' ||
      !Number.isFinite(selectedProperty.lat) ||
      typeof selectedProperty?.lng !== 'number' ||
      !Number.isFinite(selectedProperty.lng)
    ) {
      return;
    }
    mapRef.current.panTo({ lat: selectedProperty.lat, lng: selectedProperty.lng });
    mapRef.current.setZoom(Math.max(mapRef.current.getZoom() || 0, 17));
    apply3DView(mapRef.current);
  }, [selectedProperty, apply3DView]);

  useEffect(() => {
    setActiveMapType(mapTypeId);
  }, [mapTypeId]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setMapTypeId(activeMapType);
    apply3DView(mapRef.current);
  }, [activeMapType, zoom, apply3DView]);

  useEffect(() => {
    setLayerMap('traffic', layerVisibility.traffic);
    setLayerMap('transit', layerVisibility.transit);
  }, [layerVisibility, setLayerMap]);

  const getPropertyMarkerIcon = useCallback((location: AnyObj) => {
    const isSelected = selectedProperty?.id === location.id;
    const markerColor = location.markerColor || '#16a34a';

    // House-shaped marker for broker-added properties.
    return {
      path: 'M 0 -14 L 14 -3 L 10 -3 L 10 14 L -10 14 L -10 -3 L -14 -3 Z M -3 14 L -3 5 L 3 5 L 3 14 Z',
      fillColor: markerColor,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: isSelected ? 2.8 : 2.2,
      scale: isSelected ? 1.18 : 1,
    };
  }, [selectedProperty]);

  const getSearchMarkerIcon = useCallback(() => {
    const googleSymbolPath =
      typeof window !== 'undefined' && (window as any)?.google?.maps?.SymbolPath
        ? (window as any).google.maps.SymbolPath
        : null;

    if (!googleSymbolPath) {
      return {
        path: 'M 0 -10 A 10 10 0 1 1 0 10 A 10 10 0 1 1 0 -10 Z',
        fillColor: '#2563eb',
        fillOpacity: 0.95,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 1,
      };
    }

    return {
      path: googleSymbolPath.CIRCLE,
      fillColor: '#2563eb',
      fillOpacity: 0.95,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 7,
    };
  }, []);

  const mapOptions = useMemo(
    () => ({
      // Enable native Google Street View (Pegman) control.
      streetViewControl: true,
      mapTypeControl: false,
      // Enable native Google full-screen control.
      fullscreenControl: true,
      rotateControl: false,
      zoomControl: true,
      scaleControl: false,
      clickableIcons: true,
      keyboardShortcuts: true,
      gestureHandling: 'greedy' as const,
      mapTypeId: activeMapType,
    }),
    [activeMapType]
  );

  if (!mapsApiKey) {
    return (
      <div className="w-full h-full min-h-[500px] flex items-center justify-center bg-stone-100 text-stone-700 p-6 text-center">
        Google Maps API key is missing. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to enable map features.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-full h-full min-h-[500px] flex items-center justify-center bg-stone-100 text-stone-700 p-6 text-center">
        Google Maps failed to load. Check API key, domain restrictions, and enabled Maps/Places APIs.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full min-h-[500px] bg-stone-100 animate-pulse" aria-hidden="true" />
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%', minHeight: '500px' }}
      center={center}
      zoom={zoom}
      onLoad={handleLoad}
      onUnmount={handleUnmount}
      onZoomChanged={() => apply3DView(mapRef.current)}
      options={mapOptions}
    >
        {enableMapSearch && (
          <div className="absolute top-3 left-3 z-10 w-[min(420px,calc(100%-1.5rem))]">
            <Autocomplete
              onLoad={handleAutocompleteLoad}
              onPlaceChanged={handleAutocompletePlaceChanged}
              options={{
                fields: ['formatted_address', 'geometry', 'name', 'place_id'],
              }}
            >
              <div className="relative">
                <input
                  value={searchQuery}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setSearchQuery(nextValue);
                    if (!nextValue.trim()) {
                      setSearchMarker(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleManualSearch();
                    }
                  }}
                  placeholder="Search places, addresses, streets..."
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 pr-20 text-sm shadow"
                />
                {searchQuery ? (
                  <button
                    onClick={clearMapSearch}
                    type="button"
                    className="absolute right-12 top-1/2 -translate-y-1/2 rounded px-1 text-stone-500 hover:bg-stone-100"
                    title="Clear search"
                  >
                    ×
                  </button>
                ) : null}
                <button
                  onClick={() => void handleManualSearch()}
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-stone-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-stone-700"
                >
                  Go
                </button>
              </div>
            </Autocomplete>
          </div>
        )}

      {enableGoogleMapControls && (
          <div className="absolute top-14 right-3 z-10 flex flex-col gap-2">
            <button
              onClick={toggleSatelliteView}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium shadow ${
                activeMapType === 'satellite' || activeMapType === 'hybrid'
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-300 bg-white text-stone-700'
              }`}
            >
              {activeMapType === 'satellite' || activeMapType === 'hybrid' ? 'Map' : 'Satellite'}
            </button>
            <button
              onClick={() => toggleLayer('traffic')}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium shadow ${
                layerVisibility.traffic
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-stone-300 bg-white text-stone-700'
              }`}
            >
              Traffic
            </button>
            <button
              onClick={() => toggleLayer('transit')}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium shadow ${
                layerVisibility.transit
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-stone-300 bg-white text-stone-700'
              }`}
            >
              Transit
            </button>
            <button
              onClick={focusMyLocation}
              className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow"
            >
              My Location
            </button>
          </div>
        )}

        {safeProperties.map((location) => (
          <Marker
            key={location.id}
            position={{ lat: location.lat, lng: location.lng }}
            onClick={() => setSelectedProperty(location)}
            icon={getPropertyMarkerIcon(location)}
          >
            {selectedProperty?.id === location.id && (
              <InfoWindow
                position={{ lat: location.lat, lng: location.lng }}
                onCloseClick={() => setSelectedProperty(null)}
              >
                <div className="max-w-xs space-y-2">
                  <h4 className="font-bold text-sm mb-1">{location.name}</h4>
                  <p className="text-xs text-gray-600">{location.address}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <p><span className="font-semibold">Asset:</span> {location.assetId ?? '-'}</p>
                    <p><span className="font-semibold">Type:</span> {location.propertyType ?? '-'}</p>
                    <p><span className="font-semibold">SQM:</span> {location.sqm ?? '-'}</p>
                    <p><span className="font-semibold">GLA:</span> {location.gla ?? '-'}</p>
                    <p><span className="font-semibold">Year:</span> {location.yearBuilt ?? '-'}</p>
                    <p><span className="font-semibold">Status:</span> {location.ownershipStatus ?? '-'}</p>
                    <p><span className="font-semibold">Condition:</span> {location.condition ?? '-'}</p>
                    <p><span className="font-semibold">Broker:</span> {location.brokerName ?? '-'}</p>
                    <p><span className="font-semibold">Deals:</span> {location.linkedDealsCount ?? 0}</p>
                    <p><span className="font-semibold">Contacts:</span> {location.linkedContactsCount ?? 0}</p>
                    <p><span className="font-semibold">Company:</span> {location.linkedCompanyName ?? '-'}</p>
                    <p><span className="font-semibold">Fund:</span> {location.linkedFundName ?? '-'}</p>
                    <p><span className="font-semibold">Lat:</span> {Number(location.lat).toFixed(6)}</p>
                    <p><span className="font-semibold">Lng:</span> {Number(location.lng).toFixed(6)}</p>
                  </div>
                  <p className="text-[11px] text-stone-500">Clicking this pin also opens the full property profile panel.</p>
                </div>
              </InfoWindow>
            )}
          </Marker>
        ))}

        {searchMarker && (
          <Marker
            key={searchMarker.id}
            position={{ lat: searchMarker.lat, lng: searchMarker.lng }}
            onClick={() => setSearchMarker(searchMarker)}
            icon={getSearchMarkerIcon()}
          >
            <InfoWindow
              position={{ lat: searchMarker.lat, lng: searchMarker.lng }}
              onCloseClick={() => setSearchMarker(null)}
            >
              <div className="max-w-xs">
                <h4 className="font-bold text-sm mb-1">{searchMarker.name}</h4>
                <p className="text-xs text-gray-600">{searchMarker.address}</p>
              </div>
            </InfoWindow>
          </Marker>
        )}
    </GoogleMap>
  );
};

export default GoogleMapWrapper;
