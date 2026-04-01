// @ts-nocheck
'use client';

import React, { useEffect, useMemo, useState } from "react";
import { AuctionItem } from "../../data/auctions";
import { emit } from '../../lib/dealEvents';
import { FiEdit2, FiTrash2, FiPlus, FiSearch, FiDownload, FiCheck } from "react-icons/fi";
import { propertyService, PropertyRecord } from "@/services/propertyService";
import { customRecordService } from "@/services/customRecordService";
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

export const Auction: React.FC = () => {
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [systemProperties, setSystemProperties] = useState<PropertyRecord[]>([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);
  const [propertyLoadError, setPropertyLoadError] = useState("");
  const [propertySearchQuery, setPropertySearchQuery] = useState("");
  const [selectedSystemPropertyId, setSelectedSystemPropertyId] = useState<string>("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedAuctionId, setSelectedAuctionId] = useState<string | null>(null);
  const [editingAuction, setEditingAuction] = useState<AuctionItem | null>(null);
  const [newAuction, setNewAuction] = useState({
    propertyName: "",
    contactName: "",
    industryCategory: "Commercial",
    location: "",
    mandatePrice: 0,
    proposed: "sent" as const,
    auctionHouse: "Broll" as const,
    auctionDate: "",
    brokerName: "",
    auctionStatus: "Open" as const,
  });

  const getPropertyLabel = (property: PropertyRecord) => {
    const location = [property.city, property.province]
      .filter((value) => value && value !== "Unknown")
      .join(", ");
    return location ? `${property.address} (${location})` : property.address;
  };

  const toAuction = (record: any): AuctionItem => {
    const payload = record.payload || {};
    return {
      id: record.id,
      propertyName: payload.propertyName || record.name || '',
      contactName: payload.contactName || '',
      industryCategory: payload.industryCategory || 'Commercial',
      location: payload.location || '',
      mandatePrice: Number(payload.mandatePrice || 0),
      proposed: payload.proposed || 'sent',
      auctionHouse: payload.auctionHouse || 'Broll',
      auctionDate: payload.auctionDate || '',
      brokerName: payload.brokerName || '',
      auctionStatus: payload.auctionStatus || record.status || 'Open',
      paymentStatus: payload.paymentStatus || 'Unpaid',
      createdDate: payload.createdDate || new Date(record.createdAt).toISOString().split('T')[0],
    };
  };

  const loadSystemProperties = React.useCallback(async () => {
    setIsLoadingProperties(true);
    setPropertyLoadError("");
    try {
      const response = await propertyService.getAllProperties({ limit: 1000 });
      setSystemProperties(response.data || []);
    } catch (error) {
      setPropertyLoadError(
        error instanceof Error ? error.message : "Failed to load properties"
      );
      setSystemProperties([]);
    } finally {
      setIsLoadingProperties(false);
    }
  }, []);

  const loadAuctions = React.useCallback(async () => {
    try {
      const response = await customRecordService.getAllCustomRecords<Record<string, unknown>>({
        entityType: 'auction',
        limit: 1000,
      });
      setAuctions(response.data.map((record) => toAuction(record)));
    } catch {
      setAuctions([]);
    }
  }, []);

  useEffect(() => {
    void loadSystemProperties();
  }, [loadSystemProperties]);

  useEffect(() => {
    void loadAuctions();
  }, [loadAuctions]);

  useRealtimeRefresh(() => {
    void loadSystemProperties();
    void loadAuctions();
  });

  const filteredSystemProperties = useMemo(() => {
    const query = propertySearchQuery.trim().toLowerCase();
    if (!query) return systemProperties.slice(0, 10);

    return systemProperties
      .filter((property) => {
        const searchable = [
          property.address,
          property.city,
          property.province,
          property.type,
          property.assignedBrokerName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      })
      .slice(0, 10);
  }, [systemProperties, propertySearchQuery]);

  const selectedSystemProperty = useMemo(
    () => systemProperties.find((property) => property.id === selectedSystemPropertyId) || null,
    [systemProperties, selectedSystemPropertyId]
  );

  const resetAddAuctionForm = () => {
    setNewAuction({
      propertyName: "",
      contactName: "",
      industryCategory: "Commercial",
      location: "",
      mandatePrice: 0,
      proposed: "sent",
      auctionHouse: "Broll",
      auctionDate: "",
      brokerName: "",
      auctionStatus: "Open",
    });
    setPropertySearchQuery("");
    setSelectedSystemPropertyId("");
  };

  const selectSystemProperty = (property: PropertyRecord) => {
    setSelectedSystemPropertyId(property.id);
    setPropertySearchQuery(getPropertyLabel(property));
    setNewAuction((prev) => ({
      ...prev,
      propertyName: getPropertyLabel(property),
      location:
        prev.location ||
        [property.city, property.province]
          .filter((value) => value && value !== "Unknown")
          .join(", "),
      brokerName: prev.brokerName || property.assignedBrokerName || "",
    }));
  };

  const filteredAuctions = auctions.filter((auction) => {
    const matchesSearch =
      auction.propertyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      auction.brokerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      auction.contactName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      filterStatus === "All" || auction.auctionStatus === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Proposed":
        return "bg-indigo-100 text-indigo-800";
      case "Open":
        return "bg-green-100 text-green-800";
      case "Under Auction":
        return "bg-blue-100 text-blue-800";
      case "Sold":
        return "bg-purple-100 text-purple-800";
      case "Lost":
        return "bg-red-100 text-red-800";
      case "No Longer Available":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-stone-100 text-stone-800";
    }
  };

  const getProposedColor = (proposed: string) => {
    switch (proposed) {
      case "sent":
        return "bg-blue-100 text-blue-800";
      case "won":
        return "bg-green-100 text-green-800";
      case "lost":
        return "bg-red-100 text-red-800";
      default:
        return "bg-stone-100 text-stone-800";
    }
  };

  const getPaymentColor = (status: string) => {
    return status === "Paid"
      ? "bg-green-100 text-green-800"
      : "bg-red-100 text-red-800";
  };

  const handleAddAuction = async () => {
    if (!selectedSystemPropertyId) {
      alert("Please search and select a property from the system.");
      return;
    }
    if (!newAuction.contactName) {
      alert("Please fill in contact name");
      return;
    }

    try {
      const created = await customRecordService.createCustomRecord({
        entityType: 'auction',
        name: newAuction.propertyName,
        status: newAuction.auctionStatus,
        category: newAuction.industryCategory,
        referenceId: selectedSystemPropertyId,
        payload: {
          ...newAuction,
          paymentStatus: 'Unpaid',
          createdDate: new Date().toISOString().split('T')[0],
          selectedSystemPropertyId,
        },
      });
      setAuctions((prev) => [toAuction(created), ...prev]);
      setShowAddModal(false);
      resetAddAuctionForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save auction');
    }
  };

  const handleMarkAsPaid = async () => {
    if (selectedAuctionId) {
      try {
        const target = auctions.find((auction) => auction.id === selectedAuctionId);
        if (!target) return;
        await customRecordService.updateCustomRecord(target.id, {
          name: target.propertyName,
          status: target.auctionStatus,
          category: target.industryCategory,
          referenceId: selectedSystemPropertyId || undefined,
          payload: {
            ...target,
            paymentStatus: 'Paid',
          },
        });
        setAuctions((prev) =>
          prev.map((auction) =>
            auction.id === selectedAuctionId
              ? { ...auction, paymentStatus: 'Paid' as const }
              : auction
          )
        );
        setShowPaymentModal(false);
        setSelectedAuctionId(null);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Failed to update payment status');
      }
    }
  };

  const handleDeleteAuction = async (id: string) => {
    if (!confirm("Are you sure you want to delete this auction item?")) return;
    try {
      await customRecordService.deleteCustomRecord(id);
      setAuctions(auctions.filter((auction) => auction.id !== id));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete auction');
    }
  };

  const handleOpenEditModal = (auction: AuctionItem) => {
    setEditingAuction(auction);
    setShowEditModal(true);
  };

  const handleUpdateAuction = async () => {
    if (!editingAuction) return;
    if (!editingAuction.propertyName || !editingAuction.contactName) {
      alert("Please fill in property name and contact name");
      return;
    }

    try {
      await customRecordService.updateCustomRecord(editingAuction.id, {
        name: editingAuction.propertyName,
        status: editingAuction.auctionStatus,
        category: editingAuction.industryCategory,
        referenceId: selectedSystemPropertyId || undefined,
        payload: {
          ...editingAuction,
          selectedSystemPropertyId,
        },
      });
      setAuctions(
        auctions.map((auction) =>
          auction.id === editingAuction.id ? editingAuction : auction
        )
      );
      setShowEditModal(false);
      setEditingAuction(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update auction');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Auctions</h2>
          <p className="text-stone-600 text-sm mt-1">
            Manage property auction listings and track bids
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddModal(true);
            resetAddAuctionForm();
          }}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FiPlus size={18} />
          Add Auction
        </button>
      </div>

      {/* Add Auction Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-4">
                Add New Auction
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Property Name *
                  </label>
                  <input
                    type="text"
                    value={propertySearchQuery}
                    onChange={(e) => {
                      setPropertySearchQuery(e.target.value);
                      setSelectedSystemPropertyId("");
                      setNewAuction((prev) => ({ ...prev, propertyName: "" }));
                    }}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Search property in system by address, city, type..."
                  />
                  <div className="mt-2 border border-stone-200 rounded-lg max-h-44 overflow-y-auto bg-white">
                    {isLoadingProperties && (
                      <p className="px-3 py-2 text-sm text-stone-500">Loading properties...</p>
                    )}
                    {!isLoadingProperties && propertyLoadError && (
                      <p className="px-3 py-2 text-sm text-red-600">{propertyLoadError}</p>
                    )}
                    {!isLoadingProperties && !propertyLoadError && filteredSystemProperties.length === 0 && (
                      <p className="px-3 py-2 text-sm text-stone-500">No matching properties found.</p>
                    )}
                    {!isLoadingProperties && !propertyLoadError && filteredSystemProperties.map((property) => (
                      <button
                        key={property.id}
                        type="button"
                        onClick={() => selectSystemProperty(property)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors border-b last:border-b-0 border-stone-100 ${
                          selectedSystemPropertyId === property.id
                            ? "bg-violet-50 text-violet-700"
                            : "hover:bg-stone-50 text-stone-700"
                        }`}
                      >
                        <div className="font-medium">{getPropertyLabel(property)}</div>
                        <div className="text-xs text-stone-500">
                          Type: {property.type || "N/A"}{property.assignedBrokerName ? ` | Broker: ${property.assignedBrokerName}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                  {selectedSystemProperty && (
                    <p className="mt-2 text-xs text-green-700">
                      Selected property: <span className="font-semibold">{getPropertyLabel(selectedSystemProperty)}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Contact Name *
                  </label>
                  <input
                    type="text"
                    value={newAuction.contactName}
                    onChange={(e) =>
                      setNewAuction({
                        ...newAuction,
                        contactName: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Contact name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Industry Category
                  </label>
                  <select
                    value={newAuction.industryCategory}
                    onChange={(e) =>
                      setNewAuction({
                        ...newAuction,
                        industryCategory: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Commercial</option>
                    <option>Residential</option>
                    <option>Industrial</option>
                    <option>Retail</option>
                    <option>Mixed Use</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={newAuction.location}
                    onChange={(e) =>
                      setNewAuction({ ...newAuction, location: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="City, Province"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Mandate Price
                  </label>
                  <input
                    type="number"
                    value={newAuction.mandatePrice}
                    onChange={(e) =>
                      setNewAuction({
                        ...newAuction,
                        mandatePrice: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Price"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Proposed
                  </label>
                  <select
                    value={newAuction.proposed}
                    onChange={(e) =>
                      setNewAuction({
                        ...newAuction,
                        proposed: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="sent">Sent</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Auction House
                  </label>
                  <select
                    value={newAuction.auctionHouse}
                    onChange={(e) =>
                      setNewAuction({
                        ...newAuction,
                        auctionHouse: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="Broll">Broll</option>
                    <option value="Auction Ink">Auction Ink</option>
                    <option value="High Street">High Street</option>
                    <option value="Aucor">Aucor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Auction Date
                  </label>
                  <input
                    type="date"
                    value={newAuction.auctionDate}
                    onChange={(e) =>
                      setNewAuction({
                        ...newAuction,
                        auctionDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Broker Name
                  </label>
                  <input
                    type="text"
                    value={newAuction.brokerName}
                    onChange={(e) =>
                      setNewAuction({
                        ...newAuction,
                        brokerName: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Broker name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Auction Status
                  </label>
                  <select
                    value={newAuction.auctionStatus}
                    onChange={(e) =>
                      setNewAuction({
                        ...newAuction,
                        auctionStatus: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="Proposed">Proposed</option>
                    <option value="Open">Open</option>
                    <option value="Under Auction">Under Auction</option>
                    <option value="Sold">Sold</option>
                    <option value="Lost">Lost</option>
                    <option value="No Longer Available">
                      No Longer Available
                    </option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6 justify-end">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetAddAuctionForm();
                  }}
                  className="px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAuction}
                  className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  Add Auction
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedAuctionId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-4">
                Track Payment Status
              </h3>
              <p className="text-stone-600 mb-6">
                Mark this auction item as paid?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowPaymentModal(false);
                    setSelectedAuctionId(null);
                  }}
                  className="px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkAsPaid}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
                >
                  <FiCheck size={16} />
                  Mark as Paid
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingAuction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-4">
                Edit Auction
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Property Name *
                  </label>
                  <input
                    type="text"
                    value={editingAuction.propertyName}
                    onChange={(e) =>
                      setEditingAuction({
                        ...editingAuction,
                        propertyName: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Property name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Contact Name *
                  </label>
                  <input
                    type="text"
                    value={editingAuction.contactName}
                    onChange={(e) =>
                      setEditingAuction({
                        ...editingAuction,
                        contactName: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Contact name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Industry Category
                  </label>
                  <select
                    value={editingAuction.industryCategory}
                    onChange={(e) =>
                      setEditingAuction({
                        ...editingAuction,
                        industryCategory: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Commercial</option>
                    <option>Residential</option>
                    <option>Industrial</option>
                    <option>Retail</option>
                    <option>Mixed Use</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={editingAuction.location}
                    onChange={(e) =>
                      setEditingAuction({ ...editingAuction, location: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="City, Province"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Mandate Price
                  </label>
                  <input
                    type="number"
                    value={editingAuction.mandatePrice}
                    onChange={(e) =>
                      setEditingAuction({
                        ...editingAuction,
                        mandatePrice: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Price"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Proposed
                  </label>
                  <select
                    value={editingAuction.proposed}
                    onChange={(e) =>
                      setEditingAuction({
                        ...editingAuction,
                        proposed: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="sent">Sent</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Auction House
                  </label>
                  <select
                    value={editingAuction.auctionHouse}
                    onChange={(e) =>
                      setEditingAuction({
                        ...editingAuction,
                        auctionHouse: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="Broll">Broll</option>
                    <option value="Auction Ink">Auction Ink</option>
                    <option value="High Street">High Street</option>
                    <option value="Aucor">Aucor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Auction Date
                  </label>
                  <input
                    type="date"
                    value={editingAuction.auctionDate}
                    onChange={(e) =>
                      setEditingAuction({
                        ...editingAuction,
                        auctionDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Broker Name
                  </label>
                  <input
                    type="text"
                    value={editingAuction.brokerName}
                    onChange={(e) =>
                      setEditingAuction({
                        ...editingAuction,
                        brokerName: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Broker name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Auction Status
                  </label>
                  <select
                    value={editingAuction.auctionStatus}
                    onChange={(e) =>
                      setEditingAuction({
                        ...editingAuction,
                        auctionStatus: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="Proposed">Proposed</option>
                    <option value="Open">Open</option>
                    <option value="Under Auction">Under Auction</option>
                    <option value="Sold">Sold</option>
                    <option value="Lost">Lost</option>
                    <option value="No Longer Available">No Longer Available</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6 justify-end">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingAuction(null);
                  }}
                  className="px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateAuction}
                  className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  Update Auction
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-64">
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Search by property, broker, or contact
            </label>
            <div className="relative">
              <FiSearch className="absolute left-3 top-3 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search auctions..."
                className="w-full pl-10 pr-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Filter by Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="All">All Statuses</option>
              <option value="Proposed">Proposed</option>
              <option value="Open">Open</option>
              <option value="Under Auction">Under Auction</option>
              <option value="Sold">Sold</option>
              <option value="Lost">Lost</option>
              <option value="No Longer Available">No Longer Available</option>
            </select>
          </div>
        </div>
      </div>

      {/* Auctions Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Property Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Contact Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Mandate Price
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Proposed
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Auction House
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Auction Date
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Broker
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Payment
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {filteredAuctions.map((auction) => (
                <tr
                  key={auction.id}
                  className="hover:bg-stone-50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-stone-900">
                    <span className="font-medium">{auction.propertyName}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600">
                    {auction.contactName}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      {auction.industryCategory}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600">
                    {auction.location}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-stone-900">
                    R {auction.mandatePrice.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getProposedColor(
                        auction.proposed
                      )}`}
                    >
                      {auction.proposed}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600">
                    {auction.auctionHouse}
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600">
                    {new Date(auction.auctionDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600">
                    {auction.brokerName}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <select
                      value={auction.auctionStatus}
                      onChange={(e) => {
                        const newStatus = e.target.value;
                        setAuctions(prev => prev.map(a => a.id === auction.id ? { ...a, auctionStatus: newStatus } : a));
                        // emit status change for Forecast syncing
                        emit('dealStatusChanged', {
                          id: auction.id,
                          broker: auction.brokerName,
                          dealName: auction.propertyName,
                          type: 'Auction',
                          status: newStatus,
                        });
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(auction.auctionStatus)}`}
                    >
                      <option value="Proposed">Proposed</option>
                      <option value="Open">Open</option>
                      <option value="Under Auction">Under Auction</option>
                      <option value="Sold">Sold</option>
                      <option value="Lost">Lost</option>
                      <option value="No Longer Available">No Longer Available</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getPaymentColor(
                        auction.paymentStatus
                      )}`}
                    >
                      {auction.paymentStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenEditModal(auction)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Edit"
                      >
                        <FiEdit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteAuction(auction.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Delete"
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty State */}
      {filteredAuctions.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-stone-600">No auctions found. Try adjusting your filters.</p>
        </div>
      )}
    </div>
  );
};
