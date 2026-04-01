'use client';

import React from 'react';
import { FiX, FiClock, FiUser, FiTag, FiInfo } from 'react-icons/fi';

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

const getActivityIcon = (description: string) => {
  const desc = description.toLowerCase();
  if (desc.includes('deal')) return '📊';
  if (desc.includes('lead')) return '👤';
  if (desc.includes('contact')) return '📞';
  if (desc.includes('property')) return '🏠';
  if (desc.includes('created')) return '✨';
  if (desc.includes('updated')) return '📝';
  if (desc.includes('deleted')) return '🗑️';
  if (desc.includes('status')) return '⚡';
  if (desc.includes('synced')) return '🔄';
  return '📌';
};

const getActivityTypeColor = (description: string) => {
  const desc = description.toLowerCase();
  if (desc.includes('created')) return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100' };
  if (desc.includes('updated') || desc.includes('status changed')) return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100' };
  if (desc.includes('deleted')) return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100' };
  if (desc.includes('synced')) return { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100' };
  return { bg: 'bg-stone-50', border: 'border-stone-200', text: 'text-stone-700', badge: 'bg-stone-100' };
};

const extractActivityType = (description: string) => {
  const desc = description.toLowerCase();
  if (desc.includes('created')) return 'Created';
  if (desc.includes('updated')) return 'Updated';
  if (desc.includes('status changed')) return 'Status Changed';
  if (desc.includes('deleted')) return 'Deleted';
  if (desc.includes('synced')) return 'Synced';
  return 'Modified';
};

const formatDetailedTime = (timestamp: string) => {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return timestamp;
  }
};

const formatFullDateTime = (timestamp: string) => {
  try {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      iso: date.toISOString(),
    };
  } catch {
    return { date: 'Unknown', time: 'Unknown', iso: timestamp };
  }
};

export const ActivityDetailsModal: React.FC<ActivityDetailsModalProps> = ({ activity, isOpen, onClose }) => {
  if (!isOpen || !activity) return null;

  const colors = getActivityTypeColor(activity.description);
  const activityType = extractActivityType(activity.description);
  const icon = getActivityIcon(activity.description);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-xl border ${colors.border}`}>
        {/* Header */}
        <div className={`${colors.bg} rounded-t-2xl p-6 flex items-start justify-between`}>
          <div className="flex items-start gap-4 flex-1">
            <div className="text-4xl">{icon}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${colors.badge} ${colors.text}`}>
                  {activityType}
                </span>
              </div>
              <h2 className={`text-xl font-bold ${colors.text}`}>{activity.description}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/30 rounded-lg transition-colors text-stone-600"
          >
            <FiX size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            {/* Actor */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-stone-100 rounded-lg text-stone-600">
                <FiUser size={18} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-stone-500 uppercase">Performed By</p>
                <p className="text-sm font-medium text-stone-900 mt-1">{activity.actor}</p>
              </div>
            </div>

            {/* Timestamp */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-stone-100 rounded-lg text-stone-600">
                <FiClock size={18} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-stone-500 uppercase">Time</p>
                <p className="text-sm font-medium text-stone-900 mt-1">{formatDetailedTime(activity.timestamp)}</p>
              </div>
            </div>
          </div>

          {/* Related Entity */}
          {activity.relatedEntity && (
            <div className="flex items-start gap-3 p-4 bg-stone-50 rounded-xl border border-stone-200">
              <div className="p-2 bg-stone-200 rounded-lg text-stone-700">
                <FiTag size={18} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-stone-500 uppercase">Related To</p>
                <p className="text-sm font-medium text-stone-900 mt-1">{activity.relatedEntity}</p>
                {activity.relatedEntityType && (
                  <p className="text-xs text-stone-500 mt-1">{activity.relatedEntityType}</p>
                )}
              </div>
            </div>
          )}

          {/* Additional Details */}
          {activity.details && (
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="p-2 bg-blue-200 rounded-lg text-blue-700">
                <FiInfo size={18} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-blue-600 uppercase">Additional Details</p>
                <p className="text-sm text-stone-900 mt-2">{activity.details}</p>
              </div>
            </div>
          )}

          {/* Activity ID and Timestamp */}
          <div className="space-y-3 border-t border-stone-200 pt-4">
            <div className="bg-stone-50 p-4 rounded-lg border border-stone-200">
              <p className="text-xs font-semibold text-stone-500 uppercase mb-2">Activity Timestamp</p>
              {(() => {
                const { date, time, iso } = formatFullDateTime(activity.timestamp);
                return (
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-stone-900">{date}</span>
                      <span className="text-sm font-semibold text-blue-600">{time}</span>
                    </div>
                    <p className="text-xs text-stone-400 font-mono">{iso}</p>
                  </div>
                );
              })()}
            </div>
            <div className="bg-stone-50 p-4 rounded-lg border border-stone-200">
              <p className="text-xs font-semibold text-stone-500 uppercase mb-2">Activity ID</p>
              <code className="text-sm text-stone-600 font-mono break-all">{activity.id}</code>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 rounded-b-2xl flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-stone-300 rounded-lg text-stone-700 font-medium hover:bg-stone-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
