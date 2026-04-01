'use client';

import React from 'react';
import { CardHeader } from './CardHeader';
import { formatCurrency } from '@/lib/dashboardService';

/**
 * RevenueBreakdownSection Component
 * Displays revenue distribution by type using donut chart
 */

interface RevenueBreakdownProps {
  salesRevenue: number;
  leasingRevenue: number;
  auctionRevenue: number;
}

export const RevenueBreakdownSection: React.FC<RevenueBreakdownProps> = ({
  salesRevenue,
  leasingRevenue,
  auctionRevenue,
}) => {
  const total = salesRevenue + leasingRevenue + auctionRevenue || 1;
  const salesPercent = (salesRevenue / total) * 100;
  const leasingPercent = (leasingRevenue / total) * 100;
  const auctionPercent = (auctionRevenue / total) * 100;

  const salesDash = (salesPercent / 100) * 280;
  const leasingDash = (leasingPercent / 100) * 280;
  const auctionDash = (auctionPercent / 100) * 280;

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
      <CardHeader
        title="Revenue Breakdown"
        subtitle="Distribution by deal type"
      />

      <div className="flex flex-col md:flex-row items-center justify-between">
        {/* Donut Chart */}
        <div className="flex justify-center mb-8 md:mb-0">
          <div className="relative w-32 h-32">
            <svg viewBox="0 0 100 100" className="w-full h-full donut-chart">
              {/* Sales (Blue) */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="8"
                strokeDasharray={`${salesDash} 280`}
                strokeDashoffset="0"
                strokeLinecap="round"
              />
              {/* Leasing (Green) - offset by Sales */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#10b981"
                strokeWidth="8"
                strokeDasharray={`${leasingDash} 280`}
                strokeDashoffset={-salesDash}
                strokeLinecap="round"
              />
              {/* Auction (Orange) - offset by Sales + Leasing */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#f97316"
                strokeWidth="8"
                strokeDasharray={`${auctionDash} 280`}
                strokeDashoffset={-(salesDash + leasingDash)}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-xs text-stone-500">Total</p>
                <p className="text-lg font-bold text-stone-950">
                  {formatCurrency(total)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-3 w-full md:w-auto">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-blue-500"></div>
            <div>
              <p className="text-sm font-semibold text-stone-700">Sales</p>
              <p className="text-xs text-stone-500">
                {salesPercent.toFixed(1)}% • {formatCurrency(salesRevenue)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-green-500"></div>
            <div>
              <p className="text-sm font-semibold text-stone-700">Leasing</p>
              <p className="text-xs text-stone-500">
                {leasingPercent.toFixed(1)}% • {formatCurrency(leasingRevenue)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-orange-500"></div>
            <div>
              <p className="text-sm font-semibold text-stone-700">Auction</p>
              <p className="text-xs text-stone-500">
                {auctionPercent.toFixed(1)}% • {formatCurrency(auctionRevenue)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
