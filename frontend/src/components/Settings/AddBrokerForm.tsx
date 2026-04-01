'use client';

import React, { useState } from 'react';
import { FiLoader, FiX } from 'react-icons/fi';
import { BrokerProfile } from '@/data/settings';
import { brokerService } from '@/services/brokerService';
import { optimizeAvatarForStorage } from '@/utils/avatarStorage';

interface AddBrokerFormProps {
  onSubmit: (broker: Omit<BrokerProfile, 'id'>) => Promise<void> | void;
  onCancel: () => void;
}

const normalizePhoneForSubmit = (value: string): string => {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  return trimmed.startsWith('+') ? `+${digits}` : digits;
};

export default function AddBrokerForm({ onSubmit, onCancel }: AddBrokerFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'Broker' as BrokerProfile['role'],
    department: '',
    joinDate: new Date().toISOString().split('T')[0],
    status: 'Active' as BrokerProfile['status'],
    permissionLevel: 'Limited Access' as BrokerProfile['permissionLevel'],
    specialization: [] as string[],
    address: '',
    licenseNumber: '',
    avatar: '',
    billingTarget: 0,
  });

  const [specInput, setSpecInput] = useState('');
  const [previewImage, setPreviewImage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordSendStatus, setPasswordSendStatus] = useState<
    'idle' | 'sending' | 'success' | 'warning' | 'error'
  >('idle');
  const [passwordSendMessage, setPasswordSendMessage] = useState('');

  const departments = [
    'Commercial Real Estate',
    'Leasing',
    'Sales',
    'Fund Management',
    'Operations',
    'Research',
    'Administration',
  ];

  const roles = ['Admin', 'Senior Broker', 'Broker', 'Junior Broker', 'Analyst'] as const;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === 'billingTarget') {
      const numeric = Number(value);
      setFormData(prev => ({ ...prev, [name]: Number.isFinite(numeric) ? numeric : 0 }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const optimizedAvatar = await optimizeAvatarForStorage(file);
        setFormData(prev => ({ ...prev, avatar: optimizedAvatar }));
        setPreviewImage(optimizedAvatar);
      } catch (error) {
        console.error('Avatar processing failed:', error);
        alert('Could not process this image. Please choose another one.');
      }
    })();
  };

  const handleAddSpecialization = () => {
    if (specInput.trim() && !formData.specialization.includes(specInput.trim())) {
      setFormData(prev => ({
        ...prev,
        specialization: [...prev.specialization, specInput.trim()],
      }));
      setSpecInput('');
    }
  };

  const handleRemoveSpecialization = (spec: string) => {
    setFormData(prev => ({
      ...prev,
      specialization: prev.specialization.filter(s => s !== spec),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedPhone = normalizePhoneForSubmit(formData.phone);
    if (!formData.name.trim() || !formData.email.trim() || !normalizedPhone) {
      alert('Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    setPasswordSendStatus('sending');
    setPasswordSendMessage('');

    try {
      const result = await brokerService.createBroker({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: normalizedPhone,
        company: formData.department || undefined,
        department: formData.department || undefined,
        billingTarget: formData.billingTarget,
        avatar: formData.avatar || undefined,
        status: formData.status === 'Active' ? 'active' : 'inactive',
      });

      if (result.passwordSent) {
        setPasswordSendStatus('success');
        setPasswordSendMessage(`Broker added and password email sent to ${formData.email}`);
      } else {
        setPasswordSendStatus('warning');
        const passwordHint = result.temporaryPassword
          ? ` Temporary password: ${result.temporaryPassword}`
          : '';
        setPasswordSendMessage(
          `Broker added, but password email failed: ${
            result.passwordError || 'SMTP unavailable'
          }.${passwordHint}`
        );
      }

      await onSubmit({
        ...formData,
        phone: normalizedPhone,
        billingTarget: formData.billingTarget,
        currentBilling: Number.isFinite(result.broker.currentBilling)
          ? Number(result.broker.currentBilling)
          : 0,
        progressPercentage: Number.isFinite(result.broker.progressPercentage)
          ? Number(result.broker.progressPercentage)
          : 0,
        backendId: result.broker.id,
        passwordSentDate: new Date().toISOString(),
        passwordStatus: result.passwordSent ? 'Sent' : 'Pending',
        lastGeneratedPassword: result.temporaryPassword,
        passwordError: result.passwordError,
      });
    } catch (error) {
      setPasswordSendStatus('error');
      setPasswordSendMessage(
        `Failed to add broker: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg border border-stone-200 shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-stone-900">+ Add New Broker</h3>
        <button onClick={onCancel} className="p-1 hover:bg-stone-100 rounded transition-colors">
          <FiX size={20} className="text-stone-600" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter broker name"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Email *</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter email address"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Phone *</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="Enter phone number"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">License Number</label>
            <input
              type="text"
              name="licenseNumber"
              value={formData.licenseNumber}
              onChange={handleChange}
              placeholder="e.g., REC-2024-001"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Role</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {roles.map(role => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Department</label>
            <select
              name="department"
              value={formData.department}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a department</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="On Leave">On Leave</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Permission Level</label>
            <select
              name="permissionLevel"
              value={formData.permissionLevel}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="View Only">View Only</option>
              <option value="Limited Access">Limited Access</option>
              <option value="Full Access">Full Access</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Join Date</label>
            <input
              type="date"
              name="joinDate"
              value={formData.joinDate}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Address</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Enter full address"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Billing Target (R)</label>
            <input
              type="number"
              min="0"
              step="1000"
              name="billingTarget"
              value={formData.billingTarget}
              onChange={handleChange}
              placeholder="e.g., 450000"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">Profile Picture</label>
          <div className="flex gap-4 items-start">
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="block w-full text-sm text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="text-xs text-stone-500 mt-1">
                Optional: Upload a profile picture (JPG, PNG)
              </p>
            </div>
            {previewImage && (
              <div className="flex-shrink-0">
                <img
                  src={previewImage}
                  alt="Preview"
                  className="h-20 w-20 rounded-lg object-cover border border-stone-300"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPreviewImage('');
                    setFormData(prev => ({ ...prev, avatar: '' }));
                  }}
                  className="text-xs text-red-600 hover:text-red-700 mt-1"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Specialization</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={specInput}
              onChange={e => setSpecInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSpecialization();
                }
              }}
              placeholder="Add specialization (e.g., Commercial, Leasing)"
              className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleAddSpecialization}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
            >
              Add
            </button>
          </div>
          {formData.specialization.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.specialization.map(spec => (
                <span
                  key={spec}
                  className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm"
                >
                  {spec}
                  <button
                    type="button"
                    onClick={() => handleRemoveSpecialization(spec)}
                    className="hover:text-blue-900"
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <p className="text-sm font-medium text-indigo-900 mb-2">Available Property Types</p>
          <p className="text-xs text-indigo-800 mb-3">
            Brokers can list and manage properties of the following types in the Properties
            module:
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-indigo-800">
            <div>Office</div>
            <div>Retail</div>
            <div>Residential</div>
            <div>Industrial</div>
            <div>Flat</div>
            <div>Filling Station</div>
            <div>Student Accommodation</div>
            <div>Land</div>
          </div>
          <p className="text-xs text-indigo-700 mt-3 pt-3 border-t border-indigo-200">
            <strong>Note:</strong> Any edits or updates to property information should be done
            directly by brokers within their own profiles through the Properties management area.
          </p>
        </div>

        {passwordSendStatus !== 'idle' && (
          <div
            className={`border rounded-lg p-4 ${
              passwordSendStatus === 'success'
                ? 'bg-green-50 border-green-200'
                : passwordSendStatus === 'warning'
                ? 'bg-amber-50 border-amber-200'
                : passwordSendStatus === 'error'
                ? 'bg-red-50 border-red-200'
                : 'bg-blue-50 border-blue-200'
            }`}
          >
            {passwordSendStatus === 'sending' && (
              <div className="flex items-center gap-2 text-blue-800">
                <FiLoader className="animate-spin" size={18} />
                <span className="text-sm font-medium">
                  Creating broker and sending password email...
                </span>
              </div>
            )}
            {passwordSendStatus === 'success' && (
              <p className="text-sm font-medium text-green-800">{passwordSendMessage}</p>
            )}
            {passwordSendStatus === 'warning' && (
              <p className="text-sm font-medium text-amber-800">{passwordSendMessage}</p>
            )}
            {passwordSendStatus === 'error' && (
              <p className="text-sm font-medium text-red-800">{passwordSendMessage}</p>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t border-stone-200">
          <button
            type="submit"
            disabled={isLoading || passwordSendStatus === 'success' || passwordSendStatus === 'warning'}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium ${
              isLoading || passwordSendStatus === 'success' || passwordSendStatus === 'warning'
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isLoading && <FiLoader className="animate-spin" size={18} />}
            {isLoading
              ? 'Sending password...'
              : passwordSendStatus === 'success'
              ? 'Broker Added'
              : passwordSendStatus === 'warning'
              ? 'Broker Added (Email Failed)'
              : 'Add Broker & Send Password'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 bg-stone-200 text-stone-900 px-4 py-2 rounded-lg hover:bg-stone-300 transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
