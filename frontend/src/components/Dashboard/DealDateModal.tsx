'use client';

import React from 'react';
import { FiX, FiCalendar, FiClock } from 'react-icons/fi';

interface DealDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealName: string;
  createdAt: string;
  updatedAt: string;
  status: string;
}

const formatDateTime = (dateString: string) => {
  try {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      fullDateTime: date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  } catch {
    return { date: 'Unknown', time: 'Unknown', fullDateTime: dateString };
  }
};

export const DealDateModal: React.FC<DealDateModalProps> = ({
  isOpen,
  onClose,
  dealName,
  createdAt,
  updatedAt,
  status,
}) => {
  if (!isOpen) return null;

  const createdDateTime = formatDateTime(createdAt);
  const updatedDateTime = formatDateTime(updatedAt);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-stone-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-stone-100 to-stone-50 rounded-t-2xl p-6 flex items-start justify-between border-b border-stone-200">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-stone-950">{dealName}</h2>
            <p className="text-sm text-stone-600 mt-1">Deal Timeline</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors text-stone-600"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Deal Created */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-green-100">
                <FiCalendar className="text-green-600" size={20} />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-stone-900">Deal Created</h3>
              <p className="text-sm text-stone-600 mt-1">{createdDateTime.date}</p>
              <div className="flex items-center gap-2 mt-2">
                <FiClock size={16} className="text-stone-400" />
                <span className="text-sm font-medium text-stone-700">{createdDateTime.time}</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-stone-200 pt-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-100">
                  <svg
                    className="text-blue-600 w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-stone-900">Status Changed</h3>
                <p className="text-sm text-stone-600 mt-1">{updatedDateTime.date}</p>
                <div className="flex items-center gap-2 mt-2">
                  <FiClock size={16} className="text-stone-400" />
                  <span className="text-sm font-medium text-stone-700">{updatedDateTime.time}</span>
                </div>
                <div className="mt-3">
                  <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                    Current Status: {status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline Duration */}
          <div className="pt-4 border-t border-stone-200">
            {(() => {
              const created = new Date(createdAt);
              const updated = new Date(updatedAt);
              const diffMs = updated.getTime() - created.getTime();
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
              const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

              let duration = '';
              if (diffDays > 0) duration += `${diffDays}d `;
              if (diffHours > 0) duration += `${diffHours}h `;
              if (diffMins > 0) duration += `${diffMins}m`;
              duration = duration.trim() || 'Less than 1 minute';

              return (
                <p className="text-xs text-stone-600">
                  <span className="font-semibold text-stone-700">{duration}</span> since deal creation
                </p>
              );
            })()}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 rounded-b-2xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-950 text-white rounded-lg font-medium hover:bg-stone-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
