import React, { useState } from "react";
import { FiSearch, FiX } from "react-icons/fi";
import { IoHome } from "react-icons/io5";

interface SearchBarProps {
  onSearch: (query: string, type: "name" | "address" | "assetId") => void;
  placeholder?: string;
}

export const PropertySearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  placeholder = "Search by name, address, or asset ID...",
}) => {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"name" | "address" | "assetId">(
    "name"
  );

  const handleSearch = (value: string) => {
    setQuery(value);
    onSearch(value, searchType);
  };

  const handleClear = () => {
    setQuery("");
    onSearch("", searchType);
  };

  const searchOptions = [
    { type: 'name' as const, label: 'Property Name', icon: '🏢' },
    { type: 'address' as const, label: 'Address', icon: '📍' },
    { type: 'assetId' as const, label: 'Asset ID', icon: '#️⃣' },
  ];

  return (
    <div className="w-full bg-white rounded-xl shadow-lg border border-stone-200 p-6 space-y-4">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-stone-200">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <IoHome className="text-indigo-600 w-5 h-5" />
        </div>
        <h3 className="font-bold text-stone-950">Search Properties</h3>
      </div>

      <div className="flex gap-2 flex-wrap">
        {searchOptions.map((option) => (
          <button
            key={option.type}
            onClick={() => {
              setSearchType(option.type);
              onSearch(query, option.type);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border-2 flex items-center gap-2 ${
              searchType === option.type
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                : 'bg-white text-stone-700 border-stone-300 hover:border-indigo-400 hover:shadow-sm'
            }`}
          >
            <span>{option.icon}</span>
            {option.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-stone-400 w-5 h-5" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-12 pr-12 py-3 border-2 border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-stone-900 placeholder-stone-400"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
          >
            <FiX size={20} />
          </button>
        )}
      </div>

      {query && (
        <div className="text-xs text-stone-600">
          Searching by <span className="font-semibold text-indigo-600">
            {searchOptions.find(s => s.type === searchType)?.label}
          </span> for "<span className="font-semibold">{query}</span>"
        </div>
      )}
    </div>
  );
};
