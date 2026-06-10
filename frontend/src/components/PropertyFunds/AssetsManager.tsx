'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FiMapPin, FiHome, FiTag, FiEdit2, FiX, FiSearch, FiGrid, FiList, FiUsers, FiPlus, FiPhone, FiMail, FiFileText } from 'react-icons/fi';
import { propertyService, type PropertyRecord } from '@/services/propertyService';
import { customRecordService } from '@/services/customRecordService';
import { brochureService } from '@/services/brochureService';
import { navigateToPage } from '@/lib/crmNavigation';
import { PROPERTY_TYPE_OPTIONS } from '@/lib/propertyTypes';

type FundOption = {
  id: string;
  name: string;
  fundType: 'Listed' | 'Non-Listed';
};

type TenantEntry = {
  name: string;
  leaseExpiry: string;
};

type CentreContact = {
  name: string;
  role: string;
  phone: string;
  email: string;
};

type LinkedBrochure = {
  id: string;
  name: string;
};

const getStatusColor = (status: string) => {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'for sale' || s === 'for_sale') return 'bg-blue-100 text-blue-800';
  if (s === 'for lease' || s === 'for_lease' || s === 'leased') return 'bg-green-100 text-green-800';
  if (s === 'auction') return 'bg-amber-100 text-amber-800';
  if (s === 'sold') return 'bg-red-100 text-red-800';
  if (s === 'mortgaged') return 'bg-orange-100 text-orange-800';
  if (s === 'owned') return 'bg-violet-100 text-violet-800';
  return 'bg-stone-100 text-stone-700';
};

const parseTenants = (meta: Record<string, unknown>): TenantEntry[] => {
  const raw = meta.tenants;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t) => ({
      name: String(t.name || ''),
      leaseExpiry: String(t.leaseExpiry || ''),
    }));
};

const parseCentreContacts = (meta: Record<string, unknown>): CentreContact[] => {
  const raw = meta.centreContacts;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      name: String(c.name || ''),
      role: String(c.role || ''),
      phone: String(c.phone || ''),
      email: String(c.email || ''),
    }));
};

const formatLeaseDate = (value: string): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getSoonestExpiry = (tenants: TenantEntry[]): string => {
  const dates = tenants
    .map((t) => t.leaseExpiry)
    .filter((d) => d && !Number.isNaN(new Date(d).getTime()))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return dates[0] || '';
};

