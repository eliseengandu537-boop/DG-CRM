import {
  buildPropertyStockDetails,
  inferPropertyModuleType,
  inferStockModuleFromProperty,
  isStockEligiblePropertyStatus,
  normalizePropertyStatus,
  PROPERTY_STATUS_AUCTION,
  PROPERTY_STATUS_FOR_LEASE,
  PROPERTY_STATUS_FOR_SALE,
} from '@/lib/propertyStatus';

describe('propertyStatus helpers', () => {
  it('normalizes stock-eligible property statuses', () => {
    expect(normalizePropertyStatus('for_sale')).toBe(PROPERTY_STATUS_FOR_SALE);
    expect(normalizePropertyStatus('for lease')).toBe(PROPERTY_STATUS_FOR_LEASE);
    expect(normalizePropertyStatus('auction')).toBe(PROPERTY_STATUS_AUCTION);
  });

  it('infers module scope from status and type', () => {
    expect(
      inferPropertyModuleType({
        status: 'For Lease',
      })
    ).toBe('leasing');

    expect(
      inferPropertyModuleType({
        type: 'Sales',
      })
    ).toBe('sales');

    expect(
      inferPropertyModuleType({
        metadata: { moduleScope: 'auction' },
      })
    ).toBe('auction');
  });

  it('detects stock-eligible statuses', () => {
    expect(isStockEligiblePropertyStatus('For Sale')).toBe(true);
    expect(isStockEligiblePropertyStatus('Owned')).toBe(false);
  });

  it('chooses the stock module from property status', () => {
    expect(
      inferStockModuleFromProperty({
        status: 'For Sale',
        moduleType: 'sales',
      })
    ).toBe('sales');

    expect(
      inferStockModuleFromProperty({
        status: 'Auction',
      })
    ).toBe('auction');
  });

  it('builds property stock details from canonical property data', () => {
    const details = buildPropertyStockDetails({
      title: 'Sandton Office Park',
      description: 'Prime commercial listing',
      address: '100 Rivonia Road',
      city: 'Sandton',
      province: 'Gauteng',
      postalCode: '2196',
      type: 'Office',
      price: 25000000,
      area: 4200,
      latitude: -26.1076,
      longitude: 28.0567,
      status: 'For Sale',
      moduleType: 'sales',
      brokerId: 'broker-1',
      metadata: {
        linkedFundName: 'Prime Fund',
      },
    });

    expect(details.stockKind).toBe('property_listing');
    expect(details.propertyStatus).toBe('For Sale');
    expect(details.propertyName).toBe('Sandton Office Park');
    expect(details.moduleScope).toBe('sales');
    expect(details.linkedFundName).toBe('Prime Fund');
  });
});
