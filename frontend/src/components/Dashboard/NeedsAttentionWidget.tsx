'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiAlertCircle,
  FiClock,
  FiCalendar,
  FiArrowRight,
} from 'react-icons/fi';
import { dealService, type Deal } from '@/services/dealService';
import { useAuth } from '@/context/AuthContext';
import { formatRand } from '@/lib/currency';
import { navigateToPage } from '@/lib/crmNavigation';

const TERMINAL_STATUSES = new Set(['CLOSED', 'WON', 'AWAITING_PAYMENT']);
const STUCK_DAY_THRESHOLD = 14;

function ageDays(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function isToday(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isPast(iso?: string): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

function withinDays(iso?: string, days = 7): boolean {
  if (!iso) return false;
  const ms = new Date(iso).getTime() - Date.now();
  return ms >= 0 && ms <= days * 24 * 60 * 60 * 1000;
}

function statusToKey(label: string): string {
  // Backend serialises status as the human label, but our terminal-set uses keys.
  const map: Record<string, string> = {
    CLOSED: 'CLOSED',
    Closed: 'CLOSED',
    WON: 'WON',
    Won: 'WON',
    AWAITING_PAYMENT: 'AWAITING_PAYMENT',
    'Awaiting Payment': 'AWAITING_PAYMENT',
  };
  return map[label] || label;
}

type Tab = 'stuck' | 'due' | 'closing';

const NeedsAttentionWidget: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('stuck');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dealService.getAllDeals({ limit: 500 });
      setDeals(res.data);
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeDeals = useMemo(
    () => deals.filter((d) => !TERMINAL_STATUSES.has(statusToKey(d.status))),
    [deals]
  );

  // Brokers only see their own; admin/manager see everything (already scoped server-side).
  const scoped = useMemo(() => activeDeals, [activeDeals]);

  const stuckDeals = useMemo(
    () =>
      scoped
        .filter((d) => ageDays(d.lastActivityAt || d.updatedAt) > STUCK_DAY_THRESHOLD)
        .sort(
          (a, b) =>
            ageDays(b.lastActivityAt || b.updatedAt) - ageDays(a.lastActivityAt || a.updatedAt)
        ),
    [scoped]
  );

  const dueDeals = useMemo(
    () =>
      scoped
        .filter((d) => d.nextActionDue && (isToday(d.nextActionDue) || isPast(d.nextActionDue)))
        .sort(
          (a, b) =>
            new Date(a.nextActionDue!).getTime() - new Date(b.nextActionDue!).getTime()
        ),
    [scoped]
  );

  const closingThisWeek = useMemo(
    () =>
      scoped
        .filter((d) => withinDays(d.targetClosureDate, 7))
        .sort(
          (a, b) =>
            new Date(a.targetClosureDate!).getTime() -
            new Date(b.targetClosureDate!).getTime()
        ),
    [scoped]
  );

  const counts = {
    stuck: stuckDeals.length,
    due: dueDeals.length,
    closing: closingThisWeek.length,
  };

  const visibleList =
    activeTab === 'stuck' ? stuckDeals : activeTab === 'due' ? dueDeals : closingThisWeek;
  const limit = compact ? 5 : 8;

  const handleOpenDeal = useCallback(() => {
    // Brokers don't have access to Deal Sheet, but they can see deals via their
    // own profile. For now, just navigate to Deal Sheet for admin/manager and do
    // nothing for brokers (the row still has useful info on the card).
    if (user?.role === 'admin' || user?.role === 'manager') {
      navigateToPage('Deal Sheet');
    }
  }, [user]);

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
            <FiAlertCircle size={14} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-stone-900">Needs Attention</p>
            <p className="text-[11px] text-stone-500">Deals that need a touch today</p>
          </div>
        </div>
        <div className="text-[11px] font-semibold text-stone-600 bg-stone-100 rounded-full px-2 py-0.5 shrink-0">
          {counts.stuck + counts.due + counts.closing}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-100">
        <TabBtn
          label="Stuck"
          count={counts.stuck}
          active={activeTab === 'stuck'}
          tone="red"
          onClick={() => setActiveTab('stuck')}
        />
        <TabBtn
          label="Due"
          count={counts.due}
          active={activeTab === 'due'}
          tone="amber"
          onClick={() => setActiveTab('due')}
        />
        <TabBtn
          label="Closing"
          count={counts.closing}
          active={activeTab === 'closing'}
          tone="emerald"
          onClick={() => setActiveTab('closing')}
        />
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <p className="text-center text-xs text-stone-400 py-6">Loading…</p>
        ) : visibleList.length === 0 ? (
          <div className="text-center py-6 px-4">
            <p className="text-xs text-stone-500">
              {activeTab === 'stuck' && '🎉 No deals stuck — keep the momentum.'}
              {activeTab === 'due' && '🎉 No follow-ups due today.'}
              {activeTab === 'closing' && 'Nothing scheduled to close this week.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {visibleList.slice(0, limit).map((deal) => (
              <li
                key={deal.id}
                className="px-4 py-2.5 hover:bg-stone-50 cursor-pointer transition-colors"
                onClick={handleOpenDeal}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-stone-900 truncate">
                      {deal.title}
                    </p>
                    <p className="text-[11px] text-stone-500 truncate">
                      {deal.assignedBrokerName || deal.clientName || 'Unassigned'} —{' '}
                      {deal.status}
                    </p>
                    {activeTab === 'stuck' && (
                      <p className="text-[11px] text-red-600 font-medium mt-0.5 flex items-center gap-1">
                        <FiClock size={10} />
                        {ageDays(deal.lastActivityAt || deal.updatedAt)} days since last activity
                      </p>
                    )}
                    {activeTab === 'due' && deal.nextActionDue && (
                      <p className="text-[11px] text-amber-700 font-medium mt-0.5 flex items-center gap-1">
                        <FiCalendar size={10} />
                        {isPast(deal.nextActionDue) ? 'Overdue' : 'Due today'} —{' '}
                        {deal.nextAction || 'follow up'}
                      </p>
                    )}
                    {activeTab === 'closing' && deal.targetClosureDate && (
                      <p className="text-[11px] text-emerald-700 font-medium mt-0.5 flex items-center gap-1">
                        <FiCalendar size={10} />
                        Target {new Date(deal.targetClosureDate).toLocaleDateString('en-ZA')}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-stone-900">
                      {formatRand(deal.assetValue ?? deal.value ?? 0)}
                    </p>
                    <FiArrowRight
                      size={12}
                      className="text-stone-400 group-hover:text-stone-700 ml-auto mt-1"
                    />
                  </div>
                </div>
              </li>
            ))}
            {visibleList.length > limit && (
              <li className="px-4 py-2 text-center text-[11px] text-stone-500">
                +{visibleList.length - limit} more
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
};

const TabBtn: React.FC<{
  label: string;
  count: number;
  active: boolean;
  tone: 'red' | 'amber' | 'emerald';
  onClick: () => void;
}> = ({ label, count, active, tone, onClick }) => {
  const toneActive =
    tone === 'red'
      ? 'border-red-500 text-red-700'
      : tone === 'amber'
      ? 'border-amber-500 text-amber-700'
      : 'border-emerald-500 text-emerald-700';
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-2 py-2 text-[11px] font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
        active ? toneActive : 'border-transparent text-stone-500 hover:text-stone-800'
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
          active
            ? tone === 'red'
              ? 'bg-red-100 text-red-700'
              : tone === 'amber'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-emerald-100 text-emerald-700'
            : 'bg-stone-100 text-stone-600'
        }`}
      >
        {count}
      </span>
    </button>
  );
};

export default NeedsAttentionWidget;
