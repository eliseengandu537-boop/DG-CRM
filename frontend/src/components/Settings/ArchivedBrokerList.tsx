'use client';

import React, { useMemo, useState } from 'react';
import { FiArchive, FiClock, FiSearch, FiTrash2, FiUser } from 'react-icons/fi';
import { ArchivedBrokerRecord } from '@/services/brokerService';

interface ArchivedBrokerListProps {
  archivedBrokers: ArchivedBrokerRecord[];
  canDelete?: boolean;
  onDelete?: (brokerId: string) => void;
}

function formatArchivedDate(value?: string): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
}

export default function ArchivedBrokerList({
  archivedBrokers,
  canDelete = false,
  onDelete,
}: ArchivedBrokerListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredBrokers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return archivedBrokers;
    return archivedBrokers.filter(item => {
      const broker = item.broker;
      return (
        broker.name.toLowerCase().includes(term) ||
        broker.email.toLowerCase().includes(term) ||
        (broker.company || '').toLowerCase().includes(term) ||
        (broker.archivedByName || '').toLowerCase().includes(term) ||
        (broker.archivedByEmail || '').toLowerCase().includes(term)
      );
    });
  }, [archivedBrokers, searchTerm]);

  const totals = useMemo(
    () =>
      filteredBrokers.reduce(
        (acc, item) => {
          acc.archived += 1;
          acc.leads += item.workload.leadsCount;
          acc.deals += item.workload.dealsCount;
          acc.forecasts += item.workload.forecastDealsCount;
          acc.wip += item.workload.wipDealsCount;
          return acc;
        },
        { archived: 0, leads: 0, deals: 0, forecasts: 0, wip: 0 }
      ),
    [filteredBrokers]
  );

  return (
    <div className="flex flex-col gap-4 h-full flex-1 min-h-0">
      <div className="flex items-center gap-2 bg-white px-4 py-3 rounded-lg border border-stone-200">
        <FiSearch className="text-stone-400" size={20} />
        <input
          type="text"
          placeholder="Search archived brokers by name, email, team, or archived by..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1 outline-none text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {filteredBrokers.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-stone-500">
            <p>No archived brokers found</p>
          </div>
        ) : (
          filteredBrokers.map(item => (
            <div
              key={item.broker.id}
              className="bg-white rounded-lg border border-stone-200 hover:border-blue-400 hover:shadow-md transition-all"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-stone-900 text-lg">{item.broker.name}</h3>
                      <span className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap bg-stone-100 text-stone-700">
                        Archived
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm text-stone-600">
                      <div>
                        <span className="font-medium">Email:</span> {item.broker.email}
                      </div>
                      <div>
                        <span className="font-medium">Phone:</span> {item.broker.phone}
                      </div>
                      <div>
                        <span className="font-medium">Department:</span> {item.broker.company || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">Last Status:</span> {item.broker.status}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 text-xs text-stone-500">
                    <span className="inline-flex items-center gap-1">
                      <FiClock size={14} />
                      {formatArchivedDate(item.broker.archivedAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FiUser size={14} />
                      {item.broker.archivedByName || item.broker.archivedByEmail || 'System'}
                    </span>
                    {canDelete && onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(item.broker.id)}
                        className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                        title="Delete archived broker permanently"
                      >
                        <FiTrash2 size={13} />
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                    <p className="text-xs font-medium text-blue-700">Leads</p>
                    <p className="text-lg font-semibold text-blue-900">{item.workload.leadsCount}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <p className="text-xs font-medium text-emerald-700">Deals</p>
                    <p className="text-lg font-semibold text-emerald-900">{item.workload.dealsCount}</p>
                  </div>
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                    <p className="text-xs font-medium text-indigo-700">Forecast</p>
                    <p className="text-lg font-semibold text-indigo-900">{item.workload.forecastDealsCount}</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-xs font-medium text-amber-700">WIP Deals</p>
                    <p className="text-lg font-semibold text-amber-900">{item.workload.wipDealsCount}</p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-stone-500">
                  Historical records remain linked for reporting, WIP tracking, and forecast analysis.
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-stone-50 p-4 rounded-lg border border-stone-200">
        <div className="flex items-center gap-2 text-stone-700 mb-2">
          <FiArchive size={16} />
          <p className="text-sm font-medium">Archive Summary</p>
        </div>
        <div className="grid grid-cols-5 gap-4 text-sm">
          <div>
            <p className="text-stone-600 font-medium">Archived</p>
            <p className="text-2xl font-bold text-stone-900">{totals.archived}</p>
          </div>
          <div>
            <p className="text-stone-600 font-medium">Leads</p>
            <p className="text-2xl font-bold text-blue-600">{totals.leads}</p>
          </div>
          <div>
            <p className="text-stone-600 font-medium">Deals</p>
            <p className="text-2xl font-bold text-emerald-600">{totals.deals}</p>
          </div>
          <div>
            <p className="text-stone-600 font-medium">Forecast</p>
            <p className="text-2xl font-bold text-indigo-600">{totals.forecasts}</p>
          </div>
          <div>
            <p className="text-stone-600 font-medium">WIP Deals</p>
            <p className="text-2xl font-bold text-amber-600">{totals.wip}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
