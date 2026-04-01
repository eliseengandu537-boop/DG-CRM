'use client';

import React, { useMemo, useState } from 'react';
import { useDashboard } from '@/context/DashboardContext';
import { formatRand } from '@/lib/currency';

interface ChartDataPoint {
  month: string;
  sales: number;
  leasing: number;
  auction: number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  data: { month: string; sales: number; leasing: number; auction: number } | null;
}

function buildRecentMonthsData(
  dailySalesData: Array<{ date: string; amount: number; type: string }>
): ChartDataPoint[] {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const points: ChartDataPoint[] = [];

  for (let i = 5; i >= 0; i -= 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    let sales = 0;
    let leasing = 0;
    let auction = 0;

    dailySalesData.forEach((entry) => {
      if (!entry?.date || typeof entry.amount !== 'number') return;
      if (!entry.date.startsWith(monthKey)) return;

      const type = (entry.type || '').toLowerCase();
      if (type === 'sales' || type === 'sale') sales += entry.amount;
      if (type === 'leasing' || type === 'lease') leasing += entry.amount;
      if (type === 'auction') auction += entry.amount;
    });

    points.push({
      month: monthNames[monthDate.getMonth()],
      sales,
      leasing,
      auction,
    });
  }

  return points;
}

export const RevenueChart = () => {
  const { metrics } = useDashboard();
  const data = useMemo(
    () => buildRecentMonthsData(metrics?.dailySalesData || []),
    [metrics?.dailySalesData]
  );
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    data: null,
  });

  const width = 600;
  const height = 280;
  const padding = { top: 20, right: 20, bottom: 50, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const allValues = data.flatMap((d) => [d.sales, d.leasing, d.auction]);
  const maxValue = Math.max(...allValues, 0);
  const yMin = 0;
  const yMax = maxValue > 0 ? maxValue * 1.1 : 1;

  const xScale = (index: number) => (index / Math.max(data.length - 1, 1)) * chartWidth;
  const yScale = (value: number) => chartHeight - ((value - yMin) / (yMax - yMin)) * chartHeight;

  const generateSmoothPath = (values: number[]) => {
    const points = values.map((v, i) => ({ x: xScale(i), y: yScale(v) }));
    if (points.length === 0) return '';

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = i > 0 ? points[i - 1] : points[0];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i < points.length - 2 ? points[i + 2] : points[points.length - 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return path;
  };

  const salesPath = generateSmoothPath(data.map((d) => d.sales));
  const leasingPath = generateSmoothPath(data.map((d) => d.leasing));
  const auctionPath = generateSmoothPath(data.map((d) => d.auction));

  const yGridLines = 5;
  const yStep = (yMax - yMin) / yGridLines;

  const formatCurrency = (value: number) =>
    formatRand(value);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const relativeX = x - padding.left;
    if (relativeX >= 0 && relativeX <= chartWidth) {
      const index = Math.round((relativeX / chartWidth) * Math.max(data.length - 1, 1));
      if (index >= 0 && index < data.length) {
        const dataPoint = data[index];
        setTooltip({
          visible: true,
          x: padding.left + xScale(index),
          y: padding.top + yScale(Math.min(dataPoint.sales, dataPoint.leasing)) - 20,
          data: dataPoint,
        });
      }
    }
  };

  const handleMouseLeave = () => {
    setTooltip((current) => ({ ...current, visible: false }));
  };

  return (
    <div className="w-full h-full flex flex-col items-center">
      <div className="w-full overflow-x-auto">
        <svg
          width={width}
          height={height}
          className="mx-auto my-4"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {Array.from({ length: yGridLines + 1 }).map((_, i) => {
            const value = yMin + i * yStep;
            const y = padding.top + yScale(value);
            return (
              <g key={`grid-${i}`}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="12" fill="#9ca3af">
                  {formatCurrency(value)}
                </text>
              </g>
            );
          })}

          <line
            x1={padding.left}
            y1={padding.top + chartHeight}
            x2={width - padding.right}
            y2={padding.top + chartHeight}
            stroke="#d1d5db"
            strokeWidth="2"
          />

          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + chartHeight}
            stroke="#d1d5db"
            strokeWidth="2"
          />

          <path
            d={leasingPath}
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            strokeDasharray="8,4"
            style={{ transform: `translate(${padding.left}px, ${padding.top}px)` }}
          />

          <path
            d={salesPath}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="3"
            style={{ transform: `translate(${padding.left}px, ${padding.top}px)` }}
          />

          <path
            d={auctionPath}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="3"
            strokeDasharray="2,6"
            style={{ transform: `translate(${padding.left}px, ${padding.top}px)` }}
          />

          {data.map((d, i) => (
            <circle
              key={`sales-point-${i}`}
              cx={padding.left + xScale(i)}
              cy={padding.top + yScale(d.sales)}
              r="5"
              fill="#3b82f6"
              stroke="#fff"
              strokeWidth="2"
              className="hover:brightness-110"
            />
          ))}

          {data.map((d, i) => (
            <circle
              key={`leasing-point-${i}`}
              cx={padding.left + xScale(i)}
              cy={padding.top + yScale(d.leasing)}
              r="5"
              fill="#10b981"
              stroke="#fff"
              strokeWidth="2"
              className="hover:brightness-110"
            />
          ))}

          {data.map((d, i) => (
            <circle
              key={`auction-point-${i}`}
              cx={padding.left + xScale(i)}
              cy={padding.top + yScale(d.auction)}
              r="5"
              fill="#f59e0b"
              stroke="#fff"
              strokeWidth="2"
              className="hover:brightness-110"
            />
          ))}

          {data.map((d, i) => (
            <text
              key={`month-${i}`}
              x={padding.left + xScale(i)}
              y={padding.top + chartHeight + 25}
              textAnchor="middle"
              fontSize="12"
              fill="#6b7280"
              fontWeight="500"
            >
              {d.month}
            </text>
          ))}

          <text x={-height / 2} y={15} textAnchor="middle" fontSize="12" fill="#6b7280" transform="rotate(-90)">
            Revenue (ZAR)
          </text>

          {tooltip.visible && tooltip.data && (
            <g>
              <rect
                x={tooltip.x - 90}
                y={tooltip.y - 72}
                width="180"
                height="88"
                rx="6"
                fill="#fff"
                stroke="#d1d5db"
                strokeWidth="1"
              />
              <text x={tooltip.x} y={tooltip.y - 38} textAnchor="middle" fontSize="13" fontWeight="600" fill="#1f2937">
                {tooltip.data.month}
              </text>
              <text x={tooltip.x} y={tooltip.y - 20} textAnchor="middle" fontSize="11" fill="#3b82f6" fontWeight="600">
                Sales: {formatCurrency(tooltip.data.sales)}
              </text>
              <text x={tooltip.x} y={tooltip.y - 5} textAnchor="middle" fontSize="11" fill="#10b981" fontWeight="600">
                Leasing: {formatCurrency(tooltip.data.leasing)}
              </text>
              <text x={tooltip.x} y={tooltip.y + 10} textAnchor="middle" fontSize="11" fill="#f59e0b" fontWeight="600">
                Auction: {formatCurrency(tooltip.data.auction)}
              </text>
            </g>
          )}
        </svg>
      </div>

      <div className="flex gap-8 justify-center mt-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-blue-500"></div>
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          </div>
          <span className="text-sm font-medium text-stone-700">Sales</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-0.5 bg-green-500"
              style={{ backgroundImage: 'linear-gradient(90deg, #10b981 0%, #10b981 50%, transparent 50%)' }}
            ></div>
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          </div>
          <span className="text-sm font-medium text-stone-700">Leasing</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-0.5 bg-amber-500"
              style={{ backgroundImage: 'linear-gradient(90deg, #f59e0b 0%, #f59e0b 20%, transparent 20%)' }}
            ></div>
            <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
          </div>
          <span className="text-sm font-medium text-stone-700">Auction</span>
        </div>
      </div>
    </div>
  );
};
