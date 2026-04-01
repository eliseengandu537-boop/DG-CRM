import React from "react";
import { FiChevronRight } from "react-icons/fi";
import { formatRand } from '@/lib/currency';

export interface Broker {
  id: string;
  name: string;
  profilePicture: string;
  billingTarget: number;
  currentBilling: number;
  progressPercentage?: number;
  segments: string[];
  department?: string;
  type?: string;
}

interface BrokerCardProps {
  broker: Broker;
  onSelect: (broker: Broker) => void;
  disabled?: boolean;
  note?: string;
}

export const BrokerCard: React.FC<BrokerCardProps> = ({
  broker,
  onSelect,
  disabled = false,
  note,
}) => {
  const billingTarget = Math.max(0, Number(broker.billingTarget || 0));
  const currentBilling = Math.max(0, Number(broker.currentBilling || 0));
  const percentageAchieved = Math.round(
    Number.isFinite(Number(broker.progressPercentage))
      ? Number(broker.progressPercentage)
      : billingTarget > 0
      ? (currentBilling / billingTarget) * 100
      : 0
  );

  const isTargetMet = percentageAchieved >= 100;

  return (
    <div
      onClick={() => {
        if (!disabled) onSelect(broker);
      }}
      className={`bg-gradient-to-br from-white to-stone-50 rounded-xl shadow-sm border border-stone-200 transition-all duration-200 ${
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:shadow-md hover:border-stone-300 cursor-pointer hover:from-stone-50"
      }`}
    >
      {/* Status Indicator Bar */}
      <div
        className={`h-1 rounded-t-xl ${
          isTargetMet
            ? "bg-gradient-to-r from-green-400 to-emerald-500"
            : "bg-gradient-to-r from-violet-400 to-indigo-500"
        }`}
      />

      <div className="p-5">
        {/* Header with Picture and Name */}
        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <img
              src={broker.profilePicture}
              alt={broker.name}
              className="w-14 h-14 rounded-full object-cover border-2 border-stone-200 shadow-sm"
            />
            {isTargetMet && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                ✓
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-stone-950 truncate">{broker.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-stone-500 bg-stone-100 px-2 py-1 rounded-md">
                {broker.department || "General"}
              </span>
              <span className="text-xs text-stone-400">
                {broker.segments?.length || 0} segment(s)
              </span>
            </div>
          </div>
          <FiChevronRight className={`shrink-0 text-stone-300 ${!disabled && "group-hover:text-stone-500"}`} />
        </div>

        {note && (
          <div className="mb-4 p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">{note}</p>
          </div>
        )}

        {/* KPI Section */}
        <div className="space-y-4">
          {/* Current Billing */}
          <div className="pb-3 border-b border-stone-200">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-stone-600 uppercase tracking-wide">
                Current Billing
              </span>
              <span className="text-sm font-bold text-stone-950">
                {formatRand(currentBilling)}
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Target: {formatRand(billingTarget)}
            </p>
          </div>

          {/* Progress vs Target */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-stone-600 uppercase tracking-wide">
                Progress
              </span>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                  isTargetMet
                    ? "bg-green-100 text-green-700"
                    : "bg-violet-100 text-violet-700"
                }`}
              >
                {percentageAchieved}%
              </span>
            </div>
            <div className="w-full bg-stone-200 rounded-full h-2.5 overflow-hidden shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isTargetMet
                    ? "bg-gradient-to-r from-green-400 to-emerald-500"
                    : "bg-gradient-to-r from-violet-400 to-indigo-500"
                }`}
                style={{ width: `${Math.min(percentageAchieved, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
