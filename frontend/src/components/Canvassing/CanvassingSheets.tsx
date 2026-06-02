import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiPlus,
  FiTrash2,
  FiCheckCircle,
  FiClipboard,
  FiDatabase,
  FiEdit2,
  FiExternalLink,
} from 'react-icons/fi';
import { customRecordService, CustomRecord } from '@/services/customRecordService';
import { contactService } from '@/services/contactService';
import { propertyService } from '@/services/propertyService';
import { navigateToPage } from '@/lib/crmNavigation';

const CANVASSING_SHEET_ENTITY = 'canvassing_sheet';

const CONTACT_TYPE_OPTIONS = [
  'Asset Manager',
  'Property Developer',
  'Property Manager',
  'Investor',
  'Leasing Manager',
  'Tenant',
  'Landlord',
  'Broker',
] as const;

const COMPANY_TYPE_OPTIONS = [
  'Private Company',
  'PTY LTD',
  'Personal Liability Company',
  'Public Company/Listed Funds',
  'State Owned Company',
] as const;

export interface CanvassingRow {
  id: string;
  contactName: string;
  contactType: string;
  companyType: string;
  phone: string;
  email: string;
  company: string;
  /** Optional property fields — when set, marking the row contacted also creates a Property record visible on the Map. */
  propertyName: string;
  propertyAddress: string;
  registrationNumber: string;
  comments: string;
  /** 'contacted' = successfully contacted (green); otherwise pending */
  status: 'pending' | 'contacted';
  /** true once the row's details have been pushed to the main contacts database */
  synced?: boolean;
}

interface CanvassingSheetPayload {
  brokerId: string;
  brokerName: string;
  rows: CanvassingRow[];
}

interface CanvassingSheetsProps {
  broker: { id: string; name: string };
}

const makeId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const emptyRow = (): CanvassingRow => ({
  id: makeId(),
  contactName: '',
  contactType: '',
  companyType: '',
  phone: '',
  email: '',
  company: '',
  propertyName: '',
  propertyAddress: '',
  registrationNumber: '',
  comments: '',
  status: 'pending',
  synced: false,
});

function normalizePayload(record: CustomRecord<Record<string, unknown>>): CanvassingSheetPayload {
  const payload =
    record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>)
      : {};
  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
  const rows: CanvassingRow[] = rawRows.map(raw => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
      id: String(r.id || makeId()),
      contactName: String(r.contactName || ''),
      contactType: String(r.contactType || ''),
      companyType: String(r.companyType || ''),
      phone: String(r.phone || ''),
      email: String(r.email || ''),
      company: String(r.company || ''),
      propertyName: String(r.propertyName || ''),
      propertyAddress: String(r.propertyAddress || ''),
      registrationNumber: String(r.registrationNumber || ''),
      comments: String(r.comments || ''),
      status: r.status === 'contacted' ? 'contacted' : 'pending',
      synced: Boolean(r.synced),
    };
  });
  return {
    brokerId: String(payload.brokerId || ''),
    brokerName: String(payload.brokerName || ''),
    rows,
  };
}

interface SheetState {
  id: string;
  title: string;
  payload: CanvassingSheetPayload;
}

