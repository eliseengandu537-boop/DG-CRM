"use client";

import { Command } from "cmdk";
import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { FiX, FiMapPin, FiCalendar, FiClock, FiUser, FiPhone, FiMail, FiHash, FiHome, FiActivity } from "react-icons/fi";
import { propertyService, type PropertyRecord } from "@/services/propertyService";
import { activityService, type ActivityRecord } from "@/services/activityService";

interface CommandMenuProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  onPageChange?: (page: string) => void;
}

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAction(action: string) {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function metaVal(metadata: Record<string, unknown> | null | undefined, key: string): string {
  if (!metadata) return "";
  return String(metadata[key] ?? "");
}

// ── Property Detail Modal ──────────────────────────────────────────────────────
function PropertyDetailModal({
  property,
  onClose,
  onNavigate,
}: {
  property: PropertyRecord;
  onClose: () => void;
  onNavigate?: (page: string) => void;
}) {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoadingActivities(true);
    activityService
      .getActivities({ entityId: property.id, entityType: "property", limit: 20 })
      .then((res) => { if (mounted) setActivities(res.data); })
      .catch(() => { if (mounted) setActivities([]); })
      .finally(() => { if (mounted) setLoadingActivities(false); });
    return () => { mounted = false; };
  }, [property.id]);

  const meta = (property.metadata ?? {}) as Record<string, unknown>;

  const infoRows: Array<{ label: string; value: string; icon?: React.ReactNode }> = [
    { label: "Address", value: property.address || "—", icon: <FiMapPin size={13} /> },
    { label: "City", value: property.city || "—" },
    { label: "Province", value: property.province || "—" },
    { label: "Postal Code", value: property.postalCode || "—" },
    { label: "Type", value: metaVal(meta, "propertyType") || property.type || "—" },
    { label: "Status", value: metaVal(meta, "ownershipStatus") || property.status || "—" },
    { label: "Module", value: property.moduleType || "—" },
    { label: "Size (sqm)", value: metaVal(meta, "squareFeet") || (property.area ? String(property.area) : "—") },
    { label: "GLA (sqm)", value: metaVal(meta, "gla") || "—" },
    { label: "Year Built", value: metaVal(meta, "yearBuilt") || "—" },
    { label: "Condition", value: metaVal(meta, "condition") || "—" },
  ].filter((r) => r.value && r.value !== "—");

  const ownerRows: Array<{ label: string; value: string; icon?: React.ReactNode }> = [
    { label: "Owner Name", value: metaVal(meta, "ownerName"), icon: <FiUser size={13} /> },
    { label: "Owner Number", value: metaVal(meta, "ownerContactNumber"), icon: <FiPhone size={13} /> },
    { label: "Owner Email", value: metaVal(meta, "ownerEmail"), icon: <FiMail size={13} /> },
  ].filter((r) => r.value);

  const tenantRows: Array<{ label: string; value: string; icon?: React.ReactNode }> = [
    { label: "Tenant Name", value: metaVal(meta, "tenantName"), icon: <FiUser size={13} /> },
    { label: "Tenant Number", value: metaVal(meta, "tenantContactNumber"), icon: <FiPhone size={13} /> },
  ].filter((r) => r.value);

  const regRows: Array<{ label: string; value: string; icon?: React.ReactNode }> = [
    { label: "Registered Company", value: metaVal(meta, "linkedCompanyName") || metaVal(meta, "registrationName") },
    { label: "Registration No.", value: metaVal(meta, "registrationNumber"), icon: <FiHash size={13} /> },
    { label: "Linked Fund", value: metaVal(meta, "linkedFundName") },
  ].filter((r) => r.value);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-stone-100 shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-lg font-bold text-stone-900 leading-tight truncate">
              {property.title || property.address || "Property"}
            </h2>
            <p className="text-sm text-stone-500 mt-0.5 flex items-center gap-1">
              <FiMapPin size={12} />
              {property.address || "No address"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onNavigate && (
              <button
                onClick={() => { onNavigate("Maps"); onClose(); }}
                className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Open in Maps
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            >
              <FiX size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {/* Timestamps */}
          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-stone-500">
              <FiCalendar size={12} />
              <span>Created: <span className="text-stone-800 font-medium">{formatDate(property.createdAt)}</span></span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-stone-500">
              <FiClock size={12} />
              <span>Last Updated: <span className="text-stone-800 font-medium">{formatDate(property.updatedAt)}</span></span>
            </div>
          </div>

          {/* Property Info */}
          <section>
            <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <FiHome size={12} /> Property Info
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {infoRows.map((r) => (
                <div key={r.label}>
                  <p className="text-xs text-stone-400">{r.label}</p>
                  <p className="text-sm text-stone-800 font-medium">{r.value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Owner */}
          {ownerRows.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FiUser size={12} /> Owner
              </h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {ownerRows.map((r) => (
                  <div key={r.label} className="flex items-start gap-1.5">
                    {r.icon && <span className="text-stone-400 mt-0.5 shrink-0">{r.icon}</span>}
                    <div>
                      <p className="text-xs text-stone-400">{r.label}</p>
                      <p className="text-sm text-stone-800 font-medium">{r.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tenant */}
          {tenantRows.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FiUser size={12} /> Tenant
              </h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {tenantRows.map((r) => (
                  <div key={r.label} className="flex items-start gap-1.5">
                    {r.icon && <span className="text-stone-400 mt-0.5 shrink-0">{r.icon}</span>}
                    <div>
                      <p className="text-xs text-stone-400">{r.label}</p>
                      <p className="text-sm text-stone-800 font-medium">{r.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Registration */}
          {regRows.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FiHash size={12} /> Registration
              </h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {regRows.map((r) => (
                  <div key={r.label} className="flex items-start gap-1.5">
                    {r.icon && <span className="text-stone-400 mt-0.5 shrink-0">{r.icon}</span>}
                    <div>
                      <p className="text-xs text-stone-400">{r.label}</p>
                      <p className="text-sm text-stone-800 font-medium">{r.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recent Activity */}
          <section>
            <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <FiActivity size={12} /> Recent Activity
            </h3>
            {loadingActivities ? (
              <div className="flex items-center gap-2 py-4 text-stone-400 text-sm">
                <div className="w-4 h-4 border-2 border-stone-300 border-t-indigo-500 rounded-full animate-spin" />
                Loading activities…
              </div>
            ) : activities.length === 0 ? (
              <p className="text-sm text-stone-400 py-2">No activity recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {activities.map((act) => (
                  <div
                    key={act.id}
                    className="flex items-start gap-3 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2.5"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-stone-800 font-medium leading-snug">
                        {act.description || formatAction(act.action)}
                      </p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {act.actorDisplayName && (
                          <span className="text-xs text-stone-500 flex items-center gap-1">
                            <FiUser size={11} /> {act.actorDisplayName}
                          </span>
                        )}
                        <span className="text-xs text-stone-400 flex items-center gap-1">
                          <FiClock size={11} /> {formatDate(act.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Main CommandMenu ──────────────────────────────────────────────────────────
export const CommandMenu = ({ open, setOpen, onPageChange }: CommandMenuProps) => {
  const [query, setQuery] = useState("");
  const [allProperties, setAllProperties] = useState<PropertyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<PropertyRecord | null>(null);
  const hasFetched = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load properties once when the menu first opens
  useEffect(() => {
    if (!open) return;
    // Focus input
    setTimeout(() => inputRef.current?.focus(), 50);

    if (hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);
    propertyService
      .getAllProperties({ limit: 500 })
      .then((res) => setAllProperties(res.data))
      .catch(() => setAllProperties([]))
      .finally(() => setLoading(false));
  }, [open]);

  // Keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        if (selectedProperty) { setSelectedProperty(null); return; }
        setOpen(false);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [selectedProperty]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedProperty(null);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q.length < 1
    ? allProperties.slice(0, 20)
    : allProperties.filter((p) =>
        p.title?.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.type?.toLowerCase().includes(q) ||
        (p.metadata as any)?.ownerName?.toLowerCase()?.includes(q) ||
        (p.metadata as any)?.linkedCompanyName?.toLowerCase()?.includes(q)
      ).slice(0, 30);

  if (!open) return null;

  return (
    <>
      {/* Search overlay */}
      <div
        className="fixed inset-0 z-[100] flex items-start justify-center pt-16 bg-black/40"
        onClick={handleClose}
      >
        <div
          className="bg-white rounded-xl shadow-2xl border border-stone-200 w-full max-w-xl mx-4 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Input */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
            <svg className="w-4 h-4 text-stone-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search properties by name, address, city, owner…"
              className="flex-1 text-sm text-stone-900 placeholder-stone-400 focus:outline-none bg-transparent"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-stone-400 hover:text-stone-600">
                <FiX size={15} />
              </button>
            )}
            <button
              onClick={handleClose}
              className="text-xs text-stone-400 hover:text-stone-600 border border-stone-200 rounded px-1.5 py-0.5 ml-1"
            >
              esc
            </button>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-stone-400 text-sm">
                <div className="w-4 h-4 border-2 border-stone-300 border-t-indigo-500 rounded-full animate-spin" />
                Loading properties…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-stone-400 text-sm">
                {q ? `No properties found for "${query}"` : "Start typing to search properties"}
              </div>
            ) : (
              filtered.map((property) => {
                const meta = (property.metadata ?? {}) as Record<string, unknown>;
                const ownerName = String(meta.ownerName ?? "");
                const ownerPhone = String(meta.ownerContactNumber ?? "");
                return (
                  <button
                    key={property.id}
                    onClick={() => setSelectedProperty(property)}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-stone-50 border-b border-stone-50 text-left transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                      <FiHome size={14} className="text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-900 truncate">
                        {property.title || property.address || "Untitled Property"}
                      </p>
                      <p className="text-xs text-stone-500 truncate flex items-center gap-1 mt-0.5">
                        <FiMapPin size={11} />
                        {[property.address, property.city, property.province].filter(Boolean).join(", ") || "No address"}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {property.type && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                            {property.type}
                          </span>
                        )}
                        {property.status && (
                          <span className="text-xs bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded font-medium">
                            {String(meta.ownershipStatus || property.status)}
                          </span>
                        )}
                        {ownerName && (
                          <span className="text-xs text-stone-400 flex items-center gap-0.5">
                            <FiUser size={10} /> {ownerName}
                          </span>
                        )}
                        {ownerPhone && (
                          <span className="text-xs text-stone-400 flex items-center gap-0.5">
                            <FiPhone size={10} /> {ownerPhone}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-stone-300 shrink-0 mt-1">›</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-stone-100 flex items-center justify-between">
            <p className="text-xs text-stone-400">
              {filtered.length} propert{filtered.length !== 1 ? "ies" : "y"} {q ? "found" : "shown"}
            </p>
            <p className="text-xs text-stone-300">Click a property for full details</p>
          </div>
        </div>
      </div>

      {/* Property detail modal */}
      {selectedProperty && (
        <PropertyDetailModal
          property={selectedProperty}
          onClose={() => setSelectedProperty(null)}
          onNavigate={onPageChange}
        />
      )}
    </>
  );
};
