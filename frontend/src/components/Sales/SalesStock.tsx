// @ts-nocheck
'use client';

import React, { useEffect, useState } from "react";
import { SalesStock } from "../../data/sales";
import { FiEdit2, FiTrash2, FiPlus, FiSearch, FiAlertCircle } from "react-icons/fi";
import { emit } from '../../lib/dealEvents';
import { brokerService } from '@/services/brokerService';
import { contactService } from '@/services/contactService';
import { leadService } from '@/services/leadService';
import { propertyService } from '@/services/propertyService';
import { tenantService } from '@/services/tenantService';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import {
  mapStockRecordToSalesStock,
  serializeSalesStock,
  stockService,
} from "@/services/stockService";
import GooglePlaceAutocompleteInput, {
  SelectedGooglePlace,
} from '@/components/Shared/GooglePlaceAutocompleteInput';

const toOptionalNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const buildMapSearchLabel = (name?: string, address?: string) => {
  const safeName = String(name || "").trim();
  const safeAddress = String(address || "").trim();
  if (safeName && safeAddress) return `${safeName}, ${safeAddress}`;
  return safeName || safeAddress || "";
};

const isValidMapSelection = (asset: any) =>
  Boolean(asset?.selectedFromMap && asset?.placeId) &&
  toOptionalNumber(asset?.latitude) !== undefined &&
  toOptionalNumber(asset?.longitude) !== undefined &&
  String(asset?.itemName || "").trim().length > 0 &&
  String(asset?.location || "").trim().length > 0;

