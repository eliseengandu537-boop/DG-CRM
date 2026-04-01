'use client';

import React, { useState } from 'react';
import { SystemSettings } from '@/data/settings';

interface SystemSettingsPanelProps {
  settings: SystemSettings;
}

export default function SystemSettingsPanel({ settings }: SystemSettingsPanelProps) {
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState(settings);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name.includes('Days') || name.includes('Months') || name.includes('Minutes') ? parseInt(value) : value,
    }));
  };

  const handleSave = () => {
    alert('Settings saved successfully!');
    setEditMode(false);
  };

  const handleCancel = () => {
    setFormData(settings);
    setEditMode(false);
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-4">
      <div className="flex justify-end mb-4">
        {!editMode ? (
          <button
            onClick={() => setEditMode(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Edit Settings
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Save Changes
            </button>
            <button
              onClick={handleCancel}
              className="bg-stone-300 text-stone-900 px-4 py-2 rounded-lg hover:bg-stone-400 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Company Information */}
      <div className="bg-white p-6 rounded-lg border border-stone-200 space-y-4">
        <h3 className="text-xl font-bold text-stone-900 mb-4">🏢 Company Information</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Company Name</label>
            {editMode ? (
              <input
                type="text"
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <p className="px-3 py-2 text-stone-900">{formData.companyName}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Company Email</label>
            {editMode ? (
              <input
                type="email"
                name="companyEmail"
                value={formData.companyEmail}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <p className="px-3 py-2 text-stone-900">{formData.companyEmail}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Company Phone</label>
            {editMode ? (
              <input
                type="tel"
                name="companyPhone"
                value={formData.companyPhone}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <p className="px-3 py-2 text-stone-900">{formData.companyPhone}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Timezone</label>
            {editMode ? (
              <select
                name="timezone"
                value={formData.timezone}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="America/Chicago">America/Chicago (CST)</option>
                <option value="America/Denver">America/Denver (MST)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Europe/Paris">Europe/Paris (CET)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              </select>
            ) : (
              <p className="px-3 py-2 text-stone-900">{formData.timezone}</p>
            )}
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-stone-700 mb-1">Company Address</label>
            {editMode ? (
              <input
                type="text"
                name="companyAddress"
                value={formData.companyAddress}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <p className="px-3 py-2 text-stone-900">{formData.companyAddress}</p>
            )}
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-white p-6 rounded-lg border border-stone-200 space-y-4">
        <h3 className="text-xl font-bold text-stone-900 mb-4">🔐 Security Settings</h3>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Session Timeout (Minutes)</label>
          {editMode ? (
            <input
              type="number"
              name="sessionTimeoutMinutes"
              value={formData.sessionTimeoutMinutes}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <p className="px-3 py-2 text-stone-900">{formData.sessionTimeoutMinutes} minutes</p>
          )}
          <p className="text-xs text-stone-500 mt-1">Automatically log out users after inactivity</p>
        </div>
      </div>

      {/* System Information */}
      <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
        <h3 className="text-xl font-bold text-stone-900 mb-4">ℹ️ System Information</h3>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-stone-600 font-medium">System Version</p>
            <p className="text-stone-900">1.0.0</p>
          </div>
          <div>
            <p className="text-stone-600 font-medium">Last Updated</p>
            <p className="text-stone-900">January 20, 2026</p>
          </div>
          <div>
            <p className="text-stone-600 font-medium">Database Status</p>
            <p className="text-green-600 font-semibold">Connected</p>
          </div>
          <div>
            <p className="text-stone-600 font-medium">Backup Status</p>
            <p className="text-green-600 font-semibold">Current</p>
          </div>
        </div>
      </div>
    </div>
  );
}
