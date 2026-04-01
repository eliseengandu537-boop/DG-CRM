'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BrokerProfile, systemSettings } from '@/data/settings';
import AddBrokerForm from './AddBrokerForm';
import BrokerList from './BrokerList';
import ArchivedBrokerList from './ArchivedBrokerList';
import ManagerSettings from './ManagerSettings';
import SystemSettingsPanel from './SystemSettingsPanel';
import { ArchivedBrokerRecord, Broker as ApiBroker, brokerService } from '@/services/brokerService';
import {
  loadBrokerProfileRecords,
  saveBrokerProfileRecord,
} from '@/services/profileRecordService';
import { useAuth } from '@/context/AuthContext';

const toBrokerProfileExtrasPayload = (broker: BrokerProfile): Record<string, unknown> => ({
  id: broker.id,
  backendId: broker.backendId || broker.id,
  name: broker.name,
  email: broker.email,
  phone: broker.phone,
  role: broker.role,
  department: broker.department,
  joinDate: broker.joinDate,
  permissionLevel: broker.permissionLevel,
  specialization: broker.specialization,
  avatar: broker.avatar,
  address: broker.address,
  licenseNumber: broker.licenseNumber,
  passwordSentDate: broker.passwordSentDate,
  passwordStatus: broker.passwordStatus,
  lastGeneratedPassword: broker.lastGeneratedPassword,
  passwordError: broker.passwordError,
  notes: broker.notes,
});

const toStatus = (value: string): BrokerProfile['status'] => {
  if (value === 'archived') return 'Archived';
  if (value === 'inactive') return 'Inactive';
  return 'Active';
};

const toBackendStatus = (status: BrokerProfile['status']): 'active' | 'inactive' | 'archived' => {
  if (status === 'Archived') return 'archived';
  if (status === 'Inactive') return 'inactive';
  return 'active';
};

const toBrokerProfile = (broker: ApiBroker, localProfile?: Partial<BrokerProfile>): BrokerProfile => ({
  id: broker.id,
  backendId: broker.id,
  name: broker.name,
  email: broker.email,
  phone: localProfile?.phone || broker.phone,
  role: localProfile?.role || 'Broker',
  department: broker.department || broker.company || localProfile?.department || '',
  joinDate:
    localProfile?.joinDate ||
    (broker.createdAt ? String(broker.createdAt).split('T')[0] : new Date().toISOString().split('T')[0]),
  status: toStatus(broker.status),
  permissionLevel: localProfile?.permissionLevel || 'Limited Access',
  specialization: Array.isArray(localProfile?.specialization) ? localProfile.specialization : [],
  avatar: localProfile?.avatar || broker.avatar || localProfile?.profileImage,
  address: localProfile?.address,
  licenseNumber: localProfile?.licenseNumber,
  passwordSentDate: localProfile?.passwordSentDate,
  passwordStatus: localProfile?.passwordStatus,
  lastGeneratedPassword: localProfile?.lastGeneratedPassword,
  passwordError: localProfile?.passwordError,
  notes: localProfile?.notes,
  billingTarget: Number.isFinite(broker.billingTarget) ? Number(broker.billingTarget) : 0,
  currentBilling: Number.isFinite(broker.currentBilling) ? Number(broker.currentBilling) : 0,
  progressPercentage: Number.isFinite(broker.progressPercentage)
    ? Number(broker.progressPercentage)
    : 0,
});

