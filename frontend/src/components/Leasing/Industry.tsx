'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiTrash2, FiPlus, FiSearch } from 'react-icons/fi';
import { formatRand } from '@/lib/currency';
import { industryService, type IndustryRecord } from '@/services/industryService';

interface IndustryType {
  id: string;
  name: string;
  description: string;
  category: string;
  occupancyRate: number;
  averageRent: number;
  propertiesCount: number;
  status: 'Active' | 'Inactive' | 'Expanding';
}

const initialForm = {
  name: '',
  description: '',
  category: 'Commercial',
  occupancyRate: 50,
  averageRent: 0,
  status: 'Active' as IndustryType['status'],
};

const toIndustry = (record: IndustryRecord): IndustryType => {
  return {
    id: record.id,
    name: String(record.name || ''),
    description: String(record.description || ''),
    category: String(record.category || 'Commercial'),
    occupancyRate: Number(record.occupancyRate || 0),
    averageRent: Number(record.averageRent || 0),
    propertiesCount: 0,
    status: (record.status || 'Active') as IndustryType['status'],
  };
};

export const Industry: React.FC = () => {
  const [industries, setIndustries] = useState<IndustryType[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingIndustry, setEditingIndustry] = useState<IndustryType | null>(null);
  const [formData, setFormData] = useState({ ...initialForm });

  const refreshIndustries = async () => {
    const result = await industryService.getAllIndustries({ limit: 1000 });
    setIndustries(result.data.map(toIndustry));
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const result = await industryService.getAllIndustries({ limit: 1000 });
        if (!mounted) return;
        setIndustries(result.data.map(toIndustry));
      } catch {
        if (!mounted) return;
        setIndustries([]);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredIndustries = useMemo(
    () =>
      industries.filter((industry) => {
        const matchesSearch = industry.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = filterStatus === 'All' || industry.status === filterStatus;
        return matchesSearch && matchesStatus;
      }),
    [industries, searchQuery, filterStatus]
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800';
      case 'Expanding':
        return 'bg-blue-100 text-blue-800';
      case 'Inactive':
        return 'bg-stone-100 text-stone-800';
      default:
        return 'bg-stone-100 text-stone-800';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Commercial':
        return 'bg-purple-50 text-purple-700';
      case 'Office':
        return 'bg-blue-50 text-blue-700';
      case 'Specialty':
        return 'bg-green-50 text-green-700';
      case 'Industrial':
        return 'bg-orange-50 text-orange-700';
      default:
        return 'bg-stone-50 text-stone-700';
    }
  };

  const resetForm = () => {
    setFormData({ ...initialForm });
    setEditingIndustry(null);
  };

  const handleSaveIndustry = async () => {
    if (!formData.name || !formData.description) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const requestPayload = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        category: formData.category.trim() || undefined,
        occupancyRate: Number(formData.occupancyRate || 0),
        averageRent: Number(formData.averageRent || 0),
        status: formData.status,
      };

      if (editingIndustry) {
        await industryService.updateIndustry(editingIndustry.id, requestPayload);
      } else {
        await industryService.createIndustry(requestPayload);
      }

      await refreshIndustries();
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save industry');
    }
  };

  const handleEditIndustry = (industry: IndustryType) => {
    setEditingIndustry(industry);
    setFormData({
      name: industry.name,
      description: industry.description,
      category: industry.category,
      occupancyRate: industry.occupancyRate,
      averageRent: industry.averageRent,
      status: industry.status,
    });
    setShowAddModal(true);
  };

  const handleDeleteIndustry = async (id: string) => {
    if (!confirm('Are you sure you want to delete this industry?')) return;
    try {
      await industryService.deleteIndustry(id);
      await refreshIndustries();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete industry');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Industry Sectors</h2>
          <p className="text-stone-600 text-sm mt-1">
            Manage and track different industry sectors and their performance
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
          Add Industry
        </button>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-4">
                {editingIndustry ? 'Edit Industry Sector' : 'Add New Industry Sector'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Industry Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g., Technology, Retail, Healthcare"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Description *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Brief description of this industry sector"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Commercial</option>
                    <option>Office</option>
                    <option>Specialty</option>
                    <option>Industrial</option>
                  </select>
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
                    <option>Expanding</option>
                    <option>Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Average Occupancy Rate (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.occupancyRate}
                    onChange={(e) =>
                      setFormData({ ...formData, occupancyRate: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Average Rent (R/month)
                  </label>
                  <input
                    type="number"
                    value={formData.averageRent}
                    onChange={(e) =>
                      setFormData({ ...formData, averageRent: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="0"
                  />
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
                  onClick={handleSaveIndustry}
                  className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  {editingIndustry ? 'Save Changes' : 'Add Industry'}
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
              Search by industry name
            </label>
            <div className="relative">
              <FiSearch className="absolute left-3 top-3 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search industries..."
                className="w-full pl-10 pr-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option>All</option>
              <option>Active</option>
              <option>Expanding</option>
              <option>Inactive</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredIndustries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Industry Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Occupancy Rate
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Avg Rent
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Properties
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
                {filteredIndustries.map((industry) => (
                  <tr key={industry.id} className="hover:bg-stone-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      {industry.name}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(
                          industry.category
                        )}`}
                      >
                        {industry.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">{industry.description}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-12 bg-stone-200 rounded-full h-2">
                          <div
                            className="bg-violet-500 h-2 rounded-full"
                            style={{ width: `${industry.occupancyRate}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{industry.occupancyRate}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      {formatRand(industry.averageRent)}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      {industry.propertiesCount}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                          industry.status
                        )}`}
                      >
                        {industry.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditIndustry(industry)}
                          className="p-1 hover:bg-stone-100 rounded transition-colors"
                        >
                          <FiEdit2 size={16} className="text-stone-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteIndustry(industry.id)}
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
            <p>No industries found matching your search.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Sectors</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">{industries.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Active Sectors</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {industries.filter((industry) => industry.status === 'Active').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Expanding Sectors</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {industries.filter((industry) => industry.status === 'Expanding').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Avg Occupancy</p>
          <p className="text-2xl font-bold text-violet-600 mt-1">
            {industries.length > 0
              ? Math.round(
                  industries.reduce((sum, industry) => sum + industry.occupancyRate, 0) /
                    industries.length
                )
              : 0}
            %
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Properties</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">
            {industries.reduce((sum, industry) => sum + industry.propertiesCount, 0)}
          </p>
        </div>
      </div>
    </div>
  );
};
