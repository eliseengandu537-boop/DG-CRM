'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowLeft, FiDownload, FiEdit2, FiSave, FiX } from 'react-icons/fi';
import { DocumentLinkedDeal, LegalDocument } from '@/data/legaldocs';
import PDFViewer from './PDFViewer';
import { customRecordService } from '@/services/customRecordService';
import { legalDocService } from '@/services/legalDocService';
import { Deal, dealService } from '@/services/dealService';
import { forecastDealApiService } from '@/services/forecastDealService';
import { useAuth } from '@/context/AuthContext';
import type { LegalDocsRedirectFlow } from './LegalDocs';

interface DocumentDetailProps {
  document: LegalDocument;
  onBack: () => void;
  onSave: (doc: LegalDocument) => void;
  onDelete: (id: string) => void;
  canManageDocuments: boolean;
  redirectFlow?: LegalDocsRedirectFlow | null;
  onFlowComplete?: () => void;
}

const toDate = () => new Date().toISOString().split('T')[0];
const WIP_CLOSED_STATUSES = new Set(['closed', 'awaiting_payment', 'completed', 'won', 'invoice']);
const WIP_LOST_STATUSES = new Set(['lost', 'cancelled', 'canceled', 'rejected']);

const normalizeStatus = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const statusNeedsComment = (status: string) => {
  const normalized = normalizeStatus(status);
  return normalized === 'loi' || normalized === 'otp';
};

const prettyStatus = (status: string) => {
  const normalized = normalizeStatus(status);
  if (normalized === 'loi') return 'LOI';
  if (normalized === 'otp') return 'OTP';
  return normalized
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const normalizeDocument = (doc: LegalDocument): LegalDocument => ({
  ...doc,
  linkedAssets: Array.isArray(doc.linkedAssets) ? doc.linkedAssets : [],
  linkedDeals: Array.isArray(doc.linkedDeals) ? doc.linkedDeals : [],
  tags: Array.isArray(doc.tags) ? doc.tags : [],
  permissions: Array.isArray(doc.permissions) ? doc.permissions : [],
});

const uniqueFieldNames = (content: string): string[] => {
  if (!content) return [];
  const matches = Array.from(content.matchAll(/\[([^\]]+)\]/g)).map(match => match[1].trim());
  return Array.from(new Set(matches.filter(Boolean)));
};

const replaceFieldTokens = (content: string, values: Record<string, string>): string => {
  return Object.entries(values).reduce((result, [key, value]) => {
    return result.split(`[${key}]`).join(value);
  }, content);
};

function toLinkedDealLabel(linkedDeal: DocumentLinkedDeal): string {
  const status = String(linkedDeal.status || '').trim();
  const client = String(linkedDeal.clientName || '').trim();
  const meta = [client, status].filter(Boolean).join(' | ');
  return meta || String(linkedDeal.dealType || '').trim() || 'Linked deal';
}

