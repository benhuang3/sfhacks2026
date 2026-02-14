import { ParsedProductInfo } from './scannerTypes';

const KNOWN_BRANDS = [
  'panasonic',
  'samsung',
  'lg',
  'ge',
  'whirlpool',
  'kitchenaid',
  'cuisinart',
  'breville',
  'hamilton beach',
  'black+decker',
  'black & decker',
  'ninja',
  'instant pot',
  'keurig',
  'dyson',
  'honeywell',
  'philips',
  'sony',
  'vizio',
  'tcl',
  'hisense',
  'toshiba',
  'sharp',
  'frigidaire',
  'maytag',
  'bosch',
  'miele',
  'electrolux',
  'kenmore',
  'haier',
  'dell',
  'hp',
  'lenovo',
  'apple',
  'asus',
  'acer',
] as const;

/** Regex for model numbers: 1-4 letters, optional dash, 2-10 alphanumeric chars */
const MODEL_PATTERN = /\b[A-Z]{1,4}[-]?[A-Z0-9]{2,10}[-]?[A-Z0-9]{0,6}\b/gi;

/** Regex for wattage: 2-4 digits followed by W/Watts */
const WATTAGE_PATTERN = /(\d{2,4})\s*[Ww](?:att)?s?\b/;

/**
 * Parse OCR text results to extract brand name, model number, and wattage.
 */
export function parseProductInfo(ocrTexts: string[]): ParsedProductInfo {
  const fullText = ocrTexts.join(' ');
  const lowerText = fullText.toLowerCase();

  // Find brand
  const brand = KNOWN_BRANDS.find((b) => lowerText.includes(b));
  const brandFormatted = brand
    ? brand
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : undefined;

  // Find model number
  const modelMatches = fullText.match(MODEL_PATTERN);
  // Filter out very short matches and common false positives
  const model = modelMatches?.find(
    (m) => m.length >= 4 && !/^[A-Z]{1,3}$/.test(m)
  );

  // Find wattage
  const wattageMatch = fullText.match(WATTAGE_PATTERN);
  const wattage = wattageMatch ? parseInt(wattageMatch[1], 10) : undefined;

  return {
    brand: brandFormatted,
    model: model || undefined,
    wattage,
    rawTexts: ocrTexts,
  };
}

/**
 * Compute a confidence score for how well we identified the product.
 * Returns 0-1 where 1 = brand + model + wattage all found.
 */
export function identificationConfidence(parsed: ParsedProductInfo): number {
  let score = 0;
  if (parsed.brand) score += 0.4;
  if (parsed.model) score += 0.4;
  if (parsed.wattage) score += 0.2;
  return score;
}
