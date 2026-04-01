import {
  mapStockRecordToLeasingStock,
  mapStockRecordToSalesStock,
  serializeLeasingStock,
  serializeSalesStock,
  stockService,
} from '@/services/stockService';

type PropertyStockInput = {
  propertyId: string;
  propertyName: string;
  propertyAddress?: string;
  propertyType?: string;
  moduleScope?: 'leasing' | 'sales' | 'both';
};

function mapLeasingCategory(propertyType?: string): string {
  const lower = String(propertyType || '').toLowerCase();
  if (lower.includes('industrial')) return 'Industries';
  if (lower.includes('office') || lower.includes('commercial')) return 'Land and Office';
  return 'Shopping Center';
}

async function createLeasingStock(input: PropertyStockInput): Promise<void> {
  const existing = await stockService.getAllStockItems({
    module: 'leasing',
    propertyId: input.propertyId,
    limit: 1,
  });

  if (existing.data.some((item) => String(item.propertyId) === String(input.propertyId))) {
    return;
  }

  await stockService.createStockItem({
    module: 'leasing',
    propertyId: input.propertyId,
    details: serializeLeasingStock({
      itemName: input.propertyName,
      category: mapLeasingCategory(input.propertyType),
      condition: 'Good',
      location: input.propertyAddress || 'Unspecified',
      quantity: 1,
      purchaseDate: new Date().toISOString().split('T')[0],
      purchasePrice: 0,
      value: 0,
      availability: 'In Stock',
      comments: 'Created from property',
      notes: 'Created from property',
      linkedDeals: [],
      linkedInvoices: [],
      paymentStatus: 'Pending',
      documents: [],
      stockKind: 'property_listing',
      propertyStatus: 'For Lease',
    }),
  });
}

async function createSalesStock(input: PropertyStockInput): Promise<void> {
  const existing = await stockService.getAllStockItems({
    module: 'sales',
    propertyId: input.propertyId,
    limit: 1,
  });

  if (existing.data.some((item) => String(item.propertyId) === String(input.propertyId))) {
    return;
  }

  await stockService.createStockItem({
    module: 'sales',
    propertyId: input.propertyId,
    details: serializeSalesStock({
      itemName: input.propertyName,
      category: 'Other',
      condition: 'Good',
      location: input.propertyAddress || 'Unspecified',
      quantity: 1,
      purchaseDate: new Date().toISOString().split('T')[0],
      purchasePrice: 0,
      usageStatus: 'Available',
      assignedTo: '',
      expiryDate: '',
      comments: 'Created from property',
      dealStatus: 'Pending',
      notes: 'Created from property',
      relatedProperty: input.propertyId,
      linkedToLeasingStock: '',
      documents: [],
      stockKind: 'property_listing',
      propertyStatus: 'For Sale',
    }),
  });
}

export async function addPropertyToStocks(input: PropertyStockInput): Promise<void> {
  const scope = input.moduleScope || 'both';
  if (!input.propertyId || !input.propertyName.trim()) return;

  try {
    if (scope === 'leasing' || scope === 'both') {
      await createLeasingStock(input);
    }

    if (scope === 'sales' || scope === 'both') {
      await createSalesStock(input);
    }
  } catch (error) {
    console.warn('Failed to sync property to stock records:', error);
  }
}

export { mapStockRecordToLeasingStock, mapStockRecordToSalesStock };
