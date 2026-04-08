// @ts-nocheck
'use client';

import React, { useEffect, useMemo, useState } from "react";
import { Lead } from "../../data/leasing";
import { FiEdit2, FiTrash2, FiPlus, FiSearch, FiLink } from "react-icons/fi";
import { useAuth } from "@/context/AuthContext";
import { contactService } from "@/services/contactService";
import { leadService } from "@/services/leadService";
import { propertyService } from "@/services/propertyService";
import {
  mapStockRecordToLeasingStock,
  stockService,
} from "@/services/stockService";
import { brokerService } from "@/services/brokerService";
import { userService } from "@/services/userService";
import { calculateCommissionSplit } from "@/lib/dealSheetCalculations";
import { formatRand } from "@/lib/currency";
// Stock is now sourced from the API and no longer seeded from local fallback data.
const DEFAULT_COMMISSION_RATE = 0.05;

const toApiLeadStatus = (status: string) => {
  const value = String(status || "").trim().toLowerCase();
  if (value === "lost") return "Lost";
  if (value === "contacted") return "Contacted";
  if (value === "qualified") {
    return "Qualified";
  }
  if (value === "negotiating") return "Negotiating";
  if (value === "lease agreement") return "Lease Agreement";
  return "New";
};

const toDealStatus = (status: string) => {
  const value = String(status || "").trim().toLowerCase();
  if (value === "new" || value === "contacted") return "pending";
  return "active";
};

const normalizePhone = (phone?: string) => {
  const digitsOnly = String(phone || "").replace(/[^\d]/g, "");
  return digitsOnly.length >= 10 ? digitsOnly : "0000000000";
};

const toLeasingStatus = (status: string) => {
  const value = String(status || "").trim().toLowerCase();
  if (value === "contacted") return "Contacted";
  if (value === "qualified") return "Qualified";
  if (value === "negotiating") return "Negotiating";
  if (value === "lost") return "Lost";
  if (value === "lease agreement") return "Lease Agreement";
  return "New";
};

const toLeasingContact = (contact: any): Contact => ({
  firstName: contact.firstName || String(contact.name || "").split(" ")[0] || "",
  lastName: contact.lastName || String(contact.name || "").split(" ").slice(1).join(" ") || "",
  email: contact.email || "",
  phone: contact.phone || "",
  company: contact.company || "",
  position: contact.position || "",
  type: contact.type || "Broker",
  linkedProperties: Array.isArray(contact.linkedPropertyIds) ? contact.linkedPropertyIds : [],
  linkedDeals: Array.isArray(contact.linkedDealIds) ? contact.linkedDealIds : [],
  status: contact.status || "Active",
  createdDate: contact.createdAt
    ? new Date(contact.createdAt).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0],
  notes: contact.notes || "",
  id: contact.id,
});

const toLeasingLead = (lead: any): Lead => ({
  id: lead.id,
  name: lead.name || "",
  email: lead.email || "",
  phone: lead.phone || "",
  company: lead.company || "",
  propertyInterest: lead.propertyAddress || lead.propertyId || "",
  leadSource: lead.leadSource || "Direct",
  status: toLeasingStatus(lead.status || "New"),
  value: Number(lead.value || 0),
  createdDate: lead.createdAt
    ? new Date(lead.createdAt).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0],
  lastContactDate: lead.updatedAt
    ? new Date(lead.updatedAt).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0],
  notes: lead.comment || lead.notes || "",
  comment: lead.comment || lead.notes || "",
  backendLeadId: lead.id,
  backendDealId: lead.dealId || "",
  forecastDealId: lead.forecastDealId || "",
  linkedPropertyId: lead.propertyId || "",
  linkedStock: lead.linkedStockId || "",
  contactId: lead.contactId || "",
  leadType: lead.leadType || "Leasing",
  propertyAddress: lead.propertyAddress || "",
  additionalBroker: lead.additionalBroker || "",
  commissionSplit: lead.commissionSplit || { primaryBroker: 100, additionalBroker: 0 },
  legalDocumentId: lead.legalDocumentId || "",
});

