'use client';

import React, { useState, useEffect } from 'react';
import { FiX, FiAlertCircle, FiFileText, FiSave, FiEye } from 'react-icons/fi';
import { LegalDocument } from '@/data/legaldocs';
import { legalDocService } from '@/services/legalDocService';

interface StatusChangeWithDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStatus: string;
  newStatus: string;
  dealName: string;
  onConfirm: (data: { comment: string; documentId: string }) => void;
  isSaving?: boolean;
}

interface DocumentPreviewData {
  documentId: string;
  documentName: string;
  fields: Array<{ name: string; value: string }>;
  content: string;
}

export const StatusChangeWithDocModal: React.FC<StatusChangeWithDocModalProps> = ({
  isOpen,
  onClose,
  currentStatus,
  newStatus,
  dealName,
  onConfirm,
  isSaving = false,
}) => {
  const [step, setStep] = useState<'select' | 'preview'>('select');
  const [comment, setComment] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [availableDocs, setAvailableDocs] = useState<LegalDocument[]>([]);
  const [previewData, setPreviewData] = useState<DocumentPreviewData | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load available legal documents on mount
  useEffect(() => {
    if (isOpen && step === 'select') {
      loadAvailableDocs();
    }
  }, [isOpen, step]);

  const loadAvailableDocs = async () => {
    setLoadingDocs(true);
    try {
      const docs = await legalDocService.getAllDocuments();
      // Filter for "filled" documents (Approved, Executed, Completed, Final status)
      const filledDocs = docs.filter(
        (doc) =>
          doc.status &&
          ['Approved', 'Executed', 'Completed', 'Final'].includes(doc.status) &&
          doc.content
      );
      setAvailableDocs(filledDocs);
    } catch (error) {
      console.error('Error loading legal documents:', error);
      setErrors({ load: 'Failed to load documents' });
    } finally {
      setLoadingDocs(false);
    }
  };

  const extractFieldsFromContent = (content: string): Array<{ name: string; value: string }> => {
    const regex = /\[([^\]]+)\]/g;
    const fields: Array<{ name: string; value: string }> = [];
    const seen = new Set<string>();

    let match;
    while ((match = regex.exec(content)) !== null) {
      const fieldName = match[1];
      if (!seen.has(fieldName)) {
        seen.add(fieldName);
        fields.push({ name: fieldName, value: '' });
      }
    }
    return fields;
  };

  const handleDocumentSelect = async (docId: string) => {
    setSelectedDocId(docId);
    const doc = availableDocs.find((d) => d.id === docId);
    if (doc && doc.content) {
      const fields = extractFieldsFromContent(doc.content);
      // Initialize field values
      const initialValues: Record<string, string> = {};
      fields.forEach((field) => {
        initialValues[field.name] = '';
      });
      setFieldValues(initialValues);
      setPreviewData({
        documentId: docId,
        documentName: doc.documentName,
        fields,
        content: doc.content,
      });
      setStep('preview');
    }
  };

  const handleFieldChange = (fieldName: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleConfirm = () => {
    const newErrors: Record<string, string> = {};

    if (!comment.trim()) {
      newErrors.comment = 'Comment is required';
    }
    if (!selectedDocId) {
      newErrors.document = 'Legal document is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    onConfirm({
      comment: comment.trim(),
      documentId: selectedDocId,
    });
  };

  const handlePreviewConfirm = () => {
    handleConfirm();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-stone-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-100 to-stone-50 rounded-t-2xl p-6 flex items-start justify-between border-b border-stone-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <FiAlertCircle className="text-amber-600" size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-950">Change Deal Status & Link Document</h2>
              <p className="text-sm text-stone-600 mt-1">{dealName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors text-stone-600 disabled:opacity-50"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {step === 'select' ? (
            <>
              {/* Status Change Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-stone-700">
                  <span className="font-semibold">Changing status:</span>{' '}
                  <span className="text-stone-900 font-medium">{currentStatus}</span>
                  {' → '}
                  <span className="text-blue-700 font-medium">{newStatus}</span>
                </p>
              </div>

              {/* Comment Field */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-stone-700">
                  Comment <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={isSaving}
                  placeholder="Enter comment (required for this status change)"
                  className="w-full px-4 py-3 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white hover:border-stone-300 transition-colors disabled:bg-stone-50"
                  rows={4}
                />
                {errors.comment && (
                  <p className="text-xs text-red-600 font-medium">{errors.comment}</p>
                )}
              </div>

              {/* Legal Document Selector */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-stone-700">
                  Link Legal Document <span className="text-red-500">*</span>
                </label>
                {loadingDocs ? (
                  <div className="text-center py-4 text-stone-500">Loading documents...</div>
                ) : availableDocs.length === 0 ? (
                  <div className="border border-stone-300 rounded-lg p-4 bg-stone-50 text-center text-sm text-stone-600">
                    No filled legal documents available. Create one in the Legal Docs module first.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto border border-stone-200 rounded-lg p-3 bg-stone-50">
                    {availableDocs.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => handleDocumentSelect(doc.id)}
                        disabled={isSaving}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all disabled:opacity-50 ${
                          selectedDocId === doc.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-stone-200 bg-white hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <FiFileText
                            size={18}
                            className={selectedDocId === doc.id ? 'text-blue-600' : 'text-stone-600'}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-stone-900 truncate">{doc.documentName}</p>
                            <p className="text-xs text-stone-500">{doc.documentType}</p>
                          </div>
                          {selectedDocId === doc.id && (
                            <div className="text-blue-600 font-bold">✓</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {errors.document && (
                  <p className="text-xs text-red-600 font-medium">{errors.document}</p>
                )}
              </div>
            </>
          ) : (
            /* Preview Step */
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="text-sm text-emerald-900">
                  <span className="font-semibold">Document Selected:</span> {previewData?.documentName}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-3">
                  Fill Document Template Fields
                </label>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {previewData?.fields && previewData.fields.length > 0 ? (
                    previewData.fields.map((field) => (
                      <div key={field.name}>
                        <label className="block text-xs font-medium text-stone-700 mb-1">
                          {field.name}
                        </label>
                        <input
                          type="text"
                          value={fieldValues[field.name] || ''}
                          onChange={(e) => handleFieldChange(field.name, e.target.value)}
                          placeholder={`Enter ${field.name.toLowerCase()}`}
                          disabled={isSaving}
                          className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-stone-50"
                        />
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-stone-500">No template fields to fill</p>
                  )}
                </div>
              </div>

              {/* Document Preview */}
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">Document Preview</label>
                <div className="border border-stone-300 rounded-lg p-4 bg-stone-50 max-h-48 overflow-y-auto text-xs text-stone-700 whitespace-pre-wrap font-mono">
                  {previewData?.content}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 rounded-b-2xl flex justify-between gap-3 border-t border-stone-200 flex-shrink-0">
          <button
            onClick={step === 'preview' ? () => setStep('select') : onClose}
            disabled={isSaving}
            className="px-4 py-2 bg-white border border-stone-300 rounded-lg text-stone-700 font-medium hover:bg-stone-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {step === 'preview' ? 'Back' : 'Cancel'}
          </button>

          {step === 'select' && (
            <button
              onClick={handleConfirm}
              disabled={isSaving || !comment.trim() || !selectedDocId}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiEye size={18} />
              Next: Preview & Fill
            </button>
          )}

          {step === 'preview' && (
            <button
              onClick={handlePreviewConfirm}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiSave size={18} />
              {isSaving ? 'Saving...' : 'Confirm & Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
