'use client';

import React, { useState } from "react";
import { Auction } from "./Auction";

export const Sales2: React.FC = () => {
  const [activeSubmenu, setActiveSubmenu] = useState<string>("Auctions");

  const submenuItems = [
    { id: "Auctions", label: "Auctions", icon: "🏆" },
  ];

  const renderContent = () => {
    switch (activeSubmenu) {
      case "Auctions":
        return <Auction />;
      default:
        return <Auction />;
    }
  };

  return (
    <div className="bg-white rounded-lg pb-4 shadow">
      {/* Submenu Navigation */}
      <div className="border-b border-stone-200">
        <div className="flex flex-wrap gap-1 p-4">
          {submenuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSubmenu(item.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSubmenu === item.id
                  ? "bg-violet-500 text-white shadow"
                  : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              <span className="inline-block mr-2">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6">
        {renderContent()}
      </div>
    </div>
  );
};
