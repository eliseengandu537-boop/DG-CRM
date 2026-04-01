import { z } from 'zod';

/**
 * Form Validation Schemas using Zod
 * Define validation rules for all forms across the CRM
 */

// Lead Form Schema
export const leadFormSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  email: z.string()
    .email('Invalid email address'),
  phone: z.string()
    .min(10, 'Phone number must be at least 10 digits')
    .optional()
    .or(z.literal('')),
  company: z.string()
    .max(100, 'Company name must be less than 100 characters')
    .optional(),
  propertyInterest: z.string()
    .min(3, 'Property interest is required'),
  leadType: z.enum(['Leasing', 'Sales', 'Auction']),
  leadSource: z.string()
    .min(2, 'Lead source is required'),
  status: z.enum(['New', 'In Progress', 'Qualified', 'Won', 'Lost']),
  estimatedValue: z.number()
    .positive('Estimated value must be greater than 0')
    .optional(),
  closingTimeline: z.string()
    .optional(),
  brokers: z.array(z.string())
    .min(1, 'At least one broker must be assigned'),
  notes: z.string()
    .optional(),
});

export type LeadFormData = z.infer<typeof leadFormSchema>;

// Deal Form Schema
export const dealFormSchema = z.object({
  propertyAddress: z.string()
    .min(5, 'Property address is required'),
  dealType: z.enum(['Sales', 'Leasing', 'Auction']),
  contractValue: z.number()
    .positive('Contract value must be greater than 0'),
  status: z.enum(['Active', 'Closed - Completed', 'Closed - Awaiting Payment', 'Closed - Cancelled']),
  closingDate: z.string()
    .min(1, 'Closing date is required'),
  brokers: z.array(z.string())
    .min(1, 'At least one broker must be assigned'),
  commissionRate: z.number()
    .min(0, 'Commission rate cannot be negative')
    .max(100, 'Commission rate cannot exceed 100'),
  notes: z.string()
    .optional(),
});

export type DealFormData = z.infer<typeof dealFormSchema>;

// Contact Form Schema
export const contactFormSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  email: z.string()
    .email('Invalid email address'),
  phone: z.string()
    .min(10, 'Phone number must be at least 10 digits')
    .optional()
    .or(z.literal('')),
  company: z.string()
    .max(100, 'Company name must be less than 100 characters')
    .optional(),
  type: z.enum(['Broker', 'Investor', 'Tenant', 'Landlord', 'Vendor']),
  status: z.enum(['Active', 'Inactive', 'Archived']),
  notes: z.string()
    .optional(),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;

// Broker Form Schema
export const brokerFormSchema = z.object({
  firstName: z.string()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be less than 50 characters'),
  lastName: z.string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must be less than 50 characters'),
  email: z.string()
    .email('Invalid email address'),
  phone: z.string()
    .min(10, 'Phone number must be at least 10 digits'),
  brokerRole: z.enum(['Manager', 'Senior Agent', 'Agent', 'Intern']),
  status: z.enum(['Active', 'Inactive', 'On Leave']),
  permissionLevel: z.enum(['View Only', 'Edit', 'Approve', 'Admin']),
  commission: z.number()
    .min(0, 'Commission cannot be negative')
    .max(100, 'Commission cannot exceed 100'),
});

export type BrokerFormData = z.infer<typeof brokerFormSchema>;

// Search Filter Schema
export const filterSchema = z.object({
  searchQuery: z.string()
    .optional(),
  status: z.string()
    .optional(),
  type: z.string()
    .optional(),
  dateFrom: z.string()
    .optional(),
  dateTo: z.string()
    .optional(),
  minValue: z.number()
    .optional(),
  maxValue: z.number()
    .optional(),
});

export type FilterData = z.infer<typeof filterSchema>;

// Property Form Schema
export const propertyFormSchema = z.object({
  address: z.string()
    .min(5, 'Address is required'),
  type: z.enum(['Retail', 'Office', 'Industrial', 'Residential', 'Mixed-Use']),
  size: z.number()
    .positive('Size must be greater than 0'),
  price: z.number()
    .positive('Price must be greater than 0'),
  status: z.enum(['Available', 'Leased', 'Reserved', 'Sold']),
  description: z.string()
    .optional(),
});

export type PropertyFormData = z.infer<typeof propertyFormSchema>;

// Validate helper
export const validateFormData = async <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Promise<{ success: boolean; data?: T; errors?: Record<string, string[]> }> => {
  try {
    const validData = await schema.parseAsync(data);
    return { success: true, data: validData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.flatten().fieldErrors as Record<string, string[]>;
      return { success: false, errors };
    }
    return { success: false, errors: { _error: ['Unknown validation error'] } };
  }
};
