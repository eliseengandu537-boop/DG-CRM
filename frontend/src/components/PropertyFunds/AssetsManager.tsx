'use client';

import React, { useEffect, useState } from 'react';
import { Asset } from '../../data/crm-types';
import { FiPlus, FiEdit2, FiTrash2, FiMapPin } from 'react-icons/fi';
import { customRecordService, type CustomRecord } from '@/services/customRecordService';

type AssetPayload = {
  propertyName: string;
  propertyAddress: string;
  centreContactNumber: string;
  linkedFundId: string;
  linkedFundName: string;
  fundType: 'Listed' | 'Non-Listed';
  latitude?: number;
  longitude?: number;
  squareFeet?: number;
  centerContacts?: string[];
  leasingStock?: string[];
  tenants?: string[];
};

type FundOption = {
  id: string;
  name: string;
  fundType: 'Listed' | 'Non-Listed';
};

const ENTITY_TYPE = 'asset';

const emptyForm = {
  propertyName: '',
  propertyAddress: '',
  centreContactNumber: '',
  linkedFundId: '',
  latitude: 0,
  longitude: 0,
  squareFeet: 0,
};

const toArray = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

const toAsset = (record: CustomRecord<Record<string, unknown>>): Asset => {
  const payload = (record.payload || {}) as Partial<AssetPayload>;
  return {
    id: record.id,
    propertyName: String(payload.propertyName || record.name || ''),
    propertyAddress: String(payload.propertyAddress || ''),
    centreContactNumber: String(payload.centreContactNumber || ''),
    linkedFundId: String(payload.linkedFundId || record.referenceId || ''),
    fundType: (payload.fundType || (record.category as 'Listed' | 'Non-Listed') || 'Listed') as
      | 'Listed'
      | 'Non-Listed',
    latitude: typeof payload.latitude === 'number' ? payload.latitude : undefined,
    longitude: typeof payload.longitude === 'number' ? payload.longitude : undefined,
    squareFeet: typeof payload.squareFeet === 'number' ? payload.squareFeet : undefined,
    centerContacts: toArray(payload.centerContacts).map((id) => ({
      id,
      name: id,
      phone: '',
      email: '',
      position: '',
      assetId: record.id,
      createdDate: new Date(record.createdAt).toISOString().split('T')[0],
    })),
    leasingStock: [],
    tenants: toArray(payload.tenants),
    createdDate: new Date(record.createdAt).toISOString().split('T')[0],
    updatedDate: new Date(record.updatedAt).toISOString().split('T')[0],
  };
};

const buildPayload = (formData: typeof emptyForm, fund: FundOption | null): AssetPayload => ({
  propertyName: formData.propertyName.trim(),
  propertyAddress: formData.propertyAddress.trim(),
  centreContactNumber: formData.centreContactNumber.trim(),
  linkedFundId: fund?.id || formData.linkedFundId.trim(),
  linkedFundName: fund?.name || '',
  fundType: fund?.fundType || 'Listed',
  latitude: Number(formData.latitude || 0) || undefined,
  longitude: Number(formData.longitude || 0) || undefined,
  squareFeet: Number(formData.squareFeet || 0) || undefined,
  centerContacts: [],
  leasingStock: [],
  tenants: [],
});

