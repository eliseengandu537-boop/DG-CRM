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
  columnsClassName = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2',
}) => {
  if (isLoading) {
    return (
      <div className={columnsClassName}>
        {Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
          <div
            key={`stat-card-skeleton-${index}`}
            className="rounded border border-stone-200 bg-white p-2 shadow-sm"
          >
            <div className="mb-3 h-3 animate-pulse rounded bg-stone-200" />
            <div className="h-6 animate-pulse rounded bg-stone-200" />
          </div>
        ))}
      </div>
    );
  }

  // Reorder items: Open, Closed, Lost, Conv%
  const order = ['Open', 'Closed', 'Lost', 'Conv%'];
  const orderedItems = [...items].sort((a, b) => {
    const aIdx = order.indexOf(a.label);
    const bIdx = order.indexOf(b.label);
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });

  return (
    <div className={columnsClassName}>
      {orderedItems.map(item => {
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
            className={`rounded-lg border border-stone-200 bg-white p-2 text-left shadow-sm transition-shadow ${
              interactive ? 'hover:shadow-md' : 'cursor-default'
            } ${item.disabled ? 'opacity-70' : ''}`}
          >
            <div className="mb-0.5 flex items-start justify-between">
              <div>
                <p className="mb-0.5 text-[10px] font-medium text-stone-600">{item.label}</p>
                <p className="text-sm font-bold text-stone-950">{item.value}</p>
              </div>
              <div className="flex h-5 w-5 items-center justify-center rounded bg-stone-100 text-stone-400">
                <Icon size={11} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-semibold ${toneClass}`}>{item.change || 'Live'}</span>
              <span className="text-[10px] text-stone-500">{item.subtext || 'Current snapshot'}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default UnifiedStatsCards;
