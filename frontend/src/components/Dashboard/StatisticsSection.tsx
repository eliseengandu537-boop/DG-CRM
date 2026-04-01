'use client';

import React from 'react';
import { CardHeader } from './CardHeader';

/**
 * StatisticsSection Component
 * Displays key statistics and metrics
 */

interface Statistic {
  label: string;
  value: string | number;
  color: string;
  trend?: { value: number; positive: boolean };
}

interface StatisticsSectionProps {
  statistics: Statistic[];
}

export const StatisticsSection: React.FC<StatisticsSectionProps> = ({
  statistics,
}) => {
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
      <CardHeader
        title="Statistics"
        subtitle="Live performance overview"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statistics.map((stat, idx) => (
          <div key={idx} className="border border-stone-200 rounded-lg p-4 bg-stone-50">
            <p className="text-xs font-semibold text-stone-500 uppercase mb-2">
              {stat.label}
            </p>
            <p className={`text-2xl font-bold ${stat.color}`}>
              {stat.value}
            </p>
            {stat.trend && (
              <p
                className={`text-xs mt-2 ${
                  stat.trend.positive ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {stat.trend.positive ? '↑' : '↓'} {Math.abs(stat.trend.value)}%
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
