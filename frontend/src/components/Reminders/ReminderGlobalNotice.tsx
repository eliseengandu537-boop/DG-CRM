import React from 'react';
import { FiBell } from 'react-icons/fi';
import { useReminderNotifications } from '@/context/ReminderContext';

interface ReminderGlobalNoticeProps {
  onOpenReminders?: () => void;
}

export const ReminderGlobalNotice: React.FC<ReminderGlobalNoticeProps> = ({ onOpenReminders }) => {
  const { pendingCount, overdueCount, dueTodayCount, nextDueAt } = useReminderNotifications();

  if (pendingCount <= 0) return null;

  return (
    <button
      onClick={onOpenReminders}
      className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800 hover:bg-violet-100 transition-colors shadow-sm"
    >
      <FiBell className="text-violet-700" />
      <span className="font-semibold">{pendingCount} reminder{pendingCount === 1 ? '' : 's'}</span>
      {overdueCount > 0 && (
        <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 font-medium">
          {overdueCount} overdue
        </span>
      )}
      {dueTodayCount > 0 && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 font-medium">
          {dueTodayCount} today
        </span>
      )}
      {nextDueAt && (
        <span className="text-stone-600 hidden md:inline">
          Next: {new Date(nextDueAt).toLocaleString()}
        </span>
      )}
    </button>
  );
};
