'use client';

import React from 'react';

export interface UnifiedStatCardItem {
  id: string;
  label: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  change?: string;
  subtext?: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface UnifiedStatsCardsProps {
  items: UnifiedStatCardItem[];
  isLoading?: boolean;
  columnsClassName?: string;
}

const SKELETON_CARD_COUNT = 4;

function resolveChangeTone(change?: string): 'positive' | 'negative' | 'neutral' {
  if (!change) return 'neutral';
  if (change.trim().startsWith('+')) return 'positive';
  if (change.trim().startsWith('-')) return 'negative';
  return 'neutral';
}

export const UnifiedStatsCards: React.FC<UnifiedStatsCardsProps> = ({
  items,
  isLoading = false,
  columnsClassName = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5',
}) => {
  if (isLoading) {
    return (
      <div className={columnsClassName}>
        {Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
          <div
            key={`stat-card-skeleton-${index}`}
            className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-4 h-4 animate-pulse rounded bg-stone-200" />
            <div className="h-8 animate-pulse rounded bg-stone-200" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={columnsClassName}>
      {items.map(item => {
        const Icon = item.icon;
        const tone = resolveChangeTone(item.change);
        const toneClass =
          tone === 'positive'
            ? 'text-emerald-600'
            : tone === 'negative'
            ? 'text-red-600'
            : 'text-stone-500';
        const disabled = Boolean(item.disabled);
        const interactive = Boolean(item.onClick) && !disabled;

        return (
          <button
            key={item.id}
            type="button"
            onClick={interactive ? item.onClick : undefined}
            disabled={disabled}
            className={`rounded-xl border border-stone-200 bg-white p-6 text-left shadow-sm transition-shadow ${
              interactive ? 'hover:shadow-md' : 'cursor-default'
            } ${item.disabled ? 'opacity-70' : ''}`}
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="mb-2 text-sm font-medium text-stone-600">{item.label}</p>
                <p className="text-2xl font-bold text-stone-950">{item.value}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-stone-100 text-stone-400">
                <Icon size={22} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${toneClass}`}>{item.change || 'Live'}</span>
              <span className="text-xs text-stone-500">{item.subtext || 'Current snapshot'}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default UnifiedStatsCards;
