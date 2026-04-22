'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiMapPin, FiPlus, FiSearch, FiTrash2 } from 'react-icons/fi';
import { formatRand } from '@/lib/currency';
import { brokerService } from '@/services/brokerService';
import {
  mapStockRecordToLeasingStock,
  serializeLeasingStock,
  stockService,
} from '@/services/stockService';
import { propertyService } from '@/services/propertyService';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import GooglePlaceAutocompleteInput, {
  SelectedGooglePlace,
} from '@/components/Shared/GooglePlaceAutocompleteInput';

type Listing = {
  id: string;
  backendRecordId?: string;
  propertyId?: string;
  itemName: string;
  propertyName?: string;
  address?: string;
  formattedAddress?: string;
  city?: string;
  areaName?: string;
  location: string;
  category?: string;
  condition?: string;
  purchaseDate?: string;
  purchasePrice: number;
  comments?: string;
  notes?: string;
  createdBy?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  selectedFromMap?: boolean;
  stockKind?: string;
};

type ListingForm = {
  searchQuery: string;
  itemName: string;
  address: string;
  formattedAddress: string;
  city: string;
  areaName: string;
  category: string;
  condition: string;
  purchaseDate: string;
  purchasePrice: number;
  comments: string;
  placeId: string;
  selectedFromMap: boolean;
  propertyId?: string;
  latitude?: number;
  longitude?: number;
};

const CATEGORY_OPTIONS = ['Shopping Center', 'Office', 'Mall', 'Industrial', 'Other'];
const CONDITION_OPTIONS = ['Excellent', 'Good', 'Fair', 'Poor'];

const today = () => new Date().toISOString().split('T')[0];

const emptyForm = (): ListingForm => ({
  searchQuery: '',
  itemName: '',
  address: '',
  formattedAddress: '',
  city: '',
  areaName: '',
  category: 'Shopping Center',
  condition: 'Good',
  purchaseDate: today(),
  purchasePrice: 0,
  comments: '',
  placeId: '',
  selectedFromMap: false,
  propertyId: '',
  latitude: undefined,
  longitude: undefined,
});

const toNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toForm = (listing: Listing): ListingForm => ({
  searchQuery: listing.address || listing.location || listing.itemName || '',
  itemName: listing.itemName || listing.propertyName || '',
  address: listing.address || listing.location || '',
  formattedAddress: listing.formattedAddress || listing.address || listing.location || '',
  city: listing.city || '',
  areaName: listing.areaName || '',
  category: listing.category || 'Shopping Center',
  condition: listing.condition || 'Good',
  purchaseDate: listing.purchaseDate || today(),
  purchasePrice: Number(listing.purchasePrice || 0),
  comments: listing.comments || listing.notes || '',
  placeId: String(listing.placeId || ''),
  selectedFromMap: Boolean(listing.selectedFromMap && listing.placeId),
  propertyId: listing.propertyId || '',
  latitude: toNumber(listing.latitude),
  longitude: toNumber(listing.longitude),
});

const validate = (form: ListingForm): string | null => {
  if (!form.itemName.trim()) {
    return 'Please enter a property name';
  }
  if (!form.address.trim()) {
    return 'Please enter a location/address';
  }
  if (Number(form.purchasePrice || 0) <= 0) {
    return 'Price is required and must be greater than 0';
  }
  return null;
};

