'use client';

import React, { useState } from 'react';
import { Lead, LeadType, LeadStatus } from '@/data/unified-schema';
import { FiX } from 'react-icons/fi';

interface LeadFormProps {
  onSubmit: (lead: Omit<Lead, 'id' | 'createdDate' | 'updatedDate'>) => void;
  onCancel: () => void;
  initialData?: Partial<Lead>;
  leadType?: LeadType;
  isLoading?: boolean;
}

export const LeadForm: React.FC<LeadFormProps> = ({
  onSubmit,
  onCancel,
  initialData,
  leadType,
  isLoading,
}) => {
  const [formData, setFormData] = useState<Omit<Lead, 'id' | 'createdDate' | 'updatedDate'>>({
    name: initialData?.name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    company: initialData?.company || '',
    propertyInterest: initialData?.propertyInterest || '',
    leadType: leadType || initialData?.leadType || 'Leasing',
    leadSource: initialData?.leadSource || 'Direct',
    status: initialData?.status || 'New',
    estimatedValue: initialData?.estimatedValue || 0,
    currency: initialData?.currency || 'ZAR',
    probability: initialData?.probability || 0,
    closingTimeline: initialData?.closingTimeline || '',
    dealType: initialData?.dealType,
    assignedBrokerId: initialData?.assignedBrokerId || '',
    additionalBrokerId: initialData?.additionalBrokerId || '',
    commissionSplit: initialData?.commissionSplit,
    contactId: initialData?.contactId || '',
    lastContactDate: initialData?.lastContactDate || new Date().toISOString().split('T')[0],
    notes: initialData?.notes || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'estimatedValue' || name === 'probability' ? Number(value) : value,
    }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email';
    if (!formData.phone.trim()) newErrors.phone = 'Phone is required';
    if (formData.estimatedValue < 0) newErrors.estimatedValue = 'Value must be positive';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(formData);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-900">New Lead</h3>
        <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded">
          <FiX size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.email ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.phone ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.phone && <p className="text-sm text-red-500 mt-1">{errors.phone}</p>}
          </div>

          {/* Company */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
            <input
              type="text"
              name="company"
              value={formData.company}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Lead Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lead Type</label>
            <select
              name="leadType"
              value={formData.leadType}
              onChange={handleChange}
              disabled={!!leadType}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="Leasing">Leasing</option>
              <option value="Sales">Sales</option>
              <option value="Auction">Auction</option>
            </select>
          </div>

          {/* Lead Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="New">New</option>
              <option value="Contacted">Contacted</option>
              <option value="Qualified">Qualified</option>
              <option value="Negotiating">Negotiating</option>
              <option value="Proposal">Proposal</option>
              <option value="Won">Won</option>
              <option value="Lost">Lost</option>
            </select>
          </div>

          {/* Estimated Value */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Value *</label>
            <input
              type="number"
              name="estimatedValue"
              value={formData.estimatedValue}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.estimatedValue ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.estimatedValue && (
              <p className="text-sm text-red-500 mt-1">{errors.estimatedValue}</p>
            )}
          </div>

          {/* Lead Source */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lead Source</label>
            <select
              name="leadSource"
              value={formData.leadSource}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Direct">Direct</option>
              <option value="Referral">Referral</option>
              <option value="Website">Website</option>
              <option value="Cold Call">Cold Call</option>
              <option value="Email">Email</option>
              <option value="Event">Event</option>
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Form Actions */}
        <div className="flex gap-2 pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
          >
            {isLoading ? 'Saving...' : 'Create Lead'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-gray-200 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default LeadForm;
