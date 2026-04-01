'use client';

import React, { useState } from "react";
import { Leads } from "./Leads";
import { Contacts } from "./Contacts";
import { Tenants } from "./Tenants";
import { Industry } from "./Industry";
import { Landlords } from "./Landlords";
import { Stock } from "./Stock";
import { FiChevronDown } from "react-icons/fi";

export const Leasing: React.FC = () => {
  const [activeSubmenu, setActiveSubmenu] = useState<string>("Leads");

  const submenuItems = [
    { id: "Leads", label: "Leads", icon: "📋" },
    { id: "Contacts", label: "Contacts", icon: "👥" },
    { id: "Tenants", label: "Tenants", icon: "👥" },
    { id: "Industry", label: "Industry", icon: "⚙️" },
    { id: "Landlords", label: "Landlords", icon: "🏛️" },
    { id: "Stock", label: "Stock", icon: "📦" },
  ];

  const renderContent = () => {
    switch (activeSubmenu) {
      case "Leads":
        return <Leads />;
      case "Contacts":
        return <Contacts />;
      case "Tenants":
        return <Tenants />;
      case "Industry":
        return <Industry />;
      case "Landlords":
        return <Landlords />;
      case "Stock":
        return <Stock />;
      default:
        return <Leads />;
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
