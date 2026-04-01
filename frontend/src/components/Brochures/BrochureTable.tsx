import React from 'react';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';

export interface BrochureTableRow {
  id: string;
  brochureName: string;
  brokerName: string;
  date: string;
  propertyType: string;
}

interface BrochureTableProps {
  brochures: BrochureTableRow[];
  canDelete: boolean;
  deletingId?: string | null;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export const BrochureTable: React.FC<BrochureTableProps> = ({
  brochures,
  canDelete,
  deletingId,
  onEdit,
  onDelete,
}) => {
  if (brochures.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow p-6 border-2 border-stone-200 mb-8">
        <p className="text-stone-600 text-sm">No brochures found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow border-2 border-stone-200 mb-8 overflow-hidden">
      <div className="px-6 py-4 border-b border-stone-200 bg-stone-50">
        <h3 className="text-lg font-bold text-stone-900">Brochures Table</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-stone-700">
                Brochure Name
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-stone-700">Broker Name</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-stone-700">Created Date</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-stone-700">Property Type</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-stone-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {brochures.map(row => (
              <tr key={row.id} className="hover:bg-stone-50">
                <td className="px-6 py-4 text-sm font-medium text-stone-900">{row.brochureName}</td>
                <td className="px-6 py-4 text-sm text-stone-700">{row.brokerName || '-'}</td>
                <td className="px-6 py-4 text-sm text-stone-700">{row.date || '-'}</td>
                <td className="px-6 py-4 text-sm text-stone-700">{row.propertyType || '-'}</td>
                <td className="px-6 py-4 text-sm">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onEdit(row.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 transition"
                    >
                      <FiEdit2 size={14} />
                      Edit
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => onDelete(row.id)}
                        disabled={deletingId === row.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition"
                      >
                        <FiTrash2 size={14} />
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BrochureTable;
