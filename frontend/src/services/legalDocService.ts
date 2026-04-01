import { AxiosError } from 'axios';
import apiClient from '@/lib/api';
import { LegalDocument } from '@/data/legaldocs';

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
};

const DOCUMENT_UPLOAD_TIMEOUT_MS = 120000;
const LEGAL_DOC_LIST_TIMEOUT_MS = 45000;

const today = () => new Date().toISOString().split('T')[0];

const normalizeLegalDoc = (raw: any): LegalDocument => ({
  id: String(raw?.id || ''),
  documentName: String(raw?.documentName || 'Untitled Document'),
  documentType: raw?.documentType || 'Contract',
  createdDate: String(raw?.createdDate || today()),
  lastModifiedDate: String(raw?.lastModifiedDate || today()),
  createdBy: String(raw?.createdBy || 'Current User'),
  lastModifiedBy: String(raw?.lastModifiedBy || 'Current User'),
  status: raw?.status || 'Draft',
  fileSize: Number.isFinite(Number(raw?.fileSize)) ? Number(raw.fileSize) : 0,
  fileName: String(raw?.fileName || ''),
  description: String(raw?.description || ''),
  linkedAssets: Array.isArray(raw?.linkedAssets) ? raw.linkedAssets : [],
  linkedDeals: Array.isArray(raw?.linkedDeals)
    ? raw.linkedDeals.map((item: any) => ({
        dealId: String(item?.dealId || ''),
        dealName: String(item?.dealName || ''),
        dealType: String(item?.dealType || ''),
        clientName: item?.clientName ? String(item.clientName) : undefined,
        status: item?.status ? String(item.status) : undefined,
      }))
    : [],
  permissions: Array.isArray(raw?.permissions) ? raw.permissions : [],
  content: typeof raw?.content === 'string' ? raw.content : '',
  tags: Array.isArray(raw?.tags) ? raw.tags : [],
  version: Number.isFinite(Number(raw?.version)) ? Number(raw.version) : 1,
  expiryDate: typeof raw?.expiryDate === 'string' ? raw.expiryDate : undefined,
  filePath: typeof raw?.filePath === 'string' ? raw.filePath : undefined,
  fileType: raw?.fileType,
});

class LegalDocService {
  async getAllDocuments(): Promise<LegalDocument[]> {
    try {
      const response = await apiClient.get<ApiResponse<any[]>>('/legal-docs', {
        params: { includeFileData: 'false' },
        timeout: LEGAL_DOC_LIST_TIMEOUT_MS,
      });
      const records = Array.isArray(response.data?.data) ? response.data.data : [];
      return records.map(normalizeLegalDoc);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to load legal documents');
    }
  }

  async getDocumentById(id: string): Promise<LegalDocument> {
    try {
      const response = await apiClient.get<ApiResponse<any>>(`/documents/${id}`, {
        timeout: LEGAL_DOC_LIST_TIMEOUT_MS,
      });
      return normalizeLegalDoc(response.data?.data);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to load legal document');
    }
  }

  async cleanupTemporaryDocuments(): Promise<number> {
    try {
      const response = await apiClient.delete<ApiResponse<{ deletedCount?: number }>>(
        '/legal-docs/cleanup/temporary'
      );
      return Number(response.data?.data?.deletedCount || 0);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(
        axiosError.response?.data?.message || 'Failed to clean temporary legal documents'
      );
    }
  }

  async createDocument(document: LegalDocument): Promise<LegalDocument> {
    try {
      const response = await apiClient.post<ApiResponse<any>>('/legal-docs', document, {
        timeout: DOCUMENT_UPLOAD_TIMEOUT_MS,
      });
      return normalizeLegalDoc(response.data?.data);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create legal document');
    }
  }

  async updateDocument(id: string, document: Partial<LegalDocument>): Promise<LegalDocument> {
    try {
      const response = await apiClient.put<ApiResponse<any>>(`/legal-docs/${id}`, document, {
        timeout: DOCUMENT_UPLOAD_TIMEOUT_MS,
      });
      return normalizeLegalDoc(response.data?.data);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to update legal document');
    }
  }

  async deleteDocument(id: string): Promise<void> {
    try {
      await apiClient.delete(`/legal-docs/${id}`);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete legal document');
    }
  }

  async linkDocumentToDeal(
    documentId: string,
    dealId: string,
    options?: {
      status?: string;
      filledDocumentRecordId?: string;
      filledDocumentDownloadUrl?: string;
      filledDocumentName?: string;
      completedAt?: string;
    }
  ): Promise<LegalDocument> {
    try {
      const response = await apiClient.post<ApiResponse<any>>('/documents/link', {
        documentId,
        dealId,
        ...(options?.status ? { status: options.status } : {}),
        ...(options?.filledDocumentRecordId
          ? { filledDocumentRecordId: options.filledDocumentRecordId }
          : {}),
        ...(options?.filledDocumentDownloadUrl
          ? { filledDocumentDownloadUrl: options.filledDocumentDownloadUrl }
          : {}),
        ...(options?.filledDocumentName ? { filledDocumentName: options.filledDocumentName } : {}),
        ...(options?.completedAt ? { completedAt: options.completedAt } : {}),
      });
      return normalizeLegalDoc(response.data?.data);
    } catch (error) {
      const axiosError = error as AxiosError<any>;
      throw new Error(axiosError.response?.data?.message || 'Failed to link document to deal');
    }
  }
}

export const legalDocService = new LegalDocService();
export default legalDocService;
