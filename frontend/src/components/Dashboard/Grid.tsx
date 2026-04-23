// @ts-nocheck
'use client';

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { FiTrendingUp, FiEye, FiTrendingDown, FiArrowUpRight, FiZap, FiUsers, FiPhone, FiBriefcase, FiMoreVertical, FiMic, FiMicOff, FiChevronRight } from "react-icons/fi";
import { GiTrophy } from "react-icons/gi";
import { useDashboard } from "@/context/DashboardContext";
import { useAuth } from "@/context/AuthContext";
import { formatCurrency, formatRelativeTime, isTaskActivity } from "@/lib/dashboardService";
import { activityService } from "@/services/activityService";
import { RevenueChart } from "./RevenueChart";
import { ActivityDetailsModal } from "./ActivityDetailsModal";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { NotificationCenter } from "@/components/Notifications/NotificationCenter";
import { UnifiedStatsCards } from './UnifiedStatsCards';

const chartAnimationStyles = `
  @keyframes slideUp {
    from {
      height: 0;
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  @keyframes pulse-glow {
    0%, 100% {
      filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.3));
    }
    50% {
      filter: drop-shadow(0 0 16px rgba(139, 92, 246, 0.6));
    }
  }
  
  @keyframes shimmer {
    0% {
      background-position: -1000px 0;
    }
    100% {
      background-position: 1000px 0;
    }
  }
  
  .chart-bar {
    animation: slideUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
  
  .chart-bar:nth-child(1) { animation-delay: 0.1s; }
  .chart-bar:nth-child(2) { animation-delay: 0.2s; }
  .chart-bar:nth-child(3) { animation-delay: 0.3s; }
  .chart-bar:nth-child(4) { animation-delay: 0.4s; }
  
  .donut-chart {
    filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.2));
    transition: filter 0.3s ease;
  }
  
  .donut-chart:hover {
    filter: drop-shadow(0 0 16px rgba(139, 92, 246, 0.4));
  }
  
  .progress-bar {
    background: linear-gradient(90deg, currentColor 0%, currentColor 100%);
    animation: slideUp 0.6s ease-out;
    transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  
  .stat-value {
    font-variant-numeric: tabular-nums;
    transition: all 0.3s ease;
  }
  
  .stat-value:hover {
    transform: scale(1.05);
  }
`;

const SkeletonLoader = () => (
  <div className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm animate-pulse">
    <div className="h-8 bg-stone-200 rounded mb-4"></div>
    <div className="h-12 bg-stone-200 rounded"></div>
  </div>
);

const CardHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="flex items-start justify-between mb-4">
    <div>
      <h3 className="text-lg font-bold text-stone-950">{title}</h3>
      <p className="text-xs text-stone-500 mt-1">{subtitle}</p>
    </div>
    <button className="p-1 hover:bg-stone-100 rounded-lg transition-colors">
      <FiMoreVertical size={18} className="text-stone-400" />
    </button>
  </div>
);

const getCurrentTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatTrend = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

