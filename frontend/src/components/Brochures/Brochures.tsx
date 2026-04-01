import React, { useEffect, useState } from "react";
import { FiPlus, FiX, FiMapPin, FiHome, FiLink, FiEdit2 } from "react-icons/fi";
import { useAuth } from "@/context/AuthContext";
import { brokerService } from "@/services/brokerService";
import { brochureService, type BrochureRecord } from "@/services/brochureService";
import { BrochureTable } from "@/components/Brochures/BrochureTable";

interface BrochureData {
  id: string;
  createdBy: string;
  assignee: string;
  date: string;
  priority: string;
  emailTo: string;
  brochureName: string;
  brokerName: string;
  propertyType: string;
  transactionType: string;
  area: string;
  address: string;
  googleLink: string;
  glaLandSize: string;
  zoning: string;
  ratePerM2: string;
  askingPrice: string;
  yield: string;
  amenities: string;
  tenantedVacant: string;
  propertyDescription: string;
  photoLinkOnedrive: string;
  supportingDocs: string;
  whatRequired: string;
  brochureLink: string;
  commentChanges: string;
  postLink: string;
}

type BrochurePayload = Omit<BrochureData, 'id'>;

const initialFormData: Omit<BrochureData, "id"> = {
  createdBy: "",
  assignee: "",
  date: new Date().toISOString().split("T")[0],
  priority: "Medium",
  emailTo: "",
  brochureName: "",
  brokerName: "",
  propertyType: "",
  transactionType: "",
  area: "",
  address: "",
  googleLink: "",
  glaLandSize: "",
  zoning: "",
  ratePerM2: "",
  askingPrice: "",
  yield: "",
  amenities: "",
  tenantedVacant: "",
  propertyDescription: "",
  photoLinkOnedrive: "",
  supportingDocs: "",
  whatRequired: "",
  brochureLink: "",
  commentChanges: "",
  postLink: "",
};

const toBrochureData = (record: BrochureRecord<Record<string, unknown>>): BrochureData => {
  const payload = (record.payload || {}) as Partial<BrochurePayload>;
  return {
    id: record.id,
    createdBy: String(payload.createdBy || ''),
    assignee: String(payload.assignee || ''),
    date: String(payload.date || new Date(record.createdAt).toISOString().split('T')[0]),
    priority: String(record.status || payload.priority || 'Medium'),
    emailTo: String(payload.emailTo || ''),
    brochureName: String(record.name || payload.brochureName || ''),
    brokerName: String(payload.brokerName || ''),
    propertyType: String(record.category || payload.propertyType || ''),
    transactionType: String(payload.transactionType || ''),
    area: String(payload.area || ''),
    address: String(payload.address || ''),
    googleLink: String(payload.googleLink || ''),
    glaLandSize: String(payload.glaLandSize || ''),
    zoning: String(payload.zoning || ''),
    ratePerM2: String(payload.ratePerM2 || ''),
    askingPrice: String(payload.askingPrice || ''),
    yield: String(payload.yield || ''),
    amenities: String(payload.amenities || ''),
    tenantedVacant: String(payload.tenantedVacant || ''),
    propertyDescription: String(payload.propertyDescription || ''),
    photoLinkOnedrive: String(payload.photoLinkOnedrive || ''),
    supportingDocs: String(payload.supportingDocs || ''),
    whatRequired: String(payload.whatRequired || ''),
    brochureLink: String(payload.brochureLink || ''),
    commentChanges: String(payload.commentChanges || ''),
    postLink: String(payload.postLink || ''),
  };
};

