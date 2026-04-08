'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Fund } from '../../data/crm-types';
import { FiPlus, FiEdit2, FiTrash2, FiSearch, FiX, FiChevronDown, FiChevronUp, FiHome } from 'react-icons/fi';
import { brokerService } from '@/services/brokerService';
import { contactService } from '@/services/contactService';
import {
  customRecordService,
  type CustomRecord,
} from '@/services/customRecordService';
import { propertyService, type PropertyRecord } from '@/services/propertyService';

type CompanySuggestion = {
  id: string;
  name: string;
};

type FundPayload = {
  fundCode: string;
  fundType: Fund['fundType'];
  registrationNumber: string;
  headOfficeLocation: string;
  overview: string;
  fundManager: string;
  totalAssets: number;
  currency: string;
  linkedCompanyId: string;
  linkedCompanyName: string;
  primaryContactId: string;
  primaryContactName: string;
  secondaryContactId: string;
  secondaryContactName: string;
  linkedProperties: string[];
  linkedDeals: string[];
  linkedCompanies: string[];
};

const ENTITY_TYPE = 'fund';

const emptyFormData = {
  name: '',
  fundCode: '',
  fundType: 'Listed' as Fund['fundType'],
  registrationNumber: '',
  headOfficeLocation: '',
  overview: '',
  fundManager: '',
  totalAssets: 0,
  currency: 'ZAR',
  status: 'Active' as Fund['status'],
  linkedCompanyId: '',
  linkedCompanyName: '',
  primaryContactId: '',
  primaryContactName: '',
  secondaryContactId: '',
  secondaryContactName: '',
  linkedProperties: [] as string[],
  linkedDeals: [] as string[],
  linkedCompanies: [] as string[],
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : [];

const toFund = (record: CustomRecord<Record<string, unknown>>): Fund => {
  const payload = (record.payload || {}) as Partial<FundPayload>;

  return {
    id: record.id,
    name: record.name || '',
    fundCode: String(payload.fundCode || record.referenceId || ''),
    fundType: (payload.fundType || (record.category as Fund['fundType']) || 'Listed') as Fund['fundType'],
    registrationNumber: String(payload.registrationNumber || ''),
    headOfficeLocation: String(payload.headOfficeLocation || ''),
    overview: String(payload.overview || ''),
    fundManager: String(payload.fundManager || ''),
    totalAssets: Number(payload.totalAssets || 0),
    currency: String(payload.currency || 'ZAR'),
    status: (record.status || 'Active') as Fund['status'],
    linkedCompanyId: String(payload.linkedCompanyId || ''),
    linkedCompanyName: String(payload.linkedCompanyName || ''),
    primaryContactId: String(payload.primaryContactId || ''),
    primaryContactName: String(payload.primaryContactName || ''),
    secondaryContactId: String(payload.secondaryContactId || ''),
    secondaryContactName: String(payload.secondaryContactName || ''),
    linkedProperties: toStringArray(payload.linkedProperties),
    linkedDeals: toStringArray(payload.linkedDeals),
    linkedCompanies: toStringArray(payload.linkedCompanies),
    createdDate: new Date(record.createdAt).toISOString().split('T')[0],
    updatedDate: new Date(record.updatedAt).toISOString().split('T')[0],
  };
};

const buildPayload = (
  formData: typeof emptyFormData,
  selectedCompany: CompanySuggestion | null
): FundPayload => ({
  fundCode: formData.fundCode.trim(),
  fundType: formData.fundType,
  registrationNumber: formData.registrationNumber.trim(),
  headOfficeLocation: formData.headOfficeLocation.trim(),
  overview: formData.overview.trim(),
  fundManager: formData.fundManager.trim(),
  totalAssets: Number(formData.totalAssets || 0),
  currency: formData.currency.trim() || 'ZAR',
  linkedCompanyId: selectedCompany?.id || formData.linkedCompanyId.trim(),
  linkedCompanyName: selectedCompany?.name || formData.linkedCompanyName.trim(),
  primaryContactId: formData.primaryContactId.trim(),
  primaryContactName: formData.primaryContactName.trim(),
  secondaryContactId: formData.secondaryContactId.trim(),
  secondaryContactName: formData.secondaryContactName.trim(),
  linkedProperties: [...formData.linkedProperties],
  linkedDeals: [...formData.linkedDeals],
  linkedCompanies: selectedCompany?.name
    ? Array.from(new Set([...formData.linkedCompanies, selectedCompany.name])).filter(Boolean)
    : [...formData.linkedCompanies],
});

const collectCompanySuggestions = (
  brokers: Array<{ id: string; company?: string; name?: string }>,
  contacts: Array<{ id: string; company?: string; name?: string }>
): CompanySuggestion[] => {
  const companies = new Map<string, CompanySuggestion>();

  brokers.forEach((broker) => {
    const name = String(broker.company || '').trim();
    if (!name) return;
    companies.set(name.toLowerCase(), {
      id: `broker:${broker.id}`,
      name,
    });
  });

  contacts.forEach((contact) => {
    const name = String(contact.company || '').trim();
    if (!name) return;
    if (!companies.has(name.toLowerCase())) {
      companies.set(name.toLowerCase(), {
        id: `contact:${contact.id}`,
        name,
      });
    }
  });

  return Array.from(companies.values()).sort((a, b) => a.name.localeCompare(b.name));
};

export const PropertyFundsManager: React.FC = () => {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [brokers, setBrokers] = useState<Array<{ id: string; company?: string; name?: string }>>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; company?: string; name?: string }>>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedFund, setSelectedFund] = useState<Fund | null>(null);
  const [activeTab, setActiveTab] = useState<'Listed' | 'Non-Listed'>('Listed');
  const [showCompanySearch, setShowCompanySearch] = useState(false);
  const [companySearchInput, setCompanySearchInput] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<CompanySuggestion | null>(null);
  const [showCreateCompanyPrompt, setShowCreateCompanyPrompt] = useState(false);
  const [formData, setFormData] = useState({ ...emptyFormData });
  const [expandedFundId, setExpandedFundId] = useState<string | null>(null);
  const [fundProperties, setFundProperties] = useState<Record<string, PropertyRecord[]>>({});
  const [loadingFundProperties, setLoadingFundProperties] = useState<string | null>(null);

  const refreshFunds = async () => {
    const result = await customRecordService.getAllCustomRecords<Record<string, unknown>>({
      entityType: ENTITY_TYPE,
      limit: 1000,
    });
    setFunds(result.data.map(toFund));
  };

  const handleFundExpand = async (fundId: string, fund: Fund) => {
    if (expandedFundId === fundId) {
      setExpandedFundId(null);
      return;
    }
    setExpandedFundId(fundId);
    if (fundProperties[fundId]) return;
    setLoadingFundProperties(fundId);
    try {
      const result = await propertyService.getAllProperties({ limit: 1000 });
      const allProps: PropertyRecord[] = result.data || [];
      const fundName = fund.name.toLowerCase();
      const linked = allProps.filter((p) => {
        const meta = (p.metadata || {}) as Record<string, unknown>;
        const metaFundName = String(meta.linkedFundName || meta.fundName || '').toLowerCase();
        if (metaFundName && metaFundName === fundName) return true;
        if (fund.linkedProperties?.includes(p.id)) return true;
        return false;
      });
      setFundProperties((prev) => ({ ...prev, [fundId]: linked }));
    } catch {
      setFundProperties((prev) => ({ ...prev, [fundId]: [] }));
    } finally {
      setLoadingFundProperties(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [fundResult, brokerList, contactList] = await Promise.all([
          customRecordService.getAllCustomRecords<Record<string, unknown>>({
            entityType: ENTITY_TYPE,
            limit: 1000,
          }),
          brokerService.getAllBrokers(),
          contactService.getAllContacts({ limit: 1000 }),
        ]);

        if (!mounted) return;
        setFunds(fundResult.data.map(toFund));
        setBrokers(brokerList);
        setContacts(contactList.data);
      } catch {
        if (!mounted) return;
        setFunds([]);
        setBrokers([]);
        setContacts([]);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const companySuggestions = useMemo(
    () => collectCompanySuggestions(brokers, contacts),
    [brokers, contacts]
  );

  const filteredCompanies = useMemo(() => {
    const query = companySearchInput.trim().toLowerCase();
    if (!query) return companySuggestions;
    return companySuggestions.filter((company) => company.name.toLowerCase().includes(query));
  }, [companySearchInput, companySuggestions]);

  const resetForm = () => {
    setFormData({ ...emptyFormData });
    setSelectedFund(null);
    setSelectedCompany(null);
    setCompanySearchInput('');
    setShowCompanySearch(false);
    setShowCreateCompanyPrompt(false);
  };

  const handleEditFund = (fund: Fund) => {
    setFormData({
      name: fund.name,
      fundCode: fund.fundCode,
      fundType: fund.fundType,
      registrationNumber: fund.registrationNumber,
      headOfficeLocation: fund.headOfficeLocation,
      overview: fund.overview,
      fundManager: fund.fundManager || '',
      totalAssets: fund.totalAssets,
      currency: fund.currency,
      status: fund.status,
      linkedCompanyId: fund.linkedCompanyId || '',
      linkedCompanyName: fund.linkedCompanyName || '',
      primaryContactId: fund.primaryContactId || '',
      primaryContactName: fund.primaryContactName || '',
      secondaryContactId: fund.secondaryContactId || '',
      secondaryContactName: fund.secondaryContactName || '',
      linkedProperties: fund.linkedProperties || [],
      linkedDeals: fund.linkedDeals || [],
      linkedCompanies: fund.linkedCompanies || [],
    });

    setSelectedFund(fund);
    setSelectedCompany(
      fund.linkedCompanyName
        ? {
            id: fund.linkedCompanyId || `company:${fund.linkedCompanyName.toLowerCase()}`,
            name: fund.linkedCompanyName,
          }
        : null
    );
    setCompanySearchInput(fund.linkedCompanyName || '');
    setShowModal(true);
  };

  const handleDeleteFund = async (id: string) => {
    if (!confirm('Are you sure you want to delete this fund?')) return;
    try {
      await customRecordService.deleteCustomRecord(id);
      await refreshFunds();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete fund');
    }
  };

  const handleSaveFund = async () => {
    if (!formData.name.trim() || !formData.fundCode.trim() || !formData.registrationNumber.trim()) {
      alert('Please fill all required fields: Fund Name, Fund Code, and Registration Number');
      return;
    }

    const companyName = selectedCompany?.name || formData.linkedCompanyName.trim();
    if (!companyName) {
      alert('Please select or create a company for this fund');
      return;
    }

    const company = selectedCompany || {
      id: `company:${companyName.toLowerCase().replace(/\s+/g, '-')}`,
      name: companyName,
    };

    const payload = buildPayload(formData, company);

    try {
      if (selectedFund) {
        await customRecordService.updateCustomRecord(selectedFund.id, {
          name: formData.name.trim(),
          status: formData.status,
          category: formData.fundType,
          referenceId: formData.fundCode.trim(),
          payload,
        });
      } else {
        await customRecordService.createCustomRecord({
          entityType: ENTITY_TYPE,
          name: formData.name.trim(),
          status: formData.status,
          category: formData.fundType,
          referenceId: formData.fundCode.trim(),
          payload,
        });
      }

      await refreshFunds();
      resetForm();
      setShowModal(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save fund');
    }
  };

  const filteredFunds = funds.filter((fund) => fund.fundType === activeTab);

  const getFundTypeColor = (type: string) =>
    type === 'Listed' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800';

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800';
      case 'Closed':
        return 'bg-red-100 text-red-800';
      case 'In Formation':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-stone-100 text-stone-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Property Funds</h2>
          <p className="text-stone-600 text-sm mt-1">
            Manage Listed and Non-Listed investment funds
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setActiveTab('Listed');
            setShowModal(true);
          }}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FiPlus size={18} />
          + Fund
        </button>
      </div>

      <div className="flex gap-3 border-b border-stone-200">
        {(['Listed', 'Non-Listed'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 font-medium text-sm transition-all border-b-2 ${
              activeTab === tab
                ? 'text-violet-600 border-violet-500'
                : 'text-stone-600 border-transparent hover:text-stone-800'
            }`}
          >
            {tab} Funds ({funds.filter((fund) => fund.fundType === tab).length})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
        {filteredFunds.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-stone-600 text-base mb-4">No {activeTab} funds found</p>
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="text-violet-500 hover:text-violet-600 font-medium text-sm"
            >
              Create your first {activeTab} fund
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Fund Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Fund Code
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Linked Company
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Reg. Number
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Company Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Primary Contact
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Secondary Contact
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-stone-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredFunds.map((fund, idx) => (
                  <React.Fragment key={fund.id}>
                  <tr
                    className={`border-t border-stone-200 hover:bg-stone-50 transition-colors cursor-pointer ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-stone-50'
                    } ${expandedFundId === fund.id ? 'bg-violet-50' : ''}`}
                    onClick={() => void handleFundExpand(fund.id, fund)}
                  >
                    <td className="px-6 py-4 text-sm font-medium text-stone-900">
                      <div className="flex items-center gap-2">
                        {expandedFundId === fund.id ? (
                          <FiChevronUp size={14} className="text-violet-500 flex-shrink-0" />
                        ) : (
                          <FiChevronDown size={14} className="text-stone-400 flex-shrink-0" />
                        )}
                        {fund.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-700">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${getFundTypeColor(
                          fund.fundType
                        )}`}
                      >
                        {fund.fundCode}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-700">
                      {fund.linkedCompanyId ? (
                        <span className="bg-blue-50 text-blue-800 px-2 py-1 rounded text-xs">
                          Linked
                        </span>
                      ) : (
                        <span className="text-stone-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-700">
                      {fund.registrationNumber}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-700">
                      {fund.linkedCompanyName || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-700">
                      {fund.primaryContactName || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-700">
                      {fund.secondaryContactName || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(
                          fund.status
                        )}`}
                      >
                        {fund.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleEditFund(fund)}
                          className="text-violet-500 hover:text-violet-700 transition-colors"
                          title="Edit"
                        >
                          <FiEdit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteFund(fund.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          title="Delete"
                        >
                          <FiTrash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedFundId === fund.id && (
                    <tr className="bg-violet-50 border-t border-violet-100">
                      <td colSpan={9} className="px-8 py-4">
                        <div className="flex items-center gap-2 mb-3">
                          <FiHome size={14} className="text-violet-600" />
                          <span className="text-sm font-semibold text-violet-800">Linked Map Properties</span>
                        </div>
                        {loadingFundProperties === fund.id ? (
                          <p className="text-sm text-stone-400">Loading properties…</p>
                        ) : !fundProperties[fund.id] || fundProperties[fund.id].length === 0 ? (
                          <p className="text-sm text-stone-400 italic">No map properties linked to this fund. Properties added via the Map module with this fund name will appear here.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {fundProperties[fund.id].map((property) => (
                              <div key={property.id} className="bg-white rounded-lg border border-violet-200 px-4 py-3 shadow-sm">
                                <p className="text-sm font-medium text-stone-900">{property.title || property.address}</p>
                                <p className="text-xs text-stone-500 mt-0.5">{property.address}</p>
                                <div className="flex gap-2 mt-2 flex-wrap">
                                  {property.type && (
                                    <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded">{property.type}</span>
                                  )}
                                  {property.status && (
                                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded">{property.status}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-stone-200 px-6 py-4 flex justify-between items-center">
              <h3 className="text-xl font-bold text-stone-900">
                {selectedFund ? 'Edit Fund' : 'Create New Fund'}
              </h3>
              <button
                onClick={() => {
                  resetForm();
                  setShowModal(false);
                }}
                className="text-stone-500 hover:text-stone-700"
              >
                <FiX size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <label className="block text-sm font-semibold text-blue-900 mb-3">
                  Linked Company * (Required)
                </label>
                {selectedCompany ? (
                  <div className="flex items-center justify-between bg-blue-100 border border-blue-300 rounded-lg p-3">
                    <span className="text-sm font-medium text-blue-900">{selectedCompany.name}</span>
                    <button
                      onClick={() => {
                        setSelectedCompany(null);
                        setFormData({ ...formData, linkedCompanyId: '', linkedCompanyName: '' });
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <FiX size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          placeholder="Search for existing company..."
                          value={companySearchInput}
                          onChange={(e) => setCompanySearchInput(e.target.value)}
                          onFocus={() => setShowCompanySearch(true)}
                          className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {showCompanySearch && companySearchInput && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-10">
                            {filteredCompanies.length > 0 ? (
                              filteredCompanies.map((company) => (
                                <button
                                  key={company.id}
                                  onClick={() => {
                                    setSelectedCompany(company);
                                    setFormData({
                                      ...formData,
                                      linkedCompanyId: company.id,
                                      linkedCompanyName: company.name,
                                    });
                                    setCompanySearchInput('');
                                    setShowCompanySearch(false);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 border-b border-stone-100 last:border-b-0"
                                >
                                  {company.name}
                                </button>
                              ))
                            ) : (
                              <button
                                onClick={() => {
                                  setShowCreateCompanyPrompt(true);
                                  setShowCompanySearch(false);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-violet-600 hover:bg-violet-50 font-medium"
                              >
                                <FiPlus size={14} className="inline mr-2" />
                                Create new company: {companySearchInput}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {showCreateCompanyPrompt && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs text-yellow-800 mb-2">
                      Company "{companySearchInput}" does not exist. Use it anyway?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const company = {
                            id: `company:${companySearchInput.toLowerCase().replace(/\s+/g, '-')}`,
                            name: companySearchInput.trim(),
                          };
                          setSelectedCompany(company);
                          setFormData({
                            ...formData,
                            linkedCompanyId: company.id,
                            linkedCompanyName: company.name,
                          });
                          setShowCreateCompanyPrompt(false);
                          setCompanySearchInput('');
                        }}
                        className="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                      >
                        Use Company
                      </button>
                      <button
                        onClick={() => setShowCreateCompanyPrompt(false)}
                        className="text-xs px-3 py-1 bg-stone-300 text-stone-700 rounded hover:bg-stone-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Fund Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g., Prime Properties Fund"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Fund Code *
                  </label>
                  <input
                    type="text"
                    value={formData.fundCode}
                    onChange={(e) => setFormData({ ...formData, fundCode: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g., P3, P4"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Fund Type *
                  </label>
                  <select
                    value={formData.fundType}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        fundType: e.target.value as Fund['fundType'],
                      });
                      setActiveTab(e.target.value as Fund['fundType']);
                    }}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="Listed">Listed</option>
                    <option value="Non-Listed">Non-Listed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Registration Number *
                  </label>
                  <input
                    type="text"
                    value={formData.registrationNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, registrationNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="REG-2024-001"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Head Office Location
                  </label>
                  <input
                    type="text"
                    value={formData.headOfficeLocation}
                    onChange={(e) =>
                      setFormData({ ...formData, headOfficeLocation: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Full address"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Overview
                  </label>
                  <textarea
                    value={formData.overview}
                    onChange={(e) => setFormData({ ...formData, overview: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g., industrial, retail, mixed-use"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Fund Manager
                  </label>
                  <input
                    type="text"
                    value={formData.fundManager}
                    onChange={(e) => setFormData({ ...formData, fundManager: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Total Assets
                  </label>
                  <input
                    type="number"
                    value={formData.totalAssets}
                    onChange={(e) =>
                      setFormData({ ...formData, totalAssets: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Primary Contact Name
                  </label>
                  <input
                    type="text"
                    value={formData.primaryContactName}
                    onChange={(e) =>
                      setFormData({ ...formData, primaryContactName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Secondary Contact Name
                  </label>
                  <input
                    type="text"
                    value={formData.secondaryContactName}
                    onChange={(e) =>
                      setFormData({ ...formData, secondaryContactName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as Fund['status'] })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="Active">Active</option>
                    <option value="Closed">Closed</option>
                    <option value="In Formation">In Formation</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-stone-200">
                <button
                  onClick={() => {
                    resetForm();
                    setShowModal(false);
                  }}
                  className="flex-1 px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveFund}
                  className="flex-1 px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors font-medium"
                >
                  {selectedFund ? 'Update Fund' : 'Create Fund'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