export default function DocumentDetail({
  document: initialDocument,
  onBack,
  onSave,
  onDelete,
  canManageDocuments,
  redirectFlow = null,
  onFlowComplete,
}: DocumentDetailProps) {
  const { user } = useAuth();
  const [document, setDocument] = useState<LegalDocument>(normalizeDocument(initialDocument));
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(initialDocument.content || '');
  const [filledContent, setFilledContent] = useState<Record<string, string>>({});
  const prevDocIdRef = useRef<string>(initialDocument.id);

  const [isLoadingDeals, setIsLoadingDeals] = useState(false);
  const [dealLoadError, setDealLoadError] = useState<string | null>(null);
  const [dealOptions, setDealOptions] = useState<Deal[]>([]);
  const [showDealPicker, setShowDealPicker] = useState(false);
  const [dealSearchTerm, setDealSearchTerm] = useState('');
  const [isLinkingDeal, setIsLinkingDeal] = useState(false);
  const [statusComment, setStatusComment] = useState(redirectFlow?.initialComment || '');
  const [isFinalizingStatus, setIsFinalizingStatus] = useState(false);

  useEffect(() => {
    const isNewDocument = initialDocument.id !== prevDocIdRef.current;
    prevDocIdRef.current = initialDocument.id;
    setDocument(normalizeDocument(initialDocument));
    setEditedContent(initialDocument.content || '');
    // Only reset filled values when switching to a different document, not when the same
    // document updates (e.g. after linking a deal updates its linkedDeals array)
    if (isNewDocument) {
      setFilledContent({});
    }
    setIsEditing(false);
  }, [initialDocument]);

  // Load previously saved filled-document record so the user sees their filled values on reopen
  useEffect(() => {
    if (!document.id) return;
    let active = true;
    customRecordService
      .getAllCustomRecords({ entityType: 'filled-document', limit: 500 })
      .then(result => {
        if (!active) return;
        const latest = result.data
          .filter(r => r.referenceId === document.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        if (latest?.payload) {
          const payload = latest.payload as Record<string, unknown>;
          const savedFields = payload.filledContent;
          if (savedFields && typeof savedFields === 'object' && !Array.isArray(savedFields)) {
            setFilledContent(savedFields as Record<string, string>);
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id]);

  useEffect(() => {
    setStatusComment(redirectFlow?.initialComment || '');
  }, [redirectFlow?.initialComment, redirectFlow?.dealId, redirectFlow?.status]);

  useEffect(() => {
    let active = true;

    const loadWipDeals = async () => {
      setIsLoadingDeals(true);
      setDealLoadError(null);
      try {
        const brokerId =
          user?.role === 'broker' ? String(user.brokerId || user.id || '').trim() : '';
        const response = await dealService.getAllDeals({
          page: 1,
          limit: 500,
          wip: true,
          ...(brokerId ? { brokerId } : {}),
        });

        const rows = (response.data || []).filter(item => {
          const status = String(item.status || '').trim().toLowerCase();
          return !WIP_CLOSED_STATUSES.has(status) && !WIP_LOST_STATUSES.has(status);
        });

        if (active) {
          setDealOptions(rows);
        }
      } catch (error) {
        if (!active) return;
        setDealOptions([]);
        setDealLoadError(error instanceof Error ? error.message : 'Failed to load WIP deals');
      } finally {
        if (active) setIsLoadingDeals(false);
      }
    };

    void loadWipDeals();
    return () => {
      active = false;
    };
  }, [user?.brokerId, user?.id, user?.role]);

  const requiredFields = useMemo(() => uniqueFieldNames(editedContent), [editedContent]);
  const filteredWipDeals = useMemo(() => {
    const query = dealSearchTerm.trim().toLowerCase();
    if (!query) return dealOptions;

    return dealOptions.filter(deal => {
      const dealName = String(deal.title || '').toLowerCase();
      const clientName = String(deal.clientName || '').toLowerCase();
      const status = String(deal.status || '').toLowerCase();
      return dealName.includes(query) || clientName.includes(query) || status.includes(query);
    });
  }, [dealOptions, dealSearchTerm]);

  const areFieldsComplete = useMemo(() => {
    if (requiredFields.length === 0) return true;
    return requiredFields.every(field => Boolean((filledContent[field] || '').trim()));
  }, [requiredFields, filledContent]);

  const requiresFlowComment = statusNeedsComment(redirectFlow?.status || '');
  const hasRequiredLinks = redirectFlow?.dealId ? true : document.linkedDeals.length > 0;
  const canDownload =
    areFieldsComplete &&
    hasRequiredLinks &&
    (!requiresFlowComment || Boolean(statusComment.trim()));

  const commitDocument = (updater: (prev: LegalDocument) => LegalDocument) => {
    setDocument(prev => {
      const next = normalizeDocument(updater(prev));
      onSave(next);
      return next;
    });
  };

  const applyDocumentPatch = (patch: Partial<LegalDocument>) => {
    commitDocument(prev => ({
      ...prev,
      ...patch,
      lastModifiedDate: toDate(),
      lastModifiedBy: 'Current User',
    }));
  };

  const handleSaveContent = () => {
    applyDocumentPatch({
      content: editedContent,
      version: (document.version || 1) + 1,
    });
    setIsEditing(false);
  };

  const handleLinkWipDeal = async (selectedDeal: Deal) => {
    if (!selectedDeal?.id || isLinkingDeal) return;
    setIsLinkingDeal(true);
    setDealLoadError(null);

    try {
      const linkedDocument = await legalDocService.linkDocumentToDeal(document.id, selectedDeal.id);
      const normalized = normalizeDocument(linkedDocument);
      setDocument(normalized);
      onSave(normalized);
      setShowDealPicker(false);
      setDealSearchTerm('');
    } catch (error) {
      setDealLoadError(
        error instanceof Error ? error.message : 'Failed to link document to selected deal'
      );
    } finally {
      setIsLinkingDeal(false);
    }
  };

  const finalizeDocumentLink = async (
    options?: { showSuccessMessage?: boolean }
  ): Promise<{ filledOutput: string; linkedDeals: DocumentLinkedDeal[] } | null> => {
    const missing: string[] = [];

    if (!areFieldsComplete) {
      missing.push('Complete all required document fields.');
    }

    const forcedDealId = String(redirectFlow?.dealId || '').trim();
    if (!forcedDealId && document.linkedDeals.length === 0) {
      missing.push('Link this document to a WIP deal.');
    }

    if (requiresFlowComment && !statusComment.trim()) {
      missing.push(`Comment is required for ${prettyStatus(redirectFlow?.status || '')}.`);
    }

    if (missing.length > 0) {
      alert(`Cannot link yet:\n\n- ${missing.join('\n- ')}`);
      return null;
    }

    const primaryLinkedDealId = forcedDealId || String(document.linkedDeals[0]?.dealId || '').trim();
    if (!primaryLinkedDealId) {
      alert('Linked deal is missing. Re-link this document from WIP.');
      return null;
    }

    const cleanedValues = requiredFields.reduce<Record<string, string>>((acc, field) => {
      const value = (filledContent[field] || '').trim();
      if (value) {
        acc[field] = value;
      }
      return acc;
    }, {});

    const filledOutput = replaceFieldTokens(editedContent, cleanedValues);

    const filledRecord = {
      id: `FILLED-${document.id}-${Date.now()}`,
      originalDocId: document.id,
      documentName: document.documentName,
      filledContent: cleanedValues,
      content: filledOutput,
      linkedDeal: primaryLinkedDealId,
      linkedStock: null,
      linkedDeals: document.linkedDeals,
      filledDate: new Date().toISOString(),
    };

    let savedFilledRecordId: string | undefined;
    try {
      const saved = await customRecordService.createCustomRecord({
        entityType: 'filled-document',
        name: document.documentName,
        status: 'filled',
        category: document.documentType,
        referenceId: document.id,
        payload: filledRecord,
      });
      savedFilledRecordId = saved.id;
    } catch (error) {
      console.warn('Failed to save filled document record:', error);
    }

    setIsFinalizingStatus(true);
    try {
      const linkedDocument = await legalDocService.linkDocumentToDeal(document.id, primaryLinkedDealId, {
        status: redirectFlow?.status,
        filledDocumentRecordId: savedFilledRecordId,
        filledDocumentName: `${document.documentName} - Filled`,
        completedAt: new Date().toISOString(),
      });
      const normalized = normalizeDocument(linkedDocument);
      setDocument(normalized);
      onSave(normalized);

      if (redirectFlow?.dealId) {
        await forecastDealApiService.updateWipStatus({
          dealId: redirectFlow.dealId,
          status: redirectFlow.status,
          brokerId: redirectFlow.brokerId,
          legalDocument: document.id,
          comment: statusComment.trim() || undefined,
        });
      }

      if (options?.showSuccessMessage) {
        alert('Linked to the deal successfully. It will now appear in WIP Sheet under Document.');
      }

      return { filledOutput, linkedDeals: normalized.linkedDeals };
    } catch (error) {
      alert(
        `Unable to finalize workflow:\n${
          error instanceof Error ? error.message : 'Failed to finalize linked document status'
        }`
      );
      return null;
    } finally {
      setIsFinalizingStatus(false);
    }
  };

  const handleDownload = async () => {
    const finalized = await finalizeDocumentLink();
    if (!finalized) return;

    const html = `
      <html>
        <head>
          <title>${document.documentName}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; line-height: 1.6; }
            h1 { margin-bottom: 8px; }
            .meta { color: #374151; font-size: 14px; margin-bottom: 18px; }
            .meta strong { color: #111827; }
            .pill { display: inline-block; margin: 2px 4px 2px 0; padding: 4px 8px; border-radius: 999px; background: #f3f4f6; font-size: 12px; }
            .section { margin-top: 18px; }
            pre { white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <h1>${document.documentName}</h1>
          <div class="meta">
            <div><strong>Document Type:</strong> ${document.documentType}</div>
            <div><strong>Status:</strong> ${document.status}</div>
            <div><strong>Created:</strong> ${document.createdDate}</div>
            <div><strong>Downloaded:</strong> ${new Date().toISOString()}</div>
          </div>

          <div class="section">
            <strong>Linked Deal</strong><br />
            ${finalized.linkedDeals.map(deal => `<span class="pill">${deal.dealName}</span>`).join('')}
          </div>

          <div class="section">
            <strong>Filled Content</strong>
            <pre>${finalized.filledOutput || editedContent || 'No editable content provided.'}</pre>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '', 'height=700,width=960');
    if (!printWindow) {
      alert('Popup blocked. Please allow popups to download/print this document.');
      return;
    }

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();

    // Navigate back to WIP sheet after the print dialog has been triggered
    if (onFlowComplete) {
      onFlowComplete();
    }
  };

  const handleLinkRedirectedDeal = async () => {
    const result = await finalizeDocumentLink({ showSuccessMessage: true });
    if (result && onFlowComplete) {
      onFlowComplete();
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <button onClick={onBack} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-2">
            <FiArrowLeft size={18} />
            Back to Documents
          </button>
          <h2 className="text-2xl font-bold text-stone-900">{document.documentName}</h2>
          <p className="text-sm text-stone-600 mt-1">{document.description}</p>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => setIsEditing(prev => !prev)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <FiEdit2 size={18} />
            {isEditing ? 'Cancel' : 'Edit'}
          </button>

          <button
            onClick={handleDownload}
            disabled={!canDownload || isFinalizingStatus}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              canDownload && !isFinalizingStatus
                ? 'bg-stone-700 text-white hover:bg-stone-800'
                : 'bg-gray-400 text-white cursor-not-allowed opacity-70'
            }`}
          >
            <FiDownload size={18} />
            {!areFieldsComplete
              ? 'Download (Fill fields first)'
              : !hasRequiredLinks
              ? 'Download (Link deal first)'
              : isFinalizingStatus
              ? 'Finalizing...'
              : redirectFlow?.dealId
              ? `Save + Finalize ${prettyStatus(redirectFlow.status)}`
              : 'Download'}
          </button>

          {canManageDocuments && (
            <button
              onClick={() => {
                if (!confirm('Delete this document permanently?')) return;
                onDelete(document.id);
                onBack();
              }}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              <FiX size={18} />
              Delete
            </button>
          )}
        </div>
      </div>

      {redirectFlow && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Status flow active: {prettyStatus(redirectFlow.status)}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Deal ID: {redirectFlow.dealId}. Saving this document will link it to the deal and
            finalize the status in WIP.
          </p>
          {requiresFlowComment && (
            <div className="mt-3">
              <label className="block text-xs font-semibold text-amber-900 mb-1">
                Required Comment
              </label>
              <textarea
                value={statusComment}
                onChange={event => setStatusComment(event.target.value)}
                rows={3}
                placeholder={`Comment required for ${prettyStatus(redirectFlow.status)}`}
                className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {document.fileType === 'pdf' && document.filePath && !document.filePath.startsWith('blob:') ? (
          <div className="w-full h-[72vh] min-h-[460px] lg:min-h-[620px]">
            <PDFViewer
              filePath={document.filePath}
              fileName={document.fileName}
              canDownload={canDownload}
              disabledDownloadMessage={
                redirectFlow?.dealId
                  ? 'Finalize is blocked. Fill required fields (and comment for LOI/OTP) before saving.'
                  : 'Download is blocked. Fill required fields and link a WIP deal before downloading.'
              }
            />
          </div>
        ) : document.fileType === 'pdf' ? (
          <div className="bg-white p-6 rounded-lg border border-stone-200 h-[72vh] min-h-[460px] lg:min-h-[620px] flex items-center justify-center">
            <div className="text-center">
              <p className="text-stone-700 font-medium">Document preview unavailable.</p>
            </div>
          </div>
        ) : (
          <div className="bg-white p-5 rounded-lg border border-stone-200 min-h-[72vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-stone-900 text-lg">Document Content</h3>
              {requiredFields.length > 0 && !isEditing && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  {requiredFields.length} fillable fields
                </span>
              )}
            </div>

            {isEditing ? (
              <textarea
                value={editedContent}
                onChange={event => setEditedContent(event.target.value)}
                className="flex-1 min-h-[56vh] p-4 border border-stone-300 rounded-lg resize-none font-mono text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Use [FieldName] placeholders for fillable values."
              />
            ) : (
              <div className="flex-1 overflow-y-auto flex flex-col gap-4">
                <div className="p-5 bg-stone-50 rounded border border-stone-200 font-mono text-base whitespace-pre-wrap text-stone-700 leading-relaxed">
                  {replaceFieldTokens(editedContent, filledContent) || 'No content available. Click Edit to add content.'}
                </div>

                {requiredFields.length > 0 && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-semibold text-stone-900 mb-3">Fill Document Fields</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {requiredFields.map(fieldName => (
                        <div key={fieldName}>
                          <label className="block text-sm font-medium text-stone-700 mb-2">
                            <span className="inline-block bg-yellow-200 text-yellow-900 px-2 py-1 rounded text-xs font-mono mr-2">
                              [{fieldName}]
                            </span>
                            <span className="text-stone-600">{fieldName}</span>
                          </label>
                          <input
                            type="text"
                            value={filledContent[fieldName] || ''}
                            onChange={event =>
                              setFilledContent(prev => ({ ...prev, [fieldName]: event.target.value }))
                            }
                            placeholder={`Enter ${fieldName}`}
                            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isEditing && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleSaveContent}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <FiSave size={16} />
                  Save Changes
                </button>
              </div>
            )}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
          {redirectFlow?.dealId
            ? `Complete required fields${
                requiresFlowComment ? ', add the required comment,' : ''
              } then click "Link to the deal" to finalize ${prettyStatus(redirectFlow.status)} in WIP.`
            : 'To download this document, ensure required fields are filled and at least one WIP deal is linked.'}
        </div>

        <div className="bg-white p-4 rounded-lg border border-stone-200">
          <h3 className="font-semibold text-stone-900 mb-3">Linked Deal</h3>

          {document.linkedDeals.length === 0 ? (
            <p className="text-sm text-stone-500 mb-3">
              {redirectFlow?.dealId ? 'Link to the deal' : 'No linked deal'}
            </p>
          ) : (
            <div className="space-y-2 mb-3">
              {document.linkedDeals.map(deal => (
                <div key={deal.dealId} className="p-2 bg-purple-50 border border-purple-200 rounded text-sm">
                  <p className="font-medium text-stone-900">{deal.dealName}</p>
                  <p className="text-xs text-stone-600">{toLinkedDealLabel(deal)}</p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {redirectFlow?.dealId ? (
              <button
                onClick={() => void handleLinkRedirectedDeal()}
                className="w-full px-3 py-2 text-sm font-medium rounded-lg border border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                disabled={isFinalizingStatus}
              >
                {isFinalizingStatus ? 'Linking...' : 'Link to the deal'}
              </button>
            ) : (
              <button
                onClick={() => setShowDealPicker(prev => !prev)}
                className="w-full px-3 py-2 text-sm font-medium rounded-lg border border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"
                disabled={isLinkingDeal}
              >
                {showDealPicker
                  ? 'Close WIP Deal List'
                  : document.linkedDeals.length > 0
                  ? 'Relink Deal from WIP'
                  : 'Link Deal from WIP'}
              </button>
            )}

            {showDealPicker && !redirectFlow?.dealId && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-2">
                <input
                  type="text"
                  value={dealSearchTerm}
                  onChange={event => setDealSearchTerm(event.target.value)}
                  placeholder="Search WIP deals..."
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                />

                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {isLoadingDeals ? (
                    <p className="text-xs text-stone-500 px-1 py-2">Loading WIP deals...</p>
                  ) : filteredWipDeals.length === 0 ? (
                    <p className="text-xs text-stone-500 px-1 py-2">No matching WIP deals found.</p>
                  ) : (
                    filteredWipDeals.map(deal => (
                      <button
                        key={deal.id}
                        onClick={() => void handleLinkWipDeal(deal)}
                        disabled={isLinkingDeal}
                        className="w-full text-left p-2 rounded-md border border-stone-200 bg-white hover:bg-purple-50 hover:border-purple-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <p className="text-sm font-medium text-stone-900">{deal.title}</p>
                        <p className="text-xs text-stone-600">
                          {deal.clientName ? `${deal.clientName} | ` : ''}{deal.status}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {(isLoadingDeals || dealLoadError || isLinkingDeal) && (
          <div className="flex flex-wrap items-center gap-4 px-1">
            {isLoadingDeals && <p className="text-xs text-stone-500">Loading WIP deals...</p>}
            {isLinkingDeal && <p className="text-xs text-blue-600">Linking document to selected deal...</p>}
            {dealLoadError && <p className="text-xs text-amber-600">{dealLoadError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
