'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FiX, FiAward, FiTrendingUp, FiDollarSign, FiCheckCircle, FiMail, FiPhone } from 'react-icons/fi';
import { brokerService, type Broker } from '@/services/brokerService';
import { formatCurrency } from '@/lib/dashboardService';

interface TopPerformerData {
  brokerId: string;
  name: string;
  closedDeals: number;
  brokerCommission: number;
}

interface Props {
  topPerformer: TopPerformerData | null;
  /** Optional size override; defaults to 96px (icon-style). */
  size?: number;
}

/**
 * Renders the user-requested gold-medal award badge as an inline SVG, with
 * the top broker's avatar (or initials) shown inside the medal ring. Click
 * the badge to open a modal with the broker's full performance details.
 */
const TopPerformerBadge: React.FC<Props> = ({ topPerformer, size = 96 }) => {
  const [open, setOpen] = useState(false);
  const [broker, setBroker] = useState<Broker | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!topPerformer?.brokerId) {
      setBroker(null);
      return;
    }
    (async () => {
      try {
        const result = await brokerService.getBrokerById(topPerformer.brokerId);
        if (!cancelled) setBroker(result);
      } catch {
        if (!cancelled) setBroker(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topPerformer?.brokerId]);

  const initials = useMemo(() => {
    const name = topPerformer?.name || broker?.name || '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return '?';
    return (parts[0]?.[0] || '').toUpperCase() + (parts.length > 1 ? (parts[parts.length - 1][0] || '').toUpperCase() : '');
  }, [topPerformer, broker]);

  const hasPerformer = Boolean(topPerformer && topPerformer.brokerId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={hasPerformer ? `Top performer: ${topPerformer?.name}` : 'No top performer yet'}
        className="relative group focus:outline-none"
        style={{ width: size, height: size }}
      >
        <BadgeSvg size={size} />
        {/* Centered avatar inside the medal ring */}
        <div
          className="absolute rounded-full overflow-hidden bg-white flex items-center justify-center shadow-inner"
          style={{
            left: size * 0.21,
            top: size * 0.13,
            width: size * 0.46,
            height: size * 0.46,
          }}
        >
          {broker?.avatar ? (
            <img src={broker.avatar} alt={broker.name} className="w-full h-full object-cover" />
          ) : (
            <span
              className="font-bold text-amber-600"
              style={{ fontSize: size * 0.18 }}
            >
              {hasPerformer ? initials : '—'}
            </span>
          )}
        </div>
        {/* Hover label */}
        <span className="absolute left-1/2 -translate-x-1/2 -bottom-1 text-[10px] font-semibold text-stone-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-white/90 px-1.5 rounded">
          Top Performer
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Hero */}
            <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 px-5 pt-5 pb-6 text-center text-white relative">
              <button
                onClick={() => setOpen(false)}
                className="absolute right-3 top-3 rounded-full bg-white/20 hover:bg-white/30 p-1.5 text-white"
                title="Close"
              >
                <FiX size={14} />
              </button>
              <div className="flex justify-center mb-2">
                <BadgeSvg size={84} />
              </div>
              <p className="text-[11px] uppercase tracking-wider opacity-90">Top Performer</p>
              <h2 className="text-2xl font-bold mt-1">
                {topPerformer?.name || 'No performer yet'}
              </h2>
              {broker?.department && (
                <p className="text-xs opacity-90 mt-0.5 capitalize">{broker.department}</p>
              )}
            </div>

            {/* Body */}
            <div className="p-5 space-y-3">
              <Stat
                icon={<FiCheckCircle className="text-emerald-600" />}
                label="Closed Deals"
                value={String(topPerformer?.closedDeals ?? 0)}
              />
              <Stat
                icon={<FiDollarSign className="text-violet-600" />}
                label="Total Commission"
                value={formatCurrency(topPerformer?.brokerCommission ?? 0)}
              />
              {broker?.currentBilling !== undefined && broker?.billingTarget !== undefined && broker.billingTarget > 0 && (
                <Stat
                  icon={<FiTrendingUp className="text-blue-600" />}
                  label="Target Progress"
                  value={`${Math.round(broker.progressPercentage || 0)}% of ${formatCurrency(broker.billingTarget)}`}
                />
              )}
              {broker?.email && (
                <Stat
                  icon={<FiMail className="text-stone-500" />}
                  label="Email"
                  value={broker.email}
                />
              )}
              {broker?.phone && (
                <Stat
                  icon={<FiPhone className="text-stone-500" />}
                  label="Phone"
                  value={broker.phone}
                />
              )}
              {!hasPerformer && (
                <p className="text-center text-sm text-stone-500 py-4">
                  As soon as a broker closes a deal, the top performer will appear here.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 rounded-lg bg-stone-50 px-3 py-2">
    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">{label}</p>
      <p className="text-sm font-bold text-stone-900 truncate">{value}</p>
    </div>
  </div>
);

/** Inline SVG of the gold medal badge — gold ring + grey ribbons + sparkles. */
const BadgeSvg: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Sparkles */}
    <g fill="#facc15">
      <path d="M82 12 L83.3 16 L87 17 L83.3 18 L82 22 L80.7 18 L77 17 L80.7 16 Z" />
      <path d="M88 35 L88.8 37.5 L91 38 L88.8 38.5 L88 41 L87.2 38.5 L85 38 L87.2 37.5 Z" />
      <path d="M14 28 L15 31 L17.8 32 L15 32.9 L14 36 L13 32.9 L10 32 L13 31 Z" />
      <path d="M8 38 L8.7 40.5 L10.8 41 L8.7 41.5 L8 44 L7.3 41.5 L5 41 L7.3 40.5 Z" />
      <path d="M85 55 L85.8 57.5 L88 58 L85.8 58.5 L85 61 L84.2 58.5 L82 58 L84.2 57.5 Z" />
    </g>
    {/* Grey ribbons */}
    <path
      d="M38 70 L34 95 L42 88 L46 92 L50 75 Z"
      fill="#a8a29e"
    />
    <path
      d="M62 70 L66 95 L58 88 L54 92 L50 75 Z"
      fill="#a8a29e"
    />
    {/* Outer gold ring (darker base for depth) */}
    <circle cx="50" cy="40" r="32" fill="#ca8a04" />
    {/* Main gold ring */}
    <circle cx="50" cy="40" r="30" fill="#fbbf24" />
    {/* Gold highlight (inner gradient feel) */}
    <path
      d="M30 22 A30 30 0 0 1 70 22"
      stroke="#fde68a"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
    />
    {/* Inner white circle (this is where the avatar sits via DOM overlay) */}
    <circle cx="50" cy="40" r="22" fill="white" />
    <circle cx="50" cy="40" r="22" fill="none" stroke="#fde68a" strokeWidth="1.5" />
  </svg>
);

export default TopPerformerBadge;
