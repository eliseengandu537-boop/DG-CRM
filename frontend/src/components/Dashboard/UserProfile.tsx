'use client';

import React, { useState, useEffect } from 'react';
import { FiArrowLeft, FiMail, FiPhone, FiBriefcase, FiCalendar, FiAward, FiMapPin, FiEdit2, FiSave, FiX } from 'react-icons/fi';
import { useAuth } from '@/context/AuthContext';
import { brokerService } from '@/services/brokerService';
import {
  loadBrokerProfileRecord,
  loadUserProfileRecord,
  saveBrokerProfileRecord,
  saveUserProfileRecord,
} from '@/services/profileRecordService';

interface UserProfileData {
  name: string;
  role: string;
  email: string;
  phone: string;
  department: string;
  joinDate: string;
  avatar: string;
  profileImage?: string;
  status: string;
  licenseNumber: string;
  specialization: string[];
  address: string;
  aboutMe: string;
  statistics: {
    dealsCompleted: number;
    activeDeals: number;
    totalCommission: string;
    clientsSatisfaction: string;
  };
}

interface BrokerDirectoryEntry {
  name?: string;
  email?: string;
  phone?: string;
  department?: string;
  joinDate?: string;
  status?: string;
  licenseNumber?: string;
  specialization?: string[];
  address?: string;
  avatar?: string;
}

interface UserProfileProps {
  onBack?: () => void;
}

const DEFAULT_PROFILE: UserProfileData = {
  name: "User",
  role: "",
  email: "user@local",
  phone: "",
  department: "",
  joinDate: "",
  avatar: "U",
  profileImage: undefined,
  status: "Active",
  licenseNumber: "",
  specialization: [],
  address: "",
  aboutMe: "",
  statistics: {
    dealsCompleted: 0,
    activeDeals: 0,
    totalCommission: "R0",
    clientsSatisfaction: "",
  },
};

