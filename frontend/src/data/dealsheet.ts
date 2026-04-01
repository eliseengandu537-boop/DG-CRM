// Deal Sheet Data Types and Mock Data

export interface ForecastDeal {
  id: string;
  dealName: string;
  dealType: 'Leasing' | 'Sales' | 'Auction';
  quarter: string;
  year: number;
  expectedValue: number;
  probability: number; // 0-100%
  status: 'Pipeline' | 'Qualified' | 'Proposal' | 'Negotiating';
  contactName: string;
  propertyName: string;
  forecastedClosureDate: string;
  weightedValue: number; // expectedValue * (probability / 100)
}

export interface CompletedDeal {
  id: string;
  dealName: string;
  dealType: 'Leasing' | 'Sales' | 'Auction';
  closedDate: string;
  actualValue: number;
  category: 'Lease' | 'Sale' | 'Auction';
  counterparty: string;
  propertyName: string;
  commissionRate: number; // percentage
  commissionAmount: number;
  status: 'Completed' | 'In Progress';
}

export interface DealAwaitingPayment {
  id: string;
  dealName: string;
  dealType: 'Leasing' | 'Sales' | 'Auction';
  closedDate: string;
  expectedPaymentDate: string;
  dealValue: number;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: 'Overdue' | 'Due Soon' | 'On Track';
  counterparty: string;
}

export interface ConversionMetrics {
  leasingOpportunities: number;
  leasingWon: number;
  leasingConversionRate: number;
  salesOpportunities: number;
  salesWon: number;
  salesConversionRate: number;
  auctionOpportunities: number;
  auctionWon: number;
  auctionConversionRate: number;
  overallConversionRate: number;
}

// Mock Forecast Deals Data
export const forecastDeals: ForecastDeal[] = [];

// Mock Completed Deals Data
export const completedDeals: CompletedDeal[] = [];

// Mock Deals Awaiting Payment Data
export const dealsAwaitingPayment: DealAwaitingPayment[] = [];

// Calculate Conversion Metrics
export const calculateConversionMetrics = (): ConversionMetrics => {
  const allDeals = forecastDeals;
  
  const leasingOps = allDeals.filter(d => d.dealType === 'Leasing').length;
  const leasingCompleted = completedDeals.filter(d => d.dealType === 'Leasing').length;
  
  const salesOps = allDeals.filter(d => d.dealType === 'Sales').length;
  const salesCompleted = completedDeals.filter(d => d.dealType === 'Sales').length;
  
  const auctionOps = allDeals.filter(d => d.dealType === 'Auction').length;
  const auctionCompleted = completedDeals.filter(d => d.dealType === 'Auction').length;
  
  const totalOps = allDeals.length;
  const totalCompleted = completedDeals.length;

  return {
    leasingOpportunities: leasingOps,
    leasingWon: leasingCompleted,
    leasingConversionRate: leasingOps > 0 ? (leasingCompleted / leasingOps) * 100 : 0,
    salesOpportunities: salesOps,
    salesWon: salesCompleted,
    salesConversionRate: salesOps > 0 ? (salesCompleted / salesOps) * 100 : 0,
    auctionOpportunities: auctionOps,
    auctionWon: auctionCompleted,
    auctionConversionRate: auctionOps > 0 ? (auctionCompleted / auctionOps) * 100 : 0,
    overallConversionRate: totalOps > 0 ? (totalCompleted / totalOps) * 100 : 0,
  };
};
