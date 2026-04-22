"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete, GoogleMap, InfoWindow, Marker } from '@react-google-maps/api';
import { useGoogleMapsLoader } from '@/hooks/useGoogleMapsLoader';

type AnyObj = Record<string, any>;
type LatLngLiteral = google.maps.LatLngLiteral;
type LayerId = 'traffic' | 'transit';
type StreetViewState = { lat: number; lng: number; heading?: number } | null;
type SupportedMapType = 'roadmap' | 'satellite' | 'hybrid' | 'terrain';

interface SearchResultMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  rating?: number;
}

interface Props {
  properties: AnyObj[];
  selectedProperty: AnyObj | null;
  setSelectedProperty: (p: AnyObj | null) => void;
  zoom?: number;
  mapTypeId?: 'roadmap' | 'satellite' | 'hybrid' | 'terrain';
  enableGoogleMapControls?: boolean;
  enableMapSearch?: boolean;
  searchResultMarkers?: SearchResultMarker[];
  onSearchResultMarkerClick?: (marker: SearchResultMarker) => void;
  onMapReady?: (map: google.maps.Map) => void;
  focusLocation?: { lat: number; lng: number; zoom?: number } | null;
}

// ─── Collapsible map controls panel ────────────────────────────────────────
interface MapControlsPanelProps {
  activeMapType: SupportedMapType;
  layerVisibility: Record<LayerId, boolean>;
  streetViewError: boolean;
  selectedPropertyName?: string;
  onToggleSatellite: () => void;
  onToggleTraffic: () => void;
  onToggleTransit: () => void;
  onMyLocation: () => void;
  onStreetView: () => void;
}

