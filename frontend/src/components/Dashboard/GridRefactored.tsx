// @ts-nocheck
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  FiTrendingUp,
  FiEye,
  FiTrendingDown,
  FiArrowUpRight,
  FiZap,
  FiUsers,
  FiPhone,
  FiBriefcase,
} from 'react-icons/fi';
import { useDashboard } from '@/context/DashboardContext';
import { formatCurrency } from '@/lib/dashboardService';

// Import refactored components
import { GridHeader } from './GridHeader';
import { TopMetricsGrid } from './TopMetricsGrid';
import { QuickStatsSection } from './QuickStatsSection';
import { RevenueBreakdownSection } from './RevenueBreakdownSection';
import { ChatAssistantSection } from './ChatAssistantSection';
import { DailySalesChartSection } from './DailySalesChartSection';
import { StatisticsSection } from './StatisticsSection';

const chartAnimationStyles = `
  @keyframes slideUp {
    from { height: 0; opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes pulse-glow {
    0%, 100% { filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.3)); }
    50% { filter: drop-shadow(0 0 16px rgba(139, 92, 246, 0.6)); }
  }
  
  .chart-bar {
    animation: slideUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
  
  .donut-chart {
    filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.2));
    transition: filter 0.3s ease;
  }
  
  .donut-chart:hover {
    filter: drop-shadow(0 0 16px rgba(139, 92, 246, 0.4));
  }
`;

interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  time: string;
}

/**
 * Refactored Grid Component
 * Now composed of 8+ smaller, focused components
 * Each component is <300 lines and handles one responsibility
 */

