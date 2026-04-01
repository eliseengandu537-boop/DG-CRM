'use client';

import React from 'react';
import { CardHeader } from './CardHeader';
import { RevenueChart } from './RevenueChart';

/**
 * DailySalesChartSection Component
 * Displays monthly live sales with revenue breakdown
 */

export const DailySalesChartSection: React.FC = () => {
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
      <CardHeader
        title="Monthly Sales"
        subtitle="Live revenue by deal type (this month)"
      />

      <div className="mt-6">
        <RevenueChart />
      </div>
    </div>
  );
};
