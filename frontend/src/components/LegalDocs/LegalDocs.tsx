'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FiUpload } from 'react-icons/fi';
import DocumentList from './DocumentList';
import DocumentDetail from './DocumentDetail';
import { LegalDocument } from '@/data/legaldocs';
import { legalDocService } from '@/services/legalDocService';
import { useAuth } from '@/context/AuthContext';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

export type LegalDocsRedirectFlow = {
  dealId: string;
  status: string;
  brokerId?: string;
  forecastDealId?: string;
  wipId?: string;
  legalDocumentId?: string;
  initialComment?: string;
  source?: string;
};

const MAX_DOCUMENT_SIZE_MB = 10;

function prettyFlowStatus(status: string): string {
  const s = normalizeStatus(status);
  if (s === 'loi') return 'LOI';
  if (s === 'otp') return 'OTP';
  if (s === 'otl') return 'OTL';
  if (s === 'lease_agreement') return 'Lease Agreement';
  if (s === 'sale_agreement') return 'Sale Agreement';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });

const normalizeStatus = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const LEGAL_DOC_REFRESH_EVENTS = [
  'legal-doc:created',
  'legal-doc:updated',
  'legal-doc:deleted',
  'legal-doc:linked',
];

export default function LegalDocs() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canManageDocuments = user?.role === 'admin' || user?.role === 'manager';
  const canPersistDocumentChanges = canManageDocuments || user?.role === 'broker';

  const [currentView, setCurrentView] = useState<'list' | 'detail'>('list');
  const [selectedDocument, setSelectedDocument] = useState<LegalDocument | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningDocument, setIsOpeningDocument] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedFlowKey, setAppliedFlowKey] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const redirectFlow: LegalDocsRedirectFlow | null = (() => {
    const dealId = String(searchParams?.get('dealId') || '').trim();
    const status = String(searchParams?.get('status') || '').trim();
    if (!dealId || !status) return null;
    return {
      dealId,
      status,
      brokerId: String(searchParams?.get('brokerId') || '').trim() || undefined,
      forecastDealId: String(searchParams?.get('forecastDealId') || '').trim() || undefined,
      wipId: String(searchParams?.get('wipId') || '').trim() || undefined,
      legalDocumentId: String(searchParams?.get('legalDocumentId') || '').trim() || undefined,
      initialComment: String(searchParams?.get('comment') || '').trim() || undefined,
      source: String(searchParams?.get('source') || '').trim() || undefined,
    };
  })();

  const loadDocuments = useCallback(
    async (options?: { cleanupTemporary?: boolean }) => {
      try {
        setIsLoading(true);
        setError(null);
        if (options?.cleanupTemporary && canManageDocuments) {
          try {
            await legalDocService.cleanupTemporaryDocuments();
          } catch (cleanupError) {
            console.warn('Temporary document cleanup skipped:', cleanupError);
          }
        }
        const records = await legalDocService.getAllDocuments();
        setDocuments(records);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load legal documents');
      } finally {
        setIsLoading(false);
      }
    },
    [canManageDocuments]
  );

  useEffect(() => {
    void loadDocuments({ cleanupTemporary: canManageDocuments });
  }, [canManageDocuments, loadDocuments]);

  useRealtimeRefresh(() => {
    void loadDocuments();
  }, LEGAL_DOC_REFRESH_EVENTS);

  useEffect(() => {
    if (!redirectFlow || isLoading) return;
    const flowKey = `${redirectFlow.dealId}:${normalizeStatus(redirectFlow.status)}`;
    if (appliedFlowKey === flowKey) return;

    let cancelled = false;
    const applyFlow = async () => {
      try {
        setError(null);
        // Mark flow as applied immediately to prevent re-runs
        setAppliedFlowKey(flowKey);

        // Only auto-open a specific document when an explicit legalDocumentId is provided
        // (i.e. re-opening a previously used document). Otherwise show the list so the
        // broker can choose which template to fill.
        const preferredLegalDocumentId = String(redirectFlow.legalDocumentId || '').trim();
        if (!preferredLegalDocumentId) return;

        const preferredDocument = documents.find(
          doc => String(doc.id || '').trim() === preferredLegalDocumentId
        );
        if (!preferredDocument) return;

        setIsOpeningDocument(true);
        const fullDocument = await legalDocService.getDocumentById(preferredDocument.id);
        if (cancelled) return;
        setSelectedDocument(fullDocument);
        setCurrentView('detail');
      } catch (flowError) {
        if (cancelled) return;
        setError(
          flowError instanceof Error
            ? flowError.message
            : 'Failed to initialize legal-document status flow'
        );
      } finally {
        if (!cancelled) {
          setIsOpeningDocument(false);
        }
      }
    };

    void applyFlow();
    return () => {
      cancelled = true;
    };
  }, [appliedFlowKey, documents, isLoading, redirectFlow]);

  const handleViewDocument = async (doc: LegalDocument) => {
    try {
      setIsOpeningDocument(true);
      setError(null);
      const fullDocument = await legalDocService.getDocumentById(doc.id);
      setSelectedDocument(fullDocument);
      setCurrentView('detail');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to open legal document');
    } finally {
      setIsOpeningDocument(false);
    }
  };

  const handleUpdateDocument = (updated: LegalDocument) => {
    setDocuments(prev => prev.map(d => (d.id === updated.id ? updated : d)));
    setSelectedDocument(updated);

    if (!canPersistDocumentChanges) {
      return;
    }

    void legalDocService.updateDocument(updated.id, updated).catch(updateError => {
      console.error(updateError);
      alert(
        `Failed to save document changes to database: ${
          updateError instanceof Error ? updateError.message : String(updateError)
        }`
      );
    });
  };

  const handleDeleteDocument = async (id: string) => {
    if (!canManageDocuments) {
      alert('Only admin or manager can delete documents.');
      return;
    }
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.'))
      return;
    try {
      await legalDocService.deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      setSelectedDocument(null);
      setCurrentView('list');
    } catch (deleteError) {
      alert(
        `Failed to delete document from database: ${
          deleteError instanceof Error ? deleteError.message : String(deleteError)
        }`
      );
    }
  };

  const handleBackToList = () => {
    setCurrentView('list');
    setSelectedDocument(null);
  };

  const handleImportClick = () => {
    if (!canManageDocuments) {
      alert('Only admin or manager can import documents.');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManageDocuments) {
      event.target.value = '';
      return;
    }
    const files = event.target.files;
    if (!files) return;

    const createdDocs: LegalDocument[] = [];

    try {
      for (const file of Array.from(files)) {
        const sizeInMb = file.size / (1024 * 1024);
        if (sizeInMb > MAX_DOCUMENT_SIZE_MB) {
          throw new Error(
            `${file.name} is ${sizeInMb.toFixed(2)} MB. Maximum supported size is ${MAX_DOCUMENT_SIZE_MB} MB.`
          );
        }

        const extension = file.name.split('.').pop()?.toLowerCase() || '';
        const fileType =
          extension === 'pdf' ? 'pdf' : extension === 'doc' || extension === 'docx' ? 'docx' : 'txt';
        const filePath = await readFileAsDataUrl(file);

        const payload: LegalDocument = {
          id: '',
          documentName: file.name.replace(/\.[^/.]+$/, ''),
          documentType: 'Contract',
          createdDate: new Date().toISOString().split('T')[0],
          lastModifiedDate: new Date().toISOString().split('T')[0],
          createdBy: 'Current User',
          lastModifiedBy: 'Current User',
          status: 'Draft',
          fileSize: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
          fileName: file.name,
          description: '',
          linkedAssets: [],
          linkedDeals: [],
          permissions: [],
          tags: [],
          version: 1,
          filePath,
          fileType: fileType as any,
        };

        const created = await legalDocService.createDocument(payload);
        createdDocs.push(created);
      }
    } catch (uploadError) {
      console.error(uploadError);
      alert(
        uploadError instanceof Error
          ? uploadError.message
          : 'Failed to import and save one or more files to the database. Please try again.'
      );
      event.target.value = '';
      return;
    }

    setDocuments(prev => [...createdDocs, ...prev]);
    event.target.value = '';
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-950">Legal Documents</h1>
        <div className="flex gap-3">
          {canManageDocuments && (
            <>
              <button
                onClick={handleImportClick}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                <FiUpload size={18} />
                Import Documents
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleFileSelect}
                className="hidden"
                aria-label="Import documents"
              />
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-lg border border-stone-200 p-6 text-stone-600">
          Loading documents...
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      ) : currentView === 'list' ? (
        <>
          {isOpeningDocument && (
            <div className="bg-white rounded-lg border border-stone-200 p-4 text-stone-600">
              Opening document...
            </div>
          )}
          {redirectFlow && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                📋 Select a document template for{' '}
                <strong>{prettyFlowStatus(redirectFlow.status)}</strong>
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Click any document below to open and fill it. Once you fill in all required fields
                and click <strong>Save + Finalize</strong>, the document will be linked to this
                deal and you will be taken back to the WIP sheet.
              </p>
            </div>
          )}
          <DocumentList
            documents={documents}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            filterStatus={filterStatus}
            onFilterChange={setFilterStatus}
            onSelectDocument={handleViewDocument}
          />
        </>
      ) : (
        <DocumentDetail
          document={selectedDocument!}
          onBack={handleBackToList}
          onSave={handleUpdateDocument}
          onDelete={handleDeleteDocument}
          canManageDocuments={canManageDocuments}
          redirectFlow={redirectFlow}
          onFlowComplete={redirectFlow ? () => router.back() : undefined}
        />
      )}
    </div>
  );
}