export const Grid = () => {
  const { metrics, isLoading, error, lastUpdated } = useDashboard();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      sender: 'bot',
      text: 'Hello! I\'m Mr Leo your assistant. I have complete access to all system data and can answer any questions about deals, brokers, leads, performance metrics, revenue, and all CRM operations. What would you like to know?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const getCurrentTime = useCallback(() => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, []);

  // Memoized metrics data
  const topMetrics = useMemo(
    () => [
      {
        label: 'Total Revenue',
        value: metrics ? formatCurrency(metrics.totalRevenue) : 'R 0',
        change: '+4.2%',
        subtext: 'Since last month',
        icon: FiTrendingUp,
      },
      {
        label: 'Deals Won',
        value: metrics?.dealsWon?.toString() || '0',
        change: '+7.8%',
        subtext: 'Compared to last week',
        icon: FiEye,
      },
      {
        label: 'Deals Lost',
        value: metrics?.dealsLost?.toString() || '0',
        change: '-3.1%',
        subtext: 'Drop from last month',
        icon: FiTrendingDown,
      },
      {
        label: 'Company Commission',
        value: metrics ? formatCurrency(metrics.companyCommission) : 'R 0',
        change: '+1.3%',
        subtext: 'Compared to last month',
        icon: FiArrowUpRight,
      },
    ],
    [metrics]
  );

  const quickStats = useMemo(
    () => [
      {
        label: 'Leads',
        value: metrics?.leadCount?.toString() || '0',
        color: 'bg-blue-50',
        textColor: 'text-blue-600',
        icon: FiZap,
      },
      {
        label: 'Deals',
        value: metrics?.dealCount?.toString() || '0',
        color: 'bg-purple-50',
        textColor: 'text-purple-600',
        icon: FiBriefcase,
      },
      {
        label: 'Contacts',
        value: metrics?.contactCount?.toString() || '0',
        color: 'bg-green-50',
        textColor: 'text-green-600',
        icon: FiUsers,
      },
      {
        label: 'Accounts',
        value: metrics?.accountCount?.toString() || '0',
        color: 'bg-orange-50',
        textColor: 'text-orange-600',
        icon: FiPhone,
      },
    ],
    [metrics]
  );

  const statistics = useMemo(
    () => [
      {
        label: 'Open Deals',
        value: metrics?.statistics.openDeals || 0,
        color: 'text-blue-600',
        trend: { value: 5.2, positive: true },
      },
      {
        label: 'Closed Deals',
        value: metrics?.statistics.closedDeals || 0,
        color: 'text-green-600',
        trend: { value: 3.1, positive: true },
      },
      {
        label: 'Conversion Rate',
        value: `${(metrics?.statistics.conversionRate || 0).toFixed(1)}%`,
        color: 'text-purple-600',
        trend: { value: 2.4, positive: true },
      },
      {
        label: 'Avg Deal Value',
        value: metrics?.dealCount
          ? formatCurrency(metrics.totalRevenue / metrics.dealCount)
          : 'R 0',
        color: 'text-orange-600',
      },
    ],
    [metrics]
  );

  // AI response generator
  const generateAIResponse = useCallback((userInput: string): string => {
    const lowerInput = userInput.toLowerCase();

    const responses: Record<string, string> = {
      deal: `Total deals: ${metrics?.dealCount || 0}. Won: ${metrics?.dealsWon || 0}, Lost: ${metrics?.dealsLost || 0}, Open: ${metrics?.statistics.openDeals || 0}. Revenue: ${formatCurrency(metrics?.totalRevenue || 0)}.`,
      revenue: `Total revenue: ${formatCurrency(metrics?.totalRevenue || 0)}. Commission: ${formatCurrency(metrics?.companyCommission || 0)}. Sales: ${formatCurrency(metrics?.revenueByType.Sales || 0)}, Leasing: ${formatCurrency(metrics?.revenueByType.Leasing || 0)}, Auction: ${formatCurrency(metrics?.revenueByType.Auction || 0)}.`,
      performance: `Conversion rate: ${(metrics?.statistics.conversionRate || 0).toFixed(1)}%. Wins: ${metrics?.dealsWon || 0}, Losses: ${metrics?.dealsLost || 0}, Open: ${metrics?.statistics.openDeals || 0}.`,
      broker: `${metrics?.accountCount || 0} active broker accounts. Managing leads, deals, and client interactions across all market segments.`,
      default: 'I can help with information about deals, revenue, performance, brokers, leads, or contacts.',
    };

    if (lowerInput.includes('deal')) return responses.deal;
    if (lowerInput.includes('revenue') || lowerInput.includes('commission'))
      return responses.revenue;
    if (lowerInput.includes('performance') || lowerInput.includes('metric'))
      return responses.performance;
    if (lowerInput.includes('broker')) return responses.broker;

    return responses.default;
  }, [metrics]);

  // Handle chat message
  const handleSendMessage = useCallback((message: string) => {
    const newMessages = [
      ...chatMessages,
      { sender: 'user' as const, text: message, time: getCurrentTime() },
    ];

    const botResponse = generateAIResponse(message);

    setTimeout(() => {
      setChatMessages([
        ...newMessages,
        { sender: 'bot' as const, text: botResponse, time: getCurrentTime() },
      ]);
    }, 300);
  }, [chatMessages, generateAIResponse, getCurrentTime]);

  return (
    <>
      <style>{chartAnimationStyles}</style>
      <div className="p-8 bg-stone-100 min-h-screen space-y-8">
        {/* Header */}
        <GridHeader title="Dashboard" lastUpdated={lastUpdated} />

        {/* Top Metrics */}
        <TopMetricsGrid metrics={topMetrics} isLoading={isLoading} />

        {/* Quick Stats */}
        {!isLoading && <QuickStatsSection stats={quickStats} />}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Sales Chart & Revenue Breakdown */}
          <div className="lg:col-span-2 space-y-6">
            <DailySalesChartSection />
            {metrics?.revenueByType && (
              <RevenueBreakdownSection
                salesRevenue={metrics.revenueByType.Sales || 0}
                leasingRevenue={metrics.revenueByType.Leasing || 0}
                auctionRevenue={metrics.revenueByType.Auction || 0}
              />
            )}
          </div>

          {/* Right Column - Chat Assistant */}
          <ChatAssistantSection
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
          />
        </div>

        {/* Statistics */}
        {!isLoading && <StatisticsSection statistics={statistics} />}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 text-sm font-semibold">{error}</p>
          </div>
        )}
      </div>
    </>
  );
};
