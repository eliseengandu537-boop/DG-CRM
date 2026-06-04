'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiSearch,
  FiPlus,
  FiDownload,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSave,
  FiFilter,
  FiUsers,
  FiTarget,
  FiHome,
  FiMapPin,
  FiExternalLink,
} from 'react-icons/fi';
import { useAuth } from '@/context/AuthContext';
import {
  customRecordService,
  type CustomRecord,
} from '@/services/customRecordService';
import { propertyService, type PropertyRecord } from '@/services/propertyService';
import { PROPERTY_TYPE_OPTIONS } from '@/lib/propertyTypes';
import { navigateToPage } from '@/lib/crmNavigation';

type Kind = 'potential' | 'buyer';
type KindFilter = 'all' | Kind;

const ENTITY_TYPE: Record<Kind, string> = {
  potential: 'master_db_potential',
  buyer: 'master_db_buyer',
};

const KIND_LABEL: Record<Kind, string> = {
  potential: 'Potential B&S',
  buyer: 'Buyer Brief',
};

interface PotentialPayload {
  name: string;
  surname?: string;
  email?: string;
  contactNumber?: string;
  altContactNumber?: string;
  company?: string;
  assetTypes?: string[];
  lookingFor?: string;
  notes?: string;
  linkedCompanyIds?: string[];
  linkedFundIds?: string[];
  linkedPropertyIds?: string[];
}

interface BuyerPayload {
  name: string;
  surname?: string;
  email?: string;
  contactNumber?: string;
  company?: string;
  area?: string;
  category?: string;
  zoning?: string;
  size?: string;
  price?: string;
  description?: string;
  assetTypes?: string[];
  lookingFor?: string;
  comments?: string;
  linkedCompanyIds?: string[];
  linkedFundIds?: string[];
  linkedPropertyIds?: string[];
}

type AnyPayload = PotentialPayload | BuyerPayload;
type AnyRecord = CustomRecord<AnyPayload>;

const emptyPotential: PotentialPayload = {
  name: '',
  surname: '',
  email: '',
  contactNumber: '',
  altContactNumber: '',
  company: '',
  assetTypes: [],
  lookingFor: '',
  notes: '',
};

const emptyBuyer: BuyerPayload = {
  name: '',
  surname: '',
  email: '',
  contactNumber: '',
  company: '',
  area: '',
  category: '',
  zoning: '',
  size: '',
  price: '',
  description: '',
  assetTypes: [],
  lookingFor: '',
  comments: '',
};

function recordKind(rec: AnyRecord): Kind {
  return rec.entityType === ENTITY_TYPE.buyer ? 'buyer' : 'potential';
}

function isBuyerRecord(rec: AnyRecord): rec is CustomRecord<BuyerPayload> {
  return recordKind(rec) === 'buyer';
}

function toCsvString(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const v = String(cell ?? '');
          if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
          return v;
        })
        .join(',')
    )
    .join('\n');
}