export const UserProfile: React.FC<UserProfileProps> = ({ onBack }) => {
  const { user } = useAuth();
  const [managerBrokerProfile, setManagerBrokerProfile] = useState<BrokerDirectoryEntry | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileData>(DEFAULT_PROFILE);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(DEFAULT_PROFILE);
  const [newSpecialization, setNewSpecialization] = useState('');

  const formatRole = (role: string): string => {
    if (!role) return '';
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  };

  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    return parts
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || '')
      .join('');
  };

  const applyAuthIdentity = (
    profile: UserProfileData,
    managedProfile: BrokerDirectoryEntry | null = managerBrokerProfile
  ): UserProfileData => {
    const isBroker = user?.role === 'broker';
    const brokerSource = isBroker ? managedProfile : null;
    const resolvedName =
      user?.name?.trim() || brokerSource?.name || profile.name || DEFAULT_PROFILE.name;

    const merged = {
      ...profile,
      ...(brokerSource
        ? {
            phone: brokerSource.phone || profile.phone,
            department: brokerSource.department || profile.department,
            joinDate: brokerSource.joinDate || profile.joinDate,
            status: brokerSource.status || profile.status,
            licenseNumber: brokerSource.licenseNumber || profile.licenseNumber,
            specialization: brokerSource.specialization || profile.specialization,
            address: brokerSource.address || profile.address,
            profileImage: brokerSource.avatar || profile.profileImage || profile.avatar,
          }
        : {}),
    };

    return {
      ...merged,
      name: resolvedName,
      email: user?.email || merged.email,
      role: user?.role ? formatRole(user.role) : merged.role,
      avatar: getInitials(resolvedName),
    };
  };

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        const [userRecordResult, brokerRecordResult] = await Promise.allSettled([
          user?.id
            ? loadUserProfileRecord({
                id: user.id,
                email: user.email,
                name: user.name,
              })
            : Promise.resolve(null),
          user?.role === 'broker'
            ? loadBrokerProfileRecord({
                id: user.brokerId || user.id,
                email: user.email,
                name: user.name,
              })
            : Promise.resolve(null),
        ]);

        if (!mounted) return;

        if (userRecordResult.status === 'rejected') {
          console.warn('Failed to load user profile record from the database:', userRecordResult.reason);
        }
        if (brokerRecordResult.status === 'rejected') {
          console.warn('Failed to load broker profile record from the database:', brokerRecordResult.reason);
        }

        const userRecord = userRecordResult.status === 'fulfilled' ? userRecordResult.value : null;
        const brokerRecord =
          brokerRecordResult.status === 'fulfilled' ? brokerRecordResult.value : null;
        const brokerPayload = brokerRecord ? (brokerRecord.payload as BrokerDirectoryEntry) : null;
        const resolvedProfile = applyAuthIdentity(
          {
            ...DEFAULT_PROFILE,
            ...(userRecord?.payload && typeof userRecord.payload === 'object' ? userRecord.payload : {}),
          },
          brokerPayload
        );

        setManagerBrokerProfile(brokerPayload);
        setUserProfile(resolvedProfile);
        setEditData(resolvedProfile);
      } catch (error) {
        if (!mounted) return;
        console.error('Error loading profile:', error);
        const resolvedProfile = applyAuthIdentity(DEFAULT_PROFILE, null);
        setManagerBrokerProfile(null);
        setUserProfile(resolvedProfile);
        setEditData(resolvedProfile);
      }
    };

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [user?.brokerId, user?.email, user?.id, user?.name, user?.role]);

  const handleInputChange = (field: string, value: string) => {
    setEditData({
      ...editData,
      [field]: value,
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditData({
          ...editData,
          profileImage: reader.result as string,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddSpecialization = () => {
    if (newSpecialization.trim()) {
      setEditData({
        ...editData,
        specialization: [...editData.specialization, newSpecialization],
      });
      setNewSpecialization('');
    }
  };

  const handleRemoveSpecialization = (index: number) => {
    setEditData({
      ...editData,
      specialization: editData.specialization.filter((_, i) => i !== index),
    });
  };

  const handleSave = async () => {
    const resolvedProfile = applyAuthIdentity(editData, managerBrokerProfile);
    const profilePayload = {
      aboutMe: resolvedProfile.aboutMe,
      phone: resolvedProfile.phone,
      department: resolvedProfile.department,
      joinDate: resolvedProfile.joinDate,
      avatar: resolvedProfile.profileImage || resolvedProfile.avatar,
      profileImage: resolvedProfile.profileImage,
      status: resolvedProfile.status,
      licenseNumber: resolvedProfile.licenseNumber,
      specialization: resolvedProfile.specialization,
      address: resolvedProfile.address,
      role: resolvedProfile.role,
      name: resolvedProfile.name,
      email: resolvedProfile.email,
    };

    try {
      if (user?.role === 'broker' && user.brokerId) {
        await brokerService.updateBroker(user.brokerId, {
          phone: resolvedProfile.phone,
          avatar: resolvedProfile.profileImage || resolvedProfile.avatar || undefined,
        });
      }

      if (user?.id) {
        await saveUserProfileRecord(
          {
            id: user.id,
            email: user.email,
            name: user.name,
          },
          profilePayload
        );
      }

      if (user?.role === 'broker') {
        await saveBrokerProfileRecord(
          {
            id: user.brokerId || user.id,
            email: user.email,
            name: user.name,
          },
          profilePayload
        );
      }

      setUserProfile(resolvedProfile);
      setEditData(resolvedProfile);
      setIsEditing(false);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('profile:updated', {
            detail: {
              userId: user?.id,
              brokerId: user?.brokerId || user?.id || null,
            },
          })
        );
      }

      alert('Profile updated and saved to the database successfully!');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save profile to the database');
    }
  };

  const handleCancel = () => {
    setEditData(userProfile);
    setIsEditing(false);
  };

  const displayData = isEditing ? editData : userProfile;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-stone-100 transition-colors"
              title="Go back"
            >
              <FiArrowLeft size={20} className="text-stone-600" />
            </button>
          )}
          <div>
            <h1 className="text-3xl font-bold text-stone-950">User Profile</h1>
            <p className="text-stone-500 mt-1">View and manage your profile information</p>
          </div>
        </div>

        {/* Edit/Save/Cancel Buttons */}
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors font-medium"
            >
              <FiEdit2 size={18} />
              Edit Profile
            </button>
          ) : (
            <>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium"
              >
                <FiSave size={18} />
                Save Changes
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 bg-stone-300 text-stone-950 rounded-lg hover:bg-stone-400 transition-colors font-medium"
              >
                <FiX size={18} />
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Profile Header Card */}
      <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-lg p-8 border border-violet-200">
        <div className="flex items-start gap-6">
          {/* Avatar with Upload */}
          <div className="relative flex-shrink-0">
            {displayData.profileImage ? (
              <img
                src={displayData.profileImage}
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
              />
            ) : (
              <div className="flex items-center justify-center w-24 h-24 rounded-full bg-violet-500 text-white font-bold text-2xl">
                {displayData.avatar}
              </div>
            )}
            {isEditing && (
              <label className="absolute bottom-0 right-0 flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white cursor-pointer hover:bg-blue-600 shadow-lg">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                </svg>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <div className="flex-1">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={editData.name}
                    readOnly
                    className="w-full px-3 py-2 border border-violet-300 rounded-lg bg-stone-100 text-stone-700 cursor-not-allowed"
                  />
                  <p className="text-xs text-stone-500 mt-1">Name comes from your login account.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Role</label>
                  <input
                    type="text"
                    value={editData.role}
                    readOnly
                    className="w-full px-3 py-2 border border-violet-300 rounded-lg bg-stone-100 text-stone-700 cursor-not-allowed"
                  />
                  <p className="text-xs text-stone-500 mt-1">Role comes from your login account.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">About Me</label>
                  <textarea
                    value={editData.aboutMe}
                    onChange={(e) => handleInputChange('aboutMe', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-violet-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-stone-950">{displayData.name}</h2>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-sm font-semibold rounded-full">
                    {displayData.status}
                  </span>
                </div>
                <p className="text-lg text-violet-600 font-semibold mb-3">{displayData.role}</p>
                <p className="text-stone-600 max-w-2xl">{displayData.aboutMe}</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="bg-stone-50 rounded-lg p-4 border border-stone-200">
          <p className="text-stone-500 text-sm font-medium mb-2">Deals Completed</p>
          <p className="text-2xl font-bold text-stone-950">{displayData.statistics.dealsCompleted}</p>
        </div>
        <div className="bg-stone-50 rounded-lg p-4 border border-stone-200">
          <p className="text-stone-500 text-sm font-medium mb-2">Active Deals</p>
          <p className="text-2xl font-bold text-stone-950">{displayData.statistics.activeDeals}</p>
        </div>
        <div className="bg-stone-50 rounded-lg p-4 border border-stone-200">
          <p className="text-stone-500 text-sm font-medium mb-2">Total Commission</p>
          <p className="text-xl font-bold text-stone-950">{displayData.statistics.totalCommission}</p>
        </div>
      </div>

      {/* Contact & Professional Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact Information */}
        <div className="bg-white rounded-lg p-6 border border-stone-200">
          <h3 className="text-lg font-bold text-stone-950 mb-4">Contact Information</h3>
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editData.email}
                  readOnly
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg bg-stone-100 text-stone-700 cursor-not-allowed"
                />
                <p className="text-xs text-stone-500 mt-1">Email comes from your login account.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Address</label>
                <input
                  type="text"
                  value={editData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <FiMail size={20} className="text-violet-500 flex-shrink-0" />
                <div>
                  <p className="text-stone-500 text-sm">Email</p>
                  <p className="text-stone-950 font-medium">{displayData.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <FiPhone size={20} className="text-violet-500 flex-shrink-0" />
                <div>
                  <p className="text-stone-500 text-sm">Phone</p>
                  <p className="text-stone-950 font-medium">{displayData.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <FiMapPin size={20} className="text-violet-500 flex-shrink-0" />
                <div>
                  <p className="text-stone-500 text-sm">Address</p>
                  <p className="text-stone-950 font-medium text-sm">{displayData.address}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Professional Information */}
        <div className="bg-white rounded-lg p-6 border border-stone-200">
          <h3 className="text-lg font-bold text-stone-950 mb-4">Professional Information</h3>
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Department</label>
                <input
                  type="text"
                  value={editData.department}
                  onChange={(e) => handleInputChange('department', e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">License Number</label>
                <input
                  type="text"
                  value={editData.licenseNumber}
                  onChange={(e) => handleInputChange('licenseNumber', e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <FiBriefcase size={20} className="text-violet-500 flex-shrink-0" />
                <div>
                  <p className="text-stone-500 text-sm">Department</p>
                  <p className="text-stone-950 font-medium">{displayData.department}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <FiCalendar size={20} className="text-violet-500 flex-shrink-0" />
                <div>
                  <p className="text-stone-500 text-sm">Join Date</p>
                  <p className="text-stone-950 font-medium">{displayData.joinDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <FiAward size={20} className="text-violet-500 flex-shrink-0" />
                <div>
                  <p className="text-stone-500 text-sm">License Number</p>
                  <p className="text-stone-950 font-medium">{displayData.licenseNumber}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Specializations */}
      <div className="bg-white rounded-lg p-6 border border-stone-200">
        <h3 className="text-lg font-bold text-stone-950 mb-4">Specializations</h3>
        {isEditing ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 mb-4">
              {editData.specialization.map((spec, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-violet-100 text-violet-700 rounded-full text-sm font-semibold">
                  {spec}
                  <button
                    onClick={() => handleRemoveSpecialization(idx)}
                    className="text-violet-600 hover:text-violet-900 font-bold"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSpecialization}
                onChange={(e) => setNewSpecialization(e.target.value)}
                placeholder="Add new specialization"
                className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button
                onClick={handleAddSpecialization}
                className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {displayData.specialization.map((spec, idx) => (
              <span
                key={idx}
                className="px-4 py-2 bg-violet-100 text-violet-700 rounded-full text-sm font-semibold"
              >
                {spec}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
