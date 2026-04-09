import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiFilter, FiSearch, FiUser, FiPlus } from 'react-icons/fi';
import { Broker, BrokerCard } from './BrokerCard';
import { BrokerDetail } from './BrokerDetail';
import { useAuth } from '@/context/AuthContext';
import { brokerService } from '@/services/brokerService';
import {
  BrokerPerformanceSnapshot,
  fetchBrokerPerformanceMap,
} from '@/services/brokerPerformanceService';
import { useRealtime } from '@/context/RealtimeContext';
import { loadBrokerProfileRecords } from '@/services/profileRecordService';

interface BrokerProfileView {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  department?: string;
  billingTarget: number;
  currentBilling: number;
  progressPercentage: number;
  specialization: string[];
}

const toBrokerCardModel = (brokers: BrokerProfileView[]): Broker[] =>
  brokers.map(profile => ({
    id: profile.id,
    name: profile.name,
    profilePicture:
    profile.avatar ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.name.replace(/\s+/g, '-')}`,
    billingTarget: Number.isFinite(profile.billingTarget) ? profile.billingTarget : 0,
    currentBilling: Number.isFinite(profile.currentBilling) ? profile.currentBilling : 0,
    progressPercentage: Number.isFinite(profile.progressPercentage)
      ? profile.progressPercentage
      : 0,
    department: profile.department,
    type: profile.department ? profile.department.toUpperCase() : undefined,
    segments:
      Array.isArray(profile.specialization) && profile.specialization.length > 0
        ? profile.specialization
        : ['General'],
  }));

export const BrokerProfiles: React.FC = () => {
  const { socket } = useRealtime();
  const { user } = useAuth();
  const [brokerList, setBrokerList] = useState<BrokerProfileView[]>([]);
  const [brokerPerformance, setBrokerPerformance] = useState<
    Record<string, BrokerPerformanceSnapshot>
  >({});
  const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'target-pct' | 'billings'>('target-pct');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myBrokerProfile, setMyBrokerProfile] = useState<Broker | null>(null);
  const [checkingMyProfile, setCheckingMyProfile] = useState(false);
  const [creatingMyProfile, setCreatingMyProfile] = useState(false);
  const [createProfileError, setCreateProfileError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProfilePhone, setNewProfilePhone] = useState('');
  const [newProfileDept, setNewProfileDept] = useState<'sales' | 'leasing'>('sales');

  const isPrivileged = user?.role === 'admin' || user?.role === 'manager';

  const loadBrokers = useCallback(async (showLoader: boolean) => {
    try {
      if (showLoader) setIsLoading(true);
      setError(null);

      const [apiBrokers, performanceMap, savedProfiles] = await Promise.all([
        brokerService.getAllBrokers(),
        fetchBrokerPerformanceMap(),
        loadBrokerProfileRecords().catch(profileError => {
          console.warn('Failed to load broker profile extras from the database:', profileError);
          return [];
        }),
      ]);

      const specializationMap = new Map<string, string[]>();
      savedProfiles.forEach(record => {
        const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
          ? (record.payload as Record<string, unknown>)
          : {};
        const specialization = Array.isArray(payload.specialization)
          ? payload.specialization.filter(Boolean).map(value => String(value))
          : [];

        if (specialization.length === 0) return;

        const keys = [
          record.referenceId,
          record.name,
          payload.id,
          payload.backendId,
          payload.email,
        ]
          .map(value => String(value || '').trim().toLowerCase())
          .filter(Boolean);

        keys.forEach(key => specializationMap.set(key, specialization));
      });

      setBrokerPerformance(performanceMap);
      setBrokerList(
        apiBrokers.map(broker => {
          const specialization =
            specializationMap.get(broker.id) ??
            specializationMap.get(broker.email.trim().toLowerCase()) ??
            [];

          return {
            id: broker.id,
            name: broker.name,
            email: broker.email,
            avatar: broker.avatar,
            department: broker.department,
            billingTarget: Number.isFinite(broker.billingTarget) ? Number(broker.billingTarget) : 0,
            currentBilling: Number.isFinite(broker.currentBilling) ? Number(broker.currentBilling) : 0,
            progressPercentage: Number.isFinite(broker.progressPercentage)
              ? Number(broker.progressPercentage)
              : 0,
            specialization,
          };
        })
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load brokers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBrokers(true);
  }, [loadBrokers]);

  // Load own broker profile for admin/manager
  useEffect(() => {
    if (!isPrivileged) return;
    setCheckingMyProfile(true);
    brokerService.getMyBrokerProfile().then(profile => {
      if (profile) {
        setMyBrokerProfile(toBrokerCardModel([{
          id: profile.id,
          name: profile.name,
          email: profile.email,
          avatar: profile.avatar,
          department: profile.department,
          billingTarget: Number(profile.billingTarget || 0),
          currentBilling: Number(profile.currentBilling || 0),
          progressPercentage: Number(profile.progressPercentage || 0),
          specialization: [],
        }])[0]);
      }
      setCheckingMyProfile(false);
    }).catch(() => setCheckingMyProfile(false));
  }, [isPrivileged]);

  useEffect(() => {
    const refresh = () => void loadBrokers(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('broker-profile:updated', refresh);
      window.addEventListener('profile:updated', refresh);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('broker-profile:updated', refresh);
        window.removeEventListener('profile:updated', refresh);
      }
    };
  }, [loadBrokers]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadBrokers(false);
    }, 60000);

    return () => clearInterval(interval);
  }, [loadBrokers]);

  useEffect(() => {
    if (!socket) return;

    const refresh = () => void loadBrokers(false);

    socket.on('dashboard:refresh', refresh);
    socket.on('deal:created', refresh);
    socket.on('deal:updated', refresh);
    socket.on('deal:deleted', refresh);
    socket.on('forecast-deal:created', refresh);
    socket.on('forecast-deal:updated', refresh);
    socket.on('forecast-deal:deleted', refresh);
    socket.on('broker:created', refresh);
    socket.on('broker:updated', refresh);
    socket.on('broker:deleted', refresh);

    return () => {
      socket.off('dashboard:refresh', refresh);
      socket.off('deal:created', refresh);
      socket.off('deal:updated', refresh);
      socket.off('deal:deleted', refresh);
      socket.off('forecast-deal:created', refresh);
      socket.off('forecast-deal:updated', refresh);
      socket.off('forecast-deal:deleted', refresh);
      socket.off('broker:created', refresh);
      socket.off('broker:updated', refresh);
      socket.off('broker:deleted', refresh);
    };
  }, [socket, loadBrokers]);

  const BROKERS: Broker[] = useMemo(() => toBrokerCardModel(brokerList), [brokerList]);
  const selectedBroker = useMemo(
    () => (selectedBrokerId ? BROKERS.find(broker => broker.id === selectedBrokerId) || null : null),
    [BROKERS, selectedBrokerId]
  );
  const selectedBrokerWipSheets = useMemo(
    () => (selectedBrokerId ? brokerPerformance[selectedBrokerId]?.wipItems || [] : []),
    [brokerPerformance, selectedBrokerId]
  );
  const isBrokerUser = user?.role === 'broker';
  const currentUserEmail = user?.email?.trim().toLowerCase() || '';
  const ownBrokerId =
    brokerList.find(profile => profile.email?.trim().toLowerCase() === currentUserEmail)?.id || '';

  const handleCreateMyProfile = async () => {
    if (!user || creatingMyProfile) return;
    const phone = newProfilePhone.trim();
    const digits = phone.replace(/\D/g, '');
    if (!phone || digits.length < 7 || digits.length > 15) {
      setCreateProfileError('Please enter a valid phone number (7–15 digits).');
      return;
    }
    setCreatingMyProfile(true);
    setCreateProfileError(null);
    try {
      await brokerService.createBroker({
        name: user.name,
        email: user.email,
        phone,
        department: newProfileDept,
      });
      const profile = await brokerService.getMyBrokerProfile();
      if (profile) {
        setMyBrokerProfile(toBrokerCardModel([{
          id: profile.id,
          name: profile.name,
          email: profile.email,
          avatar: profile.avatar,
          department: profile.department,
          billingTarget: Number(profile.billingTarget || 0),
          currentBilling: Number(profile.currentBilling || 0),
          progressPercentage: Number(profile.progressPercentage || 0),
          specialization: [],
        }])[0]);
      }
      void loadBrokers(false);
    } catch (err) {
      setCreateProfileError(err instanceof Error ? err.message : 'Failed to create profile');
    } finally {
      setCreatingMyProfile(false);
    }
  };

  const filteredBrokers = BROKERS.filter(broker => {
    if (!broker.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    // Hide the current user's own card from the list when it's already shown in "My Profile"
    if (isPrivileged && myBrokerProfile && broker.id === myBrokerProfile.id) return false;
    return true;
  });

  const sortedBrokers = [...filteredBrokers].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'target-pct') {
      const aPercent = Number.isFinite(Number(a.progressPercentage))
        ? Number(a.progressPercentage)
        : a.billingTarget > 0
        ? (a.currentBilling / a.billingTarget) * 100
        : 0;
      const bPercent = Number.isFinite(Number(b.progressPercentage))
        ? Number(b.progressPercentage)
        : b.billingTarget > 0
        ? (b.currentBilling / b.billingTarget) * 100
        : 0;
      return bPercent - aPercent;
    }
    return b.currentBilling - a.currentBilling;
  });

  if (selectedBroker) {
    return (
      <BrokerDetail
        broker={selectedBroker}
        onBack={() => setSelectedBrokerId(null)}
        wipSheets={selectedBrokerWipSheets}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-stone-950 mb-2">Broker Profiles</h1>
        <p className="text-stone-600">
          Manage and track individual broker performance and WIP sheets
        </p>
        {isBrokerUser && (
          <p className="text-xs text-amber-700 mt-2">
            You can open and work only on your own broker profile.
          </p>
        )}
      </div>

      {/* Admin / Manager — own profile section */}
      {isPrivileged && (
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <FiUser size={18} className="text-violet-600" />
            <h2 className="font-bold text-stone-900 text-base">My Profile</h2>
            <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full capitalize">{user?.role}</span>
          </div>
          {checkingMyProfile ? (
            <p className="text-sm text-stone-400 animate-pulse">Checking for your broker profile…</p>
          ) : myBrokerProfile ? (
            <div className="flex items-center gap-4">
              <BrokerCard
                broker={myBrokerProfile}
                onSelect={() => setSelectedBrokerId(myBrokerProfile.id)}
              />
              <p className="text-xs text-stone-500 max-w-xs">
                This is your personal WIP sheet and broker profile. Click it to manage your
                deals, commissions, and activity.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-4">
              <div className="w-full max-w-md">
                <p className="text-sm text-stone-600 mb-3">
                  You don&apos;t have a broker profile yet. Create one to get your own WIP
                  sheet, track deals, and appear in broker performance reports.
                </p>
                {!showCreateForm ? (
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="inline-flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors"
                  >
                    <FiPlus size={16} />
                    Create My Broker Profile
                  </button>
                ) : (
                  <div className="space-y-3 bg-white border border-violet-200 rounded-lg p-4">
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">Phone number</label>
                      <input
                        type="tel"
                        value={newProfilePhone}
                        onChange={e => { setNewProfilePhone(e.target.value); setCreateProfileError(null); }}
                        placeholder="e.g. 0821234567"
                        className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">Department</label>
                      <select
                        value={newProfileDept}
                        onChange={e => setNewProfileDept(e.target.value as 'sales' | 'leasing')}
                        className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      >
                        <option value="sales">Sales</option>
                        <option value="leasing">Leasing</option>
                      </select>
                    </div>
                    {createProfileError && (
                      <p className="text-sm text-red-600">{createProfileError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleCreateMyProfile()}
                        disabled={creatingMyProfile}
                        className="inline-flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
                      >
                        <FiPlus size={16} />
                        {creatingMyProfile ? 'Creating…' : 'Create Profile'}
                      </button>
                      <button
                        onClick={() => { setShowCreateForm(false); setCreateProfileError(null); }}
                        className="px-4 py-2 rounded-lg text-sm font-semibold border border-stone-300 text-stone-600 hover:bg-stone-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="relative col-span-2">
            <FiSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search brokers by name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <FiFilter size={18} className="text-stone-600" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'name' | 'target-pct' | 'billings')}
              className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="target-pct">Sort: Progress % (High to Low)</option>
              <option value="billings">Sort: Billings (High to Low)</option>
              <option value="name">Sort: Name (A to Z)</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-stone-600">Loading broker profiles...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-600">{error}</div>
      ) : sortedBrokers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-stone-600">No brokers found matching your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedBrokers.map(broker => (
            <BrokerCard
              key={broker.id}
              broker={broker}
              disabled={isBrokerUser && broker.id !== ownBrokerId}
              note={isBrokerUser && broker.id !== ownBrokerId ? 'Read-only profile' : undefined}
              onSelect={selected => {
                if (isBrokerUser && selected.id !== ownBrokerId) return;
                setSelectedBrokerId(selected.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
