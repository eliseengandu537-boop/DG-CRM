'use client';

import React from 'react';
import { CardHeader } from './CardHeader';

/**
 * QuickStatsSection Component
 * Displays quick overview stats
 */

interface QuickStat {
  label: string;
  value: string;
  color: string;
  textColor: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface QuickStatsProps {
  stats: QuickStat[];
}

export const QuickStatsSection: React.FC<QuickStatsProps> = ({ stats }) => {
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
      <CardHeader
        title="Quick Overview"
        subtitle="Key metrics at a glance"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;

          return (
            <div
              key={idx}
              className={`${stat.color} rounded-lg p-4 border-l-4 ${
                stat.color === 'bg-blue-50'
                  ? 'border-blue-500'
                  : stat.color === 'bg-purple-50'
                  ? 'border-purple-500'
                  : stat.color === 'bg-green-50'
                  ? 'border-green-500'
                  : 'border-orange-500'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-stone-600 uppercase">
                  {stat.label}
                </p>
                <Icon size={16} className={stat.textColor} />
              </div>
              <p className={`text-2xl font-bold ${stat.textColor}`}>
                {stat.value}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
