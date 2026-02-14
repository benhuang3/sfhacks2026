import applianceDb from '../../../ai/data/appliance_energy_db.json';

interface ApplianceDbEntry {
  brand: string;
  model: string;
  category: string;
  displayName: string;
  avgWatts: number;
  standbyWatts: number;
  annualKwh: number;
  yearManufactured?: number;
}

interface ApplianceLookupResult {
  brand: string;
  model: string;
  name: string;
  region: string;
}

const db = applianceDb as ApplianceDbEntry[];

function toLookupResult(entry: ApplianceDbEntry): ApplianceLookupResult {
  return {
    brand: entry.brand,
    model: entry.model,
    name: entry.displayName,
    region: 'US',
  };
}

export function searchAppliances(query: string): ApplianceLookupResult[] {
  const lower = query.toLowerCase();
  return db
    .filter(
      (a) =>
        a.displayName.toLowerCase().includes(lower) ||
        a.brand.toLowerCase().includes(lower) ||
        a.model.toLowerCase().includes(lower)
    )
    .map(toLookupResult);
}

export function getApplianceByBrandModel(
  brand: string,
  model?: string
): ApplianceLookupResult[] {
  const lowerBrand = brand.toLowerCase();

  if (model) {
    const lowerModel = model.toLowerCase();
    const exact = db.filter(
      (a) =>
        a.brand.toLowerCase() === lowerBrand &&
        a.model.toLowerCase() === lowerModel
    );
    if (exact.length > 0) return exact.map(toLookupResult);
  }

  return db.filter((a) => a.brand.toLowerCase() === lowerBrand).map(toLookupResult);
}

export function getAppliancesByCategory(
  category: string
): ApplianceLookupResult[] {
  return db.filter((a) => a.category === category).map(toLookupResult);
}
