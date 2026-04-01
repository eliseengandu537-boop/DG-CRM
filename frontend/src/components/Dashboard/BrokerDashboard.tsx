'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiArrowUpRight,
  FiBriefcase,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiMic,
  FiMicOff,
  FiMoreHorizontal,
  FiTrendingUp,
  FiUsers,
  FiZap,
} from 'react-icons/fi';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { AppPage, canAccessPage } from '@/lib/pageAccess';
import { useAuth } from '@/context/AuthContext';
import { useDashboard } from '@/context/DashboardContext';
import {
  ReminderPriority,
  ReminderRecord,
  ReminderType,
  reminderService,
} from '@/services/reminderService';
import { formatCurrency, formatRelativeTime, isTaskActivity } from '@/lib/dashboardService';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { NotificationCenter } from '@/components/Notifications/NotificationCenter';
import { UnifiedStatsCards } from './UnifiedStatsCards';

interface BrokerDashboardProps {
  onPageChange?: (page: string) => void;
}

type SalesBreakdownItem = {
  label: string;
  value: number;
  percent: number;
  color: string;
};

type ChatMessage = {
  sender: 'assistant' | 'user';
  text: string;
  time: string;
};

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHLY_COLORS: Record<string, string> = {
  Sales: '#3B82F6',
  Leasing: '#14B8A6',
  Auction: '#F59E0B',
};

const TASK_TRIGGERS = [
  /\bcreate\b.*\btask\b/i,
  /\badd\b.*\btask\b/i,
  /\bnew\b.*\btask\b/i,
  /\bset\b.*\breminder\b/i,
  /\bremind\s+me\b/i,
  /\breminder\b.*\b(call|email|meeting|follow|task)\b/i,
  /\bschedule\b.*\b(task|reminder)\b/i,
];

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const startOfWeek = (value: Date) => {
  const day = startOfDay(value);
  day.setDate(day.getDate() - day.getDay());
  return day;
};

const startOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);

const endOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth() + 1, 0);

const addDays = (value: Date, amount: number) => {
  const day = new Date(value);
  day.setDate(day.getDate() + amount);
  return day;
};

const addMonths = (value: Date, amount: number) =>
  new Date(value.getFullYear(), value.getMonth() + amount, 1);

const toDateKey = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatTaskDate = (value: string) =>
  new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatDetailDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatMonthLabel = (value: Date) =>
  value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const formatTimeLabel = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const isSameMonth = (a: Date, b: Date) =>
  a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

const isSameDay = (a: Date | string, b: Date | string) => toDateKey(a) === toDateKey(b);

const isTaskIntent = (input: string) => {
  if (TASK_TRIGGERS.some(trigger => trigger.test(input))) return true;
  const lower = input.toLowerCase();
  if (!lower.includes('task') && !lower.includes('reminder')) return false;
  if (
    lower.includes('tomorrow') ||
    lower.includes('today') ||
    lower.includes('next ') ||
    /\b\d{4}-\d{1,2}-\d{1,2}\b/.test(lower) ||
    /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/.test(lower)
  ) {
    return true;
  }
  return false;
};