function downloadCsv(name: string, body: string) {
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function combinedCsv(records: AnyRecord[]): string {
  const header = [
    'Kind',
    'Name',
    'Surname',
    'Email',
    'Contact Number',
    'Alt Contact Number',
    'Company',
    'Area',
    'Category',
    'Zoning',
    'Size',
    'Price',
    'Description',
    'Asset Types',
    'Looking For',
    'Comments / Notes',
    'Linked Property Count',
  ];
  const rows = records.map((r) => {
    const k = recordKind(r);
    const p = r.payload as AnyPayload;
    const buyer = p as BuyerPayload;
    const potential = p as PotentialPayload;
    return [
      KIND_LABEL[k],
      p.name || '',
      p.surname || '',
      p.email || '',
      p.contactNumber || '',
      potential.altContactNumber || '',
      p.company || '',
      buyer.area || '',
      buyer.category || '',
      buyer.zoning || '',
      buyer.size || '',
      buyer.price || '',
      buyer.description || '',
      (p.assetTypes || []).join('; '),
      p.lookingFor || '',
      buyer.comments || potential.notes || '',
      String((p.linkedPropertyIds || []).length),
    ];
  });
  return toCsvString([header, ...rows]);
}

const MasterDatabase: React.FC = () => {
  const { user } = useAuth();
  const isPrivileged = user?.role === 'admin' || user?.role === 'manager';
  const canEdit = isPrivileged;

  const [potentialRecords, setPotentialRecords] = useState<AnyRecord[]>([]);
  const [buyerRecords, setBuyerRecords] = useState<AnyRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);
  const [showAssetTypeFilter, setShowAssetTypeFilter] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<Kind>('potential');
  const [formPotential, setFormPotential] = useState<PotentialPayload>(emptyPotential);
  const [formBuyer, setFormBuyer] = useState<BuyerPayload>(emptyBuyer);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Property index used to resolve linkedPropertyIds -> property details when
  // a contact card is expanded. Loaded lazily on first expand.
  const [propertyIndex, setPropertyIndex] = useState<Map<string, PropertyRecord> | null>(null);
  const [loadingProperties, setLoadingProperties] = useState(false);

  const showNotification = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [potential, buyer] = await Promise.all([
        customRecordService.getAllCustomRecords<AnyPayload>({
          entityType: ENTITY_TYPE.potential,
          limit: 5000,
        }),
        customRecordService.getAllCustomRecords<AnyPayload>({
          entityType: ENTITY_TYPE.buyer,
          limit: 5000,
        }),
      ]);
      setPotentialRecords(potential.data);
      setBuyerRecords(buyer.data);
    } catch (err) {
      console.warn('Failed to load Master Database:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Lazily load property index when the first record is expanded.
  const ensurePropertyIndex = useCallback(async () => {
    if (propertyIndex || loadingProperties) return;
    setLoadingProperties(true);
    try {
      const res = await propertyService.getAllProperties({ limit: 10000 });
      const map = new Map<string, PropertyRecord>();
      for (const p of res.data) map.set(p.id, p);
      setPropertyIndex(map);
    } catch (err) {
      console.warn('Failed to load property index:', err);
      setPropertyIndex(new Map());
    } finally {
      setLoadingProperties(false);
    }
  }, [propertyIndex, loadingProperties]);

  const allRecords = useMemo(
    () => [...potentialRecords, ...buyerRecords],
    [potentialRecords, buyerRecords]
  );

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allRecords.filter((r) => {
      const k = recordKind(r);
      if (kindFilter !== 'all' && k !== kindFilter) return false;
      const p = r.payload as AnyPayload;
      if (selectedAssetTypes.length > 0) {
        const types = (p.assetTypes || []).map((t) => t.toLowerCase());
        const matchesAsset = selectedAssetTypes.some((sel) => types.includes(sel.toLowerCase()));
        if (!matchesAsset) return false;
      }
      if (!q) return true;
      const buyer = p as BuyerPayload;
      const haystack = [
        p.name,
        p.surname,
        p.email,
        p.contactNumber,
        p.company,
        buyer.area,
        buyer.description,
        p.lookingFor,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allRecords, kindFilter, searchQuery, selectedAssetTypes]);

  const handleStartAdd = useCallback(() => {
    setEditingId(null);
    setNewKind('potential');
    setFormPotential(emptyPotential);
    setFormBuyer(emptyBuyer);
    setShowAddModal(true);
  }, []);

  const handleStartEdit = useCallback((record: AnyRecord) => {
    setEditingId(record.id);
    if (isBuyerRecord(record)) {
      setNewKind('buyer');
      setFormBuyer({ ...emptyBuyer, ...(record.payload as BuyerPayload) });
    } else {
      setNewKind('potential');
      setFormPotential({ ...emptyPotential, ...(record.payload as PotentialPayload) });
    }
    setShowAddModal(true);
  }, []);

  const handleSave = useCallback(async () => {
    const payload = newKind === 'potential' ? formPotential : formBuyer;
    const displayName =
      `${payload.name || ''} ${payload.surname || ''}`.trim() ||
      payload.email ||
      'Untitled';

    if (!payload.name?.trim() && !payload.email?.trim()) {
      showNotification('Please enter a name or email.', 'error');
      return;
    }

    try {
      if (editingId) {
        await customRecordService.updateCustomRecord<AnyPayload>(editingId, {
          name: displayName,
          payload,
        });
        showNotification('Record updated.');
      } else {
        await customRecordService.createCustomRecord<AnyPayload>({
          entityType: ENTITY_TYPE[newKind],
          name: displayName,
          payload,
        });
        showNotification('Record added.');
      }
      setShowAddModal(false);
      setEditingId(null);
      void loadData();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Failed to save record.', 'error');
    }
  }, [newKind, editingId, formPotential, formBuyer, loadData, showNotification]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Delete this record? This cannot be undone.')) return;
      try {
        await customRecordService.deleteCustomRecord(id);
        showNotification('Record deleted.');
        void loadData();
      } catch (err) {
        showNotification(err instanceof Error ? err.message : 'Failed to delete record.', 'error');
      }
    },
    [loadData, showNotification]
  );

  const handleExport = useCallback(() => {
    if (!isPrivileged) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`master-database-${stamp}.csv`, combinedCsv(filteredRecords));
  }, [filteredRecords, isPrivileged]);

  const toggleAssetTypeFilter = useCallback((type: string) => {
    setSelectedAssetTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  const toggleFormAssetType = useCallback(
    (type: string) => {
      if (newKind === 'potential') {
        setFormPotential((prev) => ({
          ...prev,
          assetTypes: prev.assetTypes?.includes(type)
            ? prev.assetTypes.filter((t) => t !== type)
            : [...(prev.assetTypes || []), type],
        }));
      } else {
        setFormBuyer((prev) => ({
          ...prev,
          assetTypes: prev.assetTypes?.includes(type)
            ? prev.assetTypes.filter((t) => t !== type)
            : [...(prev.assetTypes || []), type],
        }));
      }
    },
    [newKind]
  );

  const counts = {
    potential: potentialRecords.length,
    buyer: buyerRecords.length,
    all: potentialRecords.length + buyerRecords.length,
  };

  const currentFormAssetTypes =
    newKind === 'potential' ? formPotential.assetTypes : formBuyer.assetTypes;

  const handleExpand = useCallback(
    (id: string) => {
      setExpandedId((curr) => {
        const next = curr === id ? null : id;
        if (next !== null) void ensurePropertyIndex();
        return next;
      });
    },
    [ensurePropertyIndex]
  );

  return (
    <div className="space-y-4">
      {notification && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${
            notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Master Database</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            All contacts — potential buyers & sellers, active buyer briefs, and property owners.
          </p>
        </div>
        <div className="flex gap-2">
          {isPrivileged && (
            <button
              onClick={handleExport}
              disabled={filteredRecords.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiDownload size={14} />
              Export CSV
            </button>
          )}
          {canEdit && (
            <button
              onClick={handleStartAdd}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <FiPlus size={14} />
              Add Contact
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, area, company, or description..."
            className="w-full rounded-lg border border-stone-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Kind filter chips */}
        <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
          <KindChip
            label="All"
            count={counts.all}
            active={kindFilter === 'all'}
            onClick={() => setKindFilter('all')}
          />
          <KindChip
            icon={<FiUsers size={12} />}
            label="Potential B&S"
            count={counts.potential}
            active={kindFilter === 'potential'}
            onClick={() => setKindFilter('potential')}
          />
          <KindChip
            icon={<FiTarget size={12} />}
            label="Buyers Looking"
            count={counts.buyer}
            active={kindFilter === 'buyer'}
            onClick={() => setKindFilter('buyer')}
          />
        </div>

        {/* Asset type filter */}
        <div className="relative">
          <button
            onClick={() => setShowAssetTypeFilter((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
              selectedAssetTypes.length > 0
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            <FiFilter size={14} />
            Asset Type
            {selectedAssetTypes.length > 0 && (
              <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {selectedAssetTypes.length}
              </span>
            )}
          </button>
          {showAssetTypeFilter && (
            <div className="absolute right-0 top-full mt-1 z-30 w-72 rounded-lg border border-stone-200 bg-white p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Filter by Asset Type
                </p>
                {selectedAssetTypes.length > 0 && (
                  <button
                    onClick={() => setSelectedAssetTypes([])}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {PROPERTY_TYPE_OPTIONS.map((type) => (
                  <label
                    key={type}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-stone-700 hover:bg-stone-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAssetTypes.includes(type)}
                      onChange={() => toggleAssetTypeFilter(type)}
                      className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="text-xs text-stone-500">
          {filteredRecords.length} of {allRecords.length}{' '}
          {allRecords.length === 1 ? 'record' : 'records'}
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-stone-500">Loading...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center">
            <FiUsers className="mx-auto text-stone-300 mb-2" size={32} />
            <p className="text-sm text-stone-500">
              {allRecords.length === 0
                ? 'No records yet. Add your first contact.'
                : 'No records match your filters.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {filteredRecords.map((record) => {
              const k = recordKind(record);
              const p = record.payload as AnyPayload;
              const buyer = p as BuyerPayload;
              const potential = p as PotentialPayload;
              const isExpanded = expandedId === record.id;
              const linkedIds = p.linkedPropertyIds || [];
              return (
                <div key={record.id} className="px-4 py-3">
                  <div
                    onClick={() => handleExpand(record.id)}
                    className="flex items-start gap-4 cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-stone-900 truncate">
                          {`${p.name || ''} ${p.surname || ''}`.trim() || p.email || 'Unnamed'}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            k === 'buyer'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {k === 'buyer' ? <FiTarget size={10} /> : <FiUsers size={10} />}
                          {KIND_LABEL[k]}
                        </span>
                        {linkedIds.length > 0 && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                            title="Owns this many properties"
                          >
                            <FiHome size={10} />
                            {linkedIds.length}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-stone-500">
                        {p.email && <span>📧 {p.email}</span>}
                        {p.contactNumber && <span>📞 {p.contactNumber}</span>}
                        {p.company && <span>🏢 {p.company}</span>}
                        {k === 'buyer' && buyer.area && <span>📍 {buyer.area}</span>}
                        {k === 'buyer' && buyer.price && <span>💰 {buyer.price}</span>}
                      </div>
                      {(p.assetTypes || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(p.assetTypes || []).map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleStartEdit(record)}
                          className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                          title="Edit"
                        >
                          <FiEdit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(record.id)}
                          className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 py-3 border-t border-stone-100 space-y-4">
                      {/* Type-specific details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                        {k === 'buyer' ? (
                          <>
                            <Field label="Company" value={buyer.company} />
                            <Field label="Area" value={buyer.area} />
                            <Field label="Category" value={buyer.category} />
                            <Field label="Zoning" value={buyer.zoning} />
                            <Field label="Size" value={buyer.size} />
                            <Field label="Price" value={buyer.price} />
                            <Field label="Description" value={buyer.description} full />
                            <Field
                              label="What they're looking for"
                              value={buyer.lookingFor}
                              full
                            />
                            <Field label="Comments" value={buyer.comments} full />
                          </>
                        ) : (
                          <>
                            <Field label="Company" value={p.company} />
                            <Field
                              label="Alt Contact Number"
                              value={potential.altContactNumber}
                            />
                            <Field
                              label="What they're looking for / investing in"
                              value={potential.lookingFor}
                              full
                            />
                            <Field label="Notes" value={potential.notes} full />
                          </>
                        )}
                      </div>

                      {/* Linked properties */}
                      <LinkedProperties
                        linkedIds={linkedIds}
                        propertyIndex={propertyIndex}
                        loading={loadingProperties}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && canEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
              <h2 className="text-lg font-semibold text-stone-900">
                {editingId ? 'Edit Contact' : 'Add Contact'}
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-4">
              {/* Kind selector — only when creating a new record */}
              {!editingId && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
                    Contact Type
                  </p>
                  <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
                    <button
                      type="button"
                      onClick={() => setNewKind('potential')}
                      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 font-medium ${
                        newKind === 'potential'
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      <FiUsers size={13} /> Potential B&S
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewKind('buyer')}
                      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 font-medium ${
                        newKind === 'buyer'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      <FiTarget size={13} /> Buyer Brief
                    </button>
                  </div>
                </div>
              )}

              {newKind === 'potential' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput
                      label="Name"
                      value={formPotential.name}
                      onChange={(v) => setFormPotential({ ...formPotential, name: v })}
                    />
                    <FormInput
                      label="Surname"
                      value={formPotential.surname || ''}
                      onChange={(v) => setFormPotential({ ...formPotential, surname: v })}
                    />
                  </div>
                  <FormInput
                    label="Email"
                    value={formPotential.email || ''}
                    onChange={(v) => setFormPotential({ ...formPotential, email: v })}
                    type="email"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput
                      label="Contact Number"
                      value={formPotential.contactNumber || ''}
                      onChange={(v) =>
                        setFormPotential({ ...formPotential, contactNumber: v })
                      }
                    />
                    <FormInput
                      label="Alt Contact Number"
                      value={formPotential.altContactNumber || ''}
                      onChange={(v) =>
                        setFormPotential({ ...formPotential, altContactNumber: v })
                      }
                    />
                  </div>
                  <FormInput
                    label="Company"
                    value={formPotential.company || ''}
                    onChange={(v) => setFormPotential({ ...formPotential, company: v })}
                  />
                  <FormTextarea
                    label="What they're looking for / investing in"
                    value={formPotential.lookingFor || ''}
                    onChange={(v) => setFormPotential({ ...formPotential, lookingFor: v })}
                    placeholder="e.g., Looking for retail shopping centres in Gauteng, yield 9%+..."
                  />
                  <FormTextarea
                    label="Notes"
                    value={formPotential.notes || ''}
                    onChange={(v) => setFormPotential({ ...formPotential, notes: v })}
                  />
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput
                      label="Name"
                      value={formBuyer.name}
                      onChange={(v) => setFormBuyer({ ...formBuyer, name: v })}
                    />
                    <FormInput
                      label="Surname"
                      value={formBuyer.surname || ''}
                      onChange={(v) => setFormBuyer({ ...formBuyer, surname: v })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput
                      label="Email"
                      value={formBuyer.email || ''}
                      onChange={(v) => setFormBuyer({ ...formBuyer, email: v })}
                      type="email"
                    />
                    <FormInput
                      label="Contact Number"
                      value={formBuyer.contactNumber || ''}
                      onChange={(v) => setFormBuyer({ ...formBuyer, contactNumber: v })}
                    />
                  </div>
                  <FormInput
                    label="Company"
                    value={formBuyer.company || ''}
                    onChange={(v) => setFormBuyer({ ...formBuyer, company: v })}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput
                      label="Area"
                      value={formBuyer.area || ''}
                      onChange={(v) => setFormBuyer({ ...formBuyer, area: v })}
                      placeholder="e.g., Sandton, Cape Town CBD"
                    />
                    <FormInput
                      label="Category"
                      value={formBuyer.category || ''}
                      onChange={(v) => setFormBuyer({ ...formBuyer, category: v })}
                      placeholder="e.g., Retail, Industrial"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <FormInput
                      label="Zoning"
                      value={formBuyer.zoning || ''}
                      onChange={(v) => setFormBuyer({ ...formBuyer, zoning: v })}
                    />
                    <FormInput
                      label="Size (sqm)"
                      value={formBuyer.size || ''}
                      onChange={(v) => setFormBuyer({ ...formBuyer, size: v })}
                    />
                    <FormInput
                      label="Price"
                      value={formBuyer.price || ''}
                      onChange={(v) => setFormBuyer({ ...formBuyer, price: v })}
                      placeholder="e.g., R20m - R180m"
                    />
                  </div>
                  <FormTextarea
                    label="Description"
                    value={formBuyer.description || ''}
                    onChange={(v) => setFormBuyer({ ...formBuyer, description: v })}
                  />
                  <FormTextarea
                    label="What they're looking for / investing in"
                    value={formBuyer.lookingFor || ''}
                    onChange={(v) => setFormBuyer({ ...formBuyer, lookingFor: v })}
                  />
                  <FormTextarea
                    label="Comments"
                    value={formBuyer.comments || ''}
                    onChange={(v) => setFormBuyer({ ...formBuyer, comments: v })}
                  />
                </>
              )}

              {/* Asset Type tags */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
                  Asset Types
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PROPERTY_TYPE_OPTIONS.map((type) => {
                    const selected = (currentFormAssetTypes || []).includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleFormAssetType(type)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                            : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-stone-100 px-5 py-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <FiSave size={14} />
                {editingId ? 'Save Changes' : 'Add Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const KindChip: React.FC<{
  icon?: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, count, active, onClick }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
      active
        ? 'bg-indigo-100 text-indigo-700'
        : 'text-stone-600 hover:bg-stone-50'
    }`}
  >
    {icon}
    {label}
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
        active ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-600'
      }`}
    >
      {count}
    </span>
  </button>
);

const LinkedProperties: React.FC<{
  linkedIds: string[];
  propertyIndex: Map<string, PropertyRecord> | null;
  loading: boolean;
}> = ({ linkedIds, propertyIndex, loading }) => {
  if (linkedIds.length === 0) {
    return (
      <div className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
        No linked properties on this contact yet.
      </div>
    );
  }

  const resolved = propertyIndex
    ? linkedIds.map((id) => propertyIndex.get(id)).filter(Boolean) as PropertyRecord[]
    : [];

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1.5 flex items-center gap-2">
        <FiHome size={11} />
        Linked Properties ({linkedIds.length})
      </p>
      {loading && resolved.length === 0 ? (
        <p className="text-xs text-stone-400">Loading properties…</p>
      ) : resolved.length === 0 ? (
        <p className="text-xs text-stone-400">Property details unavailable.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {resolved.map((prop) => {
            const propertyName = prop.title || prop.address || 'Untitled property';
            return (
              <button
                key={prop.id}
                type="button"
                onClick={() =>
                  navigateToPage('Maps', {
                    kind: 'property',
                    id: prop.id,
                    name: propertyName,
                  })
                }
                className="text-left rounded-lg border border-stone-200 bg-white px-3 py-2 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors flex items-center gap-2 group"
                title="Open on Map"
              >
                <FiMapPin size={14} className="text-violet-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-stone-900 truncate group-hover:text-indigo-700">
                    {propertyName}
                  </p>
                  {prop.address && prop.address !== propertyName && (
                    <p className="text-[10px] text-stone-500 truncate">{prop.address}</p>
                  )}
                </div>
                <FiExternalLink
                  size={11}
                  className="text-stone-400 shrink-0 group-hover:text-indigo-500"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value?: string; full?: boolean }> = ({
  label,
  value,
  full,
}) => (
  <div className={full ? 'md:col-span-2' : ''}>
    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
    <p className="mt-0.5 text-xs text-stone-700 whitespace-pre-wrap">{value || '—'}</p>
  </div>
);

const FormInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}> = ({ label, value, onChange, type = 'text', placeholder }) => (
  <div>
    <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">
      {label}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  </div>
);

const FormTextarea: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <div>
    <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">
      {label}
    </label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  </div>
);

export default MasterDatabase;
