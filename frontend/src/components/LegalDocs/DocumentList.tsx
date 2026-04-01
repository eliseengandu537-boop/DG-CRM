'use client';

import React, { useMemo } from 'react';
import { FiSearch, FiDownload, FiEye } from 'react-icons/fi';
import { LegalDocument, DocumentStatus } from '@/data/legaldocs';

interface DocumentListProps {
  documents: LegalDocument[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filterStatus: string;
  onFilterChange: (status: string) => void;
  onSelectDocument: (doc: LegalDocument) => void;
}

const statusColors: Record<DocumentStatus, string> = {
  'Draft': 'bg-yellow-100 text-yellow-800',
  'Under Review': 'bg-blue-100 text-blue-800',
  'Approved': 'bg-green-100 text-green-800',
  'Executed': 'bg-purple-100 text-purple-800',
  'Archived': 'bg-gray-100 text-gray-800',
};

export default function DocumentList({
  documents,
  searchTerm,
  onSearchChange,
  filterStatus,
  onFilterChange,
  onSelectDocument,
}: DocumentListProps) {
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const matchesSearch = 
        doc.documentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.documentType.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.createdBy.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = filterStatus === 'All' || doc.status === filterStatus;
      
      return matchesSearch && matchesStatus;
    });
  }, [documents, searchTerm, filterStatus]);

  const statusList = ['All', 'Draft', 'Under Review', 'Approved', 'Executed', 'Archived'] as const;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Search and Filter Bar */}
      <div className="flex flex-col gap-3">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white px-4 py-3 rounded-lg border border-stone-200">
          <FiSearch className="text-stone-400" size={20} />
          <input
            type="text"
            placeholder="Search documents by name, type, or creator..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 outline-none text-sm"
          />
        </div>

        {/* Status Filter */}
        <div className="flex gap-2 flex-wrap">
          {statusList.map((status) => (
            <button
              key={status}
              onClick={() => onFilterChange(status)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Documents List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {filteredDocuments.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-stone-500">
            <p>No documents found</p>
          </div>
        ) : (
          filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="bg-white p-4 rounded-lg border border-stone-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
              onClick={() => onSelectDocument(doc)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-stone-900 truncate">{doc.documentName}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${statusColors[doc.status]}`}>
                      {doc.status}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm text-stone-600 mb-2">
                    <div><span className="font-medium">Type:</span> {doc.documentType}</div>
                    <div><span className="font-medium">Created:</span> {doc.createdDate}</div>
                    <div><span className="font-medium">Created By:</span> {doc.createdBy}</div>
                    <div><span className="font-medium">Size:</span> {doc.fileSize} MB</div>
                  </div>

                  {/* Linked Items */}
                  <div className="flex flex-wrap gap-4 text-xs">
                    {doc.linkedDeals.length > 0 && (
                      <div>
                        <span className="font-medium text-stone-700">Deals: </span>
                        <span className="text-purple-600">
                          {doc.linkedDeals.map(d => d.dealName).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {doc.tags.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {doc.tags.map((tag) => (
                        <span key={tag} className="inline-block bg-stone-100 text-stone-700 px-2 py-1 rounded text-xs">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    className="p-2 hover:bg-stone-100 rounded transition-colors"
                    title="View Document"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDocument(doc);
                    }}
                  >
                    <FiEye size={18} className="text-blue-600" />
                  </button>
                  <button
                    className="p-2 hover:bg-stone-100 rounded transition-colors"
                    title="Download Document"
                    onClick={(e) => {
                      e.stopPropagation();
                      alert(`Downloading: ${doc.fileName}`);
                    }}
                  >
                    <FiDownload size={18} className="text-green-600" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
