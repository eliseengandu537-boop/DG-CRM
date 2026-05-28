'use client';

// Nominatim-backed address autocomplete input. The export name + shape match
// the prior Google-Places version so existing call sites don't change.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { autocompleteAddress } from '@/lib/nominatim';

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
  placeholder = 'Search OpenStreetMap for an address...',
  disabled = false,
  error,
}: GooglePlaceAutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<
    Array<{
      placeId: string;
      name: string;
      displayName: string;
      city: string;
      area: string;
      lat: number;
      lng: number;
    }>
  >([]);
  const [open, setOpen] = useState(false);
  const lastQueryRef = useRef('');

  useEffect(() => {
    const q = value.trim();
    if (q.length < 4) {
      setSuggestions([]);
      return;
    }
    lastQueryRef.current = q;
    const handle = setTimeout(async () => {
      const results = await autocompleteAddress(q);
      if (lastQueryRef.current !== q) return;
      setSuggestions(
        results.map((r) => ({
          placeId: r.placeId,
          name: r.name,
          displayName: r.displayName,
          city: r.city,
          area: r.area,
          lat: r.latitude,
          lng: r.longitude,
        }))
      );
      setOpen(true);
    }, 400);
    return () => clearTimeout(handle);
  }, [value]);

  const handleSelect = useCallback(
    (s: {
      placeId: string;
      name: string;
      displayName: string;
      city: string;
      area: string;
      lat: number;
      lng: number;
    }) => {
      onPlaceSelect({
        name: s.name || s.displayName.split(',')[0] || s.displayName,
        formattedAddress: s.displayName,
        address: s.displayName,
        city: s.city,
        area: s.area,
        latitude: s.lat,
        longitude: s.lng,
        placeId: s.placeId,
      });
      setOpen(false);
    },
    [onPlaceSelect]
  );

  return (
    <div className="space-y-1 relative">
      <input
        type="search"
        value={value}
        onChange={(event) => onInputChange(event.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-stone-100 disabled:text-stone-500"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
          {suggestions.map((s) => (
            <li
              key={s.placeId}
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(s);
              }}
              className="cursor-pointer px-3 py-2 text-xs text-stone-700 hover:bg-stone-50"
            >
              {s.displayName}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default GooglePlaceAutocompleteInput;
