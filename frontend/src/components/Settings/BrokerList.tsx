'use client';

import React, { useMemo, useState } from 'react';
import { FiSearch, FiEdit2, FiTrash2, FiChevronDown, FiChevronUp, FiKey, FiLoader } from 'react-icons/fi';
import { BrokerProfile } from '@/data/settings';
import { brokerService } from '@/services/brokerService';
import { optimizeAvatarForStorage } from '@/utils/avatarStorage';
import { formatRand } from '@/lib/currency';

interface BrokerListProps {
  brokers: BrokerProfile[];
  canDelete?: boolean;
  onDelete: (brokerId: string) => void;
  onUpdate: (brokerId: string, updates: Partial<BrokerProfile>) => void;
  onSave?: (brokerId: string) => Promise<void> | void;
}

const roleColors: Record<string, string> = {
  'Admin': 'bg-red-100 text-red-800',
  'Senior Broker': 'bg-purple-100 text-purple-800',
  'Broker': 'bg-blue-100 text-blue-800',
  'Junior Broker': 'bg-green-100 text-green-800',
  'Analyst': 'bg-yellow-100 text-yellow-800',
};

const statusColors: Record<string, string> = {
  'Active': 'bg-green-100 text-green-800',
  'Inactive': 'bg-gray-100 text-gray-800',
  'On Leave': 'bg-yellow-100 text-yellow-800',
  'Archived': 'bg-stone-100 text-stone-700',
};