export const CanvassingSheets: React.FC<CanvassingSheetsProps> = ({ broker }) => {
  const [sheets, setSheets] = useState<SheetState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<{ title: string; row: CanvassingRow }>({
    title: '',
    row: emptyRow(),
  });
  const [savingSheetIds, setSavingSheetIds] = useState<Set<string>>(new Set());
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);

  const setSheetSaving = useCallback((sheetId: string, saving: boolean) => {
    setSavingSheetIds(prev => {
      const next = new Set(prev);
      if (saving) next.add(sheetId);
      else next.delete(sheetId);
      return next;
    });
  }, []);

  const loadSheets = useCallback(async () => {
    if (!broker.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await customRecordService.getAllCustomRecords<Record<string, unknown>>({
        entityType: CANVASSING_SHEET_ENTITY,
        limit: 1000,
      });
      const mine = result.data
        .map(record => ({
          id: record.id,
          title: record.name,
          payload: normalizePayload(record),
        }))
        .filter(sheet => sheet.payload.brokerId === broker.id);
      setSheets(mine);
      setActiveSheetId(prev => prev && mine.some(s => s.id === prev) ? prev : mine[0]?.id || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load canvassing sheets');
    } finally {
      setIsLoading(false);
    }
  }, [broker.id]);

  useEffect(() => {
    void loadSheets();
  }, [loadSheets]);

  const persistSheet = useCallback(
    async (sheetId: string, title: string, payload: CanvassingSheetPayload) => {
      setSheetSaving(sheetId, true);
      try {
        await customRecordService.updateCustomRecord<Record<string, unknown>>(sheetId, {
          entityType: CANVASSING_SHEET_ENTITY,
          name: title,
          referenceId: payload.brokerId,
          payload: payload as unknown as Record<string, unknown>,
        });
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to save canvassing sheet');
        void loadSheets();
      } finally {
        setSheetSaving(sheetId, false);
      }
    },
    [setSheetSaving, loadSheets]
  );

  const openCreateModal = () => {
    setCreateForm({ title: '', row: emptyRow() });
    setShowCreateModal(true);
  };

  const updateCreateRowField = (field: keyof CanvassingRow, value: string) => {
    setCreateForm(prev => ({ ...prev, row: { ...prev.row, [field]: value } }));
  };

  const handleCreateSheet = async () => {
    if (!broker.id || creatingSheet) return;
    const fallbackTitle = `Sheet ${sheets.length + 1} — ${new Date().toLocaleDateString('en-ZA')}`;
    const title = createForm.title.trim() || fallbackTitle;

    // If user filled in at least the contact name, include the row; otherwise
    // start with a single empty row so the table is immediately usable.
    const filledRow: CanvassingRow = { ...createForm.row, id: makeId() };
    const hasContent =
      filledRow.contactName.trim() ||
      filledRow.email.trim() ||
      filledRow.phone.trim() ||
      filledRow.company.trim() ||
      filledRow.propertyName.trim() ||
      filledRow.propertyAddress.trim();
    const seededRows: CanvassingRow[] = hasContent ? [filledRow] : [emptyRow()];

    setCreatingSheet(true);
    try {
      const payload: CanvassingSheetPayload = {
        brokerId: broker.id,
        brokerName: broker.name,
        rows: seededRows,
      };
      const created = await customRecordService.createCustomRecord<Record<string, unknown>>({
        entityType: CANVASSING_SHEET_ENTITY,
        name: title,
        referenceId: broker.id,
        payload: payload as unknown as Record<string, unknown>,
      });
      const sheet: SheetState = {
        id: created.id,
        title: created.name,
        payload: normalizePayload(created),
      };
      setSheets(prev => [...prev, sheet]);
      setActiveSheetId(sheet.id);
      setShowCreateModal(false);
      setCreateForm({ title: '', row: emptyRow() });
    } catch (createError) {
      // Keep modal open and surface the message inside the modal only — no
      // banner toast outside.
      setError(
        createError instanceof Error ? createError.message : 'Failed to create canvassing sheet'
      );
    } finally {
      setCreatingSheet(false);
    }
  };

  const handleDeleteSheet = async (sheetId: string) => {
    if (!confirm('Delete this canvassing sheet and all its rows?')) return;
    try {
      await customRecordService.deleteCustomRecord(sheetId);
      setSheets(prev => {
        const next = prev.filter(s => s.id !== sheetId);
        setActiveSheetId(current => (current === sheetId ? next[0]?.id || null : current));
        return next;
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete canvassing sheet');
    }
  };

  // Update the rows of a sheet locally then persist.
  const updateSheetRows = useCallback(
    (sheetId: string, mutate: (rows: CanvassingRow[]) => CanvassingRow[]) => {
      let titleForSave = '';
      let payloadForSave: CanvassingSheetPayload | null = null;
      setSheets(prev =>
        prev.map(sheet => {
          if (sheet.id !== sheetId) return sheet;
          const nextPayload: CanvassingSheetPayload = {
            ...sheet.payload,
            rows: mutate(sheet.payload.rows),
          };
          titleForSave = sheet.title;
          payloadForSave = nextPayload;
          return { ...sheet, payload: nextPayload };
        })
      );
      if (payloadForSave) {
        void persistSheet(sheetId, titleForSave, payloadForSave);
      }
    },
    [persistSheet]
  );

  const handleAddRow = (sheetId: string) => {
    updateSheetRows(sheetId, rows => [...rows, emptyRow()]);
  };

  const handleRemoveRow = (sheetId: string, rowId: string) => {
    updateSheetRows(sheetId, rows => rows.filter(r => r.id !== rowId));
  };

  const handleRowFieldChange = (
    sheetId: string,
    rowId: string,
    field: keyof CanvassingRow,
    value: string
  ) => {
    updateSheetRows(sheetId, rows =>
      rows.map(r => (r.id === rowId ? { ...r, [field]: value } : r))
    );
  };

  // Mark a row as successfully contacted (green) and push its details
  // (everything except comments) into the main contacts database once.
  const handleToggleContacted = async (sheetId: string, rowId: string) => {
    const sheet = sheets.find(s => s.id === sheetId);
    const row = sheet?.payload.rows.find(r => r.id === rowId);
    if (!sheet || !row) return;

    // Toggling back to pending — just update status.
    if (row.status === 'contacted') {
      updateSheetRows(sheetId, rows =>
        rows.map(r => (r.id === rowId ? { ...r, status: 'pending' } : r))
      );
      return;
    }

    const shouldSync = !row.synced;

    // Optimistically mark as contacted (and synced if we will push it).
    updateSheetRows(sheetId, rows =>
      rows.map(r =>
        r.id === rowId
          ? { ...r, status: 'contacted', synced: r.synced || shouldSync }
          : r
      )
    );

    if (!shouldSync) return;

    const sourceNote = `Added from canvassing sheet "${sheet.title}" by ${broker.name}.`;
    const contactDisplayName = row.contactName.trim() || 'Unnamed Contact';
    const [firstName, ...lastNameParts] = contactDisplayName.split(/\s+/);
    const lastName = lastNameParts.join(' ');

    try {
      // 1) Regular Contact (existing flow) — surfaces under Leasing → Contacts.
      await contactService.createContact({
        name: contactDisplayName,
        email: row.email.trim(),
        phone: row.phone.trim(),
        type: row.contactType.trim() || 'Broker',
        company: row.company.trim() || undefined,
        notes: sourceNote,
      });

      // 2) Master Database (Potential B&S) — best-effort; failure here doesn't undo the row.
      try {
        await customRecordService.createCustomRecord({
          entityType: 'master_db_potential',
          name: contactDisplayName,
          payload: {
            name: firstName || contactDisplayName,
            surname: lastName,
            email: row.email.trim(),
            contactNumber: row.phone.trim(),
            company: row.company.trim(),
            contactType: row.contactType.trim(),
            companyType: row.companyType.trim(),
            registrationNumber: row.registrationNumber.trim(),
            linkedPropertyName: row.propertyName.trim(),
            linkedPropertyAddress: row.propertyAddress.trim(),
            notes: row.comments.trim()
              ? `${sourceNote}\n${row.comments.trim()}`
              : sourceNote,
            sourceCanvassingSheetId: sheetId,
          },
        });
      } catch (mdErr) {
        console.warn('Master Database push failed (non-blocking):', mdErr);
      }

      // 3) Property record (only if a property name or address was provided) —
      // appears on Maps. Lat/lng left blank; the map's auto-geocoder fills it in
      // from the address on next load.
      const propertyName = row.propertyName.trim();
      const propertyAddress = row.propertyAddress.trim();
      if (propertyName || propertyAddress) {
        try {
          await propertyService.createProperty({
            title: propertyName || propertyAddress,
            address: propertyAddress || propertyName,
            city: '',
            type: 'Commercial',
            status: 'active',
            moduleType: 'sales',
            price: 0,
            area: 0,
            metadata: {
              importedFrom: 'canvassing-sheet',
              importDate: new Date().toISOString(),
              propertyType: 'Commercial',
              linkedCompanyName: row.company.trim() || undefined,
              registrationNumber: row.registrationNumber.trim() || undefined,
              registrationName: row.company.trim() || undefined,
              ownerName: contactDisplayName,
              ownerEmail: row.email.trim() || undefined,
              ownerContactNumber: row.phone.trim() || undefined,
              importComment: sourceNote,
            },
          });
        } catch (propErr) {
          console.warn('Property push failed (non-blocking):', propErr);
        }
      }
    } catch (syncError) {
      // Contact creation failed — roll back the synced flag so the push can be retried later.
      setError(
        syncError instanceof Error
          ? `Marked contacted, but failed to add to database: ${syncError.message}`
          : 'Marked contacted, but failed to add to database.'
      );
      updateSheetRows(sheetId, rows =>
        rows.map(r => (r.id === rowId ? { ...r, synced: false } : r))
      );
    }
  };

  const activeSheet = useMemo(
    () => sheets.find(s => s.id === activeSheetId) || null,
    [sheets, activeSheetId]
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-stone-200 overflow-hidden">
      <div className="p-6 border-b border-stone-200 bg-gradient-to-r from-stone-50 to-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-100 rounded-lg">
            <FiClipboard size={18} className="text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-950">Canvassing Sheets</h2>
            <p className="text-sm text-stone-500 mt-0.5">
              Per-area / per-asset-type prospect lists for {broker.name}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Create-sheet trigger */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors"
          >
            <FiPlus size={16} />
            New Canvassing Sheet
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-stone-400 animate-pulse">Loading canvassing sheets…</p>
        ) : sheets.length === 0 ? (
          <p className="text-sm text-stone-500">
            No canvassing sheets yet. Create one above to start tracking prospects.
          </p>
        ) : (
          <>
            {/* Sheet tabs */}
            <div className="flex flex-wrap gap-2">
              {sheets.map(sheet => {
                const isActive = sheet.id === activeSheetId;
                return (
                  <button
                    key={sheet.id}
                    type="button"
                    onClick={() => setActiveSheetId(sheet.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      isActive
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    {sheet.title}
                    <span
                      className={`ml-2 text-xs ${isActive ? 'text-violet-200' : 'text-stone-400'}`}
                    >
                      {sheet.payload.rows.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeSheet && (
              <div className="rounded-lg border border-stone-200 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-stone-50 border-b border-stone-200">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-stone-900">{activeSheet.title}</h3>
                    {savingSheetIds.has(activeSheet.id) && (
                      <span className="text-xs text-stone-400">Saving…</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddRow(activeSheet.id)}
                      className="inline-flex items-center gap-1.5 bg-violet-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-violet-700 transition-colors"
                    >
                      <FiPlus size={14} />
                      Add Row
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteSheet(activeSheet.id)}
                      className="inline-flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-50 transition-colors"
                    >
                      <FiTrash2 size={14} />
                      Delete Sheet
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-stone-50 border-b border-stone-200">
                      <tr className="text-left text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                        <th className="px-3 py-2 w-44">Name</th>
                        <th className="px-2 py-2 w-32">Phone</th>
                        <th className="px-2 py-2 w-48">Email</th>
                        <th className="px-2 py-2 w-40">Company</th>
                        <th className="px-2 py-2 w-40">Property</th>
                        <th className="px-2 py-2 w-48">Address</th>
                        <th className="px-2 py-2 w-32 text-center">Status</th>
                        <th className="px-2 py-2 w-12 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {activeSheet.payload.rows.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <p className="text-sm text-stone-500">
                                This sheet has no prospects yet.
                              </p>
                              <button
                                type="button"
                                onClick={() => handleAddRow(activeSheet.id)}
                                className="inline-flex items-center gap-1.5 bg-violet-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-violet-700 transition-colors"
                              >
                                <FiPlus size={14} />
                                Add First Row
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {activeSheet.payload.rows.map((row) => {
                        const isContacted = row.status === 'contacted';
                        return (
                          <tr
                            key={row.id}
                            className={isContacted ? 'bg-emerald-50/40' : 'bg-white hover:bg-stone-50/60'}
                          >
                            <td className="px-3 py-1.5">
                              <LinkOrInputCell
                                value={row.contactName}
                                onChange={(v) =>
                                  handleRowFieldChange(activeSheet.id, row.id, 'contactName', v)
                                }
                                placeholder="Name"
                                linkTitle={
                                  row.company.trim()
                                    ? `Open linked company "${row.company.trim()}"`
                                    : 'No linked company yet — type a Company on this row first'
                                }
                                onLinkClick={
                                  row.company.trim()
                                    ? () =>
                                        navigateToPage('Property Funds', {
                                          kind: 'company',
                                          name: row.company.trim(),
                                        })
                                    : undefined
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <CellInput
                                value={row.phone}
                                onChange={(v) => handleRowFieldChange(activeSheet.id, row.id, 'phone', v)}
                                placeholder="Phone"
                                type="tel"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <CellInput
                                value={row.email}
                                onChange={(v) => handleRowFieldChange(activeSheet.id, row.id, 'email', v)}
                                placeholder="Email"
                                type="email"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <CellInput
                                value={row.company}
                                onChange={(v) => handleRowFieldChange(activeSheet.id, row.id, 'company', v)}
                                placeholder="Company"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <LinkOrInputCell
                                value={row.propertyName}
                                onChange={(v) =>
                                  handleRowFieldChange(activeSheet.id, row.id, 'propertyName', v)
                                }
                                placeholder="Property name"
                                linkTitle={`Open "${row.propertyName.trim()}" on the Map`}
                                onLinkClick={
                                  row.propertyName.trim()
                                    ? () =>
                                        navigateToPage('Maps', {
                                          kind: 'property',
                                          name: row.propertyName.trim(),
                                        })
                                    : undefined
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <CellInput
                                value={row.propertyAddress}
                                onChange={(v) => handleRowFieldChange(activeSheet.id, row.id, 'propertyAddress', v)}
                                placeholder="Address"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => void handleToggleContacted(activeSheet.id, row.id)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                  isContacted
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                                }`}
                                title={
                                  isContacted
                                    ? 'Contacted — click to revert'
                                    : 'Mark as contacted'
                                }
                              >
                                <FiCheckCircle size={11} />
                                {isContacted ? 'Contacted' : 'Pending'}
                              </button>
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(activeSheet.id, row.id)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-red-500 hover:bg-red-50 transition-colors"
                                title="Remove prospect"
                              >
                                <FiTrash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Create-Sheet Modal ───────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-1">New Canvassing Sheet</h3>
              <p className="text-stone-600 text-sm mb-6">
                Give the sheet a title and optionally pre-fill your first prospect. You can add more rows after.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">Sheet Title</label>
                  <input
                    type="text"
                    value={createForm.title}
                    onChange={e =>
                      setCreateForm(prev => ({ ...prev, title: e.target.value }))
                    }
                    placeholder='e.g. "Sandton Retail" — leave blank to auto-name'
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div className="md:col-span-2 mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">
                    First Prospect (optional)
                  </p>
                  <p className="text-xs text-stone-500">
                    Fill in what you have. Property fields create a pin on the Map once you mark the row Contacted.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={createForm.row.contactName}
                    onChange={e => updateCreateRowField('contactName', e.target.value)}
                    placeholder="Full name"
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Contact Type</label>
                  <select
                    value={createForm.row.contactType}
                    onChange={e => updateCreateRowField('contactType', e.target.value)}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">Select…</option>
                    {CONTACT_TYPE_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={createForm.row.phone}
                    onChange={e => updateCreateRowField('phone', e.target.value)}
                    placeholder="Phone number"
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={createForm.row.email}
                    onChange={e => updateCreateRowField('email', e.target.value)}
                    placeholder="Email address"
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Company</label>
                  <input
                    type="text"
                    value={createForm.row.company}
                    onChange={e => updateCreateRowField('company', e.target.value)}
                    placeholder="Company name"
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Company Type</label>
                  <select
                    value={createForm.row.companyType}
                    onChange={e => updateCreateRowField('companyType', e.target.value)}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">Select…</option>
                    {COMPANY_TYPE_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Property Name</label>
                  <input
                    type="text"
                    value={createForm.row.propertyName}
                    onChange={e => updateCreateRowField('propertyName', e.target.value)}
                    placeholder="e.g. SPAR Sandton"
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Property Address</label>
                  <input
                    type="text"
                    value={createForm.row.propertyAddress}
                    onChange={e => updateCreateRowField('propertyAddress', e.target.value)}
                    placeholder="Full street address"
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Reg #</label>
                  <input
                    type="text"
                    value={createForm.row.registrationNumber}
                    onChange={e => updateCreateRowField('registrationNumber', e.target.value)}
                    placeholder="Company registration #"
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">Comments</label>
                  <textarea
                    value={createForm.row.comments}
                    onChange={e => updateCreateRowField('comments', e.target.value)}
                    placeholder="Anything else you want to remember about this prospect"
                    rows={2}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>

              {error && (
                <p className="mt-4 text-sm text-red-600">{error}</p>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setError(null);
                  }}
                  className="px-4 py-2 border border-stone-200 rounded-lg text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateSheet()}
                  disabled={creatingSheet}
                  className="inline-flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  <FiPlus size={14} />
                  {creatingSheet ? 'Creating…' : 'Create Sheet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Table cell input — borderless, fills the cell, focus outline only ────

const CellInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}> = ({ value, onChange, placeholder, type = 'text' }) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full px-2 py-1 border border-transparent rounded text-sm bg-transparent hover:border-stone-200 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-violet-400 transition-colors"
  />
);

// ─── A cell that shows a clickable link when filled (with deep-link), an
// ─── input when empty, and a small pencil to re-enter edit mode.
const LinkOrInputCell: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Title text for the link / tooltip. */
  linkTitle?: string;
  /** Click handler for the link. If undefined, value renders as plain text. */
  onLinkClick?: () => void;
}> = ({ value, onChange, placeholder, linkTitle, onLinkClick }) => {
  const [editing, setEditing] = useState(false);
  const trimmed = value.trim();

  // Empty cell or user explicitly editing → input.
  if (!trimmed || editing) {
    return (
      <input
        autoFocus={editing}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.currentTarget.blur();
          }
        }}
        placeholder={placeholder}
        className="w-full px-2 py-1 border border-transparent rounded text-sm bg-transparent hover:border-stone-200 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-violet-400 transition-colors"
      />
    );
  }

  // Has value → show as link (or plain text if no handler).
  return (
    <div className="group flex items-center gap-1.5 w-full px-2 py-1 rounded hover:bg-stone-100/60">
      {onLinkClick ? (
        <button
          type="button"
          onClick={onLinkClick}
          title={linkTitle}
          className="flex items-center gap-1 text-sm font-medium text-violet-700 hover:text-violet-900 hover:underline truncate"
        >
          <span className="truncate">{trimmed}</span>
          <FiExternalLink size={11} className="shrink-0 opacity-60" />
        </button>
      ) : (
        <span className="text-sm text-stone-800 truncate" title={linkTitle}>
          {trimmed}
        </span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Edit"
        className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-700 transition-opacity"
      >
        <FiEdit2 size={11} />
      </button>
    </div>
  );
};

export default CanvassingSheets;
