import { z } from 'zod';

const phonePattern = /^[+]?[\d\s().-]+$/;

const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone is required')
  .refine(value => phonePattern.test(value), {
    message: 'Phone number contains invalid characters',
  })
  .refine(value => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }, {
    message: 'Phone number must contain between 7 and 15 digits',
  });

const optionalPhoneSchema = z.preprocess(
  value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  phoneSchema.optional()
);

const optionalEmailSchema = z.preprocess(
  value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().email().optional()
);

const optionalTrimmedStringSchema = z.preprocess(
  value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional()
);

const optionalNullableTrimmedStringSchema = z.preprocess(
  value => {
    if (value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return value;
  },
  z.string().trim().nullable().optional()
);

const optionalLatitudeSchema = z.preprocess(
  value => (value === '' || value === null ? undefined : value),
  z.coerce.number().min(-90).max(90).optional()
);

const optionalLongitudeSchema = z.preprocess(
  value => (value === '' || value === null ? undefined : value),
  z.coerce.number().min(-180).max(180).optional()
);

function normalizeDepartmentValue(value: unknown): 'sales' | 'leasing' | undefined {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return undefined;
  if (['sales', 'sale', 'commercial', 'commercial sales', 'commercial real estate'].includes(normalized)) {
    return 'sales';
  }
  if (['leasing', 'lease'].includes(normalized)) {
    return 'leasing';
  }
  return undefined;
}

function normalizeModuleValue(value: unknown): 'sales' | 'leasing' | 'auction' | undefined {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return undefined;
  if (normalized === 'auction') return 'auction';
  return normalizeDepartmentValue(normalized);
}

function normalizeDealTypeValue(value: unknown): 'sale' | 'lease' | 'auction' | undefined {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return undefined;
  if (normalized === 'auction') return 'auction';
  if (normalized === 'lease' || normalized === 'leasing') return 'lease';
  if (normalized === 'sale' || normalized === 'sales') return 'sale';
  return undefined;
}

function normalizeDealWorkflowStatusValue(
  value: unknown
):
  | 'LOI'
  | 'OTP'
  | 'OTL'
  | 'LEASE_AGREEMENT'
  | 'SALE_AGREEMENT'
  | 'CLOSED'
  | 'WON'
  | 'AWAITING_PAYMENT'
  | undefined {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return undefined;

  const token = normalized.replace(/[^a-z0-9]+/g, '_');
  if (token === 'loi' || token === 'letter_of_intent') return 'LOI';
  if (token === 'otp' || token === 'offer_to_purchase') return 'OTP';
  if (token === 'otl' || token === 'offer_to_lease') return 'OTL';
  if (token === 'lease_agreement') return 'LEASE_AGREEMENT';
  if (token === 'sale_agreement' || token === 'sales_agreement' || token === 'purchase_agreement') {
    return 'SALE_AGREEMENT';
  }
  if (token === 'closed' || token === 'completed') return 'CLOSED';
  if (token === 'won') return 'WON';
  if (token === 'awaiting_payment' || token === 'invoice') return 'AWAITING_PAYMENT';
  if (
    [
      'pending',
      'active',
      'action_required',
      'open',
      'new',
      'contacted',
      'qualified',
      'proposal',
      'negotiating',
      'viewing',
    ].includes(token)
  ) {
    return 'LOI';
  }
  return undefined;
}

const optionalBrokerDepartmentSchema = z.preprocess(
  value => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return normalizeDepartmentValue(value);
  },
  z.enum(['sales', 'leasing']).optional()
);

const moduleScopeSchema = z.preprocess(
  value => normalizeModuleValue(value),
  z.enum(['sales', 'leasing', 'auction'])
);

const optionalModuleScopeSchema = z.preprocess(
  value => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return normalizeModuleValue(value);
  },
  z.enum(['sales', 'leasing', 'auction']).optional()
);

const dealTypeSchema = z.preprocess(
  value => normalizeDealTypeValue(value),
  z.enum(['sale', 'lease', 'auction'])
);

const optionalDealTypeSchema = z.preprocess(
  value => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return normalizeDealTypeValue(value);
  },
  z.enum(['sale', 'lease', 'auction']).optional()
);

const dealWorkflowStatusSchema = z.preprocess(
  value => normalizeDealWorkflowStatusValue(value),
  z.enum([
    'LOI',
    'OTP',
    'OTL',
    'LEASE_AGREEMENT',
    'SALE_AGREEMENT',
    'CLOSED',
    'WON',
    'AWAITING_PAYMENT',
  ])
);

