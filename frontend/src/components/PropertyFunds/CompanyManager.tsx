'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiX,
  FiBriefcase,
  FiLink,
} from 'react-icons/fi';
import {
  customRecordService,
  type CustomRecord,
} from '@/services/customRecordService';

// ─── Types ───────────────────────────────────────────────────────────────────

type CompanyType =
  | 'Asset Manager'
  | 'Property Manager'
  | 'Developer'
  | 'Investor'
  | 'REIT'
  | 'Other';

type CompanyStatus = 'Active' | 'Inactive';

interface CompanyPayload {
  companyType: CompanyType;
  registrationNumber: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  linkedFundIds: string[];
  linkedFundNames: string[];
}

interface Company {
  id: string;
  name: string;
  companyType: CompanyType;
  registrationNumber: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  status: CompanyStatus;
  linkedFundIds: string[];
  linkedFundNames: string[];
  createdDate: string;
}

type FundOption = { id: string; name: string };

const ENTITY_TYPE = 'fund_company';

const COMPANY_TYPES: CompanyType[] = [
  'Asset Manager',
  'Property Manager',
  'Developer',
  'Investor',
  'REIT',
  'Other',
];

const emptyForm = {
  name: '',
  companyType: 'Asset Manager' as CompanyType,
  registrationNumber: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  status: 'Active' as CompanyStatus,
  linkedFundIds: [] as string[],
  linkedFundNames: [] as string[],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : [];

const toCompany = (record: CustomRecord<Record<string, unknown>>): Company => {
  const p = (record.payload || {}) as Partial<CompanyPayload>;
  return {
    id: record.id,
    name: record.name || '',
    companyType: (p.companyType || 'Other') as CompanyType,
    registrationNumber: String(p.registrationNumber || ''),
    contactPerson: String(p.contactPerson || ''),
    email: String(p.email || ''),
    phone: String(p.phone || ''),
    address: String(p.address || ''),
    status: (record.status || 'Active') as CompanyStatus,
    linkedFundIds: toStringArray(p.linkedFundIds),
    linkedFundNames: toStringArray(p.linkedFundNames),
    createdDate: new Date(record.createdAt).toISOString().split('T')[0],
  };
};

const getTypeColor = (type: CompanyType) => {
  switch (type) {
    case 'Asset Manager':   return 'bg-violet-100 text-violet-800';
    case 'Property Manager':return 'bg-blue-100 text-blue-800';
    case 'Developer':       return 'bg-amber-100 text-amber-800';
    case 'Investor':        return 'bg-emerald-100 text-emerald-800';
    case 'REIT':            return 'bg-rose-100 text-rose-800';
    default:                return 'bg-stone-100 text-stone-700';
  }
};

// ─── Component ───────────────────────────────────────────────────────────────

export const CompanyManager: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [fundSearch, setFundSearch] = useState('');
  const [showFundPicker, setShowFundPicker] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      const [companyResult, fundResult] = await Promise.all([
        customRecordService.getAllCustomRecords<Record<string, unknown>>({
          entityType: ENTITY_TYPE,
          limit: 1000,
        }),
        customRecordService.getAllCustomRecords<Record<string, unknown>>({
          entityType: 'fund',
          limit: 1000,
        }),
      ]);
      setCompanies(companyResult.data.map(toCompany));
      setFunds(
        fundResult.data.map((r) => ({ id: r.id, name: r.name || '' }))
      );
    } catch {
      setCompanies([]);
      setFunds([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    void loadData().then(() => { if (!mounted) return; });
    return () => { mounted = false; };
  }, []);

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.companyType.toLowerCase().includes(q) ||
        c.contactPerson.toLowerCase().includes(q) ||
        c.registrationNumber.toLowerCase().includes(q)
    );
  }, [companies, search]);

  const filteredFunds = useMemo(() => {
    const q = fundSearch.toLowerCase();
    return !q ? funds : funds.filter((f) => f.name.toLowerCase().includes(q));
  }, [funds, fundSearch]);

  // ── Modal helpers ─────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingCompany(null);
    setFormData({ ...emptyForm });
    setFundSearch('');
    setShowFundPicker(false);
    setShowModal(true);
  };

  const openEdit = (c: Company) => {
    setEditingCompany(c);
    setFormData({
      name: c.name,
      companyType: c.companyType,
      registrationNumber: c.registrationNumber,
      contactPerson: c.contactPerson,
      email: c.email,
      phone: c.phone,
      address: c.address,
      status: c.status,
      linkedFundIds: [...c.linkedFundIds],
      linkedFundNames: [...c.linkedFundNames],
    });
    setFundSearch('');
    setShowFundPicker(false);
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditingCompany(null);
    setShowFundPicker(false);
  };

  const handleField = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // ── Fund linking ──────────────────────────────────────────────────────────

  const toggleFund = (fund: FundOption) => {
    setFormData((prev) => {
      const alreadyLinked = prev.linkedFundIds.includes(fund.id);
      return {
        ...prev,
        linkedFundIds: alreadyLinked
          ? prev.linkedFundIds.filter((id) => id !== fund.id)
          : [...prev.linkedFundIds, fund.id],
        linkedFundNames: alreadyLinked
          ? prev.linkedFundNames.filter((n) => n !== fund.name)
          : [...prev.linkedFundNames, fund.name],
      };
    });
  };

  const removeFund = (fundId: string) => {
    setFormData((prev) => {
      const idx = prev.linkedFundIds.indexOf(fundId);
      const newIds = prev.linkedFundIds.filter((id) => id !== fundId);
      const newNames = [...prev.linkedFundNames];
      if (idx >= 0) newNames.splice(idx, 1);
      return { ...prev, linkedFundIds: newIds, linkedFundNames: newNames };
    });
  };

  // ── Save / Delete ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formData.name.trim()) return alert('Company name is required.');
    setSaving(true);
    try {
      const payload: CompanyPayload = {
        companyType: formData.companyType,
        registrationNumber: formData.registrationNumber.trim(),
        contactPerson: formData.contactPerson.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        linkedFundIds: [...formData.linkedFundIds],
        linkedFundNames: [...formData.linkedFundNames],
      };

      if (editingCompany) {
        await customRecordService.updateCustomRecord(editingCompany.id, {
          name: formData.name.trim(),
          status: formData.status,
          payload: payload as unknown as Record<string, unknown>,
        });
      } else {
        await customRecordService.createCustomRecord({
          entityType: ENTITY_TYPE,
          name: formData.name.trim(),
          status: formData.status,
          payload: payload as unknown as Record<string, unknown>,
        });
      }

      await loadData();
      closeModal();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save company');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this company? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await customRecordService.deleteCustomRecord(id);
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete company');
    } finally {
      setDeleting(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Companies</h2>
          <p className="text-stone-500 text-sm mt-1">
            Fund-linked companies — {companies.length} record{companies.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
        >
          <FiPlus size={16} />
          Add Company
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={15} />
        <input
          type="text"
          placeholder="Search companies, types, contacts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading companies…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-stone-50 rounded-xl border border-dashed border-stone-300">
          <FiBriefcase className="mx-auto text-stone-300 mb-3" size={40} />
          <p className="text-stone-500 font-medium">No companies found</p>
          <p className="text-stone-400 text-sm mt-1">
            Add companies to link them to funds and assets.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((company) => (
            <div
              key={company.id}
              className="bg-white rounded-xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Card header */}
              <div className="p-5 border-b border-stone-100">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FiBriefcase className="text-violet-500 flex-shrink-0" size={16} />
                    <h3 className="text-sm font-bold text-stone-900 truncate">{company.name}</h3>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(company)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:bg-violet-50 hover:text-violet-600 transition-colors"
                    >
                      <FiEdit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(company.id)}
                      disabled={deleting === company.id}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
                <span className={`mt-2 inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${getTypeColor(company.companyType)}`}>
                  {company.companyType}
                </span>
              </div>

              {/* Details */}
              <div className="p-5 space-y-2 text-xs">
                {company.registrationNumber && (
                  <div className="flex justify-between">
                    <span className="text-stone-400 uppercase tracking-wide font-medium">Reg #</span>
                    <span className="text-stone-800 font-semibold">{company.registrationNumber}</span>
                  </div>
                )}
                {company.contactPerson && (
                  <div className="flex justify-between">
                    <span className="text-stone-400 uppercase tracking-wide font-medium">Contact</span>
                    <span className="text-stone-800 font-semibold">{company.contactPerson}</span>
                  </div>
                )}
                {company.email && (
                  <div className="flex justify-between">
                    <span className="text-stone-400 uppercase tracking-wide font-medium">Email</span>
                    <span className="text-stone-800 font-semibold truncate max-w-[60%]">{company.email}</span>
                  </div>
                )}
                {company.phone && (
                  <div className="flex justify-between">
                    <span className="text-stone-400 uppercase tracking-wide font-medium">Phone</span>
                    <span className="text-stone-800 font-semibold">{company.phone}</span>
                  </div>
                )}
              </div>

              {/* Linked Funds */}
              <div className="px-5 pb-5">
                {company.linkedFundNames.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {company.linkedFundNames.map((fn, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-medium"
                      >
                        <FiLink size={10} />
                        {fn}
                      </span>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openEdit(company)}
                    className="text-xs text-violet-500 hover:underline italic"
                  >
                    + Link to fund
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50 flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold text-stone-950">
                  {editingCompany ? 'Edit Company' : 'Add Company'}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  {editingCompany ? 'Update company details' : 'Create a new fund-linked company'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="w-7 h-7 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors"
              >
                <FiX size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleField}
                  placeholder="e.g. Growthpoint Properties"
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>

              {/* Type + Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                    Company Type
                  </label>
                  <select
                    name="companyType"
                    value={formData.companyType}
                    onChange={handleField}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                  >
                    {COMPANY_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                    Status
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleField}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Registration */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                  Registration Number
                </label>
                <input
                  type="text"
                  name="registrationNumber"
                  value={formData.registrationNumber}
                  onChange={handleField}
                  placeholder="e.g. 1987/004988/06"
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>

              {/* Contact Person + Phone */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    name="contactPerson"
                    value={formData.contactPerson}
                    onChange={handleField}
                    placeholder="Full name"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                    Phone
                  </label>
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleField}
                    placeholder="+27 11 000 0000"
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleField}
                  placeholder="info@company.co.za"
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                  Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleField}
                  placeholder="Head office address"
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>

              {/* Link Funds */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                  Linked Funds
                </label>

                {/* Selected funds */}
                {formData.linkedFundNames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {formData.linkedFundNames.map((fn, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 text-xs bg-violet-50 text-violet-700 border border-violet-200 pl-2 pr-1 py-0.5 rounded-full font-medium"
                      >
                        <FiLink size={10} />
                        {fn}
                        <button
                          type="button"
                          onClick={() => removeFund(formData.linkedFundIds[i])}
                          className="ml-0.5 text-violet-400 hover:text-violet-700"
                        >
                          <FiX size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Fund picker toggle */}
                <button
                  type="button"
                  onClick={() => setShowFundPicker((v) => !v)}
                  className="text-xs text-violet-600 hover:underline font-medium flex items-center gap-1"
                >
                  <FiPlus size={12} />
                  {showFundPicker ? 'Hide fund list' : 'Link a fund'}
                </button>

                {showFundPicker && (
                  <div className="mt-2 border border-stone-200 rounded-lg overflow-hidden">
                    <div className="relative">
                      <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={13} />
                      <input
                        type="text"
                        placeholder="Search funds…"
                        value={fundSearch}
                        onChange={(e) => setFundSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-xs border-b border-stone-200 focus:outline-none"
                      />
                    </div>
                    <ul className="max-h-40 overflow-y-auto">
                      {filteredFunds.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-stone-400 italic">No funds found</li>
                      ) : (
                        filteredFunds.map((fund) => {
                          const linked = formData.linkedFundIds.includes(fund.id);
                          return (
                            <li key={fund.id}>
                              <button
                                type="button"
                                onClick={() => toggleFund(fund)}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-violet-50 flex items-center justify-between ${
                                  linked ? 'bg-violet-50 text-violet-700 font-medium' : 'text-stone-700'
                                }`}
                              >
                                <span>{fund.name}</span>
                                {linked && <span className="text-violet-500 text-xs">✓</span>}
                              </button>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-stone-100 bg-stone-50 flex-shrink-0">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-violet-500 hover:bg-violet-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? 'Saving…' : editingCompany ? 'Save Changes' : 'Create Company'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