const MapControlsPanel: React.FC<MapControlsPanelProps> = ({
  activeMapType,
  layerVisibility,
  streetViewError,
  selectedPropertyName,
  onToggleSatellite,
  onToggleTraffic,
  onToggleTransit,
  onMyLocation,
  onStreetView,
}) => {
  const [expanded, setExpanded] = useState(true);
  const isSatellite = activeMapType === 'satellite' || activeMapType === 'hybrid';

  return (
    <div className="absolute bottom-24 right-4 z-10 flex flex-col-reverse items-end gap-0" style={{ minWidth: '140px' }}>
      {/* Toggle header */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl shadow-lg px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors select-none mt-2"
        style={{ whiteSpace: 'nowrap' }}
      >
        <svg
          className={`w-3.5 h-3.5 text-stone-500 transition-transform duration-200 ${expanded ? 'rotate-180' : 'rotate-0'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        Map Controls
      </button>

      {/* Expandable controls — expands upward */}
      {expanded && (
        <div className="bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden" style={{ minWidth: '140px' }}>
          {/* Satellite */}
          <button
            onClick={onToggleSatellite}
            className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium border-b border-stone-100 transition-colors ${
              isSatellite
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            <span className="text-base">🛰</span>
            {isSatellite ? 'Road Map' : 'Satellite'}
          </button>

          {/* Traffic */}
          <button
            onClick={onToggleTraffic}
            className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium border-b border-stone-100 transition-colors ${
              layerVisibility.traffic
                ? 'bg-blue-600 text-white'
                : 'bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            <span className="text-base">🚦</span>
            Traffic
            {layerVisibility.traffic && (
              <span className="ml-auto text-[10px] bg-white bg-opacity-30 px-1.5 py-0.5 rounded-full font-bold">ON</span>
            )}
          </button>

          {/* Transit */}
          <button
            onClick={onToggleTransit}
            className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium border-b border-stone-100 transition-colors ${
              layerVisibility.transit
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            <span className="text-base">🚌</span>
            Transit
            {layerVisibility.transit && (
              <span className="ml-auto text-[10px] bg-white bg-opacity-30 px-1.5 py-0.5 rounded-full font-bold">ON</span>
            )}
          </button>

          {/* My Location */}
          <button
            onClick={onMyLocation}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-stone-700 border-b border-stone-100 hover:bg-stone-50 transition-colors bg-white"
          >
            <span className="text-base">📍</span>
            My Location
          </button>

          {/* Street View */}
          <button
            onClick={onStreetView}
            title={selectedPropertyName ? `Street View: ${selectedPropertyName}` : 'Street View at map center'}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors bg-white"
          >
            <span className="text-base">🚶</span>
            Street View
          </button>

          {streetViewError && (
            <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">
              No Street View available here.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

const GoogleMapWrapper: React.FC<Props> = ({
  properties,
  selectedProperty,
  setSelectedProperty,
  zoom = 6,
  mapTypeId = 'roadmap',
  enableGoogleMapControls = false,
  enableMapSearch = false,
  searchResultMarkers,
  onSearchResultMarkerClick,
  onMapReady,
  focusLocation,
}) => {
  const { mapsApiKey, isLoaded, loadError } = useGoogleMapsLoader();
  const mapRef = useRef<google.maps.Map | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const transitLayerRef = useRef<google.maps.TransitLayer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMarker, setSearchMarker] = useState<AnyObj | null>(null);
  const [myLocationMarker, setMyLocationMarker] = useState<LatLngLiteral | null>(null);
  const [myLocationAccuracy, setMyLocationAccuracy] = useState<number>(0);
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const streetViewContainerRef = useRef<HTMLDivElement | null>(null);
  const [streetViewState, setStreetViewState] = useState<StreetViewState>(null);
  const [streetViewError, setStreetViewError] = useState(false);
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
        setMyLocationMarker(currentPosition);
        setMyLocationAccuracy(coords.accuracy);

        // Draw / update accuracy circle
        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.setMap(null);
        }
        if (mapRef.current && coords.accuracy > 0) {
          accuracyCircleRef.current = new google.maps.Circle({
            strokeColor: '#1d6bd6',
            strokeOpacity: 0.4,
            strokeWeight: 1,
            fillColor: '#1d6bd6',
            fillOpacity: 0.08,
            map: mapRef.current,
            center: currentPosition,
            radius: coords.accuracy,
          });
        }
      },
      () => {
        alert('Unable to access your location. Please allow location permissions in your browser.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
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

  const openStreetViewAt = useCallback((lat: number, lng: number) => {
    setStreetViewError(false);
    if (!(window as any)?.google?.maps) return;

    const sv = new google.maps.StreetViewService();
    sv.getPanorama(
      { location: { lat, lng }, radius: 100, source: google.maps.StreetViewSource.OUTDOOR },
      (data, status) => {
        if (status === google.maps.StreetViewStatus.OK && data?.location?.latLng) {
          const panoLat = data.location.latLng.lat();
          const panoLng = data.location.latLng.lng();
          // Compute heading toward the requested point.
          const heading = google.maps.geometry?.spherical
            ? google.maps.geometry.spherical.computeHeading(
                data.location.latLng,
                new google.maps.LatLng(lat, lng)
              )
            : 0;
          setStreetViewState({ lat: panoLat, lng: panoLng, heading: heading ?? 0 });
        } else {
          setStreetViewError(true);
          setTimeout(() => setStreetViewError(false), 3000);
        }
      }
    );
  }, []);

  const handleOpenStreetView = useCallback(() => {
    if (selectedProperty && typeof selectedProperty.lat === 'number' && typeof selectedProperty.lng === 'number') {
      openStreetViewAt(selectedProperty.lat, selectedProperty.lng);
      return;
    }
    if (myLocationMarker) {
      openStreetViewAt(myLocationMarker.lat, myLocationMarker.lng);
      return;
    }
    if (searchMarker && typeof searchMarker.lat === 'number') {
      openStreetViewAt(searchMarker.lat, searchMarker.lng);
      return;
    }
    // Fall back: open Street View for map center
    if (mapRef.current) {
      const c = mapRef.current.getCenter();
      if (c) openStreetViewAt(c.lat(), c.lng());
    }
  }, [openStreetViewAt, selectedProperty, myLocationMarker, searchMarker]);

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
    onMapReady?.(map);
  }, [safeProperties, apply3DView, onMapReady]);

  const handleUnmount = useCallback(() => {
    if (trafficLayerRef.current) trafficLayerRef.current.setMap(null);
    if (transitLayerRef.current) transitLayerRef.current.setMap(null);
    if (accuracyCircleRef.current) accuracyCircleRef.current.setMap(null);
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
    if (!mapRef.current || !focusLocation) return;
    mapRef.current.panTo({ lat: focusLocation.lat, lng: focusLocation.lng });
    mapRef.current.setZoom(focusLocation.zoom ?? 15);
  }, [focusLocation]);

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

  const getMyLocationIcon = useCallback(() => {
    // Classic Google Maps pulsing blue dot as SVG data URI
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="#1d6bd6" fill-opacity="0.18"/>
        <circle cx="12" cy="12" r="6" fill="#1d6bd6" stroke="white" stroke-width="2"/>
        <circle cx="12" cy="12" r="2.5" fill="white"/>
      </svg>
    `.trim();
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(28, 28),
      anchor: new google.maps.Point(14, 14),
    };
  }, []);

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

  const getSearchResultNumberedIcon = useCallback((index: number) => {
    const num = index + 1;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40"><path d="M16 0 C7.163 0 0 7.163 0 16 C0 28 16 40 16 40 C16 40 32 28 32 16 C32 7.163 24.837 0 16 0 Z" fill="#EA4335"/><circle cx="16" cy="16" r="9" fill="white"/><text x="16" y="20.5" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="${num > 9 ? 9 : 11}" font-weight="bold" fill="#EA4335">${num}</text></svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(32, 40),
      anchor: new google.maps.Point(16, 40),
    };
  }, []);

  const mapOptions = useMemo(
    () => ({
      streetViewControl: true,
      mapTypeControl: false,
      zoomControl: true,
      scaleControl: false,
      clickableIcons: true,
      keyboardShortcuts: true,
      gestureHandling: 'greedy' as const,
      mapTypeId: activeMapType,
    }),
    [activeMapType]
  );

  // Mount Street View panorama into the overlay div whenever streetViewState changes
  useEffect(() => {
    if (!streetViewState || !streetViewContainerRef.current) return;
    if (!(window as any)?.google?.maps) return;

    const pano = new google.maps.StreetViewPanorama(streetViewContainerRef.current, {
      position: { lat: streetViewState.lat, lng: streetViewState.lng },
      pov: { heading: streetViewState.heading ?? 0, pitch: 5 },
      zoom: 1,
      addressControl: true,
      addressControlOptions: { position: google.maps.ControlPosition.BOTTOM_CENTER },
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
      showRoadLabels: true,
    });

    return () => {
      pano.setVisible(false);
    };
  }, [streetViewState]);

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
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '500px' }}>
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
        <MapControlsPanel
          activeMapType={activeMapType}
          layerVisibility={layerVisibility}
          streetViewError={streetViewError}
          onToggleSatellite={toggleSatelliteView}
          onToggleTraffic={() => toggleLayer('traffic')}
          onToggleTransit={() => toggleLayer('transit')}
          onMyLocation={focusMyLocation}
          onStreetView={handleOpenStreetView}
          selectedPropertyName={selectedProperty?.name}
        />
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
                <div className="max-w-xs" style={{ minWidth: '240px' }}>
                  {/* Name + address */}
                  <h4 className="font-bold text-sm mb-0.5 text-gray-900">{location.name}</h4>
                  <p className="text-xs text-gray-700 mb-2 flex items-start gap-1">
                    <span style={{ marginTop: '1px' }}>📍</span>
                    <span>{location.address || 'Address not available'}</span>
                  </p>

                  {/* Satellite + Street View buttons */}
                  <div className="flex gap-1.5 mb-2">
                    <button
                      onClick={toggleSatelliteView}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors"
                      style={
                        activeMapType === 'satellite' || activeMapType === 'hybrid'
                          ? { background: '#1e293b', color: '#fff', borderColor: '#1e293b' }
                          : { background: '#f8fafc', color: '#334155', borderColor: '#cbd5e1' }
                      }
                    >
                      🛰 {activeMapType === 'satellite' || activeMapType === 'hybrid' ? 'Map' : 'Satellite'}
                    </button>
                    <button
                      onClick={() => openStreetViewAt(location.lat, location.lng)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors"
                      style={{ background: '#f8fafc', color: '#334155', borderColor: '#cbd5e1' }}
                    >
                      🚶 Street View
                    </button>
                  </div>

                  {streetViewError && (
                    <p className="text-xs text-red-600 mb-2">No Street View available here.</p>
                  )}

                  {/* Property details grid */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs border-t border-gray-100 pt-2">
                    <p><span className="font-semibold text-gray-500">Type:</span> <span className="text-gray-800">{location.propertyType ?? '-'}</span></p>
                    <p><span className="font-semibold text-gray-500">Status:</span> <span className="text-gray-800">{location.ownershipStatus ?? '-'}</span></p>
                    <p><span className="font-semibold text-gray-500">SQM:</span> <span className="text-gray-800">{location.sqm ?? '-'}</span></p>
                    <p><span className="font-semibold text-gray-500">GLA:</span> <span className="text-gray-800">{location.gla ?? '-'}</span></p>
                    <p><span className="font-semibold text-gray-500">Year:</span> <span className="text-gray-800">{location.yearBuilt ?? '-'}</span></p>
                    <p><span className="font-semibold text-gray-500">Condition:</span> <span className="text-gray-800">{location.condition ?? '-'}</span></p>
                    {location.brokerName && location.brokerName !== 'Unassigned' && (
                      <p className="col-span-2"><span className="font-semibold text-gray-500">Broker:</span> <span className="text-gray-800">{location.brokerName}</span></p>
                    )}
                    {location.linkedCompanyName && (
                      <p className="col-span-2"><span className="font-semibold text-gray-500">Company:</span> <span className="text-gray-800">{location.linkedCompanyName}</span></p>
                    )}
                  </div>
                </div>
              </InfoWindow>
            )}
          </Marker>
        ))}

        {searchResultMarkers?.map((marker, index) => (
          <Marker
            key={`sr-${marker.id}`}
            position={{ lat: marker.lat, lng: marker.lng }}
            icon={getSearchResultNumberedIcon(index)}
            onClick={() => onSearchResultMarkerClick?.(marker)}
            zIndex={100 + index}
          />
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

        {myLocationMarker && (
          <Marker
            key="my-location"
            position={myLocationMarker}
            icon={getMyLocationIcon()}
            title="Your location"
            zIndex={999}
          >
            <InfoWindow
              position={myLocationMarker}
              onCloseClick={() => {
                setMyLocationMarker(null);
                if (accuracyCircleRef.current) {
                  accuracyCircleRef.current.setMap(null);
                  accuracyCircleRef.current = null;
                }
              }}
            >
              <div>
                <p className="font-semibold text-sm">Your Location</p>
                {myLocationAccuracy > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Accuracy: ±{Math.round(myLocationAccuracy)} m
                  </p>
                )}
                <button
                  onClick={() => openStreetViewAt(myLocationMarker.lat, myLocationMarker.lng)}
                  className="mt-1.5 rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                >
                  Open Street View here
                </button>
              </div>
            </InfoWindow>
          </Marker>
        )}
    </GoogleMap>

    {/* ─── Street View overlay ─────────────────────────────────────── */}
    {streetViewState && (
      <div
        style={{ position: 'absolute', inset: 0, zIndex: 20 }}
      >
        {/* Panorama renders here via useEffect */}
        <div ref={streetViewContainerRef} style={{ width: '100%', height: '100%' }} />
        {/* Close button */}
        <button
          onClick={() => setStreetViewState(null)}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'white',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#374151',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            cursor: 'pointer',
          }}
        >
          ← Back to Map
        </button>
      </div>
    )}
    </div>
  );
};

export default GoogleMapWrapper;
