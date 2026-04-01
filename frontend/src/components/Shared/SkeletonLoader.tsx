'use client';

import React from 'react';

/**
 * SkeletonLoader Component
 * Displays animated placeholders while content is loading
 */

interface SkeletonLoaderProps {
  count?: number;
  height?: string;
  width?: string;
  variant?: 'card' | 'line' | 'table' | 'avatar' | 'text' | 'form';
  className?: string;
}

const baseClasses = 'bg-gradient-to-r from-stone-200 via-stone-100 to-stone-200 animate-pulse rounded';

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  count = 1,
  height = 'h-6',
  width = 'w-full',
  variant = 'line',
  className = '',
}) => {
  const variants = {
    card: (
      <div className="bg-white rounded-lg border border-stone-200 p-6 shadow-sm">
        <div className={`${baseClasses} h-8 w-3/4 mb-4`}></div>
        <div className={`${baseClasses} h-6 w-full mb-3`}></div>
        <div className={`${baseClasses} h-6 w-5/6 mb-3`}></div>
        <div className={`${baseClasses} h-12 w-full mt-6`}></div>
      </div>
    ),
    line: (
      <div className={`${baseClasses} ${height} ${width} ${className}`}></div>
    ),
    table: (
      <div className="space-y-2">
        {Array(5)
          .fill(0)
          .map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className={`${baseClasses} h-10 w-10 rounded-full`}></div>
              <div className={`${baseClasses} h-10 flex-1`}></div>
              <div className={`${baseClasses} h-10 w-24`}></div>
              <div className={`${baseClasses} h-10 w-20`}></div>
            </div>
          ))}
      </div>
    ),
    avatar: (
      <div className={`${baseClasses} h-12 w-12 rounded-full ${className}`}></div>
    ),
    text: (
      <div className="space-y-2">
        <div className={`${baseClasses} h-4 w-full`}></div>
        <div className={`${baseClasses} h-4 w-5/6`}></div>
        <div className={`${baseClasses} h-4 w-4/6`}></div>
      </div>
    ),
    form: (
      <div className="space-y-4">
        <div className={`${baseClasses} h-10 w-full`}></div>
        <div className={`${baseClasses} h-10 w-full`}></div>
        <div className={`${baseClasses} h-10 w-full`}></div>
        <div className={`${baseClasses} h-12 w-full`}></div>
      </div>
    ),
  };

  return (
    <div className="space-y-3">
      {Array(count)
        .fill(0)
        .map((_, i) => (
          <div key={i}>{variants[variant]}</div>
        ))}
    </div>
  );
};

// Specialized skeleton loaders

export const CardSkeletonLoader = () => (
  <div className="bg-white rounded-lg border border-stone-200 p-6 shadow-sm">
    <div className={`${baseClasses} h-8 w-3/4 mb-4`}></div>
    <div className={`${baseClasses} h-6 w-full mb-3`}></div>
    <div className={`${baseClasses} h-6 w-5/6`}></div>
  </div>
);

export const TableSkeletonLoader = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-2">
    {Array(rows)
      .fill(0)
      .map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          <div className={`${baseClasses} h-6 w-6 rounded`}></div>
          <div className={`${baseClasses} h-10 flex-1`}></div>
          <div className={`${baseClasses} h-10 w-24`}></div>
          <div className={`${baseClasses} h-10 w-20`}></div>
          <div className={`${baseClasses} h-10 w-16`}></div>
        </div>
      ))}
  </div>
);

export const FormSkeletonLoader = () => (
  <div className="space-y-4">
    <div>
      <div className={`${baseClasses} h-5 w-24 mb-2`}></div>
      <div className={`${baseClasses} h-10 w-full`}></div>
    </div>
    <div>
      <div className={`${baseClasses} h-5 w-24 mb-2`}></div>
      <div className={`${baseClasses} h-10 w-full`}></div>
    </div>
    <div>
      <div className={`${baseClasses} h-5 w-24 mb-2`}></div>
      <div className={`${baseClasses} h-10 w-full`}></div>
    </div>
    <div className={`${baseClasses} h-12 w-full`}></div>
  </div>
);

export const GridSkeletonLoader = ({ count = 4 }: { count?: number }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {Array(count)
      .fill(0)
      .map((_, i) => (
        <div key={i} className="bg-white rounded-lg border border-stone-200 p-4 shadow-sm">
          <div className={`${baseClasses} h-6 w-3/4 mb-3`}></div>
          <div className={`${baseClasses} h-8 w-full mb-3`}></div>
          <div className={`${baseClasses} h-4 w-2/3`}></div>
        </div>
      ))}
  </div>
);

export const ProfileSkeletonLoader = () => (
  <div className="space-y-4">
    <div className="flex items-center gap-4">
      <div className={`${baseClasses} h-16 w-16 rounded-full`}></div>
      <div className="flex-1">
        <div className={`${baseClasses} h-6 w-32 mb-2`}></div>
        <div className={`${baseClasses} h-4 w-24`}></div>
      </div>
    </div>
    <div className={`${baseClasses} h-10 w-full`}></div>
    <div className={`${baseClasses} h-10 w-full`}></div>
    <div className={`${baseClasses} h-20 w-full`}></div>
  </div>
);
