'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiTrash2, FiPlus, FiSearch } from 'react-icons/fi';
import { landlordService, type LandlordRecord } from '@/services/landlordService';

interface Landlord {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  commissionsEarned: number;
  commissionRate: number;
  paymentTerms: string;
  agreementDate: string;
  status: 'Found' | 'Private';
  notes: string;
}

type LandlordPayload = Omit<Landlord, 'id'>;

const initialForm = {
  companyName: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  commissionsEarned: 0,
  commissionRate: 0,
  paymentTerms: 'Monthly',
  agreementDate: new Date().toISOString().split('T')[0],
  status: 'Found' as Landlord['status'],
  notes: '',
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const toLandlord = (record: LandlordRecord): Landlord => {
  const payload = toRecord(record.details) as Partial<LandlordPayload>;
  return {
    id: record.id,
    companyName: String(record.name || payload.companyName || ''),
    contactPerson: String(record.contact || payload.contactPerson || ''),
    email: String(record.email || payload.email || ''),
    phone: String(record.phone || payload.phone || ''),
    address: String(record.address || payload.address || ''),
    commissionsEarned: Number(payload.commissionsEarned || 0),
    commissionRate: Number(payload.commissionRate || 0),
    paymentTerms: String(payload.paymentTerms || 'Monthly'),
    agreementDate: String(
      payload.agreementDate || new Date(record.createdAt).toISOString().split('T')[0]
    ),
    status: (record.status || payload.status || 'Found') as Landlord['status'],
    notes: String(record.notes || payload.notes || ''),
  };
};

export const Landlords: React.FC = () => {
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLandlord, setEditingLandlord] = useState<Landlord | null>(null);
  const [formData, setFormData] = useState({ ...initialForm });

  const refreshLandlords = async () => {
    const result = await landlordService.getAllLandlords({ limit: 1000 });
    setLandlords(result.data.map(toLandlord));
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const result = await landlordService.getAllLandlords({ limit: 1000 });
        if (!mounted) return;
        setLandlords(result.data.map(toLandlord));
      } catch {
        if (!mounted) return;
        setLandlords([]);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredLandlords = useMemo(
    () =>
      landlords.filter((landlord) => {
        const matchesSearch = landlord.companyName
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        const matchesStatus = filterStatus === 'All' || landlord.status === filterStatus;
        return matchesSearch && matchesStatus;
      }),
    [landlords, searchQuery, filterStatus]
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Found':
        return 'bg-green-100 text-green-800';
      case 'Private':
        return 'bg-stone-100 text-stone-800';
      default:
        return 'bg-stone-100 text-stone-800';
    }
  };

  const resetForm = () => {
    setFormData({ ...initialForm });
    setEditingLandlord(null);
  };

  const handleSaveLandlord = async () => {
    if (!formData.companyName || !formData.email) {
      alert('Please fill in company name and email fields');
      return;
    }

    const payload: LandlordPayload = {
      ...formData,
    };

    try {
      const requestPayload = {
        name: formData.companyName.trim(),
        contact: formData.contactPerson.trim() || undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        status: formData.status,
        notes: formData.notes.trim() || undefined,
        details: payload,
      };

      if (editingLandlord) {
        await landlordService.updateLandlord(editingLandlord.id, requestPayload);
      } else {
        await landlordService.createLandlord(requestPayload);
      }

      await refreshLandlords();
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save landlord');
    }
  };

  const handleEditLandlord = (landlord: Landlord) => {
    setEditingLandlord(landlord);
    setFormData({
      companyName: landlord.companyName,
      contactPerson: landlord.contactPerson,
      email: landlord.email,
      phone: landlord.phone,
      address: landlord.address,
      commissionsEarned: landlord.commissionsEarned,
      commissionRate: landlord.commissionRate,
      paymentTerms: landlord.paymentTerms,
      agreementDate: landlord.agreementDate,
      status: landlord.status,
      notes: landlord.notes,
    });
    setShowAddModal(true);
  };

  const handleDeleteLandlord = async (id?: string) => {
    if (!id) return;
    if (!confirm('Are you sure you want to delete this landlord?')) return;
    try {
      await landlordService.deleteLandlord(id);
      await refreshLandlords();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete landlord');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Landlords</h2>
          <p className="text-stone-600 text-sm mt-1">
            Manage landlord agreements and commissions
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
          Add Landlord
        </button>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-4">
                {editingLandlord ? 'Edit Landlord' : 'Add New Landlord'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Contact person name"
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
                    Address
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Commissions Earned (R)
                  </label>
                  <input
                    type="number"
                    value={formData.commissionsEarned}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        commissionsEarned: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Commissions earned"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Commission Rate (%)
                  </label>
                  <input
                    type="number"
                    value={formData.commissionRate}
                    onChange={(e) =>
                      setFormData({ ...formData, commissionRate: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Payment Terms
                  </label>
                  <input
                    type="text"
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Monthly"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Agreement Date
                  </label>
                  <input
                    type="date"
                    value={formData.agreementDate}
                    onChange={(e) => setFormData({ ...formData, agreementDate: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                    <option>Found</option>
                    <option>Private</option>
                  </select>
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
                  onClick={handleSaveLandlord}
                  className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  {editingLandlord ? 'Save Changes' : 'Add Landlord'}
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
              Search by company name
            </label>
            <div className="relative">
              <FiSearch className="absolute left-3 top-3 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search landlords..."
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
              <option>Found</option>
              <option>Private</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredLandlords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Company Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Contact Person
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Commission Rate
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Payment Terms
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Agreement Date
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
                {filteredLandlords.map((landlord) => (
                  <tr key={landlord.id} className="hover:bg-stone-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      {landlord.companyName}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      {landlord.contactPerson || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">{landlord.email}</td>
                    <td className="px-6 py-4 text-sm text-stone-600">{landlord.phone}</td>
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      {landlord.commissionRate}%
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">{landlord.paymentTerms}</td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      {new Date(landlord.agreementDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                          landlord.status
                        )}`}
                      >
                        {landlord.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditLandlord(landlord)}
                          className="p-1 hover:bg-stone-100 rounded transition-colors"
                        >
                          <FiEdit2 size={16} className="text-stone-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteLandlord(landlord.id)}
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
            <p>No landlords found matching your search.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Landlords</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">{landlords.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Found Landlords</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {landlords.filter((landlord) => landlord.status === 'Found').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Avg Commission Rate</p>
          <p className="text-2xl font-bold text-violet-600 mt-1">
            {(
              landlords.reduce((sum, landlord) => sum + landlord.commissionRate, 0) /
              Math.max(landlords.length, 1)
            ).toFixed(1)}
            %
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Private Landlords</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {landlords.filter((landlord) => landlord.status === 'Private').length}
          </p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>Note:</strong> Bank account information is stored securely.
          Contact admin for sensitive data access.
        </p>
      </div>
    </div>
  );
};