const normalizeBroker = (broker: Partial<BrokerProfile>): BrokerProfile => ({
  id: broker.id || broker.backendId || '',
  backendId: broker.backendId || broker.id,
  name: broker.name || '',
  email: broker.email || '',
  phone: broker.phone || '',
  role: broker.role || 'Broker',
  department: broker.department || '',
  joinDate: broker.joinDate || new Date().toISOString().split('T')[0],
  status: broker.status || 'Active',
  permissionLevel: broker.permissionLevel || 'Limited Access',
  specialization: Array.isArray(broker.specialization) ? broker.specialization : [],
  avatar: broker.avatar,
  address: broker.address,
  licenseNumber: broker.licenseNumber,
  passwordSentDate: broker.passwordSentDate,
  passwordStatus: broker.passwordStatus,
  lastGeneratedPassword: broker.lastGeneratedPassword,
  passwordError: broker.passwordError,
  notes: broker.notes,
  billingTarget: Number.isFinite(broker.billingTarget) ? Number(broker.billingTarget) : 0,
  currentBilling: Number.isFinite(broker.currentBilling) ? Number(broker.currentBilling) : 0,
  progressPercentage: Number.isFinite(broker.progressPercentage)
    ? Number(broker.progressPercentage)
    : 0,
});

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [brokers, setBrokers] = useState<BrokerProfile[]>([]);
  const [archivedBrokers, setArchivedBrokers] = useState<ArchivedBrokerRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'brokers' | 'archived' | 'managers' | 'system'>(
    'brokers'
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBrokers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [apiBrokers, archived, brokerProfileRecords] = await Promise.all([
        brokerService.getAllBrokers(),
        brokerService.getArchivedBrokers(),
        loadBrokerProfileRecords().catch(profileError => {
          console.warn('Failed to load broker profile extras from the database:', profileError);
          return [];
        }),
      ]);

      const brokerProfileMap = new Map<string, Partial<BrokerProfile>>();
      brokerProfileRecords.forEach(record => {
        const payload =
          record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
            ? (record.payload as Partial<BrokerProfile>)
            : {};
        const keys = [
          record.referenceId,
          record.name,
          payload.backendId,
          payload.id,
          payload.email,
        ]
          .map(value => String(value || '').trim().toLowerCase())
          .filter(Boolean);

        keys.forEach(key => {
          brokerProfileMap.set(key, payload);
        });
      });

      setBrokers(
        apiBrokers.map(broker => {
          const localProfile =
            brokerProfileMap.get(broker.id.toLowerCase()) ||
            brokerProfileMap.get(broker.email.toLowerCase());
          return toBrokerProfile(broker, localProfile);
        })
      );
      setArchivedBrokers(archived);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load brokers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBrokers();
  }, [loadBrokers]);

  const handleAddBroker = async (newBrokerInput: Omit<BrokerProfile, 'id'>) => {
    const persistedBrokerId = newBrokerInput.backendId?.trim();
    if (!persistedBrokerId) {
      throw new Error('Broker was not saved because no database ID was returned.');
    }

    const broker = normalizeBroker({
      ...newBrokerInput,
      id: persistedBrokerId,
      backendId: persistedBrokerId,
    });
    setShowAddForm(false);

    try {
      await saveBrokerProfileRecord(
        {
          id: persistedBrokerId,
          email: broker.email,
          name: broker.name,
        },
        toBrokerProfileExtrasPayload(broker)
      );

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('broker-profile:updated', {
            detail: { brokerId: persistedBrokerId, email: broker.email },
          })
        );
      }
    } catch (error) {
      console.warn('Failed to persist broker profile extras:', error);
    }

    await loadBrokers();

    const passwordMessage =
      broker.passwordStatus === 'Sent'
        ? `Password email sent to ${broker.email}.`
        : `Password email could not be sent.${
            broker.lastGeneratedPassword ? ` Temporary password: ${broker.lastGeneratedPassword}` : ''
          }`;

    alert(`Broker ${broker.name} added successfully.\n\n${passwordMessage}`);
  };

  const handleDeleteBroker = async (brokerId: string) => {
    if (!isAdmin) {
      alert('Only admins can archive broker accounts.');
      return;
    }

    if (
      !confirm(
        'Archive this broker?\n\nTheir login will be disabled immediately, while all historical WIP/forecast/deal records remain in the system.'
      )
    )
      return;
    const broker = brokers.find(item => item.id === brokerId);
    if (!broker) return;
    const backendId = broker.backendId?.trim();
    if (!backendId) {
      alert('This broker is missing its database ID. Refresh the page and try again.');
      return;
    }

    try {
      await brokerService.deleteBroker(backendId);
      await loadBrokers();
      alert('Broker archived successfully. Login access has been revoked.');
    } catch (deleteError) {
      alert(
        `Failed to archive broker: ${
          deleteError instanceof Error ? deleteError.message : String(deleteError)
        }`
      );
    }
  };

  const handleDeleteArchivedBroker = async (brokerId: string) => {
    if (!isAdmin) {
      alert('Only admins can permanently delete archived brokers.');
      return;
    }

    const archivedBroker = archivedBrokers.find(item => item.broker.id === brokerId)?.broker;
    if (!archivedBroker) return;

    if (
      !confirm(
        `Delete archived broker "${archivedBroker.name}" permanently?\n\nThis removes them from the Archived Brokers list and anonymizes the record while preserving historical linked data.`
      )
    ) {
      return;
    }

    try {
      await brokerService.deleteBroker(brokerId, { permanent: true });

      const refreshedArchived = await brokerService.getArchivedBrokers();
      setArchivedBrokers(refreshedArchived);

      if (refreshedArchived.some(item => item.broker.id === brokerId)) {
        throw new Error(
          'Permanent delete is not active on the running backend yet. Restart backend and try again.'
        );
      }

      await loadBrokers();
      alert('Archived broker deleted successfully.');
    } catch (deleteError) {
      alert(
        `Failed to delete archived broker: ${
          deleteError instanceof Error ? deleteError.message : String(deleteError)
        }`
      );
    }
  };

  const handleUpdateBroker = (brokerId: string, updates: Partial<BrokerProfile>) => {
    setBrokers(prev =>
      prev.map(broker =>
        broker.id === brokerId ? normalizeBroker({ ...broker, ...updates, id: broker.id }) : broker
      )
    );
  };

  const handleSaveBroker = async (brokerId: string) => {
    const broker = brokers.find(item => item.id === brokerId);
    if (!broker) return;

    const backendId = broker.backendId?.trim();
    if (!backendId) {
      throw new Error('This broker is missing its database ID. Refresh the page and try again.');
    }

    const updated = await brokerService.updateBroker(backendId, {
      name: broker.name,
      email: broker.email,
      phone: broker.phone,
      company: broker.department || undefined,
      department: broker.department || undefined,
      billingTarget: broker.billingTarget,
      avatar: broker.avatar || undefined,
      status: toBackendStatus(broker.status),
    });

    try {
      await saveBrokerProfileRecord(
        {
          id: updated.id,
          email: updated.email,
          name: updated.name,
        },
        toBrokerProfileExtrasPayload(broker)
      );

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('broker-profile:updated', {
            detail: { brokerId: updated.id, email: updated.email },
          })
        );
      }
    } catch (error) {
      console.warn('Failed to persist broker profile extras:', error);
    }

    await loadBrokers();
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-950">Settings & Profile Manager</h1>
      </div>

      <div className="flex gap-2 border-b border-stone-200">
        <button
          onClick={() => setActiveTab('brokers')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'brokers'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-stone-600 hover:text-stone-900'
          }`}
        >
          Broker Profiles ({brokers.length})
        </button>
        <button
          onClick={() => setActiveTab('archived')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'archived'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-stone-600 hover:text-stone-900'
          }`}
        >
          Archived Brokers ({archivedBrokers.length})
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('managers')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 ${
              activeTab === 'managers'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            Managers
          </button>
        )}
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'system'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-stone-600 hover:text-stone-900'
          }`}
        >
          System Settings
        </button>
      </div>

      {activeTab === 'brokers' ? (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="self-start flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + Add New Broker
            </button>
          )}

          {showAddForm && (
            <AddBrokerForm onSubmit={handleAddBroker} onCancel={() => setShowAddForm(false)} />
          )}

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="text-stone-600">Loading brokers...</div>
          ) : (
            <BrokerList
              brokers={brokers}
              canDelete={isAdmin}
              onDelete={handleDeleteBroker}
              onUpdate={handleUpdateBroker}
              onSave={handleSaveBroker}
            />
          )}
        </div>
      ) : activeTab === 'archived' ? (
        isLoading ? (
          <div className="text-stone-600">Loading archived brokers...</div>
        ) : (
          <div className="flex flex-col gap-3 h-full">
            {error && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {error}
              </div>
            )}
            <ArchivedBrokerList
              archivedBrokers={archivedBrokers}
              canDelete={isAdmin}
              onDelete={handleDeleteArchivedBroker}
            />
          </div>
        )
      ) : activeTab === 'managers' ? (
        isAdmin ? (
          <ManagerSettings />
        ) : (
          <div className="text-red-600">Only admins can manage manager accounts.</div>
        )
      ) : (
        <SystemSettingsPanel settings={systemSettings} />
      )}
    </div>
  );
}
