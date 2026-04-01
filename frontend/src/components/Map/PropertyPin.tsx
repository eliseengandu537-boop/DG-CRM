import React, { useState } from "react";
import { FiX, FiChevronDown, FiChevronUp } from "react-icons/fi";
import { Property } from "../../data/properties";

interface PropertyPinProps {
  property: Property;
  onClose: () => void;
  onPageChange?: (page: string) => void;
}

export const PropertyPin: React.FC<PropertyPinProps> = ({
  property,
  onClose,
  onPageChange,
}) => {
  const [expandedSection, setExpandedSection] = useState<
    "details" | "location" | "deals" | "contacts" | "leasing" | "sales" | "auction" | "documents" | null
  >("details");

  const toggleSection = (section: "details" | "location" | "deals" | "contacts" | "leasing" | "sales" | "auction" | "documents") => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const handleBrokerClick = () => {
    if (onPageChange) {
      onPageChange("Sales");
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-stone-200">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 text-white p-6 flex justify-between items-start">
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-2">{property.name}</h2>
            <p className="text-indigo-100 flex items-center gap-2">📍 {property.address}</p>
            <p className="text-sm text-indigo-100 mt-3 font-medium">
              Asset ID: <span className="font-bold">{property.assetId}</span>
            </p>
            <p className="text-sm text-indigo-100 mt-2">
              Added by: <button
                onClick={handleBrokerClick}
                className="font-bold text-indigo-200 hover:text-white underline hover:no-underline transition-colors"
              >
                {property.brokerName}
              </button>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-indigo-700 p-2 rounded-lg transition-colors flex-shrink-0"
          >
            <FiX size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Property Details Section */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <button
              onClick={() => toggleSection("details")}
              className="w-full bg-gradient-to-r from-stone-50 to-stone-100 px-6 py-4 flex justify-between items-center hover:from-stone-100 hover:to-stone-200 transition-colors border-b border-stone-200"
            >
              <h3 className="font-bold text-stone-900 flex items-center gap-2">
                🏢 Property Details
              </h3>
              {expandedSection === "details" ? (
                <FiChevronUp />
              ) : (
                <FiChevronDown />
              )}
            </button>
            {expandedSection === "details" && (
              <div className="p-6 space-y-4 bg-white">
                <div className="grid grid-cols-2 gap-6">
                  <div className="border-l-4 border-indigo-500 pl-4">
                    <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">Type</p>
                    <p className="font-bold text-stone-900 text-lg mt-1">
                      {property.details.type}
                    </p>
                  </div>
                  <div className="border-l-4 border-blue-500 pl-4">
                    <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">Size (sqm)</p>
                    <p className="font-bold text-stone-900 text-lg mt-1">
                      {property.details.squareFeet.toLocaleString()}
                    </p>
                  </div>
                  <div className="border-l-4 border-emerald-500 pl-4">
                    <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">GLA (sqm)</p>
                    <p className="font-bold text-stone-900 text-lg mt-1">
                      {(property.details.gla ?? property.details.squareFeet).toLocaleString()}
                    </p>
                  </div>
                  <div className="border-l-4 border-green-500 pl-4">
                    <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">Year Built</p>
                    <p className="font-bold text-stone-900 text-lg mt-1">
                      {property.details.yearBuilt}
                    </p>
                  </div>
                  <div className="border-l-4 border-amber-500 pl-4">
                    <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">Condition</p>
                    <p className="font-bold text-stone-900 text-lg mt-1">
                      {property.details.condition}
                    </p>
                  </div>
                  <div className="col-span-2 border-l-4 border-purple-500 pl-4">
                    <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">Ownership Status</p>
                    <p className="font-bold text-stone-900 text-lg mt-1">
                      {property.details.ownershipStatus}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Location Section */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <button
              onClick={() => toggleSection("location")}
              className="w-full bg-gradient-to-r from-stone-50 to-stone-100 px-6 py-4 flex justify-between items-center hover:from-stone-100 hover:to-stone-200 transition-colors border-b border-stone-200"
            >
              <h3 className="font-bold text-stone-900 flex items-center gap-2">
                📍 Location Details
              </h3>
              {expandedSection === "location" ? (
                <FiChevronUp />
              ) : (
                <FiChevronDown />
              )}
            </button>
            {expandedSection === "location" && (
              <div className="p-6 space-y-4 bg-white">
                <div className="space-y-3">
                  <div className="border-l-4 border-green-500 pl-4">
                    <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">Full Address</p>
                    <p className="font-bold text-stone-900 text-base mt-1">
                      {property.address}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border-l-4 border-blue-500 pl-4">
                      <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">Latitude</p>
                      <p className="font-bold text-stone-900 text-sm mt-1">
                        {property.latitude.toFixed(4)}
                      </p>
                    </div>
                    <div className="border-l-4 border-purple-500 pl-4">
                      <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide">Longitude</p>
                      <p className="font-bold text-stone-900 text-sm mt-1">
                        {property.longitude.toFixed(4)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Linked Deals Section */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <button
              onClick={() => toggleSection("deals")}
              className="w-full bg-gradient-to-r from-stone-50 to-stone-100 px-6 py-4 flex justify-between items-center hover:from-stone-100 hover:to-stone-200 transition-colors border-b border-stone-200"
            >
              <h3 className="font-bold text-stone-900 flex items-center gap-2">
                📋 Linked Deals <span className="text-indigo-600">({property.linkedDeals.length})</span>
              </h3>
              {expandedSection === "deals" ? (
                <FiChevronUp />
              ) : (
                <FiChevronDown />
              )}
            </button>
            {expandedSection === "deals" && (
              <div className="p-6 space-y-4 bg-white">
                {property.linkedDeals.length > 0 ? (
                  property.linkedDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-bold text-stone-900">
                          {deal.dealName}
                        </h4>
                        <span className="bg-blue-600 text-white text-xs px-3 py-1 rounded-full font-semibold">
                          {deal.dealType}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="border-l-2 border-blue-400 pl-3">
                          <p className="text-stone-600 text-xs uppercase font-semibold">Status</p>
                          <p className="font-bold text-stone-900 mt-1">
                            {deal.status}
                          </p>
                        </div>
                        <div className="border-l-2 border-indigo-400 pl-3">
                          <p className="text-stone-600 text-xs uppercase font-semibold">Value</p>
                          <p className="font-bold text-stone-900 mt-1">
                            {deal.value}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-stone-500 text-sm text-center py-4">No linked deals</p>
                )}
              </div>
            )}
          </div>

          {/* Linked Contacts Section */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <button
              onClick={() => toggleSection("contacts")}
              className="w-full bg-gradient-to-r from-stone-50 to-stone-100 px-6 py-4 flex justify-between items-center hover:from-stone-100 hover:to-stone-200 transition-colors border-b border-stone-200"
            >
              <h3 className="font-bold text-stone-900 flex items-center gap-2">
                👥 Linked Contacts <span className="text-indigo-600">({property.linkedContacts?.length || 0})</span>
              </h3>
              {expandedSection === "contacts" ? (
                <FiChevronUp />
              ) : (
                <FiChevronDown />
              )}
            </button>
            {expandedSection === "contacts" && (
              <div className="p-6 space-y-4 bg-white">
                {property.linkedContacts && property.linkedContacts.length > 0 ? (
                  property.linkedContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <h4 className="font-bold text-stone-900 mb-2">{contact.name}</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center">
                          <span className="text-xs text-stone-600 uppercase font-semibold w-20">Email:</span>
                          <a href={`mailto:${contact.email}`} className="text-indigo-600 hover:underline">
                            {contact.email}
                          </a>
                        </div>
                        <div className="flex items-center">
                          <span className="text-xs text-stone-600 uppercase font-semibold w-20">Phone:</span>
                          <a href={`tel:${contact.phone}`} className="text-indigo-600 hover:underline">
                            {contact.phone}
                          </a>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-stone-500 text-sm text-center py-4">No linked contacts</p>
                )}
              </div>
            )}
          </div>

          {/* Linked Company & Fund Section */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
              <div className="bg-gradient-to-r from-stone-50 to-stone-100 px-6 py-4 border-b border-stone-200">
                <h3 className="font-bold text-stone-900 flex items-center gap-2">
                  🏢 Linked Company
                </h3>
              </div>
              <div className="p-6 bg-white">
                {property.linkedCompanyName ? (
                  <div>
                    <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide mb-2">Company Name</p>
                    <p className="font-bold text-stone-900 text-base">{property.linkedCompanyName}</p>
                    {property.linkedCompanyId && (
                      <p className="text-xs text-stone-500 mt-2">ID: {property.linkedCompanyId}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-stone-500 text-sm text-center py-4">No linked company</p>
                )}
              </div>
            </div>

            <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
              <div className="bg-gradient-to-r from-stone-50 to-stone-100 px-6 py-4 border-b border-stone-200">
                <h3 className="font-bold text-stone-900 flex items-center gap-2">
                  💰 Linked Fund
                </h3>
              </div>
              <div className="p-6 bg-white">
                {property.linkedFundName ? (
                  <div>
                    <p className="text-xs text-stone-600 uppercase font-semibold tracking-wide mb-2">Fund Name</p>
                    <p className="font-bold text-stone-900 text-base">{property.linkedFundName}</p>
                    {property.linkedFundId && (
                      <p className="text-xs text-stone-500 mt-2">ID: {property.linkedFundId}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-stone-500 text-sm text-center py-4">No linked fund</p>
                )}
              </div>
            </div>
          </div>

          {/* Leasing Records Section */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <button
              onClick={() => toggleSection("leasing")}
              className="w-full bg-gradient-to-r from-stone-50 to-stone-100 px-6 py-4 flex justify-between items-center hover:from-stone-100 hover:to-stone-200 transition-colors border-b border-stone-200"
            >
              <h3 className="font-bold text-stone-900 flex items-center gap-2">
                🔑 Leasing Records <span className="text-indigo-600">({property.leasingSalesRecords.filter(r => r.recordType === "Lease").length})</span>
              </h3>
              {expandedSection === "leasing" ? (
                <FiChevronUp />
              ) : (
                <FiChevronDown />
              )}
            </button>
            {expandedSection === "leasing" && (
              <div className="p-6 space-y-4 bg-white">
                {property.leasingSalesRecords.filter(r => r.recordType === "Lease").length > 0 ? (
                  property.leasingSalesRecords.filter(r => r.recordType === "Lease").map((record) => (
                    <div
                      key={record.id}
                      className="rounded-lg p-4 border-2 bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-bold text-stone-900 flex items-center gap-2">
                          🔑 Lease Agreement
                        </h4>
                        <span className="bg-green-600 text-white text-xs px-3 py-1 rounded-full font-bold">
                          {new Date(record.date).toLocaleDateString('en-ZA', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                        <div className="border-l-2 border-green-400 pl-3">
                          <p className="text-stone-600 text-xs uppercase font-semibold">Tenant</p>
                          <p className="font-bold text-stone-900 mt-1">
                            {record.tenant}
                          </p>
                        </div>
                        <div className="border-l-2 border-emerald-400 pl-3">
                          <p className="text-stone-600 text-xs uppercase font-semibold">Monthly Amount</p>
                          <p className="font-bold text-stone-900 mt-1">
                            {record.amount}
                          </p>
                        </div>
                      </div>
                      {record.duration && (
                        <div className="border-t-2 border-green-200 pt-3">
                          <p className="text-xs text-stone-600 uppercase font-semibold">Lease Duration</p>
                          <p className="font-bold text-stone-900 mt-1">
                            {record.duration}
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-stone-500 text-sm text-center py-4">No leasing records found</p>
                )}
              </div>
            )}
          </div>

          {/* Sales Records Section */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <button
              onClick={() => toggleSection("sales")}
              className="w-full bg-gradient-to-r from-stone-50 to-stone-100 px-6 py-4 flex justify-between items-center hover:from-stone-100 hover:to-stone-200 transition-colors border-b border-stone-200"
            >
              <h3 className="font-bold text-stone-900 flex items-center gap-2">
                🏷️ Sales Records <span className="text-indigo-600">({property.leasingSalesRecords.filter(r => r.recordType === "Sale").length})</span>
              </h3>
              {expandedSection === "sales" ? (
                <FiChevronUp />
              ) : (
                <FiChevronDown />
              )}
            </button>
            {expandedSection === "sales" && (
              <div className="p-6 space-y-4 bg-white">
                {property.leasingSalesRecords.filter(r => r.recordType === "Sale").length > 0 ? (
                  property.leasingSalesRecords.filter(r => r.recordType === "Sale").map((record) => (
                    <div
                      key={record.id}
                      className="rounded-lg p-4 border-2 bg-gradient-to-r from-orange-50 to-amber-50 border-orange-300 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-bold text-stone-900 flex items-center gap-2">
                          🏷️ Sale Transaction
                        </h4>
                        <span className="bg-orange-600 text-white text-xs px-3 py-1 rounded-full font-bold">
                          {new Date(record.date).toLocaleDateString('en-ZA', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="border-l-2 border-orange-400 pl-3">
                          <p className="text-stone-600 text-xs uppercase font-semibold">Party</p>
                          <p className="font-bold text-stone-900 mt-1">
                            {record.tenant}
                          </p>
                        </div>
                        <div className="border-l-2 border-amber-400 pl-3">
                          <p className="text-stone-600 text-xs uppercase font-semibold">Sale Price</p>
                          <p className="font-bold text-stone-900 mt-1">
                            {record.amount}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-stone-500 text-sm text-center py-4">No sales records found</p>
                )}
              </div>
            )}
          </div>

          {/* Auction Records Section */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <button
              onClick={() => toggleSection("auction")}
              className="w-full bg-gradient-to-r from-stone-50 to-stone-100 px-6 py-4 flex justify-between items-center hover:from-stone-100 hover:to-stone-200 transition-colors border-b border-stone-200"
            >
              <h3 className="font-bold text-stone-900 flex items-center gap-2">
                🎯 Auction Records <span className="text-indigo-600">({property.auctionRecords?.length || 0})</span>
              </h3>
              {expandedSection === "auction" ? (
                <FiChevronUp />
              ) : (
                <FiChevronDown />
              )}
            </button>
            {expandedSection === "auction" && (
              <div className="p-6 space-y-4 bg-white">
                {property.auctionRecords && property.auctionRecords.length > 0 ? (
                  property.auctionRecords.map((record) => (
                    <div
                      key={record.id}
                      className="rounded-lg p-4 border-2 bg-gradient-to-r from-rose-50 to-pink-50 border-rose-300 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-bold text-stone-900 flex items-center gap-2">
                          🎯 {record.auctionHouse}
                        </h4>
                        <span className={`text-xs px-3 py-1 rounded-full font-bold text-white ${
                          record.status === "Concluded" ? "bg-rose-600" :
                          record.status === "Scheduled" ? "bg-yellow-600" :
                          "bg-blue-600"
                        }`}>
                          {record.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                        <div className="border-l-2 border-rose-400 pl-3">
                          <p className="text-stone-600 text-xs uppercase font-semibold">Auction Date</p>
                          <p className="font-bold text-stone-900 mt-1">
                            {new Date(record.auctionDate).toLocaleDateString('en-ZA', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                        <div className="border-l-2 border-pink-400 pl-3">
                          <p className="text-stone-600 text-xs uppercase font-semibold">Estimated Value</p>
                          <p className="font-bold text-stone-900 mt-1">
                            {record.estimatedValue}
                          </p>
                        </div>
                      </div>
                      {record.finalPrice && (
                        <div className="border-t-2 border-rose-200 pt-3">
                          <p className="text-xs text-stone-600 uppercase font-semibold">Final Sale Price</p>
                          <p className="font-bold text-stone-900 mt-1">
                            {record.finalPrice}
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-stone-500 text-sm text-center py-4">No auction records found</p>
                )}
              </div>
            )}
          </div>

          {/* Linked Documents Section */}
          <div className="border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            <button
              onClick={() => toggleSection("documents")}
              className="w-full bg-gradient-to-r from-stone-50 to-stone-100 px-6 py-4 flex justify-between items-center hover:from-stone-100 hover:to-stone-200 transition-colors border-b border-stone-200"
            >
              <h3 className="font-bold text-stone-900 flex items-center gap-2">
                📄 Linked Documents <span className="text-indigo-600">({property.linkedDocuments?.length || 0})</span>
              </h3>
              {expandedSection === "documents" ? (
                <FiChevronUp />
              ) : (
                <FiChevronDown />
              )}
            </button>
            {expandedSection === "documents" && (
              <div className="p-6 space-y-4 bg-white">
                {property.linkedDocuments && property.linkedDocuments.length > 0 ? (
                  property.linkedDocuments.map((doc) => {
                    const docTypeColors: Record<string, { bg: string; border: string; icon: string }> = {
                      "Deed": { bg: "from-purple-50 to-indigo-50", border: "border-purple-300", icon: "📋" },
                      "Lease": { bg: "from-blue-50 to-cyan-50", border: "border-blue-300", icon: "📄" },
                      "Contract": { bg: "from-green-50 to-emerald-50", border: "border-green-300", icon: "✍️" },
                      "Insurance": { bg: "from-red-50 to-orange-50", border: "border-red-300", icon: "🛡️" },
                      "Survey": { bg: "from-yellow-50 to-amber-50", border: "border-yellow-300", icon: "📐" },
                      "Appraisal": { bg: "from-pink-50 to-rose-50", border: "border-pink-300", icon: "💰" },
                      "Other": { bg: "from-gray-50 to-slate-50", border: "border-gray-300", icon: "📎" },
                    };
                    const colors = docTypeColors[doc.type] || docTypeColors["Other"];
                    return (
                      <div
                        key={doc.id}
                        className={`rounded-lg p-4 border-2 bg-gradient-to-r ${colors.bg} ${colors.border} hover:shadow-md transition-shadow`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-stone-900 flex items-center gap-2 text-lg">
                            {colors.icon} {doc.name}
                          </h4>
                          <span className="text-xs px-3 py-1 rounded-full font-semibold bg-stone-200 text-stone-800">
                            {doc.type}
                          </span>
                        </div>
                        {doc.description && (
                          <p className="text-sm text-stone-700 mb-3">
                            {doc.description}
                          </p>
                        )}
                        <div className="flex justify-between items-center text-xs text-stone-600">
                          <span>Uploaded: {new Date(doc.uploadDate).toLocaleDateString('en-ZA', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}</span>
                          {doc.url && (
                            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">
                              View Document →
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-stone-500 text-sm text-center py-4">No documents linked to this property</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
