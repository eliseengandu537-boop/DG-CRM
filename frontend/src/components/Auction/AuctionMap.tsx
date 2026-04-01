'use client';

import React from "react";

export const AuctionMap: React.FC = () => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-stone-950">Auction Properties Map</h3>
      
      <div className="bg-stone-100 rounded-lg p-8 min-h-[400px] flex items-center justify-center border-2 border-dashed border-stone-300">
        <div className="text-center">
          <p className="text-stone-600 mb-2">🗺️ Map view coming soon</p>
          <p className="text-sm text-stone-500">
            Integrate with Google Maps to display auction property locations
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-stone-200 p-4">
        <h4 className="font-semibold text-stone-950 mb-3">Properties by Location</h4>
        <div className="space-y-2">
          <div className="flex justify-between items-center p-2 hover:bg-stone-50 rounded">
            <span className="text-sm text-stone-700">Downtown District</span>
            <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded">
              5 listings
            </span>
          </div>
          <div className="flex justify-between items-center p-2 hover:bg-stone-50 rounded">
            <span className="text-sm text-stone-700">Suburban Area</span>
            <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded">
              3 listings
            </span>
          </div>
          <div className="flex justify-between items-center p-2 hover:bg-stone-50 rounded">
            <span className="text-sm text-stone-700">Industrial Zone</span>
            <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded">
              2 listings
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
