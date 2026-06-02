'use client';

import React, { useState } from 'react';
import SummaryDashboard from './SummaryDashboard';
import CompletedDealsAndLeases from './CompletedDealsAndLeases';
import DealsClosedAwaitingPayment from './DealsClosedAwaitingPayment';
import ForecastDeals from './ForecastDeals';
import BrokerSummary from './BrokerSummary';
import BrokersTargets from './BrokersTargets';
import DealPipelineKanban from './DealPipelineKanban';

type TabId =
  | 'summary'
  | 'pipeline'
  | 'forecast-deals'
  | 'broker-summary'
  | 'broker-targets'
  | 'completed'
  | 'awaiting-payment';

export default function DealSheet() {
  const [activeTab, setActiveTab] = useState<TabId>('summary');

  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: 'summary', label: '📊 Summary Dashboard', icon: '📊' },
    { id: 'pipeline', label: '🗂 Pipeline (Kanban)', icon: '🗂' },
    { id: 'forecast-deals', label: '📈 Forecast Deals', icon: '📈' },
    { id: 'broker-summary', label: '👥 Broker Summary', icon: '👥' },
    { id: 'broker-targets', label: '🎯 Broker Targets', icon: '🎯' },
    { id: 'completed', label: '✅ Completed Deals', icon: '✅' },
    { id: 'awaiting-payment', label: '⏳ Awaiting Payment', icon: '⏳' },
  ];

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 bg-white rounded-lg border border-stone-200 p-3 shadow-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-stone-900 text-white shadow-md'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label.split(' ').slice(1).join(' ')}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg border border-stone-200 p-6 shadow-sm">
        {activeTab === 'summary' && <SummaryDashboard />}
        {activeTab === 'pipeline' && <DealPipelineKanban />}
        {activeTab === 'forecast-deals' && <ForecastDeals />}
        {activeTab === 'broker-summary' && <BrokerSummary />}
        {activeTab === 'broker-targets' && <BrokersTargets />}
        {activeTab === 'completed' && <CompletedDealsAndLeases />}
        {activeTab === 'awaiting-payment' && <DealsClosedAwaitingPayment />}
      </div>
    </div>
  );
}
