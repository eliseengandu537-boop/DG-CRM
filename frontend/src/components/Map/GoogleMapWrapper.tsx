"use client";

// Note: filename kept as GoogleMapWrapper so existing dynamic imports keep working.
// Implementation is now Leaflet + OpenStreetMap (free, no API key). Street View
// opens via Google's free URL scheme in a new tab.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocodeAddress, streetViewUrl } from '@/lib/nominatim';
import PropertyClusterLayer from './PropertyClusterLayer';

type AnyObj = Record<string, any>;
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
  mapTypeId?: SupportedMapType;
  enableGoogleMapControls?: boolean;
  enableMapSearch?: boolean;
  searchResultMarkers?: SearchResultMarker[];
  onSearchResultMarkerClick?: (marker: SearchResultMarker) => void;
  onMapReady?: (map: L.Map) => void;
  focusLocation?: { lat: number; lng: number; zoom?: number } | null;
}

// ─── Tile layer URLs ──────────────────────────────────────────────────────
const TILE_ROADMAP = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ROADMAP_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// Esri's World Imagery free tile service for satellite view (no key required).
const TILE_SATELLITE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_SATELLITE_ATTR =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics';
// Transparent labels overlay (roads, place names, boundaries) over satellite imagery.
const TILE_SATELLITE_LABELS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const TILE_TERRAIN = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
const TILE_TERRAIN_ATTR =
  '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)';

// Esri imagery has native tiles up to z=18 globally; some areas go higher but
// rural SA caps lower. Cap the layer's nativeZoom and let Leaflet upscale
// gently above that so the user can still zoom in without the tiles
// shattering or going blank.
const SATELLITE_MAX_NATIVE_ZOOM = 18;
const OSM_MAX_NATIVE_ZOOM = 19;
const TERRAIN_MAX_NATIVE_ZOOM = 17;
const MAP_MAX_ZOOM = 20;

// ─── Custom house-shaped pin SVG matching the prior Google marker style ───
function buildPropertyPinSvg(color: string, isSelected: boolean): string {
  const scale = isSelected ? 1.18 : 1;
  const stroke = isSelected ? 2.8 : 2.2;
  // House outline matches the prior GoogleMap symbol path so users see the same icon.
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(34 * scale)}" height="${Math.round(34 * scale)}" viewBox="-16 -16 32 32">
      <path d="M 0 -14 L 14 -3 L 10 -3 L 10 14 L -10 14 L -10 -3 L -14 -3 Z M -3 14 L -3 5 L 3 5 L 3 14 Z"
            fill="${color}" stroke="#ffffff" stroke-width="${stroke}" />
    </svg>
  `.trim();
}

function propertyDivIcon(color: string, isSelected: boolean): L.DivIcon {
  const size = isSelected ? 40 : 34;
  return L.divIcon({
    className: 'crm-property-pin',
    html: buildPropertyPinSvg(color, isSelected),
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 4],
    popupAnchor: [0, -size + 6],
  });
}

function searchResultDivIcon(index: number): L.DivIcon {
  const num = index + 1;
  const html = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <path d="M16 0 C7.163 0 0 7.163 0 16 C0 28 16 40 16 40 C16 40 32 28 32 16 C32 7.163 24.837 0 16 0 Z" fill="#EA4335"/>
    <circle cx="16" cy="16" r="9" fill="white"/>
    <text x="16" y="20.5" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="${num > 9 ? 9 : 11}" font-weight="bold" fill="#EA4335">${num}</text>
  </svg>`;
  return L.divIcon({
    className: 'crm-search-pin',
    html,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -38],
  });
}

