'use client';

import React from 'react';
import { formatRelativeTime } from '@/lib/dashboardService';

/**
 * GridHeader Component
 * Page header with title and last updated info
 */

interface GridHeaderProps {
  title: string;
  lastUpdated?: Date;
}

export const GridHeader: React.FC<GridHeaderProps> = ({
  title,
  lastUpdated,
}) => {
  return (
    <div>
      <h1 className="text-3xl font-bold text-stone-950">{title}</h1>
      {lastUpdated && (
        <p className="text-xs text-stone-500 mt-2">
          Last updated: {formatRelativeTime(lastUpdated)}
        </p>
      )}
    </div>
  );
};
