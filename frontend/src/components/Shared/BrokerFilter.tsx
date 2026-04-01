'use client';

import React, { useState } from 'react';
import { Broker, BrokerRole, PermissionLevel } from '@/data/unified-schema';
import { FiSearch, FiX } from 'react-icons/fi';

interface BrokerFilterProps {
  brokers: Broker[];
  onSelect?: (broker: Broker) => void;
  onMultiSelect?: (brokers: Broker[]) => void;
  multiSelect?: boolean;
  excludeIds?: string[];
  allowUnassigned?: boolean;
  variant?: 'dropdown' | 'list' | 'cards';
}

interface FilterState {
  searchTerm: string;
  selectedRoles: BrokerRole[];
  selectedStatuses: string[];
  selectedPermissions: PermissionLevel[];
  selectedBrokerIds: string[];
}

export const BrokerFilter: React.FC<BrokerFilterProps> = ({
  brokers,
  onSelect,
  onMultiSelect,
  multiSelect = false,
  excludeIds = [],
  allowUnassigned = false,
  variant = 'dropdown',
}) => {
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: '',
    selectedRoles: [],
    selectedStatuses: ['Active'],
    selectedPermissions: [],
    selectedBrokerIds: [],
  });

  const [showFilters, setShowFilters] = useState(false);

  const availableRoles: BrokerRole[] = ['Admin', 'Senior Broker', 'Broker', 'Junior Broker', 'Analyst'];
  const availableStatuses = ['Active', 'Inactive', 'On Leave'];
  const availablePermissions: PermissionLevel[] = ['View Only', 'Edit', 'Approve', 'Admin'];

  // Filter brokers based on criteria
  const filteredBrokers = brokers.filter(broker => {
    // Exclude specified IDs
    if (excludeIds.includes(broker.id)) return false;

    // Search term
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      if (
        !broker.firstName.toLowerCase().includes(term) &&
        !broker.lastName.toLowerCase().includes(term) &&
        !broker.email.toLowerCase().includes(term)
      ) {
        return false;
      }
    }

    // Role filter
    if (filters.selectedRoles.length > 0 && !filters.selectedRoles.includes(broker.role)) {
      return false;
    }

    // Status filter
    if (filters.selectedStatuses.length > 0 && !filters.selectedStatuses.includes(broker.status)) {
      return false;
    }

    // Permission filter
    if (
      filters.selectedPermissions.length > 0 &&
      !filters.selectedPermissions.includes(broker.permissionLevel)
    ) {
      return false;
    }

    return true;
  });

  const handleRoleToggle = (role: BrokerRole) => {
    setFilters(prev => ({
      ...prev,
      selectedRoles: prev.selectedRoles.includes(role)
        ? prev.selectedRoles.filter(r => r !== role)
        : [...prev.selectedRoles, role],
    }));
  };

  const handleStatusToggle = (status: string) => {
    setFilters(prev => ({
      ...prev,
      selectedStatuses: prev.selectedStatuses.includes(status)
        ? prev.selectedStatuses.filter(s => s !== status)
        : [...prev.selectedStatuses, status],
    }));
  };

  const handlePermissionToggle = (permission: PermissionLevel) => {
    setFilters(prev => ({
      ...prev,
      selectedPermissions: prev.selectedPermissions.includes(permission)
        ? prev.selectedPermissions.filter(p => p !== permission)
        : [...prev.selectedPermissions, permission],
    }));
  };

  const handleBrokerSelect = (broker: Broker) => {
    if (multiSelect) {
      const newSelected = filters.selectedBrokerIds.includes(broker.id)
        ? filters.selectedBrokerIds.filter(id => id !== broker.id)
        : [...filters.selectedBrokerIds, broker.id];

      setFilters(prev => ({ ...prev, selectedBrokerIds: newSelected }));

      if (onMultiSelect) {
        const selectedBrokers = brokers.filter(b => newSelected.includes(b.id));
        onMultiSelect(selectedBrokers);
      }
    } else {
      if (onSelect) {
        onSelect(broker);
      }
    }
  };

  const getRoleColor = (role: BrokerRole) => {
    const colors: Record<BrokerRole, string> = {
      'Admin': 'bg-red-100 text-red-800',
      'Senior Broker': 'bg-purple-100 text-purple-800',
      'Broker': 'bg-blue-100 text-blue-800',
      'Junior Broker': 'bg-green-100 text-green-800',
      'Analyst': 'bg-yellow-100 text-yellow-800',
    };
    return colors[role];
  };

  if (variant === 'list') {
    return (
      <div className="space-y-2">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white px-4 py-3 rounded-lg border border-gray-200">
          <FiSearch className="text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search brokers..."
            value={filters.searchTerm}
            onChange={e => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
            className="flex-1 outline-none text-sm"
          />
        </div>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          {showFilters ? '- Hide Filters' : '+ Show Filters'}
        </button>

        {/* Filters */}
        {showFilters && (
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
            {/* Roles */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Roles</p>
              <div className="flex flex-wrap gap-2">
                {availableRoles.map(role => (
                  <label key={role} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.selectedRoles.includes(role)}
                      onChange={() => handleRoleToggle(role)}
                      className="rounded"
                    />
                    {role}
                  </label>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                {availableStatuses.map(status => (
                  <label key={status} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.selectedStatuses.includes(status)}
                      onChange={() => handleStatusToggle(status)}
                      className="rounded"
                    />
                    {status}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Broker List */}
        <div className="space-y-2">
          {allowUnassigned && (
            <button
              onClick={() => handleBrokerSelect({ id: 'unassigned' } as any)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                filters.selectedBrokerIds.includes('unassigned')
                  ? 'bg-blue-50 border-blue-300'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <p className="font-medium text-gray-900">Unassigned</p>
            </button>
          )}

          {filteredBrokers.length === 0 ? (
            <p className="text-center text-gray-500 py-4">No brokers found</p>
          ) : (
            filteredBrokers.map(broker => (
              <button
                key={broker.id}
                onClick={() => handleBrokerSelect(broker)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  filters.selectedBrokerIds.includes(broker.id)
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {broker.firstName} {broker.lastName}
                    </p>
                    <p className="text-xs text-gray-500">{broker.email}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getRoleColor(broker.role)}`}>
                    {broker.role}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // Dropdown variant (default)
  return (
    <div className="relative">
      <select
        onChange={e => {
          const broker = brokers.find(b => b.id === e.target.value);
          if (broker && onSelect) {
            onSelect(broker);
          }
        }}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Select a broker...</option>
        {filteredBrokers.map(broker => (
          <option key={broker.id} value={broker.id}>
            {broker.firstName} {broker.lastName} - {broker.role}
          </option>
        ))}
      </select>
    </div>
  );
};

export default BrokerFilter;
