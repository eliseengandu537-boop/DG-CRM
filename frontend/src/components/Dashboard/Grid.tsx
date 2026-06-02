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
import NeedsAttentionWidget from "./NeedsAttentionWidget";
import TopPerformerBadge from "./TopPerformerBadge";
import { ActivityDetailsModal } from "./ActivityDetailsModal";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { NotificationCenter } from "@/components/Notifications/NotificationCenter";
import { UnifiedStatsCards } from './UnifiedStatsCards';
import { brokerService } from '@/services/brokerService';

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

  // Brokers — used to resolve the top performer's profile photo
  const [brokers, setBrokers] = useState<any[]>([]);
  useEffect(() => {
    let active = true;
    brokerService
      .getAllBrokers()
      .then(list => {
        if (active) setBrokers(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (active) setBrokers([]);
      });
    return () => {
      active = false;
    };
  }, []);

  // Top performer from live backend ranking (closed deals + commission)
  const topBroker = useMemo(() => {
    const performer = metrics?.topPerformer;
    if (!performer || !performer.name) return null;
    const matchedBroker =
      brokers.find(b => b && b.id && b.id === performer.brokerId) ||
      brokers.find(
        b => b && b.name && b.name.toLowerCase() === performer.name.toLowerCase()
      );
    const photo =
      (matchedBroker && matchedBroker.avatar) ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(performer.name)}`;
    return {
      name: performer.name,
      closedDeals: performer.closedDeals || 0,
      commission: performer.brokerCommission || 0,
      initials: performer.name.charAt(0).toUpperCase(),
      photo,
    };
  }, [metrics?.topPerformer, brokers]);

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

  // Donut chart geometry (radius 62)
  const donutCircumference = 2 * Math.PI * 62;
  const hasMonthlyRevenue =
    monthlyRevenueByType.Sales + monthlyRevenueByType.Leasing + monthlyRevenueByType.Auction > 0;
  const salesArc = (salesPercent / 100) * donutCircumference;
  const leasingArc = (leasingPercent / 100) * donutCircumference;
  const auctionArc = (auctionPercent / 100) * donutCircumference;

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
      {/* Header with last updated + Top Performer badge */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-stone-950">Dashboard</h1>
          {lastUpdated && (
            <p className="text-[10px] text-stone-500 mt-0.5">Last updated: {formatRelativeTime(lastUpdated)}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <TopPerformerBadge topPerformer={metrics?.topPerformer || null} size={56} />
          <NotificationCenter />
        </div>
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

      {/* Needs Attention — deals that need a touch today */}
      <div className="max-h-[420px]">
        <NeedsAttentionWidget />
      </div>

      {/* Charts and Analytics Section - 3 Column Layout */}
      <div className={isBroker ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2"}>
        {/* Monthly Sales - Donut Chart */}
        <div className="bg-white rounded-xl p-3 border border-stone-200 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col h-full min-h-0">
          <div className="mb-2">
            <CardHeader title="Monthly Sales" subtitle="Live Revenue by Deal Type (This Month)" />
          </div>
          {isLoading ? (
            <div className="flex-1 bg-gradient-to-br from-stone-50 to-stone-100 rounded animate-pulse"></div>
          ) : (
            <>
              <div className="flex items-center justify-center flex-1 min-h-40 my-2">
                <div className="relative">
                  <svg viewBox="0 0 160 160" width="172" height="172">
                    <circle cx="80" cy="80" r="62" fill="none" stroke="#f1f5f9" strokeWidth="16" />
                    {hasMonthlyRevenue && (
                      <g transform="rotate(-90 80 80)">
                        <circle
                          cx="80" cy="80" r="62" fill="none" stroke="#ef4444" strokeWidth="16"
                          strokeDasharray={`${salesArc} ${donutCircumference - salesArc}`}
                          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                        />
                        <circle
                          cx="80" cy="80" r="62" fill="none" stroke="#06b6d4" strokeWidth="16"
                          strokeDasharray={`${leasingArc} ${donutCircumference - leasingArc}`}
                          strokeDashoffset={`-${salesArc}`}
                          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                        />
                        <circle
                          cx="80" cy="80" r="62" fill="none" stroke="#10b981" strokeWidth="16"
                          strokeDasharray={`${auctionArc} ${donutCircumference - auctionArc}`}
                          strokeDashoffset={`-${salesArc + leasingArc}`}
                          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                        />
                      </g>
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="stat-value text-xl font-bold text-stone-900">
                      {formatCurrency(hasMonthlyRevenue ? totalMonthlyRevenue : 0)}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mt-0.5">
                      {hasMonthlyRevenue ? 'This Month' : 'No revenue yet'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-stone-50 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400 shadow-sm"></div>
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
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm"></div>
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
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm"></div>
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

        {/* Total Revenue - Line Chart */}
        {!isBroker && (
          <div className="md:col-span-2 lg:col-span-2 bg-white rounded-xl p-4 border border-stone-200 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col h-full min-h-0">
            <div className="mb-4">
              <CardHeader title="Total Revenue" subtitle="Monthly revenue trend — Sales, Leasing & Auction" />
            </div>
            {isLoading ? (
              <div className="flex-1 bg-gradient-to-br from-stone-50 to-stone-100 rounded-xl animate-pulse"></div>
            ) : (
              <div className="flex-1 min-h-[280px] flex flex-col">
                <RevenueChart />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Activity Details Modal — kept for triggers from elsewhere */}
      <ActivityDetailsModal
        activity={selectedActivity}
        isOpen={showActivityModal}
        onClose={() => {
          setShowActivityModal(false);
          setSelectedActivity(null);
        }}
      />

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

      {/* Floating Mr Leo chat launcher — always visible, WhatsApp-style. */}
      {!isExpandedChat && (
        <button
          type="button"
          onClick={() => setIsExpandedChat(true)}
          title="Ask Mr Leo"
          className="fixed bottom-6 right-6 z-[1300] flex h-16 w-16 items-center justify-center rounded-full bg-white border border-stone-200 shadow-2xl hover:scale-105 transition-transform"
        >
          <img
            src="/dogchat.png"
            alt="Mr Leo"
            className="h-12 w-12 object-contain"
          />
          <span className="absolute -top-1 -right-1 inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
        </button>
      )}
      </div>
    </>
  );
};
