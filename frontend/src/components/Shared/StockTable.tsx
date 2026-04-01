'use client';

import React from 'react';
import { StockItem } from '@/data/unified-schema';
import { FiEdit2, FiTrash2, FiEye } from 'react-icons/fi';
import { formatRand } from '@/lib/currency';

interface StockTableProps {
  items: StockItem[];
  onEdit?: (item: StockItem) => void;
  onDelete?: (id: string) => void;
  onView?: (item: StockItem) => void;
  showActions?: boolean;
  compact?: boolean;
}

export const StockTable: React.FC<StockTableProps> = ({
  items,
  onEdit,
  onDelete,
  onView,
  showActions = true,
  compact = false,
}) => {
  const statusColors: Record<string, string> = {
    Available: 'bg-green-100 text-green-800',
    Leased: 'bg-blue-100 text-blue-800',
    Reserved: 'bg-yellow-100 text-yellow-800',
    Maintenance: 'bg-orange-100 text-orange-800',
    Sold: 'bg-red-100 text-red-800',
  };

  const formatPrice = (price: number, type: string) => {
    const suffix = type === 'per_sqm' ? '/m²' : type === 'per_sqft' ? '/ft²' : '';
    return `${formatRand(price)}${suffix ? ` ${suffix}` : ''}`;
  };

  if (compact) {
    return (
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-center text-gray-500 py-4">No stock items found</p>
        ) : (
          items.map(item => (
            <div
              key={item.id}
              className="p-3 bg-white border border-gray-200 rounded-lg flex items-center justify-between gap-2 hover:shadow-md transition-shadow"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{item.itemName}</p>
                <p className="text-xs text-gray-500">{item.sizeSquareMeter}m² • {item.location}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${statusColors[item.status]}`}>
                  {item.status}
                </span>
                {showActions && (
                  <div className="flex gap-1">
                    {onView && (
                      <button onClick={() => onView(item)} className="p-1 hover:bg-gray-100 rounded">
                        <FiEye size={16} className="text-gray-600" />
                      </button>
                    )}
                    {onEdit && (
                      <button onClick={() => onEdit(item)} className="p-1 hover:bg-gray-100 rounded">
                        <FiEdit2 size={16} className="text-blue-600" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Item Name</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Location</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Size</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Price</th>
            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">Status</th>
            {showActions && (
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={showActions ? 6 : 5} className="px-4 py-8 text-center text-gray-500">
                No stock items found
              </td>
            </tr>
          ) : (
            items.map(item => (
              <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{item.itemName}</p>
                    <p className="text-xs text-gray-500">{item.category}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{item.location}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-600">{item.sizeSquareMeter}m²</td>
                <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                  {formatPrice(item.price, item.pricingType)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[item.status]}`}>
                    {item.status}
                  </span>
                </td>
                {showActions && (
                  <td className="px-4 py-3 text-center flex gap-1 justify-center">
                    {onView && (
                      <button
                        onClick={() => onView(item)}
                        className="p-2 hover:bg-gray-200 rounded transition-colors"
                        title="View"
                      >
                        <FiEye size={18} className="text-gray-600" />
                      </button>
                    )}
                    {onEdit && (
                      <button
                        onClick={() => onEdit(item)}
                        className="p-2 hover:bg-gray-200 rounded transition-colors"
                        title="Edit"
                      >
                        <FiEdit2 size={18} className="text-blue-600" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(item.id)}
                        className="p-2 hover:bg-gray-200 rounded transition-colors"
                        title="Delete"
                      >
                        <FiTrash2 size={18} className="text-red-600" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default StockTable;