const myLocationDivIcon: L.DivIcon = L.divIcon({
  className: 'crm-me-pin',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="#1d6bd6" fill-opacity="0.18"/>
    <circle cx="12" cy="12" r="6" fill="#1d6bd6" stroke="white" stroke-width="2"/>
    <circle cx="12" cy="12" r="2.5" fill="white"/>
  </svg>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const searchMarkerIcon: L.DivIcon = L.divIcon({
  className: 'crm-search-marker',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="-11 -11 22 22">
    <circle cx="0" cy="0" r="9" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>
  </svg>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -10],
});

// ─── Imperative bridge to the Leaflet map instance ────────────────────────
function MapBridge({
  onReady,
  focusLocation,
  selectedProperty,
  fitProperties,
}: {
  onReady?: (map: L.Map) => void;
  focusLocation?: { lat: number; lng: number; zoom?: number } | null;
  selectedProperty: AnyObj | null;
  fitProperties: AnyObj[];
}) {
  const map = useMap();
  const initialFitDone = useRef(false);

  useEffect(() => {
    if (onReady) onReady(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit to all property pins on first load (when several pins exist).
  useEffect(() => {
    if (initialFitDone.current) return;
    if (fitProperties.length < 2) return;
    const bounds = L.latLngBounds(fitProperties.map((p) => L.latLng(p.lat, p.lng)));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40] });
      initialFitDone.current = true;
    }
  }, [fitProperties, map]);

  // Pan to selected property.
  useEffect(() => {
    if (
      !selectedProperty ||
      typeof selectedProperty.lat !== 'number' ||
      !Number.isFinite(selectedProperty.lat) ||
      typeof selectedProperty.lng !== 'number' ||
      !Number.isFinite(selectedProperty.lng)
    ) {
      return;
    }
    const targetZoom = Math.max(map.getZoom(), 17);
    map.setView([selectedProperty.lat, selectedProperty.lng], targetZoom, { animate: true });
  }, [selectedProperty, map]);

  // External focusLocation prop (e.g. focus from deep-link / search bar).
  useEffect(() => {
    if (!focusLocation) return;
    map.setView([focusLocation.lat, focusLocation.lng], focusLocation.zoom ?? 15, { animate: true });
  }, [focusLocation, map]);

  return null;
}

