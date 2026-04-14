'use client';

import React from 'react';
import { FiX, FiClock, FiUser, FiHash, FiCalendar, FiTag, FiAlertCircle, FiCheckCircle, FiEdit2, FiTrash2, FiRefreshCw, FiZap } from 'react-icons/fi';

interface ActivityDetailsModalProps {
  activity: {
    id: string;
    description: string;
    timestamp: string;
    actor: string;
    type?: string;
    details?: string;
    relatedEntity?: string;
    relatedEntityType?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
}

const resolveVariant = (description: string): {
  accent: string;
  headerBg: string;
  badgeBg: string;
  badgeText: string;
  iconBg: string;
  icon: React.ReactNode;
  label: string;
} => {
  const d = description.toLowerCase();
  if (d.includes('deleted'))
    return {
      accent: 'border-t-red-500',
      headerBg: 'bg-gradient-to-br from-red-50 to-rose-50',
      badgeBg: 'bg-red-100',
      badgeText: 'text-red-700',
      iconBg: 'bg-red-500',
      icon: <FiTrash2 size={18} className="text-white" />,
      label: 'Deleted',
    };
  if (d.includes('created'))
    return {
      accent: 'border-t-emerald-500',
      headerBg: 'bg-gradient-to-br from-emerald-50 to-green-50',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-700',
      iconBg: 'bg-emerald-500',
      icon: <FiCheckCircle size={18} className="text-white" />,
      label: 'Created',
    };
  if (d.includes('updated') || d.includes('status changed'))
    return {
      accent: 'border-t-blue-500',
      headerBg: 'bg-gradient-to-br from-blue-50 to-sky-50',
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-700',
      iconBg: 'bg-blue-500',
      icon: <FiEdit2 size={18} className="text-white" />,
      label: 'Updated',
    };
  if (d.includes('synced'))
    return {
      accent: 'border-t-purple-500',
      headerBg: 'bg-gradient-to-br from-purple-50 to-violet-50',
      badgeBg: 'bg-purple-100',
      badgeText: 'text-purple-700',
      iconBg: 'bg-purple-500',
      icon: <FiRefreshCw size={18} className="text-white" />,
      label: 'Synced',
    };
  return {
    accent: 'border-t-stone-400',
    headerBg: 'bg-gradient-to-br from-stone-50 to-slate-50',
    badgeBg: 'bg-stone-100',
    badgeText: 'text-stone-600',
    iconBg: 'bg-stone-500',
    icon: <FiZap size={18} className="text-white" />,
    label: 'Activity',
  };
};

const formatRelativeTime = (timestamp: string): string => {
  try {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(diff / 86400000);
    return `${days}d ago`;
  } catch { return '—'; }
};

const formatDateTime = (timestamp: string) => {
  try {
    const d = new Date(timestamp);
    return {
      date: d.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      time: d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      iso: d.toISOString(),
    };
  } catch { return { date: '—', time: '—', iso: timestamp }; }
};

export const ActivityDetailsModal: React.FC<ActivityDetailsModalProps> = ({ activity, isOpen, onClose }) => {
  if (!isOpen || !activity) return null;

  const v = resolveVariant(activity.description);
  const { date, time, iso } = formatDateTime(activity.timestamp);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-stone-200 border-t-4 ${v.accent} overflow-hidden`}>

        {/* ── Header ── */}
        <div className={`${v.headerBg} px-6 pt-6 pb-5`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className={`${v.iconBg} rounded-xl p-3 shrink-0 shadow-sm`}>
                {v.icon}
              </div>
              <div className="min-w-0">
                <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${v.badgeBg} ${v.badgeText} mb-2`}>
                  {v.label}
                </span>
                <h2 className="text-base font-bold text-stone-900 leading-snug">{activity.description}</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 p-1.5 rounded-lg hover:bg-black/10 text-stone-500 transition-colors"
            >
              <FiX size={20} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-4">

          {/* Performed by + Relative time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 bg-stone-50 rounded-xl px-4 py-3 border border-stone-100">
              <div className="p-2 rounded-lg bg-white border border-stone-200 text-stone-500">
                <FiUser size={15} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Performed By</p>
                <p className="text-sm font-semibold text-stone-800 mt-0.5">{activity.actor}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-stone-50 rounded-xl px-4 py-3 border border-stone-100">
              <div className="p-2 rounded-lg bg-white border border-stone-200 text-stone-500">
                <FiClock size={15} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Time</p>
                <p className="text-sm font-semibold text-stone-800 mt-0.5">{formatRelativeTime(activity.timestamp)}</p>
              </div>
            </div>
          </div>

          {/* Related entity */}
          {activity.relatedEntity && (
            <div className="flex items-center gap-3 bg-stone-50 rounded-xl px-4 py-3 border border-stone-100">
              <div className="p-2 rounded-lg bg-white border border-stone-200 text-stone-500">
                <FiTag size={15} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Related To</p>
                <p className="text-sm font-semibold text-stone-800 mt-0.5">{activity.relatedEntity}</p>
                {activity.relatedEntityType && (
                  <p className="text-xs text-stone-400 mt-0.5">{activity.relatedEntityType}</p>
                )}
              </div>
            </div>
          )}

          {/* Additional details */}
          {activity.details && (
            <div className="flex items-start gap-3 bg-amber-50 rounded-xl px-4 py-3 border border-amber-100">
              <div className="p-2 rounded-lg bg-white border border-amber-200 text-amber-500 shrink-0">
                <FiAlertCircle size={15} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Details</p>
                <p className="text-sm text-stone-700 mt-0.5 leading-relaxed">{activity.details}</p>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-stone-100" />

          {/* Timestamp */}
          <div className="flex items-start gap-3 bg-stone-50 rounded-xl px-4 py-3 border border-stone-100">
            <div className="p-2 rounded-lg bg-white border border-stone-200 text-stone-500 shrink-0">
              <FiCalendar size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Timestamp</p>
              <p className="text-sm font-semibold text-stone-800">{date}</p>
              <p className="text-sm font-bold text-blue-600">{time}</p>
              <p className="text-[11px] text-stone-400 font-mono mt-1 break-all">{iso}</p>
            </div>
          </div>

          {/* Activity ID */}
          <div className="flex items-center gap-3 bg-stone-50 rounded-xl px-4 py-3 border border-stone-100">
            <div className="p-2 rounded-lg bg-white border border-stone-200 text-stone-500 shrink-0">
              <FiHash size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Activity ID</p>
              <p className="text-[12px] font-mono text-stone-500 break-all">{activity.id}</p>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 pb-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-stone-900 text-white text-sm font-semibold hover:bg-stone-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

