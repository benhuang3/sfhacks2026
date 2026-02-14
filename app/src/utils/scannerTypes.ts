export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Detection {
  bbox: BBox;
  label: string;
  score: number;
}

export interface TrackedObject {
  id: string;
  bbox: BBox;
  label: string;
  score: number;
  framesSinceLastSeen: number;
  identificationAttempted: boolean;
  productInfo?: ProductInfo;
  croppedImageUri?: string;
}

export interface ProductInfo {
  brand: string;
  model: string;
  displayName: string;
  confirmed: boolean;
  wattage?: number;
  lookup?: ApplianceLookupResult;
  energyProfile?: ApplianceEnergyProfile;
}

export interface ApplianceLookupResult {
  brand: string;
  model: string;
  name: string;
  region: string;
}

export interface ApplianceEnergyProfile {
  brand: string;
  model: string;
  category: string;
  displayName: string;
  avgWatts: number;
  standbyWatts: number;
  annualKwh: number;
  yearManufactured?: number;
}

export interface OCRResult {
  text: string;
  confidence: number;
  bbox: BBox;
}

export interface ParsedProductInfo {
  brand?: string;
  model?: string;
  wattage?: number;
  rawTexts: string[];
}

export type ScannerState =
  | 'idle'
  | 'loading'
  | 'scanning'
  | 'identifying'
  | 'confirming';