// ─── Collapsible map controls panel (same UI shape as before) ─────────────
const MapControlsPanel: React.FC<{
  activeMapType: SupportedMapType;
  selectedPropertyName?: string;
  onToggleSatellite: () => void;
  onMyLocation: () => void;
  onStreetView: () => void;
}> = ({ activeMapType, selectedPropertyName, onToggleSatellite, onMyLocation, onStreetView }) => {
  const [expanded, setExpanded] = useState(true);
  const isSatellite = activeMapType === 'satellite' || activeMapType === 'hybrid';

  return (
    <div
      className="absolute bottom-24 right-4 z-[1100] flex flex-col-reverse items-end gap-0"
      style={{ minWidth: '140px' }}
    >
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl shadow-lg px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors select-none mt-2"
        style={{ whiteSpace: 'nowrap' }}
      >
        <svg
          className={`w-3.5 h-3.5 text-stone-500 transition-transform duration-200 ${
            expanded ? 'rotate-180' : 'rotate-0'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        Map Controls
      </button>

      {expanded && (
        <div
          className="bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden"
          style={{ minWidth: '140px' }}
        >
          <button
            onClick={onToggleSatellite}
            className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium border-b border-stone-100 transition-colors ${
              isSatellite ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            <span className="text-base">🛰</span>
            {isSatellite ? 'Road Map' : 'Satellite'}
          </button>

          <button
            onClick={onMyLocation}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-stone-700 border-b border-stone-100 hover:bg-stone-50 transition-colors bg-white"
          >
            <span className="text-base">📍</span>
            My Location
          </button>

          <button
            onClick={onStreetView}
            title={selectedPropertyName ? `Street View: ${selectedPropertyName}` : 'Street View at map center'}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors bg-white"
          >
            <span className="text-base">🚶</span>
            Street View
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Main wrapper ─────────────────────────────────────────────────────────
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
  const mapRef = useRef<L.Map | null>(null);
  const [activeMapType, setActiveMapType] = useState<SupportedMapType>(mapTypeId);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMarker, setSearchMarker] = useState<AnyObj | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);

  useEffect(() => setActiveMapType(mapTypeId), [mapTypeId]);

  const safeProperties = useMemo(
    () =>
      properties.filter(
        (p) =>
          typeof p?.lat === 'number' &&
          Number.isFinite(p.lat) &&
          typeof p?.lng === 'number' &&
          Number.isFinite(p.lng)
      ),
    [properties]
  );

  const initialCenter = useMemo<[number, number]>(() => {
    if (
      typeof selectedProperty?.lat === 'number' &&
      Number.isFinite(selectedProperty.lat) &&
      typeof selectedProperty?.lng === 'number' &&
      Number.isFinite(selectedProperty.lng)
    ) {
      return [selectedProperty.lat, selectedProperty.lng];
    }
    if (safeProperties.length > 0) return [safeProperties[0].lat, safeProperties[0].lng];
    return [-29.4, 24.5]; // South Africa centre
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReady = useCallback(
    (map: L.Map) => {
      mapRef.current = map;
      onMapReady?.(map);
    },
    [onMapReady]
  );

  const toggleSatellite = useCallback(() => {
    setActiveMapType((prev) => (prev === 'satellite' || prev === 'hybrid' ? 'roadmap' : 'hybrid'));
  }, []);

  const focusMyLocation = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      alert('Geolocation is not supported in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setMyLocation({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
        mapRef.current?.setView([coords.latitude, coords.longitude], 17, { animate: true });
      },
      () => alert('Unable to access your location. Please allow location permissions in your browser.'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    );
  }, []);

  const openStreetViewAt = useCallback((lat: number, lng: number) => {
    const url = streetViewUrl(lat, lng);
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  }, []);

  const handleOpenStreetView = useCallback(() => {
    if (selectedProperty && typeof selectedProperty.lat === 'number' && typeof selectedProperty.lng === 'number') {
      openStreetViewAt(selectedProperty.lat, selectedProperty.lng);
      return;
    }
    if (myLocation) {
      openStreetViewAt(myLocation.lat, myLocation.lng);
      return;
    }
    if (searchMarker && typeof searchMarker.lat === 'number') {
      openStreetViewAt(searchMarker.lat, searchMarker.lng);
      return;
    }
    if (mapRef.current) {
      const c = mapRef.current.getCenter();
      openStreetViewAt(c.lat, c.lng);
    }
  }, [openStreetViewAt, selectedProperty, myLocation, searchMarker]);

  const runMapSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    const geo = await geocodeAddress(q);
    if (!geo) {
      alert('Address not found. Please try a more specific search.');
      return;
    }
    mapRef.current?.setView([geo.latitude, geo.longitude], 17, { animate: true });

    const matched = safeProperties.find((item) => {
      const latDiff = Math.abs(Number(item.lat) - geo.latitude);
      const lngDiff = Math.abs(Number(item.lng) - geo.longitude);
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
      name: geo.name || 'Search Result',
      address: geo.formattedAddress,
      lat: geo.latitude,
      lng: geo.longitude,
    });
  }, [safeProperties, searchQuery, setSelectedProperty]);

  const isSatellite = activeMapType === 'satellite' || activeMapType === 'hybrid';
  const isTerrain = activeMapType === 'terrain';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '500px' }}>
      <MapContainer
        center={initialCenter}
        zoom={zoom}
        maxZoom={MAP_MAX_ZOOM}
        style={{ width: '100%', height: '100%', minHeight: '500px' }}
        scrollWheelZoom
        zoomControl={false}
      >
        {/* Move Leaflet's +/- buttons to bottom-left so they don't collide
            with the persistent search bar at top-left. */}
        <ZoomControl position="bottomleft" />
        {isSatellite ? (
          <>
            <TileLayer
              key="esri-imagery"
              url={TILE_SATELLITE}
              attribution={TILE_SATELLITE_ATTR}
              maxZoom={MAP_MAX_ZOOM}
              maxNativeZoom={SATELLITE_MAX_NATIVE_ZOOM}
            />
            <TileLayer
              key="esri-labels"
              url={TILE_SATELLITE_LABELS}
              maxZoom={MAP_MAX_ZOOM}
              maxNativeZoom={SATELLITE_MAX_NATIVE_ZOOM}
              opacity={0.9}
            />
          </>
        ) : isTerrain ? (
          <TileLayer
            key="opentopomap"
            url={TILE_TERRAIN}
            attribution={TILE_TERRAIN_ATTR}
            maxZoom={MAP_MAX_ZOOM}
            maxNativeZoom={TERRAIN_MAX_NATIVE_ZOOM}
          />
        ) : (
          <TileLayer
            key="osm"
            url={TILE_ROADMAP}
            attribution={TILE_ROADMAP_ATTR}
            maxZoom={MAP_MAX_ZOOM}
            maxNativeZoom={OSM_MAX_NATIVE_ZOOM}
          />
        )}

        <MapBridge
          onReady={handleReady}
          focusLocation={focusLocation || null}
          selectedProperty={selectedProperty}
          fitProperties={safeProperties}
        />

        {/* Property pins are rendered through a marker-cluster group so the
            map stays responsive even with 15k+ pins. */}
        <PropertyClusterLayer
          properties={safeProperties}
          selectedPropertyId={selectedProperty?.id ?? null}
          onSelect={setSelectedProperty}
        />

        {searchResultMarkers?.map((m, index) => (
          <Marker
            key={`sr-${m.id}`}
            position={[m.lat, m.lng]}
            icon={searchResultDivIcon(index)}
            eventHandlers={{ click: () => onSearchResultMarkerClick?.(m) }}
          >
            <Popup>
              <div>
                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '13px' }}>{m.name}</h4>
                {m.address && (
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#6b7280' }}>{m.address}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {searchMarker && (
          <Marker position={[searchMarker.lat, searchMarker.lng]} icon={searchMarkerIcon}>
            <Popup eventHandlers={{ remove: () => setSearchMarker(null) }}>
              <div>
                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '13px' }}>{searchMarker.name}</h4>
                {searchMarker.address && (
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#6b7280' }}>
                    {searchMarker.address}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {myLocation && (
          <Marker position={[myLocation.lat, myLocation.lng]} icon={myLocationDivIcon}>
            <Popup eventHandlers={{ remove: () => setMyLocation(null) }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '12px' }}>Your Location</p>
                {myLocation.accuracy > 0 && (
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#6b7280' }}>
                    Accuracy: ±{Math.round(myLocation.accuracy)} m
                  </p>
                )}
                <button
                  onClick={() => openStreetViewAt(myLocation.lat, myLocation.lng)}
                  style={{
                    marginTop: '6px',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Open Street View here
                </button>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {enableMapSearch && (
        <div className="absolute top-3 left-3 z-[1100] w-[min(420px,calc(100%-1.5rem))]">
          <div className="relative">
            <input
              value={searchQuery}
              onChange={(e) => {
                const v = e.target.value;
                setSearchQuery(v);
                if (!v.trim()) setSearchMarker(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void runMapSearch();
                }
              }}
              placeholder="Search places, addresses, streets..."
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 pr-20 text-sm shadow"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchMarker(null);
                  setSelectedProperty(null);
                }}
                type="button"
                className="absolute right-12 top-1/2 -translate-y-1/2 rounded px-1 text-stone-500 hover:bg-stone-100"
                title="Clear search"
              >
                ×
              </button>
            )}
            <button
              onClick={() => void runMapSearch()}
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-stone-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-stone-700"
            >
              Go
            </button>
          </div>
        </div>
      )}

      {enableGoogleMapControls && (
        <MapControlsPanel
          activeMapType={activeMapType}
          selectedPropertyName={selectedProperty?.name}
          onToggleSatellite={toggleSatellite}
          onMyLocation={focusMyLocation}
          onStreetView={handleOpenStreetView}
        />
      )}
    </div>
  );
};

export default GoogleMapWrapper;
