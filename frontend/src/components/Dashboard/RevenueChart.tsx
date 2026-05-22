'use client';

import React, { useMemo, useState } from 'react';
import { useDashboard } from '@/context/DashboardContext';
import { formatRand } from '@/lib/currency';

interface ChartDataPoint {
  month: string;
  sales: number;
  leasing: number;
  auction: number;
  total: number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  data: ChartDataPoint | null;
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
      total: sales + leasing + auction,
    });
  }

  return points;
}

// Round a value up to a "nice" axis maximum so gridline labels stay clean
// (avoids fractional, duplicate labels like "R 0, R 0, R 1, R 1").
function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
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

  const width = 640;
  const height = 240;
  const padding = { top: 24, right: 24, bottom: 44, left: 62 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(...data.map((d) => d.total), 0);
  const hasRevenue = maxValue > 0;
  const yMin = 0;
  // Round up to a clean axis maximum; tidy default scale when there's no revenue.
  const yMax = hasRevenue ? niceCeil(maxValue * 1.1) || 100 : 100;

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

  const totalPath = generateSmoothPath(data.map((d) => d.total));
  const areaPath = totalPath
    ? `${totalPath} L ${xScale(data.length - 1)} ${chartHeight} L ${xScale(0)} ${chartHeight} Z`
    : '';

  const yGridLines = 5;
  const yStep = (yMax - yMin) / yGridLines;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = (e.clientX - rect.left) * (width / rect.width);
    const relativeX = x - padding.left;
    if (relativeX >= 0 && relativeX <= chartWidth) {
      const index = Math.round((relativeX / chartWidth) * Math.max(data.length - 1, 1));
      if (index >= 0 && index < data.length) {
        const dataPoint = data[index];
        setTooltip({
          visible: true,
          x: padding.left + xScale(index),
          y: padding.top + yScale(dataPoint.total),
          data: dataPoint,
        });
      }
    }
  };

  const handleMouseLeave = () => {
    setTooltip((current) => ({ ...current, visible: false }));
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 min-h-0 w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="revenueAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.34" />
              <stop offset="55%" stopColor="#f97316" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal gridlines + Y-axis labels */}
          {Array.from({ length: yGridLines + 1 }).map((_, i) => {
            const value = yMin + i * yStep;
            const y = padding.top + yScale(value);
            return (
              <g key={`grid-${i}`}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                />
                <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#cbd5e1">
                  {formatRand(Math.round(value))}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          {hasRevenue && areaPath && (
            <path
              d={areaPath}
              fill="url(#revenueAreaGrad)"
              style={{ transform: `translate(${padding.left}px, ${padding.top}px)` }}
            />
          )}

          {/* Revenue line */}
          {hasRevenue && (
            <path
              d={totalPath}
              fill="none"
              stroke="#f97316"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: `translate(${padding.left}px, ${padding.top}px)` }}
            />
          )}

          {/* Data point dots */}
          {hasRevenue &&
            data.map((d, i) => (
              <circle
                key={`point-${i}`}
                cx={padding.left + xScale(i)}
                cy={padding.top + yScale(d.total)}
                r="4"
                fill="#ffffff"
                stroke="#f97316"
                strokeWidth="2.5"
              />
            ))}

          {/* Month labels */}
          {data.map((d, i) => (
            <text
              key={`month-${i}`}
              x={padding.left + xScale(i)}
              y={padding.top + chartHeight + 24}
              textAnchor="middle"
              fontSize="11"
              fill="#94a3b8"
            >
              {d.month}
            </text>
          ))}

          {/* Empty state */}
          {!hasRevenue && (
            <text
              x={padding.left + chartWidth / 2}
              y={padding.top + chartHeight / 2}
              textAnchor="middle"
              fontSize="13"
              fill="#94a3b8"
            >
              No revenue recorded yet
            </text>
          )}

          {/* Tooltip */}
          {tooltip.visible &&
            tooltip.data &&
            (() => {
              const boxW = 144;
              const boxH = 56;
              const bx = Math.min(Math.max(tooltip.x - boxW / 2, 4), width - boxW - 4);
              const by = Math.max(tooltip.y - boxH - 10, 4);
              const cx = bx + boxW / 2;
              return (
                <g>
                  <line
                    x1={tooltip.x}
                    y1={padding.top}
                    x2={tooltip.x}
                    y2={padding.top + chartHeight}
                    stroke="#f97316"
                    strokeWidth="1"
                    strokeDasharray="3,3"
                    opacity="0.5"
                  />
                  <rect x={bx} y={by} width={boxW} height={boxH} rx="8" fill="#1f2937" />
                  <text x={cx} y={by + 22} textAnchor="middle" fontSize="11" fill="#9ca3af">
                    {tooltip.data.month}
                  </text>
                  <text x={cx} y={by + 42} textAnchor="middle" fontSize="15" fontWeight="700" fill="#ffffff">
                    {formatRand(tooltip.data.total)}
                  </text>
                </g>
              );
            })()}
        </svg>
      </div>
    </div>
  );
};
