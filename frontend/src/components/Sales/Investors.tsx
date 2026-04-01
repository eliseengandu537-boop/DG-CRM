'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiTrash2, FiPlus, FiSearch } from 'react-icons/fi';
import { formatRand } from '@/lib/currency';
import { customRecordService, type CustomRecord } from '@/services/customRecordService';

interface Investor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  investmentType: 'Individual' | 'Institutional' | 'Fund' | 'REIT' | 'Partnership';
  investmentRange: string;
  focusAreas: string[];
  status: 'Active' | 'Inactive' | 'Reviewing';
  totalInvested: number;
  createdDate: string;
  lastContactDate: string;
  linkedDeals: string[];
  linkedProperties: string[];
  notes: string;
}

type InvestorPayload = Omit<Investor, 'id' | 'createdDate' | 'lastContactDate'>;

const ENTITY_TYPE = 'investor';

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  investmentType: 'Individual' as Investor['investmentType'],
  investmentRange: '',
  focusAreas: [] as string[],
  status: 'Active' as Investor['status'],
  totalInvested: 0,
};

const toInvestor = (record: CustomRecord<Record<string, unknown>>): Investor => {
  const payload = (record.payload || {}) as Partial<InvestorPayload>;
  return {
    id: record.id,
    firstName: String(payload.firstName || ''),
    lastName: String(payload.lastName || ''),
    email: String(payload.email || ''),
    phone: String(payload.phone || ''),
    company: String(payload.company || ''),
    investmentType: (payload.investmentType || 'Individual') as Investor['investmentType'],
    investmentRange: String(payload.investmentRange || ''),
    focusAreas: Array.isArray(payload.focusAreas) ? payload.focusAreas.map(String) : [],
    status: (record.status || payload.status || 'Active') as Investor['status'],
    totalInvested: Number(payload.totalInvested || 0),
    createdDate: new Date(record.createdAt).toISOString().split('T')[0],
    lastContactDate: new Date(record.updatedAt).toISOString().split('T')[0],
    linkedDeals: Array.isArray(payload.linkedDeals) ? payload.linkedDeals.map(String) : [],
    linkedProperties: Array.isArray(payload.linkedProperties)
      ? payload.linkedProperties.map(String)
      : [],
    notes: String(payload.notes || ''),
  };
};

