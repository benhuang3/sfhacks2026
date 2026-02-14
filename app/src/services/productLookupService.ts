import { ApplianceLookupResult, ApplianceEnergyProfile, ParsedProductInfo } from '../utils/scannerTypes';
import applianceDb from '../../../ai/data/appliance_energy_db.json';

const db = applianceDb as ApplianceEnergyProfile[];

/**
 * Look up an appliance and return a simplified result with brand, model, name, and region.
 * Falls back through: exact match → brand+category → category guess → parsed info.
 */
export function lookupAppliance(
  parsed: ParsedProductInfo,
  category?: string
): ApplianceLookupResult | null {
  // Exact match: brand + model
  if (parsed.brand && parsed.model) {
    const exact = db.find(
      (a) =>
        a.brand.toLowerCase() === parsed.brand!.toLowerCase() &&
        a.model.toLowerCase() === parsed.model!.toLowerCase()
    );
    if (exact) {
      return {
        brand: exact.brand,
        model: exact.model,
        name: exact.displayName,
        region: 'US',
      };
    }
  }

  // Brand match: find any product from the same brand in the category
  if (parsed.brand && category) {
    const brandMatch = db.find(
      (a) =>
        a.brand.toLowerCase() === parsed.brand!.toLowerCase() &&
        a.category === category
    );
    if (brandMatch) {
      return {
        brand: brandMatch.brand,
        model: parsed.model || brandMatch.model,
        name: brandMatch.displayName,
        region: 'US',
      };
    }
  }

  // Category match: return first item in category as a guess
  if (category) {
    const categoryMatch = db.find((a) => a.category === category);
    if (categoryMatch) {
      return {
        brand: parsed.brand || categoryMatch.brand,
        model: parsed.model || categoryMatch.model,
        name: categoryMatch.displayName,
        region: 'US',
      };
    }
  }

  // Build from parsed info if we have anything
  if (parsed.brand || parsed.model) {
    return {
      brand: parsed.brand || 'Unknown',
      model: parsed.model || 'Unknown',
      name: `${parsed.brand || 'Unknown'} ${parsed.model || 'appliance'}`,
      region: 'US',
    };
  }

  return null;
}

/**
 * Search by display name / keyword (for manual search).
 */
export function searchAppliances(query: string): ApplianceLookupResult[] {
  const lower = query.toLowerCase();
  return db
    .filter(
      (a) =>
        a.displayName.toLowerCase().includes(lower) ||
        a.brand.toLowerCase().includes(lower) ||
        a.model.toLowerCase().includes(lower)
    )
    .map((a) => ({
      brand: a.brand,
      model: a.model,
      name: a.displayName,
      region: 'US',
    }));
}