export default function BrokerList({
  brokers,
  canDelete = true,
  onDelete,
  onUpdate,
  onSave,
}: BrokerListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedBroker, setExpandedBroker] = useState<string | null>(null);
  const [editingBroker, setEditingBroker] = useState<string | null>(null);
  const [passwordActionState, setPasswordActionState] = useState<
    Record<
      string,
      {
        status: 'idle' | 'loading' | 'success' | 'warning' | 'error';
        message?: string;
      }
    >
  >({});

  const filteredBrokers = useMemo(() => {
    return brokers.filter(broker =>
      broker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      broker.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      broker.department.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [brokers, searchTerm]);

  const handleStatusToggle = (brokerId: string, currentStatus: string) => {
    if (currentStatus === 'Archived') return;
    const newStatus =
      currentStatus === 'Active' ? 'Inactive' : currentStatus === 'Inactive' ? 'On Leave' : 'Active';
    onUpdate(brokerId, { status: newStatus as 'Active' | 'Inactive' | 'On Leave' });
  };

  const handleImageUpload = (brokerId: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void (async () => {
        try {
          const optimizedAvatar = await optimizeAvatarForStorage(file);
          onUpdate(brokerId, { avatar: optimizedAvatar });
        } catch (error) {
          console.error('Avatar processing failed:', error);
          alert('Could not process this image. Please choose another one.');
        }
      })();
    }
  };

  const handleGeneratePassword = async (broker: BrokerProfile) => {
    const backendBrokerId = broker.backendId || broker.id;
    if (!broker.backendId && broker.id.startsWith('BR-')) {
      setPasswordActionState((prev) => ({
        ...prev,
        [broker.id]: {
          status: 'error',
          message:
            'This broker record is missing its database ID. Refresh the page or recreate the broker to enable password email.',
        },
      }));
      return;
    }

    setPasswordActionState((prev) => ({
      ...prev,
      [broker.id]: { status: 'loading', message: 'Generating password and sending email...' },
    }));

    try {
      const result = await brokerService.generateBrokerPassword(backendBrokerId);
      const passwordSentDate = new Date().toISOString();

      if (result.passwordSent) {
        onUpdate(broker.id, {
          passwordStatus: 'Sent',
          passwordSentDate,
          passwordError: undefined,
          lastGeneratedPassword: result.temporaryPassword,
          backendId: backendBrokerId,
        });

        const successMessage = result.temporaryPassword
          ? `Password generated and email sent. Temporary password: ${result.temporaryPassword}`
          : 'Password generated and email sent.';

        setPasswordActionState((prev) => ({
          ...prev,
          [broker.id]: { status: 'success', message: successMessage },
        }));
      } else {
        onUpdate(broker.id, {
          passwordStatus: 'Pending',
          passwordSentDate,
          passwordError: result.passwordError,
          lastGeneratedPassword: result.temporaryPassword,
          backendId: backendBrokerId,
        });

        const warningMessage = `Password generated, but email failed: ${
          result.passwordError || 'SMTP unavailable'
        }${result.temporaryPassword ? `. Temporary password: ${result.temporaryPassword}` : ''}`;

        setPasswordActionState((prev) => ({
          ...prev,
          [broker.id]: { status: 'warning', message: warningMessage },
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPasswordActionState((prev) => ({
        ...prev,
        [broker.id]: { status: 'error', message: `Failed to generate password: ${message}` },
      }));
    }
  };

  const handleSaveBroker = async (brokerId: string) => {
    try {
      if (onSave) {
        await onSave(brokerId);
      }
      setEditingBroker(null);
      alert('Broker updated successfully!');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`Failed to save broker changes: ${message}`);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full flex-1 min-h-0">
      {/* Search Bar */}
      <div className="flex items-center gap-2 bg-white px-4 py-3 rounded-lg border border-stone-200">
        <FiSearch className="text-stone-400" size={20} />
        <input
          type="text"
          placeholder="Search brokers by name, email, or department..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 outline-none text-sm"
        />
      </div>

      {/* Broker Cards */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {filteredBrokers.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-stone-500">
            <p>No brokers found</p>
          </div>
        ) : (
          filteredBrokers.map((broker) => (
            <div key={broker.id} className="bg-white rounded-lg border border-stone-200 hover:border-blue-400 hover:shadow-md transition-all">
              {/* Broker Header */}
              <div className="p-4 cursor-pointer" onClick={() => setExpandedBroker(expandedBroker === broker.id ? null : broker.id)}>
                <div className="flex items-start justify-between gap-4">
                  {/* Avatar and Info */}
                  <div className="flex items-start gap-4 flex-1">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      {broker.avatar ? (
                        <img src={broker.avatar} alt={broker.name} className="h-16 w-16 rounded-lg object-cover border-2 border-stone-200" />
                      ) : (
                        <div className="h-16 w-16 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg border-2 border-stone-200">
                          {broker.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-stone-900 text-lg">{broker.name}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${roleColors[broker.role]}`}>
                          {broker.role}
                        </span>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer hover:opacity-80 ${statusColors[broker.status]}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusToggle(broker.id, broker.status);
                          }}
                        >
                          {broker.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm text-stone-600">
                        <div>
                          <span className="font-medium">Email:</span> {broker.email}
                        </div>
                        <div>
                          <span className="font-medium">Phone:</span> {broker.phone}
                        </div>
                        <div>
                          <span className="font-medium">Department:</span> {broker.department}
                        </div>
                        <div>
                          <span className="font-medium">Permission:</span> {broker.permissionLevel}
                        </div>
                        <div>
                          <span className="font-medium">Billing Target:</span> {formatRand(broker.billingTarget)}
                        </div>
                        <div>
                          <span className="font-medium">Current Billing:</span> {formatRand(broker.currentBilling)}
                        </div>
                        <div>
                          <span className="font-medium">Progress vs Target:</span>{' '}
                          {Math.round(Number(broker.progressPercentage || 0))}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      className="p-2 hover:bg-stone-100 rounded transition-colors"
                      title="Generate / Resend Password"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleGeneratePassword(broker);
                      }}
                    >
                      {passwordActionState[broker.id]?.status === 'loading' ? (
                        <FiLoader size={18} className="text-purple-600 animate-spin" />
                      ) : (
                        <FiKey size={18} className="text-purple-600" />
                      )}
                    </button>
                    <button
                      className="p-2 hover:bg-stone-100 rounded transition-colors"
                      title="Edit Broker"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingBroker(editingBroker === broker.id ? null : broker.id);
                      }}
                    >
                      <FiEdit2 size={18} className="text-blue-600" />
                    </button>
                    {canDelete && (
                      <button
                        className="p-2 hover:bg-stone-100 rounded transition-colors"
                        title="Archive Broker"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(broker.id);
                        }}
                      >
                        <FiTrash2 size={18} className="text-red-600" />
                      </button>
                    )}
                    <button
                      className="p-2 hover:bg-stone-100 rounded transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedBroker(expandedBroker === broker.id ? null : broker.id);
                      }}
                    >
                      {expandedBroker === broker.id ? (
                        <FiChevronUp size={18} className="text-stone-600" />
                      ) : (
                        <FiChevronDown size={18} className="text-stone-600" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedBroker === broker.id && (
                <div className="border-t border-stone-200 p-4 bg-stone-50 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-stone-600 uppercase mb-1">License Number</p>
                      <p className="text-sm font-semibold text-stone-900">{broker.licenseNumber || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-stone-600 uppercase mb-1">Join Date</p>
                      <p className="text-sm font-semibold text-stone-900">{broker.joinDate}</p>
                    </div>

                    {/* Password Status Section */}
                    {broker.passwordStatus && (
                      <div className={`col-span-2 p-3 rounded-lg border ${
                        broker.passwordStatus === 'Sent'
                          ? 'bg-green-50 border-green-200'
                          : broker.passwordStatus === 'Used'
                          ? 'bg-blue-50 border-blue-200'
                          : broker.passwordStatus === 'Expired'
                          ? 'bg-red-50 border-red-200'
                          : 'bg-yellow-50 border-yellow-200'
                      }`}>
                        <p className={`text-xs font-semibold uppercase mb-1 ${
                          broker.passwordStatus === 'Sent'
                            ? 'text-green-800'
                            : broker.passwordStatus === 'Used'
                            ? 'text-blue-800'
                            : broker.passwordStatus === 'Expired'
                            ? 'text-red-800'
                            : 'text-yellow-800'
                        }`}>
                          Password Status: {broker.passwordStatus}
                        </p>
                        {broker.passwordSentDate && (
                          <p className={`text-xs ${
                            broker.passwordStatus === 'Sent'
                              ? 'text-green-700'
                              : broker.passwordStatus === 'Used'
                              ? 'text-blue-700'
                              : broker.passwordStatus === 'Expired'
                              ? 'text-red-700'
                              : 'text-yellow-700'
                          }`}>
                            Sent: {new Date(broker.passwordSentDate).toLocaleString()}
                          </p>
                        )}

                        {broker.lastGeneratedPassword && (
                          <div className="mt-2 flex items-center gap-2">
                            <code className="px-2 py-1 rounded bg-white border border-stone-300 text-xs font-semibold text-stone-900">
                              Temporary password: {broker.lastGeneratedPassword}
                            </code>
                            <button
                              type="button"
                              onClick={() =>
                                navigator.clipboard?.writeText(broker.lastGeneratedPassword || '')
                              }
                              className="px-2 py-1 text-xs bg-stone-900 text-white rounded hover:bg-stone-700"
                            >
                              Copy
                            </button>
                          </div>
                        )}

                        {broker.passwordError && (
                          <p className="text-xs text-red-700 mt-2">Email error: {broker.passwordError}</p>
                        )}
                      </div>
                    )}

                    {passwordActionState[broker.id]?.status &&
                      passwordActionState[broker.id]?.status !== 'idle' && (
                      <div
                        className={`col-span-2 p-3 rounded-lg border text-xs ${
                          passwordActionState[broker.id]?.status === 'success'
                            ? 'bg-green-50 border-green-200 text-green-800'
                            : passwordActionState[broker.id]?.status === 'warning'
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : passwordActionState[broker.id]?.status === 'error'
                            ? 'bg-red-50 border-red-200 text-red-800'
                            : 'bg-blue-50 border-blue-200 text-blue-800'
                        }`}
                      >
                        {passwordActionState[broker.id]?.message}
                      </div>
                    )}

                    <div className="col-span-2">
                      <p className="text-xs font-medium text-stone-600 uppercase mb-1">Address</p>
                      <p className="text-sm font-semibold text-stone-900">{broker.address || 'N/A'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-stone-600 uppercase mb-1">Specialization</p>
                      <div className="flex flex-wrap gap-2">
                        {broker.specialization.map((spec) => (
                          <span key={spec} className="inline-block bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
                            {spec}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Edit Section */}
                  {editingBroker === broker.id && (
                    <div className="border-t border-stone-200 pt-3 mt-3 space-y-3">
                      <p className="text-sm font-medium text-stone-900 mb-2">Edit Broker Details</p>
                      
                      {/* Picture Upload */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-stone-600">Profile Picture</label>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageUpload(broker.id)}
                              className="block w-full text-sm text-stone-500 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                            />
                          </div>
                          {broker.avatar && (
                            <button
                              type="button"
                              onClick={() => onUpdate(broker.id, { avatar: '' })}
                              className="text-xs text-red-600 hover:text-red-700 px-2 py-1"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-medium text-stone-600">Broker Name</label>
                          <input
                            type="text"
                            defaultValue={broker.name}
                            onChange={(e) => onUpdate(broker.id, { name: e.target.value })}
                            className="w-full text-sm px-3 py-2 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Email</label>
                          <input
                            type="email"
                            defaultValue={broker.email}
                            onChange={(e) => onUpdate(broker.id, { email: e.target.value })}
                            className="w-full text-sm px-3 py-2 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Phone</label>
                          <input
                            type="tel"
                            defaultValue={broker.phone}
                            onChange={(e) => onUpdate(broker.id, { phone: e.target.value })}
                            className="w-full text-sm px-3 py-2 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-medium text-stone-600">Status</label>
                            <select
                              value={broker.status}
                              onChange={(e) =>
                                onUpdate(broker.id, { status: e.target.value as 'Active' | 'Inactive' | 'On Leave' })
                              }
                              className="w-full text-sm px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option>Active</option>
                              <option>Inactive</option>
                              <option>On Leave</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-stone-600">Permission Level</label>
                            <select
                              value={broker.permissionLevel}
                              onChange={(e) =>
                                onUpdate(broker.id, { permissionLevel: e.target.value as 'Full Access' | 'Limited Access' | 'View Only' })
                              }
                              className="w-full text-sm px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option>Full Access</option>
                              <option>Limited Access</option>
                              <option>View Only</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-medium text-stone-600">Billing Target (R)</label>
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={broker.billingTarget}
                              onChange={(e) => onUpdate(broker.id, { billingTarget: Number(e.target.value) || 0 })}
                              className="w-full text-sm px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-stone-600">Current Billing</label>
                            <div className="w-full text-sm px-2 py-2 border border-stone-200 rounded bg-stone-50 text-stone-700">
                              {formatRand(broker.currentBilling)}
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-stone-600">Progress vs Target</label>
                          <div className="w-full text-sm px-3 py-2 border border-stone-200 rounded bg-stone-50 text-stone-700">
                            {Math.round(Number(broker.progressPercentage || 0))}%
                          </div>
                        </div>
                        <button
                          onClick={() => void handleSaveBroker(broker.id)}
                          className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors mt-2"
                        >
                          Save Changes
                        </button>
                      </div>

                      {/* Property Management Info */}
                      <div className="border-t border-stone-200 pt-3 mt-3">
                        <p className="text-sm font-medium text-stone-900 mb-2">Property Management</p>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                          <p className="font-medium mb-1">Broker Profile Edits & Property Updates</p>
                          <p>Any edits or updates to property information should be done directly by brokers within their own profiles. Brokers can manage their properties, add new listings, and update property details from the Properties module.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Summary */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-stone-600 font-medium">Total Brokers</p>
            <p className="text-2xl font-bold text-blue-600">{brokers.length}</p>
          </div>
          <div>
            <p className="text-stone-600 font-medium">Active</p>
            <p className="text-2xl font-bold text-green-600">{brokers.filter(b => b.status === 'Active').length}</p>
          </div>
          <div>
            <p className="text-stone-600 font-medium">On Leave / Inactive</p>
            <p className="text-2xl font-bold text-yellow-600">{brokers.filter(b => b.status !== 'Active').length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
