/** COCO class labels that map to household appliances */
export const APPLIANCE_COCO_CLASSES = [
  'microwave',
  'oven',
  'toaster',
  'refrigerator',
  'clock',
  'tv',
  'laptop',
  'hair drier',
  'cell phone',
] as const;

export type ApplianceCOCOClass = (typeof APPLIANCE_COCO_CLASSES)[number];

export const CLASS_TO_CATEGORY: Record<ApplianceCOCOClass, string> = {
  microwave: 'kitchen',
  oven: 'kitchen',
  toaster: 'kitchen',
  refrigerator: 'kitchen',
  clock: 'bedroom',
  tv: 'entertainment',
  laptop: 'electronics',
  'hair drier': 'personal_care',
  'cell phone': 'electronics',
};

export const CLASS_DISPLAY_NAMES: Record<ApplianceCOCOClass, string> = {
  microwave: 'Microwave',
  oven: 'Oven',
  toaster: 'Toaster',
  refrigerator: 'Refrigerator',
  clock: 'Alarm Clock',
  tv: 'Television',
  laptop: 'Laptop',
  'hair drier': 'Hair Dryer',
  'cell phone': 'Phone/Charger',
};

export function isApplianceClass(label: string): boolean {
  return APPLIANCE_COCO_CLASSES.includes(label as ApplianceCOCOClass);
}

export function getCategory(label: string): string {
  return CLASS_TO_CATEGORY[label as ApplianceCOCOClass] ?? 'other';
}

export function getDisplayName(label: string): string {
  return CLASS_DISPLAY_NAMES[label as ApplianceCOCOClass] ?? label;
}
