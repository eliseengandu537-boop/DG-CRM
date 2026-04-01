export interface ParsedDealTitle {
  dealName: string;
  location: string;
}

/**
 * Splits composite titles like "Deal Name - 123 Main Rd" into:
 * - dealName: "Deal Name"
 * - location: "123 Main Rd"
 */
export function parseDealTitle(title?: string | null): ParsedDealTitle {
  const normalized = String(title || '').trim();
  if (!normalized) {
    return { dealName: 'Untitled Deal', location: '-' };
  }

  const separators = [' - ', ' | ', ' @ '];
  for (const separator of separators) {
    if (!normalized.includes(separator)) continue;
    const [namePart, ...locationParts] = normalized.split(separator);
    const dealName = String(namePart || '').trim();
    const location = locationParts.join(separator).trim();
    if (dealName && location) {
      return { dealName, location };
    }
  }

  return { dealName: normalized, location: '-' };
}
