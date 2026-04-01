'use client';

import React, { useEffect, useState } from 'react';
import { LeasingStockItem } from '../../data/crm-types';
import { FiPlus, FiEdit2, FiTrash2, FiTag } from 'react-icons/fi';
import { brokerService } from '@/services/brokerService';
import { customRecordService } from '@/services/customRecordService';
import {
  mapStockRecordToLeasingStock,
  serializeLeasingStock,
  stockService,
} from '@/services/stockService';

type AssetOption = {
  id: string;
  name: string;
};

type BrokerOption = {
  id: string;
  name: string;
};

const emptyForm = {
  centreItemName: '',
  retailCategory: '',
  sizeSquareMeter: 0,
  locationWithinCentre: '',
  pricingType: 'per_sqm' as 'per_sqm' | 'gross_rental',
  price: 0,
  dateObtained: '',
  assignedBrokerId: '',
  comments: '',
  assetId: '',
  status: 'Available' as 'Available' | 'Leased' | 'Reserved' | 'Maintenance',
};

export const LeasingStockManager: React.FC = () => {
  const [stock, setStock] = useState<LeasingStockItem[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LeasingStockItem | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm });

  const refreshStock = async () => {
    const result = await stockService.getAllStockItems({ module: 'leasing', limit: 1000 });
    setStock(result.data.map((item) => mapStockRecordToLeasingStock(item)));
  };

  const refreshOptions = async () => {
    const [assetResult, brokerList] = await Promise.all([
      customRecordService.getAllCustomRecords<Record<string, unknown>>({
        entityType: 'asset',
        limit: 1000,
      }),
      brokerService.getAllBrokers(),
    ]);

    setAssets(assetResult.data.map((record) => ({ id: record.id, name: record.name })));
    setBrokers(
      brokerList.map((broker) => ({
        id: broker.id,
        name: broker.name,
      }))
    );
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [stockResult, assetResult, brokerList] = await Promise.all([
          stockService.getAllStockItems({ module: 'leasing', limit: 1000 }),
          customRecordService.getAllCustomRecords<Record<string, unknown>>({
            entityType: 'asset',
            limit: 1000,
          }),
          brokerService.getAllBrokers(),
        ]);

        if (!mounted) return;
        setStock(stockResult.data.map((item) => mapStockRecordToLeasingStock(item)));
        setAssets(assetResult.data.map((record) => ({ id: record.id, name: record.name })));
        setBrokers(
          brokerList.map((broker) => ({
            id: broker.id,
            name: broker.name,
          }))
        );
      } catch {
        if (!mounted) return;
        setStock([]);
        setAssets([]);
        setBrokers([]);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const resetForm = () => {
    setFormData({ ...emptyForm });
    setSelectedItem(null);
  };

  const handleCreateItem = async () => {
    if (
      !formData.centreItemName ||
      !formData.retailCategory ||
      !formData.assetId ||
      !formData.dateObtained ||
      formData.sizeSquareMeter <= 0 ||
      formData.price <= 0
    ) {
      alert('Please fill all required fields with valid values');
      return;
    }

    const asset = assets.find((item) => item.id === formData.assetId);
    if (!asset) {
      alert('Invalid asset selected');
      return;
    }

    const broker = brokers.find((item) => item.id === formData.assignedBrokerId);
    const payload = {
      ...serializeLeasingStock(formData),
      itemName: formData.centreItemName.trim(),
      assignedBroker: broker?.name || '',
      propertyName: asset.name,
    };

    try {
      if (selectedItem) {
        await stockService.updateStockItem(String(selectedItem.id), {
          module: 'leasing',
          propertyId: formData.assetId,
          details: payload,
        });
      } else {
        await stockService.createStockItem({
          module: 'leasing',
          propertyId: formData.assetId,
          details: payload,
        });
      }

      await refreshStock();
      resetForm();
      setShowModal(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save stock item');
    }
  };

  const handleEditItem = (item: LeasingStockItem) => {
    setFormData({
      centreItemName: item.centreItemName,
      retailCategory: item.retailCategory,
      sizeSquareMeter: item.sizeSquareMeter,
      locationWithinCentre: item.locationWithinCentre,
      pricingType: item.pricingType,
      price: item.price,
      dateObtained: item.dateObtained,
      assignedBrokerId: item.assignedBrokerId || '',
      comments: item.comments,
      assetId: item.assetId,
      status: item.status,
    });
    setSelectedItem(item);
    setShowModal(true);
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this stock item?')) return;
    try {
      await stockService.deleteStockItem(String(id));
      await refreshStock();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete stock item');
    }
  };

  const getAssetName = (assetId: string) => assets.find((asset) => asset.id === assetId)?.name || 'N/A';

  const getBrokerName = (brokerId: string | undefined) => {
    if (!brokerId) return 'Unassigned';
    return brokers.find((broker) => broker.id === brokerId)?.name || 'N/A';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Available':
        return 'bg-green-100 text-green-800';
      case 'Leased':
        return 'bg-blue-100 text-blue-800';
      case 'Reserved':
        return 'bg-yellow-100 text-yellow-800';
      case 'Maintenance':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-stone-100 text-stone-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Leasing Stock</h2>
          <p className="text-stone-600 text-sm mt-1">Manage available units and spaces</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <FiPlus size={18} />
          + Item
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-stone-100 border-b border-stone-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Center Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Asset
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Size (sqm) / Price
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Broker
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-stone-900">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {stock.map((item) => (
                <tr key={item.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FiTag size={16} className="text-violet-500" />
                      <div>
                        <p className="font-medium text-stone-900">{item.centreItemName}</p>
                        <p className="text-xs text-stone-600">{item.locationWithinCentre}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-700">{item.retailCategory}</td>
                  <td className="px-6 py-4 text-sm text-stone-700">{getAssetName(item.assetId)}</td>
                  <td className="px-6 py-4 text-sm">
                    <div>
                      <p className="font-medium text-stone-900">{item.sizeSquareMeter} sqm</p>
                      <p className="text-stone-600">
                        {item.pricingType === 'per_sqm'
                          ? `R ${item.price}/sqm`
                          : `R ${item.price.toLocaleString()}/month`}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-700">
                    {getBrokerName(item.assignedBrokerId)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded ${getStatusColor(
                        item.status
                      )}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditItem(item)}
                        className="text-violet-500 hover:text-violet-700 transition-colors"
                        title="Edit"
                      >
                        <FiEdit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                        title="Delete"
                      >
                        <FiTrash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-96 overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-900 mb-4">
                {selectedItem ? 'Edit Stock Item' : 'Add New Stock Item'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Item Name *
                  </label>
                  <input
                    type="text"
                    value={formData.centreItemName}
                    onChange={(e) =>
                      setFormData({ ...formData, centreItemName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g., Unit 101 - Premium Retail"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Asset *
                  </label>
                  <select
                    value={formData.assetId}
                    onChange={(e) => setFormData({ ...formData, assetId: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">Select an asset...</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Category *
                  </label>
                  <input
                    type="text"
                    value={formData.retailCategory}
                    onChange={(e) => setFormData({ ...formData, retailCategory: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g., Fashion, Food & Beverage"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Size (sqm) *
                  </label>
                  <input
                    type="number"
                    value={formData.sizeSquareMeter}
                    onChange={(e) =>
                      setFormData({ ...formData, sizeSquareMeter: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Location Within Centre *
                  </label>
                  <input
                    type="text"
                    value={formData.locationWithinCentre}
                    onChange={(e) =>
                      setFormData({ ...formData, locationWithinCentre: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="e.g., Ground Floor, Main Corridor"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Pricing Type *
                  </label>
                  <select
                    value={formData.pricingType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        pricingType: e.target.value as 'per_sqm' | 'gross_rental',
                      })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="per_sqm">Per Square Meter</option>
                    <option value="gross_rental">Gross Rental (Monthly)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Price *
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder={formData.pricingType === 'per_sqm' ? 'R/sqm' : 'R/month'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Date Obtained *
                  </label>
                  <input
                    type="date"
                    value={formData.dateObtained}
                    onChange={(e) => setFormData({ ...formData, dateObtained: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Assigned Broker
                  </label>
                  <select
                    value={formData.assignedBrokerId}
                    onChange={(e) =>
                      setFormData({ ...formData, assignedBrokerId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">Unassigned</option>
                    {brokers.map((broker) => (
                      <option key={broker.id} value={broker.id}>
                        {broker.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="Available">Available</option>
                    <option value="Leased">Leased</option>
                    <option value="Reserved">Reserved</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Comments
                  </label>
                  <textarea
                    value={formData.comments}
                    onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                    rows={2}
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
                  onClick={handleCreateItem}
                  className="flex-1 px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                >
                  {selectedItem ? 'Update Item' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