export const AssetsManager: React.FC = () => {
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProp, setEditingProp] = useState<PropertyRecord | null>(null);
  const [selectedFundId, setSelectedFundId] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [anchorFilter, setAnchorFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [viewMode, setViewMode] = useState<'tiles' | 'list'>('tiles');
  const [tenants, setTenants] = useState<TenantEntry[]>([]);
  const [centreContacts, setCentreContacts] = useState<CentreContact[]>([]);
  const [brochuresByProperty, setBrochuresByProperty] = useState<Record<string, LinkedBrochure[]>>({});
  const [assetForm, setAssetForm] = useState({
    propertyType: '',
    companyName: '',
    registrationNumber: '',
    ownerName: '',
    ownerEmail: '',
    ownerNumber: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [propResult, fundResult, brochureResult] = await Promise.all([
        propertyService.getAllProperties({ limit: 100000 }),
        customRecordService.getAllCustomRecords<Record<string, unknown>>({
          entityType: 'fund',
          limit: 10000,
        }),
        brochureService
          .getAllBrochures<Record<string, unknown>>({ limit: 1000 })
          .catch(() => ({ data: [], pagination: { page: 1, limit: 0, total: 0, pages: 0 } })),
      ]);
      setProperties(
        propResult.data.filter(p => {
          if (p.deletedAt) return false;
          return true;
        })
      );

      const brochureIndex: Record<string, LinkedBrochure[]> = {};
      brochureResult.data.forEach((record) => {
        const payload = (record.payload || {}) as Record<string, unknown>;
        const propertyId = String(payload.linkedPropertyId || '');
        if (!propertyId) return;
        const entry = { id: record.id, name: String(record.name || payload.brochureName || 'Brochure') };
        (brochureIndex[propertyId] ||= []).push(entry);
      });
      setBrochuresByProperty(brochureIndex);
      setFunds(
        fundResult.data.map((record) => ({
          id: record.id,
          name: record.name,
          fundType: ((record.category as 'Listed' | 'Non-Listed') || 'Listed') as 'Listed' | 'Non-Listed',
        }))
      );
    } catch {
      setProperties([]);
      setFunds([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      await loadData();
      if (!mounted) return;
    };
    void run();
    return () => { mounted = false; };
  }, []);

  const getMeta = (prop: PropertyRecord): Record<string, unknown> =>
    prop.metadata && typeof prop.metadata === 'object'
      ? (prop.metadata as Record<string, unknown>)
      : {};

  const matchesSizeBucket = (size: number, bucket: string): boolean => {
    switch (bucket) {
      case 'under-500':
        return size > 0 && size < 500;
      case '500-2000':
        return size >= 500 && size < 2000;
      case '2000-10000':
        return size >= 2000 && size < 10000;
      case 'over-10000':
        return size >= 10000;
      default:
        return true;
    }
  };

  const typeOptions = useMemo(() => {
    const set = new Set<string>(PROPERTY_TYPE_OPTIONS);
    properties.forEach((prop) => {
      const meta = getMeta(prop);
      const value = String(meta.propertyType || prop.type || '').trim();
      if (value) set.add(value);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [properties]);

  const areaOptions = useMemo(() => {
    const set = new Set<string>();
    properties.forEach((prop) => {
      const value = String(getMeta(prop).areaName || '').trim();
      if (value) set.add(value);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [properties]);

  const anchorOptions = useMemo(() => {
    const set = new Set<string>();
    properties.forEach((prop) => {
      const value = String(getMeta(prop).anchor || '').trim();
      if (value) set.add(value);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [properties]);

  const filteredProperties = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return properties.filter((prop) => {
      const meta = getMeta(prop);
      const displayName = String(meta.displayName || prop.title || prop.address || '');
      const linkedFundName = String(meta.linkedFundName || '');
      const ownershipStatus = String(meta.ownershipStatus || prop.status || '');
      const propertyType = String(meta.propertyType || prop.type || '');
      const areaName = String(meta.areaName || '');
      const anchor = String(meta.anchor || '');
      const size = Number(meta.squareFeet || prop.area || 0);

      if (query) {
        const matchesSearch = [
          displayName,
          prop.address,
          linkedFundName,
          ownershipStatus,
          propertyType,
          areaName,
          anchor,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      if (typeFilter && propertyType !== typeFilter) return false;
      if (areaFilter && areaName !== areaFilter) return false;
      if (anchorFilter && anchor !== anchorFilter) return false;
      if (sizeFilter && !matchesSizeBucket(size, sizeFilter)) return false;

      return true;
    });
  }, [properties, searchQuery, typeFilter, areaFilter, anchorFilter, sizeFilter]);

  const openEdit = (prop: PropertyRecord) => {
    const meta = prop.metadata && typeof prop.metadata === 'object' ? prop.metadata as Record<string, unknown> : {};
    const currentFundName = String(meta.linkedFundName || '');
    const matchingFund = funds.find(f => f.name === currentFundName);
    setSelectedFundId(matchingFund?.id || '');
    setTenants(parseTenants(meta));
    setCentreContacts(parseCentreContacts(meta));
    setAssetForm({
      propertyType: String(meta.propertyType || prop.type || ''),
      companyName: String(meta.linkedCompanyName || ''),
      registrationNumber: String(meta.registrationNumber || ''),
      ownerName: String(meta.ownerName || ''),
      ownerEmail: String(meta.ownerEmail || ''),
      ownerNumber: String(meta.ownerContactNumber || ''),
    });
    setEditingProp(prop);
  };

  const updateTenant = (index: number, field: keyof TenantEntry, value: string) => {
    setTenants((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  };

  const addTenant = () => {
    setTenants((prev) => [...prev, { name: '', leaseExpiry: '' }]);
  };

  const removeTenant = (index: number) => {
    setTenants((prev) => prev.filter((_, i) => i !== index));
  };

  const updateContact = (index: number, field: keyof CentreContact, value: string) => {
    setCentreContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  const addContact = () => {
    setCentreContacts((prev) => [...prev, { name: '', role: 'Centre Manager', phone: '', email: '' }]);
  };

  const removeContact = (index: number) => {
    setCentreContacts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!editingProp) return;
    setSaving(true);
    try {
      const chosenFund = funds.find(f => f.id === selectedFundId);
      const currentMeta = (editingProp.metadata && typeof editingProp.metadata === 'object'
        ? editingProp.metadata
        : {}) as Record<string, unknown>;

      await propertyService.updateProperty(editingProp.id, {
        metadata: {
          ...currentMeta,
          linkedFundId: chosenFund?.id || '',
          linkedFundName: chosenFund?.name || '',
          linkedFundType: chosenFund?.fundType || '',
          propertyType: assetForm.propertyType,
          linkedCompanyName: assetForm.companyName.trim(),
          registrationNumber: assetForm.registrationNumber.trim(),
          ownerName: assetForm.ownerName.trim(),
          ownerEmail: assetForm.ownerEmail.trim(),
          ownerContactNumber: assetForm.ownerNumber.trim(),
          tenants: tenants
            .map((t) => ({ name: t.name.trim(), leaseExpiry: t.leaseExpiry }))
            .filter((t) => t.name || t.leaseExpiry),
          centreContacts: centreContacts
            .map((c) => ({
              name: c.name.trim(),
              role: c.role.trim(),
              phone: c.phone.trim(),
              email: c.email.trim(),
            }))
            .filter((c) => c.name || c.role || c.phone || c.email),
        },
      });

      await loadData();
      setEditingProp(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Assets</h2>
          <p className="text-stone-500 text-sm mt-1">
            All properties added in Maps — {properties.length} asset{properties.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <FiSearch
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets, funds, addresses…"
            className="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-10 pr-10 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              aria-label="Clear asset search"
            >
              <FiX size={16} />
            </button>
          )}
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-stone-200 bg-white py-2.5 px-3 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All Types</option>
          {typeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="rounded-lg border border-stone-200 bg-white py-2.5 px-3 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All Areas</option>
          {areaOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <select
          value={anchorFilter}
          onChange={(e) => setAnchorFilter(e.target.value)}
          className="rounded-lg border border-stone-200 bg-white py-2.5 px-3 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All Anchors</option>
          {anchorOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <select
          value={sizeFilter}
          onChange={(e) => setSizeFilter(e.target.value)}
          className="rounded-lg border border-stone-200 bg-white py-2.5 px-3 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All Sizes</option>
          <option value="under-500">Under 500 m²</option>
          <option value="500-2000">500–2,000 m²</option>
          <option value="2000-10000">2,000–10,000 m²</option>
          <option value="over-10000">Over 10,000 m²</option>
        </select>

        <div className="ml-auto flex items-center rounded-lg border border-stone-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('tiles')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'tiles'
                ? 'bg-violet-500 text-white'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <FiGrid size={14} />
            Tiles
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-violet-500 text-white'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <FiList size={14} />
            List
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading assets…</div>
      ) : filteredProperties.length === 0 ? (
        <div className="text-center py-16 bg-stone-50 rounded-xl border border-dashed border-stone-300">
          <FiMapPin className="mx-auto text-stone-300 mb-3" size={40} />
          <p className="text-stone-500 font-medium">No assets found</p>
          <p className="text-stone-400 text-sm mt-1">
            {searchQuery
              ? 'Try a different search term.'
              : 'Properties you add in the Maps module will appear here automatically.'}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Company Name</th>
                <th className="px-4 py-3">Registration No.</th>
                <th className="px-4 py-3">Owner Name &amp; Surname</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Centre Contacts</th>
                <th className="px-4 py-3">Tenants</th>
                <th className="px-4 py-3">Brochures</th>
                <th className="px-4 py-3">Fund</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProperties.map((prop) => {
                const meta = prop.metadata && typeof prop.metadata === 'object' ? prop.metadata as Record<string, unknown> : {};
                const displayName = String(meta.displayName || prop.title || prop.address || '');
                const linkedFundName = String(meta.linkedFundName || '');
                const ownershipStatus = String(meta.ownershipStatus || prop.status || '');
                const squareFeet = Number(meta.squareFeet || prop.area || 0);
                const propertyType = String(meta.propertyType || prop.type || '');
                const areaName = String(meta.areaName || '');
                const companyName = String(meta.linkedCompanyName || '');
                const registrationNumber = String(meta.registrationNumber || '');
                const ownerName = String(meta.ownerName || '');
                const ownerEmail = String(meta.ownerEmail || '');
                const ownerNumber = String(meta.ownerContactNumber || '');
                const propTenants = parseTenants(meta);
                const soonestExpiry = getSoonestExpiry(propTenants);

                return (
                  <tr key={prop.id} className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50">
                    <td className="px-4 py-3 font-semibold text-stone-900">{displayName}</td>
                    <td className="px-4 py-3 text-stone-600">{prop.address}</td>
                    <td className="px-4 py-3 text-stone-600">{propertyType || '—'}</td>
                    <td className="px-4 py-3 text-stone-600">{companyName || '—'}</td>
                    <td className="px-4 py-3 text-stone-600">{registrationNumber || '—'}</td>
                    <td className="px-4 py-3 text-stone-600">{ownerName || '—'}</td>
                    <td className="px-4 py-3 text-stone-600">{ownerEmail || '—'}</td>
                    <td className="px-4 py-3 text-stone-600">{ownerNumber || '—'}</td>
                    <td className="px-4 py-3 text-stone-600">{areaName || '—'}</td>
                    <td className="px-4 py-3 text-stone-600">{squareFeet > 0 ? squareFeet.toLocaleString() : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${getStatusColor(ownershipStatus || prop.status)}`}>
                        {ownershipStatus || prop.status || 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {(() => {
                        const contacts = parseCentreContacts(meta);
                        if (contacts.length === 0) return '—';
                        return (
                          <div className="space-y-1">
                            {contacts.map((c, i) => (
                              <div key={i} className="leading-tight">
                                <span className="font-semibold text-stone-800">{c.name || '—'}</span>
                                {c.role && <span className="text-stone-400"> · {c.role}</span>}
                                {(c.phone || c.email) && (
                                  <div className="text-xs text-stone-500">
                                    {[c.phone, c.email].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {propTenants.length === 0
                        ? 'No tenants'
                        : `${propTenants.length} • ${soonestExpiry ? formatLeaseDate(soonestExpiry) : 'no expiry'}`}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {(() => {
                        const linked = brochuresByProperty[prop.id] || [];
                        if (linked.length === 0) return '—';
                        return (
                          <div className="flex flex-col gap-1">
                            {linked.map((b) => (
                              <span key={b.id} className="inline-flex items-center gap-1 text-xs text-violet-700">
                                <FiFileText size={11} />{b.name}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-stone-600">{linkedFundName || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => navigateToPage('Maps', { kind: 'property', id: prop.id, name: displayName })}
                          title="View on Map"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:bg-violet-50 hover:text-violet-600 transition-colors"
                        >
                          <FiMapPin size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(prop)}
                          title="Edit & link to fund"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:bg-violet-50 hover:text-violet-600 transition-colors"
                        >
                          <FiEdit2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredProperties.map((prop) => {
            const meta = prop.metadata && typeof prop.metadata === 'object' ? prop.metadata as Record<string, unknown> : {};
            const displayName = String(meta.displayName || prop.title || prop.address || '');
            const linkedFundName = String(meta.linkedFundName || '');
            const ownershipStatus = String(meta.ownershipStatus || prop.status || '');
            const squareFeet = Number(meta.squareFeet || prop.area || 0);
            const gla = Number(meta.gla || 0);
            const yearBuilt = Number(meta.yearBuilt || 0);
            const condition = String(meta.condition || '');
            const propertyType = String(meta.propertyType || prop.type || '');
            const companyName = String(meta.linkedCompanyName || '');
            const registrationNumber = String(meta.registrationNumber || '');
            const ownerName = String(meta.ownerName || '');
            const ownerEmail = String(meta.ownerEmail || '');
            const ownerNumber = String(meta.ownerContactNumber || '');
            const propTenants = parseTenants(meta);
            const soonestExpiry = getSoonestExpiry(propTenants);

            return (
              <div
                key={prop.id}
                className="bg-white rounded-xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Card header */}
                <div className="p-5 border-b border-stone-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FiHome className="text-violet-500 flex-shrink-0" size={16} />
                      <h3 className="text-sm font-bold text-stone-900 truncate">{displayName}</h3>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${getStatusColor(ownershipStatus || prop.status)}`}>
                        {ownershipStatus || prop.status || 'Active'}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigateToPage('Maps', { kind: 'property', id: prop.id, name: displayName })}
                        title="View on Map"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:bg-violet-50 hover:text-violet-600 transition-colors"
                      >
                        <FiMapPin size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(prop)}
                        title="Edit & link to fund"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:bg-violet-50 hover:text-violet-600 transition-colors"
                      >
                        <FiEdit2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                    <FiMapPin className="inline mr-1 text-stone-400" size={11} />
                    {prop.address}
                  </p>
                </div>

                {/* Details grid */}
                <div className="p-5 grid grid-cols-2 gap-3 text-xs">
                  {propertyType && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Type</p>
                      <p className="text-stone-800 font-semibold mt-0.5">{propertyType}</p>
                    </div>
                  )}
                  {squareFeet > 0 && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Sq Ft</p>
                      <p className="text-stone-800 font-semibold mt-0.5">{squareFeet.toLocaleString()}</p>
                    </div>
                  )}
                  {gla > 0 && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">GLA</p>
                      <p className="text-stone-800 font-semibold mt-0.5">{gla.toLocaleString()}</p>
                    </div>
                  )}
                  {yearBuilt > 0 && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Year Built</p>
                      <p className="text-stone-800 font-semibold mt-0.5">{yearBuilt}</p>
                    </div>
                  )}
                  {condition && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Condition</p>
                      <p className="text-stone-800 font-semibold mt-0.5 capitalize">{condition}</p>
                    </div>
                  )}
                  {prop.price > 0 && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Price</p>
                      <p className="text-stone-800 font-semibold mt-0.5">R{prop.price.toLocaleString('en-ZA')}</p>
                    </div>
                  )}
                  {companyName && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Company</p>
                      <p className="text-stone-800 font-semibold mt-0.5 truncate">{companyName}</p>
                    </div>
                  )}
                  {registrationNumber && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Registration No.</p>
                      <p className="text-stone-800 font-semibold mt-0.5 truncate">{registrationNumber}</p>
                    </div>
                  )}
                  {ownerName && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Owner</p>
                      <p className="text-stone-800 font-semibold mt-0.5 truncate">{ownerName}</p>
                    </div>
                  )}
                  {ownerEmail && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Email</p>
                      <p className="text-stone-800 font-semibold mt-0.5 truncate">{ownerEmail}</p>
                    </div>
                  )}
                  {ownerNumber && (
                    <div>
                      <p className="text-stone-400 font-medium uppercase tracking-wide">Number</p>
                      <p className="text-stone-800 font-semibold mt-0.5 truncate">{ownerNumber}</p>
                    </div>
                  )}
                </div>

                {/* Centre contacts */}
                {(() => {
                  const contacts = parseCentreContacts(meta);
                  if (contacts.length === 0) return null;
                  return (
                    <div className="px-5 pb-1">
                      <p className="text-stone-400 font-medium uppercase tracking-wide text-[11px] mb-1">Centre Contacts</p>
                      <div className="space-y-1.5">
                        {contacts.map((c, i) => (
                          <div key={i} className="text-xs">
                            <p className="text-stone-800 font-semibold">
                              {c.name || '—'}
                              {c.role && <span className="text-stone-400 font-normal"> · {c.role}</span>}
                            </p>
                            {(c.phone || c.email) && (
                              <p className="text-stone-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                                {c.phone && (
                                  <span className="inline-flex items-center gap-1"><FiPhone size={10} />{c.phone}</span>
                                )}
                                {c.email && (
                                  <span className="inline-flex items-center gap-1 truncate"><FiMail size={10} />{c.email}</span>
                                )}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Linked brochures */}
                {(() => {
                  const linked = brochuresByProperty[prop.id] || [];
                  if (linked.length === 0) return null;
                  return (
                    <div className="px-5 pb-1">
                      <p className="text-stone-400 font-medium uppercase tracking-wide text-[11px] mb-1">Brochures</p>
                      <div className="flex flex-wrap gap-1.5">
                        {linked.map((b) => (
                          <span
                            key={b.id}
                            className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-medium"
                          >
                            <FiFileText size={10} />
                            {b.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Tenants summary */}
                <div className="px-5 pb-2 flex items-center gap-1.5 text-xs text-stone-500">
                  <FiUsers className="text-stone-400 flex-shrink-0" size={12} />
                  {propTenants.length === 0 ? (
                    <span>No tenants</span>
                  ) : (
                    <span>
                      {propTenants.length} tenant{propTenants.length !== 1 ? 's' : ''}
                      {soonestExpiry && (
                        <> · next expiry <span className="font-semibold text-stone-700">{formatLeaseDate(soonestExpiry)}</span></>
                      )}
                    </span>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 pb-4 flex items-center justify-between">
                  {linkedFundName ? (
                    <span className="flex items-center gap-1 text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full font-medium">
                      <FiTag size={10} />
                      {linkedFundName}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openEdit(prop)}
                      className="text-xs text-violet-500 hover:underline italic"
                    >
                      + Link to fund
                    </button>
                  )}
                  <span className="text-xs text-stone-400">
                    {new Date(prop.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Link Fund Modal */}
      {editingProp && (() => {
        const meta = editingProp.metadata && typeof editingProp.metadata === 'object'
          ? editingProp.metadata as Record<string, unknown>
          : {};
        const displayName = String(meta.displayName || editingProp.title || editingProp.address || '');
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => !saving && setEditingProp(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50">
                <div>
                  <h3 className="text-sm font-bold text-stone-950">{displayName}</h3>
                  <p className="text-xs text-stone-500 mt-0.5">Link to a fund &amp; manage tenants</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProp(null)}
                  disabled={saving}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors"
                >
                  <FiX size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-2">
                    Fund
                  </label>
                  {funds.length === 0 ? (
                    <p className="text-xs text-stone-400 italic">No funds available. Create a fund first.</p>
                  ) : (
                    <select
                      value={selectedFundId}
                      onChange={e => setSelectedFundId(e.target.value)}
                      className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    >
                      <option value="">— No fund —</option>
                      {funds.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.fundType})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-2">
                    Property Type
                  </label>
                  <select
                    value={assetForm.propertyType}
                    onChange={e => setAssetForm(f => ({ ...f, propertyType: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  >
                    <option value="">— Select type —</option>
                    {PROPERTY_TYPE_OPTIONS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={assetForm.companyName}
                      onChange={e => setAssetForm(f => ({ ...f, companyName: e.target.value }))}
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                      Registration No.
                    </label>
                    <input
                      type="text"
                      value={assetForm.registrationNumber}
                      onChange={e => setAssetForm(f => ({ ...f, registrationNumber: e.target.value }))}
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                      Owner Name &amp; Surname
                    </label>
                    <input
                      type="text"
                      value={assetForm.ownerName}
                      onChange={e => setAssetForm(f => ({ ...f, ownerName: e.target.value }))}
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={assetForm.ownerEmail}
                      onChange={e => setAssetForm(f => ({ ...f, ownerEmail: e.target.value }))}
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                      Number
                    </label>
                    <input
                      type="text"
                      value={assetForm.ownerNumber}
                      onChange={e => setAssetForm(f => ({ ...f, ownerNumber: e.target.value }))}
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-2">
                    Centre Contacts
                  </label>
                  <p className="text-xs text-stone-400 mb-2">
                    Centre manager &amp; other key contacts for this centre.
                  </p>
                  {centreContacts.length === 0 ? (
                    <p className="text-xs text-stone-400 italic mb-2">No contacts recorded yet.</p>
                  ) : (
                    <div className="space-y-3 mb-2">
                      {centreContacts.map((contact, index) => (
                        <div key={index} className="rounded-lg border border-stone-200 p-3 space-y-2 bg-stone-50/60">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={contact.name}
                              onChange={e => updateContact(index, 'name', e.target.value)}
                              placeholder="Name & surname"
                              className="flex-1 min-w-0 px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                            <button
                              type="button"
                              onClick={() => removeContact(index)}
                              title="Remove contact"
                              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              <FiX size={16} />
                            </button>
                          </div>
                          <input
                            type="text"
                            value={contact.role}
                            onChange={e => updateContact(index, 'role', e.target.value)}
                            placeholder="Role (e.g. Centre Manager)"
                            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                          />
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="tel"
                              value={contact.phone}
                              onChange={e => updateContact(index, 'phone', e.target.value)}
                              placeholder="Contact number"
                              className="flex-1 min-w-0 px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                            <input
                              type="email"
                              value={contact.email}
                              onChange={e => updateContact(index, 'email', e.target.value)}
                              placeholder="Email address"
                              className="flex-1 min-w-0 px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={addContact}
                    className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 transition-colors"
                  >
                    <FiPlus size={14} />
                    Add contact
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-2">
                    Tenants &amp; Lease Expiries
                  </label>
                  {tenants.length === 0 ? (
                    <p className="text-xs text-stone-400 italic mb-2">No tenants recorded yet.</p>
                  ) : (
                    <div className="space-y-2 mb-2">
                      {tenants.map((tenant, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={tenant.name}
                            onChange={e => updateTenant(index, 'name', e.target.value)}
                            placeholder="Tenant name"
                            className="flex-1 min-w-0 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                          />
                          <input
                            type="date"
                            value={tenant.leaseExpiry}
                            onChange={e => updateTenant(index, 'leaseExpiry', e.target.value)}
                            className="px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                          />
                          <button
                            type="button"
                            onClick={() => removeTenant(index)}
                            title="Remove tenant"
                            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          >
                            <FiX size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={addTenant}
                    className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 transition-colors"
                  >
                    <FiPlus size={14} />
                    Add tenant
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 pb-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingProp(null)}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 border border-stone-300 rounded-lg text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-violet-500 hover:bg-violet-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
