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
} from 'react-icons/fi';
import { useAuth } from '@/context/AuthContext';
import {
  customRecordService,
  type CustomRecord,
} from '@/services/customRecordService';
import { PROPERTY_TYPE_OPTIONS } from '@/lib/propertyTypes';

type Tab = 'potential' | 'buyers';

const ENTITY_TYPE: Record<Tab, string> = {
  potential: 'master_db_potential',
  buyers: 'master_db_buyer',
};

interface PotentialPayload {
  name: string;
  surname?: string;
  email?: string;
  contactNumber?: string;
  altContactNumber?: string;
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

function isBuyer(rec: AnyRecord): rec is CustomRecord<BuyerPayload> {
  return rec.entityType === ENTITY_TYPE.buyers;
}

function toCsv(records: AnyRecord[], tab: Tab): string {
  if (tab === 'potential') {
    const header = [
      'Name',
      'Surname',
      'Email',
      'Contact Number',
      'Alt Contact Number',
      'Asset Types',
      'Looking For',
      'Notes',
    ];
    const rows = records.map((r) => {
      const p = r.payload as PotentialPayload;
      return [
        p.name || '',
        p.surname || '',
        p.email || '',
        p.contactNumber || '',
        p.altContactNumber || '',
        (p.assetTypes || []).join('; '),
        p.lookingFor || '',
        p.notes || '',
      ];
    });
    return toCsvString([header, ...rows]);
  }
  const header = [
    'Name',
    'Surname',
    'Email',
    'Contact Number',
    'Company',
    'Area',
    'Category',
    'Zoning',
    'Size',
    'Price',
    'Description',
    'Asset Types',
    'Looking For',
    'Comments',
  ];
  const rows = records.map((r) => {
    const p = r.payload as BuyerPayload;
    return [
      p.name || '',
      p.surname || '',
      p.email || '',
      p.contactNumber || '',
      p.company || '',
      p.area || '',
      p.category || '',
      p.zoning || '',
      p.size || '',
      p.price || '',
      p.description || '',
      (p.assetTypes || []).join('; '),
      p.lookingFor || '',
      p.comments || '',
    ];
  });
  return toCsvString([header, ...rows]);
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

const MasterDatabase: React.FC = () => {
  const { user } = useAuth();
  const isPrivileged = user?.role === 'admin' || user?.role === 'manager';
  const canEdit = isPrivileged;

  const [activeTab, setActiveTab] = useState<Tab>('potential');
  const [potentialRecords, setPotentialRecords] = useState<AnyRecord[]>([]);
  const [buyerRecords, setBuyerRecords] = useState<AnyRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);
  const [showAssetTypeFilter, setShowAssetTypeFilter] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formPotential, setFormPotential] = useState<PotentialPayload>(emptyPotential);
  const [formBuyer, setFormBuyer] = useState<BuyerPayload>(emptyBuyer);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
          limit: 2000,
        }),
        customRecordService.getAllCustomRecords<AnyPayload>({
          entityType: ENTITY_TYPE.buyers,
          limit: 2000,
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

  const records = activeTab === 'potential' ? potentialRecords : buyerRecords;

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((r) => {
      const p = r.payload as AnyPayload;
      if (selectedAssetTypes.length > 0) {
        const types = (p.assetTypes || []).map((t) => t.toLowerCase());
        const matchesAsset = selectedAssetTypes.some((sel) => types.includes(sel.toLowerCase()));
        if (!matchesAsset) return false;
      }
      if (!q) return true;
      const haystack = [
        p.name,
        p.surname,
        p.email,
        p.contactNumber,
        (p as BuyerPayload).company,
        (p as BuyerPayload).area,
        (p as BuyerPayload).description,
        p.lookingFor,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [records, searchQuery, selectedAssetTypes]);

  const handleStartAdd = useCallback(() => {
    setEditingId(null);
    setFormPotential(emptyPotential);
    setFormBuyer(emptyBuyer);
    setShowAddModal(true);
  }, []);

  const handleStartEdit = useCallback(
    (record: AnyRecord) => {
      setEditingId(record.id);
      if (isBuyer(record)) {
        setFormBuyer({ ...emptyBuyer, ...(record.payload as BuyerPayload) });
      } else {
        setFormPotential({ ...emptyPotential, ...(record.payload as PotentialPayload) });
      }
      setShowAddModal(true);
    },
    []
  );

  const handleSave = useCallback(async () => {
    const payload = activeTab === 'potential' ? formPotential : formBuyer;
    const displayName = `${payload.name || ''} ${payload.surname || ''}`.trim() || payload.email || 'Untitled';

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
          entityType: ENTITY_TYPE[activeTab],
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
  }, [activeTab, editingId, formPotential, formBuyer, loadData, showNotification]);

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
    const tabLabel = activeTab === 'potential' ? 'potential-bs' : 'buyers-looking';
    downloadCsv(`master-database-${tabLabel}-${stamp}.csv`, toCsv(filteredRecords, activeTab));
  }, [activeTab, filteredRecords, isPrivileged]);

  const toggleAssetTypeFilter = useCallback((type: string) => {
    setSelectedAssetTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

  const toggleFormAssetType = useCallback(
    (type: string) => {
      if (activeTab === 'potential') {
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
    [activeTab]
  );

  const counts = {
    potential: potentialRecords.length,
    buyers: buyerRecords.length,
  };

  const currentFormAssetTypes =
    activeTab === 'potential' ? formPotential.assetTypes : formBuyer.assetTypes;

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
            Investor list, potential buyers & sellers, and active buyer briefs.
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-stone-200">
        <TabButton
          icon={<FiUsers size={14} />}
          label="Potential B&S"
          count={counts.potential}
          active={activeTab === 'potential'}
          onClick={() => {
            setActiveTab('potential');
            setExpandedId(null);
          }}
        />
        <TabButton
          icon={<FiTarget size={14} />}
          label="Buyers Looking"
          count={counts.buyers}
          active={activeTab === 'buyers'}
          onClick={() => {
            setActiveTab('buyers');
            setExpandedId(null);
          }}
        />
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
          {filteredRecords.length} of {records.length} {records.length === 1 ? 'record' : 'records'}
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
              {records.length === 0
                ? 'No records yet. Add your first contact.'
                : 'No records match your filters.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {filteredRecords.map((record) => {
              const p = record.payload as AnyPayload;
              const isExpanded = expandedId === record.id;
              return (
                <div key={record.id} className="px-4 py-3">
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : record.id)}
                    className="flex items-start gap-4 cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-900 truncate">
                        {`${p.name || ''} ${p.surname || ''}`.trim() || p.email || 'Unnamed'}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-stone-500">
                        {p.email && <span>📧 {p.email}</span>}
                        {p.contactNumber && <span>📞 {p.contactNumber}</span>}
                        {isBuyer(record) && (record.payload as BuyerPayload).area && (
                          <span>📍 {(record.payload as BuyerPayload).area}</span>
                        )}
                        {isBuyer(record) && (record.payload as BuyerPayload).price && (
                          <span>💰 {(record.payload as BuyerPayload).price}</span>
                        )}
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
                    <div className="mt-3 pl-0 pr-0 py-3 border-t border-stone-100 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      {isBuyer(record) ? (
                        <>
                          <Field label="Company" value={(record.payload as BuyerPayload).company} />
                          <Field label="Area" value={(record.payload as BuyerPayload).area} />
                          <Field label="Category" value={(record.payload as BuyerPayload).category} />
                          <Field label="Zoning" value={(record.payload as BuyerPayload).zoning} />
                          <Field label="Size" value={(record.payload as BuyerPayload).size} />
                          <Field label="Price" value={(record.payload as BuyerPayload).price} />
                          <Field
                            label="Description"
                            value={(record.payload as BuyerPayload).description}
                            full
                          />
                          <Field
                            label="What they're looking for"
                            value={(record.payload as BuyerPayload).lookingFor}
                            full
                          />
                          <Field
                            label="Comments"
                            value={(record.payload as BuyerPayload).comments}
                            full
                          />
                        </>
                      ) : (
                        <>
                          <Field
                            label="Alt Contact Number"
                            value={(record.payload as PotentialPayload).altContactNumber}
                          />
                          <Field
                            label="What they're looking for / investing in"
                            value={(record.payload as PotentialPayload).lookingFor}
                            full
                          />
                          <Field
                            label="Notes"
                            value={(record.payload as PotentialPayload).notes}
                            full
                          />
                        </>
                      )}
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
                {editingId ? 'Edit' : 'Add'} {activeTab === 'potential' ? 'Potential B&S Contact' : 'Buyer Brief'}
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-4">
              {activeTab === 'potential' ? (
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
                      onChange={(v) => setFormPotential({ ...formPotential, contactNumber: v })}
                    />
                    <FormInput
                      label="Alt Contact Number"
                      value={formPotential.altContactNumber || ''}
                      onChange={(v) => setFormPotential({ ...formPotential, altContactNumber: v })}
                    />
                  </div>
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

const TabButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, count, active, onClick }) => (
  <button
    onClick={onClick}
    className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? 'border-indigo-600 text-indigo-700'
        : 'border-transparent text-stone-500 hover:text-stone-800'
    }`}
  >
    {icon}
    {label}
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
        active ? 'bg-indigo-100 text-indigo-700' : 'bg-stone-100 text-stone-600'
      }`}
    >
      {count}
    </span>
  </button>
);

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