export const Investors: React.FC = () => {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState<Investor | null>(null);
  const [formData, setFormData] = useState({ ...initialForm });

  const refreshInvestors = async () => {
    const result = await customRecordService.getAllCustomRecords<Record<string, unknown>>({
      entityType: ENTITY_TYPE,
      limit: 1000,
    });
    setInvestors(result.data.map(toInvestor));
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const result = await customRecordService.getAllCustomRecords<Record<string, unknown>>({
          entityType: ENTITY_TYPE,
          limit: 1000,
        });
        if (!mounted) return;
        setInvestors(result.data.map(toInvestor));
      } catch {
        if (!mounted) return;
        setInvestors([]);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredInvestors = useMemo(
    () =>
      investors.filter((investor) => {
        const fullName = `${investor.firstName} ${investor.lastName}`.trim();
        const matchesSearch =
          fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          investor.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          investor.company?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = filterType === 'All' || investor.investmentType === filterType;
        return matchesSearch && matchesType;
      }),
    [investors, searchQuery, filterType]
  );

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Individual':
        return 'bg-blue-100 text-blue-800';
      case 'Institutional':
        return 'bg-purple-100 text-purple-800';
      case 'Fund':
        return 'bg-green-100 text-green-800';
      case 'REIT':
        return 'bg-orange-100 text-orange-800';
      case 'Partnership':
        return 'bg-pink-100 text-pink-800';
      default:
        return 'bg-stone-100 text-stone-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return 'text-green-600';
      case 'Inactive':
        return 'text-yellow-600';
      case 'Reviewing':
        return 'text-blue-600';
      default:
        return 'text-stone-600';
    }
  };

  const resetForm = () => {
    setFormData({ ...initialForm });
    setEditingInvestor(null);
  };

  const handleSaveInvestor = async () => {
    if (!formData.firstName || !formData.email || !formData.investmentRange) {
      alert('Please fill in the required fields');
      return;
    }
    if (formData.focusAreas.length === 0) {
      alert('Please select at least one focus area');
      return;
    }

    const payload: InvestorPayload = {
      ...formData,
      linkedDeals: editingInvestor?.linkedDeals || [],
      linkedProperties: editingInvestor?.linkedProperties || [],
      notes: editingInvestor?.notes || '',
    };

    try {
      if (editingInvestor) {
        await customRecordService.updateCustomRecord(editingInvestor.id, {
          name: `${formData.firstName} ${formData.lastName}`.trim(),
          status: formData.status,
          category: formData.investmentType,
          referenceId: formData.email.trim(),
          payload,
        });
      } else {
        await customRecordService.createCustomRecord({
          entityType: ENTITY_TYPE,
          name: `${formData.firstName} ${formData.lastName}`.trim(),
          status: formData.status,
          category: formData.investmentType,
          referenceId: formData.email.trim(),
          payload,
        });
      }

      await refreshInvestors();
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save investor');
    }
  };

  const handleEditInvestor = (investor: Investor) => {
    setEditingInvestor(investor);
    setFormData({
      firstName: investor.firstName,
      lastName: investor.lastName,
      email: investor.email,
      phone: investor.phone,
      company: investor.company || '',
      investmentType: investor.investmentType,
      investmentRange: investor.investmentRange,
      focusAreas: investor.focusAreas || [],
      status: investor.status,
      totalInvested: investor.totalInvested || 0,
    });
    setShowAddModal(true);
  };

  const handleDeleteInvestor = async (id: string) => {
    if (!confirm('Are you sure you want to delete this investor?')) return;
    try {
      await customRecordService.deleteCustomRecord(id);
      await refreshInvestors();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete investor');
    }
  };

  const focusAreaOptions = [
    'Residential',
    'Commercial',
    'Industrial',
    'Mixed-Use',
    'Office',
    'Retail',
    'Healthcare',
    'Hospitality',
  ];

  const toggleFocusArea = (area: string) => {
    setFormData((current) => ({
      ...current,
      focusAreas: current.focusAreas.includes(area)
        ? current.focusAreas.filter((item) => item !== area)
        : [...current.focusAreas, area],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Investor Database</h2>
          <p className="text-stone-600 text-sm mt-1">
            Manage investor relationships and capital sources
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FiPlus size={18} />
          Add Investor
        </button>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-1">
                {editingInvestor ? 'Edit Investor' : 'Add New Investor'}
              </h3>
              <p className="text-stone-600 text-sm mb-6">Fill in the investor details below</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Last name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Email"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Phone number"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Company
                  </label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Investment Type
                  </label>
                  <select
                    value={formData.investmentType}
                    onChange={(e) =>
                      setFormData({ ...formData, investmentType: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Individual</option>
                    <option>Institutional</option>
                    <option>Fund</option>
                    <option>REIT</option>
                    <option>Partnership</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Investment Range *
                  </label>
                  <input
                    type="text"
                    value={formData.investmentRange}
                    onChange={(e) =>
                      setFormData({ ...formData, investmentRange: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g., R 1M - R 10M"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Total Invested (R)
                  </label>
                  <input
                    type="number"
                    value={formData.totalInvested}
                    onChange={(e) =>
                      setFormData({ ...formData, totalInvested: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Active</option>
                    <option>Inactive</option>
                    <option>Reviewing</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Focus Areas * (Select at least one)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {focusAreaOptions.map((area) => (
                      <button
                        key={area}
                        onClick={() => toggleFocusArea(area)}
                        className={`p-2 px-3 rounded text-sm font-medium transition-colors ${
                          formData.focusAreas.includes(area)
                            ? 'bg-violet-500 text-white'
                            : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                        }`}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6 justify-end">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveInvestor}
                  className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  {editingInvestor ? 'Save Changes' : 'Add Investor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-64">
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Search by name, email, or company
            </label>
            <div className="relative">
              <FiSearch className="absolute left-3 top-3 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search investors..."
                className="w-full pl-10 pr-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Investor Type
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option>All</option>
              <option>Individual</option>
              <option>Institutional</option>
              <option>Fund</option>
              <option>REIT</option>
              <option>Partnership</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredInvestors.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Investment Range
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Total Invested
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Focus Areas
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredInvestors.map((investor) => (
                  <tr key={investor.id} className="hover:bg-stone-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      {investor.firstName} {investor.lastName}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">{investor.email}</td>
                    <td className="px-6 py-4 text-sm text-stone-600">{investor.phone}</td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      {investor.company || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(
                          investor.investmentType
                        )}`}
                      >
                        {investor.investmentType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      {investor.investmentRange}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      {formatRand(investor.totalInvested)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {investor.focusAreas.map((area) => (
                          <span
                            key={area}
                            className="text-xs bg-stone-100 text-stone-700 px-2 py-1 rounded"
                          >
                            {area}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={`px-6 py-4 text-sm font-medium ${getStatusColor(investor.status)}`}>
                      {investor.status}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditInvestor(investor)}
                          className="p-1 hover:bg-stone-100 rounded transition-colors"
                        >
                          <FiEdit2 size={16} className="text-stone-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteInvestor(investor.id)}
                          className="p-1 hover:bg-stone-100 rounded transition-colors"
                        >
                          <FiTrash2 size={16} className="text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-stone-500">
            <p>No investors found matching your search.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Investors</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">{investors.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Active Investors</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {investors.filter((investor) => investor.status === 'Active').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Capital Deployed</p>
          <p className="text-2xl font-bold text-violet-600 mt-1">
            {formatRand(investors.reduce((sum, investor) => sum + investor.totalInvested, 0))}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Avg Investment</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {formatRand(
              investors.reduce((sum, investor) => sum + investor.totalInvested, 0) /
                Math.max(investors.length, 1)
            )}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">With Active Deals</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">
            {investors.filter((investor) => investor.linkedDeals.length > 0).length}
          </p>
        </div>
      </div>
    </div>
  );
};

