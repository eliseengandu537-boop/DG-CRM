import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiPlus,
  FiTrash2,
  FiCheckCircle,
  FiClipboard,
  FiDatabase,
} from 'react-icons/fi';
import { customRecordService, CustomRecord } from '@/services/customRecordService';
import { contactService } from '@/services/contactService';

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
  const [newSheetTitle, setNewSheetTitle] = useState('');
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

  const handleCreateSheet = async () => {
    const title = newSheetTitle.trim();
    if (!title || !broker.id || creatingSheet) return;
    setCreatingSheet(true);
    setError(null);
    try {
      const payload: CanvassingSheetPayload = {
        brokerId: broker.id,
        brokerName: broker.name,
        rows: [],
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
      setNewSheetTitle('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create canvassing sheet');
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

    try {
      await contactService.createContact({
        name: row.contactName.trim() || 'Unnamed Contact',
        email: row.email.trim(),
        phone: row.phone.trim(),
        type: row.contactType.trim() || 'Broker',
        company: row.company.trim() || undefined,
        notes: `Added from canvassing sheet "${sheet.title}" by ${broker.name}.`,
      });
    } catch (syncError) {
      // Roll back the synced flag so the push can be retried later.
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
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Create sheet */}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newSheetTitle}
            onChange={e => setNewSheetTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void handleCreateSheet();
            }}
            placeholder='New sheet title (e.g. "Sandton Retail")'
            className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="button"
            onClick={() => void handleCreateSheet()}
            disabled={creatingSheet || !newSheetTitle.trim()}
            className="inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            <FiPlus size={16} />
            {creatingSheet ? 'Creating…' : 'New Canvassing Sheet'}
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

                {activeSheet.payload.rows.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-stone-500 text-center">
                    No prospects on this sheet yet. Use “Add Row” to add one.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-stone-100 border-b border-stone-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Contact Name</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Contact Type</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Company Type</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Phone</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Email</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Company</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Comments</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-stone-700 uppercase tracking-wider">Status</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-stone-700 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200">
                        {activeSheet.payload.rows.map(row => {
                          const isContacted = row.status === 'contacted';
                          return (
                            <tr
                              key={row.id}
                              className={isContacted ? 'bg-green-50/60' : 'bg-white'}
                            >
                              <td className="px-3 py-2 align-top">
                                <input
                                  type="text"
                                  value={row.contactName}
                                  onChange={e =>
                                    handleRowFieldChange(activeSheet.id, row.id, 'contactName', e.target.value)
                                  }
                                  placeholder="Name"
                                  className="w-40 px-2 py-1.5 border border-stone-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <select
                                  value={row.contactType}
                                  onChange={e =>
                                    handleRowFieldChange(activeSheet.id, row.id, 'contactType', e.target.value)
                                  }
                                  className="w-40 px-2 py-1.5 border border-stone-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-violet-400"
                                >
                                  <option value="">Select…</option>
                                  {CONTACT_TYPE_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <select
                                  value={row.companyType}
                                  onChange={e =>
                                    handleRowFieldChange(activeSheet.id, row.id, 'companyType', e.target.value)
                                  }
                                  className="w-48 px-2 py-1.5 border border-stone-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-violet-400"
                                >
                                  <option value="">Select…</option>
                                  {COMPANY_TYPE_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  type="tel"
                                  value={row.phone}
                                  onChange={e =>
                                    handleRowFieldChange(activeSheet.id, row.id, 'phone', e.target.value)
                                  }
                                  placeholder="Phone"
                                  className="w-36 px-2 py-1.5 border border-stone-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  type="email"
                                  value={row.email}
                                  onChange={e =>
                                    handleRowFieldChange(activeSheet.id, row.id, 'email', e.target.value)
                                  }
                                  placeholder="Email"
                                  className="w-48 px-2 py-1.5 border border-stone-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  type="text"
                                  value={row.company}
                                  onChange={e =>
                                    handleRowFieldChange(activeSheet.id, row.id, 'company', e.target.value)
                                  }
                                  placeholder="Company"
                                  className="w-44 px-2 py-1.5 border border-stone-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <textarea
                                  value={row.comments}
                                  onChange={e =>
                                    handleRowFieldChange(activeSheet.id, row.id, 'comments', e.target.value)
                                  }
                                  placeholder="Comments"
                                  rows={2}
                                  className="w-56 px-2 py-1.5 border border-stone-300 rounded-md text-sm resize-y focus:outline-none focus:ring-1 focus:ring-violet-400"
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="flex flex-col gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleContacted(activeSheet.id, row.id)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                                      isContacted
                                        ? 'bg-green-600 text-white hover:bg-green-700'
                                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                                    }`}
                                    title={
                                      isContacted
                                        ? 'Successfully contacted — click to revert'
                                        : 'Mark as successfully contacted'
                                    }
                                  >
                                    <FiCheckCircle size={13} />
                                    {isContacted ? 'Contacted' : 'Pending'}
                                  </button>
                                  {row.synced && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700"
                                      title="This contact has been added to the main database"
                                    >
                                      <FiDatabase size={11} />
                                      In database
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRow(activeSheet.id, row.id)}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-md text-red-600 hover:bg-red-50 transition-colors"
                                  title="Remove row"
                                >
                                  <FiTrash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CanvassingSheets;