const optionalDealWorkflowStatusSchema = z.preprocess(
  value => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return normalizeDealWorkflowStatusValue(value);
  },
  z
    .enum([
      'LOI',
      'OTP',
      'OTL',
      'LEASE_AGREEMENT',
      'SALE_AGREEMENT',
      'CLOSED',
      'WON',
      'AWAITING_PAYMENT',
    ])
    .optional()
);

const optionalPercentSchema = z.preprocess(
  value => (value === '' || value === null ? undefined : value),
  z.coerce.number().min(0).max(100).optional()
);

const optionalNonNegativeNumberSchema = z.preprocess(
  value => (value === '' || value === null ? undefined : value),
  z.coerce.number().nonnegative().optional()
);

const coBrokerSplitSchema = z.object({
  brokerId: z.string().trim().min(1),
  splitPercent: z.coerce.number().min(0).max(100),
});

function validateCoBrokerTotals(
  entries: Array<{ splitPercent: number }> | undefined,
  path: string,
  ctx: z.RefinementCtx
): void {
  if (!entries || entries.length === 0) return;
  const total = entries.reduce((sum, entry) => sum + Number(entry.splitPercent || 0), 0);
  if (Math.abs(total - 100) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: 'coBroker splits must total 100%',
    });
  }
}

// Auth validators
export const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['broker']).default('broker'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token is required').optional(),
});

// Lead validators
export const createLeadSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  status: z.string().min(1).default('new'),
  brokerId: z.string().optional(),
  propertyId: z.string().optional(),
  value: z.coerce.number().nonnegative().optional(),
  moduleType: optionalModuleScopeSchema,
  stage: z.string().optional(),
  company: z.string().optional(),
  leadSource: z.string().optional(),
  dealType: optionalDealTypeSchema,
  probability: z.coerce.number().int().min(0).max(100).optional(),
  closingTimeline: z.string().optional(),
  notes: z.string().optional(),
  comment: optionalNullableTrimmedStringSchema,
  contactId: z.string().optional(),
  brokerAssigned: z.string().optional(),
  additionalBroker: z.string().optional(),
  commissionSplit: z.record(z.coerce.number()).optional(),
  propertyAddress: z.string().optional(),
  leadType: z.string().optional(),
  linkedStockId: z.string().optional(),
  dealId: z.string().optional(),
  forecastDealId: z.string().optional(),
  legalDocumentId: z.string().optional(),
});

export const updateLeadSchema = createLeadSchema.partial();

export const updateLeadCommentSchema = z.object({
  comment: optionalNullableTrimmedStringSchema,
});

// Deal validators
export const createDealSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  status: dealWorkflowStatusSchema.default('LOI'),
  type: dealTypeSchema,
  dealType: optionalDealTypeSchema,
  value: z.coerce.number().positive(),
  assetValue: optionalNonNegativeNumberSchema,
  commissionPercent: optionalPercentSchema,
  grossCommission: optionalNonNegativeNumberSchema,
  auctionReferralPercent: optionalPercentSchema,
  auctionCommissionPercent: optionalPercentSchema,
  brokerSplitPercent: optionalPercentSchema,
  coBrokers: z.array(coBrokerSplitSchema).optional(),
  coBrokerSplits: z.array(coBrokerSplitSchema).optional(),
  targetClosureDate: z.string().datetime().optional(),
  closedDate: z.string().datetime().optional(),
  leadId: z.string(),
  propertyId: z.string(),
  brokerId: z.string().optional(),
  legalDocumentId: z.string().optional(),
});

export const updateDealSchema = createDealSchema.partial();

// Broker validators
const brokerBaseSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: phoneSchema,
  company: z.string().optional(),
  department: optionalBrokerDepartmentSchema,
  billingTarget: z.coerce.number().nonnegative().default(0),
  avatar: z.string().optional(),
  status: z.enum(['active', 'inactive', 'archived']).default('active'),
});

export const createBrokerSchema = brokerBaseSchema.superRefine((data, ctx) => {
  if (!data.department && !normalizeDepartmentValue(data.company)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['department'],
      message: 'Broker department must be Sales or Leasing',
    });
  }
});

export const updateBrokerSchema = brokerBaseSchema.partial();

// Contact validators
export const createContactSchema = z.object({
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  type: z.string().min(1),
  status: z.string().min(1).default('active'),
  linkedLeadId: z.string().optional(),
  company: z.string().optional(),
  position: z.string().optional(),
  notes: z.string().optional(),
  moduleType: optionalModuleScopeSchema,
  brokerId: z.string().optional(),
  linkedPropertyIds: z.array(z.string()).optional(),
  linkedDealIds: z.array(z.string()).optional(),
});

export const updateContactSchema = createContactSchema.partial();