export const AssetsManager: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm });

  const refreshAssets = async () => {
    const result = await customRecordService.getAllCustomRecords<Record<string, unknown>>({
      entityType: ENTITY_TYPE,
      limit: 1000,
    });
    setAssets(result.data.map(toAsset));
  };

  const refreshFunds = async () => {
    const result = await customRecordService.getAllCustomRecords<Record<string, unknown>>({
      entityType: 'fund',
      limit: 1000,
    });
    setFunds(
      result.data.map((record) => ({
        id: record.id,
        name: record.name,
        fundType: ((record.category as 'Listed' | 'Non-Listed') || 'Listed') as
          | 'Listed'
          | 'Non-Listed',
      }))
    );
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [assetResult, fundResult] = await Promise.all([
          customRecordService.getAllCustomRecords<Record<string, unknown>>({
            entityType: ENTITY_TYPE,
            limit: 1000,
          }),
          customRecordService.getAllCustomRecords<Record<string, unknown>>({
            entityType: 'fund',
            limit: 1000,
          }),
        ]);

        if (!mounted) return;
        setAssets(assetResult.data.map(toAsset));
        setFunds(
          fundResult.data.map((record) => ({
            id: record.id,
            name: record.name,
            fundType: ((record.category as 'Listed' | 'Non-Listed') || 'Listed') as
              | 'Listed'
              | 'Non-Listed',
          }))
        );
      } catch {
        if (!mounted) return;
        setAssets([]);
        setFunds([]);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const resetForm = () => {
    setFormData({ ...emptyForm });
    setSelectedAsset(null);
  };

  const handleCreateAsset = async () => {
    if (!formData.propertyName || !formData.propertyAddress || !formData.linkedFundId) {
      alert('Please fill all required fields');
      return;
    }

    const linkedFund = funds.find((fund) => fund.id === formData.linkedFundId);
    if (!linkedFund) {
      alert('Invalid fund selected');
      return;
    }

    const payload = buildPayload(formData, linkedFund);

    try {
      if (selectedAsset) {
        await customRecordService.updateCustomRecord(selectedAsset.id, {
          name: formData.propertyName.trim(),
          status: 'active',
          category: linkedFund.fundType,
          referenceId: linkedFund.id,
          payload,
        });
      } else {
        await customRecordService.createCustomRecord({
          entityType: ENTITY_TYPE,
          name: formData.propertyName.trim(),
          status: 'active',
          category: linkedFund.fundType,
          referenceId: linkedFund.id,
          payload,
        });
      }

      await refreshAssets();
      resetForm();
      setShowModal(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save asset');
    }
  };

  const handleEditAsset = (asset: Asset) => {
    setFormData({
      propertyName: asset.propertyName,
      propertyAddress: asset.propertyAddress,
      centreContactNumber: asset.centreContactNumber,
      linkedFundId: asset.linkedFundId,
      latitude: asset.latitude || 0,
      longitude: asset.longitude || 0,
      squareFeet: asset.squareFeet || 0,
    });
    setSelectedAsset(asset);
    setShowModal(true);
  };

  const handleDeleteAsset = async (id: string) => {
    if (!confirm('Are you sure you want to delete this asset?')) return;
    try {
      await customRecordService.deleteCustomRecord(id);
      await refreshAssets();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete asset');
    }
  };

  const getLinkedFund = (fundId: string) => funds.find((fund) => fund.id === fundId);

  const getFundTypeColor = (type: string) =>
    type === 'Listed' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Assets / Properties</h2>
          <p className="text-stone-600 text-sm mt-1">
            Manage properties and link to investment funds
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FiPlus size={18} />
          + Property
        </button>
      </div>

      <div className="space-y-4">
        {assets.map((asset) => {
          const linkedFund = getLinkedFund(asset.linkedFundId);
          return (
            <div
              key={asset.id}
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FiMapPin className="text-violet-500" size={20} />
                    <h3 className="text-lg font-bold text-stone-900">{asset.propertyName}</h3>
                  </div>
                  <p className="text-sm text-stone-600 mt-1">{asset.propertyAddress}</p>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded ${getFundTypeColor(
                    asset.fundType
                  )}`}
                >
                  {asset.fundType}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                <div>
                  <p className="text-stone-600">Centre Contact</p>
                  <p className="font-medium text-stone-900">{asset.centreContactNumber}</p>
                </div>
                <div>
                  <p className="text-stone-600">Linked Fund</p>
                  <p className="font-medium text-stone-900 text-xs">{linkedFund?.name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-stone-600">Square Feet</p>
                  <p className="font-medium text-stone-900">
                    {asset.squareFeet ? asset.squareFeet.toLocaleString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-stone-600">Active Tenants</p>
                  <p className="font-medium text-stone-900">{asset.tenants.length}</p>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="text-xs text-stone-500">Created: {asset.createdDate}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditAsset(asset)}
                    className="text-violet-500 hover:text-violet-700 transition-colors"
                    title="Edit"
                  >
                    <FiEdit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDeleteAsset(asset.id)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                    title="Delete"
                  >
                    <FiTrash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-4">
                {selectedAsset ? 'Edit Property' : 'Create New Property'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Property Name *
                  </label>
                  <input
                    type="text"
                    value={formData.propertyName}
                    onChange={(e) => setFormData({ ...formData, propertyName: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g., Prime Office Block"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Linked Fund *
                  </label>
                  <select
                    value={formData.linkedFundId}
                    onChange={(e) => setFormData({ ...formData, linkedFundId: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">Select a fund...</option>
                    {funds.map((fund) => (
                      <option key={fund.id} value={fund.id}>
                        {fund.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Property Address *
                  </label>
                  <input
                    type="text"
                    value={formData.propertyAddress}
                    onChange={(e) => setFormData({ ...formData, propertyAddress: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Full address with city and province"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Centre Contact Number
                  </label>
                  <input
                    type="tel"
                    value={formData.centreContactNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, centreContactNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="+27 11 234 5678"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Square Feet
                  </label>
                  <input
                    type="number"
                    value={formData.squareFeet}
                    onChange={(e) =>
                      setFormData({ ...formData, squareFeet: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Latitude (Optional)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.latitude}
                    onChange={(e) =>
                      setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Longitude (Optional)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.longitude}
                    onChange={(e) =>
                      setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    resetForm();
                    setShowModal(false);
                  }}
                  className="flex-1 px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAsset}
                  className="flex-1 px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  {selectedAsset ? 'Update Property' : 'Create Property'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

