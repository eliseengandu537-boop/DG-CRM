// Nominatim (OpenStreetMap) helpers — free, no API key.
// Public Nominatim policy: 1 request/second/IP, identify caller via User-Agent
// (browsers can't send custom UA; we set a Referer header instead via fetch).
// Docs: https://operations.osmfoundation.org/policies/nominatim/

export type NominatimResult = {
  placeId: string;
  name: string;
  displayName: string;
  formattedAddress: string;
  city: string;
  area: string;
  latitude: number;
  longitude: number;
  boundingBox?: [number, number, number, number]; // south, north, west, east
};

const BASE = 'https://nominatim.openstreetmap.org';
const CACHE_TTL_MS = 5 * 60 * 1000;

let lastRequestAt = 0;
const MIN_INTERVAL_MS = 1100; // be a bit over 1s/req
const searchCache = new Map<string, { expiresAt: number; results: any[] }>();

async function throttle() {
  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

function pickCity(addr: Record<string, string> | undefined): string {
  if (!addr) return '';
  return (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    addr.state_district ||
    addr.state ||
    ''
  );
}

function pickArea(addr: Record<string, string> | undefined): string {
  if (!addr) return '';
  return (
    addr.suburb ||
    addr.neighbourhood ||
    addr.quarter ||
    addr.city_district ||
    addr.hamlet ||
    addr.borough ||
    ''
  );
}

function mapRaw(raw: any): NominatimResult | null {
  const lat = Number(raw?.lat);
  const lng = Number(raw?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const displayName = String(raw?.display_name || '').trim();
  const namePart = displayName.split(',')[0]?.trim() || displayName;
  const bb = Array.isArray(raw?.boundingbox) && raw.boundingbox.length === 4
    ? (raw.boundingbox.map(Number) as [number, number, number, number])
    : undefined;
  return {
    placeId: String(raw?.place_id ?? raw?.osm_id ?? `${lat},${lng}`),
    name: raw?.namedetails?.name || raw?.name || namePart,
    displayName,
    formattedAddress: displayName,
    city: pickCity(raw?.address),
    area: pickArea(raw?.address),
    latitude: lat,
    longitude: lng,
    boundingBox: bb,
  };
}

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
}

function stripLeadingStreetNumber(query: string): string {
  return query.replace(/^\d+[a-zA-Z]?\s+/, '').trim();
}

function buildCommaVariants(query: string): string[] {
  if (!query || query.includes(',')) return [];

  const tokens = query.split(' ').filter(Boolean);
  if (tokens.length < 3) return [];

  const variants: string[] = [];
  for (let splitIndex = 2; splitIndex < tokens.length; splitIndex += 1) {
    const left = tokens.slice(0, splitIndex).join(' ');
    const right = tokens.slice(splitIndex).join(' ');
    if (left && right) {
      variants.push(`${left}, ${right}`);
    }
  }

  return variants;
}

function buildQueryVariants(query: string): string[] {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];

  const baseVariants = [normalized, ...buildCommaVariants(normalized)];
  const stripped = stripLeadingStreetNumber(normalized);
  if (stripped && stripped !== normalized) {
    baseVariants.push(stripped, ...buildCommaVariants(stripped));
  }

  const variants: string[] = [];
  baseVariants.forEach((variant) => {
    const cleanVariant = normalizeQuery(variant);
    if (!cleanVariant) return;
    variants.push(cleanVariant);
    if (!/\b(south africa|rsa|za)\b/i.test(cleanVariant)) {
      variants.push(`${cleanVariant}, South Africa`);
    }
  });

  return Array.from(new Set(variants));
}

function buildSearchUrl(
  query: string,
  options?: {
    limit?: number;
    viewbox?: [number, number, number, number];
    includeNamedDetails?: boolean;
    countryCode?: string;
  }
): string {
  const limit = options?.limit ?? 8;
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    dedupe: '1',
    limit: String(limit),
    q: query,
  });

  if (options?.includeNamedDetails) {
    params.set('namedetails', '1');
  }

  if (options?.countryCode) {
    params.set('countrycodes', options.countryCode);
  }

  if (options?.viewbox) {
    const [west, south, east, north] = options.viewbox;
    params.set('viewbox', `${west},${north},${east},${south}`);
    params.set('bounded', '0');
  }

  return `${BASE}/search?${params.toString()}`;
}

async function fetchSearchJson(url: string): Promise<any[]> {
  const cached = searchCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results;
  }

  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'en-ZA,en' } });
    if (!res.ok) return [];
    const json = await res.json();
    const results = Array.isArray(json) ? json : [];
    searchCache.set(url, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      results,
    });
    return results;
  } catch {
    return [];
  }
}

async function fetchWithSouthAfricaFallback(
  query: string,
  options?: { limit?: number; viewbox?: [number, number, number, number]; includeNamedDetails?: boolean }
): Promise<any[]> {
  const variants = buildQueryVariants(query);
  const urls = variants.flatMap((variant) => [
    buildSearchUrl(variant, {
      ...options,
      countryCode: 'za',
    }),
    buildSearchUrl(variant, options),
  ]);
  const seenUrls = new Set<string>();

  for (let index = 0; index < urls.length; index += 1) {
    if (seenUrls.has(urls[index])) continue;
    seenUrls.add(urls[index]);

    await throttle();
    const results = await fetchSearchJson(urls[index]);
    if (results.length > 0) return results;
  }

  return [];
}

export async function geocodeAddress(address: string): Promise<NominatimResult | null> {
  const q = address.trim();
  if (!q) return null;
  const results = await fetchWithSouthAfricaFallback(q, { limit: 1 });
  const first = results.length > 0 ? results[0] : null;
  return first ? mapRaw(first) : null;
}

export async function searchPlaces(
  query: string,
  options?: { limit?: number; viewbox?: [number, number, number, number] }
): Promise<NominatimResult[]> {
  const q = query.trim();
  if (!q) return [];
  const json = await fetchWithSouthAfricaFallback(q, {
    limit: options?.limit ?? 8,
    viewbox: options?.viewbox,
    includeNamedDetails: true,
  });
  return json.map(mapRaw).filter((item): item is NominatimResult => Boolean(item));
}

export async function autocompleteAddress(query: string): Promise<NominatimResult[]> {
  return searchPlaces(query, { limit: 8 });
}

// Convenience: Google Street View URL for a given lat/lng. No API key required,
// opens in a new tab. Works on desktop + mobile.
export function streetViewUrl(lat: number, lng: number, heading = 0): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}&heading=${heading}`;
}