const buildPayload = (form: ListingForm) => ({
  module: 'leasing',
  propertyId: form.propertyId || undefined,
  name: form.itemName.trim(),
  address: form.address.trim(),
  latitude: toNumber(form.latitude),
  longitude: toNumber(form.longitude),
  details: serializeLeasingStock({
    itemName: form.itemName.trim(),
    centreItemName: form.itemName.trim(),
    propertyName: form.itemName.trim(),
    category: form.category,
    retailCategory: form.category,
    condition: form.condition,
    location: form.address.trim(),
    locationWithinCentre: form.address.trim(),
    formatted_address: (form.formattedAddress || form.address).trim(),
    address: form.address.trim(),
    quantity: 1,
    purchaseDate: form.purchaseDate,
    dateObtained: form.purchaseDate,
    purchasePrice: Number(form.purchasePrice || 0),
    price: Number(form.purchasePrice || 0),
    value: Number(form.purchasePrice || 0),
    comments: form.comments.trim(),
    notes: form.comments.trim(),
    availability: 'In Stock',
    pricingType: 'gross_rental',
    stockKind: 'property_listing',
    placeId: form.placeId,
    selectedFromMap: true,
    latitude: toNumber(form.latitude),
    longitude: toNumber(form.longitude),
    propertyType: form.category,
    propertyStatus: 'for_lease',
    city: form.city.trim(),
    areaName: form.areaName.trim(),
    locality: form.areaName.trim(),
    area: 0,
  }),
});

