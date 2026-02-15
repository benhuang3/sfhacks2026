/**
 * Shared energy calculation constants and category utilities.
 * Single source of truth — used by UploadScanScreen, DashboardScreen, etc.
 */

/** Electricity rate in $/kWh */
export const RATE_PER_KWH = 0.30;

/** Carbon emissions factor in kg CO₂ per kWh (US average, EPA) */
export const CO2_PER_KWH = 0.42;

/** kg CO₂ absorbed per tree per year (EPA estimate) */
export const TREE_ABSORBS_PER_YEAR = 21.77;

/** Average US appliance yearly kWh (for comparison) */
export const US_AVG_APPLIANCE_KWH = 200;

/** Default assumed daily usage hours */
export const DEFAULT_USAGE_HOURS = 4;

/** Selectable usage hour options */
export const USAGE_HOUR_OPTIONS = [1, 2, 4, 6, 8, 12] as const;

/** Map appliance category to display icon */
export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    'Television': '📺',
    'Refrigerator': '🧊',
    'Microwave': '🍳',
    'Laptop': '💻',
    'Oven': '🔥',
    'Toaster': '🍞',
    'Hair Dryer': '💨',
    'Washing Machine': '🧺',
    'Dryer': '🌀',
    'Air Conditioner': '❄️',
    'Space Heater': '🔥',
    'Monitor': '🖥️',
    'Light Bulb': '💡',
    'Phone Charger': '🔌',
  };
  return icons[category] || '🔌';
}

/** Map appliance category to chart color */
export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    'Television': '#2196F3',
    'Refrigerator': '#00BCD4',
    'Microwave': '#FF9800',
    'Laptop': '#9C27B0',
    'Oven': '#F44336',
    'Toaster': '#FF5722',
    'Hair Dryer': '#E91E63',
    'Washing Machine': '#3F51B5',
    'Dryer': '#673AB7',
    'Air Conditioner': '#00ACC1',
    'Space Heater': '#FF5722',
    'Monitor': '#7C4DFF',
    'Light Bulb': '#FFC107',
    'Phone Charger': '#607D8B',
  };
  return colors[category] || '#4CAF50';
}