export const Leads: React.FC = () => {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [stocks, setStocks] = useState<any[]>([]);
  const [isSyncingDeal, setIsSyncingDeal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStockLinkModal, setShowStockLinkModal] = useState(false);
  const [selectedLeadForStock, setSelectedLeadForStock] = useState<Lead | null>(null);
  const [brokers, setBrokers] = useState<any[]>([]);
  const [adminManagerUsers, setAdminManagerUsers] = useState<any[]>([]);
  const [selectedBrokerIdForStock, setSelectedBrokerIdForStock] = useState<string>("");
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [newLead, setNewLead] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    leadSource: "Direct",
    status: "New",
    value: 0,
    leadType: "Leasing" as "Leasing" | "Sales" | "Auction",
    contactId: "",
    propertyAddress: "",
    comment: "",
      additionalBroker: "",
      commissionSplit: {
        primaryBroker: 100,
        additionalBroker: 0,
      },
    });

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      const [leadResult, contactResult, stockResult, brokerResult, userResult] = await Promise.allSettled([
        leadService.getAllLeads({ limit: 1000 }),
        contactService.getAllContacts({ limit: 1000 }),
        stockService.getAllStockItems({ module: "leasing", limit: 1000 }),
        brokerService.getAllBrokers(),
        userService.getAllUsers(),
      ]);

      if (!mounted) return;

      if (leadResult.status === "fulfilled") {
        setLeads(leadResult.value.data.map((lead) => toLeasingLead(lead)));
      } else {
        console.warn("Failed to load leasing leads", leadResult.reason);
        setLeads([]);
      }

      if (contactResult.status === "fulfilled") {
        setContacts(contactResult.value.data.map((contact) => toLeasingContact(contact)));
      } else {
        console.warn("Failed to load leasing contacts", contactResult.reason);
        setContacts([]);
      }

      if (stockResult.status === "fulfilled") {
        setStocks(stockResult.value.data.map((item) => mapStockRecordToLeasingStock(item)));
      } else {
        console.warn("Failed to load leasing stock", stockResult.reason);
        setStocks([]);
      }

      if (brokerResult.status === "fulfilled") {
        setBrokers(brokerResult.value);
      } else {
        console.warn("Failed to load brokers", brokerResult.reason);
        setBrokers([]);
      }

      if (userResult.status === "fulfilled") {
        setAdminManagerUsers(
          userResult.value.filter((u) => u.role === "admin" || u.role === "manager")
        );
      } else {
        console.warn("Failed to load users", userResult.reason);
        setAdminManagerUsers([]);
      }
    };

    void loadData();
    return () => {
      mounted = false;
    };
  }, []);

  const selectableStocks = useMemo(() => {
    const normalized = stocks
      .map((stock) => ({
        id: String(stock.id || ""),
        propertyName: String(stock.itemName || stock.propertyName || "").trim(),
        address: String(stock.location || stock.address || "").trim(),
        propertyId: stock.propertyId ? String(stock.propertyId) : undefined,
        createdBy: stock.createdBy ? String(stock.createdBy) : undefined,
        assignedBrokerId: stock.assignedBrokerId ? String(stock.assignedBrokerId) : undefined,
        assignedBroker: stock.assignedBroker ? String(stock.assignedBroker) : undefined,
      }))
      .filter((stock) => stock.id && stock.propertyName);

    return normalized;
  }, [stocks]);

  const getLinkedStockLabel = (stockId?: string) => {
    if (!stockId) return "Not linked";
    const linkedStock = selectableStocks.find((stock) => stock.id === stockId);
    return linkedStock?.propertyName || "Linked stock";
  };

  const handleOpenStockLinkModal = (lead: Lead) => {
    if (selectableStocks.length === 0) {
      alert("No leasing stock is available yet. Please create stock first.");
      return;
    }

    setSelectedLeadForStock(lead);
    setShowStockLinkModal(true);
  };

  const resolveBrokerId = async (
    lead: Lead,
    stock?: {
      id: string;
      propertyName: string;
      address?: string;
      propertyId?: string;
      createdBy?: string;
      assignedBrokerId?: string;
      assignedBroker?: string;
    }
  ): Promise<string | undefined> => {
    if (user?.role === "broker") {
      const ownBrokerId = String(user.brokerId || "").trim();
      if (ownBrokerId) return ownBrokerId;
    }

    const typedBrokerName = String(lead.additionalBroker || "").trim().toLowerCase();

    const directBrokerId = String(
      stock?.assignedBrokerId || stock?.createdBy || ""
    ).trim();
    if (directBrokerId) {
      return directBrokerId;
    }

    let brokers: Awaited<ReturnType<typeof brokerService.getAllBrokers>> = [];
    try {
      brokers = await brokerService.getAllBrokers();
    } catch {
      brokers = [];
    }

    if (typedBrokerName) {
      const byExactName = brokers.find(
        (broker) => String(broker.name || "").trim().toLowerCase() === typedBrokerName
      );
      if (byExactName?.id) return byExactName.id;
    }

    const stockBrokerName = String(stock?.assignedBroker || "").trim().toLowerCase();
    if (stockBrokerName) {
      const byStockBrokerName = brokers.find(
        (broker) =>
          String(broker.name || "").trim().toLowerCase() === stockBrokerName ||
          String(broker.email || "").trim().toLowerCase() === stockBrokerName
      );
      if (byStockBrokerName?.id) return byStockBrokerName.id;
    }

    if (user?.email) {
      const byUserEmail = brokers.find(
        (broker) =>
          String(broker.email || "").trim().toLowerCase() === user.email.trim().toLowerCase()
      );
      if (byUserEmail?.id) return byUserEmail.id;
    }

    if (stock?.propertyId) {
      try {
        const property = await propertyService.getPropertyById(stock.propertyId);
        const propertyBrokerId = String(
          property.assignedBrokerId || property.brokerId || ""
        ).trim();
        if (propertyBrokerId) {
          return propertyBrokerId;
        }
      } catch {
        // Backend workflow can still attempt resolution from stock/property context.
      }
    }

    return undefined;
  };

  const resolvePropertyIdForStock = async (
    lead: Lead,
    stock: { id: string; propertyName: string; address?: string; propertyId?: string }
  ): Promise<string> => {
    if (stock.propertyId) {
      try {
        const existing = await propertyService.getPropertyById(stock.propertyId);
        if (existing?.id) {
          return existing.id;
        }
      } catch {
        // Fallback below.
      }
    }

    return "";
  };

  const syncLinkedDeal = async (
    lead: Lead,
    stock: {
      id: string;
      propertyName: string;
      address?: string;
      propertyId?: string;
      createdBy?: string;
      assignedBrokerId?: string;
      assignedBroker?: string;
    },
    status: string,
    overrideBrokerId?: string
  ) => {
    const brokerId = overrideBrokerId || await resolveBrokerId(lead, stock);
    const propertyId = await resolvePropertyIdForStock(lead, stock);
    const leadStatus = toApiLeadStatus(status);
    const dealStatus = toDealStatus(status);
    const value = Math.max(1, Number(lead.value || 0));
    const expectedValue = Math.max(0, Number(lead.value || 0));
    const grossCommission = Math.round(expectedValue * DEFAULT_COMMISSION_RATE);
    const split = calculateCommissionSplit(grossCommission);
    const dealTitle = `${lead.name} - ${stock.propertyName}`;

    let backendLeadId = String(lead.backendLeadId || "").trim();
    if (!backendLeadId) {
      const createdLead = await leadService.createLead({
        name: lead.name,
        email: lead.email,
        phone: normalizePhone(lead.phone),
        status: leadStatus,
        brokerId: brokerId || undefined,
        propertyId: propertyId || undefined,
        value: value > 0 ? value : undefined,
        linkedStockId: stock.id,
        company: lead.company,
        leadSource: lead.leadSource,
        notes: lead.notes,
        comment: lead.comment || lead.notes,
        contactId: lead.contactId || undefined,
        additionalBroker: lead.additionalBroker,
        commissionSplit: lead.commissionSplit,
        propertyAddress: lead.propertyAddress || stock.address || stock.propertyName,
        leadType: lead.leadType || "Leasing",
        moduleType: "leasing",
        legalDocumentId: (lead as any).legalDocumentId || undefined,
      });
      backendLeadId = createdLead.id;
    }

    const workflow = await leadService.syncLeadWorkflow(backendLeadId, {
      leadId: backendLeadId,
      status: leadStatus,
      moduleType: "leasing",
      stockId: stock.id,
      stockName: stock.propertyName,
      stockAddress: stock.address || lead.propertyAddress || stock.propertyName,
      propertyId: propertyId || undefined,
      propertyTitle: stock.propertyName,
      propertyAddress: stock.address || lead.propertyAddress || stock.propertyName,
      propertyType: "Leasing",
      propertyPrice: expectedValue,
      propertyStatus: "for_lease",
      dealTitle,
      dealDescription: `Auto-created from Leasing Leads when linked to stock ${stock.propertyName}.`,
      dealStatus,
      dealType: "lease",
      dealValue: value,
      brokerId: brokerId || undefined,
      forecastTitle: dealTitle,
      forecastStatus: status,
      forecastExpectedValue: expectedValue,
      forecastCommissionRate: DEFAULT_COMMISSION_RATE,
      forecastCommissionAmount: grossCommission,
      forecastCompanyCommission: split.companyComm,
      forecastBrokerCommission: split.brokerComm,
      forecastClosureDate: new Date().toISOString(),
      contactId: lead.contactId || undefined,
      comment: lead.comment || lead.notes || "",
      notes: lead.comment || lead.notes || "",
      company: lead.company,
      leadSource: lead.leadSource,
      additionalBroker: lead.additionalBroker || undefined,
      commissionSplit: lead.commissionSplit,
      dealId: lead.backendDealId || undefined,
      forecastDealId: lead.forecastDealId || undefined,
      legalDocumentId: (lead as any).legalDocumentId || undefined,
      propertyAddress: lead.propertyAddress || stock.address || stock.propertyName,
      leadType: lead.leadType || "Leasing",
    });

    return {
      backendLeadId: workflow.lead.id,
      backendDealId: workflow.deal?.id || String(lead.backendDealId || "").trim(),
      forecastDealId: workflow.forecastDeal?.id || String(lead.forecastDealId || "").trim(),
      propertyId: workflow.propertyId || propertyId || null,
    };
  };

  const syncExistingForecastStatus = async (lead: Lead, nextStatus: string) => {
    const backendLeadId = String(lead.backendLeadId || lead.id || "").trim();
    if (!backendLeadId) return;

    const linkedStock = selectableStocks.find((stock) => stock.id === lead.linkedStock);
    const brokerId = await resolveBrokerId(lead, linkedStock);
    return leadService.syncLeadWorkflow(backendLeadId, {
      leadId: backendLeadId,
      status: nextStatus,
      moduleType: "leasing",
      brokerId: brokerId || undefined,
      propertyId: lead.linkedPropertyId || undefined,
      stockId: lead.linkedStock || undefined,
      stockName: lead.propertyInterest || undefined,
      stockAddress: lead.propertyAddress || undefined,
      dealId: lead.backendDealId || undefined,
      forecastDealId: lead.forecastDealId || undefined,
      dealTitle: `${lead.name} - ${lead.propertyInterest || "Property"}`,
      dealDescription: lead.comment || lead.notes || "",
      dealStatus: toDealStatus(nextStatus),
      dealType: "lease",
      dealValue: Number(lead.value || 0),
      forecastTitle: `${lead.name} - Forecast`,
      forecastStatus: nextStatus,
      forecastExpectedValue: Number(lead.value || 0),
      forecastCommissionRate: DEFAULT_COMMISSION_RATE,
      forecastCommissionAmount: Math.round(Number(lead.value || 0) * DEFAULT_COMMISSION_RATE),
      forecastCompanyCommission: Math.round(Number(lead.value || 0) * DEFAULT_COMMISSION_RATE * 0.55),
      forecastBrokerCommission: Math.round(Number(lead.value || 0) * DEFAULT_COMMISSION_RATE * 0.45),
      contactId: lead.contactId || undefined,
      comment: lead.comment || lead.notes || "",
      notes: lead.comment || lead.notes || "",
      legalDocumentId: (lead as any).legalDocumentId || undefined,
      propertyTitle: lead.propertyInterest || undefined,
      propertyAddress: lead.propertyAddress || undefined,
      propertyType: "Leasing",
      propertyStatus: "for_lease",
    });
  };

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.company?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      filterStatus === "All" || lead.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const filteredContacts = contacts.filter((contact) => {
    const fullName = `${contact.firstName} ${contact.lastName}`;
    return fullName.toLowerCase().includes(contactSearchQuery.toLowerCase()) ||
           contact.email.toLowerCase().includes(contactSearchQuery.toLowerCase());
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "New":
        return "bg-blue-100 text-blue-800";
      case "Contacted":
        return "bg-yellow-100 text-yellow-800";
      case "Qualified":
        return "bg-green-100 text-green-800";
      case "Negotiating":
        return "bg-purple-100 text-purple-800";
      case "Lost":
        return "bg-red-100 text-red-800";
      default:
        return "bg-stone-100 text-stone-800";
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case "Direct":
        return "bg-violet-50 text-violet-700";
      case "Referral":
        return "bg-green-50 text-green-700";
      case "Website":
        return "bg-blue-50 text-blue-700";
      case "Cold Call":
        return "bg-orange-50 text-orange-700";
      case "Email":
        return "bg-pink-50 text-pink-700";
      default:
        return "bg-stone-50 text-stone-700";
    }
  };

  const getLeadTypeColor = (type: string) => {
    switch (type) {
      case "Leasing":
        return "bg-blue-50 text-blue-700";
      case "Sales":
        return "bg-purple-50 text-purple-700";
      case "Auction":
        return "bg-orange-50 text-orange-700";
      default:
        return "bg-stone-50 text-stone-700";
    }
  };

  const handleOpenLeadTypeModal = () => {
    // First check if contacts exist
    if (contacts.length === 0) {
      alert("Please create a Contact first before adding a Lead. Go to Contacts section to add a new contact.");
      return;
    }
    setShowAddModal(true);
  };

  const handleAddLead = async () => {
    if (!newLead.name || !newLead.email) {
      alert("Please fill in name and email fields");
      return;
    }
    if (!newLead.contactId) {
      alert("Please select a contact");
      return;
    }
    if (!newLead.comment) {
      alert("Comment section is mandatory");
      return;
    }
    
    // Validate commission split if additional broker is specified
    if (newLead.additionalBroker) {
      const total = (newLead.commissionSplit?.primaryBroker || 0) + (newLead.commissionSplit?.additionalBroker || 0);
      if (total !== 100) {
        alert(`Commission split must equal 100%. Currently: ${total}%`);
        return;
      }
    }

    try {
      const created = await leadService.createLead({
        name: newLead.name,
        email: newLead.email,
        phone: newLead.phone,
        status: newLead.status,
        value: newLead.value,
        company: newLead.company,
        leadSource: newLead.leadSource,
        notes: newLead.comment,
        comment: newLead.comment,
        contactId: newLead.contactId,
        additionalBroker: newLead.additionalBroker,
        commissionSplit: newLead.commissionSplit,
        propertyAddress: newLead.propertyAddress,
        leadType: newLead.leadType,
        moduleType: "leasing",
        legalDocumentId: (newLead as any).legalDocumentId || undefined,
      });
      const leadWithId = toLeasingLead({
        ...created,
        notes: newLead.comment,
        company: newLead.company,
        propertyAddress: newLead.propertyAddress,
        leadType: newLead.leadType,
        contactId: newLead.contactId,
      });
      setLeads([...leads, leadWithId]);
      setShowAddModal(false);
      setNewLead({
        name: "",
        email: "",
        company: "",
        phone: "",
        leadSource: "Direct",
        status: "New",
        value: 0,
        leadType: "Leasing",
        contactId: "",
        propertyAddress: "",
        comment: "",
        additionalBroker: "",
        commissionSplit: {
          primaryBroker: 100,
          additionalBroker: 0,
        },
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save lead");
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (confirm("Are you sure you want to delete this lead?")) {
      try {
        await leadService.deleteLead(id);
        setLeads(leads.filter(lead => lead.id !== id));
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to delete lead");
      }
    }
  };

  const handleStatusChange = (lead: Lead, newStatus: string) => {
    const backendLeadId = String(lead.backendLeadId || lead.id || "").trim();
    const canSync = !!lead.linkedStock && !!lead.forecastDealId;
    const previousLeads = leads;

    if (newStatus === "Lease Agreement") {
      // Show modal to link stock
      setSelectedLeadForStock(lead);
      setShowStockLinkModal(true);
      return;
    } else {
      // Just update status for other statuses
      setLeads(
        leads.map((l) =>
          l.id === lead.id ? { ...l, status: newStatus as any } : l
        )
      );

      if (backendLeadId && canSync) {
        setIsSyncingDeal(true);
        void syncExistingForecastStatus(lead, newStatus)
          .catch((error) => {
            setLeads(previousLeads);
            alert(
              `Status changed locally but failed to sync forecast status: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          })
          .finally(() => setIsSyncingDeal(false));
      } else if (backendLeadId) {
        void leadService.updateLead(backendLeadId, {
          status: newStatus,
          propertyId: lead.linkedPropertyId || undefined,
          value: lead.value,
          comment: lead.comment || lead.notes,
          legalDocumentId: (lead as any).legalDocumentId || undefined,
        }).catch((error) => {
          setLeads(previousLeads);
          console.warn("Failed to sync lead status to database", error);
        });
      }
    }
  };

  const handleLinkStock = async (stockId: string) => {
    if (!selectedLeadForStock) return;

    const selectedStock = selectableStocks.find((stock) => stock.id === stockId);
    if (!selectedStock) {
      alert("Selected stock not found.");
      return;
    }

    const localLeadSnapshot = { ...selectedLeadForStock };
    const brokerOverride = selectedBrokerIdForStock || undefined;

    setLeads(
      leads.map((l) =>
        l.id === selectedLeadForStock.id
          ? { ...l, status: "Lease Agreement" as const, linkedStock: stockId }
          : l
      )
    );
    setShowStockLinkModal(false);
    setSelectedLeadForStock(null);
    setSelectedBrokerIdForStock("");

    setIsSyncingDeal(true);
    try {
      const synced = await syncLinkedDeal(localLeadSnapshot, selectedStock, "Lease Agreement", brokerOverride);
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === localLeadSnapshot.id
            ? {
                ...lead,
                status: "Lease Agreement" as const,
                linkedStock: stockId,
                backendLeadId: synced.backendLeadId,
                backendDealId: synced.backendDealId,
                forecastDealId: synced.forecastDealId,
                linkedPropertyId: synced.propertyId,
              }
            : lead
        )
      );
    } catch (error) {
      alert(
        `Failed to create deal and forecast from linked stock: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === localLeadSnapshot.id
            ? { ...lead, status: localLeadSnapshot.status, linkedStock: localLeadSnapshot.linkedStock }
            : lead
        )
      );
    } finally {
      setIsSyncingDeal(false);
    }
  };

  const handleOpenEditModal = (lead: Lead) => {
    setEditingLead(lead);
    setShowEditModal(true);
  };

  const handleUpdateLead = async () => {
    if (!editingLead) return;
    if (!editingLead.name || !editingLead.email) {
      alert("Please fill in name and email fields");
      return;
    }
    if (!editingLead.comment) {
      alert("Comment section is mandatory");
      return;
    }
    
    // Validate commission split if additional broker is specified
    if (editingLead.additionalBroker) {
      const total = (editingLead.commissionSplit?.primaryBroker || 0) + (editingLead.commissionSplit?.additionalBroker || 0);
      if (total !== 100) {
        alert(`Commission split must equal 100%. Currently: ${total}%`);
        return;
      }
    }

    try {
      const backendLeadId = String(editingLead.backendLeadId || editingLead.id || "").trim();
      const updated = await leadService.updateLead(backendLeadId, {
        name: editingLead.name,
        email: editingLead.email,
        phone: editingLead.phone,
        status: editingLead.status,
        value: editingLead.value,
        company: editingLead.company,
        leadSource: editingLead.leadSource,
        notes: editingLead.comment || editingLead.notes,
        comment: editingLead.comment || editingLead.notes,
        contactId: editingLead.contactId || undefined,
        additionalBroker: editingLead.additionalBroker,
        commissionSplit: editingLead.commissionSplit,
        propertyAddress: editingLead.propertyAddress || editingLead.propertyInterest,
        leadType: editingLead.leadType || "Leasing",
        moduleType: "leasing",
        legalDocumentId: (editingLead as any).legalDocumentId || undefined,
      });

      const mapped = toLeasingLead({
        ...updated,
        comment: editingLead.comment,
        propertyAddress: editingLead.propertyAddress || editingLead.propertyInterest,
        leadType: editingLead.leadType || "Leasing",
      });

      setLeads(
        leads.map((l) =>
          l.id === editingLead.id ? { ...mapped, backendLeadId: backendLeadId } : l
        )
      );
      setShowEditModal(false);
      setEditingLead(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update lead");
    }
  };

  const handleCloseModals = () => {
    setShowAddModal(false);
    setContactSearchQuery("");
    setNewLead({
      name: "",
      email: "",
      company: "",
      phone: "",
      leadSource: "Direct",
      status: "New",
      value: 0,
      leadType: "Leasing",
      contactId: "",
      propertyAddress: "",
      comment: "",
      additionalBroker: "",
      commissionSplit: {
        primaryBroker: 100,
        additionalBroker: 0,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Leads</h2>
          <p className="text-stone-600 text-sm mt-1">
            Manage and track potential deals
          </p>
        </div>
        <button 
          onClick={handleOpenLeadTypeModal}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FiPlus size={18} />
          Add Lead
        </button>
      </div>

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-1">Add New Lead</h3>
              <p className="text-stone-600 text-sm mb-6">Fill in the lead details below</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Contact Selection */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Search Existing Contacts *
                  </label>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Search by name or email..."
                      value={contactSearchQuery}
                      onChange={(e) => setContactSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    {contactSearchQuery && (
                      <div className="border border-stone-200 rounded-lg max-h-40 overflow-y-auto">
                        {filteredContacts.length > 0 ? (
                          filteredContacts.map((contact) => (
                            <button
                              key={contact.id}
                              onClick={() => {
                                setNewLead({
                                  ...newLead,
                                  contactId: contact.id,
                                  name: `${contact.firstName} ${contact.lastName}`,
                                  email: contact.email,
                                  phone: contact.phone,
                                  company: contact.company,
                                });
                                setContactSearchQuery("");
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-stone-50 border-b border-stone-200 last:border-b-0"
                            >
                              <p className="font-medium text-stone-900">{contact.firstName} {contact.lastName}</p>
                              <p className="text-xs text-stone-600">{contact.email}</p>
                            </button>
                          ))
                        ) : (
                          <p className="px-4 py-2 text-sm text-stone-600">No contacts found</p>
                        )}
                      </div>
                    )}
                    {newLead.contactId && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                        ✓ Contact selected: {newLead.name}
                      </div>
                    )}
                  </div>
                </div>

                {/* Lead Source */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Lead Source
                  </label>
                  <select
                    value={newLead.leadSource}
                    onChange={(e) =>
                      setNewLead({ ...newLead, leadSource: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Direct</option>
                    <option>Referral</option>
                    <option>Website</option>
                    <option>Cold Call</option>
                    <option>Email</option>
                  </select>
                </div>

                {/* Lead Status */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Status
                  </label>
                  <select
                    value={newLead.status}
                    onChange={(e) =>
                      setNewLead({ ...newLead, status: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>New</option>
                    <option>Contacted</option>
                    <option>Qualified</option>
                    <option>Negotiating</option>
                    <option>Lease Agreement</option>
                    <option>Lost</option>
                  </select>
                </div>

                {/* Property Address */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Property Address
                  </label>
                  <input
                    type="text"
                    value={newLead.propertyAddress}
                    onChange={(e) =>
                      setNewLead({ ...newLead, propertyAddress: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Property address or location"
                  />
                </div>

                {/* Estimated Value */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Estimated Deal Value
                  </label>
                  <input
                    type="number"
                    value={newLead.value}
                    onChange={(e) =>
                      setNewLead({ ...newLead, value: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="0"
                  />
                </div>

                {/* Mandatory Comment */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Comment / Internal Notes * (Mandatory)
                  </label>
                  <textarea
                    value={newLead.comment}
                    onChange={(e) =>
                      setNewLead({ ...newLead, comment: e.target.value })
                    }
                    placeholder="Add internal notes for communication..."
                    rows={4}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                {/* Additional Broker */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Additional Broker (Optional)
                  </label>
                  <input
                    type="text"
                    value={newLead.additionalBroker}
                    onChange={(e) =>
                      setNewLead({ ...newLead, additionalBroker: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Name of additional broker if working together"
                  />
                </div>

                {/* Commission Split */}
                {newLead.additionalBroker && (
                  <div className="md:col-span-2 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-semibold text-stone-900 mb-3">Commission Split (%)</h4>
                    <p className="text-sm text-stone-600 mb-3">Split must equal 100%</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">
                          Primary Broker %
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={newLead.commissionSplit?.primaryBroker || 100}
                          onChange={(e) => {
                            const primaryValue = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                            const additionalValue = 100 - primaryValue;
                            setNewLead({
                              ...newLead,
                              commissionSplit: {
                                primaryBroker: primaryValue,
                                additionalBroker: additionalValue,
                              },
                            });
                          }}
                          className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">
                          {newLead.additionalBroker} %
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={newLead.commissionSplit?.additionalBroker || 0}
                          onChange={(e) => {
                            const additionalValue = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                            const primaryValue = 100 - additionalValue;
                            setNewLead({
                              ...newLead,
                              commissionSplit: {
                                primaryBroker: primaryValue,
                                additionalBroker: additionalValue,
                              },
                            });
                          }}
                          className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                    </div>
                    <div className="mt-3 text-sm font-semibold text-stone-900">
                      Total: {((newLead.commissionSplit?.primaryBroker || 0) + (newLead.commissionSplit?.additionalBroker || 0))}%
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6 justify-end">
                <button
                  onClick={handleCloseModals}
                  className="px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLead}
                  className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  Add Lead
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Stock Modal */}
      {showStockLinkModal && selectedLeadForStock && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-4">
                Link Stock for Lease Agreement: {selectedLeadForStock.name}
              </h3>
              <p className="text-stone-600 text-sm mb-4">
                Please select a property from your leasing stock to link with this lead before proceeding.
              </p>
              {(brokers.length > 0 || adminManagerUsers.length > 0) && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Assign Broker <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedBrokerIdForStock}
                    onChange={(e) => setSelectedBrokerIdForStock(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                  >
                    <option value="">Select a broker...</option>
                    {brokers.length > 0 && (
                      <optgroup label="Brokers">
                        {brokers.map((broker) => (
                          <option key={broker.id} value={broker.id}>
                            {broker.name}{broker.email ? ` (${broker.email})` : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {adminManagerUsers.length > 0 && (
                      <optgroup label="Managers / Admins">
                        {adminManagerUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selectableStocks.map((stock) => (
                  <button
                    key={stock.id}
                    onClick={() => handleLinkStock(stock.id)}
                    disabled={isSyncingDeal}
                    className="w-full text-left p-3 border border-stone-200 rounded-lg hover:bg-violet-50 hover:border-violet-300 transition-colors"
                  >
                    <p className="font-medium text-stone-900">{stock.propertyName}</p>
                    <p className="text-xs text-stone-600">{stock.address}</p>
                  </button>
                ))}
              </div>
              {isSyncingDeal && (
                <p className="text-xs text-stone-600 mt-3">
                  Creating linked deal and forecast...
                </p>
              )}
              <button
                onClick={() => {
                  setShowStockLinkModal(false);
                  setSelectedLeadForStock(null);
                  setSelectedBrokerIdForStock("");
                }}
                className="w-full mt-4 px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isSyncingDeal && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
          Syncing linked deal to WIP and Forecast...
        </div>
      )}

      {/* Edit Lead Modal */}
      {showEditModal && editingLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-1">Edit Lead</h3>
              <p className="text-stone-600 text-sm mb-6">Update the lead details below</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Contact Selection */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Contact: {editingLead.name}
                  </label>
                  <p className="text-sm text-stone-600 px-3 py-2">Contact cannot be changed after creation</p>
                </div>

                {/* Lead Source */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Lead Source
                  </label>
                  <select
                    value={editingLead.leadSource}
                    onChange={(e) =>
                      setEditingLead({ ...editingLead, leadSource: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Direct</option>
                    <option>Referral</option>
                    <option>Website</option>
                    <option>Cold Call</option>
                    <option>Email</option>
                  </select>
                </div>

                {/* Lead Status */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Status
                  </label>
                  <select
                    value={editingLead.status}
                    onChange={(e) =>
                      setEditingLead({ ...editingLead, status: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>New</option>
                    <option>Contacted</option>
                    <option>Qualified</option>
                    <option>Negotiating</option>
                    <option>Lease Agreement</option>
                    <option>Lost</option>
                  </select>
                </div>

                {/* Property Address */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Property Address
                  </label>
                  <input
                    type="text"
                    value={editingLead.propertyAddress}
                    onChange={(e) =>
                      setEditingLead({ ...editingLead, propertyAddress: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Property address or location"
                  />
                </div>

                {/* Estimated Value */}
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Estimated Deal Value
                  </label>
                  <input
                    type="number"
                    value={editingLead.value}
                    onChange={(e) =>
                      setEditingLead({ ...editingLead, value: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="0"
                  />
                </div>

                {/* Mandatory Comment */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Comment / Internal Notes * (Mandatory)
                  </label>
                  <textarea
                    value={editingLead.comment}
                    onChange={(e) =>
                      setEditingLead({ ...editingLead, comment: e.target.value })
                    }
                    placeholder="Add internal notes for communication..."
                    rows={4}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                {/* Additional Broker */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Additional Broker (Optional)
                  </label>
                  <input
                    type="text"
                    value={editingLead.additionalBroker}
                    onChange={(e) =>
                      setEditingLead({ ...editingLead, additionalBroker: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Name of additional broker if working together"
                  />
                </div>

                {/* Commission Split */}
                {editingLead.additionalBroker && (
                  <div className="md:col-span-2 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-semibold text-stone-900 mb-3">Commission Split (%)</h4>
                    <p className="text-sm text-stone-600 mb-3">Split must equal 100%</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">
                          Primary Broker %
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={editingLead.commissionSplit?.primaryBroker || 100}
                          onChange={(e) => {
                            const primaryValue = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                            const additionalValue = 100 - primaryValue;
                            setEditingLead({
                              ...editingLead,
                              commissionSplit: {
                                primaryBroker: primaryValue,
                                additionalBroker: additionalValue,
                              },
                            });
                          }}
                          className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">
                          {editingLead.additionalBroker} %
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={editingLead.commissionSplit?.additionalBroker || 0}
                          onChange={(e) => {
                            const additionalValue = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                            const primaryValue = 100 - additionalValue;
                            setEditingLead({
                              ...editingLead,
                              commissionSplit: {
                                primaryBroker: primaryValue,
                                additionalBroker: additionalValue,
                              },
                            });
                          }}
                          className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                    </div>
                    <div className="mt-3 text-sm font-semibold text-stone-900">
                      Total: {((editingLead.commissionSplit?.primaryBroker || 0) + (editingLead.commissionSplit?.additionalBroker || 0))}%
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6 justify-end">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingLead(null);
                  }}
                  className="px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateLead}
                  className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  Update Lead
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
              Search by name, email, or company
            </label>
            <div className="relative">
              <FiSearch className="absolute left-3 top-3 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search leads..."
                className="w-full pl-10 pr-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
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
              <option>New</option>
              <option>Contacted</option>
              <option>Qualified</option>
              <option>Negotiating</option>
              <option>Lease Agreement</option>
              <option>Lost</option>
            </select>
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredLeads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Value
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Stock / Deal
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-stone-50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      {lead.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      {lead.company || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getLeadTypeColor(
                          lead.leadType || "Leasing"
                        )}`}
                      >
                        {lead.leadType || "Leasing"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <select
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead, e.target.value)}
                        className={`px-2 py-1 rounded text-xs font-medium border-0 focus:ring-2 focus:ring-violet-500 cursor-pointer ${getStatusColor(lead.status)}`}
                      >
                        <option value="New">New</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Qualified">Qualified</option>
                        <option value="Negotiating">Negotiating</option>
                        <option value="Lease Agreement">Lease Agreement</option>
                        <option value="Lost">Lost</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getSourceColor(
                          lead.leadSource
                        )}`}
                      >
                        {lead.leadSource}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      ${lead.value.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex flex-col gap-2">
                        <span className="text-xs text-stone-600">
                          {getLinkedStockLabel(lead.linkedStock)}
                        </span>
                        <button
                          onClick={() => handleOpenStockLinkModal(lead)}
                          disabled={isSyncingDeal}
                          className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 disabled:opacity-50"
                          title="Link this lead to stock and create a deal"
                        >
                          <FiLink size={14} />
                          {lead.linkedStock ? "Relink Deal" : "Link to Stock"}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleOpenEditModal(lead)}
                          className="p-1 hover:bg-stone-100 rounded transition-colors"
                          title="Edit"
                        >
                          <FiEdit2 size={16} className="text-blue-600" />
                        </button>
                        <button 
                          onClick={() => handleDeleteLead(lead.id)}
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
            <p>No leads found matching your search.</p>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Leads</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">
            {leads.length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Qualified</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {leads.filter((l) => l.status === "Qualified").length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Negotiating</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">
            {leads.filter((l) => l.status === "Negotiating").length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Pipeline Value</p>
          <p className="text-2xl font-bold text-violet-600 mt-1">
            {formatRand(leads.reduce((sum, l) => sum + l.value, 0))}
          </p>
        </div>
      </div>
    </div>
  );
};
