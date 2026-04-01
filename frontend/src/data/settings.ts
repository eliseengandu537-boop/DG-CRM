// Settings and Broker Profile Data

export interface BrokerProfile {
  id: string;
  backendId?: string;
  name: string;
  email: string;
  phone: string;
  role: 'Admin' | 'Senior Broker' | 'Broker' | 'Junior Broker' | 'Analyst';
  department: string;
  joinDate: string;
  status: 'Active' | 'Inactive' | 'On Leave' | 'Archived';
  permissionLevel: 'Full Access' | 'Limited Access' | 'View Only';
  specialization: string[];
  avatar?: string;
  profileImage?: string;
  address?: string;
  licenseNumber?: string;
  // Password email management
  passwordSentDate?: string;
  passwordStatus?: 'Pending' | 'Sent' | 'Used' | 'Expired';
  lastGeneratedPassword?: string;
  passwordError?: string;
  notes?: string;
  billingTarget: number;
  currentBilling: number;
  progressPercentage?: number;
}

export const brokerProfiles: BrokerProfile[] = [];

export interface SystemSettings {
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  timezone: string;
  documentRetentionDays: number;
  autoArchiveMonths: number;
  sessionTimeoutMinutes: number;
}

export const systemSettings: SystemSettings = {
  companyName: 'DG property',
  companyEmail: 'hello@company.local',
  companyPhone: '+27 0XXXXXXXX',
  companyAddress: 'Address hidden',
  timezone: 'Africa/Johannesburg',
  documentRetentionDays: 2555,
  autoArchiveMonths: 36,
  sessionTimeoutMinutes: 30,
};
