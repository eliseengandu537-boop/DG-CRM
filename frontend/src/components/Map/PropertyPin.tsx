// @ts-nocheck
'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { FiX, FiChevronDown, FiChevronUp, FiPlus, FiTrash2, FiSend } from 'react-icons/fi';
import { Property } from '../../data/properties';
import { propertyService } from '@/services/propertyService';
import { contactService } from '@/services/contactService';
import { customRecordService } from '@/services/customRecordService';
import { dealService } from '@/services/dealService';
import { leadService } from '@/services/leadService';
import { useAuth } from '@/context/AuthContext';

interface PropertyPinProps {
  property: Property;
  onClose: () => void;
  onPageChange?: (page: string) => void;
  onPropertyUpdate?: (updated: Property) => void;
}

type Section = 'details' | 'location' | 'deals' | 'contacts' | 'leasing' | 'sales' | 'auction' | 'documents' | 'comments';

type Comment = { id: string; text: string; userName: string; createdAt: string };
type ContactOption = { id: string; name: string; email: string; phone: string; company?: string };

export const PropertyPin: React.FC<PropertyPinProps> = ({
  property,
  onClose,
  onPageChange,
  onPropertyUpdate,
}) => {
  const { user } = useAuth();
  const [expandedSection, setExpandedSection] = useState<Section | null>('details');

  // Local copies of linked data (metadata-backed)
  const [linkedDeals, setLinkedDeals] = useState<Property['linkedDeals']>(property.linkedDeals || []);
  const [linkedContacts, setLinkedContacts] = useState<NonNullable<Property['linkedContacts']>>(property.linkedContacts || []);
  const [linkedDocuments, setLinkedDocuments] = useState<NonNullable<Property['linkedDocuments']>>(property.linkedDocuments || []);
  const [leasingRecords, setLeasingRecords] = useState(
    (property.leasingSalesRecords || []).filter((r) => r.recordType === 'Lease')
  );
  const [salesRecords, setSalesRecords] = useState(
    (property.leasingSalesRecords || []).filter((r) => r.recordType === 'Sale')
  );
  const [auctionRecords, setAuctionRecords] = useState<NonNullable<Property['auctionRecords']>>(property.auctionRecords || []);

  // Live backend data from deals
  const [liveDeals, setLiveDeals] = useState<any[]>([]);
  const [liveLeads, setLiveLeads] = useState<any[]>([]);
  const [liveContacts, setLiveContacts] = useState<any[]>([]);
  const [liveDealDocuments, setLiveDealDocuments] = useState<any[]>([]);
  const [liveCompanyName, setLiveCompanyName] = useState<string | undefined>(undefined);
  const [liveFundName, setLiveFundName] = useState<string | undefined>(undefined);

  // Comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  // Available contacts for picker
  const [availableContacts, setAvailableContacts] = useState<ContactOption[]>([]);

  // Add forms
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddDocument, setShowAddDocument] = useState(false);
  const [showAddLeasing, setShowAddLeasing] = useState(false);
  const [showAddSales, setShowAddSales] = useState(false);
  const [showAddAuction, setShowAddAuction] = useState(false);

  // Form state
  const [newDeal, setNewDeal] = useState({ dealName: '', dealType: 'Sale', status: 'Active', value: '' });
  const [newDocument, setNewDocument] = useState({ name: '', type: 'Contract', url: '', description: '' });
  const [newLeasing, setNewLeasing] = useState({ tenant: '', amount: '', date: '', duration: '' });
  const [newSales, setNewSales] = useState({ tenant: '', amount: '', date: '' });
  const [newAuction, setNewAuction] = useState({ auctionHouse: '', auctionDate: '', estimatedValue: '', status: 'Scheduled' });
  const [selectedContactId, setSelectedContactId] = useState('');

  const [saving, setSaving] = useState(false);

  // Load comments + available contacts + live deal data on mount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [commentResult, contactResult, dealResult, assetResult] = await Promise.all([
        customRecordService
          .getAllCustomRecords({ entityType: 'property_comment', limit: 500 })
          .catch(() => ({ data: [] })),
        contactService.getAllContacts({ limit: 1000 }).catch(() => ({ data: [] })),
        property.id
          ? dealService.getAllDeals({ propertyId: property.id, limit: 100 }).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
        customRecordService
          .getAllCustomRecords({ entityType: 'asset', limit: 500 })
          .catch(() => ({ data: [] })),
      ]);
      if (!mounted) return;

      // Comments
      const propertyComments: Comment[] = (commentResult.data || [])
        .filter((r: any) => r.referenceId === property.id || (r.payload as any)?.propertyId === property.id)
        .map((r: any) => ({
          id: r.id,
          text: String((r.payload as any)?.text || r.name || ''),
          userName: String((r.payload as any)?.userName || 'Unknown'),
          createdAt: r.createdAt,
        }))
        .sort((a: Comment, b: Comment) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setComments(propertyComments);

      // Available contacts for picker
      setAvailableContacts(
        (contactResult.data || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          company: c.company,
        }))
      );

      // Live deals linked to this property
      const deals = Array.isArray(dealResult.data) ? dealResult.data : [];
      setLiveDeals(deals);

      // Collect all unique lead IDs from deals
      const leadIds = Array.from(new Set(deals.map((d: any) => d.leadId).filter(Boolean)));
      if (leadIds.length > 0) {
        const leadResults = await Promise.allSettled(
          leadIds.map((id: string) => leadService.getLeadById(id))
        );
        if (!mounted) return;
        const leads = leadResults
          .filter((r) => r.status === 'fulfilled')
          .map((r: any) => r.value);
        setLiveLeads(leads);

        // Collect contacts from leads
        const contactIds = Array.from(new Set(leads.map((l: any) => l.contactId).filter(Boolean)));
        if (contactIds.length > 0) {
          const contactFetches = await Promise.allSettled(
            contactIds.map((id: string) => contactService.getContactById(id))
          );
          if (!mounted) return;
          setLiveContacts(
            contactFetches
              .filter((r) => r.status === 'fulfilled')
              .map((r: any) => r.value)
          );
        }
      }

      // Collect legal documents from deals
      const docs: any[] = [];
      const seenDocIds = new Set<string>();
      for (const deal of deals) {
        if (deal.legalDocument && !seenDocIds.has(deal.legalDocument.id)) {
          seenDocIds.add(deal.legalDocument.id);
          docs.push({
            id: deal.legalDocument.id,
            name: deal.legalDocument.documentName,
            type: deal.legalDocument.fileType || 'Legal Document',
            url: deal.legalDocument.filePath || '',
            description: `Deal: ${deal.title}`,
            uploadDate: deal.createdAt,
            fromDeal: true,
          });
        }
        for (const sd of deal.statusDocuments || []) {
          if (sd.legalDocument && !seenDocIds.has(sd.legalDocument.id)) {
            seenDocIds.add(sd.legalDocument.id);
            docs.push({
              id: sd.legalDocument.id,
              name: sd.legalDocument.documentName,
              type: sd.legalDocument.documentType || 'Legal Document',
              url: sd.legalDocument.filePath || '',
              description: `Deal: ${deal.title} — Status: ${sd.status}`,
              uploadDate: sd.uploadedAt,
              fromDeal: true,
            });
          }
        }
      }
      setLiveDealDocuments(docs);

      // Try to find company/fund from linked asset custom records
      const assets = Array.isArray(assetResult.data) ? assetResult.data : [];
      const linkedAsset = assets.find(
        (a: any) =>
          (a.payload?.propertyAddress &&
            String(a.payload.propertyAddress).toLowerCase() === property.address.toLowerCase()) ||
          (a.referenceId && a.referenceId === property.id)
      );
      if (linkedAsset) {
        const p = linkedAsset.payload || {};
        if (p.linkedFundId || p.fundName || linkedAsset.name) {
          setLiveFundName(p.fundName || linkedAsset.name || undefined);
        }
        if (p.companyName) {
          setLiveCompanyName(p.companyName);
        }
      }
    };
    void load();
    return () => { mounted = false; };
  }, [property.id, property.address]);

  // Build full metadata for saving
  const buildMetadata = useCallback(
    (overrides: Record<string, unknown> = {}) => ({
      ownershipStatus: property.details.ownershipStatus,
      propertyType: property.details.type,
      squareFeet: property.details.squareFeet,
      gla: property.details.gla,
      yearBuilt: property.details.yearBuilt,
      condition: property.details.condition,
      linkedCompanyId: property.linkedCompanyId,
      linkedCompanyName: property.linkedCompanyName,
      linkedFundId: property.linkedFundId,
      linkedFundName: property.linkedFundName,
      linkedDeals,
      linkedContacts,
      linkedDocuments,
      leasingSalesRecords: [
        ...leasingRecords.map((r) => ({ ...r, recordType: 'Lease' })),
        ...salesRecords.map((r) => ({ ...r, recordType: 'Sale' })),
      ],
      auctionRecords,
      ...overrides,
    }),
    [property, linkedDeals, linkedContacts, linkedDocuments, leasingRecords, salesRecords, auctionRecords]
  );

  const saveToBackend = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving(true);
      try {
        await propertyService.updateProperty(property.id, { metadata: buildMetadata(patch) });
        if (onPropertyUpdate) {
          const allLeasingSales = [
            ...(Array.isArray(patch.leasingSalesRecords)
              ? patch.leasingSalesRecords
              : [
                  ...leasingRecords.map((r) => ({ ...r, recordType: 'Lease' })),
                  ...salesRecords.map((r) => ({ ...r, recordType: 'Sale' })),
                ]),
          ];
          onPropertyUpdate({
            ...property,
            linkedDeals: (patch.linkedDeals as typeof linkedDeals) || linkedDeals,
            linkedContacts: (patch.linkedContacts as typeof linkedContacts) || linkedContacts,
            linkedDocuments: (patch.linkedDocuments as typeof linkedDocuments) || linkedDocuments,
            leasingSalesRecords: allLeasingSales,
            auctionRecords: (patch.auctionRecords as typeof auctionRecords) || auctionRecords,
          });
        }
      } catch (e) {
        console.warn('Failed to save property update', e);
      } finally {
        setSaving(false);
      }
    },
    [property, buildMetadata, linkedDeals, linkedContacts, linkedDocuments, leasingRecords, salesRecords, auctionRecords, onPropertyUpdate]
  );

  const handleAddComment = async () => {
    if (!newCommentText.trim() || savingComment) return;
    setSavingComment(true);
    try {
      const result = await customRecordService.createCustomRecord({
        entityType: 'property_comment',
        name: newCommentText.trim().slice(0, 80),
        referenceId: property.id,
        payload: {
          propertyId: property.id,
          text: newCommentText.trim(),
          userName: user?.name || user?.email || 'Unknown',
          userId: user?.id,
        },
      });
      setComments((prev) => [
        ...prev,
        { id: result.id, text: newCommentText.trim(), userName: user?.name || user?.email || 'Unknown', createdAt: result.createdAt || new Date().toISOString() },
      ]);
      setNewCommentText('');
    } catch (e) {
      console.warn('Failed to save comment', e);
    } finally {
      setSavingComment(false);
    }
  };

  const handleLinkContact = async () => {
    if (!selectedContactId) return;
    const contact = availableContacts.find((c) => c.id === selectedContactId);
    if (!contact || linkedContacts.some((c) => c.id === contact.id)) return;
    const updated = [...linkedContacts, contact];
    setLinkedContacts(updated);
    setSelectedContactId('');
    setShowAddContact(false);
    await saveToBackend({ linkedContacts: updated });
  };

  const handleUnlinkContact = async (id: string) => {
    const updated = linkedContacts.filter((c) => c.id !== id);
    setLinkedContacts(updated);
    await saveToBackend({ linkedContacts: updated });
  };

  const handleAddDeal = async () => {
    if (!newDeal.dealName.trim()) return;
    const deal = { id: `deal-${Date.now()}`, ...newDeal };
    const updated = [...linkedDeals, deal];
    setLinkedDeals(updated);
    setNewDeal({ dealName: '', dealType: 'Sale', status: 'Active', value: '' });
    setShowAddDeal(false);
    await saveToBackend({ linkedDeals: updated });
  };

  const handleRemoveDeal = async (id: string) => {
    const updated = linkedDeals.filter((d) => d.id !== id);
    setLinkedDeals(updated);
    await saveToBackend({ linkedDeals: updated });
  };

  const handleAddDocument = async () => {
    if (!newDocument.name.trim()) return;
    const doc = { id: `doc-${Date.now()}`, uploadDate: new Date().toISOString(), ...newDocument };
    const updated = [...linkedDocuments, doc];
    setLinkedDocuments(updated);
    setNewDocument({ name: '', type: 'Contract', url: '', description: '' });
    setShowAddDocument(false);
    await saveToBackend({ linkedDocuments: updated });
  };

  const handleRemoveDocument = async (id: string) => {
    const updated = linkedDocuments.filter((d) => d.id !== id);
    setLinkedDocuments(updated);
    await saveToBackend({ linkedDocuments: updated });
  };

  const handleAddLeasingRecord = async () => {
    if (!newLeasing.tenant.trim() || !newLeasing.amount.trim()) return;
    const record = { id: `lease-${Date.now()}`, recordType: 'Lease' as const, ...newLeasing };
    const updatedLeasing = [...leasingRecords, record];
    setLeasingRecords(updatedLeasing);
    setNewLeasing({ tenant: '', amount: '', date: '', duration: '' });
    setShowAddLeasing(false);
    const allRecords = [
      ...updatedLeasing.map((r) => ({ ...r, recordType: 'Lease' })),
      ...salesRecords.map((r) => ({ ...r, recordType: 'Sale' })),
    ];
    await saveToBackend({ leasingSalesRecords: allRecords });
  };

  const handleAddSalesRecord = async () => {
    if (!newSales.tenant.trim() || !newSales.amount.trim()) return;
    const record = { id: `sale-${Date.now()}`, recordType: 'Sale' as const, ...newSales };
    const updatedSales = [...salesRecords, record];
    setSalesRecords(updatedSales);
    setNewSales({ tenant: '', amount: '', date: '' });
    setShowAddSales(false);
    const allRecords = [
      ...leasingRecords.map((r) => ({ ...r, recordType: 'Lease' })),
      ...updatedSales.map((r) => ({ ...r, recordType: 'Sale' })),
    ];
    await saveToBackend({ leasingSalesRecords: allRecords });
  };

  const handleAddAuctionRecord = async () => {
    if (!newAuction.auctionHouse.trim()) return;
    const record = { id: `auction-${Date.now()}`, finalPrice: undefined, ...newAuction };
    const updated = [...auctionRecords, record];
    setAuctionRecords(updated);
    setNewAuction({ auctionHouse: '', auctionDate: '', estimatedValue: '', status: 'Scheduled' });
    setShowAddAuction(false);
    await saveToBackend({ auctionRecords: updated });
  };

  const toggleSection = (section: Section) =>
    setExpandedSection((prev) => (prev === section ? null : section));

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return (
      d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
    );
  };

  const unlinkedContacts = availableContacts.filter(
    (c) => !linkedContacts.some((lc) => lc.id === c.id)
  );

  const SectionHeader = ({
    section,
    icon,
    title,
    count,
    onAdd,
  }: {
    section: Section;
    icon: string;
    title: string;
    count?: number;
    onAdd?: () => void;
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className="w-full bg-gradient-to-r from-stone-50 to-stone-100 px-6 py-4 flex justify-between items-center hover:from-stone-100 hover:to-stone-200 transition-colors border-b border-stone-200"
    >
      <h3 className="font-bold text-stone-900 flex items-center gap-2">
        {icon} {title}{' '}
        {count !== undefined && <span className="text-indigo-600">({count})</span>}
      </h3>
      <div className="flex items-center gap-2">
        {onAdd && (
          <span
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            className="text-indigo-600 hover:bg-indigo-100 rounded-full p-1 transition-colors"
            title="Add"
          >
            <FiPlus size={16} />
          </span>
        )}
        {expandedSection === section ? <FiChevronUp /> : <FiChevronDown />}
      </div>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-stone-200">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 text-white p-6 flex justify-between items-start">
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-2">{property.name}</h2>
            <p className="text-indigo-100 flex items-center gap-2">📍 {property.address}</p>
            <p className="text-sm text-indigo-100 mt-3 font-medium">
              Asset ID: <span className="font-bold">{property.assetId}</span>
            </p>
            <p className="text-sm text-indigo-100 mt-2">
              Added by:{' '}
              <button
                onClick={() => { onPageChange?.('Sales'); onClose(); }}
                className="font-bold text-indigo-200 hover:text-white underline hover:no-underline transition-colors"
              >
                {property.brokerName}
              </button>
            </p>
            {saving && (
              <p className="text-xs text-indigo-200 mt-1 animate-pulse">💾 Saving changes…</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-indigo-700 p-2 rounded-lg transition-colors flex-shrink-0"
          >
            <FiX size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Property Details */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <SectionHeader section="details" icon="🏢" title="Property Details" />
            {expandedSection === 'details' && (
              <div className="p-6 bg-white">
                <div className="grid grid-cols-2 gap-6">
                  {[
                    { label: 'Type', value: property.details.type, color: 'border-indigo-500' },
                    { label: 'Size (sqm)', value: property.details.squareFeet.toLocaleString(), color: 'border-blue-500' },
                    { label: 'GLA (sqm)', value: (property.details.gla ?? property.details.squareFeet).toLocaleString(), color: 'border-emerald-500' },
                    { label: 'Year Built', value: String(property.details.yearBuilt), color: 'border-green-500' },
                    { label: 'Condition', value: property.details.condition, color: 'border-amber-500' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className={`border-l-4 ${color} pl-4`}>
                      <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">{label}</p>
                      <p className="font-bold text-stone-900 text-lg mt-1">{value}</p>
                    </div>
                  ))}
                  <div className="col-span-2 border-l-4 border-purple-500 pl-4">
                    <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">Ownership Status</p>
                    <p className="font-bold text-stone-900 text-lg mt-1">{property.details.ownershipStatus}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Location */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <SectionHeader section="location" icon="📍" title="Location Details" />
            {expandedSection === 'location' && (
              <div className="p-6 bg-white space-y-3">
                <div className="border-l-4 border-green-500 pl-4">
                  <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">Full Address</p>
                  <p className="font-bold text-stone-900 text-base mt-1">{property.address}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border-l-4 border-blue-500 pl-4">
                    <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">Latitude</p>
                    <p className="font-bold text-stone-900 text-sm mt-1">{property.latitude.toFixed(4)}</p>
                  </div>
                  <div className="border-l-4 border-purple-500 pl-4">
                    <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">Longitude</p>
                    <p className="font-bold text-stone-900 text-sm mt-1">{property.longitude.toFixed(4)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Linked Deals */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <SectionHeader section="deals" icon="📋" title="Linked Deals" count={linkedDeals.length + liveDeals.length} onAdd={() => setShowAddDeal((v) => !v)} />
            {expandedSection === 'deals' && (
              <div className="p-4 bg-white space-y-3">
                {showAddDeal && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3 mb-2">
                    <h4 className="text-sm font-semibold text-stone-900">Add Deal</h4>
                    <input className="w-full border border-stone-300 rounded px-3 py-2 text-sm" placeholder="Deal name *" value={newDeal.dealName} onChange={(e) => setNewDeal((d) => ({ ...d, dealName: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-2">
                      <select className="border border-stone-300 rounded px-3 py-2 text-sm" value={newDeal.dealType} onChange={(e) => setNewDeal((d) => ({ ...d, dealType: e.target.value }))}>
                        {['Sale', 'Lease', 'Auction', 'Mortgage'].map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <select className="border border-stone-300 rounded px-3 py-2 text-sm" value={newDeal.status} onChange={(e) => setNewDeal((d) => ({ ...d, status: e.target.value }))}>
                        {['Active', 'Pending', 'Closed', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <input className="w-full border border-stone-300 rounded px-3 py-2 text-sm" placeholder="Value (e.g. R 1,200,000)" value={newDeal.value} onChange={(e) => setNewDeal((d) => ({ ...d, value: e.target.value }))} />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowAddDeal(false)} className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded">Cancel</button>
                      <button onClick={handleAddDeal} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">Add Deal</button>
                    </div>
                  </div>
                )}
                {linkedDeals.length > 0 ? (
                  linkedDeals.map((deal) => (
                    <div key={deal.id} className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-stone-900">{deal.dealName}</h4>
                        <div className="flex items-center gap-2">
                          <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{deal.dealType}</span>
                          <button onClick={() => handleRemoveDeal(deal.id)} className="text-red-400 hover:text-red-600 transition-colors" title="Remove"><FiTrash2 size={14} /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="border-l-2 border-blue-400 pl-3"><p className="text-xs text-stone-600 uppercase font-semibold">Status</p><p className="font-bold text-stone-900 mt-0.5">{deal.status}</p></div>
                        <div className="border-l-2 border-indigo-400 pl-3"><p className="text-xs text-stone-600 uppercase font-semibold">Value</p><p className="font-bold text-stone-900 mt-0.5">{deal.value}</p></div>
                      </div>
                    </div>
                  ))
                ) : null}
                {liveDeals.map((deal) => (
                  <div key={deal.id} className="bg-gradient-to-r from-violet-50 to-indigo-50 border-2 border-violet-300 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-stone-900">{deal.title}</h4>
                        <span className="text-xs text-violet-500 font-medium">From CRM Deal</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-violet-600 text-white text-xs px-2 py-0.5 rounded-full capitalize">{deal.type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${deal.status === 'Closed' || deal.status === 'Won' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{deal.status}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="border-l-2 border-violet-400 pl-3"><p className="text-xs text-stone-600 uppercase font-semibold">Value</p><p className="font-bold text-stone-900 mt-0.5">R {Number(deal.value || 0).toLocaleString('en-ZA')}</p></div>
                      {deal.assignedBrokerName && <div className="border-l-2 border-indigo-400 pl-3"><p className="text-xs text-stone-600 uppercase font-semibold">Broker</p><p className="font-bold text-stone-900 mt-0.5">{deal.assignedBrokerName}</p></div>}
                    </div>
                  </div>
                ))}
                {linkedDeals.length === 0 && liveDeals.length === 0 && (
                  <p className="text-stone-500 text-sm text-center py-4">No linked deals — click + to add one</p>
                )}
              </div>
            )}
          </div>

          {/* Linked Contacts */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <SectionHeader section="contacts" icon="👥" title="Linked Contacts" count={linkedContacts.length + liveContacts.length} onAdd={() => setShowAddContact((v) => !v)} />
            {expandedSection === 'contacts' && (
              <div className="p-4 bg-white space-y-3">
                {showAddContact && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3 mb-2">
                    <h4 className="text-sm font-semibold text-stone-900">Link Existing Contact</h4>
                    <select className="w-full border border-stone-300 rounded px-3 py-2 text-sm" value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)}>
                      <option value="">-- Select a contact --</option>
                      {unlinkedContacts.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''} — {c.email}</option>
                      ))}
                    </select>
                    {unlinkedContacts.length === 0 && (
                      <p className="text-xs text-stone-400">All contacts are already linked, or no contacts exist.</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowAddContact(false)} className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded">Cancel</button>
                      <button onClick={handleLinkContact} disabled={!selectedContactId} className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">Link Contact</button>
                    </div>
                  </div>
                )}
                {linkedContacts.length > 0 ? (
                  linkedContacts.map((contact) => (
                    <div key={contact.id} className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-stone-900 mb-2">{contact.name}</h4>
                        <button onClick={() => handleUnlinkContact(contact.id)} className="text-red-400 hover:text-red-600 transition-colors" title="Unlink"><FiTrash2 size={14} /></button>
                      </div>
                      <div className="space-y-1 text-sm">
                        {contact.email && (
                          <div className="flex items-center gap-2"><span className="text-xs text-stone-600 uppercase font-semibold w-16">Email:</span><a href={`mailto:${contact.email}`} className="text-indigo-600 hover:underline">{contact.email}</a></div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2"><span className="text-xs text-stone-600 uppercase font-semibold w-16">Phone:</span><a href={`tel:${contact.phone}`} className="text-indigo-600 hover:underline">{contact.phone}</a></div>
                        )}
                      </div>
                    </div>
                  ))
                ) : null}
                {liveContacts.map((contact) => (
                  <div key={contact.id} className="bg-gradient-to-r from-teal-50 to-cyan-50 border-2 border-teal-300 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-1">
                      <div>
                        <h4 className="font-bold text-stone-900">{contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim()}</h4>
                        <span className="text-xs text-teal-600 font-medium">From Deal</span>
                      </div>
                      {contact.type && <span className="bg-teal-100 text-teal-700 text-xs px-2 py-0.5 rounded-full">{contact.type}</span>}
                    </div>
                    <div className="space-y-1 text-sm">
                      {contact.email && <div className="flex items-center gap-2"><span className="text-xs text-stone-600 uppercase font-semibold w-16">Email:</span><a href={`mailto:${contact.email}`} className="text-indigo-600 hover:underline">{contact.email}</a></div>}
                      {contact.phone && <div className="flex items-center gap-2"><span className="text-xs text-stone-600 uppercase font-semibold w-16">Phone:</span><a href={`tel:${contact.phone}`} className="text-indigo-600 hover:underline">{contact.phone}</a></div>}
                      {contact.company && <div className="flex items-center gap-2"><span className="text-xs text-stone-600 uppercase font-semibold w-16">Company:</span><span className="text-stone-700">{contact.company}</span></div>}
                    </div>
                  </div>
                ))}
                {linkedContacts.length === 0 && liveContacts.length === 0 && (
                  <p className="text-stone-500 text-sm text-center py-4">No linked contacts — click + to link one</p>
                )}
              </div>
            )}
          </div>

          {/* Leads from Deals */}
          {liveLeads.length > 0 && (
            <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
              <SectionHeader section="contacts" icon="🎯" title="Linked Leads" count={liveLeads.length} />
              {expandedSection === 'contacts' && (
                <div className="p-4 bg-white space-y-3">
                  {liveLeads.map((lead) => (
                    <div key={lead.id} className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-300 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-bold text-stone-900">{lead.name}</h4>
                          <span className="text-xs text-amber-600 font-medium">From Deal</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lead.status === 'Won' ? 'bg-green-100 text-green-700' : lead.status === 'Lost' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{lead.status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {lead.email && <div className="border-l-2 border-amber-400 pl-3"><p className="text-xs text-stone-600 uppercase font-semibold">Email</p><a href={`mailto:${lead.email}`} className="font-medium text-indigo-600 hover:underline mt-0.5 block truncate">{lead.email}</a></div>}
                        {lead.phone && <div className="border-l-2 border-yellow-400 pl-3"><p className="text-xs text-stone-600 uppercase font-semibold">Phone</p><a href={`tel:${lead.phone}`} className="font-medium text-indigo-600 hover:underline mt-0.5 block">{lead.phone}</a></div>}
                        {lead.dealType && <div className="border-l-2 border-orange-400 pl-3"><p className="text-xs text-stone-600 uppercase font-semibold">Deal Type</p><p className="font-bold text-stone-900 mt-0.5">{lead.dealType}</p></div>}
                        {lead.value != null && <div className="border-l-2 border-amber-500 pl-3"><p className="text-xs text-stone-600 uppercase font-semibold">Value</p><p className="font-bold text-stone-900 mt-0.5">R {Number(lead.value).toLocaleString('en-ZA')}</p></div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Linked Company & Fund */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
              <div className="bg-gradient-to-r from-stone-50 to-stone-100 px-6 py-4 border-b border-stone-200">
                <h3 className="font-bold text-stone-900 flex items-center gap-2">🏢 Linked Company</h3>
              </div>
              <div className="p-6 bg-white">
                {(property.linkedCompanyName || liveCompanyName) ? (
                  <div>
                    <p className="text-xs text-stone-600 uppercase font-semibold mb-2">Company Name</p>
                    <p className="font-bold text-stone-900 text-base">{property.linkedCompanyName || liveCompanyName}</p>
                  </div>
                ) : liveDeals.length > 0 ? (
                  <div className="space-y-2">
                    {liveDeals.filter((d) => d.assignedBrokerName).slice(0, 1).map((d) => (
                      <div key={d.id}>
                        <p className="text-xs text-stone-600 uppercase font-semibold mb-1">Via Deal</p>
                        <p className="font-bold text-stone-900 text-sm">{d.title}</p>
                      </div>
                    ))}
                    {!liveDeals.some((d) => d.assignedBrokerName) && (
                      <p className="text-stone-500 text-sm text-center py-4">No linked company</p>
                    )}
                  </div>
                ) : (
                  <p className="text-stone-500 text-sm text-center py-4">No linked company</p>
                )}
              </div>
            </div>
            <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
              <div className="bg-gradient-to-r from-stone-50 to-stone-100 px-6 py-4 border-b border-stone-200">
                <h3 className="font-bold text-stone-900 flex items-center gap-2">💰 Linked Fund</h3>
              </div>
              <div className="p-6 bg-white">
                {(property.linkedFundName || liveFundName) ? (
                  <div>
                    <p className="text-xs text-stone-600 uppercase font-semibold mb-2">Fund Name</p>
                    <p className="font-bold text-stone-900 text-base">{property.linkedFundName || liveFundName}</p>
                  </div>
                ) : (
                  <p className="text-stone-500 text-sm text-center py-4">No linked fund</p>
                )}
              </div>
            </div>
          </div>

          {/* Leasing Records */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <SectionHeader section="leasing" icon="🔑" title="Leasing Records" count={leasingRecords.length} onAdd={() => setShowAddLeasing((v) => !v)} />
            {expandedSection === 'leasing' && (
              <div className="p-4 bg-white space-y-3">
                {showAddLeasing && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3 mb-2">
                    <h4 className="text-sm font-semibold text-stone-900">Add Lease Record</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="border border-stone-300 rounded px-3 py-2 text-sm" placeholder="Tenant / Company *" value={newLeasing.tenant} onChange={(e) => setNewLeasing((d) => ({ ...d, tenant: e.target.value }))} />
                      <input className="border border-stone-300 rounded px-3 py-2 text-sm" placeholder="Monthly amount *" value={newLeasing.amount} onChange={(e) => setNewLeasing((d) => ({ ...d, amount: e.target.value }))} />
                      <input type="date" className="border border-stone-300 rounded px-3 py-2 text-sm" value={newLeasing.date} onChange={(e) => setNewLeasing((d) => ({ ...d, date: e.target.value }))} />
                      <input className="border border-stone-300 rounded px-3 py-2 text-sm" placeholder="Duration (e.g. 3 years)" value={newLeasing.duration} onChange={(e) => setNewLeasing((d) => ({ ...d, duration: e.target.value }))} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowAddLeasing(false)} className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded">Cancel</button>
                      <button onClick={handleAddLeasingRecord} className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700">Add Record</button>
                    </div>
                  </div>
                )}
                {leasingRecords.length > 0 ? (
                  leasingRecords.map((record) => (
                    <div key={record.id} className="rounded-lg p-4 border-2 bg-gradient-to-r from-green-50 to-emerald-50 border-green-300">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-stone-900">🔑 {record.tenant}</h4>
                        <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
                          {record.date ? new Date(record.date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' }) : '—'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="border-l-2 border-green-400 pl-3"><p className="text-xs text-stone-600 uppercase font-semibold">Monthly</p><p className="font-bold text-stone-900 mt-0.5">{record.amount}</p></div>
                        {record.duration && <div className="border-l-2 border-emerald-400 pl-3"><p className="text-xs text-stone-600 uppercase font-semibold">Duration</p><p className="font-bold text-stone-900 mt-0.5">{record.duration}</p></div>}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-stone-500 text-sm text-center py-4">No leasing records — click + to add one</p>
                )}
              </div>
            )}
          </div>

          {/* Sales Records */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <SectionHeader section="sales" icon="🏷️" title="Sales Records" count={salesRecords.length} onAdd={() => setShowAddSales((v) => !v)} />
            {expandedSection === 'sales' && (
              <div className="p-4 bg-white space-y-3">
                {showAddSales && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3 mb-2">
                    <h4 className="text-sm font-semibold text-stone-900">Add Sale Record</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="border border-stone-300 rounded px-3 py-2 text-sm" placeholder="Buyer / Party *" value={newSales.tenant} onChange={(e) => setNewSales((d) => ({ ...d, tenant: e.target.value }))} />
                      <input className="border border-stone-300 rounded px-3 py-2 text-sm" placeholder="Sale price *" value={newSales.amount} onChange={(e) => setNewSales((d) => ({ ...d, amount: e.target.value }))} />
                      <input type="date" className="col-span-2 border border-stone-300 rounded px-3 py-2 text-sm" value={newSales.date} onChange={(e) => setNewSales((d) => ({ ...d, date: e.target.value }))} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowAddSales(false)} className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded">Cancel</button>
                      <button onClick={handleAddSalesRecord} className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded hover:bg-orange-700">Add Record</button>
                    </div>
                  </div>
                )}
                {salesRecords.length > 0 ? (
                  salesRecords.map((record) => (
                    <div key={record.id} className="rounded-lg p-4 border-2 bg-gradient-to-r from-orange-50 to-amber-50 border-orange-300">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-stone-900">🏷️ {record.tenant}</h4>
                        <span className="bg-orange-600 text-white text-xs px-2 py-0.5 rounded-full">
                          {record.date ? new Date(record.date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' }) : '—'}
                        </span>
                      </div>
                      <div className="border-l-2 border-orange-400 pl-3 text-sm"><p className="text-xs text-stone-600 uppercase font-semibold">Sale Price</p><p className="font-bold text-stone-900 mt-0.5">{record.amount}</p></div>
                    </div>
                  ))
                ) : (
                  <p className="text-stone-500 text-sm text-center py-4">No sales records — click + to add one</p>
                )}
              </div>
            )}
          </div>

          {/* Auction Records */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <SectionHeader section="auction" icon="🎯" title="Auction Records" count={auctionRecords.length} onAdd={() => setShowAddAuction((v) => !v)} />
            {expandedSection === 'auction' && (
              <div className="p-4 bg-white space-y-3">
                {showAddAuction && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 space-y-3 mb-2">
                    <h4 className="text-sm font-semibold text-stone-900">Add Auction Record</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="border border-stone-300 rounded px-3 py-2 text-sm" placeholder="Auction house *" value={newAuction.auctionHouse} onChange={(e) => setNewAuction((d) => ({ ...d, auctionHouse: e.target.value }))} />
                      <select className="border border-stone-300 rounded px-3 py-2 text-sm" value={newAuction.status} onChange={(e) => setNewAuction((d) => ({ ...d, status: e.target.value }))}>
                        {['Scheduled', 'In Progress', 'Concluded'].map((s) => <option key={s}>{s}</option>)}
                      </select>
                      <input type="date" className="border border-stone-300 rounded px-3 py-2 text-sm" value={newAuction.auctionDate} onChange={(e) => setNewAuction((d) => ({ ...d, auctionDate: e.target.value }))} />
                      <input className="border border-stone-300 rounded px-3 py-2 text-sm" placeholder="Estimated value" value={newAuction.estimatedValue} onChange={(e) => setNewAuction((d) => ({ ...d, estimatedValue: e.target.value }))} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowAddAuction(false)} className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded">Cancel</button>
                      <button onClick={handleAddAuctionRecord} className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded hover:bg-rose-700">Add Record</button>
                    </div>
                  </div>
                )}
                {auctionRecords.length > 0 ? (
                  auctionRecords.map((record) => (
                    <div key={record.id} className="rounded-lg p-4 border-2 bg-gradient-to-r from-rose-50 to-pink-50 border-rose-300">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-stone-900">🎯 {record.auctionHouse}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold text-white ${record.status === 'Concluded' ? 'bg-rose-600' : record.status === 'Scheduled' ? 'bg-yellow-600' : 'bg-blue-600'}`}>
                          {record.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="border-l-2 border-rose-400 pl-3"><p className="text-xs text-stone-600 uppercase font-semibold">Auction Date</p><p className="font-bold text-stone-900 mt-0.5">{record.auctionDate ? new Date(record.auctionDate).toLocaleDateString('en-ZA') : '—'}</p></div>
                        <div className="border-l-2 border-pink-400 pl-3"><p className="text-xs text-stone-600 uppercase font-semibold">Est. Value</p><p className="font-bold text-stone-900 mt-0.5">{record.estimatedValue}</p></div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-stone-500 text-sm text-center py-4">No auction records — click + to add one</p>
                )}
              </div>
            )}
          </div>

          {/* Linked Documents */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <SectionHeader section="documents" icon="📄" title="Linked Documents" count={linkedDocuments.length + liveDealDocuments.length} onAdd={() => setShowAddDocument((v) => !v)} />
            {expandedSection === 'documents' && (
              <div className="p-4 bg-white space-y-3">
                {showAddDocument && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3 mb-2">
                    <h4 className="text-sm font-semibold text-stone-900">Add Document</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="border border-stone-300 rounded px-3 py-2 text-sm" placeholder="Document name *" value={newDocument.name} onChange={(e) => setNewDocument((d) => ({ ...d, name: e.target.value }))} />
                      <select className="border border-stone-300 rounded px-3 py-2 text-sm" value={newDocument.type} onChange={(e) => setNewDocument((d) => ({ ...d, type: e.target.value }))}>
                        {['Contract', 'Deed', 'Lease', 'Insurance', 'Survey', 'Appraisal', 'Other'].map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <input className="col-span-2 border border-stone-300 rounded px-3 py-2 text-sm" placeholder="URL (optional)" value={newDocument.url} onChange={(e) => setNewDocument((d) => ({ ...d, url: e.target.value }))} />
                      <input className="col-span-2 border border-stone-300 rounded px-3 py-2 text-sm" placeholder="Description (optional)" value={newDocument.description} onChange={(e) => setNewDocument((d) => ({ ...d, description: e.target.value }))} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowAddDocument(false)} className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded">Cancel</button>
                      <button onClick={handleAddDocument} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Add Document</button>
                    </div>
                  </div>
                )}
                {linkedDocuments.length > 0 ? (
                  linkedDocuments.map((doc) => (
                    <div key={doc.id} className="rounded-lg p-4 border-2 bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-stone-900">📄 {doc.name}</h4>
                        <div className="flex items-center gap-2">
                          <span className="bg-stone-200 text-stone-800 text-xs px-2 py-0.5 rounded">{doc.type}</span>
                          <button onClick={() => handleRemoveDocument(doc.id)} className="text-red-400 hover:text-red-600 transition-colors" title="Remove"><FiTrash2 size={14} /></button>
                        </div>
                      </div>
                      {doc.description && <p className="text-sm text-stone-600 mb-2">{doc.description}</p>}
                      <div className="flex justify-between items-center text-xs text-stone-500">
                        <span>Added: {new Date(doc.uploadDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        {doc.url && <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">View →</a>}
                      </div>
                    </div>
                  ))
                ) : null}
                {liveDealDocuments.map((doc) => (
                  <div key={doc.id} className="rounded-lg p-4 border-2 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-300">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-stone-900">📄 {doc.name}</h4>
                        <span className="text-xs text-emerald-600 font-medium">From Deal</span>
                      </div>
                      <span className="bg-emerald-200 text-emerald-800 text-xs px-2 py-0.5 rounded">{doc.type}</span>
                    </div>
                    {doc.description && <p className="text-sm text-stone-600 mb-2">{doc.description}</p>}
                    <div className="flex justify-between items-center text-xs text-stone-500">
                      <span>Added: {new Date(doc.uploadDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      {doc.url && <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">View →</a>}
                    </div>
                  </div>
                ))}
                {linkedDocuments.length === 0 && liveDealDocuments.length === 0 && (
                  <p className="text-stone-500 text-sm text-center py-4">No documents linked — click + to add one</p>
                )}
              </div>
            )}
          </div>

          {/* Comments & Timeline */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <SectionHeader section="comments" icon="💬" title="Comments & Timeline" count={comments.length} />
            {expandedSection === 'comments' && (
              <div className="p-4 bg-white space-y-4">
                {/* Timeline */}
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {comments.length > 0 ? (
                    <div className="relative pl-2">
                      <div className="absolute left-6 top-5 bottom-5 w-0.5 bg-stone-200" />
                      {comments.map((comment, idx) => (
                        <div key={comment.id} className={`flex gap-3 ${idx < comments.length - 1 ? 'pb-4' : ''}`}>
                          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold z-10 relative">
                            {comment.userName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 bg-stone-50 rounded-lg p-3 border border-stone-200">
                            <div className="flex justify-between items-center mb-1 flex-wrap gap-1">
                              <span className="text-sm font-semibold text-stone-900">{comment.userName}</span>
                              <span className="text-xs text-stone-400">{formatTime(comment.createdAt)}</span>
                            </div>
                            <p className="text-sm text-stone-700 whitespace-pre-wrap">{comment.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-stone-500 text-sm text-center py-6">No comments yet. Start the conversation below!</p>
                  )}
                </div>

                {/* New Comment Input */}
                <div className="border-t border-stone-200 pt-3">
                  <div className="flex gap-2 items-end">
                    <textarea
                      className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      rows={2}
                      placeholder="Write a comment or note about this property…"
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleAddComment();
                        }
                      }}
                    />
                    <button
                      onClick={() => void handleAddComment()}
                      disabled={!newCommentText.trim() || savingComment}
                      className="flex-shrink-0 w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      <FiSend size={16} />
                    </button>
                  </div>
                  <p className="text-xs text-stone-400 mt-1">Press Enter to send · Shift+Enter for new line</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
