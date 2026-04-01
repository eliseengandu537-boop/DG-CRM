'use client';

import React from 'react';
import { Contact } from '@/data/unified-schema';
import { FiMail, FiPhone, FiEdit2, FiTrash2 } from 'react-icons/fi';

interface ContactCardProps {
  contact: Contact;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
  variant?: 'default' | 'compact' | 'detailed';
}

export const ContactCard: React.FC<ContactCardProps> = ({
  contact,
  onClick,
  onEdit,
  onDelete,
  showActions = true,
  variant = 'default',
}) => {
  const typeColors: Record<string, string> = {
    Broker: 'bg-blue-100 text-blue-800',
    Investor: 'bg-purple-100 text-purple-800',
    Tenant: 'bg-green-100 text-green-800',
    Landlord: 'bg-orange-100 text-orange-800',
    Vendor: 'bg-pink-100 text-pink-800',
    Other: 'bg-gray-100 text-gray-800',
  };

  const statusColors: Record<string, string> = {
    Active: 'text-green-700',
    Inactive: 'text-gray-500',
    Archived: 'text-red-500',
  };

  const renderCompact = () => (
    <div className="p-3 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{contact.firstName} {contact.lastName}</p>
          <p className="text-xs text-gray-500">{contact.company}</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${typeColors[contact.type]}`}>
          {contact.type}
        </span>
      </div>
    </div>
  );

  const renderDetailed = () => (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {contact.firstName} {contact.lastName}
          </h3>
          {contact.company && <p className="text-sm text-gray-600">{contact.company}</p>}
          {contact.position && <p className="text-sm text-gray-600">{contact.position}</p>}
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${typeColors[contact.type]}`}>
          {contact.type}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-gray-700">
          <FiMail size={16} />
          <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline text-sm">
            {contact.email}
          </a>
        </div>
        <div className="flex items-center gap-2 text-gray-700">
          <FiPhone size={16} />
          <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline text-sm">
            {contact.phone}
          </a>
        </div>
      </div>

      <div className="flex gap-2 pb-4 border-b border-gray-200">
        <span className={`text-xs font-medium ${statusColors[contact.status]}`}>
          {contact.status}
        </span>
        <span className="text-xs text-gray-500">
          Added {new Date(contact.createdDate).toLocaleDateString()}
        </span>
      </div>

      {contact.notes && <p className="text-sm text-gray-600 mt-3">{contact.notes}</p>}

      {showActions && (onEdit || onDelete) && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
            >
              <FiEdit2 size={14} />
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
            >
              <FiTrash2 size={14} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );

  const renderDefault = () => (
    <div
      className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">
            {contact.firstName} {contact.lastName}
          </h3>
          {contact.company && <p className="text-sm text-gray-600 mb-2">{contact.company}</p>}
          <div className="flex flex-col gap-1">
            <a href={`mailto:${contact.email}`} className="text-sm text-blue-600 hover:underline">
              {contact.email}
            </a>
            <a href={`tel:${contact.phone}`} className="text-sm text-blue-600 hover:underline">
              {contact.phone}
            </a>
          </div>
        </div>
        <div>
          <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${typeColors[contact.type]}`}>
            {contact.type}
          </span>
        </div>
      </div>
    </div>
  );

  if (variant === 'compact') return renderCompact();
  if (variant === 'detailed') return renderDetailed();
  return renderDefault();
};

export default ContactCard;
