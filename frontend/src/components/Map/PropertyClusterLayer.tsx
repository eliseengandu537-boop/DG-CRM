'use client';

// React bridge for leaflet.markercluster. The library is vanilla Leaflet
// (no react-leaflet bindings ship with react-leaflet v4), so this component
// uses `useMap()` and imperatively adds a marker cluster group.

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { streetViewUrl } from '@/lib/nominatim';

type AnyObj = Record<string, any>;

interface Props {
  properties: AnyObj[];
  selectedPropertyId?: string | null;
  onSelect: (property: AnyObj) => void;
}

function buildPropertyPinSvg(color: string, isSelected: boolean): string {
  const scale = isSelected ? 1.18 : 1;
  const stroke = isSelected ? 2.8 : 2.2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(34 * scale)}" height="${Math.round(34 * scale)}" viewBox="-16 -16 32 32"><path d="M 0 -14 L 14 -3 L 10 -3 L 10 14 L -10 14 L -10 -3 L -14 -3 Z M -3 14 L -3 5 L 3 5 L 3 14 Z" fill="${color}" stroke="#ffffff" stroke-width="${stroke}" /></svg>`;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPopupHtml(p: AnyObj): string {
  const name = escapeHtml(String(p.name || 'Property'));
  const address = escapeHtml(String(p.address || 'Address not available'));
  const sv = streetViewUrl(p.lat, p.lng);
  return `
    <div style="min-width:220px">
      <h4 style="margin:0;font-weight:700;font-size:14px;color:#111827">${name}</h4>
      <p style="margin:4px 0 8px;font-size:12px;color:#4b5563;display:flex;align-items:flex-start;gap:4px">
        <span style="margin-top:1px">📍</span><span>${address}</span>
      </p>
      <a href="${sv}" target="_blank" rel="noopener" style="display:inline-block;background:#f8fafc;color:#334155;border:1px solid #cbd5e1;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:500;text-decoration:none">🚶 Street View</a>
    </div>
  `;
}

// Style cluster bubbles — small, colour-graded by size, look at home.
function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  let bg = 'rgba(22,163,74,0.85)';   // green for small clusters
  let size = 36;
  if (count >= 100) {
    bg = 'rgba(220,38,38,0.92)';      // red for very large
    size = 52;
  } else if (count >= 25) {
    bg = 'rgba(217,119,6,0.9)';       // amber for medium
    size = 46;
  } else if (count >= 10) {
    bg = 'rgba(37,99,235,0.9)';       // blue for small-medium
    size = 40;
  }
  const html = `
    <div style="
      width:${size}px;height:${size}px;
      background:${bg};
      border:2px solid #fff;
      border-radius:50%;
      box-shadow:0 1px 4px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-weight:700;font-size:${count >= 100 ? 12 : 13}px;
      font-family:system-ui,-apple-system,sans-serif;
    ">${count}</div>
  `;
  return L.divIcon({
    html,
    className: 'crm-property-cluster',
    iconSize: [size, size],
  });
}

const PropertyClusterLayer: React.FC<Props> = ({ properties, selectedPropertyId, onSelect }) => {
  const map = useMap();

  useEffect(() => {
    // @ts-ignore — leaflet.markercluster augments L at runtime
    const group: L.MarkerClusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 17,
      iconCreateFunction: clusterIcon,
    });

    const markers: L.Marker[] = [];
    for (const p of properties) {
      if (
        typeof p?.lat !== 'number' ||
        typeof p?.lng !== 'number' ||
        !Number.isFinite(p.lat) ||
        !Number.isFinite(p.lng)
      ) {
        continue;
      }
      const color = p.markerColor || '#16a34a';
      const isSelected = selectedPropertyId === p.id;
      const marker = L.marker([p.lat, p.lng], {
        icon: propertyDivIcon(color, isSelected),
      });
      marker.bindPopup(buildPopupHtml(p), { minWidth: 220, maxWidth: 320 });
      marker.on('click', () => onSelect(p));
      markers.push(marker);
    }

    group.addLayers(markers);
    map.addLayer(group);

    return () => {
      map.removeLayer(group);
    };
  }, [map, properties, selectedPropertyId, onSelect]);

  return null;
};

export default PropertyClusterLayer;
