'use client';

import React, { useEffect, useState } from 'react';
import { FiMapPin, FiHome, FiTag, FiEdit2, FiX } from 'react-icons/fi';
import { propertyService, type PropertyRecord } from '@/services/propertyService';
import { customRecordService } from '@/services/customRecordService';

type FundOption = {
  id: string;
  name: string;
  fundType: 'Listed' | 'Non-Listed';
};

const getStatusColor = (status: string) => {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'for sale' || s === 'for_sale') return 'bg-blue-100 text-blue-800';
  if (s === 'for lease' || s === 'for_lease' || s === 'leased') return 'bg-green-100 text-green-800';
  if (s === 'auction') return 'bg-amber-100 text-amber-800';
  if (s === 'sold') return 'bg-red-100 text-red-800';
  if (s === 'mortgaged') return 'bg-orange-100 text-orange-800';
  if (s === 'owned') return 'bg-violet-100 text-violet-800';
  return 'bg-stone-100 text-stone-700';
};

export const AssetsManager: React.FC = () => {
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProp, setEditingProp] = useState<PropertyRecord | null>(null);
  const [selectedFundId, setSelectedFundId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [propResult, fundResult] = await Promise.all([
        propertyService.getAllProperties({ limit: 1000 }),
        customRecordService.getAllCustomRecords<Record<string, unknown>>({
          entityType: 'fund',
          limit: 1000,
        }),
      ]);
      setProperties(
        propResult.data.filter(p => {
          if (p.deletedAt) return false;
          const meta = p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata)
            ? p.metadata as Record<string, unknown>
            : {};
          return Boolean(meta.ownershipStatus);
        })
      );
      setFunds(
        fundResult.data.map((record) => ({
          id: record.id,
          name: record.name,
          fundType: ((record.category as 'Listed' | 'Non-Listed') || 'Listed') as 'Listed' | 'Non-Listed',
        }))
      );
    } catch {
      setProperties([]);
      setFunds([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      await loadData();
      if (!mounted) return;
    };
    void run();
    return () => { mounted = false; };
  }, []);

  const openEdit = (prop: PropertyRecord) => {
    const meta = prop.metadata && typeof prop.metadata === 'object' ? prop.metadata as Record<string, unknown> : {};
    const currentFundName = String(meta.linkedFundName || '');
    const matchingFund = funds.find(f => f.name === currentFundName);
    setSelectedFundId(matchingFund?.id || '');
    setEditingProp(prop);
  };

  const handleSave = async () => {
    if (!editingProp) return;
    setSaving(true);
    try {
      const chosenFund = funds.find(f => f.id === selectedFundId);
      const currentMeta = (editingProp.metadata && typeof editingProp.metadata === 'object'
        ? editingProp.metadata
        : {}) as Record<string, unknown>;

      await propertyService.updateProperty(editingProp.id, {
        metadata: {
          ...currentMeta,
          linkedFundId: chosenFund?.id || '',
          linkedFundName: chosenFund?.name || '',
          linkedFundType: chosenFund?.fundType || '',
        },
      });

      await loadData();
      setEditingProp(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Assets</h2>
          <p className="text-stone-500 text-sm mt-1">
            All properties added in Maps — {properties.length} asset{properties.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading assets…</div>
      ) : properties.length === 0 ? (
        <div className="text-center py-16 bg-stone-50 rounded-xl border border-dashed border-stone-300">
          <FiMapPin className="mx-auto text-stone-300 mb-3" size={40} />
          <p className="text-stone-500 font-medium">No assets found</p>
          <p className="text-stone-400 text-sm mt-1">
            Properties you add in the Maps module will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {properties.map((prop) => {
            const meta = prop.metadata && typeof prop.metadata === 'object' ? prop.metadata as Record<string, unknown> : {};
            const displayName = String(meta.displayName || prop.title || prop.address || '');
            const linkedFundName = String(meta.linkedFundName || '');
            const ownershipStatus = String(meta.ownershipStatus || prop.status || '');
            const squareFeet = Number(meta.squareFeet || prop.area || 0);
            const gla = Number(meta.gla || 0);
            const yearBuilt = Number(meta.yearBuilt || 0);
            const condition = String(meta.condition || '');
            const propertyType = String(meta.propertyType || prop.type || '');

            return (
              <div
                key={prop.id}
                className="bg-white rounded-xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Card header */}
                <div className="p-5 border-b border-stone-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FiHome className="text-violet-500 flex-shrink-0" size={16} />
                      <h3 className="text-sm font-bold text-stone-900 truncate">{displayName}</h3>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${getStatusColor(ownershipStatus || prop.status)}`}>
                        {ownershipStatus || prop.status || 'Active'}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEdit(prop)}
                        title="Edit & link to fund"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:bg-violet-50 hover:text-violet-600 transition-colors"
                      >
                        <FiEdit2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                    <FiMapPin className="inline mr-1 text-stone-400" size={11} />
                    {prop.address}
                  </p>
                </div>

                {/* Details grid */}
                <div className="p-5 grid grid-cols-2 gap-3 text-xs">
                  {propertyType && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Type</p>
                      <p className="text-stone-800 font-semibold mt-0.5">{propertyType}</p>
                    </div>
                  )}
                  {squareFeet > 0 && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Sq Ft</p>
                      <p className="text-stone-800 font-semibold mt-0.5">{squareFeet.toLocaleString()}</p>
                    </div>
                  )}
                  {gla > 0 && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">GLA</p>
                      <p className="text-stone-800 font-semibold mt-0.5">{gla.toLocaleString()}</p>
                    </div>
                  )}
                  {yearBuilt > 0 && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Year Built</p>
                      <p className="text-stone-800 font-semibold mt-0.5">{yearBuilt}</p>
                    </div>
                  )}
                  {condition && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Condition</p>
                      <p className="text-stone-800 font-semibold mt-0.5 capitalize">{condition}</p>
                    </div>
                  )}
                  {prop.price > 0 && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Price</p>
                      <p className="text-stone-800 font-semibold mt-0.5">R{prop.price.toLocaleString('en-ZA')}</p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 pb-4 flex items-center justify-between">
                  {linkedFundName ? (
                    <span className="flex items-center gap-1 text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full font-medium">
                      <FiTag size={10} />
                      {linkedFundName}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openEdit(prop)}
                      className="text-xs text-violet-500 hover:underline italic"
                    >
                      + Link to fund
                    </button>
                  )}
                  <span className="text-xs text-stone-400">
                    {new Date(prop.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Link Fund Modal */}
      {editingProp && (() => {
        const meta = editingProp.metadata && typeof editingProp.metadata === 'object'
          ? editingProp.metadata as Record<string, unknown>
          : {};
        const displayName = String(meta.displayName || editingProp.title || editingProp.address || '');
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => !saving && setEditingProp(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50">
                <div>
                  <h3 className="text-sm font-bold text-stone-950">{displayName}</h3>
                  <p className="text-xs text-stone-500 mt-0.5">Link to a fund</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProp(null)}
                  disabled={saving}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors"
                >
                  <FiX size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-2">
                    Fund
                  </label>
                  {funds.length === 0 ? (
                    <p className="text-xs text-stone-400 italic">No funds available. Create a fund first.</p>
                  ) : (
                    <select
                      value={selectedFundId}
                      onChange={e => setSelectedFundId(e.target.value)}
                      className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    >
                      <option value="">— No fund —</option>
                      {funds.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.fundType})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 pb-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingProp(null)}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 border border-stone-300 rounded-lg text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-violet-500 hover:bg-violet-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
