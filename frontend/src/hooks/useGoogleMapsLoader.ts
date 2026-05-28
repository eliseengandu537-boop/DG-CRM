'use client';

// Compatibility stub. The app now uses Leaflet + OpenStreetMap (no API key,
// no billing). This hook used to load Google Maps JS API; it's kept as a stub
// so existing callsites that check `isLoaded` continue to work unchanged.
export function useGoogleMapsLoader() {
  return {
    mapsApiKey: '',
    isLoaded: true,
    loadError: undefined as unknown as Error | undefined,
  };
}

export default useGoogleMapsLoader;
