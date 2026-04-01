// @ts-nocheck
'use client';

import React, { useEffect, useState } from "react";
import { Contact } from "../../data/leasing";
import { FiEdit2, FiTrash2, FiPlus, FiSearch, FiLink2 } from "react-icons/fi";
import { contactService } from "@/services/contactService";

const normalizeContactType = (type: string) => {
  const value = String(type || "").trim();
  if (!value) return "Broker";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const normalizeContactStatus = (status: string) => {
  const value = String(status || "").trim().toLowerCase();
  if (value === "inactive") return "Inactive";
  if (value === "archived") return "Archived";
  return "Active";
};

const toSalesContact = (contact: any): Contact => ({
  id: contact.id,
  firstName: contact.firstName || String(contact.name || "").split(" ")[0] || "",
  lastName: contact.lastName || String(contact.name || "").split(" ").slice(1).join(" ") || "",
  email: contact.email || "",
  phone: contact.phone || "",
  company: contact.company || "",
  position: contact.position || "",
  type: normalizeContactType(contact.type),
  linkedProperties: Array.isArray(contact.linkedPropertyIds) ? contact.linkedPropertyIds : [],
  linkedDeals: Array.isArray(contact.linkedDealIds) ? contact.linkedDealIds : [],
  status: normalizeContactStatus(contact.status),
  createdDate: contact.createdAt
    ? new Date(contact.createdAt).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0],
  notes: contact.notes || "",
});

