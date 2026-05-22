// Central list of industry types used across the CRM (Leads, Contacts, Tenants,
// Stock listings). This is a placeholder set — replace/extend it with the exact
// industry types from Clynt's email when available. The values are stored as
// plain strings on records, so editing this list later is non-breaking.
export const INDUSTRY_OPTIONS: string[] = [
  'Retail',
  'Office',
  'Industrial',
  'Logistics & Warehousing',
  'Hospitality & Leisure',
  'Medical & Healthcare',
  'Automotive',
  'Financial Services',
  'Education & Training',
  'Government & Public Sector',
  'Food & Beverage',
  'Telecommunications & Technology',
  'Mining & Resources',
  'Agriculture',
  'Manufacturing',
  'Fitness & Wellness',
  'Entertainment & Media',
  'Other',
];

export const isKnownIndustry = (value: unknown): boolean =>
  typeof value === 'string' && INDUSTRY_OPTIONS.includes(value);
