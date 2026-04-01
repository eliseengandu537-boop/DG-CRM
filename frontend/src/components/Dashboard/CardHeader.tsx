'use client';

import React from 'react';
import { FiMoreVertical } from 'react-icons/fi';

/**
 * CardHeader Component
 * Reusable header for all dashboard cards
 */

interface CardHeaderProps {
  title: string;
  subtitle: string;
  onMenuClick?: () => void;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  onMenuClick,
}) => (
  <div className="flex items-start justify-between mb-4">
    <div>
      <h3 className="text-lg font-bold text-stone-950">{title}</h3>
      <p className="text-xs text-stone-500 mt-1">{subtitle}</p>
    </div>
    {onMenuClick && (
      <button
        onClick={onMenuClick}
        className="p-1 hover:bg-stone-100 rounded-lg transition-colors"
      >
        <FiMoreVertical size={18} className="text-stone-400" />
      </button>
    )}
  </div>
);