export const Grid = () => {
  const { metrics, trends, isLoading, error, lastUpdated, refreshMetrics } = useDashboard();
  const { user } = useAuth();
  const isBroker = user?.role === "broker";
  const isAdmin = user?.role === "admin";
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [isExpandedChat, setIsExpandedChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      sender: 'bot',
      text: 'Hello! I\'m Mr Leo your assistant. I have complete access to all system data and can answer any questions about deals, brokers, leads, performance metrics, revenue, and all CRM operations. What would you like to know?',
      time: '',
    },
  ]);
  const visibleActivities = useMemo(
    () => (metrics?.recentActivities || []).filter((activity) => !isTaskActivity(activity)),
    [metrics?.recentActivities]
  );

  useEffect(() => {
    const scrollToRecentActivity = () => {
      window.setTimeout(() => {
        const section = document.getElementById('recent-activities');
        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 120);
    };

    const handleOpenHistory = () => {
      scrollToRecentActivity();
    };

    window.addEventListener('activity:open-history', handleOpenHistory);

    if (typeof window !== 'undefined' && window.location.hash === '#recent-activities') {
      scrollToRecentActivity();
    }

    return () => {
      window.removeEventListener('activity:open-history', handleOpenHistory);
    };
  }, []);

  const handleDeleteActivity = async (activityId: string) => {
    if (!isAdmin) return;
    const confirmed = window.confirm('Delete this activity from recent history?');
    if (!confirmed) return;

    setDeletingActivityId(activityId);
    try {
      await activityService.deleteActivity(activityId);
      await refreshMetrics(false);
    } catch (deleteError) {
      window.alert(
        deleteError instanceof Error ? deleteError.message : 'Failed to delete activity'
      );
    } finally {
      setDeletingActivityId(null);
    }
  };
  const handleTranscript = useCallback((text: string) => {
    setUserInput(text);
  }, []);
  const {
    isSupported: isVoiceSupported,
    isListening: isVoiceListening,
    start: startVoice,
    stop: stopVoice,
  } = useSpeechRecognition(handleTranscript);

  // Initialize time on client only
  useEffect(() => {
    if (chatMessages[0].time === '') {
      setChatMessages(prev => [
        { ...prev[0], time: getCurrentTime() }
      ]);
    }
  }, []);

  // Top performer from live backend ranking (closed deals + commission)
  const topBroker = useMemo(() => {
    const performer = metrics?.topPerformer;
    if (!performer || !performer.name) return null;
    return {
      name: performer.name,
      closedDeals: performer.closedDeals || 0,
      commission: performer.brokerCommission || 0,
      avatar: performer.name.charAt(0).toUpperCase(),
    };
  }, [metrics?.topPerformer]);

  const aiResponses = useMemo<{ [key: string]: string }>(() => ({
    'deal': isBroker
      ? `System Status: You have ${metrics?.dealCount || 0} total deals in the system. Open: ${metrics?.statistics.openDeals || 0}, Closed: ${metrics?.statistics.closedDeals || 0}.`
      : `System Status: You have ${metrics?.dealCount || 0} total deals in the system. Breakdown - Won: ${metrics?.dealsWon || 0}, Lost: ${metrics?.dealsLost || 0}, Open: ${metrics?.statistics.openDeals || 0}, Closed: ${metrics?.statistics.closedDeals || 0}. Total revenue from deals: ${formatCurrency(metrics?.totalRevenue || 0)}.`,
    'revenue': isBroker
      ? 'Revenue and commission figures are restricted for broker accounts.'
      : `Revenue Analysis: Total company revenue is ${formatCurrency(metrics?.totalRevenue || 0)}. Company commission: ${formatCurrency(metrics?.companyCommission || 0)}. Revenue by type - Sales: ${formatCurrency(metrics?.revenueByType.Sales || 0)}, Leasing: ${formatCurrency(metrics?.revenueByType.Leasing || 0)}, Auction: ${formatCurrency(metrics?.revenueByType.Auction || 0)}. Average deal value: ${metrics?.dealCount && metrics.dealCount > 0 ? formatCurrency(metrics.totalRevenue / metrics.dealCount) : 'N/A'}.`,
    'performance': isBroker
      ? `Performance Report: Conversion Rate: ${(metrics?.statistics.conversionRate || 0).toFixed(1)}%, Open Deals: ${metrics?.statistics.openDeals || 0}, Closed Deals: ${metrics?.statistics.closedDeals || 0}.`
      : `Performance Report: Conversion Rate: ${(metrics?.statistics.conversionRate || 0).toFixed(1)}%, Deals Won: ${metrics?.dealsWon || 0}, Deals Lost: ${metrics?.dealsLost || 0}, Open Deals: ${metrics?.statistics.openDeals || 0}, Closed Deals: ${metrics?.statistics.closedDeals || 0}. Success rate indicates strong team performance and market execution.`,
    'broker': `Broker Network: Currently managing ${metrics?.accountCount || 0} active broker accounts. ${topBroker ? `Top performer: ${topBroker.name} with ${topBroker.closedDeals} closed deals and ${formatCurrency(topBroker.commission)} broker commission.` : 'Top performer is being calculated from live closed deals and commission.'}`,
    'lead': `Lead Analytics: Total leads in system: ${metrics?.leadCount || 0}. Lead to deal conversion rate: ${(metrics?.statistics.conversionRate || 0).toFixed(1)}%. Active lead sources include sales pipeline, tenant inquiries, and broker referrals. Current pipeline status shows healthy prospect flow.`,
    'contact': `Contact Management: Total contacts: ${metrics?.contactCount || 0}, Total accounts: ${metrics?.accountCount || 0}. Contacts are linked to properties, leasing arrangements, and deal activities. All contact information is synchronized across the CRM system.`,
    'metrics': isBroker
      ? `Key Metrics Dashboard: Open Deals: ${metrics?.statistics.openDeals || 0}, Closed Deals: ${metrics?.statistics.closedDeals || 0}, Conversion Rate: ${(metrics?.statistics.conversionRate || 0).toFixed(1)}%, Total Leads: ${metrics?.leadCount || 0}.`
      : `Key Metrics Dashboard: Total Revenue: ${formatCurrency(metrics?.totalRevenue || 0)}, Deals Won: ${metrics?.dealsWon || 0}, Deals Lost: ${metrics?.dealsLost || 0}, Open Deals: ${metrics?.statistics.openDeals || 0}, Conversion Rate: ${(metrics?.statistics.conversionRate || 0).toFixed(1)}%, Company Commission: ${formatCurrency(metrics?.companyCommission || 0)}, Total Leads: ${metrics?.leadCount || 0}.`,
    'sale': isBroker
      ? `Sales Analysis: Sales deals completed: ${metrics?.dealsWon || 0}. Sales pipeline has ${metrics?.statistics.openDeals || 0} open opportunities. Conversion rate is ${(metrics?.statistics.conversionRate || 0).toFixed(1)}%.`
      : `Sales Analysis: Sales revenue: ${formatCurrency(metrics?.revenueByType.Sales || 0)}, Sales deals: ${metrics?.dealsWon || 0} completed. Sales pipeline is active with ${metrics?.statistics.openDeals || 0} open opportunities. Sales team conversion rate is ${(metrics?.statistics.conversionRate || 0).toFixed(1)}%.`,
    'lease': isBroker
      ? 'Leasing module tracks tenants, landlords, and lease agreements. Current leasing stock is available for assignment to qualified tenants and brokers.'
      : `Leasing Overview: Leasing revenue: ${formatCurrency(metrics?.revenueByType.Leasing || 0)}. Leasing module tracks tenants, landlords, and lease agreements. Current leasing stock available for assignment to qualified tenants and brokers.`,
    'auction': isBroker
      ? 'Auction listings are available for properties with real-time bid tracking and activity monitoring.'
      : `Auction Activity: Auction revenue: ${formatCurrency(metrics?.revenueByType.Auction || 0)}. Auction listings available for properties. Real-time auction management with bid tracking and property valuation data integrated.`,
    'chart': isBroker
      ? 'Analytics dashboards include deal status and performance tracking without revenue figures.'
      : `Analytics Dashboards: Real-time visualization includes Monthly Sales (Revenue by Deal Type), Statistics (Open vs Closed deals), and Total Revenue tracking. Charts refresh from live database updates and realtime events.`,
    'system': `System Overview: DG-CRM is a comprehensive real estate and property management system with real-time analytics, AI chat support, deal tracking, broker management, lease administration, and performance monitoring. All metrics update in real-time with data synchronized across modules.`,
    'help': isBroker
      ? `Available Commands: Ask me about 'deals', 'performance', 'brokers', 'leads', 'contacts', 'sales', 'leasing', 'auctions', 'metrics', 'charts', or 'system status'.`
      : `Available Commands: Ask me about 'deals', 'revenue', 'performance', 'brokers', 'leads', 'contacts', 'sales', 'leasing', 'auctions', 'metrics', 'charts', or 'system status'. I have access to all CRM data and can provide detailed insights about any aspect of your business.`,
  }), [isBroker, metrics, topBroker]);

  // Enhanced AI response generator with context awareness
  const generateAIResponse = (userInput: string): string => {
    const lowerInput = userInput.toLowerCase();
    let response = 'I can help with information about deals, revenue, performance, brokers, leads, contacts, sales, leasing, auctions, metrics, or system status. Please be more specific about what you\'d like to know.';

    // Check for keywords and provide relevant responses
    if (lowerInput.includes('deal')) response = aiResponses['deal'];
    else if (lowerInput.includes('revenue') || lowerInput.includes('commission') || lowerInput.includes('income')) response = aiResponses['revenue'];
    else if (lowerInput.includes('performance') || lowerInput.includes('metric') || lowerInput.includes('status')) response = aiResponses['performance'];
    else if (lowerInput.includes('broker')) response = aiResponses['broker'];
    else if (lowerInput.includes('lead')) response = aiResponses['lead'];
    else if (lowerInput.includes('contact') || lowerInput.includes('account')) response = aiResponses['contact'];
    else if (lowerInput.includes('sale') || lowerInput.includes('sales')) response = aiResponses['sale'];
    else if (lowerInput.includes('lease') || lowerInput.includes('leasing') || lowerInput.includes('tenant')) response = aiResponses['lease'];
    else if (lowerInput.includes('auction')) response = aiResponses['auction'];
    else if (lowerInput.includes('chart') || lowerInput.includes('analytics') || lowerInput.includes('dashboard')) response = aiResponses['chart'];
    else if (lowerInput.includes('system') || lowerInput.includes('how')) response = aiResponses['system'];
    else if (lowerInput.includes('help') || lowerInput.includes('what') || lowerInput.includes('can you')) response = aiResponses['help'];

    return response;
  };

  const handleSendMessage = () => {
    if (!userInput.trim()) return;

    const newMessages = [
      ...chatMessages,
      { 
        sender: 'user', 
        text: userInput, 
        time: getCurrentTime()
      },
    ];

    const botResponse = generateAIResponse(userInput);

    setTimeout(() => {
      setChatMessages([
        ...newMessages,
        { 
          sender: 'bot', 
          text: botResponse, 
          time: getCurrentTime()
        },
      ]);
    }, 300);

    setUserInput('');
  };

  const topMetrics = useMemo(() => {
    if (isBroker) {
      return [
        {
          label: "Open Deals",
          value: metrics?.statistics.openDeals?.toString() || "0",
          change: formatTrend(trends.openDeals),
          subtext: "Since last month",
          icon: FiBriefcase,
        },
        {
          label: "Closed Deals",
          value: metrics?.statistics.closedDeals?.toString() || "0",
          change: formatTrend(trends.closedDeals),
          subtext: "Since last month",
          icon: FiEye,
        },
        {
          label: "Conversion Rate",
          value: `${(metrics?.statistics.conversionRate || 0).toFixed(1)}%`,
          change: formatTrend(trends.conversionRate),
          subtext: "Since last month",
          icon: FiTrendingUp,
        },
        {
          label: "Total Leads",
          value: metrics?.leadCount?.toString() || "0",
          change: formatTrend(trends.leadCount),
          subtext: "Since last month",
          icon: FiZap,
        },
      ];
    }

    return [
      {
        label: "Total Revenue",
        value: metrics ? formatCurrency(metrics.totalRevenue) : "R 0",
        change: formatTrend(trends.totalRevenue),
        subtext: "Since last month",
        icon: FiTrendingUp,
      },
      {
        label: "Deals Won",
        value: metrics?.dealsWon?.toString() || "0",
        change: formatTrend(trends.dealsWon),
        subtext: "Since last month",
        icon: FiEye,
      },
      {
        label: "Deals Lost",
        value: metrics?.dealsLost?.toString() || "0",
        change: formatTrend(trends.dealsLost),
        subtext: "Since last month",
        icon: FiTrendingDown,
      },
      {
        label: "Company Commission",
        value: metrics ? formatCurrency(metrics.companyCommission) : "R 0",
        change: formatTrend(trends.companyCommission),
        subtext: "Since last month",
        icon: FiArrowUpRight,
      },
    ];
  }, [isBroker, metrics, trends]);

  const quickStats = useMemo(() => [
    { label: "Leads", value: metrics?.leadCount?.toString() || "0", color: "bg-blue-50", textColor: "text-blue-600", icon: FiZap },
    { label: "Deals", value: metrics?.dealCount?.toString() || "0", color: "bg-purple-50", textColor: "text-purple-600", icon: FiBriefcase },
    { label: "Contacts", value: metrics?.contactCount?.toString() || "0", color: "bg-green-50", textColor: "text-green-600", icon: FiUsers },
    { label: "Accounts", value: metrics?.accountCount?.toString() || "0", color: "bg-orange-50", textColor: "text-orange-600", icon: FiPhone },
  ], [metrics]);

  const monthlyRevenueByType = useMemo(() => {
    const result = { Sales: 0, Leasing: 0, Auction: 0 };
    const entries = metrics?.dailySalesData || [];
    if (entries.length === 0) return result;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    for (const entry of entries) {
      const entryDate = new Date(entry.date);
      if (Number.isNaN(entryDate.getTime())) continue;
      if (entryDate.getMonth() !== currentMonth || entryDate.getFullYear() !== currentYear) {
        continue;
      }

      const type = String(entry.type || '').toLowerCase();
      if (type === 'sales' || type === 'sale') result.Sales += Number(entry.amount || 0);
      if (type === 'leasing' || type === 'lease') result.Leasing += Number(entry.amount || 0);
      if (type === 'auction') result.Auction += Number(entry.amount || 0);
    }

    return result;
  }, [metrics?.dailySalesData]);

  // Calculate pie chart percentages from current month live values
  const totalMonthlyRevenue =
    monthlyRevenueByType.Sales + monthlyRevenueByType.Leasing + monthlyRevenueByType.Auction || 1;
  const salesPercent = (monthlyRevenueByType.Sales / totalMonthlyRevenue) * 100;
  const leasingPercent = (monthlyRevenueByType.Leasing / totalMonthlyRevenue) * 100;
  const auctionPercent = (monthlyRevenueByType.Auction / totalMonthlyRevenue) * 100;

  // Calculate pie chart stroke-dasharray values
  const salesDash = (salesPercent / 100) * 280;
  const leasingDash = (leasingPercent / 100) * 280;
  const auctionDash = (auctionPercent / 100) * 280;

  // Relative bar heights for Statistics chart
  const dealBarMax = Math.max(
    metrics?.statistics.openDeals || 0,
    metrics?.statistics.closedDeals || 0,
    metrics?.statistics.lostDeals || 0,
    1
  );

  return (
    <>
      <style>{chartAnimationStyles}</style>
      <div className="p-2 bg-stone-100 min-h-0 space-y-2">
      {/* Header with last updated */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-stone-950">Dashboard</h1>
          {lastUpdated && (
            <p className="text-[10px] text-stone-500 mt-0.5">Last updated: {formatRelativeTime(lastUpdated)}</p>
          )}
        </div>
        <NotificationCenter />
      </div>

      {/* Top Metrics */}
      {!isBroker && (
        <UnifiedStatsCards
          items={topMetrics.map(metric => ({
            id: metric.label,
            label: metric.label,
            value: metric.value,
            icon: metric.icon,
            change: metric.change,
            subtext: metric.subtext,
          }))}
          isLoading={isLoading}
        />
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
        {isLoading ? (
          Array(4).fill(0).map((_, i) => <SkeletonLoader key={i} />)
        ) : (
          quickStats.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div key={idx} className={`${stat.color} rounded border border-stone-200 p-2 flex items-start justify-between hover:shadow-md transition-shadow`}>
                <div>
                  <p className={`${stat.textColor} text-[11px] font-semibold mb-0.5`}>{stat.label}</p>
                  <p className={`text-lg font-bold ${stat.textColor}`}>{stat.value}</p>
                </div>
                <Icon size={14} className={stat.textColor} />
              </div>
            );
          })
        )}
      </div>

      {/* Charts and Analytics Section - 3 Column Layout */}
      <div className={isBroker ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2"}>
        {/* Monthly Sales - Donut Chart */}
        <div className="bg-white rounded p-1 border border-stone-200 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col h-full min-h-0">
          <div className="mb-2">
            <CardHeader title="Monthly Sales" subtitle="Live Revenue by Deal Type (This Month)" />
          </div>
          {isLoading ? (
            <div className="flex-1 bg-gradient-to-br from-stone-50 to-stone-100 rounded animate-pulse"></div>
          ) : (
            <>
              <div className="flex items-center justify-center flex-1 min-h-20 mb-1">
                <svg viewBox="0 0 120 120" width="120" height="120" className="donut-chart">
                  <circle cx="60" cy="60" r="45" fill="none" stroke="#ef4444" strokeWidth="12" strokeDasharray={`${salesDash} ${280 - salesDash}`} strokeDashoffset="0" strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
                  <circle cx="60" cy="60" r="45" fill="none" stroke="#06b6d4" strokeWidth="12" strokeDasharray={`${leasingDash} ${280 - leasingDash}`} strokeDashoffset={`-${salesDash}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
                  <circle cx="60" cy="60" r="45" fill="none" stroke="#10b981" strokeWidth="12" strokeDasharray={`${auctionDash} ${280 - auctionDash}`} strokeDashoffset={`-${salesDash + leasingDash}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
                </svg>
              </div>
              <div className="bg-stone-50 rounded p-1 space-y-0.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-400 shadow-sm animate-pulse"></div>
                    <span className="text-xs font-medium text-stone-700">Sales</span>
                  </div>
                  <span className="stat-value text-xs font-bold text-stone-900">
                    {salesPercent.toFixed(1)}% • {formatCurrency(monthlyRevenueByType.Sales)}
                  </span>
                </div>
                <div className="w-full bg-stone-200 rounded-full h-1 overflow-hidden">
                  <div className="progress-bar bg-red-400 h-1 rounded-full" style={{ width: `${salesPercent}%` }}></div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <span className="text-xs font-medium text-stone-700">Leasing</span>
                  </div>
                  <span className="stat-value text-xs font-bold text-stone-900">
                    {leasingPercent.toFixed(1)}% • {formatCurrency(monthlyRevenueByType.Leasing)}
                  </span>
                </div>
                <div className="w-full bg-stone-200 rounded-full h-1 overflow-hidden">
                  <div className="progress-bar bg-cyan-400 h-1 rounded-full" style={{ width: `${leasingPercent}%`, animationDelay: '0.2s' }}></div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                    <span className="text-xs font-medium text-stone-700">Auction</span>
                  </div>
                  <span className="stat-value text-xs font-bold text-stone-900">
                    {auctionPercent.toFixed(1)}% • {formatCurrency(monthlyRevenueByType.Auction)}
                  </span>
                </div>
                <div className="w-full bg-stone-200 rounded-full h-1 overflow-hidden">
                  <div className="progress-bar bg-emerald-400 h-1 rounded-full" style={{ width: `${auctionPercent}%`, animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Statistics - Bar Chart */}
        <div className="bg-white rounded-xl p-2 border border-stone-200 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col h-full min-h-0">
          <div className="mb-4">
            <CardHeader title="Statistics" subtitle="Live Deal Status Overview" />
          </div>
          {isLoading ? (
            <div className="flex-1 bg-gradient-to-br from-stone-50 to-stone-100 rounded-xl animate-pulse"></div>
          ) : (
            <>
              <div className="flex items-end justify-around flex-1 min-h-32 mb-2 px-2 bg-gradient-to-br from-stone-50 to-stone-100 rounded py-2">
                <div className="flex flex-col items-center gap-3">
                  <div className="chart-bar w-6 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-lg shadow-md transition-all duration-300 hover:shadow-2xl" style={{ height: `${Math.round(((metrics?.statistics.openDeals || 0) / dealBarMax) * 160)}px` }}></div>
                  <span className="text-xs font-semibold text-stone-600 mt-2">Open</span>
                  <span className="stat-value text-lg font-bold text-blue-600">{metrics?.statistics.openDeals || 0}</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="chart-bar w-6 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-lg shadow-md transition-all duration-300 hover:shadow-2xl" style={{ height: `${Math.round(((metrics?.statistics.closedDeals || 0) / dealBarMax) * 160)}px` }}></div>
                  <span className="text-xs font-semibold text-stone-600 mt-2">Closed</span>
                  <span className="stat-value text-lg font-bold text-emerald-600">{metrics?.statistics.closedDeals || 0}</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="chart-bar w-6 bg-gradient-to-t from-red-600 to-red-400 rounded-t-lg shadow-md transition-all duration-300 hover:shadow-2xl" style={{ height: `${Math.round(((metrics?.statistics.lostDeals || 0) / dealBarMax) * 160)}px` }}></div>
                  <span className="text-xs font-semibold text-stone-600 mt-2">Lost</span>
                  <span className="stat-value text-lg font-bold text-red-600">{metrics?.statistics.lostDeals || 0}</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="chart-bar w-6 bg-gradient-to-t from-yellow-500 to-yellow-300 rounded-t-lg shadow-md transition-all duration-300 hover:shadow-2xl" style={{ height: `${Math.round(((metrics?.statistics.conversionRate || 0) / 100) * 160)}px` }}></div>
                  <span className="text-xs font-semibold text-stone-600 mt-2">Conv%</span>
                  <span className="stat-value text-lg font-bold text-yellow-600">{(metrics?.statistics.conversionRate || 0).toFixed(1)}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 bg-stone-50 rounded p-2">
                <div className="flex items-center justify-between transition-transform hover:translate-x-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-stone-700">Open</span>
                  </div>
                  <span className="stat-value text-sm font-bold text-stone-900">{metrics?.statistics.openDeals || 0}</span>
                </div>
                <div className="flex items-center justify-between transition-transform hover:translate-x-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" style={{ animationDelay: '0.15s' }}></div>
                    <span className="text-sm font-medium text-stone-700">Closed</span>
                  </div>
                  <span className="stat-value text-sm font-bold text-stone-900">{metrics?.statistics.closedDeals || 0}</span>
                </div>
                <div className="flex items-center justify-between transition-transform hover:translate-x-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }}></div>
                    <span className="text-sm font-medium text-stone-700">Lost</span>
                  </div>
                  <span className="stat-value text-sm font-bold text-stone-900">{metrics?.statistics.lostDeals || 0}</span>
                </div>
                <div className="flex items-center justify-between transition-transform hover:translate-x-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse" style={{ animationDelay: '0.45s' }}></div>
                    <span className="text-sm font-medium text-stone-700">Conv Rate</span>
                  </div>
                  <span className="stat-value text-sm font-bold text-stone-900">{(metrics?.statistics.conversionRate || 0).toFixed(1)}%</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Total Revenue - Line Chart */}
        {!isBroker && (
          <div className="bg-white rounded-xl p-2 border border-stone-200 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col h-full min-h-0">
            <div className="mb-4">
              <CardHeader title="Total Revenue" subtitle="Monthly Sales, Leasing, and Auction" />
            </div>
            {isLoading ? (
              <div className="flex-1 bg-gradient-to-br from-stone-50 to-stone-100 rounded-xl animate-pulse"></div>
            ) : (
              <div className="flex-1 min-h-32 flex flex-col">
                <div className="flex-1 overflow-x-auto mb-2">
                  <RevenueChart />
                </div>
                <div className="bg-stone-50 rounded p-2 flex items-center justify-center gap-3">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-blue-500 rounded-full shadow-sm"></div>
                    <span className="text-xs font-medium text-stone-700">Sales</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-emerald-500 rounded-full shadow-sm" style={{ strokeDasharray: '4,4' }}></div>
                    <span className="text-xs font-medium text-stone-700">Leasing</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-amber-500 rounded-full shadow-sm" style={{ strokeDasharray: '2,6' }}></div>
                    <span className="text-xs font-medium text-stone-700">Auction</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Section - Chat, Deals & Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div className="rounded-xl border border-stone-200 bg-white p-2 shadow-sm transition-shadow hover:shadow-md flex flex-row min-h-0 h-[180px]">
          <div className="flex flex-col w-full">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="text-base font-semibold text-stone-900">Mr Leo Chat</h3>
                <p className="text-xs text-stone-500">AI Assistant - Full System Knowledge</p>
              </div>
              <button
                onClick={() => setIsExpandedChat(!isExpandedChat)}
                className="rounded border border-stone-200 p-1 text-stone-500 hover:bg-stone-50"
                title="Expand chat"
                type="button"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6v10a2 2 0 002 2h10v-4m-4-6l6-6m0 0l4 4m-4-4v10" />
                </svg>
              </button>
            </div>
            <div className="flex flex-row gap-2 flex-1 min-h-0">
              <div className="flex items-center justify-center shrink-0">
                <img src="/dogchat.png" alt="DG-CRM Assistant" className="h-20 w-20 object-contain" />
              </div>
              <div className="flex-1 flex flex-col">
                <div className="flex-1 min-h-0 max-h-[110px] space-y-2 overflow-y-auto pr-1">
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`w-full max-w-[220px] text-xs ${
                        msg.sender === 'user'
                          ? 'ml-auto rounded-xl bg-blue-600 px-2 py-1.5 text-white shadow'
                          : 'mr-auto rounded-xl border border-stone-200 bg-white p-2 text-stone-700 shadow'
                      }`}
                    >
                      <p className="leading-relaxed">{msg.text}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          msg.sender === 'user' ? 'text-blue-100' : 'text-stone-400'
                        }`}
                      >
                        {msg.time}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-end gap-1 pt-1">
                  <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Ask anything about your CRM system..."
                    className="w-full max-w-[180px] rounded-xl border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600 shadow outline-none focus:border-blue-300"
                  />
                  <button
                    onClick={() => (isVoiceListening ? stopVoice() : startVoice())}
                    className={`flex h-7 w-7 items-center justify-center rounded border border-stone-200 text-stone-500 shadow transition hover:bg-stone-50 ${
                      !isVoiceSupported ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                    title={isVoiceSupported ? 'Voice input' : 'Voice input not supported'}
                    type="button"
                    disabled={!isVoiceSupported}
                  >
                    {isVoiceListening ? <FiMicOff size={14} /> : <FiMic size={14} />}
                  </button>
                  <button
                    onClick={handleSendMessage}
                    className="flex h-7 w-7 items-center justify-center rounded bg-blue-600 text-white shadow transition hover:bg-blue-700"
                    type="button"
                  >
                    <FiArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Deals & Performance */}
        <div className="bg-gradient-to-br from-white via-blue-50 to-indigo-50 rounded p-1 border border-indigo-200 shadow-sm min-h-0 h-[180px] flex flex-col justify-between">
          <h3 className="text-xs font-bold text-indigo-950 mb-1">Performance Metrics</h3>
          <div className="space-y-1">
            {/* Conversion Rate Card */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded p-1.5 shadow group cursor-pointer hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-200 text-[10px] font-semibold uppercase">Conversion Rate</p>
                  <p className="text-base font-bold text-white mt-0.5">{(metrics?.statistics.conversionRate || 0).toFixed(1)}%</p>
                </div>
                <div className="w-5 h-5 bg-white/20 rounded flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Average Deal Value Card */}
            {!isBroker && (
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded p-1.5 shadow group cursor-pointer hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-200 text-[10px] font-semibold uppercase">Avg Deal Value</p>
                    <p className="text-base font-bold text-white mt-0.5">
                      {metrics?.dealCount && metrics?.dealCount > 0 
                        ? formatCurrency((metrics?.totalRevenue || 0) / metrics?.dealCount)
                        : 'R 0'
                      }
                    </p>
                  </div>
                  <div className="w-5 h-5 bg-white/20 rounded flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* Top Broker Card */}
            <div
              className="bg-gradient-to-br from-amber-500 to-orange-600 rounded p-1.5 shadow cursor-pointer hover:shadow-md transition-all"
              onClick={() => window.dispatchEvent(new CustomEvent('navigation:page-change', { detail: { page: 'Broker Profiles' } }))}
              title="View Broker Profiles"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 flex-1">
                  {topBroker && (
                    <div className="w-5 h-5 rounded bg-white/20 flex items-center justify-center text-white font-bold text-[10px]">
                      {topBroker.avatar}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-[10px] text-amber-200 font-semibold uppercase">Top Performer</p>
                    <p className="text-[11px] font-bold text-white truncate">{topBroker?.name || "N/A"}</p>
                    <p className="text-[10px] text-amber-100">{topBroker?.closedDeals || 0} Closings</p>
                    <p className="text-[10px] text-amber-100">{formatCurrency(topBroker?.commission || 0)} Commission</p>
                  </div>
                </div>
                <GiTrophy className="text-white text-xs ml-1" />
              </div>
            </div>
          </div>
          {/* Quick Stats Bar */}
          <div className="grid grid-cols-3 gap-1 mt-2 pt-2 border-t border-indigo-200">
            <div className="text-center p-1 bg-blue-50 rounded">
              <p className="text-[11px] text-blue-600 font-semibold">OPEN</p>
              <p className="text-xl font-bold text-blue-900">{metrics?.statistics.openDeals || 0}</p>
            </div>
            <div className="text-center p-2 bg-purple-50 rounded-md">
              <p className="text-xs text-purple-600 font-semibold">CLOSED</p>
              <p className="text-xl font-bold text-purple-900">{metrics?.statistics.closedDeals || 0}</p>
            </div>
            <div className="text-center p-2 bg-amber-50 rounded-md">
              <p className="text-xs text-amber-600 font-semibold">LEADS</p>
              <p className="text-xl font-bold text-amber-900">{metrics?.leadCount || 0}</p>
            </div>
          </div>
        </div>

        {/* Activities */}
        <div id="recent-activities" className="bg-white rounded-xl p-6 border border-stone-200 shadow-sm">
          <h3 className="text-lg font-bold text-stone-950 mb-1">Recent Activities</h3>
          <p className="text-xs text-stone-500 mb-6">Live Activity Feed</p>
          
          {isLoading ? (
            <div className="space-y-3">
              {Array(3).fill(0).map((_, i) => (
                <div key={i} className="h-14 bg-stone-100 rounded-lg animate-pulse"></div>
              ))}
            </div>
          ) : visibleActivities.length > 0 ? (
            <>
            <div className={`space-y-2 overflow-y-auto ${showAllActivities ? '' : 'max-h-96'}`}>
              {visibleActivities.map((activity) => (
                <div
                  key={activity.id}
                  onClick={() => {
                    setSelectedActivity(activity);
                    setShowActivityModal(true);
                  }}
                  className="group p-4 rounded-lg border border-stone-200 bg-stone-50 hover:bg-white hover:border-stone-300 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-sm font-semibold text-stone-900 line-clamp-2">{activity.description}</p>
                      </div>
                      <p className="text-xs text-stone-500">
                        {formatRelativeTime(activity.timestamp)} by <span className="font-medium text-stone-600">{activity.actor}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteActivity(activity.id);
                          }}
                          disabled={deletingActivityId === activity.id}
                          className="rounded px-2 py-1 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                        >
                          {deletingActivityId === activity.id ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                      <FiChevronRight className="text-stone-400 group-hover:text-stone-600 transition-colors" size={18} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {visibleActivities.length > 4 && (
              <div className="mt-2 border-t border-stone-100 pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllActivities(prev => !prev)}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  {showAllActivities ? '▲ Collapse' : `▼ Show all ${visibleActivities.length} activities`}
                </button>
              </div>
            )}
            </>
          ) : (
            <div className="text-center py-12 text-stone-400">
              <p className="text-sm">No activities yet</p>
            </div>
          )}
        </div>

        {/* Activity Details Modal */}
        <ActivityDetailsModal
          activity={selectedActivity}
          isOpen={showActivityModal}
          onClose={() => {
            setShowActivityModal(false);
            setSelectedActivity(null);
          }}
        />
      </div>

      {/* Expanded Chat Modal */}
      {isExpandedChat && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 rounded-3xl shadow-2xl flex flex-col w-full max-w-3xl h-5/6 border border-blue-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-3xl p-6 flex items-center justify-between border-b border-blue-300">
              <div>
                <h2 className="text-2xl font-bold text-white">Mr Leo Chat</h2>
                <p className="text-blue-100 text-sm mt-1">Ask me anything about your real estate business</p>
              </div>
              <button
                onClick={() => setIsExpandedChat(false)}
                className="p-3 hover:bg-white/20 rounded-full transition-colors text-white"
                title="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-5">
              {chatMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-stone-800 mb-2">Welcome to CRM Intelligence</h3>
                    <p className="text-stone-600 mb-6 max-w-md">
                      {isBroker
                        ? "Ask about deal progress, broker activity, and performance metrics available to your role."
                        : "I have complete access to your system data. Ask about deals, brokers, performance, leads, or anything else happening in your business."}
                    </p>
                    <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                      {(isBroker
                        ? ['How many deals are open?', 'Show my performance stats', 'Top performing broker?', 'Lead conversion rate?']
                        : ['How many deals are open?', 'What\'s the total revenue?', 'Top performing broker?', 'Lead conversion rate?']).map((q) => (
                        <button
                          key={q}
                          onClick={() => {
                            setUserInput(q);
                            setTimeout(() => handleSendMessage(), 50);
                          }}
                          className="text-left p-3 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition-all text-sm text-stone-700 font-medium"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-slideUp`}>
                    <div className={`max-w-lg p-5 rounded-2xl ${
                      msg.sender === 'user' 
                        ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-none shadow-lg' 
                        : 'bg-white text-stone-800 rounded-bl-none border border-blue-200 shadow-md'
                    }`}>
                      <p className="text-base leading-relaxed">{msg.text}</p>
                      <p className={`text-xs mt-3 font-medium ${msg.sender === 'user' ? 'text-blue-100' : 'text-stone-400'}`}>{msg.time}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input Area */}
            <div className="border-t border-blue-200 p-6 bg-white rounded-b-3xl">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={
                    isBroker
                      ? "Ask me anything... (e.g., 'How many deals closed this month?')"
                      : "Ask me anything... (e.g., 'How many deals closed this month?' or 'Top 5 brokers by revenue')"
                  }
                  className="flex-1 px-6 py-4 border border-blue-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50 text-stone-900 placeholder-stone-500"
                  autoFocus
                />
                <button
                  onClick={() => (isVoiceListening ? stopVoice() : startVoice())}
                  className={`flex items-center justify-center rounded-xl border border-blue-200 bg-white px-4 py-4 text-blue-600 shadow-md transition hover:bg-blue-50 ${
                    !isVoiceSupported ? 'cursor-not-allowed opacity-50' : ''
                  }`}
                  title={isVoiceSupported ? 'Voice input' : 'Voice input not supported'}
                  type="button"
                  disabled={!isVoiceSupported}
                >
                  {isVoiceListening ? <FiMicOff size={20} /> : <FiMic size={20} />}
                </button>
                <button
                  onClick={handleSendMessage}
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white px-6 py-4 rounded-xl transition-all shadow-lg hover:shadow-xl font-semibold flex items-center gap-2"
                >
                  <FiArrowUpRight size={20} />
                  Send
                </button>
              </div>
              <p className="text-xs text-stone-500 mt-3 text-center">
                {isBroker
                  ? "I can analyze deals, performance metrics, broker data, lead conversion, and more."
                  : "I can analyze deals, revenue, performance metrics, broker data, lead conversion, and more."}
              </p>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
};
