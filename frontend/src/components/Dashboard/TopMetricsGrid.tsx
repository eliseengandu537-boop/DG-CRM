'use client';

import React, { useMemo } from 'react';
import {
  FiTrendingUp,
  FiEye,
  FiTrendingDown,
  FiArrowUpRight,
} from 'react-icons/fi';
import { CardHeader } from './CardHeader';
import { formatCurrency } from '@/lib/dashboardService';

/**
 * TopMetricsCard Component
 * Individual metric card with trend indicator
 */

interface Metric {
  label: string;
  value: string;
  change: string;
  subtext: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface TopMetricsGridProps {
  metrics: Metric[];
  isLoading?: boolean;
}

export const TopMetricsGrid: React.FC<TopMetricsGridProps> = ({
  metrics,
  isLoading = false,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      {isLoading
        ? Array(4)
            .fill(0)
            .map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm animate-pulse"
              >
                <div className="h-8 bg-stone-200 rounded mb-4"></div>
                <div className="h-12 bg-stone-200 rounded"></div>
              </div>
            ))
        : metrics.map((metric, idx) => {
            const Icon = metric.icon;
            const isPositive = metric.change.startsWith('+');

            return (
              <div
                key={idx}
                className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h4 className="text-xs font-semibold text-stone-500 uppercase mb-2">
                      {metric.label}
                    </h4>
                    <p className="text-2xl font-bold text-stone-950 stat-value">
                      {metric.value}
                    </p>
                  </div>
                  <div
                    className={`p-3 rounded-lg ${
                      isPositive ? 'bg-green-50' : 'bg-red-50'
                    }`}
                  >
                    <Icon
                      size={20}
                      className={isPositive ? 'text-green-600' : 'text-red-600'}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold ${
                      isPositive ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {metric.change}
                  </span>
                  <span className="text-xs text-stone-500">{metric.subtext}</span>
                </div>
              </div>
            );
          })}
    </div>
  );
};
