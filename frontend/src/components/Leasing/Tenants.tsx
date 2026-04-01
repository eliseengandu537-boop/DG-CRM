// @ts-nocheck
'use client';

import React, { useEffect, useState } from "react";
import { Tenant } from "../../data/leasing";
import { FiEdit2, FiTrash2, FiPlus, FiSearch, FiAlertCircle } from "react-icons/fi";
import { formatRand } from '@/lib/currency';
import {
  mapTenantRecordToLeasingTenant,
  serializeLeasingTenant,
  tenantService,
} from "@/services/tenantService";

export const Tenants: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [newTenant, setNewTenant] = useState({
    companyName: "",
    unit: "",
    leaseStartDate: "",
    leaseEndDate: "",
    monthlyRent: 0,
    squareFeet: 0,
    leaseStatus: "Pending",
    paymentStatus: "Current",
    maintenanceRequired: false,
  });

  useEffect(() => {
    let mounted = true;

    const loadTenants = async () => {
      try {
        const result = await tenantService.getAllTenants({ limit: 1000 });
        if (!mounted) return;
        setTenants(result.data.map((tenant) => mapTenantRecordToLeasingTenant(tenant)));
      } catch {
        if (!mounted) return;
        setTenants([]);
      }
    };

    void loadTenants();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredTenants = tenants.filter((tenant) => {
    const matchesSearch =
      tenant.companyName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      filterStatus === "All" || tenant.leaseStatus === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getLeaseStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-green-100 text-green-800";
      case "Expiring Soon":
        return "bg-yellow-100 text-yellow-800";
      case "Expired":
        return "bg-red-100 text-red-800";
      case "Pending":
        return "bg-blue-100 text-blue-800";
      case "Cancelled":
        return "bg-stone-100 text-stone-800";
      default:
        return "bg-stone-100 text-stone-800";
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "Current":
        return "text-green-600";
      case "Overdue":
        return "text-red-600";
      case "Partial":
        return "text-yellow-600";
      default:
        return "text-stone-600";
    }
  };

  const daysUntilExpiry = (endDate: string) => {
    const end = new Date(endDate);
    const today = new Date();
    const diff = end.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const handleAddTenant = async () => {
    if (!newTenant.companyName || !newTenant.unit || !newTenant.leaseStartDate || !newTenant.leaseEndDate) {
      alert("Please fill in all required fields");
      return;
    }
    try {
      const created = await tenantService.createTenant({
        ...serializeLeasingTenant(newTenant),
        details: serializeLeasingTenant(newTenant),
      });
      const tenantWithId = mapTenantRecordToLeasingTenant(created);
      setTenants([...tenants, tenantWithId]);
      setShowAddModal(false);
      setNewTenant({
        companyName: "",
        unit: "",
        leaseStartDate: "",
        leaseEndDate: "",
        monthlyRent: 0,
        squareFeet: 0,
        leaseStatus: "Pending",
        paymentStatus: "Current",
        maintenanceRequired: false,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save tenant");
    }
  };

  const handleEditTenant = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setNewTenant({
      companyName: tenant.companyName,
      unit: tenant.unitNumber || "",
      leaseStartDate: tenant.leaseStartDate,
      leaseEndDate: tenant.leaseEndDate,
      monthlyRent: tenant.monthlyRent || 0,
      squareFeet: tenant.squareFootage || 0,
      leaseStatus: tenant.leaseStatus,
      paymentStatus: tenant.paymentStatus,
      maintenanceRequired: !!tenant.maintenanceRequests,
    });
    setShowAddModal(true);
  };

  const handleSaveTenant = async () => {
    if (!editingTenant) return handleAddTenant();
    try {
      const updated = await tenantService.updateTenant(editingTenant.id, {
        ...serializeLeasingTenant(newTenant),
        details: serializeLeasingTenant(newTenant),
      });
      const mapped = mapTenantRecordToLeasingTenant(updated);
      setTenants(tenants.map(t => t.id === editingTenant.id ? mapped : t));
      setEditingTenant(null);
      setShowAddModal(false);
      setNewTenant({
        companyName: "",
        unit: "",
        leaseStartDate: "",
        leaseEndDate: "",
        monthlyRent: 0,
        squareFeet: 0,
        leaseStatus: "Pending",
        paymentStatus: "Current",
        maintenanceRequired: false,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update tenant");
    }
  };

  const handleDeleteTenant = async (id?: string) => {
    if (!id) return;
    if (confirm('Are you sure you want to delete this tenant?')) {
      try {
        await tenantService.deleteTenant(id);
        setTenants(tenants.filter(t => t.id !== id));
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to delete tenant");
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Tenants</h2>
          <p className="text-stone-600 text-sm mt-1">
            Track active and upcoming lease agreements
          </p>
        </div>
        <button 
          onClick={() => { setEditingTenant(null); setShowAddModal(true); }}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FiPlus size={18} />
          Add Tenant
        </button>
      </div>

      {/* Add Tenant Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-4">Add New Tenant</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    value={newTenant.companyName}
                    onChange={(e) =>
                      setNewTenant({ ...newTenant, companyName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Unit *
                  </label>
                  <input
                    type="text"
                    value={newTenant.unit}
                    onChange={(e) =>
                      setNewTenant({ ...newTenant, unit: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Unit number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Lease Start Date *
                  </label>
                  <input
                    type="date"
                    value={newTenant.leaseStartDate}
                    onChange={(e) =>
                      setNewTenant({ ...newTenant, leaseStartDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Lease End Date *
                  </label>
                  <input
                    type="date"
                    value={newTenant.leaseEndDate}
                    onChange={(e) =>
                      setNewTenant({ ...newTenant, leaseEndDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Monthly Rent (R)
                  </label>
                  <input
                    type="number"
                    value={newTenant.monthlyRent}
                    onChange={(e) =>
                      setNewTenant({ ...newTenant, monthlyRent: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Monthly rent amount"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Square Feet
                  </label>
                  <input
                    type="number"
                    value={newTenant.squareFeet}
                    onChange={(e) =>
                      setNewTenant({ ...newTenant, squareFeet: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Sq. ft."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Lease Status
                  </label>
                  <select
                    value={newTenant.leaseStatus}
                    onChange={(e) =>
                      setNewTenant({ ...newTenant, leaseStatus: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Active</option>
                    <option>Expiring Soon</option>
                    <option>Expired</option>
                    <option>Pending</option>
                    <option>Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Payment Status
                  </label>
                  <select
                    value={newTenant.paymentStatus}
                    onChange={(e) =>
                      setNewTenant({ ...newTenant, paymentStatus: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Current</option>
                    <option>Overdue</option>
                    <option>Partial</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6 justify-end">
                <button
                  onClick={() => { setShowAddModal(false); setEditingTenant(null); }}
                  className="px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={editingTenant ? handleSaveTenant : handleAddTenant}
                  className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  {editingTenant ? 'Save Changes' : 'Add Tenant'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
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
                placeholder="Search tenants..."
                className="w-full pl-10 pr-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Lease Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option>All</option>
              <option>Active</option>
              <option>Expiring Soon</option>
              <option>Expired</option>
              <option>Pending</option>
              <option>Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredTenants.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Company Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Unit
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Lease Period
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Monthly Rent
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Sq. Ft.
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Payment
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Maintenance
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredTenants.map((tenant) => {
                  const daysLeft = daysUntilExpiry(tenant.leaseEndDate);
                  const isExpiringSoon =
                    tenant.leaseStatus === "Active" && daysLeft < 90;

                  return (
                    <tr
                      key={tenant.id}
                      className={`hover:bg-stone-50 transition-colors ${
                        isExpiringSoon ? "bg-yellow-50" : ""
                      }`}
                    >
                      <td className="px-6 py-4 text-sm font-medium text-stone-900">
                        <div className="flex items-center gap-2">
                          {tenant.companyName}
                          {isExpiringSoon && (
                            <FiAlertCircle
                              size={16}
                              className="text-yellow-600"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-stone-600">
                        {tenant.unitNumber || "-"}
                      </td>
                      <td className="px-6 py-4 text-sm text-stone-600">
                        <div className="space-y-1">
                          <div>
                            {new Date(tenant.leaseStartDate).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-stone-500">
                            to{" "}
                            {new Date(tenant.leaseEndDate).toLocaleDateString()}
                          </div>
                          {isExpiringSoon && (
                            <div className="text-xs text-yellow-600 font-medium">
                              {daysLeft} days left
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-stone-900">
                        R {tenant.monthlyRent.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-stone-600">
                        {tenant.squareFootage.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${getLeaseStatusColor(
                            tenant.leaseStatus
                          )}`}
                        >
                          {tenant.leaseStatus}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-sm font-medium ${getPaymentStatusColor(tenant.paymentStatus)}`}>
                        {tenant.paymentStatus}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-flex items-center justify-center w-6 h-6 bg-stone-100 rounded text-stone-700 text-xs font-medium">
                          {tenant.maintenanceRequests}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2">
                          <button onClick={() => handleEditTenant(tenant)} className="p-1 hover:bg-stone-100 rounded transition-colors">
                            <FiEdit2 size={16} className="text-stone-600" />
                          </button>
                          <button onClick={() => handleDeleteTenant(tenant.id)} className="p-1 hover:bg-stone-100 rounded transition-colors">
                            <FiTrash2 size={16} className="text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-stone-500">
            <p>No tenants found matching your search.</p>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Tenants</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">
            {tenants.length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Active Leases</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {tenants.filter((t) => t.leaseStatus === "Active").length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Expiring Soon</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">
            {
              tenants.filter(
                (t) =>
                  t.leaseStatus === "Active" &&
                  daysUntilExpiry(t.leaseEndDate) < 90
              ).length
            }
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Annual Rent</p>
          <p className="text-2xl font-bold text-violet-600 mt-1">
            {formatRand(tenants.reduce((sum, t) => sum + t.monthlyRent * 12, 0))}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Payment Issues</p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {tenants.filter((t) => t.paymentStatus !== "Current").length}
          </p>
        </div>
      </div>
    </div>
  );
};
