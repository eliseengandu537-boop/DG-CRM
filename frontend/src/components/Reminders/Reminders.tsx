'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiCalendar,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiPlus,
  FiTrash2,
} from 'react-icons/fi';
import { dealService, Deal } from '@/services/dealService';
import {
  reminderService,
  ReminderPriority,
  ReminderRecord,
  ReminderStatus,
  ReminderType,
} from '@/services/reminderService';
import { useReminderNotifications } from '@/context/ReminderContext';

type CalendarView = 'month' | 'week' | 'day';

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CALENDAR_VIEWS: Array<{ value: CalendarView; label: string }> = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
];
const DAY_HOURS = Array.from({ length: 24 }, (_, index) => index);

const REMINDER_TYPE_OPTIONS: Array<{ value: ReminderType; label: string }> = [
  { value: 'deal_follow_up', label: 'Deal Follow-up' },
  { value: 'call', label: 'Call' },
  { value: 'task', label: 'Task' },
  { value: 'email', label: 'Email' },
];

const PRIORITY_OPTIONS: ReminderPriority[] = ['low', 'medium', 'high'];

const STATUS_FILTERS: Array<{ value: 'all' | ReminderStatus; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TYPE_FILTERS: Array<{ value: 'all' | ReminderType; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'deal_follow_up', label: 'Deal Follow-up' },
  { value: 'call', label: 'Call' },
  { value: 'task', label: 'Task' },
  { value: 'email', label: 'Email' },
];

const toDateKey = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const fromDateKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return startOfDay(new Date());
  return new Date(year, month - 1, day);
};

