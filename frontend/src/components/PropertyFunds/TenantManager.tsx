'use client';

import React, { useEffect, useState } from 'react';
import { Tenant, Lead } from '../../data/crm-types';
import { FiPlus, FiEdit2, FiTrash2, FiUser } from 'react-icons/fi';
import { formatRand, roundMoney } from '@/lib/currency';
import {
  mapTenantRecordToPropertyFundsTenant,
  serializePropertyFundsTenant,
  tenantService,
} from '@/services/tenantService';
import { leadService } from '@/services/leadService';
import {
  mapStockRecordToLeasingStock,
  stockService,
} from '@/services/stockService';
import { customRecordService } from '@/services/customRecordService';

const toDealStatus = (status: string) => {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'new' || value === 'contacted') return 'pending';
  return 'active';
};

export const TenantManager: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [assets, setAssets] = useState<Array<{ id: string; name: string }>>([]);
  const [stockItems, setStockItems] = useState<Array<{ id: string; name: string; assetId: string; address?: string }>>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    businessName: '',
    email: '',
    phone: '',
    linkedAssetId: '',
    linkedStockItemId: '',
    leaseStartDate: '',
    leaseEndDate: '',
    monthlyRent: 0,
    status: 'Prospect' as 'Active' | 'Prospect' | 'Inactive',
    leaseStatus: 'Pending' as 'Active' | 'Pending' | 'Expired' | 'Cancelled',
  });

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        const [tenantResult, leadResult, assetResult, stockResult] = await Promise.all([
          tenantService.getAllTenants({ limit: 1000 }),
          leadService.getAllLeads({ limit: 1000 }),
          customRecordService.getAllCustomRecords<Record<string, unknown>>({
            entityType: 'asset',
            limit: 1000,
          }),
          stockService.getAllStockItems({ module: 'leasing', limit: 1000 }),
        ]);
        if (!mounted) return;
        setTenants(tenantResult.data.map((tenant) => mapTenantRecordToPropertyFundsTenant(tenant)));
        setLeads(
          leadResult.data
            .filter((lead) => String(lead.leadSource || '').toLowerCase() === 'tenant')
            .map((lead) => ({
              id: lead.id,
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              businessName: lead.company || '',
              linkedAssetId: (lead as any).propertyId || '',
              leadSource: (lead.leadSource as Lead['leadSource']) || 'Tenant',
              status: (lead.status as Lead['status']) || 'Qualified',
              value: lead.value || 0,
              createdDate: new Date(lead.createdAt).toISOString().split('T')[0],
              lastContactDate: new Date(lead.updatedAt).toISOString().split('T')[0],
              notes: lead.notes || '',
            }))
        );
        setAssets(assetResult.data.map((record) => ({ id: record.id, name: record.name })));
        setStockItems(
          stockResult.data.map((item) => {
            const mapped = mapStockRecordToLeasingStock(item);
            return {
              id: mapped.id,
              name: mapped.centreItemName || mapped.itemName || 'Unit',
              assetId: item.propertyId,
              address: mapped.location || mapped.address || '',
            };
          })
        );
      } catch {
        if (!mounted) return;
        setTenants([]);
        setLeads([]);
        setAssets([]);
        setStockItems([]);
      }
    };

    void loadData();
    return () => {
      mounted = false;
    };
  }, []);

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      businessName: '',
      email: '',
      phone: '',
      linkedAssetId: '',
      linkedStockItemId: '',
      leaseStartDate: '',
      leaseEndDate: '',
      monthlyRent: 0,
      status: 'Prospect',
      leaseStatus: 'Pending',
    });
    setSelectedTenant(null);
  };

  const handleCreateTenant = async () => {
    if (!formData.firstName || !formData.lastName || !formData.linkedAssetId) {
      alert('Please fill all required fields');
      return;
    }

    try {
      const payload = serializePropertyFundsTenant(formData);
      const selectedStockItem = formData.linkedStockItemId
        ? stockItems.find((stock) => stock.id === formData.linkedStockItemId)
        : null;

      if (formData.linkedStockItemId && !selectedStockItem) {
        throw new Error('Selected stock item could not be found.');
      }

      const shouldSyncWorkflow = Boolean(selectedStockItem);

      if (selectedTenant) {
        const updated = await tenantService.updateTenant(selectedTenant.id, payload);
        const updatedTenant = mapTenantRecordToPropertyFundsTenant(updated);

        const existingLead = leads.find((lead) => lead.linkedTenantId === selectedTenant.id);
        const leadPayload = {
          name: `${formData.firstName} ${formData.lastName}`.trim(),
          email: formData.email,
          phone: formData.phone,
          company: formData.businessName,
          leadSource: 'Tenant',
          status: formData.status === 'Active' ? 'Converted' : 'Qualified',
          value: roundMoney(formData.monthlyRent * 12),
          linkedStockId: formData.linkedStockItemId || undefined,
          linkedTenantId: selectedTenant.id,
          linkedAssetId: formData.linkedAssetId,
          propertyId: formData.linkedAssetId,
          notes: `Tenant record synced from Property Funds. Lease status: ${formData.leaseStatus}.`,
        };

        const syncedLead = existingLead
          ? await leadService.updateLead(existingLead.id, leadPayload)
          : await leadService.createLead(leadPayload);

        if (shouldSyncWorkflow) {
          await syncTenantWorkflow(syncedLead.id, leadPayload, selectedStockItem);
        }

        const refreshedLeads = await leadService.getAllLeads({ limit: 1000 });
        setTenants(tenants.map((t) => (t.id === selectedTenant.id ? updatedTenant : t)));
        setLeads(
          refreshedLeads.data
            .filter((lead) => String(lead.leadSource || '').toLowerCase() === 'tenant')
            .map((lead) => ({
              id: lead.id,
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              businessName: lead.company || '',
              linkedAssetId: (lead as any).propertyId || '',
              linkedTenantId: (lead as any).linkedTenantId || lead.linkedStockId || '',
              leadSource: (lead.leadSource as Lead['leadSource']) || 'Tenant',
              status: (lead.status as Lead['status']) || 'Qualified',
              value: lead.value || 0,
              createdDate: new Date(lead.createdAt).toISOString().split('T')[0],
              lastContactDate: new Date(lead.updatedAt).toISOString().split('T')[0],
              notes: lead.notes || '',
            }))
        );
      } else {
        const created = await tenantService.createTenant(payload);
        const tenant = mapTenantRecordToPropertyFundsTenant(created);

        const leadPayload = {
          name: `${formData.firstName} ${formData.lastName}`.trim(),
          email: formData.email,
          phone: formData.phone,
          company: formData.businessName,
          leadSource: 'Tenant',
          status: formData.status === 'Active' ? 'Converted' : 'Qualified',
          value: roundMoney(formData.monthlyRent * 12),
          linkedStockId: formData.linkedStockItemId || undefined,
          linkedTenantId: tenant.id,
          linkedAssetId: formData.linkedAssetId,
          propertyId: formData.linkedAssetId,
          notes: `Tenant record synced from Property Funds. Lease status: ${formData.leaseStatus}.`,
        };

        const createdLead = await leadService.createLead(leadPayload);

        if (shouldSyncWorkflow) {
          await syncTenantWorkflow(createdLead.id, leadPayload, selectedStockItem);
        }

        const refreshedLeads = await leadService.getAllLeads({ limit: 1000 });
        setTenants([...tenants, tenant]);
        setLeads(
          refreshedLeads.data
            .filter((lead) => String(lead.leadSource || '').toLowerCase() === 'tenant')
            .map((lead) => ({
              id: lead.id,
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              businessName: lead.company || '',
              linkedAssetId: (lead as any).propertyId || '',
              linkedTenantId: (lead as any).linkedTenantId || lead.linkedStockId || '',
              leadSource: (lead.leadSource as Lead['leadSource']) || 'Tenant',
              status: (lead.status as Lead['status']) || 'Qualified',
              value: lead.value || 0,
              createdDate: new Date(lead.createdAt).toISOString().split('T')[0],
              lastContactDate: new Date(lead.updatedAt).toISOString().split('T')[0],
              notes: lead.notes || '',
            }))
        );
      }

      resetForm();
      setShowModal(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save tenant');
    }
  };

  const handleEditTenant = (tenant: Tenant) => {
    setFormData({
      firstName: tenant.firstName,
      lastName: tenant.lastName,
      businessName: tenant.businessName,
      email: tenant.email,
      phone: tenant.phone,
      linkedAssetId: tenant.linkedAssetId,
      linkedStockItemId: tenant.linkedStockItemId || '',
      leaseStartDate: tenant.leaseStartDate || '',
      leaseEndDate: tenant.leaseEndDate || '',
      monthlyRent: tenant.monthlyRent || 0,
      status: tenant.status,
      leaseStatus: tenant.leaseStatus || 'Pending',
    });
    setSelectedTenant(tenant);
    setShowModal(true);
  };

  const handleDeleteTenant = async (id: string) => {
    if (confirm('Delete tenant and associated lead?')) {
      try {
        const linkedLead = leads.find((lead) => lead.linkedTenantId === id);
        if (linkedLead) {
          await leadService.deleteLead(linkedLead.id);
        }
        await tenantService.deleteTenant(id);
        setTenants(tenants.filter(t => t.id !== id));
        setLeads(leads.filter(l => l.linkedTenantId !== id));
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Failed to delete tenant');
      }
    }
  };

  const getAssetName = (assetId: string) => assets.find(a => a.id === assetId)?.name || 'N/A';

  const getStockItemName = (stockId: string | undefined) => {
    if (!stockId) return 'N/A';
    return stockItems.find(s => s.id === stockId)?.name || 'N/A';
  };

  const syncTenantWorkflow = async (
    leadId: string,
    leadPayload: {
      name: string;
      email: string;
      phone: string;
      company?: string;
      leadSource?: string;
      status: string;
      value: number;
      linkedStockId?: string;
      propertyId: string;
      notes?: string;
    },
    selectedStock?: { id: string; name: string; address?: string } | null
  ) => {
    if (!leadPayload.linkedStockId) {
      return null;
    }

    const selectedStockItem =
      selectedStock ?? stockItems.find((stock) => stock.id === leadPayload.linkedStockId);
    if (!selectedStockItem) {
      throw new Error('Selected stock item could not be found.');
    }

    const value = Math.max(0, roundMoney(leadPayload.value));
    const commissionRate = 0.05;
    const commissionAmount = roundMoney(value * commissionRate);
    const companyCommission = roundMoney(commissionAmount * 0.55);
    const brokerCommission = roundMoney(commissionAmount - companyCommission);
    const dealTitle = `${leadPayload.name} - ${selectedStockItem.name}`;
    const stockAddress = selectedStockItem.address || selectedStockItem.name;

    return leadService.syncLeadWorkflow(leadId, {
      leadId,
      status: leadPayload.status,
      moduleType: 'leasing',
      stockId: selectedStockItem.id,
      stockName: selectedStockItem.name,
      stockAddress,
      propertyId: leadPayload.propertyId,
      propertyTitle: selectedStockItem.name,
      propertyAddress: stockAddress,
      propertyType: 'Leasing',
      propertyStatus: 'for_lease',
      dealTitle,
      dealDescription: `Auto-created from Property Funds when tenant is linked to stock ${selectedStockItem.name}.`,
      dealStatus: toDealStatus(leadPayload.status),
      dealType: 'lease',
      dealValue: value,
      forecastTitle: dealTitle,
      forecastStatus: leadPayload.status,
      forecastExpectedValue: value,
      forecastCommissionRate: commissionRate,
      forecastCommissionAmount: commissionAmount,
      forecastCompanyCommission: companyCommission,
      forecastBrokerCommission: brokerCommission,
      forecastClosureDate: new Date().toISOString(),
      notes: leadPayload.notes,
      comment: leadPayload.notes || '',
      company: leadPayload.company,
      leadSource: leadPayload.leadSource,
      leadType: 'Leasing',
    } as Record<string, unknown>);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800';
      case 'Prospect':
        return 'bg-blue-100 text-blue-800';
      case 'Inactive':
        return 'bg-stone-100 text-stone-800';
      default:
        return 'bg-stone-100 text-stone-800';
    }
  };

  const getLeaseStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800';
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'Expired':
        return 'bg-red-100 text-red-800';
      case 'Cancelled':
        return 'bg-stone-100 text-stone-800';
      default:
        return 'bg-stone-100 text-stone-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Tenants & Leads</h2>
          <p className="text-stone-600 text-sm mt-1">
            Manage tenants (automatically synced to Leads)
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FiPlus size={18} />
          + Tenant
        </button>
      </div>

      {/* Info Alert */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>Auto-Sync:</strong> Creating or updating a tenant automatically creates/updates a corresponding lead entry.
          Tenants appear in the Leads tab and reflect their lease status.
        </p>
      </div>

      {/* Tenants Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-stone-100 border-b border-stone-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Tenant</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Business</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Asset</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Unit</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Monthly Rent</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Lease</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {tenants.map(tenant => (
                <tr key={tenant.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FiUser size={16} className="text-violet-500" />
                      <div>
                        <p className="font-medium text-stone-900">
                          {tenant.firstName} {tenant.lastName}
                        </p>
                        <p className="text-xs text-stone-600">{tenant.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-700">{tenant.businessName}</td>
                  <td className="px-6 py-4 text-sm text-stone-700">{getAssetName(tenant.linkedAssetId)}</td>
                  <td className="px-6 py-4 text-sm text-stone-700">{getStockItemName(tenant.linkedStockItemId)}</td>
                  <td className="px-6 py-4 text-sm font-medium text-stone-900">
                    {tenant.monthlyRent ? formatRand(tenant.monthlyRent) : 'N/A'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${getStatusColor(tenant.status)}`}>
                      {tenant.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded ${getLeaseStatusColor(
                        tenant.leaseStatus || 'Pending'
                      )}`}
                    >
                      {tenant.leaseStatus || 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditTenant(tenant)}
                        className="text-violet-500 hover:text-violet-700 transition-colors"
                        title="Edit"
                      >
                        <FiEdit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteTenant(tenant.id)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                        title="Delete"
                      >
                        <FiTrash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Tenant Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-96 overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-4">
                {selectedTenant ? 'Edit Tenant' : 'Add New Tenant'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={e => setFormData({ ...formData, businessName: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Asset *
                  </label>
                  <select
                    value={formData.linkedAssetId}
                    onChange={e => setFormData({ ...formData, linkedAssetId: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">Select asset...</option>
                    {assets.map(asset => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Leasing Unit (Stock Item)
                  </label>
                  <select
                    value={formData.linkedStockItemId}
                    onChange={e => setFormData({ ...formData, linkedStockItemId: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">Select unit...</option>
                    {stockItems
                      .filter(s => s.assetId === formData.linkedAssetId)
                      .map(stock => (
                        <option key={stock.id} value={stock.id}>
                          {stock.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Monthly Rent
                  </label>
                  <input
                    type="number"
                    value={formData.monthlyRent}
                    onChange={e => setFormData({ ...formData, monthlyRent: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Lease Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.leaseStartDate}
                    onChange={e => setFormData({ ...formData, leaseStartDate: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Lease End Date
                  </label>
                  <input
                    type="date"
                    value={formData.leaseEndDate}
                    onChange={e => setFormData({ ...formData, leaseEndDate: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Tenant Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="Active">Active</option>
                    <option value="Prospect">Prospect</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Lease Status
                  </label>
                  <select
                    value={formData.leaseStatus}
                    onChange={e => setFormData({ ...formData, leaseStatus: e.target.value as any })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="Active">Active</option>
                    <option value="Pending">Pending</option>
                    <option value="Expired">Expired</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    resetForm();
                    setShowModal(false);
                  }}
                  className="flex-1 px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTenant}
                  className="flex-1 px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  {selectedTenant ? 'Update Tenant' : 'Add Tenant'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