// Property validators
export const createPropertySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  address: z.string().min(3),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  type: z.string().min(2),
  status: z.string().optional(),
  moduleType: optionalModuleScopeSchema,
  price: z.coerce.number().nonnegative().default(0),
  area: z.coerce.number().nonnegative().default(0),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  bedrooms: z.number().int().nonnegative().optional(),
  bathrooms: z.number().int().nonnegative().optional(),
  brokerId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const updatePropertySchema = createPropertySchema.partial();

// Stock item validators
export const createStockItemSchema = z.object({
  propertyId: optionalTrimmedStringSchema,
  name: optionalTrimmedStringSchema,
  address: optionalTrimmedStringSchema,
  latitude: optionalLatitudeSchema,
  longitude: optionalLongitudeSchema,
  createdBy: optionalTrimmedStringSchema,
  module: optionalModuleScopeSchema,
  moduleType: optionalModuleScopeSchema,
  details: z.record(z.any()).optional(),
});

export const updateStockItemSchema = createStockItemSchema.partial();

// Tenant validators
export const createTenantSchema = z.object({
  companyName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  businessName: z.string().optional(),
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
  contactId: z.string().optional(),
  propertyId: z.string().optional(),
  linkedAssetId: z.string().optional(),
  linkedStockItemId: z.string().optional(),
  unitNumber: z.string().optional(),
  leaseStartDate: z.string().optional(),
  leaseEndDate: z.string().optional(),
  monthlyRent: z.coerce.number().nonnegative().optional(),
  securityDeposit: z.coerce.number().nonnegative().optional(),
  leaseStatus: z.string().optional(),
  squareFootage: z.coerce.number().nonnegative().optional(),
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
  maintenanceRequests: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().optional(),
  details: z.record(z.any()).optional(),
});

export const updateTenantSchema = createTenantSchema.partial();

// Landlord validators
export const createLandlordSchema = z.object({
  name: z.string().trim().min(1),
  contact: z.string().optional(),
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
  address: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  details: z.record(z.any()).optional(),
});

export const updateLandlordSchema = createLandlordSchema.partial();

// Industry validators
export const createIndustrySchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  occupancyRate: z.coerce.number().nonnegative().optional(),
  averageRent: z.coerce.number().nonnegative().optional(),
  status: z.string().optional(),
});

export const updateIndustrySchema = createIndustrySchema.partial();

// Auction validators
export const createAuctionSchema = z.object({
  propertyId: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  minimumBid: z.coerce.number().positive(),
  status: z.enum(['upcoming', 'active', 'closed']).default('upcoming'),
});

export const updateAuctionSchema = createAuctionSchema.partial();

// Forecast deal validators
export const createForecastDealSchema = z.object({
  dealId: z.string().optional(),
  brokerId: z.string().optional(),
  dealType: optionalDealTypeSchema,
  moduleType: moduleScopeSchema,
  status: z.string().min(2).default('Qualified'),
  title: z.string().min(2),
  expectedValue: z.coerce.number().nonnegative(),
  assetValue: optionalNonNegativeNumberSchema,
  commissionPercent: optionalPercentSchema,
  grossCommission: optionalNonNegativeNumberSchema,
  commissionRate: z.coerce.number().nonnegative().default(0),
  commissionAmount: z.coerce.number().nonnegative().default(0),
  companyCommission: z.coerce.number().nonnegative().default(0),
  brokerCommission: z.coerce.number().nonnegative().default(0),
  auctionReferralPercent: optionalPercentSchema,
  auctionCommissionPercent: optionalPercentSchema,
  brokerSplitPercent: optionalPercentSchema,
  coBrokers: z.array(coBrokerSplitSchema).optional(),
  coBrokerSplits: z.array(coBrokerSplitSchema).optional(),
  legalDocument: optionalNullableTrimmedStringSchema,
  comment: optionalNullableTrimmedStringSchema,
  forecastedClosureDate: z.string().datetime().optional(),
  expectedPaymentDate: z.string().datetime().optional(),
});

export const updateForecastDealSchema = createForecastDealSchema.partial();

export const wipStatusChangeSchema = z.object({
  dealId: z.string().min(1),
  status: z.string().trim().min(1),
  brokerId: z.string().optional(),
  legalDocument: optionalNullableTrimmedStringSchema,
  comment: optionalNullableTrimmedStringSchema,
});

