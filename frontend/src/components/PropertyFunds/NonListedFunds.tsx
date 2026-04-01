// @ts-nocheck
'use client';

import React, { useState, useMemo } from 'react';
import { FiSearch, FiFilter, FiChevronDown, FiPhone, FiMail, FiMapPin } from 'react-icons/fi';
import { nonListedFunds } from '@/data/propertyfunds';
import { formatRand } from '@/lib/currency';

export default function NonListedFunds() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedFundId, setExpandedFundId] = useState<string | null>(null);
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);

  const filteredFunds = useMemo(() => {
    return nonListedFunds.filter(fund =>
      fund.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fund.fundManager.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  const toggleFundExpanded = (fundId: string) => {
    setExpandedFundId(expandedFundId === fundId ? null : fundId);
  };

  const toggleAssetExpanded = (assetId: string) => {
    setExpandedAssetId(expandedAssetId === assetId ? null : assetId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-stone-900">Non-Listed Funds</h2>
        <p className="text-sm text-stone-600 mt-1">Private real estate investment funds with restricted access</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <p className="text-sm font-medium text-stone-600">Total Funds</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{nonListedFunds.length}</p>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <p className="text-sm font-medium text-stone-600">Combined Assets</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {formatRand(nonListedFunds.reduce((sum, f) => sum + f.totalAssets, 0))}
          </p>
        </div>
        <div className="bg-purple-50 rounded-lg border border-purple-200 p-4">
          <p className="text-sm font-medium text-stone-600">Total Properties</p>
          <p className="text-3xl font-bold text-purple-600 mt-1">
            {nonListedFunds.reduce((sum, f) => sum + f.assets.length, 0)}
          </p>
        </div>
        <div className="bg-orange-50 rounded-lg border border-orange-200 p-4">
          <p className="text-sm font-medium text-stone-600">Min. Investment</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">
            {formatRand(nonListedFunds[0]?.minimumInvestment || 0)}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg border border-stone-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 bg-stone-50 rounded px-3 py-2">
          <FiSearch className="text-stone-400" />
          <input
            type="text"
            placeholder="Search funds or managers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent outline-none text-sm flex-1 text-stone-900 placeholder-stone-500"
          />
        </div>
      </div>

      {/* Funds List */}
      <div className="space-y-4">
        {filteredFunds.map(fund => (
          <div key={fund.id} className="bg-white rounded-lg border border-stone-200 shadow-sm overflow-hidden">
            {/* Fund Header */}
            <button
              onClick={() => toggleFundExpanded(fund.id)}
              className="w-full p-4 hover:bg-stone-50 transition-colors text-left flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-stone-900">{fund.name}</h3>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
                    {formatRand(fund.totalAssets)}
                  </span>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800">
                    Min: {formatRand(fund.minimumInvestment || 0)}
                  </span>
                </div>
                <p className="text-sm text-stone-600 mt-1">Manager: {fund.fundManager}</p>
              </div>
              <FiChevronDown
                className={`transition-transform ${expandedFundId === fund.id ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Fund Details */}
            {expandedFundId === fund.id && (
              <div className="border-t border-stone-200 p-4 space-y-4 bg-stone-50">
                {/* Fund Overview */}
                <div>
                  <h4 className="font-semibold text-stone-900 mb-2">Overview</h4>
                  <p className="text-sm text-stone-700 mb-3">{fund.description}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <p className="text-xs text-stone-600">Launch Date</p>
                      <p className="text-sm font-semibold text-stone-900">
                        {new Date(fund.launchDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-600">Status</p>
                      <p className="text-sm font-semibold text-stone-900">{fund.status}</p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-600">Currency</p>
                      <p className="text-sm font-semibold text-stone-900">{fund.currency}</p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-600">Linked Funds</p>
                      <p className="text-sm font-semibold text-stone-900">{fund.linkedFundIds.length}</p>
                    </div>
                  </div>
                </div>

                {/* Contacts */}
                <div>
                  <h4 className="font-semibold text-stone-900 mb-2">Contact Details</h4>
                  <div className="space-y-2">
                    {fund.contacts.map((contact, idx) => (
                      <div key={idx} className="bg-white rounded p-3 border border-stone-200">
                        <p className="font-medium text-stone-900">{contact.name}</p>
                        <p className="text-xs text-stone-600 mt-1">{contact.role}</p>
                        <div className="flex flex-col gap-1 mt-2 text-xs text-stone-600">
                          <div className="flex items-center gap-2">
                            <FiPhone className="w-3 h-3" />
                            {contact.phone}
                          </div>
                          <div className="flex items-center gap-2">
                            <FiMail className="w-3 h-3" />
                            {contact.email}
                          </div>
                          <div className="flex items-center gap-2">
                            <FiMapPin className="w-3 h-3" />
                            {contact.address}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Assets Owned */}
                <div>
                  <h4 className="font-semibold text-stone-900 mb-2">Assets Owned ({fund.assets.length})</h4>
                  <div className="space-y-2">
                    {fund.assets.map(asset => (
                      <button
                        key={asset.assetId}
                        onClick={() => toggleAssetExpanded(asset.assetId)}
                        className="w-full text-left bg-white border border-stone-200 rounded p-3 hover:bg-stone-100 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-stone-900">{asset.propertyName}</p>
                            <div className="flex gap-2 mt-1">
                              <span className="text-xs px-2 py-1 rounded bg-stone-100 text-stone-700">
                                {asset.type}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${
                                asset.status === 'Under Development'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-green-100 text-green-700'
                              }`}>
                                {asset.status}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-stone-900">
                              {formatRand(asset.value)}
                            </p>
                            <p className="text-xs text-stone-600 mt-1">
                              Acquired: {new Date(asset.acquisitionDate).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        {/* Asset Vacancy */}
                        {expandedAssetId === asset.assetId && (
                          <div className="mt-3 pt-3 border-t border-stone-200">
                            {fund.vacancySchedules.find(v => v.propertyId === asset.assetId) ? (
                              <div className="space-y-2">
                                {fund.vacancySchedules
                                  .filter(v => v.propertyId === asset.assetId)
                                  .map((vacancy, vidx) => (
                                    <div key={vidx} className="bg-stone-50 p-2 rounded text-sm">
                                      <p className="font-medium text-stone-900">Vacancy Info:</p>
                                      <div className="grid grid-cols-3 gap-2 mt-1 text-xs">
                                        <div>
                                          <p className="text-stone-600">Rate</p>
                                          <p className="font-semibold">{vacancy.vacancyRate}%</p>
                                        </div>
                                        <div>
                                          <p className="text-stone-600">Vacant Units</p>
                                          <p className="font-semibold">
                                            {vacancy.vacantUnits} / {vacancy.totalUnits}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-stone-600">Expected Lease</p>
                                          <p className="font-semibold">
                                            {vacancy.expectedLeaseDate
                                              ? new Date(vacancy.expectedLeaseDate).toLocaleDateString()
                                              : 'N/A'}
                                          </p>
                                        </div>
                                      </div>
                                      {vacancy.notes && (
                                        <p className="mt-2 text-stone-700 italic">{vacancy.notes}</p>
                                      )}
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="text-xs text-stone-600">No vacancy data available</p>
                            )}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subsidiaries */}
                <div>
                  <h4 className="font-semibold text-stone-900 mb-2">Subsidiaries ({fund.subsidiaries.length})</h4>
                  <div className="space-y-2">
                    {fund.subsidiaries.map(sub => (
                      <div key={sub.subsidiaryId} className="bg-white border border-stone-200 rounded p-3">
                        <p className="font-medium text-stone-900">{sub.name}</p>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                          <div>
                            <p className="text-xs text-stone-600">Type</p>
                            <p className="font-medium text-stone-700">{sub.type}</p>
                          </div>
                          <div>
                            <p className="text-xs text-stone-600">Country</p>
                            <p className="font-medium text-stone-700">{sub.country}</p>
                          </div>
                          <div>
                            <p className="text-xs text-stone-600">Registration</p>
                            <p className="font-medium text-stone-700">{sub.registrationNumber}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredFunds.length === 0 && (
        <div className="text-center py-8 bg-stone-50 rounded-lg border border-stone-200">
          <p className="text-stone-500">No non-listed funds found</p>
        </div>
      )}
    </div>
  );
}
