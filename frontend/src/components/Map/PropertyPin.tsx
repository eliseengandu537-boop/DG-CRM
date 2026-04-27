// @ts-nocheck
'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
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

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const onDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const panel = (e.currentTarget.closest('[data-pin-panel]') as HTMLElement);
    const rect = panel?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.originX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.originY + (ev.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

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
    <div
      role="button"
      tabIndex={0}
      onClick={() => toggleSection(section)}
      onKeyDown={(e) => e.key === 'Enter' && toggleSection(section)}
      className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors select-none"
    >
      <span className="text-base w-6 text-center shrink-0">{icon}</span>
      <span className="flex-1 font-medium text-gray-800 text-sm">
        {title}
        {count !== undefined && (
          <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">{count}</span>
        )}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {onAdd && (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            className="p-1 text-indigo-500 hover:bg-indigo-50 rounded-md transition-colors"
            title="Add"
          >
            <FiPlus size={14} />
          </button>
        )}
        <span className="text-gray-400">
          {expandedSection === section ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
        </span>
      </div>
    </div>
  );

  const Row = ({ label, value }: { label: string; value?: string | number | null }) =>
    value != null && value !== '' ? (
      <div className="flex items-start justify-between py-2 gap-4">
        <span className="text-xs text-gray-400 uppercase tracking-wide font-medium shrink-0 pt-0.5">{label}</span>
        <span className="text-sm font-medium text-gray-800 text-right">{value}</span>
      </div>
    ) : null;

  return (
    <div
      data-pin-panel
      className="fixed z-50 bg-white shadow-2xl overflow-hidden border border-gray-200 flex flex-col"
      style={{
        ...(pos
          ? { left: pos.x, top: pos.y, width: 400, height: '90vh', borderRadius: '16px' }
          : { right: 0, top: 0, bottom: 0, width: 400, borderRadius: 0 }
        ),
      }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        className="shrink-0 bg-white border-b border-gray-100 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onDragStart}
      >
        {/* Accent stripe */}
        <div className="h-1 bg-indigo-600 w-full" />
        <div className="px-5 pt-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 leading-tight truncate">{property.name}</h2>
              <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
                <span className="shrink-0">📍</span>
                <span className="leading-snug">{property.address}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <FiX size={18} />
            </button>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-semibold">
              {property.details.ownershipStatus}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs font-medium">
              {property.details.type}
            </span>
            <span className="text-xs text-gray-400 ml-auto">{property.assetId}</span>
          </div>

          {/* Broker */}
          <div className="mt-2.5 flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Added by</span>
            <button
              onClick={() => { onPageChange?.('Sales'); onClose(); }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
            >
              {property.brokerName}
            </button>
            {saving && <span className="text-xs text-gray-400 animate-pulse ml-2">Saving…</span>}
          </div>
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">

        {/* Property Details */}
        <div>
          <SectionHeader section="details" icon="🏢" title="Property Details" />
          {expandedSection === 'details' && (
            <div className="px-5 pb-4 bg-gray-50">
              <div className="divide-y divide-gray-100">
                <Row label="Type" value={property.details.type} />
                <Row label="Size" value={`${property.details.squareFeet.toLocaleString()} sqm`} />
                <Row label="GLA" value={`${(property.details.gla ?? property.details.squareFeet).toLocaleString()} sqm`} />
                <Row label="Year Built" value={property.details.yearBuilt} />
                <Row label="Condition" value={property.details.condition} />
                <Row label="Status" value={property.details.ownershipStatus} />
                {property.linkedCompanyName && <Row label="Company Name" value={property.linkedCompanyName} />}
                {property.registrationNumber && <Row label="Registration No." value={property.registrationNumber} />}
                {property.ownerName && <Row label="Owner Name & Surname" value={property.ownerName} />}
                {property.ownerContactNumber && <Row label="Owner Number" value={property.ownerContactNumber} />}
                {property.tenantContactNumber && <Row label="Tenants No." value={property.tenantContactNumber} />}
                {property.ownerEmail && <Row label="Email" value={property.ownerEmail} />}
              </div>
            </div>
          )}
        </div>

        {/* Location */}
        <div>
          <SectionHeader section="location" icon="📍" title="Location Details" />
          {expandedSection === 'location' && (
            <div className="px-5 pb-4 bg-gray-50">
              <div className="divide-y divide-gray-100">
                <Row label="Address" value={property.address} />
                <Row
                  label="Latitude"
                  value={
                    typeof property.latitude === 'number' && Number.isFinite(property.latitude)
                      ? property.latitude.toFixed(6)
                      : 'Not available'
                  }
                />
                <Row
                  label="Longitude"
                  value={
                    typeof property.longitude === 'number' && Number.isFinite(property.longitude)
                      ? property.longitude.toFixed(6)
                      : 'Not available'
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Linked Deals */}
        <div>
          <SectionHeader section="deals" icon="📋" title="Linked Deals" count={linkedDeals.length + liveDeals.length} onAdd={() => setShowAddDeal((v) => !v)} />
          {expandedSection === 'deals' && (
            <div className="px-5 pb-4 bg-gray-50 space-y-2">
              {showAddDeal && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mt-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Add Deal</p>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Deal name *" value={newDeal.dealName} onChange={(e) => setNewDeal((d) => ({ ...d, dealName: e.target.value }))} />
                  <div className="grid grid-cols-2 gap-2">
                    <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" value={newDeal.dealType} onChange={(e) => setNewDeal((d) => ({ ...d, dealType: e.target.value }))}>
                      {['Sale', 'Lease', 'Auction', 'Mortgage'].map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" value={newDeal.status} onChange={(e) => setNewDeal((d) => ({ ...d, status: e.target.value }))}>
                      {['Active', 'Pending', 'Closed', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Value (e.g. R 1,200,000)" value={newDeal.value} onChange={(e) => setNewDeal((d) => ({ ...d, value: e.target.value }))} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddDeal(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button onClick={handleAddDeal} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Add Deal</button>
                  </div>
                </div>
              )}
              {linkedDeals.length === 0 && liveDeals.length === 0 && !showAddDeal && (
                <p className="text-gray-400 text-sm text-center py-4">No linked deals</p>
              )}
              {linkedDeals.map((deal) => (
                <div key={deal.id} className="bg-white border border-gray-200 rounded-xl p-3.5 mt-2">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-semibold text-gray-900 text-sm">{deal.dealName}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{deal.dealType}</span>
                      <button onClick={() => handleRemoveDeal(deal.id)} className="text-red-400 hover:text-red-600"><FiTrash2 size={13} /></button>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    <Row label="Status" value={deal.status} />
                    <Row label="Value" value={deal.value} />
                  </div>
                </div>
              ))}
              {liveDeals.map((deal) => (
                <div key={deal.id} className="bg-white border border-gray-200 rounded-xl p-3.5 mt-2">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{deal.title}</p>
                      <span className="text-xs text-indigo-500 font-medium">CRM Deal</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{deal.type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${deal.status === 'Closed' || deal.status === 'Won' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{deal.status}</span>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    <Row label="Value" value={`R ${Number(deal.value || 0).toLocaleString('en-ZA')}`} />
                    {deal.assignedBrokerName && <Row label="Broker" value={deal.assignedBrokerName} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Linked Contacts */}
        <div>
          <SectionHeader section="contacts" icon="👥" title="Linked Contacts" count={linkedContacts.length + liveContacts.length} onAdd={() => setShowAddContact((v) => !v)} />
          {expandedSection === 'contacts' && (
            <div className="px-5 pb-4 bg-gray-50 space-y-2">
              {showAddContact && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mt-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Link Contact</p>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)}>
                    <option value="">Select a contact…</option>
                    {unlinkedContacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''} — {c.email}</option>
                    ))}
                  </select>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddContact(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button onClick={handleLinkContact} disabled={!selectedContactId} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">Link</button>
                  </div>
                </div>
              )}
              {linkedContacts.length === 0 && liveContacts.length === 0 && !showAddContact && (
                <p className="text-gray-400 text-sm text-center py-4">No linked contacts</p>
              )}
              {linkedContacts.map((contact) => (
                <div key={contact.id} className="bg-white border border-gray-200 rounded-xl p-3.5 mt-2">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-semibold text-gray-900 text-sm">{contact.name}</p>
                    <button onClick={() => handleUnlinkContact(contact.id)} className="text-red-400 hover:text-red-600 shrink-0"><FiTrash2 size={13} /></button>
                  </div>
                  <div className="space-y-1">
                    {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline"><span className="text-gray-400">✉</span>{contact.email}</a>}
                    {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline"><span className="text-gray-400">📞</span>{contact.phone}</a>}
                  </div>
                </div>
              ))}
              {liveContacts.map((contact) => (
                <div key={contact.id} className="bg-white border border-gray-200 rounded-xl p-3.5 mt-2">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim()}</p>
                      <span className="text-xs text-teal-600 font-medium">From Deal</span>
                    </div>
                    {contact.type && <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full shrink-0">{contact.type}</span>}
                  </div>
                  <div className="space-y-1">
                    {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline"><span className="text-gray-400">✉</span>{contact.email}</a>}
                    {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline"><span className="text-gray-400">📞</span>{contact.phone}</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Leads from Deals */}
        {liveLeads.length > 0 && (
          <div>
            <SectionHeader section="contacts" icon="🎯" title="Linked Leads" count={liveLeads.length} />
            {expandedSection === 'contacts' && (
              <div className="px-5 pb-4 bg-gray-50 space-y-2">
                {liveLeads.map((lead) => (
                  <div key={lead.id} className="bg-white border border-gray-200 rounded-xl p-3.5 mt-2">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{lead.name}</p>
                        <span className="text-xs text-amber-600 font-medium">From Deal</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${lead.status === 'Won' ? 'bg-green-100 text-green-700' : lead.status === 'Lost' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{lead.status}</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {lead.email && <Row label="Email" value={lead.email} />}
                      {lead.phone && <Row label="Phone" value={lead.phone} />}
                      {lead.dealType && <Row label="Deal Type" value={lead.dealType} />}
                      {lead.value != null && <Row label="Value" value={`R ${Number(lead.value).toLocaleString('en-ZA')}`} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Linked Company & Fund */}
        <div>
          <div className="px-5 py-3.5 grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">🏢 Company</p>
              <p className="text-sm font-semibold text-gray-900 leading-snug">
                {property.linkedCompanyName || liveCompanyName || <span className="text-gray-400 font-normal">None</span>}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1.5">💰 Fund</p>
              <p className="text-sm font-semibold text-gray-900 leading-snug">
                {property.linkedFundName || liveFundName || <span className="text-gray-400 font-normal">None</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Leasing Records */}
        <div>
          <SectionHeader section="leasing" icon="🔑" title="Leasing Records" count={leasingRecords.length} onAdd={() => setShowAddLeasing((v) => !v)} />
          {expandedSection === 'leasing' && (
            <div className="px-5 pb-4 bg-gray-50 space-y-2">
              {showAddLeasing && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mt-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Add Lease Record</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Tenant / Company *" value={newLeasing.tenant} onChange={(e) => setNewLeasing((d) => ({ ...d, tenant: e.target.value }))} />
                    <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Monthly amount *" value={newLeasing.amount} onChange={(e) => setNewLeasing((d) => ({ ...d, amount: e.target.value }))} />
                    <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" value={newLeasing.date} onChange={(e) => setNewLeasing((d) => ({ ...d, date: e.target.value }))} />
                    <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Duration (e.g. 3 years)" value={newLeasing.duration} onChange={(e) => setNewLeasing((d) => ({ ...d, duration: e.target.value }))} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddLeasing(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button onClick={handleAddLeasingRecord} className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">Add Record</button>
                  </div>
                </div>
              )}
              {leasingRecords.length === 0 && !showAddLeasing && <p className="text-gray-400 text-sm text-center py-4">No leasing records</p>}
              {leasingRecords.map((record) => (
                <div key={record.id} className="bg-white border border-gray-200 rounded-xl p-3.5 mt-2">
                  <p className="font-semibold text-gray-900 text-sm mb-2">{record.tenant}</p>
                  <div className="divide-y divide-gray-100">
                    <Row label="Monthly" value={record.amount} />
                    <Row label="Duration" value={record.duration} />
                    {record.date && <Row label="Start" value={new Date(record.date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' })} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sales Records */}
        <div>
          <SectionHeader section="sales" icon="🏷️" title="Sales Records" count={salesRecords.length} onAdd={() => setShowAddSales((v) => !v)} />
          {expandedSection === 'sales' && (
            <div className="px-5 pb-4 bg-gray-50 space-y-2">
              {showAddSales && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mt-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Add Sale Record</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Buyer / Party *" value={newSales.tenant} onChange={(e) => setNewSales((d) => ({ ...d, tenant: e.target.value }))} />
                    <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Sale price *" value={newSales.amount} onChange={(e) => setNewSales((d) => ({ ...d, amount: e.target.value }))} />
                    <input type="date" className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" value={newSales.date} onChange={(e) => setNewSales((d) => ({ ...d, date: e.target.value }))} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddSales(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button onClick={handleAddSalesRecord} className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700">Add Record</button>
                  </div>
                </div>
              )}
              {salesRecords.length === 0 && !showAddSales && <p className="text-gray-400 text-sm text-center py-4">No sales records</p>}
              {salesRecords.map((record) => (
                <div key={record.id} className="bg-white border border-gray-200 rounded-xl p-3.5 mt-2">
                  <p className="font-semibold text-gray-900 text-sm mb-2">{record.tenant}</p>
                  <div className="divide-y divide-gray-100">
                    <Row label="Sale Price" value={record.amount} />
                    {record.date && <Row label="Date" value={new Date(record.date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' })} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auction Records */}
        <div>
          <SectionHeader section="auction" icon="🎯" title="Auction Records" count={auctionRecords.length} onAdd={() => setShowAddAuction((v) => !v)} />
          {expandedSection === 'auction' && (
            <div className="px-5 pb-4 bg-gray-50 space-y-2">
              {showAddAuction && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mt-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Add Auction Record</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Auction house *" value={newAuction.auctionHouse} onChange={(e) => setNewAuction((d) => ({ ...d, auctionHouse: e.target.value }))} />
                    <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" value={newAuction.status} onChange={(e) => setNewAuction((d) => ({ ...d, status: e.target.value }))}>
                      {['Scheduled', 'In Progress', 'Concluded'].map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" value={newAuction.auctionDate} onChange={(e) => setNewAuction((d) => ({ ...d, auctionDate: e.target.value }))} />
                    <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Estimated value" value={newAuction.estimatedValue} onChange={(e) => setNewAuction((d) => ({ ...d, estimatedValue: e.target.value }))} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddAuction(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button onClick={handleAddAuctionRecord} className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700">Add Record</button>
                  </div>
                </div>
              )}
              {auctionRecords.length === 0 && !showAddAuction && <p className="text-gray-400 text-sm text-center py-4">No auction records</p>}
              {auctionRecords.map((record) => (
                <div key={record.id} className="bg-white border border-gray-200 rounded-xl p-3.5 mt-2">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-semibold text-gray-900 text-sm">{record.auctionHouse}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 text-white ${record.status === 'Concluded' ? 'bg-rose-600' : record.status === 'Scheduled' ? 'bg-amber-500' : 'bg-blue-600'}`}>{record.status}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {record.auctionDate && <Row label="Date" value={new Date(record.auctionDate).toLocaleDateString('en-ZA')} />}
                    <Row label="Est. Value" value={record.estimatedValue} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Linked Documents */}
        <div>
          <SectionHeader section="documents" icon="📄" title="Linked Documents" count={linkedDocuments.length + liveDealDocuments.length} onAdd={() => setShowAddDocument((v) => !v)} />
          {expandedSection === 'documents' && (
            <div className="px-5 pb-4 bg-gray-50 space-y-2">
              {showAddDocument && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mt-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Add Document</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Document name *" value={newDocument.name} onChange={(e) => setNewDocument((d) => ({ ...d, name: e.target.value }))} />
                    <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" value={newDocument.type} onChange={(e) => setNewDocument((d) => ({ ...d, type: e.target.value }))}>
                      {['Contract', 'Deed', 'Lease', 'Insurance', 'Survey', 'Appraisal', 'Other'].map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <input className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="URL (optional)" value={newDocument.url} onChange={(e) => setNewDocument((d) => ({ ...d, url: e.target.value }))} />
                    <input className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Description (optional)" value={newDocument.description} onChange={(e) => setNewDocument((d) => ({ ...d, description: e.target.value }))} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddDocument(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button onClick={handleAddDocument} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add Document</button>
                  </div>
                </div>
              )}
              {linkedDocuments.length === 0 && liveDealDocuments.length === 0 && !showAddDocument && (
                <p className="text-gray-400 text-sm text-center py-4">No documents</p>
              )}
              {[...linkedDocuments.map((d) => ({ ...d, fromCRM: false })), ...liveDealDocuments.map((d) => ({ ...d, fromCRM: true }))].map((doc) => (
                <div key={doc.id} className="bg-white border border-gray-200 rounded-xl p-3.5 mt-2">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{doc.name}</p>
                      {doc.fromCRM && <span className="text-xs text-emerald-600 font-medium">From Deal</span>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{doc.type}</span>
                      {!doc.fromCRM && <button onClick={() => handleRemoveDocument(doc.id)} className="text-red-400 hover:text-red-600"><FiTrash2 size={13} /></button>}
                    </div>
                  </div>
                  {doc.description && <p className="text-xs text-gray-500 mb-1.5">{doc.description}</p>}
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{new Date(doc.uploadDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    {doc.url && <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">View →</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        <div>
          <SectionHeader section="comments" icon="💬" title="Comments" count={comments.length} />
          {expandedSection === 'comments' && (
            <div className="px-5 pb-5 bg-gray-50">
              <div className="space-y-3 max-h-72 overflow-y-auto pt-3">
                {comments.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-4">No comments yet</p>
                )}
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {comment.userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 bg-white rounded-xl p-3 border border-gray-200">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-800">{comment.userName}</span>
                        <span className="text-xs text-gray-400">{formatTime(comment.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <textarea
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  rows={2}
                  placeholder="Add a comment…"
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAddComment(); }
                  }}
                />
                <button
                  onClick={() => void handleAddComment()}
                  disabled={!newCommentText.trim() || savingComment}
                  className="w-9 h-9 self-end bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
                >
                  <FiSend size={14} />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Enter to send · Shift+Enter for new line</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