export const leadWorkflowSyncSchema = z.object({
  leadId: z.string().min(1),
  status: z.string().min(1),
  moduleType: moduleScopeSchema,
  dealId: z.string().optional(),
  forecastDealId: z.string().optional(),
  stockId: z.string().optional(),
  stockName: z.string().optional(),
  stockAddress: z.string().optional(),
  propertyId: z.string().optional(),
  propertyTitle: z.string().optional(),
  propertyAddress: z.string().optional(),
  propertyCity: z.string().optional(),
  propertyProvince: z.string().optional(),
  propertyPostalCode: z.string().optional(),
  propertyType: z.string().optional(),
  propertyPrice: z.coerce.number().nonnegative().optional(),
  propertyArea: z.coerce.number().nonnegative().optional(),
  propertyStatus: z.string().optional(),
  legalDocumentId: z.string().optional(),
  notes: z.string().optional(),
  dealTitle: z.string().optional(),
  dealDescription: z.string().optional(),
  dealStatus: optionalDealWorkflowStatusSchema,
  dealType: optionalDealTypeSchema,
  dealValue: z.coerce.number().nonnegative().optional(),
  dealTargetClosureDate: z.string().datetime().optional(),
  dealClosedDate: z.string().datetime().optional(),
  brokerId: z.string().optional(),
  forecastTitle: z.string().optional(),
  forecastStatus: z.string().optional(),
  forecastExpectedValue: z.coerce.number().nonnegative().optional(),
  forecastCommissionRate: z.coerce.number().nonnegative().optional(),
  forecastCommissionAmount: z.coerce.number().nonnegative().optional(),
  forecastCompanyCommission: z.coerce.number().nonnegative().optional(),
  forecastBrokerCommission: z.coerce.number().nonnegative().optional(),
  assetValue: optionalNonNegativeNumberSchema,
  commissionPercent: optionalPercentSchema,
  grossCommission: optionalNonNegativeNumberSchema,
  brokerSplitPercent: optionalPercentSchema,
  auctionReferralPercent: optionalPercentSchema,
  auctionCommissionPercent: optionalPercentSchema,
  coBrokers: z.array(coBrokerSplitSchema).optional(),
  coBrokerSplits: z.array(coBrokerSplitSchema).optional(),
  forecastClosureDate: z.string().datetime().optional(),
  forecastPaymentDate: z.string().datetime().optional(),
  commissionSplit: z.record(z.coerce.number()).optional(),
  additionalBroker: z.string().optional(),
  contactId: z.string().optional(),
  comment: z.string().optional(),
});

// Reminder validators
export const createReminderSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().optional(),
  reminderType: z.enum(['deal_follow_up', 'call', 'task', 'email']).default('task'),
  dueAt: z.string().datetime(),
  status: z.enum(['pending', 'completed', 'cancelled']).default('pending'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dealId: z.string().optional(),
  brokerId: z.string().optional(),
  assignedUserId: z.string().optional(),
  assignedToRole: z.enum(['admin', 'manager', 'broker']).optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: phoneSchema.optional(),
});

export const updateReminderSchema = createReminderSchema.partial();

// Custom record validators
export const createCustomRecordSchema = z.object({
  entityType: z.string().trim().min(1),
  name: z.string().trim().min(1),
  status: z.string().optional(),
  category: z.string().optional(),
  referenceId: z.string().optional(),
  assignedBrokerId: z.string().optional(),
  moduleType: optionalModuleScopeSchema,
  visibilityScope: z.enum(['shared', 'private']).optional(),
  payload: z.record(z.any()).default({}),
});

export const updateCustomRecordSchema = createCustomRecordSchema.partial();

// Type exports for use in controllers
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type UpdateLeadCommentInput = z.infer<typeof updateLeadCommentSchema>;
export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;
export type CreateBrokerInput = z.infer<typeof createBrokerSchema>;
export type UpdateBrokerInput = z.infer<typeof updateBrokerSchema>;
export type LeadWorkflowSyncInput = z.infer<typeof leadWorkflowSyncSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
export type CreateStockItemInput = z.infer<typeof createStockItemSchema>;
export type UpdateStockItemInput = z.infer<typeof updateStockItemSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type CreateLandlordInput = z.infer<typeof createLandlordSchema>;
export type UpdateLandlordInput = z.infer<typeof updateLandlordSchema>;
export type CreateIndustryInput = z.infer<typeof createIndustrySchema>;
export type UpdateIndustryInput = z.infer<typeof updateIndustrySchema>;
export type CreateAuctionInput = z.infer<typeof createAuctionSchema>;
export type UpdateAuctionInput = z.infer<typeof updateAuctionSchema>;
export type CreateForecastDealInput = z.infer<typeof createForecastDealSchema>;
export type UpdateForecastDealInput = z.infer<typeof updateForecastDealSchema>;
export type WipStatusChangeInput = z.infer<typeof wipStatusChangeSchema>;
export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
export type CreateCustomRecordInput = z.infer<typeof createCustomRecordSchema>;
export type UpdateCustomRecordInput = z.infer<typeof updateCustomRecordSchema>;
