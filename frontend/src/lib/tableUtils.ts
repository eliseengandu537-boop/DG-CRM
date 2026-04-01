import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  SortingState,
  VisibilityState,
  ColumnFiltersState,
  useReactTable,
  Row,
} from '@tanstack/react-table';
import { formatRand } from '@/lib/currency';

/**
 * TanStack Table Utilities and Helpers
 * Provides reusable table configurations and utilities
 */

export interface TableConfig<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  pageSize?: number;
  enableSorting?: boolean;
  enableFiltering?: boolean;
  enableSelection?: boolean;
  onRowClick?: (row: Row<TData>) => void;
}

export interface TableState {
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  columnVisibility: VisibilityState;
  rowSelection: Record<string, boolean>;
}

/**
 * Create a table instance with default configuration
 */
export const useTableInstance = <TData extends { id?: string }>(config: TableConfig<TData>) => {
  return useReactTable({
    data: config.data,
    columns: config.columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
};

// Backward-compatible alias for existing call sites.
export const createTable = useTableInstance;

/**
 * Format table value for display
 */
export const formatTableValue = (value: any, type?: string): string => {
  if (value === null || value === undefined) return '—';

  switch (type) {
    case 'currency':
      return typeof value === 'number' ? formatCurrency(value) : String(value);
    case 'date':
      return new Date(value).toLocaleDateString();
    case 'percentage':
      return `${Number(value).toFixed(2)}%`;
    case 'boolean':
      return value ? '✓' : '✗';
    default:
      return String(value);
  }
};

/**
 * Format currency value
 */
export const formatCurrency = (value: number): string => {
  return formatRand(value);
};

/**
 * Format date for table display
 */
export const formatDate = (date: Date | string): string => {
  return new Date(date).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format large numbers without abbreviating the value.
 */
export const formatLargeNumber = (value: number): string => {
  return formatRand(value);
};

/**
 * Get status badge color
 */
export const getStatusColor = (status: string): { bg: string; text: string; border: string } => {
  const statusMap: Record<string, { bg: string; text: string; border: string }> = {
    'Active': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    'Inactive': { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
    'Pending': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
    'Completed': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    'Cancelled': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    'Won': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    'Lost': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    'In Progress': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  };

  return statusMap[status] || { bg: 'bg-stone-50', text: 'text-stone-700', border: 'border-stone-200' };
};

/**
 * Export table data to CSV
 */
export const exportToCSV = <T extends Record<string, any>>(
  data: T[],
  filename: string = 'export.csv'
): void => {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header =>
        JSON.stringify(row[header] ?? '')
      ).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export table data to JSON
 */
export const exportToJSON = <T>(
  data: T[],
  filename: string = 'export.json'
): void => {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Get selected rows data
 */
export const getSelectedRowsData = <T>(
  rows: Row<T>[],
  rowSelection: Record<string, boolean>
): T[] => {
  return rows
    .filter((_, index) => rowSelection[index])
    .map(row => row.original);
};

/**
 * Filter data by search query
 */
export const filterDataBySearch = <T extends Record<string, any>>(
  data: T[],
  searchQuery: string,
  searchFields: (keyof T)[]
): T[] => {
  const lowerQuery = searchQuery.toLowerCase();
  return data.filter(item =>
    searchFields.some(field =>
      String(item[field]).toLowerCase().includes(lowerQuery)
    )
  );
};

/**
 * Sort data by multiple columns
 */
export const sortDataByColumns = <T extends Record<string, any>>(
  data: T[],
  sortConfig: Array<{ key: keyof T; direction: 'asc' | 'desc' }>
): T[] => {
  return [...data].sort((a, b) => {
    for (const { key, direction } of sortConfig) {
      const aValue = a[key];
      const bValue = b[key];

      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
    }
    return 0;
  });
};

/**
 * Paginate data
 */
export const paginateData = <T>(
  data: T[],
  page: number,
  pageSize: number
): { data: T[]; total: number; pages: number } => {
  const total = data.length;
  const pages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    data: data.slice(start, end),
    total,
    pages,
  };
};
