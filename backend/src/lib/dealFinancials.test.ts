import { calculateDealFinancials } from '@/lib/dealFinancials';

describe('calculateDealFinancials', () => {
  it('calculates sales commissions correctly', () => {
    const result = calculateDealFinancials({
      dealType: 'sales',
      assetValue: 10_000_000,
      commissionPercent: 3,
      brokerSplitPercent: 45,
    });

    expect(result.grossCommission).toBe(300_000);
    expect(result.brokerCommission).toBe(135_000);
    expect(result.companyCommission).toBe(165_000);
    expect(result.commissionAmount).toBe(300_000);
    expect(result.commissionRate).toBe(0.03);
  });

  it('calculates leasing commissions with co-broker split', () => {
    const result = calculateDealFinancials({
      dealType: 'leasing',
      assetValue: 1_000_000,
      grossCommission: 100_000,
      brokerSplitPercent: 45,
      coBrokers: [
        { brokerId: 'broker-a', splitPercent: 50 },
        { brokerId: 'broker-b', splitPercent: 50 },
      ],
    });

    expect(result.grossCommission).toBe(100_000);
    expect(result.brokerCommission).toBe(45_000);
    expect(result.companyCommission).toBe(55_000);
    expect(result.coBrokerSplits).toEqual([
      { brokerId: 'broker-a', splitPercent: 50, brokerShare: 22_500 },
      { brokerId: 'broker-b', splitPercent: 50, brokerShare: 22_500 },
    ]);
  });

  it('calculates auction commissions correctly', () => {
    const result = calculateDealFinancials({
      dealType: 'auction',
      assetValue: 1_000_000,
      auctionCommissionPercent: 10,
      auctionReferralPercent: 35,
      brokerSplitPercent: 45,
    });

    expect(result.grossCommission).toBe(35_000);
    expect(result.brokerCommission).toBe(15_750);
    expect(result.companyCommission).toBe(19_250);
    expect(result.commissionAmount).toBe(35_000);
  });

  it('validates co-broker split totals', () => {
    expect(() =>
      calculateDealFinancials({
        dealType: 'leasing',
        grossCommission: 100_000,
        coBrokers: [
          { brokerId: 'broker-a', splitPercent: 60 },
          { brokerId: 'broker-b', splitPercent: 30 },
        ],
      })
    ).toThrow('coBroker splits must total 100%');
  });

  it('validates percentage ranges', () => {
    expect(() =>
      calculateDealFinancials({
        dealType: 'sales',
        assetValue: 1_000_000,
        commissionPercent: 150,
      })
    ).toThrow('commissionPercent must be between 0 and 100');
  });
});
