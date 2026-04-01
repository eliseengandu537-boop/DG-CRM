import React, { useEffect, useMemo, useState } from "react";
import { FiLogOut, FiUser, FiChevronUp } from "react-icons/fi";
import { useAuth } from "@/context/AuthContext";
import {
  loadBrokerProfileRecord,
  loadUserProfileRecord,
} from "@/services/profileRecordService";

interface PlanProps {
  onPageChange?: (page: string) => void;
}

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

const DEFAULT_PROFILE: UserProfileData = {
  name: "User",
  role: "",
  email: "",
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
    clientsSatisfaction: "100%",
  },
};

export const Plan: React.FC<PlanProps> = ({ onPageChange }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfileData>(DEFAULT_PROFILE);
  const [managerBrokerProfile, setManagerBrokerProfile] = useState<BrokerDirectoryEntry | null>(null);
  const { logout, user } = useAuth();

  const formatRole = (role: string): string => {
    if (!role) return "";
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  };

  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "U";
    return parts
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || "")
      .join("");
  };

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        const [userRecord, brokerRecord] = await Promise.all([
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

        const brokerPayload = brokerRecord ? (brokerRecord.payload as BrokerDirectoryEntry) : null;
        const profilePayload =
          userRecord && typeof userRecord.payload === 'object' && !Array.isArray(userRecord.payload)
            ? (userRecord.payload as Partial<UserProfileData>)
            : {};

        const resolved = {
          ...DEFAULT_PROFILE,
          ...profilePayload,
          ...(brokerPayload
            ? {
                phone: brokerPayload.phone || profilePayload.phone || DEFAULT_PROFILE.phone,
                department: brokerPayload.department || profilePayload.department || DEFAULT_PROFILE.department,
                joinDate: brokerPayload.joinDate || profilePayload.joinDate || DEFAULT_PROFILE.joinDate,
                status: brokerPayload.status || profilePayload.status || DEFAULT_PROFILE.status,
                licenseNumber: brokerPayload.licenseNumber || profilePayload.licenseNumber || DEFAULT_PROFILE.licenseNumber,
                specialization: brokerPayload.specialization || profilePayload.specialization || DEFAULT_PROFILE.specialization,
                address: brokerPayload.address || profilePayload.address || DEFAULT_PROFILE.address,
                profileImage: brokerPayload.avatar || profilePayload.profileImage || profilePayload.avatar,
              }
            : {}),
        } as UserProfileData;

        const resolvedProfile = {
          ...resolved,
          name: user?.name?.trim() || brokerPayload?.name || resolved.name || DEFAULT_PROFILE.name,
          email: user?.email || resolved.email,
          role: user?.role ? formatRole(user.role) : resolved.role,
          avatar: getInitials(user?.name?.trim() || brokerPayload?.name || resolved.name || DEFAULT_PROFILE.name),
        };

        setManagerBrokerProfile(brokerPayload);
        setUserProfile(resolvedProfile);
      } catch (error) {
        if (!mounted) return;
        console.error('Error loading profile:', error);
        const resolvedProfile = {
          ...DEFAULT_PROFILE,
          name: user?.name?.trim() || DEFAULT_PROFILE.name,
          email: user?.email || DEFAULT_PROFILE.email,
          role: user?.role ? formatRole(user.role) : DEFAULT_PROFILE.role,
          avatar: getInitials(user?.name?.trim() || DEFAULT_PROFILE.name),
        };
        setManagerBrokerProfile(null);
        setUserProfile(resolvedProfile);
      }
    };

    void loadProfile();

    const refreshOnProfileUpdate = () => {
      void loadProfile();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('profile:updated', refreshOnProfileUpdate);
      window.addEventListener('broker-profile:updated', refreshOnProfileUpdate);
    }

    return () => {
      mounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('profile:updated', refreshOnProfileUpdate);
        window.removeEventListener('broker-profile:updated', refreshOnProfileUpdate);
      }
    };
  }, [user?.brokerId, user?.email, user?.id, user?.name, user?.role]);

  const displayProfile = useMemo(() => {
    const isBroker = user?.role === 'broker';
    const brokerSource = isBroker ? managerBrokerProfile : null;
    const resolvedName = user?.name?.trim() || brokerSource?.name || userProfile.name;
    return {
      ...userProfile,
      ...(brokerSource
        ? {
            phone: brokerSource.phone || userProfile.phone,
            department: brokerSource.department || userProfile.department,
            joinDate: brokerSource.joinDate || userProfile.joinDate,
            status: brokerSource.status || userProfile.status,
            licenseNumber: brokerSource.licenseNumber || userProfile.licenseNumber,
            specialization: brokerSource.specialization || userProfile.specialization,
            address: brokerSource.address || userProfile.address,
          }
        : {}),
      name: resolvedName,
      email: user?.email || userProfile.email,
      role: user?.role ? formatRole(user.role) : userProfile.role,
      profileImage: brokerSource?.avatar || userProfile.profileImage,
      avatar: getInitials(resolvedName || userProfile.name),
    };
  }, [managerBrokerProfile, user?.email, user?.name, user?.role, userProfile]);

  const handleLogout = async () => {
    setShowMenu(false);
    try {
      await logout();
    } catch {
      window.location.href = '/login';
    }
  };

  const handleProfile = () => {
    onPageChange?.("User Profile");
    setShowMenu(false);
  };

  return (
    <div className="flex sticky top-[calc(100vh_-_48px_-_16px)] flex-col gap-3 border-t px-2 border-stone-300 justify-end py-3 text-xs">
      {/* User Profile Section - Clickable */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-3 hover:bg-stone-100 rounded-lg p-2 transition-colors text-left w-full"
      >
        {displayProfile.profileImage ? (
          <img
            src={displayProfile.profileImage}
            alt="avatar"
            className="w-10 h-10 rounded-full shrink-0 object-cover"
          />
        ) : (
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-violet-500 text-white font-semibold flex-shrink-0">
            {displayProfile.avatar}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-stone-950 truncate">{displayProfile.name}</p>
          <p className="text-stone-500 text-xs truncate">{displayProfile.role}</p>
        </div>
        <FiChevronUp
          size={16}
          className={`flex-shrink-0 transition-transform ${showMenu ? "rotate-0" : "rotate-180"}`}
        />
      </button>

      {/* Dropdown Menu - Fixed position to prevent movement */}
      {showMenu && (
        <div className="absolute bottom-16 left-0 right-0 mx-2 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden z-50">
          {/* Profile Option */}
          <button
            onClick={handleProfile}
            className="flex items-center gap-3 w-full px-4 py-2 hover:bg-stone-100 transition-colors text-left text-sm font-medium text-stone-900 border-b border-stone-200"
          >
            <FiUser size={16} className="text-stone-600" />
            View Profile
          </button>

          {/* Logout Option */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2 hover:bg-red-50 transition-colors text-left text-sm font-medium text-red-600"
          >
            <FiLogOut size={16} />
            Logout
          </button>
        </div>
      )}
    </div>
  );
};