export const Brochures: React.FC = () => {
  const { user } = useAuth();
  const [brochures, setBrochures] = useState<BrochureData[]>([]);
  const [brokers, setBrokers] = useState<Array<{ id: string; name: string; company?: string }>>([]);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState<Omit<BrochureData, "id">>({
    ...initialFormData,
    createdBy: user?.name || "",
  });
  const [editingBrochureId, setEditingBrochureId] = useState<string | null>(null);
  const [deletingBrochureId, setDeletingBrochureId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "warning" | "error";
    message: string;
  } | null>(null);

  const canDelete = user?.role === "admin" || user?.role === "manager";

  const getEmptyFormData = (): Omit<BrochureData, "id"> => ({
    ...initialFormData,
    createdBy: user?.name || "",
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingBrochureId(null);
    setFormData(getEmptyFormData());
  };

  const openCreateForm = () => {
    setFeedback(null);
    setEditingBrochureId(null);
    setFormData(getEmptyFormData());
    setShowForm(true);
  };

  const refreshBrochures = async () => {
    try {
      setIsLoading(true);
      const result = await brochureService.getAllBrochures<Record<string, unknown>>({
        limit: 1000,
      });
      setBrochures(result.data.map(toBrochureData));
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to refresh brochures",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setIsLoading(true);
        const [brochureResult, brokerResult] = await Promise.all([
          brochureService.getAllBrochures<Record<string, unknown>>({
            limit: 1000,
          }),
          brokerService.getAllBrokers().catch(() => []),
        ]);

        if (!mounted) return;
        setBrochures(brochureResult.data.map(toBrochureData));
        setBrokers(brokerResult);
        setFeedback(null);
      } catch (error) {
        if (!mounted) return;
        setBrochures([]);
        setBrokers([]);
        const errorMsg = error instanceof Error ? error.message : "Failed to load brochures";
        setFeedback({
          type: "error",
          message: errorMsg,
        });
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const getBrokerByName = (name: string) => {
    if (!name) return null;
    return brokers.find((broker) => {
      const brokerName = `${broker.name || ''}`.trim().toLowerCase();
      const companyName = `${broker.company || ''}`.trim().toLowerCase();
      const query = name.toLowerCase();
      return brokerName === query || companyName === query;
    });
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddBrochure = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const requiredFields = [
      "createdBy",
      "assignee",
      "brochureName",
      "brokerName",
      "propertyType",
      "address",
      "emailTo",
    ];
    const isValid = requiredFields.every((field) => formData[field as keyof typeof formData]);

    if (!isValid) {
      setFeedback({
        type: "error",
        message: "Please fill in all required fields (marked with *).",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.emailTo)) {
      setFeedback({
        type: "error",
        message: "Please enter a valid email address.",
      });
      return;
    }

    try {
      const payload = { ...formData };
      const isEditing = Boolean(editingBrochureId);
      let savedBrochure: BrochureRecord<Record<string, unknown>>;

      if (isEditing && editingBrochureId) {
        savedBrochure = await brochureService.updateBrochure(editingBrochureId, {
          name: formData.brochureName,
          status: formData.priority,
          category: formData.propertyType,
          referenceId: formData.emailTo,
          payload,
        });
      } else {
        savedBrochure = await brochureService.createBrochure({
          name: formData.brochureName,
          status: formData.priority,
          category: formData.propertyType,
          referenceId: formData.emailTo,
          payload,
        });
      }

      await refreshBrochures();
      closeForm();

      try {
        await brochureService.sendBrochureEmail(savedBrochure.id);
        setFeedback({
          type: "success",
          message: isEditing
            ? "Brochure updated and email sent."
            : "Brochure saved and email sent.",
        });
      } catch (emailError) {
        const emailMessage =
          emailError instanceof Error ? emailError.message : "Email delivery failed.";
        setFeedback({
          type: "warning",
          message: isEditing
            ? `Brochure updated, but email failed: ${emailMessage}`
            : `Brochure saved, but email failed: ${emailMessage}`,
        });
      }
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to save brochure.",
      });
    }
  };

  const handleEditBrochure = (id: string) => {
    const brochure = brochures.find((item) => item.id === id);
    if (!brochure) {
      setFeedback({
        type: "error",
        message: "Brochure not found.",
      });
      return;
    }

    setFeedback(null);
    setEditingBrochureId(id);
    setFormData({
      createdBy: brochure.createdBy || user?.name || "",
      assignee: brochure.assignee,
      date: brochure.date,
      priority: brochure.priority,
      emailTo: brochure.emailTo,
      brochureName: brochure.brochureName,
      brokerName: brochure.brokerName,
      propertyType: brochure.propertyType,
      transactionType: brochure.transactionType,
      area: brochure.area,
      address: brochure.address,
      googleLink: brochure.googleLink,
      glaLandSize: brochure.glaLandSize,
      zoning: brochure.zoning,
      ratePerM2: brochure.ratePerM2,
      askingPrice: brochure.askingPrice,
      yield: brochure.yield,
      amenities: brochure.amenities,
      tenantedVacant: brochure.tenantedVacant,
      propertyDescription: brochure.propertyDescription,
      photoLinkOnedrive: brochure.photoLinkOnedrive,
      supportingDocs: brochure.supportingDocs,
      whatRequired: brochure.whatRequired,
      brochureLink: brochure.brochureLink,
      commentChanges: brochure.commentChanges,
      postLink: brochure.postLink,
    });
    setShowForm(true);
  };

  const handleDeleteBrochure = async (id: string) => {
    if (!canDelete) return;
    const confirmed = window.confirm("Are you sure you want to delete this brochure?");
    if (!confirmed) return;

    setFeedback(null);
    setDeletingBrochureId(id);
    try {
      await brochureService.deleteBrochure(id);
      await refreshBrochures();
      setFeedback({
        type: "success",
        message: "Brochure deleted successfully.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to delete brochure.",
      });
    } finally {
      setDeletingBrochureId(null);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-red-50 border-red-200";
      case "Medium":
        return "bg-amber-50 border-amber-200";
      case "Low":
        return "bg-emerald-50 border-emerald-200";
      default:
        return "bg-stone-50 border-stone-200";
    }
  };

  const getPriorityBadgeColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-red-100 text-red-800";
      case "Medium":
        return "bg-amber-100 text-amber-800";
      case "Low":
        return "bg-emerald-100 text-emerald-800";
      default:
        return "bg-stone-100 text-stone-800";
    }
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-stone-50 via-stone-50 to-violet-50">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-8 border-b border-stone-200 bg-white sticky top-0 z-40 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold text-stone-950 mb-2">Brochures</h1>
              <p className="text-stone-600">Manage and track property brochures</p>
            </div>
            <button
              onClick={() => (showForm ? closeForm() : openCreateForm())}
              disabled={isLoading}
              className="flex items-center gap-2 bg-gradient-to-r from-violet-500 to-violet-600 text-white px-6 py-3 rounded-lg hover:from-violet-600 hover:to-violet-700 transition shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiPlus size={20} /> Add Brochure
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-6">
            {/* Feedback Messages */}
            {feedback && (
              <div
                className={`mb-6 rounded-lg border px-6 py-4 text-sm font-medium flex items-start justify-between ${
                  feedback.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : feedback.type === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}
              >
                <span>{feedback.message}</span>
                {feedback.type === "error" && (
                  <button
                    onClick={() => refreshBrochures()}
                    disabled={isLoading}
                    className="ml-4 px-3 py-1 bg-red-200 hover:bg-red-300 text-red-800 font-semibold rounded disabled:opacity-50 transition whitespace-nowrap"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mb-4"></div>
                <p className="text-stone-600 font-medium">Loading brochures...</p>
              </div>
            )}

            {/* Add Form */}
            {showForm && !isLoading && (
              <div className="mb-8 border-2 border-violet-200 rounded-2xl p-8 bg-white shadow-xl">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-stone-950">{editingBrochureId ? "Edit Brochure" : "New Brochure"}</h2>
                    <p className="text-stone-600 mt-1">Fill in the details below</p>
                  </div>
                  <button
                    onClick={closeForm}
                    className="text-stone-500 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 p-2 rounded-lg transition"
                  >
                    <FiX size={24} />
                  </button>
                </div>

                <form onSubmit={handleAddBrochure}>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
              {/* Section: Core Information */}
              <div className="lg:col-span-3">
                <h3 className="text-lg font-semibold text-stone-900 mb-4 pb-2 border-b-2 border-violet-200">Core Information</h3>
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Send to Email *
                </label>
                <input
                  type="email"
                  name="emailTo"
                  value={formData.emailTo}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  required
                  placeholder="recipient@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Created By *
                </label>
                <input
                  type="text"
                  name="createdBy"
                  value={formData.createdBy}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  required
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Assignee *
                </label>
                <input
                  type="text"
                  name="assignee"
                  value={formData.assignee}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  required
                  placeholder="Team member name"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Priority
                </label>
                <select
                  name="priority"
                  value={formData.priority}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition bg-white"
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Brochure Name *
                </label>
                <input
                  type="text"
                  name="brochureName"
                  value={formData.brochureName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  required
                  placeholder="e.g., Downtown Commercial Complex"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Broker Name *
                </label>
                <div className="flex gap-4 items-start">
                  <div className="flex-1">
                    <input
                      type="text"
                      name="brokerName"
                      value={formData.brokerName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                      required
                      placeholder="e.g., Sarah Thompson or Michael Chen"
                    />
                  </div>
                  {formData.brokerName && getBrokerByName(formData.brokerName) && (
                    <div className="flex flex-col items-center justify-center mt-1">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
                        {String(getBrokerByName(formData.brokerName)?.name || formData.brokerName)
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <p className="text-xs text-stone-600 mt-2 text-center font-medium">
                        {getBrokerByName(formData.brokerName)?.company ||
                          getBrokerByName(formData.brokerName)?.name}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Property Type *
                </label>
                <input
                  type="text"
                  name="propertyType"
                  value={formData.propertyType}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  required
                  placeholder="e.g., Office, Retail, Industrial"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Transaction Type
                </label>
                <input
                  type="text"
                  name="transactionType"
                  value={formData.transactionType}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  placeholder="e.g., Sale, Lease, Investment"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Area
                </label>
                <input
                  type="text"
                  name="area"
                  value={formData.area}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  placeholder="Geographic area"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Address *
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  required
                  placeholder="Street address"
                />
              </div>

              {/* Section: Property Details */}
              <div className="lg:col-span-3">
                <h3 className="text-lg font-semibold text-stone-900 mb-4 pb-2 border-b-2 border-violet-200 mt-4">Property Details</h3>
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Google Link Location
                </label>
                <input
                  type="url"
                  name="googleLink"
                  value={formData.googleLink}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  placeholder="https://maps.google.com"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  GLA/Land Size (m²)
                </label>
                <input
                  type="text"
                  name="glaLandSize"
                  value={formData.glaLandSize}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  placeholder="e.g., 5000"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Zoning
                </label>
                <input
                  type="text"
                  name="zoning"
                  value={formData.zoning}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  placeholder="e.g., Commercial, Residential"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Rate p/m²
                </label>
                <input
                  type="text"
                  name="ratePerM2"
                  value={formData.ratePerM2}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  placeholder="e.g., R100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Asking Price
                </label>
                <input
                  type="text"
                  name="askingPrice"
                  value={formData.askingPrice}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  placeholder="e.g., R5,000,000"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Yield
                </label>
                <input
                  type="text"
                  name="yield"
                  value={formData.yield}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  placeholder="e.g., 8.5%"
                />
              </div>

              {/* Section: Additional Information */}
              <div className="lg:col-span-3">
                <h3 className="text-lg font-semibold text-stone-900 mb-4 pb-2 border-b-2 border-violet-200 mt-4">Additional Information</h3>
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Tenanted/Vacant
                </label>
                <select
                  name="tenantedVacant"
                  value={formData.tenantedVacant}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition bg-white"
                >
                  <option value="">Select status...</option>
                  <option value="Tenanted">Tenanted</option>
                  <option value="Vacant">Vacant</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Amenities
                </label>
                <textarea
                  name="amenities"
                  value={formData.amenities}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  rows={2}
                  placeholder="List key amenities"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Property Description
                </label>
                <textarea
                  name="propertyDescription"
                  value={formData.propertyDescription}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  rows={3}
                  placeholder="Detailed description of the property"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Photo Link (OneDrive)
                </label>
                <input
                  type="url"
                  name="photoLinkOnedrive"
                  value={formData.photoLinkOnedrive}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Supporting Docs
                </label>
                <input
                  type="url"
                  name="supportingDocs"
                  value={formData.supportingDocs}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Brochure Link
                </label>
                <input
                  type="url"
                  name="brochureLink"
                  value={formData.brochureLink}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Post Link
                </label>
                <input
                  type="url"
                  name="postLink"
                  value={formData.postLink}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  placeholder="https://..."
                />
              </div>

              <div className="lg:col-span-3">
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  What Do You Require?
                </label>
                <textarea
                  name="whatRequired"
                  value={formData.whatRequired}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  rows={2}
                  placeholder="Describe what you require for this brochure"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="block text-sm font-semibold text-stone-800 mb-2">
                  Comments/Changes
                </label>
                <textarea
                  name="commentChanges"
                  value={formData.commentChanges}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:border-violet-500 focus:outline-none transition"
                  rows={2}
                  placeholder="Add any comments or notes"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-6 border-t-2 border-stone-200">
              <button
                type="submit"
                className="flex-1 bg-gradient-to-r from-violet-500 to-violet-600 text-white px-6 py-3 rounded-lg hover:from-violet-600 hover:to-violet-700 transition shadow-lg transform hover:scale-105 font-semibold"
              >
                Save & Send to Email
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 bg-stone-200 text-stone-900 px-6 py-3 rounded-lg hover:bg-stone-300 transition font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
            )}

            {/* Table View */}
            {!isLoading && brochures.length > 0 && (
              <div className="mb-8 rounded-2xl border-2 border-stone-200 bg-white shadow-lg overflow-hidden">
                <BrochureTable
                  brochures={brochures.map((brochure) => ({
                    id: brochure.id,
                    brochureName: brochure.brochureName,
                    brokerName: brochure.brokerName,
                    date: brochure.date,
                    propertyType: brochure.propertyType,
                    priority: brochure.priority,
                    createdBy: brochure.createdBy,
                    assignee: brochure.assignee,
                    address: brochure.address,
                    emailTo: brochure.emailTo,
                  }))}
                  canDelete={canDelete}
                  deletingId={deletingBrochureId}
                  onEdit={handleEditBrochure}
                  onDelete={(id) => {
                    void handleDeleteBrochure(id);
                  }}
                />
              </div>
            )}

            {/* Empty State */}
            {!isLoading && brochures.length === 0 && (!feedback || feedback.type !== "error") && (
              <div className="text-center py-24">
                <FiHome size={80} className="mx-auto text-stone-200 mb-6" />
                <h3 className="text-3xl font-bold text-stone-700 mb-3">No Brochures Yet</h3>
                <p className="text-stone-600 mb-8 text-lg">Start by adding your first brochure to track properties</p>
                <button
                  onClick={openCreateForm}
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-500 to-violet-600 text-white px-8 py-3 rounded-lg hover:from-violet-600 hover:to-violet-700 transition shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <FiPlus size={22} /> Create First Brochure
                </button>
              </div>
            )}


          </div>
        </div>
      </div>
    </div>
  );
};
