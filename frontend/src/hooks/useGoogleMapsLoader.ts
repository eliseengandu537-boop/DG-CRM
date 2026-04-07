'use client';

import { Libraries, useJsApiLoader } from '@react-google-maps/api';

const GOOGLE_MAPS_SCRIPT_ID = 'app-google-maps-script';
const GOOGLE_MAPS_LIBRARIES: Libraries = ['places', 'geometry'];

export function useGoogleMapsLoader() {
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  const loaderState = useJsApiLoader({
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey: mapsApiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
    preventGoogleFontsLoading: true,
  });

  return {
    mapsApiKey,
    ...loaderState,
  };
}

export default useGoogleMapsLoader;