export const Contacts: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [newContact, setNewContact] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    position: "",
    type: "Broker",
    status: "Active",
  });

  useEffect(() => {
    let mounted = true;

    const loadContacts = async () => {
      try {
        const result = await contactService.getAllContacts({ limit: 1000 });
        if (!mounted) return;
        setContacts(result.data.map((contact) => toSalesContact(contact)));
      } catch {
        if (!mounted) return;
        setContacts([]);
      }
    };

    void loadContacts();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredContacts = contacts.filter((contact) => {
    const fullName = `${contact.firstName} ${contact.lastName}`;
    const matchesSearch =
      fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.company.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "All" || contact.type === filterType;
    return matchesSearch && matchesType;
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Broker":
        return "bg-blue-100 text-blue-800";
      case "Investor":
        return "bg-purple-100 text-purple-800";
      case "Tenant":
        return "bg-green-100 text-green-800";
      case "Landlord":
        return "bg-orange-100 text-orange-800";
      case "Vendor":
        return "bg-red-100 text-red-800";
      default:
        return "bg-stone-100 text-stone-800";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "text-green-600";
      case "Inactive":
        return "text-yellow-600";
      case "Archived":
        return "text-red-600";
      default:
        return "text-stone-600";
    }
  };

  const handleAddContact = async () => {
    if (!newContact.firstName || !newContact.email) {
      alert("Please fill in first name and email fields");
      return;
    }
    try {
      const created = await contactService.createContact({
        name: `${newContact.firstName} ${newContact.lastName}`.trim(),
        firstName: newContact.firstName,
        lastName: newContact.lastName,
        email: newContact.email,
        phone: newContact.phone,
        company: newContact.company,
        position: newContact.position,
        type: newContact.type,
        status: newContact.status,
        linkedPropertyIds: [],
        linkedDealIds: [],
        moduleType: "sales",
      });
      const contactWithId = toSalesContact(created);
      setContacts([...contacts, contactWithId]);
      setShowAddModal(false);
      setNewContact({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        company: "",
        position: "",
        type: "Broker",
        status: "Active",
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save contact");
    }
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setNewContact({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
      position: contact.position,
      type: contact.type,
      status: contact.status,
    });
    setShowAddModal(true);
  };

  const handleSaveContact = async () => {
    if (!editingContact) return handleAddContact();
    try {
      const updated = await contactService.updateContact(editingContact.id, {
        name: `${newContact.firstName} ${newContact.lastName}`.trim(),
        firstName: newContact.firstName,
        lastName: newContact.lastName,
        email: newContact.email,
        phone: newContact.phone,
        company: newContact.company,
        position: newContact.position,
        type: newContact.type,
        status: newContact.status,
        moduleType: "sales",
      });
      const mapped = toSalesContact(updated);
      setContacts(contacts.map(c => c.id === editingContact.id ? mapped : c));
      setEditingContact(null);
      setShowAddModal(false);
      setNewContact({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        company: "",
        position: "",
        type: "Broker",
        status: "Active",
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update contact");
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (confirm("Are you sure you want to delete this contact?")) {
      try {
        await contactService.deleteContact(id);
        setContacts(contacts.filter(contact => contact.id !== id));
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to delete contact");
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Sales Contacts</h2>
          <p className="text-stone-600 text-sm mt-1">
            Manage all sales business contacts and relationships
          </p>
        </div>
        <button 
          onClick={() => { setEditingContact(null); setShowAddModal(true); }}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FiPlus size={18} />
          Add Contact
        </button>
      </div>

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-4">Add New Sales Contact</h3>
              <p className="text-stone-600 text-sm mb-4">These contacts will be available for linking to sales leads</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={newContact.firstName}
                    onChange={(e) =>
                      setNewContact({ ...newContact, firstName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={newContact.lastName}
                    onChange={(e) =>
                      setNewContact({ ...newContact, lastName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Last name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={newContact.email}
                    onChange={(e) =>
                      setNewContact({ ...newContact, email: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Email"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newContact.phone}
                    onChange={(e) =>
                      setNewContact({ ...newContact, phone: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Phone number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Company
                  </label>
                  <input
                    type="text"
                    value={newContact.company}
                    onChange={(e) =>
                      setNewContact({ ...newContact, company: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Position
                  </label>
                  <input
                    type="text"
                    value={newContact.position}
                    onChange={(e) =>
                      setNewContact({ ...newContact, position: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Job title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Type
                  </label>
                  <select
                    value={newContact.type}
                    onChange={(e) =>
                      setNewContact({ ...newContact, type: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Broker</option>
                    <option>Investor</option>
                    <option>Tenant</option>
                    <option>Landlord</option>
                    <option>Vendor</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Status
                  </label>
                  <select
                    value={newContact.status}
                    onChange={(e) =>
                      setNewContact({ ...newContact, status: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Active</option>
                    <option>Inactive</option>
                    <option>Archived</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6 justify-end">
                <button
                  onClick={() => { setShowAddModal(false); setEditingContact(null); }}
                  className="px-4 py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={editingContact ? handleSaveContact : handleAddContact}
                  className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  {editingContact ? 'Save Changes' : 'Add Contact'}
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
                placeholder="Search contacts..."
                className="w-full pl-10 pr-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Type
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option>All</option>
              <option>Broker</option>
              <option>Investor</option>
              <option>Tenant</option>
              <option>Landlord</option>
              <option>Vendor</option>
              <option>Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredContacts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Links
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredContacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className="hover:bg-stone-50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      {contact.firstName} {contact.lastName}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      {contact.email}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      {contact.phone}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      {contact.company}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">
                      {contact.position}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(
                          contact.type
                        )}`}
                      >
                        {contact.type}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-sm font-medium ${getStatusColor(contact.status)}`}>
                      {contact.status}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        {contact.linkedProperties.length > 0 && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                            {contact.linkedProperties.length} prop
                          </span>
                        )}
                        {contact.linkedDeals.length > 0 && (
                          <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded">
                            {contact.linkedDeals.length} deal
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => handleEditContact(contact)} className="p-1 hover:bg-stone-100 rounded transition-colors">
                          <FiEdit2 size={16} className="text-stone-600" />
                        </button>
                        <button 
                          onClick={() => handleDeleteContact(contact.id)}
                          className="p-1 hover:bg-stone-100 rounded transition-colors"
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
            <p>No contacts found matching your search.</p>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Total Sales Contacts</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">
            {contacts.length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">Active</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {contacts.filter((c) => c.status === "Active").length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">With Properties</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {
              contacts.filter((c) => c.linkedProperties.length > 0)
                .length
            }
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-stone-600 text-sm">With Deals</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">
            {contacts.filter((c) => c.linkedDeals.length > 0).length}
          </p>
        </div>
      </div>
    </div>
  );
};