export const SalesStock: React.FC = () => {
  const [stocks, setStocks] = useState<SalesStock[]>([]);
  const [brokers, setBrokers] = useState<Array<{ id: string; name: string; company?: string }>>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; name?: string; firstName?: string; lastName?: string }>>([]);
  const [tenants, setTenants] = useState<Array<{ id: string; firstName?: string; lastName?: string }>>([]);
  const [leads, setLeads] = useState<Array<{ id: string; name: string }>>([]);
  const [properties, setProperties] = useState<Array<{ id: string; name: string; brokerName?: string; assignedBrokerName?: string }>>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState<SalesStock | null>(null);
  const [editingStock, setEditingStock] = useState<SalesStock | null>(null);
  const [newAsset, setNewAsset] = useState({
    searchQuery: "",
    itemName: "",
    category: "Marketing Materials" as "Marketing Materials" | "Signage" | "Photography" | "Permits" | "Technical" | "Other",
    quantity: 1,
    location: "",
    address: "",
    formattedAddress: "",
    city: "",
    areaName: "",
    condition: "Excellent" as "Excellent" | "Good" | "Fair" | "Poor",
    purchaseDate: new Date().toISOString().split("T")[0],
    purchasePrice: 0,
    usageStatus: "Available" as "Available" | "In Use" | "Reserved" | "Archived",
    assignedTo: "",
    expiryDate: "",
    comments: "",
    dealStatus: "Pending" as any,
    notes: "",
    relatedProperty: "",
    placeId: "",
    selectedFromMap: false,
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    documents: [] as { name: string; url?: string }[],
  });

  const loadStockItems = React.useCallback(async () => {
    try {
      const result = await stockService.getAllStockItems({ module: "sales", limit: 1000 });
      const mapped = result.data.map((item) => mapStockRecordToSalesStock(item));
      setStocks(mapped);
    } catch {
      setStocks([]);
    }
  }, []);

  const loadLookups = React.useCallback(async () => {
    try {
      const [brokerResult, contactResult, tenantResult, leadResult, propertyResult] =
        await Promise.all([
          brokerService.getAllBrokers(),
          contactService.getAllContacts({ limit: 1000 }),
          tenantService.getAllTenants({ limit: 1000 }),
          leadService.getAllLeads({ limit: 1000 }),
          propertyService.getAllProperties({ limit: 1000 }),
        ]);

      setBrokers(brokerResult);
      setContacts(contactResult.data);
      setTenants(
        tenantResult.data.map((tenant) => ({
          id: tenant.id,
          firstName: tenant.firstName,
          lastName: tenant.lastName,
        }))
      );
      setLeads(
        leadResult.data.map((lead) => ({
          id: lead.id,
          name: lead.name,
        }))
      );
      setProperties(
        propertyResult.data.map((property) => ({
          id: property.id,
          name: property.address || property.title || property.id,
          brokerName: property.assignedBrokerName,
          assignedBrokerName: property.assignedBrokerName,
        }))
      );
    } catch {
      setBrokers([]);
      setContacts([]);
      setTenants([]);
      setLeads([]);
      setProperties([]);
    }
  }, []);

  useEffect(() => {
    void loadStockItems();
  }, [loadStockItems]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useRealtimeRefresh(() => {
    void loadStockItems();
    void loadLookups();
  });

  const handleAddDocsToNew = (files: FileList | null) => {
    if (!files) return;
    const docs = Array.from(files).map(f => ({ name: f.name, url: URL.createObjectURL(f) }));
    setNewAsset({ ...newAsset, documents: [...(newAsset.documents || []), ...docs] });
  };

  const handleAddDocsToEditing = (files: FileList | null) => {
    if (!files || !editingStock) return;
    const docs = Array.from(files).map(f => ({ name: f.name, url: URL.createObjectURL(f) }));
    setEditingStock({ ...editingStock, documents: [...(editingStock.documents || []), ...docs] });
  };

  const filteredStocks = stocks.filter((stock) => {
    const matchesSearch = stock.itemName
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus =
      filterStatus === "All" || (stock.dealStatus && stock.dealStatus === filterStatus);
    return matchesSearch && matchesStatus;
  });

  const handleChangeStockStatus = (stockId: string, newStatus: string) => {
    setStocks(prev => prev.map(s => s.id === stockId ? { ...s, dealStatus: newStatus } : s));
    // emit for Forecast syncing
    const stock = stocks.find(s => s.id === stockId);
    if (stock) {
      emit('dealStatusChanged', {
        id: stock.id,
        broker: getBrokerForProperty(stock.relatedProperty) || stock.assignedTo || 'Unknown',
        dealName: stock.itemName,
        type: 'Sales',
        status: newStatus,
      });
    }
  };

  const resolveContactName = (id?: string) => {
    if (!id) return null;
    // direct name provided
    if (!id.includes("-")) return id;
    const broker = brokers.find((item) => item.id === id);
    if (broker) return String(broker.name || id);

    const contact = contacts.find((item) => item.id === id);
    if (contact) {
      const fullName =
        `${contact.firstName || ""} ${contact.lastName || ""}`.trim() ||
        String(contact.name || "");
      if (fullName) return fullName;
    }

    const tenant = tenants.find((item) => item.id === id);
    if (tenant) {
      return `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim() || id;
    }

    const lead = leads.find((item) => item.id === id);
    if (lead) return String(lead.name || id);

    const property = properties.find((item) => item.id === id);
    if (property) return String(property.name || id);

    return id;
  };

  const getBrokerForProperty = (propertyId?: string) => {
    if (!propertyId) return null;
    const prop = properties.find((p) => p.id === propertyId);
    return prop ? prop.assignedBrokerName || prop.brokerName || null : null;
  };

  const handleNewAssetSearchChange = (value: string) => {
    setNewAsset((current) => ({
      ...current,
      searchQuery: value,
      itemName: "",
      location: "",
      address: "",
      formattedAddress: "",
      city: "",
      areaName: "",
      placeId: "",
      selectedFromMap: false,
      latitude: undefined,
      longitude: undefined,
    }));
  };

  const applyPlaceToNewAsset = (place: SelectedGooglePlace) => {
    setNewAsset((current) => ({
      ...current,
      searchQuery: buildMapSearchLabel(place.name, place.address),
      itemName: place.name,
      location: place.address,
      address: place.address,
      formattedAddress: place.formattedAddress,
      city: place.city,
      areaName: place.area,
      placeId: place.placeId,
      selectedFromMap: true,
      latitude: place.latitude,
      longitude: place.longitude,
    }));
  };

  const handleEditingSearchChange = (value: string) => {
    setEditingStock((current) => {
      if (!current) return current;
      return {
        ...current,
        searchQuery: value,
        itemName: "",
        location: "",
        address: "",
        formattedAddress: "",
        city: "",
        areaName: "",
        placeId: "",
        selectedFromMap: false,
        latitude: undefined,
        longitude: undefined,
      };
    });
  };

  const applyPlaceToEditingAsset = (place: SelectedGooglePlace) => {
    setEditingStock((current) => {
      if (!current) return current;
      return {
        ...current,
        searchQuery: buildMapSearchLabel(place.name, place.address),
        itemName: place.name,
        location: place.address,
        address: place.address,
        formattedAddress: place.formattedAddress,
        city: place.city,
        areaName: place.area,
        placeId: place.placeId,
        selectedFromMap: true,
        latitude: place.latitude,
        longitude: place.longitude,
      };
    });
  };

  const getUsageStatusColor = (status: string) => {
    switch (status) {
      case "Available":
        return "bg-green-100 text-green-800";
      case "In Use":
        return "bg-blue-100 text-blue-800";
      case "Reserved":
        return "bg-yellow-100 text-yellow-800";
      case "Archived":
        return "bg-stone-100 text-stone-800";
      default:
        return "bg-stone-100 text-stone-800";
    }
  };

  const isExpiringSoon = (expiryDate?: string) => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const today = new Date();
    const daysUntilExpiry = Math.floor(
      (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  const isExpired = (expiryDate?: string) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  const daysUntilExpiry = (expiryDate?: string) => {
    if (!expiryDate) return null;
    const expiry = new Date(expiryDate);
    const today = new Date();
    return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const handleAddAsset = async () => {
    if (!isValidMapSelection(newAsset)) {
      alert("Please search and select a valid property from Google Maps");
      return;
    }
    try {
      const latitude = toOptionalNumber(newAsset.latitude);
      const longitude = toOptionalNumber(newAsset.longitude);
      const created = await stockService.createStockItem({
        module: "sales",
        propertyId: newAsset.relatedProperty || undefined,
        name: String(newAsset.itemName || "").trim(),
        address: String(newAsset.location || "").trim(),
        latitude,
        longitude,
        details: serializeSalesStock({
          ...newAsset,
          propertyName: String(newAsset.itemName || "").trim(),
          address: String(newAsset.location || "").trim(),
          formattedAddress: String(
            newAsset.formattedAddress || newAsset.location || ""
          ).trim(),
          city: String(newAsset.city || "").trim(),
          areaName: String(newAsset.areaName || "").trim(),
          stockKind: "property_listing",
          selectedFromMap: true,
          latitude,
          longitude,
          propertyStatus: "for_sale",
        }),
      });
      const assetWithId = mapStockRecordToSalesStock(created);
      setStocks((prev) => [assetWithId, ...prev]);
      await loadStockItems();
      setShowAddModal(false);
      setNewAsset({
        searchQuery: "",
        itemName: "",
        category: "Marketing Materials",
        quantity: 1,
        location: "",
        address: "",
        formattedAddress: "",
        city: "",
        areaName: "",
        condition: "Excellent",
        purchaseDate: new Date().toISOString().split("T")[0],
        purchasePrice: 0,
        usageStatus: "Available",
        assignedTo: "",
        expiryDate: "",
        comments: "",
        dealStatus: "Pending",
        notes: "",
        relatedProperty: "",
        placeId: "",
        selectedFromMap: false,
        latitude: undefined,
        longitude: undefined,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save asset");
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (confirm("Are you sure you want to delete this asset?")) {
      try {
        await stockService.deleteStockItem(id);
        setStocks((prev) => prev.filter(stock => stock.id !== id));
        await loadStockItems();
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to delete asset");
      }
    }
  };

  const handleEditClick = (stock: SalesStock) => {
    setEditingStock({
      ...stock,
      searchQuery: buildMapSearchLabel(
        String((stock as any).itemName || ""),
        String((stock as any).address || (stock as any).location || "")
      ),
      address: String((stock as any).address || (stock as any).location || ""),
      formattedAddress: String(
        (stock as any).formattedAddress ||
          (stock as any).address ||
          (stock as any).location ||
          ""
      ),
      city: String((stock as any).city || ""),
      areaName: String((stock as any).areaName || ""),
      placeId: String((stock as any).placeId || ""),
      selectedFromMap: Boolean((stock as any).selectedFromMap && (stock as any).placeId),
      latitude: toOptionalNumber((stock as any).latitude),
      longitude: toOptionalNumber((stock as any).longitude),
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingStock) return;
    if (!isValidMapSelection(editingStock)) {
      alert("Please search and select a valid property from Google Maps");
      return;
    }
    try {
      const latitude = toOptionalNumber((editingStock as any).latitude);
      const longitude = toOptionalNumber((editingStock as any).longitude);
      const updated = await stockService.updateStockItem(
        String(editingStock.backendRecordId || editingStock.id || ""),
        {
          module: "sales",
          propertyId: editingStock.relatedProperty || undefined,
          name: String(editingStock.itemName || "").trim(),
          address: String((editingStock as any).location || "").trim(),
          latitude,
          longitude,
          details: serializeSalesStock({
            ...editingStock,
            propertyName: String(editingStock.itemName || "").trim(),
            address: String((editingStock as any).location || "").trim(),
            formattedAddress: String(
              (editingStock as any).formattedAddress ||
                (editingStock as any).location ||
                ""
            ).trim(),
            city: String((editingStock as any).city || "").trim(),
            areaName: String((editingStock as any).areaName || "").trim(),
            stockKind: "property_listing",
            selectedFromMap: true,
            latitude,
            longitude,
            propertyStatus: "for_sale",
          }),
        }
      );
      const mapped = mapStockRecordToSalesStock(updated);
      setStocks((prev) => prev.map(s => s.id === editingStock.id ? mapped : s));
      await loadStockItems();
      setShowEditModal(false);
      setEditingStock(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update asset");
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setNewAsset({
      searchQuery: "",
      itemName: "",
      category: "Marketing Materials",
      quantity: 1,
      location: "",
      address: "",
      formattedAddress: "",
      city: "",
      areaName: "",
      condition: "Excellent",
      purchaseDate: new Date().toISOString().split("T")[0],
      purchasePrice: 0,
      usageStatus: "Available",
      assignedTo: "",
      expiryDate: "",
      comments: "",
      dealStatus: "Pending",
      notes: "",
      relatedProperty: "",
      placeId: "",
      selectedFromMap: false,
      latitude: undefined,
      longitude: undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Sales Assets</h2>
          <p className="text-stone-600 text-sm mt-1">
            Manage marketing materials, signage, permits, and shared assets
          </p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FiPlus size={18} />
          Add Asset
        </button>
      </div>

      {/* Add Asset Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-1">Add New Sales Asset</h3>
              <p className="text-stone-600 text-sm mb-6">
                Search and select a property from Google Maps, then fill in the asset details.
              </p>
               
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Search Property on Map *
                  </label>
                  <GooglePlaceAutocompleteInput
                    value={newAsset.searchQuery}
                    onInputChange={handleNewAssetSearchChange}
                    onPlaceSelect={applyPlaceToNewAsset}
                    placeholder="Search for a building, office, mall, address, or named property"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Property Name *
                  </label>
                  <input
                    type="text"
                    value={newAsset.itemName}
                    readOnly
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg bg-stone-50 text-stone-700"
                    placeholder="Auto-filled from map selection"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Coordinates
                  </label>
                  <div className="w-full px-3 py-2 border border-stone-200 rounded-lg bg-stone-50 text-stone-700 text-sm">
                    {toOptionalNumber(newAsset.latitude) !== undefined &&
                    toOptionalNumber(newAsset.longitude) !== undefined
                      ? `${Number(newAsset.latitude).toFixed(6)}, ${Number(newAsset.longitude).toFixed(6)}`
                      : "Coordinates will be saved automatically"}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Location *
                  </label>
                  <input
                    type="text"
                    value={newAsset.location}
                    readOnly
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg bg-stone-50 text-stone-700"
                    placeholder="Auto-filled from map selection"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Link Existing Property (optional)
                  </label>
                  <select
                    value={newAsset.relatedProperty}
                    onChange={(e) =>
                      setNewAsset({ ...newAsset, relatedProperty: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">Select a property (optional)</option>
                    {properties.map((prop) => (
                      <option key={prop.id} value={prop.id}>
                        {prop.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Contact (Assigned To)
                  </label>
                  <input
                    type="text"
                    value={newAsset.assignedTo}
                    onChange={(e) =>
                      setNewAsset({ ...newAsset, assignedTo: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Contact name or ID"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Usage Status
                  </label>
                  <select
                    value={newAsset.usageStatus}
                    onChange={(e) =>
                      setNewAsset({ ...newAsset, usageStatus: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Available</option>
                    <option>In Use</option>
                    <option>Reserved</option>
                    <option>Archived</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Date Added
                  </label>
                  <input
                    type="date"
                    value={newAsset.purchaseDate}
                    onChange={(e) =>
                      setNewAsset({ ...newAsset, purchaseDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Price (R)
                  </label>
                  <input
                    type="number"
                    value={newAsset.purchasePrice}
                    onChange={(e) =>
                      setNewAsset({ ...newAsset, purchasePrice: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Status
                  </label>
                  <select
                    value={newAsset.dealStatus}
                    onChange={(e) =>
                      setNewAsset({ ...newAsset, dealStatus: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Pending</option>
                    <option>LOI</option>
                    <option>OTP</option>
                    <option>DD</option>
                    <option>Finance</option>
                    <option>Transfer</option>
                    <option>Won</option>
                    <option>Lost</option>
                    <option>Invoice</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Condition
                  </label>
                  <select
                    value={newAsset.condition}
                    onChange={(e) =>
                      setNewAsset({ ...newAsset, condition: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Excellent</option>
                    <option>Good</option>
                    <option>Fair</option>
                    <option>Poor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newAsset.quantity}
                    onChange={(e) =>
                      setNewAsset({ ...newAsset, quantity: parseInt(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={newAsset.expiryDate}
                    onChange={(e) =>
                      setNewAsset({ ...newAsset, expiryDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Comments
                  </label>
                  <textarea
                    value={newAsset.comments}
                    onChange={(e) =>
                      setNewAsset({ ...newAsset, comments: e.target.value, notes: e.target.value })
                    }
                    placeholder="Add any additional notes..."
                    rows={3}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Documents (attach files or paste URLs)
                  </label>
                  <input type="file" multiple onChange={(e) => handleAddDocsToNew(e.target.files)} className="w-full" />
                  {(newAsset.documents || []).length > 0 && (
                    <ul className="mt-2 text-sm">
                      {(newAsset.documents || []).map((d, i) => (
                        <li key={i}><a href={d.url} target="_blank" rel="noreferrer" className="text-violet-600">{d.name}</a></li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-6 justify-end">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAsset}
                  className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  Add Asset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Asset Modal */}
      {showEditModal && editingStock && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-1">Edit Sales Asset</h3>
              <p className="text-stone-600 text-sm mb-6">
                Search and select a property from Google Maps, then update asset details.
              </p>
               
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Search Property on Map *
                  </label>
                  <GooglePlaceAutocompleteInput
                    value={String(editingStock.searchQuery || "")}
                    onInputChange={handleEditingSearchChange}
                    onPlaceSelect={applyPlaceToEditingAsset}
                    placeholder="Search for a building, office, mall, address, or named property"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Property Name *
                  </label>
                  <input
                    type="text"
                    value={editingStock.itemName}
                    readOnly
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg bg-stone-50 text-stone-700"
                    placeholder="Auto-filled from map selection"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Coordinates
                  </label>
                  <div className="w-full px-3 py-2 border border-stone-200 rounded-lg bg-stone-50 text-stone-700 text-sm">
                    {toOptionalNumber((editingStock as any).latitude) !== undefined &&
                    toOptionalNumber((editingStock as any).longitude) !== undefined
                      ? `${Number((editingStock as any).latitude).toFixed(6)}, ${Number((editingStock as any).longitude).toFixed(6)}`
                      : "Coordinates will be saved automatically"}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Location *
                  </label>
                  <input
                    type="text"
                    value={editingStock.location}
                    readOnly
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg bg-stone-50 text-stone-700"
                    placeholder="Auto-filled from map selection"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Link Existing Property (optional)
                  </label>
                  <select
                    value={editingStock.relatedProperty || ""}
                    onChange={(e) =>
                      setEditingStock({ ...editingStock, relatedProperty: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">Select a property (optional)</option>
                    {properties.map((prop) => (
                      <option key={prop.id} value={prop.id}>
                        {prop.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category removed from edit form per request */}

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Contact (Assigned To)
                  </label>
                  <input
                    type="text"
                    value={editingStock.assignedTo}
                    onChange={(e) =>
                      setEditingStock({ ...editingStock, assignedTo: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Contact name or ID"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Usage Status
                  </label>
                  <select
                    value={editingStock.usageStatus}
                    onChange={(e) =>
                      setEditingStock({ ...editingStock, usageStatus: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Available</option>
                    <option>In Use</option>
                    <option>Reserved</option>
                    <option>Archived</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Date Added
                  </label>
                  <input
                    type="date"
                    value={editingStock.purchaseDate}
                    onChange={(e) =>
                      setEditingStock({ ...editingStock, purchaseDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Price (R)
                  </label>
                  <input
                    type="number"
                    value={editingStock.purchasePrice}
                    onChange={(e) =>
                      setEditingStock({ ...editingStock, purchasePrice: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Status
                  </label>
                  <select
                    value={editingStock.dealStatus || "Pending"}
                    onChange={(e) =>
                      setEditingStock({ ...editingStock, dealStatus: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Pending</option>
                    <option>LOI</option>
                    <option>OTP</option>
                    <option>DD</option>
                    <option>Finance</option>
                    <option>Transfer</option>
                    <option>Won</option>
                    <option>Lost</option>
                    <option>Invoice</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Condition
                  </label>
                  <select
                    value={editingStock.condition}
                    onChange={(e) =>
                      setEditingStock({ ...editingStock, condition: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Excellent</option>
                    <option>Good</option>
                    <option>Fair</option>
                    <option>Poor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editingStock.quantity}
                    onChange={(e) =>
                      setEditingStock({ ...editingStock, quantity: parseInt(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={editingStock.expiryDate || ""}
                    onChange={(e) =>
                      setEditingStock({ ...editingStock, expiryDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Comments
                  </label>
                  <textarea
                    value={editingStock.comments}
                    onChange={(e) =>
                      setEditingStock({ ...editingStock, comments: e.target.value, notes: e.target.value })
                    }
                    placeholder="Add any additional notes..."
                    rows={3}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Documents (attach files or paste URLs)
                  </label>
                  <input type="file" multiple onChange={(e) => handleAddDocsToEditing(e.target.files)} className="w-full" />
                  {(editingStock.documents || []).length > 0 && (
                    <ul className="mt-2 text-sm">
                      {(editingStock.documents || []).map((d, i) => (
                        <li key={i}><a href={d.url} target="_blank" rel="noreferrer" className="text-violet-600">{d.name}</a></li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-6 justify-end">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingStock(null);
                  }}
                  className="px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>Note:</strong> Sales assets can be linked to Leasing stock for shared property resources.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-64">
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Search by item name
            </label>
            <div className="relative">
              <FiSearch className="absolute left-3 top-3 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search assets..."
                className="w-full pl-10 pr-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
                {/* Category filter removed per request */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option>All</option>
              <option>Pending</option>
              <option>LOI</option>
              <option>OTP</option>
              <option>DD</option>
              <option>Finance</option>
              <option>Transfer</option>
              <option>Won</option>
              <option>Lost</option>
              <option>Invoice</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredStocks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Property Name
                  </th>
                  {/* Category column removed */}
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Documents
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Location
                  </th>
                  
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Usage Status
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Date Added
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Broker Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Comments
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Actions
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredStocks.map((stock) => (
                  <tr
                    key={stock.id}
                    className={`hover:bg-stone-50 transition-colors ${
                      isExpired(stock.expiryDate) ? "bg-red-50" : 
                      isExpiringSoon(stock.expiryDate) ? "bg-yellow-50" : ""
                    }`}
                  >
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      <div className="flex items-center gap-2">
                        {stock.itemName}
                        {isExpired(stock.expiryDate) && (
                          <FiAlertCircle size={16} className="text-red-600" />
                        )}
                        {isExpiringSoon(stock.expiryDate) && (
                          <FiAlertCircle size={16} className="text-yellow-600" />
                        )}
                      </div>
                    </td>
                    {/* Category cell removed */}
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      {resolveContactName(stock.assignedTo) || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      {stock.documents && stock.documents.length > 0 ? (
                        <button onClick={() => setShowDocsModal(stock)} className="text-violet-600 underline text-sm">View ({stock.documents.length})</button>
                      ) : (
                        <span className="text-stone-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      {stock.location}
                    </td>
                    
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getUsageStatusColor(
                          stock.usageStatus
                        )}`}
                      >
                        {stock.usageStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {stock.purchaseDate ? (
                        <div className="flex flex-col">
                          <span>
                            {new Date(stock.purchaseDate).toLocaleDateString()}
                          </span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      R {stock.purchasePrice.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {getBrokerForProperty(stock.relatedProperty) ? (
                        <span className="text-sm text-stone-900">{getBrokerForProperty(stock.relatedProperty)}</span>
                      ) : (
                        <span className="text-xs text-stone-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      {stock.comments || stock.notes || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleEditClick(stock)}
                          className="p-1 hover:bg-stone-100 rounded transition-colors">
                          <FiEdit2 size={16} className="text-stone-600" />
                        </button>
                        <button 
                          onClick={() => handleDeleteAsset(stock.id)}
                          className="p-1 hover:bg-stone-100 rounded transition-colors"
                        >
                          <FiTrash2 size={16} className="text-red-600" />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <select
                        value={stock.dealStatus || 'Pending'}
                        onChange={(e) => handleChangeStockStatus(stock.id, e.target.value)}
                        className="px-3 py-1 border rounded text-sm"
                      >
                        <option>Pending</option>
                        <option>LOI</option>
                        <option>OTP</option>
                        <option>DD</option>
                        <option>Finance</option>
                        <option>Transfer</option>
                        <option>Won</option>
                        <option>Lost</option>
                        <option>Invoice</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-stone-500">
            <p>No assets found matching your search.</p>
          </div>
        )}
      </div>

      {showDocsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-4">Documents for {showDocsModal.itemName}</h3>
              <ul className="space-y-2">
                {(showDocsModal.documents || []).map((d, idx) => (
                  <li key={idx} className="flex items-center justify-between">
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-violet-600">{d.name}</a>
                    <div className="text-sm text-stone-500"> <button onClick={() => { navigator.clipboard?.writeText(d.url || ''); }} className="underline">Copy URL</button></div>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowDocsModal(null)} className="px-4 py-2 border rounded">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Assets</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">
            {stocks.length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Value</p>
          <p className="text-2xl font-bold text-violet-600 mt-1">
            R
            {stocks
              .reduce((sum, s) => sum + s.purchasePrice, 0)
              .toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Available</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {stocks.filter((s) => s.usageStatus === "Available").length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Expiring Soon</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">
            {stocks.filter((s) => isExpiringSoon(s.expiryDate)).length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Linked Assets</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {stocks.filter((s) => s.linkedToLeasingStock).length}
          </p>
        </div>
      </div>
    </div>
  );
};
