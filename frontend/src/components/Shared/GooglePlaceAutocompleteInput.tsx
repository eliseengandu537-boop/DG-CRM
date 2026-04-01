'use client';

import React, { useCallback, useRef } from 'react';
import { Autocomplete } from '@react-google-maps/api';
import { useGoogleMapsLoader } from '@/hooks/useGoogleMapsLoader';

export type SelectedGooglePlace = {
  name: string;
  formattedAddress: string;
  address: string;
  city: string;
  area: string;
  latitude: number;
  longitude: number;
  placeId: string;
};

type GooglePlaceAutocompleteInputProps = {
  value: string;
  onInputChange: (value: string) => void;
  onPlaceSelect: (place: SelectedGooglePlace) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
};

export function GooglePlaceAutocompleteInput({
  value,
  onInputChange,
  onPlaceSelect,
  placeholder = 'Search Google Maps for a property...',
  disabled = false,
  error,
}: GooglePlaceAutocompleteInputProps) {
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const { mapsApiKey, isLoaded, loadError } = useGoogleMapsLoader();

  const handlePlaceChanged = useCallback(() => {
    const autocomplete = autocompleteRef.current;
    if (!autocomplete) return;

    const place = autocomplete.getPlace();
    const location = place?.geometry?.location;
    const formattedAddress = String(place?.formatted_address || '').trim();
    const name = String(place?.name || '').trim();
    const placeId = String(place?.place_id || '').trim();
    const components = Array.isArray(place?.address_components) ? place.address_components : [];
    const getComponent = (...types: string[]) =>
      components.find(component => types.every(type => component.types.includes(type)));
    const city =
      getComponent('locality')?.long_name ||
      getComponent('administrative_area_level_2')?.long_name ||
      getComponent('administrative_area_level_1')?.long_name ||
      '';
    const area =
      getComponent('sublocality', 'sublocality_level_1')?.long_name ||
      getComponent('neighborhood')?.long_name ||
      getComponent('locality')?.long_name ||
      '';

    if (!location || !formattedAddress || !name || !placeId) {
      return;
    }

    onPlaceSelect({
      name,
      formattedAddress,
      address: formattedAddress,
      city,
      area,
      latitude: location.lat(),
      longitude: location.lng(),
      placeId,
    });
  }, [onPlaceSelect]);

  const input = (
    <input
      type="search"
      value={value}
      onChange={(event) => onInputChange(event.target.value)}
      disabled={disabled || !mapsApiKey || Boolean(loadError) || !isLoaded}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-stone-100 disabled:text-stone-500"
    />
  );

  return (
    <div className="space-y-1">
      {mapsApiKey && !loadError && isLoaded ? (
        <Autocomplete
          onLoad={(autocomplete) => {
            autocompleteRef.current = autocomplete;
          }}
          onPlaceChanged={handlePlaceChanged}
          options={{
            fields: ['formatted_address', 'geometry', 'name', 'place_id', 'address_components'],
          }}
        >
          {input}
        </Autocomplete>
      ) : (
        input
      )}
      {(error || !mapsApiKey || loadError) && (
        <p className="text-xs text-red-600">
          {error || 'Please select a valid property from the map'}
        </p>
      )}
    </div>
  );
}

export default GooglePlaceAutocompleteInput;
