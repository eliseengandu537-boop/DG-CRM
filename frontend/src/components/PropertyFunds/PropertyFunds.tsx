'use client';

import React, { useState } from 'react';
import { PropertyFundsManager } from './PropertyFundsManager';
import { AssetsManager } from './AssetsManager';
import { CompanyManager } from './CompanyManager';

export default function PropertyFunds() {
  const [activeTab, setActiveTab] = useState<'funds' | 'assets' | 'company'>('funds');

  const tabs = [
    { id: 'funds', label: '💰 Funds' },
    { id: 'assets', label: '🏢 Assets' },
    { id: 'company', label: '🏦 Company' },
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 bg-white rounded-lg border border-stone-200 p-3 shadow-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-violet-500 text-white shadow-md'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div>
        {activeTab === 'funds' && <PropertyFundsManager />}
        {activeTab === 'assets' && <AssetsManager />}
        {activeTab === 'company' && <CompanyManager />}
      </div>
    </div>
  );
}
