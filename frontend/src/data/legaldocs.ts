// Legal Documents Data Types and Mock Data

export type DocumentType = 'Purchase Agreement' | 'Lease Agreement' | 'Operating Agreement' | 'Fund Document' | 'Title Deed' | 'Survey' | 'Environmental Report' | 'Inspection Report' | 'Contract';
export type DocumentStatus = 'Draft' | 'Under Review' | 'Approved' | 'Executed' | 'Archived';
export type PermissionLevel = 'View Only' | 'Edit' | 'Approve' | 'Admin';

export interface DocumentLinkedAsset {
  assetId: string;
  assetName: string;
  assetType: string;
}

export interface DocumentLinkedDeal {
  dealId: string;
  dealName: string;
  dealType: string;
  clientName?: string;
  status?: string;
}

export interface DocumentPermission {
  brokerId: string;
  brokerName: string;
  email: string;
  permissionLevel: PermissionLevel;
  grantedDate: string;
  grantedBy: string;
}

export interface LegalDocument {
  id: string;
  documentName: string;
  documentType: DocumentType;
  createdDate: string;
  lastModifiedDate: string;
  createdBy: string;
  lastModifiedBy: string;
  status: DocumentStatus;
  fileSize: number; // in MB
  fileName: string;
  description: string;
  linkedAssets: DocumentLinkedAsset[];
  linkedDeals: DocumentLinkedDeal[];
  permissions: DocumentPermission[];
  content?: string; // Document content/text
  tags: string[];
  version: number;
  expiryDate?: string;
  filePath?: string; // Path or URL to the file
  fileType?: 'pdf' | 'doc' | 'docx' | 'txt'; // File type
  fileData?: ArrayBuffer | Blob; // Binary file data
}

// Mock Legal Documents Data
export const legalDocuments: LegalDocument[] = [];