const startOfWeek = (date: Date) => {
  const start = startOfDay(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const toDateInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseLocalDateTimeToIso = (dateValue: string, timeValue: string) => {
  const parsed = new Date(`${dateValue}T${timeValue}:00`);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('Invalid reminder date/time');
  }
  return parsed.toISOString();
};

const formatReminderTime = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

const formatHourLabel = (hour: number) =>
  new Date(2000, 0, 1, hour).toLocaleTimeString([], {
    hour: 'numeric',
  });

const getPriorityBadgeClass = (priority: ReminderPriority) => {
  if (priority === 'high') return 'bg-red-100 text-red-700';
  if (priority === 'low') return 'bg-emerald-100 text-emerald-700';
  return 'bg-amber-100 text-amber-700';
};

const getStatusBadgeClass = (status: ReminderStatus) => {
  if (status === 'completed') return 'bg-green-100 text-green-700';
  if (status === 'cancelled') return 'bg-stone-200 text-stone-700';
  return 'bg-blue-100 text-blue-700';
};

const getCalendarReminderClass = (reminder: ReminderRecord) => {
  if (reminder.status === 'completed') return 'bg-emerald-100 text-emerald-700';
  if (reminder.status === 'cancelled') return 'bg-stone-200 text-stone-700';
  if (reminder.priority === 'high') return 'bg-rose-100 text-rose-700';
  if (reminder.priority === 'low') return 'bg-sky-100 text-sky-700';
  return 'bg-violet-100 text-violet-700';
};

const typeToLabel = (type: ReminderType) =>
  REMINDER_TYPE_OPTIONS.find(item => item.value === type)?.label || type;

const buildDefaultFormData = (baseDate: Date) => ({
  title: '',
  reminderType: 'deal_follow_up' as ReminderType,
  dueDate: toDateInput(baseDate),
  dueTime: '09:00',
  priority: 'medium' as ReminderPriority,
  dealId: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  description: '',
});

export default function Reminders() {
  const { refresh: refreshReminderNotifications } = useReminderNotifications();
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(() => startOfDay(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()));
  const [statusFilter, setStatusFilter] = useState<'all' | ReminderStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ReminderType>('all');
  const [dealSearch, setDealSearch] = useState('');
  const [formData, setFormData] = useState(() => buildDefaultFormData(startOfDay(new Date())));

  const selectedDate = useMemo(() => fromDateKey(selectedDateKey), [selectedDateKey]);
  const todayKey = toDateKey(new Date());

  const resetForm = useCallback((baseDate: Date) => {
    setFormData(buildDefaultFormData(startOfDay(baseDate)));
    setDealSearch('');
  }, []);

  const handleSelectDate = useCallback((date: Date, syncViewDate = true) => {
    const normalized = startOfDay(date);
    setSelectedDateKey(toDateKey(normalized));
    if (syncViewDate) {
      setCurrentDate(normalized);
    }
  }, []);

  const openAddModal = useCallback(
    (baseDate?: Date) => {
      resetForm(baseDate || selectedDate);
      setShowAddModal(true);
    },
    [resetForm, selectedDate]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [reminderResult, dealsResult] = await Promise.all([
        reminderService.getAllReminders({ limit: 500 }),
        dealService.getAllDeals({ limit: 500 }),
      ]);
      setReminders(reminderResult.data || []);
      setDeals(dealsResult.data || []);
      void refreshReminderNotifications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reminders');
    } finally {
      setIsLoading(false);
    }
  }, [refreshReminderNotifications]);

  useEffect(() => {
    void loadData();
  }, [loadData]);
  const filteredReminders = useMemo(() => {
    return reminders.filter(reminder => {
      if (statusFilter !== 'all' && reminder.status !== statusFilter) return false;
      if (typeFilter !== 'all' && reminder.reminderType !== typeFilter) return false;
      return true;
    });
  }, [reminders, statusFilter, typeFilter]);

  const remindersByDate = useMemo(() => {
    const map = new Map<string, ReminderRecord[]>();
    filteredReminders.forEach(reminder => {
      const key = toDateKey(reminder.dueAt);
      const current = map.get(key) || [];
      current.push(reminder);
      map.set(key, current);
    });

    for (const list of Array.from(map.values())) {
      list.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    }
    return map;
  }, [filteredReminders]);

  const selectedDateReminders = useMemo(() => {
    const list = remindersByDate.get(selectedDateKey) || [];
    return [...list];
  }, [remindersByDate, selectedDateKey]);

  const upcomingReminders = useMemo(() => {
    const now = new Date();
    return [...filteredReminders]
      .filter(item => item.status === 'pending' && new Date(item.dueAt).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .slice(0, 6);
  }, [filteredReminders]);

  const monthGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstWeekDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const previousMonthDays = new Date(year, month, 0).getDate();

    const cells: Array<{ date: Date; isCurrentMonth: boolean; key: string }> = [];

    for (let i = firstWeekDay - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, previousMonthDays - i);
      cells.push({ date, isCurrentMonth: false, key: toDateKey(date) });
    }

    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day);
      cells.push({ date, isCurrentMonth: true, key: toDateKey(date) });
    }

    while (cells.length < 42) {
      const nextDay = cells.length - (firstWeekDay + totalDays) + 1;
      const date = new Date(year, month + 1, nextDay);
      cells.push({ date, isCurrentMonth: false, key: toDateKey(date) });
    }

    return cells;
  }, [currentDate]);

  const weekStartDate = useMemo(() => startOfWeek(currentDate), [currentDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)),
    [weekStartDate]
  );

  const dayRemindersByHour = useMemo(() => {
    const map = new Map<number, ReminderRecord[]>();
    const dayItems = remindersByDate.get(toDateKey(currentDate)) || [];
    dayItems.forEach(item => {
      const hour = new Date(item.dueAt).getHours();
      const current = map.get(hour) || [];
      current.push(item);
      map.set(hour, current);
    });
    return map;
  }, [remindersByDate, currentDate]);

  const calendarTitle = useMemo(() => {
    if (calendarView === 'month') {
      return currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }

    if (calendarView === 'week') {
      const weekEndDate = addDays(weekStartDate, 6);
      if (
        weekStartDate.getMonth() === weekEndDate.getMonth() &&
        weekStartDate.getFullYear() === weekEndDate.getFullYear()
      ) {
        return `${weekStartDate.toLocaleString('en-US', { month: 'long' })} ${weekStartDate.getDate()} - ${weekEndDate.getDate()}, ${weekEndDate.getFullYear()}`;
      }
      return `${weekStartDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })} - ${weekEndDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
    }

    return currentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }, [calendarView, currentDate, weekStartDate]);

  const filteredDeals = useMemo(() => {
    const query = dealSearch.trim().toLowerCase();
    if (!query) return deals.slice(0, 20);
    return deals.filter(deal => deal.title.toLowerCase().includes(query)).slice(0, 20);
  }, [deals, dealSearch]);

  const handleNavigate = (direction: -1 | 1) => {
    setCurrentDate(prev => {
      if (calendarView === 'month') {
        return new Date(prev.getFullYear(), prev.getMonth() + direction, 1);
      }
      if (calendarView === 'week') {
        return addDays(prev, direction * 7);
      }
      return addDays(prev, direction);
    });
  };

  const handleGoToToday = () => {
    const today = startOfDay(new Date());
    setCurrentDate(today);
    setSelectedDateKey(toDateKey(today));
  };

  const handleCreateReminder = async () => {
    if (!formData.title.trim()) {
      alert('Please enter reminder title');
      return;
    }

    setIsSaving(true);
    try {
      const dueAt = parseLocalDateTimeToIso(formData.dueDate, formData.dueTime);
      const created = await reminderService.createReminder({
        title: formData.title.trim(),
        reminderType: formData.reminderType,
        dueAt,
        priority: formData.priority,
        dealId: formData.dealId || undefined,
        contactName: formData.contactName.trim() || undefined,
        contactEmail: formData.contactEmail.trim() || undefined,
        contactPhone: formData.contactPhone.trim() || undefined,
        description: formData.description.trim() || undefined,
      });

      const reminderDate = new Date(created.dueAt);
      setReminders(prev => [created, ...prev]);
      handleSelectDate(reminderDate);
      setShowAddModal(false);
      resetForm(reminderDate);
      void refreshReminderNotifications();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create reminder');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteReminder = async (reminderId: string) => {
    try {
      const updated = await reminderService.completeReminder(reminderId);
      setReminders(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      void refreshReminderNotifications();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to complete reminder');
    }
  };

  const handleDeleteReminder = async (reminderId: string) => {
    if (!confirm('Delete this reminder?')) return;
    try {
      await reminderService.deleteReminder(reminderId);
      setReminders(prev => prev.filter(item => item.id !== reminderId));
      void refreshReminderNotifications();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete reminder');
    }
  };

  return (
    <div className="bg-white rounded-lg pb-4 shadow">
      <div className="border-b border-stone-200 p-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Reminder Calendar</h2>
          <p className="text-sm text-stone-600 mt-1">
            CRM-style Month, Week, and Day calendar views for deal follow-up work.
          </p>
        </div>
        <button
          onClick={() => openAddModal(selectedDate)}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FiPlus size={16} />
          Add Reminder
        </button>
      </div>

      <div className="p-4 grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-4">
        <div className="border border-stone-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-stone-200 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleNavigate(-1)}
                className="p-1.5 rounded border border-stone-200 hover:bg-stone-100"
                aria-label="Previous period"
              >
                <FiChevronLeft size={16} />
              </button>
              <button
                onClick={() => handleNavigate(1)}
                className="p-1.5 rounded border border-stone-200 hover:bg-stone-100"
                aria-label="Next period"
              >
                <FiChevronRight size={16} />
              </button>
              <button
                onClick={handleGoToToday}
                className="px-2.5 py-1.5 text-xs rounded border border-stone-200 hover:bg-stone-100"
              >
                Today
              </button>
            </div>

            <div className="font-semibold text-stone-900 min-w-[220px]">{calendarTitle}</div>

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <div className="inline-flex rounded border border-stone-200 p-0.5 bg-stone-50">
                {CALENDAR_VIEWS.map(view => (
                  <button
                    key={view.value}
                    onClick={() => {
                      setCalendarView(view.value);
                      setCurrentDate(
                        view.value === 'month'
                          ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
                          : startOfDay(selectedDate)
                      );
                    }}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      calendarView === view.value
                        ? 'bg-white text-violet-700 shadow-sm'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              <select
                value={statusFilter}
                onChange={event => setStatusFilter(event.target.value as 'all' | ReminderStatus)}
                className="text-xs border border-stone-200 rounded px-2 py-1.5"
              >
                {STATUS_FILTERS.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={event => setTypeFilter(event.target.value as 'all' | ReminderType)}
                className="text-xs border border-stone-200 rounded px-2 py-1.5"
              >
                {TYPE_FILTERS.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {calendarView === 'month' && (
            <div className="p-3">
              <div className="grid grid-cols-7 gap-1 text-xs text-stone-500 mb-2">
                {WEEK_DAYS.map(day => (
                  <div key={day} className="text-center py-2 font-semibold uppercase">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {monthGrid.map(cell => {
                  const dayReminders = remindersByDate.get(cell.key) || [];
                  const isSelected = cell.key === selectedDateKey;
                  const isToday = cell.key === todayKey;
                  const hiddenCount = Math.max(dayReminders.length - 2, 0);

                  return (
                    <button
                      key={cell.key}
                      onClick={() => handleSelectDate(cell.date)}
                      onDoubleClick={event => {
                        event.preventDefault();
                        openAddModal(cell.date);
                      }}
                      className={`h-28 rounded border p-2 text-left transition-colors overflow-hidden ${
                        isSelected
                          ? 'border-violet-400 bg-violet-50'
                          : 'border-stone-200 hover:bg-stone-50'
                      } ${cell.isCurrentMonth ? 'text-stone-900' : 'text-stone-400'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium ${isToday ? 'text-violet-700' : ''}`}>
                          {cell.date.getDate()}
                        </span>
                        {dayReminders.length > 0 && (
                          <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">
                            {dayReminders.length}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 space-y-1">
                        {dayReminders.slice(0, 2).map(reminder => (
                          <div
                            key={reminder.id}
                            className={`text-[10px] px-1.5 py-0.5 rounded truncate ${getCalendarReminderClass(reminder)}`}
                            title={`${formatReminderTime(reminder.dueAt)} - ${reminder.title}`}
                          >
                            {formatReminderTime(reminder.dueAt)} {reminder.title}
                          </div>
                        ))}
                        {hiddenCount > 0 && (
                          <div className="text-[10px] text-stone-500 px-1">+{hiddenCount} more</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {calendarView === 'week' && (
            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                <div className="grid grid-cols-7 border-b border-stone-200">
                  {weekDays.map(day => {
                    const dayKey = toDateKey(day);
                    const isSelected = dayKey === selectedDateKey;
                    const isToday = dayKey === todayKey;
                    return (
                      <button
                        key={dayKey}
                        onClick={() => handleSelectDate(day)}
                        className={`p-2 text-left border-r border-stone-200 last:border-r-0 transition-colors ${
                          isSelected ? 'bg-violet-50' : 'hover:bg-stone-50'
                        }`}
                      >
                        <p
                          className={`text-xs uppercase tracking-wide ${
                            isToday ? 'text-violet-700' : 'text-stone-500'
                          }`}
                        >
                          {day.toLocaleDateString('en-US', { weekday: 'short' })}
                        </p>
                        <p className={`font-semibold text-sm ${isToday ? 'text-violet-700' : 'text-stone-900'}`}>
                          {day.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-7 border-t-0">
                  {weekDays.map(day => {
                    const dayKey = toDateKey(day);
                    const dayReminders = remindersByDate.get(dayKey) || [];
                    const isSelected = dayKey === selectedDateKey;
                    return (
                      <div
                        key={dayKey}
                        className={`min-h-[420px] p-2 border-r border-stone-200 last:border-r-0 ${
                          isSelected ? 'bg-violet-50/50' : 'bg-white'
                        }`}
                      >
                        <div className="space-y-1">
                          {dayReminders.length === 0 ? (
                            <button
                              onClick={() => {
                                handleSelectDate(day);
                                openAddModal(day);
                              }}
                              className="w-full text-left text-[11px] text-stone-400 border border-dashed border-stone-200 rounded px-2 py-1.5 hover:bg-stone-50"
                            >
                              + Add reminder
                            </button>
                          ) : (
                            dayReminders.map(reminder => (
                              <button
                                key={reminder.id}
                                onClick={() => handleSelectDate(day)}
                                className={`w-full text-left text-[11px] px-2 py-1.5 rounded truncate ${getCalendarReminderClass(
                                  reminder
                                )}`}
                                title={`${formatReminderTime(reminder.dueAt)} - ${reminder.title}`}
                              >
                                {formatReminderTime(reminder.dueAt)} {reminder.title}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {calendarView === 'day' && (
            <div className="max-h-[560px] overflow-y-auto">
              {DAY_HOURS.map(hour => {
                const hourReminders = dayRemindersByHour.get(hour) || [];
                return (
                  <div key={hour} className="grid grid-cols-[70px_1fr] border-b border-stone-200">
                    <div className="px-2 py-3 text-[11px] text-stone-500 bg-stone-50 border-r border-stone-200">
                      {formatHourLabel(hour)}
                    </div>
                    <div className="px-2 py-2 min-h-[56px]">
                      {hourReminders.length === 0 ? (
                        <button
                          onClick={() => openAddModal(currentDate)}
                          className="w-full h-8 border border-dashed border-stone-200 rounded text-[11px] text-stone-400 text-left px-2 hover:bg-stone-50"
                        >
                          Add reminder
                        </button>
                      ) : (
                        <div className="space-y-1">
                          {hourReminders.map(reminder => (
                            <div
                              key={reminder.id}
                              className={`text-[11px] px-2 py-1.5 rounded ${getCalendarReminderClass(reminder)}`}
                              title={reminder.title}
                            >
                              <span className="font-medium">{formatReminderTime(reminder.dueAt)}</span> {reminder.title}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="border border-stone-200 rounded-lg">
            <div className="p-3 border-b border-stone-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FiCalendar className="text-violet-600" />
                <h3 className="font-semibold text-stone-900">
                  {selectedDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </h3>
              </div>
              <button
                onClick={() => openAddModal(selectedDate)}
                className="text-xs rounded border border-stone-200 px-2 py-1 hover:bg-stone-50"
              >
                Add
              </button>
            </div>

            <div className="max-h-[360px] overflow-y-auto p-3 space-y-2">
              {selectedDateReminders.length === 0 ? (
                <p className="text-sm text-stone-500">No reminders for this day.</p>
              ) : (
                selectedDateReminders.map(reminder => (
                  <div key={reminder.id} className="border border-stone-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900 text-sm">{reminder.title}</p>
                        <p className="text-xs text-stone-500 flex items-center gap-1.5 mt-0.5">
                          <FiClock size={12} />
                          {formatReminderTime(reminder.dueAt)} - {typeToLabel(reminder.reminderType)}
                        </p>
                        {reminder.dealTitle && (
                          <p className="text-xs text-violet-700 mt-1">Deal: {reminder.dealTitle}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {reminder.status !== 'completed' && (
                          <button
                            onClick={() => handleCompleteReminder(reminder.id)}
                            className="p-1.5 rounded text-green-700 hover:bg-green-50"
                            title="Mark completed"
                          >
                            <FiCheckCircle size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteReminder(reminder.id)}
                          className="p-1.5 rounded text-red-700 hover:bg-red-50"
                          title="Delete"
                        >
                          <FiTrash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${getPriorityBadgeClass(
                          reminder.priority
                        )}`}
                      >
                        {reminder.priority}
                      </span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${getStatusBadgeClass(
                          reminder.status
                        )}`}
                      >
                        {reminder.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border border-stone-200 rounded-lg p-3">
            <h3 className="font-semibold text-stone-900 mb-2">Upcoming</h3>
            <div className="space-y-2">
              {upcomingReminders.length === 0 ? (
                <p className="text-sm text-stone-500">No upcoming pending reminders.</p>
              ) : (
                upcomingReminders.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectDate(new Date(item.dueAt))}
                    className="w-full text-left rounded border border-stone-200 p-2 hover:bg-stone-50"
                  >
                    <p className="text-sm font-medium text-stone-900">{item.title}</p>
                    <p className="text-xs text-stone-500">
                      {new Date(item.dueAt).toLocaleString()} - {typeToLabel(item.reminderType)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {isLoading && <p className="px-4 pb-4 text-sm text-stone-500">Loading reminders...</p>}
      {error && <p className="px-4 pb-4 text-sm text-red-600">{error}</p>}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-4">Add Reminder</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={event => setFormData(prev => ({ ...prev, title: event.target.value }))}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Example: Follow up call on deal terms"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Type</label>
                  <select
                    value={formData.reminderType}
                    onChange={event =>
                      setFormData(prev => ({ ...prev, reminderType: event.target.value as ReminderType }))
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    {REMINDER_TYPE_OPTIONS.map(item => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={event =>
                      setFormData(prev => ({ ...prev, priority: event.target.value as ReminderPriority }))
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    {PRIORITY_OPTIONS.map(priority => (
                      <option key={priority} value={priority}>
                        {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={event => setFormData(prev => ({ ...prev, dueDate: event.target.value }))}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Due Time</label>
                  <input
                    type="time"
                    value={formData.dueTime}
                    onChange={event => setFormData(prev => ({ ...prev, dueTime: event.target.value }))}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Link Deal (optional)
                  </label>
                  <input
                    type="text"
                    value={dealSearch}
                    onChange={event => setDealSearch(event.target.value)}
                    className="w-full mb-2 px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Search deal title..."
                  />
                  <select
                    value={formData.dealId}
                    onChange={event => setFormData(prev => ({ ...prev, dealId: event.target.value }))}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">No linked deal</option>
                    {filteredDeals.map(deal => (
                      <option key={deal.id} value={deal.id}>
                        {deal.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={formData.contactName}
                    onChange={event => setFormData(prev => ({ ...prev, contactName: event.target.value }))}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Client or owner name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={formData.contactEmail}
                    onChange={event => setFormData(prev => ({ ...prev, contactEmail: event.target.value }))}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="client@example.com"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    value={formData.contactPhone}
                    onChange={event => setFormData(prev => ({ ...prev, contactPhone: event.target.value }))}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="+27 71 234 5678"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">Notes</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={event => setFormData(prev => ({ ...prev, description: event.target.value }))}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="What should be followed up?"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm(selectedDate);
                  }}
                  className="px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateReminder}
                  disabled={isSaving}
                  className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Reminder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