const parseDateFromText = (input: string) => {
  const lower = input.toLowerCase();
  const today = startOfDay(new Date());

  if (/\btoday\b/.test(lower)) return today;
  if (/\btomorrow\b/.test(lower)) return addDays(today, 1);
  if (/\bnext\s+week\b/.test(lower)) return addDays(today, 7);

  const nextWeekday = lower.match(
    /\bnext\s+(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b/
  );
  if (nextWeekday) {
    const dayMap: Record<string, number> = {
      sun: 0,
      sunday: 0,
      mon: 1,
      monday: 1,
      tue: 2,
      tues: 2,
      tuesday: 2,
      wed: 3,
      wednesday: 3,
      thu: 4,
      thur: 4,
      thurs: 4,
      thursday: 4,
      fri: 5,
      friday: 5,
      sat: 6,
      saturday: 6,
    };
    const target = dayMap[nextWeekday[1]];
    if (target !== undefined) {
      const diff = (target - today.getDay() + 7) % 7 || 7;
      return addDays(today, diff);
    }
  }

  const isoMatch = input.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    return new Date(year, month, day);
  }

  const monthMatch = input.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,\s*(\d{4}))?\b/i
  );
  if (monthMatch) {
    const monthName = monthMatch[1].toLowerCase();
    const monthIndex = MONTHS[monthName];
    const day = Number(monthMatch[2]);
    const year = monthMatch[3] ? Number(monthMatch[3]) : today.getFullYear();
    return new Date(year, monthIndex, day);
  }

  const slashMatch = input.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (slashMatch) {
    const month = Number(slashMatch[1]) - 1;
    const day = Number(slashMatch[2]);
    let year = slashMatch[3] ? Number(slashMatch[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }

  return null;
};

const parseTimeFromText = (input: string) => {
  const timeMatch =
    input.match(/\b(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i) ||
    input.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!timeMatch) return { hour: 9, minute: 0 };

  let hour = Number(timeMatch[1]);
  const minute = timeMatch[2] ? Number(timeMatch[2]) : 0;
  const meridian = timeMatch[3]?.toLowerCase();
  if (meridian === 'pm' && hour < 12) hour += 12;
  if (meridian === 'am' && hour === 12) hour = 0;
  return { hour, minute };
};

const extractTaskTitle = (input: string) => {
  const quoted = input.match(/["“”']([^"“”']+)["“”']/);
  if (quoted?.[1]) return quoted[1].trim();

  let title = input;
  const prefixes = [
    /^(please\s+)?(can you|could you|would you)?\s*(please\s+)?(create|add|make|set|schedule)\b/i,
    /^(please\s+)?(create|add|make|set|schedule)\s+(a\s+)?(task|reminder)\s*(to\s*)?/i,
    /^(please\s+)?remind\s+me\s+to\s*/i,
    /^(please\s+)?remind\s+me\s*/i,
    /^(please\s+)?set\s+(a\s+)?reminder\s*(to\s*)?/i,
  ];
  prefixes.forEach(prefix => {
    title = title.replace(prefix, '');
  });

  title = title
    .replace(/\bcan you\b/gi, '')
    .replace(/\bfor me\b/gi, '')
    .replace(/\ba task\b/gi, '')
    .replace(/\b(today|tomorrow|next week)\b/gi, '')
    .replace(
      /\bnext\s+(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b/gi,
      ''
    )
    .replace(/\bon\s+[A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?\b/gi, '')
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/gi, '')
    .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/gi, '')
    .replace(/\b(at|@)\s*\d{1,2}(:\d{2})?\s*(am|pm)?\b/gi, '')
    .replace(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/gi, '')
    .replace(/\b(urgent|high priority|medium priority|low priority|priority)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return title;
};

  const parseTaskIntent = (input: string) => {
  if (!isTaskIntent(input)) return null;

  const lower = input.toLowerCase();
  const title = extractTaskTitle(input);
  const date = parseDateFromText(input);
  const { hour, minute } = parseTimeFromText(input);

  const priority: ReminderPriority = /urgent|asap|high priority/.test(lower)
    ? 'high'
    : /low priority/.test(lower)
      ? 'low'
      : /medium priority/.test(lower)
        ? 'medium'
        : 'medium';

  let reminderType: ReminderType = 'task';
  if (/call|phone/.test(lower)) reminderType = 'call';
  if (/email/.test(lower)) reminderType = 'email';
  if (/follow\s?up/.test(lower)) reminderType = 'deal_follow_up';

  return { title, date, hour, minute, priority, reminderType };
};

const buildCalendarDays = (monthStart: Date) => {
  const start = startOfWeek(monthStart);
  const monthEnd = endOfMonth(monthStart);
  const end = addDays(startOfWeek(monthEnd), 6);
  const days: Date[] = [];

  for (let day = start; day <= end; day = addDays(day, 1)) {
    days.push(day);
  }

  return days;
};

const getTaskStatusLabel = (reminder: ReminderRecord) => {
  if (reminder.status === 'completed') return 'Completed';

  const now = Date.now();
  const dueTime = new Date(reminder.dueAt).getTime();
  if (dueTime < now) return 'Started';
  if (isSameDay(reminder.dueAt, new Date())) return 'Not Started';
  return 'Planned';
};

const getTaskStatusClass = (status: string) => {
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'Started') return 'bg-amber-100 text-amber-700';
  if (status === 'Not Started') return 'bg-stone-200 text-stone-700';
  return 'bg-blue-100 text-blue-700';
};

const getPriorityBadge = (priority: ReminderRecord['priority']) => {
  if (priority === 'high') {
    return { label: 'Urgent', className: 'bg-red-100 text-red-700' };
  }
  if (priority === 'medium') {
    return { label: 'High', className: 'bg-orange-100 text-orange-700' };
  }
  return null;
};

const getEventColor = (reminder: ReminderRecord) => {
  const title = reminder.title?.toLowerCase() || '';

  if (reminder.status === 'completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (title.includes('presentation')) {
    return 'bg-purple-100 text-purple-700 border-purple-200';
  }
  if (reminder.priority === 'high') return 'bg-red-100 text-red-700 border-red-200';
  if (reminder.reminderType === 'call') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (reminder.reminderType === 'deal_follow_up') {
    return 'bg-orange-100 text-orange-700 border-orange-200';
  }
  return 'bg-stone-100 text-stone-700 border-stone-200';
};

const getCurrentTime = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const BrokerDashboard: React.FC<BrokerDashboardProps> = ({ onPageChange }) => {
  const { user } = useAuth();
  const { metrics, isLoading, lastUpdated, error } = useDashboard();
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<ReminderRecord | null>(null);
  const [selectedTask, setSelectedTask] = useState<ReminderRecord | null>(null);
  const [tasks, setTasks] = useState<ReminderRecord[]>([]);
  const [isLoadingBoard, setIsLoadingBoard] = useState(false);
  const [boardError, setBoardError] = useState('');
  const [isExpandedChat, setIsExpandedChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      sender: 'assistant',
      text: 'Hello! I\'m Mr Leo your assistant. I have complete access to all system data and can answer any questions about deals, brokers, leads, performance metrics, revenue, and all CRM operations. What would you like to know?',
      time: '',
    },
  ]);

  const isBroker = user?.role === 'broker';
  const handleTranscript = useCallback((text: string) => {
    setChatInput(text);
  }, []);

  const {
    isSupported: isVoiceSupported,
    isListening: isVoiceListening,
    start: startVoice,
    stop: stopVoice,
  } = useSpeechRecognition(handleTranscript);

  const loadBoardData = useCallback(async () => {
    setIsLoadingBoard(true);
    setBoardError('');
    try {
      const filters: { limit: number; brokerId?: string } = { limit: 500 };
      if (isBroker && user?.brokerId) {
        filters.brokerId = user.brokerId;
      }
      const taskResult = await reminderService.getAllReminders(filters);
      setTasks(taskResult.data || []);
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : 'Failed to load dashboard tasks');
    } finally {
      setIsLoadingBoard(false);
    }
  }, [isBroker, user?.brokerId]);

  useEffect(() => {
    void loadBoardData();
    const timer = setInterval(() => void loadBoardData(), 15000);
    return () => clearInterval(timer);
  }, [loadBoardData]);

  useEffect(() => {
    setChatMessages(prev =>
      prev.map((msg, idx) => (idx === 0 && !msg.time ? { ...msg, time: getCurrentTime() } : msg))
    );
  }, []);

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

  const filteredTasks = useMemo(() => {
    if (!isBroker) return tasks;

    return tasks.filter(task => {
      if (task.assignedToRole && task.assignedToRole !== 'broker') return false;
      if (user?.brokerId && task.brokerId && task.brokerId !== user.brokerId) return false;
      if (task.assignedUserId && task.assignedUserId !== user.id) return false;
      return true;
    });
  }, [isBroker, tasks, user?.brokerId, user?.id]);

  const taskList = useMemo(() => {
    return [...filteredTasks]
      .filter(task => task.status !== 'completed' && task.status !== 'cancelled')
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .slice(0, 10);
  }, [filteredTasks]);

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

  const monthlySalesItems = useMemo<SalesBreakdownItem[]>(() => {
    const total =
      monthlyRevenueByType.Sales + monthlyRevenueByType.Leasing + monthlyRevenueByType.Auction ||
      0;
    return ['Sales', 'Leasing', 'Auction'].map(label => {
      const value = monthlyRevenueByType[label as keyof typeof monthlyRevenueByType] || 0;
      const percent = total > 0 ? (value / total) * 100 : 0;
      return {
        label,
        value,
        percent,
        color: MONTHLY_COLORS[label],
      };
    });
  }, [monthlyRevenueByType]);

  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);

  const visibleActivities = useMemo(
    () => (metrics?.recentActivities || []).filter(activity => !isTaskActivity(activity)),
    [metrics?.recentActivities]
  );
  const headlineActivities = useMemo(() => visibleActivities.slice(0, 5), [visibleActivities]);

  const calendarEventsByDay = useMemo(() => {
    const map = new Map<string, ReminderRecord[]>();
    calendarDays.forEach(day => map.set(toDateKey(day), []));

    filteredTasks.forEach(task => {
      const key = toDateKey(task.dueAt);
      const list = map.get(key);
      if (!list) return;
      list.push(task);
    });

    for (const list of Array.from(map.values())) {
      list.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    }

    return map;
  }, [calendarDays, filteredTasks]);

  const handleSelectEvent = (event: ReminderRecord) => {
    setSelectedEvent(event);
    setCalendarMonth(startOfMonth(new Date(event.dueAt)));
  };

  const handleTaskClick = (task: ReminderRecord) => {
    handleSelectEvent(task);
    setSelectedTask(task);
  };

  const closeTaskDetail = () => setSelectedTask(null);

  const openPage = (page: AppPage) => {
    if (!canAccessPage(user?.role, page)) return;
    onPageChange?.(page);
  };

  const generateChatResponse = useCallback(
    (input: string) => {
      const text = input.toLowerCase();
      if (text.includes('deal')) {
        return `You have ${metrics?.dealCount || 0} total deals. Open: ${
          metrics?.statistics.openDeals || 0
        }, Closed: ${metrics?.statistics.closedDeals || 0}.`;
      }
      if (text.includes('lead')) {
        return `There are ${metrics?.leadCount || 0} leads in your pipeline. Conversion rate is ${(
          metrics?.statistics.conversionRate || 0
        ).toFixed(1)}%.`;
      }
      if (text.includes('contact')) {
        return `You currently have ${metrics?.contactCount || 0} contacts connected to your CRM.`;
      }
      if (text.includes('task') || text.includes('calendar')) {
        return `You have ${taskList.length} upcoming tasks in your calendar.`;
      }
      if (text.includes('performance') || text.includes('conversion')) {
        return `Conversion rate is ${(metrics?.statistics.conversionRate || 0).toFixed(
          1
        )}%. Open deals: ${metrics?.statistics.openDeals || 0}.`;
      }
      if (text.includes('revenue') || text.includes('commission')) {
        if (isBroker) {
          return 'Revenue and commission figures are restricted for broker accounts.';
        }
        return `Total revenue is ${formatCurrency(metrics?.totalRevenue || 0)}. Company commission is ${formatCurrency(
          metrics?.companyCommission || 0
        )}.`;
      }
      return 'I can help with deals, leads, tasks, and calendar activity. Try asking about your pipeline or tasks.';
    },
    [isBroker, metrics, taskList.length]
  );

  const appendAssistantMessage = useCallback((text: string) => {
    setChatMessages(prev => [...prev, { sender: 'assistant', text, time: getCurrentTime() }]);
  }, []);

  const handleSendChat = async () => {
    const input = chatInput.trim();
    if (!input) return;

    setChatMessages(prev => [...prev, { sender: 'user', text: input, time: getCurrentTime() }]);
    setChatInput('');

    const taskIntent = parseTaskIntent(input);
    if (taskIntent) {
      const today = startOfDay(new Date());
      const taskTitle = taskIntent.title || 'New task';
      const taskDate = taskIntent.date ?? addDays(today, 1);
      const dueAt = new Date(taskDate);
      dueAt.setHours(taskIntent.hour, taskIntent.minute, 0, 0);

      try {
        const assignedToRole: 'broker' | 'manager' | 'admin' | undefined =
          user?.role === 'broker'
            ? 'broker'
            : user?.role === 'manager'
            ? 'manager'
            : user?.role === 'admin'
            ? 'admin'
            : undefined;
        const payload = {
          title: taskTitle,
          reminderType: taskIntent.reminderType,
          dueAt: dueAt.toISOString(),
          priority: taskIntent.priority,
          description: undefined,
          brokerId: user?.brokerId || undefined,
          assignedUserId: user?.id,
          assignedToRole,
        };
        const created = await reminderService.createReminder(payload);
        setTasks(prev => [created, ...prev]);
        appendAssistantMessage(
          `Task created: "${created.title}" due ${formatTaskDate(created.dueAt)}.`
        );
        if (!taskIntent.date) {
          appendAssistantMessage('I set the due date for tomorrow at 9:00 AM. Tell me if you want a different time.');
        }
        if (!taskIntent.title) {
          appendAssistantMessage('Tell me a better title and I can update it.');
        }
      } catch (err) {
        appendAssistantMessage(err instanceof Error ? err.message : 'Failed to create the task.');
      }
      return;
    }

    appendAssistantMessage(generateChatResponse(input));
  };

  const averageDealValue = metrics?.dealCount
    ? (metrics.totalRevenue || 0) / metrics.dealCount
    : 0;

  const totalMonthlyRevenue =
    monthlyRevenueByType.Sales + monthlyRevenueByType.Leasing + monthlyRevenueByType.Auction;
  const monthlyPercentTotal = monthlySalesItems.reduce((sum, item) => sum + item.percent, 0);
  const centerLabel = isBroker
    ? `${monthlyPercentTotal.toFixed(0)}%`
    : formatCurrency(totalMonthlyRevenue);

  return (
    <div className="min-h-screen bg-stone-100 px-4 pb-6 pt-0 lg:px-6">
      <div className="mb-4 flex items-center justify-end gap-3">
        <NotificationCenter />
        <div className="rounded-full bg-white px-3 py-1 text-xs text-stone-500 shadow-sm">
          {lastUpdated ? `Updated ${formatRelativeTime(lastUpdated)}` : 'Live updates enabled'}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      <div className="mb-4">
        <UnifiedStatsCards
          items={[
            {
              id: 'summary-leads',
              label: 'Leads',
              value: metrics?.leadCount || 0,
              icon: FiZap,
              change: 'Live',
              subtext: 'Current total',
              page: 'Sales' as AppPage,
            },
            {
              id: 'summary-deals',
              label: 'Deals',
              value: metrics?.dealCount || 0,
              icon: FiBriefcase,
              change: 'Live',
              subtext: 'Current total',
              page: 'Deal Sheet' as AppPage,
            },
            {
              id: 'summary-contacts',
              label: 'Contacts',
              value: metrics?.contactCount || 0,
              icon: FiUsers,
              change: 'Live',
              subtext: 'Current total',
              page: 'Broker Profiles' as AppPage,
            },
            {
              id: 'summary-closed',
              label: 'Closed Deals',
              value: metrics?.statistics.closedDeals || 0,
              icon: FiTrendingUp,
              change: 'Live',
              subtext: 'Current total',
              page: 'Deal Sheet' as AppPage,
            },
          ].map(card => {
            const canOpen = canAccessPage(user?.role, card.page);
            return {
              id: card.id,
              label: card.label,
              value: card.value,
              icon: card.icon,
              change: card.change,
              subtext: card.subtext,
              onClick: canOpen ? () => openPage(card.page) : undefined,
              disabled: !canOpen,
            };
          })}
          isLoading={isLoading}
        />
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,1.05fr)]">
        <div className="flex flex-col gap-4">
          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <section className="relative min-h-[300px] rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
          <button
            onClick={() => setIsExpandedChat(true)}
            className="absolute right-3 top-3 rounded-lg border border-stone-200 p-2 text-stone-500 hover:bg-stone-50"
            title="Expand chat"
            type="button"
          >
            <FiArrowUpRight />
          </button>
          <div className="flex h-full flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="relative flex shrink-0 justify-center sm:block">
                <img
                  src="/dogchat.png"
                  alt="DG-CRM Assistant"
                  className="h-48 w-48 object-contain"
                />
              </div>
              <div className="flex-1">
                <div className="max-h-48 space-y-3 overflow-y-auto pr-2">
                  {chatMessages.map((message, index) => (
                    <div
                      key={`${message.sender}-${index}`}
                      className={`w-full max-w-[360px] text-sm ${
                        message.sender === 'assistant'
                          ? 'mr-auto rounded-2xl border border-stone-200 bg-white p-4 text-stone-700 shadow-md'
                          : 'ml-auto rounded-2xl bg-blue-600 px-4 py-3 text-white shadow-md'
                      }`}
                    >
                      <p className="leading-relaxed">{message.text}</p>
                      {message.time && (
                        <p
                          className={`mt-2 text-[11px] ${
                            message.sender === 'assistant' ? 'text-stone-400' : 'text-blue-100'
                          }`}
                        >
                          {message.time}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
              <input
                value={chatInput}
                onChange={event => setChatInput(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && handleSendChat()}
                placeholder="Ask anything about your CRM system..."
                className="w-full max-w-[360px] rounded-2xl border border-stone-200 bg-white px-4 py-2 text-xs text-stone-600 shadow-md outline-none focus:border-blue-300"
              />
              <button
                onClick={() => (isVoiceListening ? stopVoice() : startVoice())}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 text-stone-500 shadow-md transition hover:bg-stone-50 ${
                  !isVoiceSupported ? 'cursor-not-allowed opacity-50' : ''
                }`}
                title={isVoiceSupported ? 'Voice input' : 'Voice input not supported'}
                type="button"
                disabled={!isVoiceSupported}
              >
                {isVoiceListening ? <FiMicOff /> : <FiMic />}
              </button>
              <button
                onClick={handleSendChat}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md transition hover:bg-blue-700"
                title="Send"
                type="button"
              >
                <FiArrowUpRight />
              </button>
            </div>
          </div>
        </section>

        <section className="h-full min-h-[300px] rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-900">Monthly Sales</h3>
              <p className="text-xs text-stone-500">Live Revenue by Deal Type (This Month)</p>
            </div>
            <FiMoreHorizontal className="text-stone-400" />
          </div>

          {isLoading ? (
            <div className="h-56 animate-pulse rounded-xl bg-stone-100" />
          ) : (
            <>
              <div className="relative h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={monthlySalesItems}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={2}
                    >
                      {monthlySalesItems.map(item => (
                        <Cell key={item.label} fill={item.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <p className="text-[11px] uppercase text-stone-400">This Month</p>
                  <p className="text-lg font-semibold text-stone-900">{centerLabel}</p>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {monthlySalesItems.map(item => (
                  <div key={item.label} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-stone-600">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-stone-700">
                      <span>{item.percent.toFixed(0)}%</span>
                      {!isBroker && (
                        <span className="text-stone-400">{formatCurrency(item.value)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="h-full min-h-[300px] rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-stone-900">Statistics</h3>
              <p className="text-xs text-stone-500">Live Deal Status Overview</p>
            </div>
            <FiMoreHorizontal className="text-stone-400" />
          </div>

          {isLoading ? (
            <div className="h-48 animate-pulse rounded-xl bg-stone-100" />
          ) : (
            <div className="space-y-3">
              <div className="h-36 rounded-xl bg-stone-50" />
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <div className="rounded-lg bg-stone-50 px-2 py-2 text-center">
                  <p className="text-stone-500">Open</p>
                  <p className="text-sm font-semibold text-blue-600">
                    {metrics?.statistics.openDeals || 0}
                  </p>
                </div>
                <div className="rounded-lg bg-stone-50 px-2 py-2 text-center">
                  <p className="text-stone-500">Closed</p>
                  <p className="text-sm font-semibold text-emerald-600">
                    {metrics?.statistics.closedDeals || 0}
                  </p>
                </div>
                <div className="rounded-lg bg-stone-50 px-2 py-2 text-center">
                  <p className="text-stone-500">Lost</p>
                  <p className="text-sm font-semibold text-red-500">
                    {metrics?.statistics.lostDeals || 0}
                  </p>
                </div>
                <div className="rounded-lg bg-stone-50 px-2 py-2 text-center">
                  <p className="text-stone-500">Conv%</p>
                  <p className="text-sm font-semibold text-amber-500">
                    {(metrics?.statistics.conversionRate || 0).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

          </div>

          <div className="grid gap-4 lg:grid-cols-4 items-start">
            <section className="lg:col-span-2 self-start rounded-2xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-3 py-2">
            <div>
              <h3 className="text-lg font-semibold text-stone-900">Calendar</h3>
              <p className="text-xs text-stone-500">{formatMonthLabel(calendarMonth)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalendarMonth(prev => addMonths(prev, -1))}
                className="rounded-lg border border-stone-200 p-2 text-stone-500 hover:bg-stone-50"
                title="Previous month"
                type="button"
              >
                <FiChevronLeft />
              </button>
              <button
                onClick={() => setCalendarMonth(startOfMonth(new Date()))}
                className="rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-600 hover:bg-stone-50"
                type="button"
              >
                Today
              </button>
              <button
                onClick={() => setCalendarMonth(prev => addMonths(prev, 1))}
                className="rounded-lg border border-stone-200 p-2 text-stone-500 hover:bg-stone-50"
                title="Next month"
                type="button"
              >
                <FiChevronRight />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-3 py-1.5 text-[11px] text-stone-500">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Completed
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> Calls/Meetings
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Urgent
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-orange-400" /> Sales
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-purple-500" /> Demos
            </span>
          </div>

          <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50 text-[11px] font-semibold text-stone-500">
            {WEEK_DAYS.map(day => (
              <div key={day} className="px-2 py-1.5">
                {day}
              </div>
            ))}
          </div>

          <div className="max-h-[240px] overflow-y-auto bg-stone-200">
            <div className="grid grid-cols-7 gap-px bg-stone-200">
              {calendarDays.map(day => {
                const key = toDateKey(day);
                const events = calendarEventsByDay.get(key) || [];
                const isToday = isSameDay(day, new Date());
                const visibleEvents = events.slice(0, 2);
                const hiddenCount = events.length - visibleEvents.length;
                return (
                  <div
                    key={key}
                    className={`min-h-[64px] bg-white p-1 ${
                      !isSameMonth(day, calendarMonth) ? 'bg-stone-50 text-stone-400' : ''
                    } ${isToday ? 'ring-1 ring-blue-300' : ''}`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span>{day.getDate()}</span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {visibleEvents.map(event => (
                        <button
                          key={event.id}
                          onClick={() => handleSelectEvent(event)}
                          className={`w-full truncate rounded border px-1 py-0.5 text-[10px] text-left ${getEventColor(
                            event
                          )} ${selectedEvent?.id === event.id ? 'ring-1 ring-blue-400' : ''}`}
                          title={`${formatTaskDate(event.dueAt)} - ${event.title}`}
                          type="button"
                        >
                          {formatTimeLabel(event.dueAt)} {event.title}
                        </button>
                      ))}
                      {hiddenCount > 0 && (
                        <p className="text-[10px] text-stone-400">+{hiddenCount} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-stone-100 px-3 py-2">
            {selectedEvent ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 p-2">
                <div>
                  <p className="text-sm font-semibold text-stone-800">{selectedEvent.title}</p>
                  <p className="text-xs text-stone-500">
                    {formatTaskDate(selectedEvent.dueAt)}
                    {selectedEvent.dealTitle ? ` · ${selectedEvent.dealTitle}` : ''}
                    {selectedEvent.contactName ? ` · ${selectedEvent.contactName}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => openPage('Reminders')}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-100"
                  type="button"
                >
                  Open task <FiArrowUpRight />
                </button>
              </div>
            ) : (
              <p className="text-xs text-stone-500">Click a calendar event to view details.</p>
            )}
          </div>
        </section>

            <section className="self-start rounded-2xl border border-stone-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-stone-900">Performance Metrics</h3>
                  <p className="text-xs text-stone-500">Live performance overview</p>
                </div>
                <FiMoreHorizontal className="text-stone-400" />
              </div>

              {isLoading ? (
                <div className="h-40 animate-pulse rounded-xl bg-stone-100" />
              ) : (
                <div className="space-y-2 text-xs">
                  <div className="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-3 py-2 text-white shadow-sm">
                    <p className="text-[11px] uppercase text-blue-100">Conversion Rate</p>
                    <p className="mt-1 text-xl font-semibold">
                      {(metrics?.statistics.conversionRate || 0).toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-3 py-2 text-white shadow-sm">
                    <p className="text-[11px] uppercase text-purple-100">Avg Deal Value</p>
                    <p className="mt-1 text-xl font-semibold">
                      {formatCurrency(averageDealValue)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2 text-white shadow-sm">
                    <p className="text-[11px] uppercase text-orange-100">Top Performer</p>
                    <p className="mt-1 text-sm font-semibold">
                      {metrics?.topPerformer?.name || 'N/A'}
                    </p>
                    <p className="text-[11px] text-orange-100">
                      {metrics?.topPerformer?.closedDeals || 0} closings ·{' '}
                      {formatCurrency(metrics?.topPerformer?.brokerCommission || 0)} commission
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-blue-50 p-1.5 text-center">
                      <p className="text-[10px] font-semibold text-blue-600">OPEN</p>
                      <p className="text-base font-semibold text-blue-700">
                        {metrics?.statistics.openDeals || 0}
                      </p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-1.5 text-center">
                      <p className="text-[10px] font-semibold text-emerald-600">CLOSED</p>
                      <p className="text-base font-semibold text-emerald-700">
                        {metrics?.statistics.closedDeals || 0}
                      </p>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-1.5 text-center">
                      <p className="text-[10px] font-semibold text-amber-600">LEADS</p>
                      <p className="text-base font-semibold text-amber-700">
                        {metrics?.leadCount || 0}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section
              id="recent-activities"
              className="self-start rounded-2xl border border-stone-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-stone-900">Recent Activities</h3>
                  <p className="text-xs text-stone-500">
                    {isBroker
                      ? 'Latest activity linked to your portfolio'
                      : 'Latest system activity for your dashboard'}
                  </p>
                </div>
                <FiMoreHorizontal className="text-stone-400" />
              </div>

              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`headline-activity-skeleton-${index}`}
                      className="h-12 animate-pulse rounded-lg bg-stone-100"
                    />
                  ))}
                </div>
              ) : headlineActivities.length > 0 ? (
                <div className="space-y-2">
                  {headlineActivities.map(activity => (
                    <div
                      key={`headline-${activity.id}`}
                      className="rounded-lg border border-stone-100 bg-stone-50 p-3 text-xs"
                    >
                      <p className="font-medium text-stone-700">{activity.description}</p>
                      <p className="mt-1 text-stone-500">
                        {formatRelativeTime(activity.timestamp)} · {activity.actor}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-stone-500">Recent activities will appear here automatically.</p>
              )}
            </section>

          </div>
        </div>

        <section className="flex flex-col self-start max-h-[360px] rounded-2xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2">
            <div>
              <h3 className="text-lg font-semibold text-stone-900">My Tasks</h3>
              <p className="text-xs text-stone-500">Synced from calendar</p>
            </div>
            <button
              onClick={() => openPage('Reminders')}
              className="rounded-lg border border-stone-200 p-2 text-stone-500 hover:bg-stone-50"
              title="Open Calendar"
              type="button"
            >
              <FiCalendar />
            </button>
          </div>

          <div className="max-h-[240px] divide-y divide-stone-100 overflow-y-auto">
            {isLoadingBoard ? (
              <div className="space-y-3 p-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`task-skeleton-${index}`}
                    className="h-10 rounded-lg bg-stone-100 animate-pulse"
                  />
                ))}
              </div>
            ) : taskList.length === 0 ? (
              <p className="p-3 text-sm text-stone-500">No upcoming tasks.</p>
            ) : (
              taskList.map(task => {
                const status = getTaskStatusLabel(task);
                const priorityBadge = getPriorityBadge(task.priority);
                return (
                  <button
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    className="w-full text-left px-3 py-2 transition hover:bg-stone-50"
                    type="button"
                  >
                    <p className="truncate text-sm font-semibold text-blue-600">{task.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                      <span className={`rounded px-2 py-0.5 ${getTaskStatusClass(status)}`}>
                        {status}
                      </span>
                      {priorityBadge && (
                        <span className={`rounded px-2 py-0.5 ${priorityBadge.className}`}>
                          {priorityBadge.label}
                        </span>
                      )}
                      <span>{formatTaskDate(task.dueAt)}</span>
                      {(task.dealTitle || task.contactName) && (
                        <span className="text-stone-700">
                          {task.dealTitle || task.contactName}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <button
            onClick={() => openPage('Reminders')}
            className="border-t border-stone-100 px-3 py-2 text-left text-xs font-semibold text-blue-600 hover:bg-stone-50"
            type="button"
          >
            Show more
          </button>
        </section>
      </div>

      {boardError && <p className="mt-4 text-sm text-red-600">{boardError}</p>}

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-stone-200 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Task Details
                </p>
                <h3 className="text-lg font-semibold text-stone-900">{selectedTask.title}</h3>
              </div>
              <button
                onClick={closeTaskDetail}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                type="button"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 px-4 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                <span className={`rounded px-2 py-0.5 ${getTaskStatusClass(getTaskStatusLabel(selectedTask))}`}>
                  {getTaskStatusLabel(selectedTask)}
                </span>
                {getPriorityBadge(selectedTask.priority) && (
                  <span
                    className={`rounded px-2 py-0.5 ${
                      getPriorityBadge(selectedTask.priority)?.className || ''
                    }`}
                  >
                    {getPriorityBadge(selectedTask.priority)?.label}
                  </span>
                )}
                <span>Due {formatTaskDate(selectedTask.dueAt)}</span>
              </div>

              {selectedTask.description && (
                <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
                  <p className="text-xs font-semibold uppercase text-stone-500">Comment</p>
                  <p className="mt-1 whitespace-pre-wrap">{selectedTask.description}</p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 text-xs text-stone-600">
                <div className="rounded-lg border border-stone-100 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase text-stone-400">Type</p>
                  <p className="mt-1 text-sm text-stone-800">{selectedTask.reminderType}</p>
                </div>
                <div className="rounded-lg border border-stone-100 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase text-stone-400">Status</p>
                  <p className="mt-1 text-sm text-stone-800">{selectedTask.status}</p>
                </div>
                <div className="rounded-lg border border-stone-100 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase text-stone-400">Deal</p>
                  <p className="mt-1 text-sm text-stone-800">{selectedTask.dealTitle || '—'}</p>
                </div>
                <div className="rounded-lg border border-stone-100 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase text-stone-400">Broker</p>
                  <p className="mt-1 text-sm text-stone-800">{selectedTask.brokerName || '—'}</p>
                </div>
                <div className="rounded-lg border border-stone-100 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase text-stone-400">Contact</p>
                  <p className="mt-1 text-sm text-stone-800">{selectedTask.contactName || '—'}</p>
                  {selectedTask.contactEmail && (
                    <p className="text-[11px] text-stone-500">{selectedTask.contactEmail}</p>
                  )}
                  {selectedTask.contactPhone && (
                    <p className="text-[11px] text-stone-500">{selectedTask.contactPhone}</p>
                  )}
                </div>
                <div className="rounded-lg border border-stone-100 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase text-stone-400">Created By</p>
                  <p className="mt-1 text-sm text-stone-800">{selectedTask.createdByName || '—'}</p>
                  {selectedTask.createdByEmail && (
                    <p className="text-[11px] text-stone-500">{selectedTask.createdByEmail}</p>
                  )}
                </div>
                <div className="rounded-lg border border-stone-100 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase text-stone-400">Created</p>
                  <p className="mt-1 text-sm text-stone-800">
                    {formatDetailDate(selectedTask.createdAt)}
                  </p>
                </div>
                <div className="rounded-lg border border-stone-100 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase text-stone-400">Updated</p>
                  <p className="mt-1 text-sm text-stone-800">
                    {formatDetailDate(selectedTask.updatedAt)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-stone-200 px-4 py-3">
              <button
                onClick={() => openPage('Reminders')}
                className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                type="button"
              >
                Open in Calendar
              </button>
              <button
                onClick={closeTaskDetail}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                type="button"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {isExpandedChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex h-[85vh] w-full max-w-4xl flex-col rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">Mr Leo Chat</h2>
                <p className="text-xs text-stone-500">
                  Ask anything about your CRM system.
                </p>
              </div>
              <button
                onClick={() => setIsExpandedChat(false)}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                type="button"
              >
                Close
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-hidden px-6 py-5">
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {chatMessages.map((message, index) => (
                  <div
                    key={`${message.sender}-expanded-${index}`}
                    className={`w-full max-w-[540px] text-sm ${
                      message.sender === 'assistant'
                        ? 'mr-auto rounded-2xl border border-stone-200 bg-white p-4 text-stone-700 shadow-md'
                        : 'ml-auto rounded-2xl bg-blue-600 px-4 py-3 text-white shadow-md'
                    }`}
                  >
                    <p className="leading-relaxed">{message.text}</p>
                    {message.time && (
                      <p
                        className={`mt-2 text-[11px] ${
                          message.sender === 'assistant' ? 'text-stone-400' : 'text-blue-100'
                        }`}
                      >
                        {message.time}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <input
                  value={chatInput}
                  onChange={event => setChatInput(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && handleSendChat()}
                  placeholder="Ask anything about your CRM system..."
                  className="w-full max-w-[540px] rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 shadow-md outline-none focus:border-blue-300"
                />
                <button
                  onClick={() => (isVoiceListening ? stopVoice() : startVoice())}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 text-stone-500 shadow-md transition hover:bg-stone-50 ${
                    !isVoiceSupported ? 'cursor-not-allowed opacity-50' : ''
                  }`}
                  title={isVoiceSupported ? 'Voice input' : 'Voice input not supported'}
                  type="button"
                  disabled={!isVoiceSupported}
                >
                  {isVoiceListening ? <FiMicOff /> : <FiMic />}
                </button>
                <button
                  onClick={handleSendChat}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md transition hover:bg-blue-700"
                  title="Send"
                  type="button"
                >
                  <FiArrowUpRight />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