export const Stock: React.FC = () => {
  const [stocks, setStocks] = useState<Listing[]>([]);
  const [brokers, setBrokers] = useState<Array<{ id: string; name: string }>>([]);
  const [existingProperties, setExistingProperties] = useState<Array<{ id: string; title: string; address: string; latitude?: number; longitude?: number; ownerName?: string; ownerEmail?: string; ownerContactNumber?: string }>>([]); 
  const [ownerPopup, setOwnerPopup] = useState<{ title: string; ownerName?: string; ownerEmail?: string; ownerContactNumber?: string } | null>(null);
  const [useExistingProperty, setUseExistingProperty] = useState(false);
  const [propertySearchInput, setPropertySearchInput] = useState('');
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newForm, setNewForm] = useState<ListingForm>(emptyForm());
  const [editForm, setEditForm] = useState<ListingForm>(emptyForm());
  const [editing, setEditing] = useState<Listing | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const refreshStock = React.useCallback(async () => {
    const result = await stockService.getAllStockItems({ module: 'leasing', limit: 1000 });
    setStocks(
      result.data
        .map((item) => mapStockRecordToLeasingStock(item) as Listing)
        .filter((item) => String(item.stockKind || '').toLowerCase() === 'property_listing')
    );
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [stockResult, brokerResult, propertyResult] = await Promise.all([
          stockService.getAllStockItems({ module: 'leasing', limit: 1000 }),
          brokerService.getAllBrokers(),
          propertyService.getAllProperties({ limit: 1000 }).catch(() => ({ data: [] })),
        ]);

        if (!mounted) return;
        setStocks(
          stockResult.data
            .map((item) => mapStockRecordToLeasingStock(item) as Listing)
            .filter((item) => String(item.stockKind || '').toLowerCase() === 'property_listing')
        );
        setBrokers(brokerResult.map((broker) => ({ id: broker.id, name: broker.name })));
        setExistingProperties(
          (Array.isArray(propertyResult.data) ? propertyResult.data : []).map((p: any) => ({
            id: p.id,
            title: String(p.title || p.name || ''),
            address: String(p.address || ''),
            latitude: typeof p.latitude === 'number' ? p.latitude : undefined,
            longitude: typeof p.longitude === 'number' ? p.longitude : undefined,
            ownerName: p.metadata?.ownerName ? String(p.metadata.ownerName) : undefined,
            ownerEmail: p.metadata?.ownerEmail ? String(p.metadata.ownerEmail) : undefined,
            ownerContactNumber: p.metadata?.ownerContactNumber ? String(p.metadata.ownerContactNumber) : undefined,
          }))
        );
      } catch {
        if (!mounted) return;
        setStocks([]);
        setBrokers([]);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  useRealtimeRefresh(() => {
    void refreshStock();
  });

  const brokerNames = useMemo(
    () => new Map(brokers.map((broker) => [broker.id, broker.name])),
    [brokers]
  );

  const filteredStocks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return stocks;
    return stocks.filter((stock) => {
      const name = String(stock.itemName || stock.propertyName || '').toLowerCase();
      const address = String(stock.address || stock.location || '').toLowerCase();
      return name.includes(query) || address.includes(query);
    });
  }, [searchQuery, stocks]);

  const applyPlace = (
    setter: React.Dispatch<React.SetStateAction<ListingForm>>,
    place: SelectedGooglePlace
  ) => {
    setter((current) => ({
      ...current,
      searchQuery: `${place.name}, ${place.address}`,
      itemName: place.name,
      address: place.address,
      formattedAddress: place.formattedAddress,
      city: place.city,
      areaName: place.area,
      placeId: place.placeId,
      selectedFromMap: true,
      latitude: place.latitude,
      longitude: place.longitude,
    }));
    setFormError(null);
  };

  const updateSearch = (
    setter: React.Dispatch<React.SetStateAction<ListingForm>>,
    value: string
  ) => {
    setter((current) => ({
      ...current,
      searchQuery: value,
      itemName: '',
      address: '',
      formattedAddress: '',
      city: '',
      areaName: '',
      placeId: '',
      selectedFromMap: false,
      latitude: undefined,
      longitude: undefined,
    }));
    setFormError(null);
  };

  const resetAdd = () => {
    setNewForm(emptyForm());
    setFormError(null);
  };

  const closeAdd = () => {
    setShowAddModal(false);
    setUseExistingProperty(false);
    setPropertySearchInput('');
    setShowPropertyDropdown(false);
    resetAdd();
  };

  const closeEdit = () => {
    setShowEditModal(false);
    setUseExistingProperty(false);
    setPropertySearchInput('');
    setShowPropertyDropdown(false);
    setEditing(null);
    setEditForm(emptyForm());
    setFormError(null);
  };

  const saveNew = async () => {
    const error = validate(newForm);
    if (error) {
      setFormError(error);
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      await stockService.createStockItem(buildPayload(newForm));
      await refreshStock();
      closeAdd();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Failed to save stock item');
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = (listing: Listing) => {
    setEditing(listing);
    setEditForm(toForm(listing));
    setFormError(null);
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!editing) return;

    const error = validate(editForm);
    if (error) {
      setFormError(error);
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      await stockService.updateStockItem(String(editing.backendRecordId || editing.id), buildPayload(editForm));
      await refreshStock();
      closeEdit();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Failed to update stock item');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this stock item?')) return;

    try {
      await stockService.deleteStockItem(id);
      await refreshStock();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete stock item');
    }
  };

  const renderModal = (
    title: string,
    form: ListingForm,
    setter: React.Dispatch<React.SetStateAction<ListingForm>>,
    onClose: () => void,
    onSubmit: () => void,
    submitLabel: string
  ) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-xl font-bold text-stone-900 mb-1">{title}</h3>
          <p className="text-stone-600 text-sm mb-6">
            Search a real property, select it from existing properties or enter address directly.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Select Existing Property (optional)
              </label>
              <div className="relative">
                <div className="flex items-center border border-stone-200 rounded-lg focus-within:ring-2 focus-within:ring-violet-500 bg-white">
                  <FiSearch className="ml-3 text-stone-400 shrink-0" size={15} />
                  <input
                    type="text"
                    value={propertySearchInput}
                    onChange={(e) => {
                      setPropertySearchInput(e.target.value);
                      setShowPropertyDropdown(true);
                    }}
                    onFocus={() => setShowPropertyDropdown(true)}
                    placeholder="Search properties by name or address..."
                    className="w-full px-3 py-2 text-sm text-stone-900 bg-transparent focus:outline-none"
                  />
                  {propertySearchInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setPropertySearchInput('');
                        setShowPropertyDropdown(false);
                      }}
                      className="mr-2 text-stone-400 hover:text-stone-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {showPropertyDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {existingProperties
                      .filter((p) => {
                        const q = propertySearchInput.toLowerCase();
                        return !q || p.title.toLowerCase().includes(q) || p.address.toLowerCase().includes(q);
                      })
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-violet-50 border-b border-stone-100 last:border-0"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setter((current) => ({
                              ...current,
                              searchQuery: `${p.title} — ${p.address}`,
                              itemName: p.title,
                              address: p.address,
                              formattedAddress: p.address,
                              placeId: `existing:${p.id}`,
                              selectedFromMap: true,
                              propertyId: p.id,
                              latitude: p.latitude,
                              longitude: p.longitude,
                            }));
                            setPropertySearchInput(`${p.title}${p.address ? ` — ${p.address}` : ''}`);
                            setShowPropertyDropdown(false);
                            setFormError(null);
                          }}
                        >
                          <span className="font-medium text-stone-900">{p.title}</span>
                          {p.address && <span className="text-stone-500 ml-1">— {p.address}</span>}
                        </button>
                      ))}
                    {existingProperties.filter((p) => {
                      const q = propertySearchInput.toLowerCase();
                      return !q || p.title.toLowerCase().includes(q) || p.address.toLowerCase().includes(q);
                    }).length === 0 && (
                      <p className="px-4 py-3 text-sm text-stone-400">No matching properties found.</p>
                    )}
                  </div>
                )}
              </div>
              {existingProperties.length === 0 && (
                <p className="text-xs text-stone-400 mt-1">No properties found. Add properties from the Map module first.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Property Name *
              </label>
              <input
                type="text"
                value={form.itemName}
                onChange={(event) => setter((current) => ({ ...current, itemName: event.target.value }))}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-stone-900"
                placeholder="Auto-filled when property selected, or type manually"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Category
              </label>
              <select
                value={form.category}
                onChange={(event) => setter((current) => ({ ...current, category: event.target.value }))}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Location *
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(event) => setter((current) => ({ ...current, address: event.target.value, formattedAddress: event.target.value }))}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-stone-900"
                placeholder="Auto-filled when property selected, or type manually"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Price (R) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.purchasePrice === 0 ? "" : form.purchasePrice}
                onChange={(event) =>
                  setter((current) => ({
                    ...current,
                    purchasePrice: parseFloat(event.target.value) || 0,
                  }))
                }
                className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="Enter price"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Date Added
              </label>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(event) => setter((current) => ({ ...current, purchaseDate: event.target.value }))}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Condition
              </label>
              <select
                value={form.condition}
                onChange={(event) => setter((current) => ({ ...current, condition: event.target.value }))}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {CONDITION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <div className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
                {toNumber(form.latitude) !== undefined && toNumber(form.longitude) !== undefined
                  ? `${Number(form.latitude).toFixed(6)}, ${Number(form.longitude).toFixed(6)}`
                  : 'Coordinates will be saved automatically'}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Comments
              </label>
              <textarea
                value={form.comments}
                onChange={(event) => setter((current) => ({ ...current, comments: event.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="Optional notes"
              />
            </div>
          </div>

          {formError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex gap-3 mt-6 justify-end">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={isSaving}
              className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Stock</h2>
          <p className="text-stone-600 text-sm mt-1">
            Property listings are saved into the database with coordinates.
          </p>
        </div>
        <button
          onClick={() => {
            resetAdd();
            setShowAddModal(true);
          }}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FiPlus size={18} />
          Add Stock
        </button>
      </div>

      {showAddModal && renderModal('Add Stock Listing', newForm, setNewForm, closeAdd, saveNew, 'Save Stock')}
      {showEditModal && editing && renderModal('Edit Stock Listing', editForm, setEditForm, closeEdit, saveEdit, 'Save Changes')}

      <div className="bg-white rounded-lg shadow p-4">
        <label className="block text-sm font-medium text-stone-700 mb-2">
          Search by property name or address
        </label>
        <div className="relative">
          <FiSearch className="absolute left-3 top-3 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search stock..."
            className="w-full pl-10 pr-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredStocks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Property Name</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Location</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Category</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Price</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Coordinates</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Created By</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredStocks.map((stock) => (
                  <tr key={stock.id} className="hover:bg-stone-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      <div className="flex items-center gap-2">
                        <FiMapPin className="text-violet-500" />
                        <button
                          type="button"
                          onClick={() => {
                            const prop = existingProperties.find((p) => p.id === stock.propertyId);
                            setOwnerPopup({
                              title: stock.itemName || stock.propertyName || '-',
                              ownerName: prop?.ownerName,
                              ownerEmail: prop?.ownerEmail,
                              ownerContactNumber: prop?.ownerContactNumber,
                            });
                          }}
                          className="text-left hover:text-violet-600 hover:underline transition-colors"
                        >
                          {stock.itemName || stock.propertyName || '-'}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      <button
                        type="button"
                        onClick={() => {
                          const prop = existingProperties.find((p) => p.id === stock.propertyId);
                          setOwnerPopup({
                            title: stock.itemName || stock.propertyName || '-',
                            ownerName: prop?.ownerName,
                            ownerEmail: prop?.ownerEmail,
                            ownerContactNumber: prop?.ownerContactNumber,
                          });
                        }}
                        className="text-left hover:text-violet-600 hover:underline transition-colors"
                      >
                        {stock.address || stock.location || '-'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">{stock.category || '-'}</td>
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">{formatRand(stock.purchasePrice)}</td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      {toNumber(stock.latitude) !== undefined && toNumber(stock.longitude) !== undefined
                        ? `${Number(stock.latitude).toFixed(4)}, ${Number(stock.longitude).toFixed(4)}`
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      {stock.createdBy ? brokerNames.get(stock.createdBy) || stock.createdBy : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(stock)} className="p-1 hover:bg-stone-100 rounded transition-colors" title="Edit">
                          <FiEdit2 size={16} className="text-stone-600" />
                        </button>
                        <button
                          onClick={() => deleteItem(String(stock.backendRecordId || stock.id))}
                          className="p-1 hover:bg-stone-100 rounded transition-colors"
                          title="Delete"
                        >
                          <FiTrash2 size={16} className="text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-stone-500">
            <p>No stock listings found.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Listings</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">{stocks.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Value</p>
          <p className="text-2xl font-bold text-violet-600 mt-1">
            {formatRand(stocks.reduce((sum, stock) => sum + Number(stock.purchasePrice || 0), 0))}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Map Selected</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {stocks.filter((stock) => stock.selectedFromMap && stock.placeId).length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Linked Properties</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {stocks.filter((stock) => stock.propertyId).length}
          </p>
        </div>
      </div>

      {/* Owner Info Popup */}
      {ownerPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOwnerPopup(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-stone-900">{ownerPopup.title}</h3>
                <p className="text-xs text-stone-500 mt-0.5">Owner Details</p>
              </div>
              <button onClick={() => setOwnerPopup(null)} className="text-stone-400 hover:text-stone-600 text-xl leading-none">&times;</button>
            </div>
            {ownerPopup.ownerName || ownerPopup.ownerEmail || ownerPopup.ownerContactNumber ? (
              <div className="space-y-3">
                {ownerPopup.ownerName && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-stone-500 w-16 shrink-0">Name</span>
                    <span className="text-sm text-stone-900">{ownerPopup.ownerName}</span>
                  </div>
                )}
                {ownerPopup.ownerEmail && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-stone-500 w-16 shrink-0">Email</span>
                    <a href={`mailto:${ownerPopup.ownerEmail}`} className="text-sm text-violet-600 hover:underline">{ownerPopup.ownerEmail}</a>
                  </div>
                )}
                {ownerPopup.ownerContactNumber && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-stone-500 w-16 shrink-0">Phone</span>
                    <a href={`tel:${ownerPopup.ownerContactNumber}`} className="text-sm text-violet-600 hover:underline">{ownerPopup.ownerContactNumber}</a>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-stone-400 italic">No owner details have been added for this property. You can add them in the Map module.</p>
            )}
            <button onClick={() => setOwnerPopup(null)} className="mt-5 w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium rounded-lg transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Stock;
