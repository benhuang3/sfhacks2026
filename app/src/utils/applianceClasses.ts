/** COCO class labels that map to household appliances and furniture */
export const APPLIANCE_COCO_CLASSES = [
  'microwave',
  'oven',
  'toaster',
  'refrigerator',
  'sink',
  'blender',
  'clock',
  'tv',
  'laptop',
  'mouse',
  'remote',
  'keyboard',
  'hair drier',
  'cell phone',
  'bottle',
  'chair',
  'couch',
  'bed',
  'dining table',
] as const;

export type ApplianceCOCOClass = (typeof APPLIANCE_COCO_CLASSES)[number];

export const CLASS_TO_CATEGORY: Record<ApplianceCOCOClass, string> = {
  microwave: 'kitchen',
  oven: 'kitchen',
  toaster: 'kitchen',
  refrigerator: 'kitchen',
  sink: 'kitchen',
  blender: 'kitchen',
  clock: 'bedroom',
  tv: 'entertainment',
  laptop: 'electronics',
  mouse: 'electronics',
  remote: 'electronics',
  keyboard: 'electronics',
  'hair drier': 'personal_care',
  'cell phone': 'electronics',
  bottle: 'other',
  chair: 'furniture',
  couch: 'furniture',
  bed: 'furniture',
  'dining table': 'furniture',
};

export const CLASS_DISPLAY_NAMES: Record<ApplianceCOCOClass, string> = {
  microwave: 'Microwave',
  oven: 'Oven',
  toaster: 'Toaster',
  refrigerator: 'Refrigerator',
  sink: 'Sink',
  blender: 'Blender',
  clock: 'Alarm Clock',
  tv: 'Television',
  laptop: 'Laptop',
  mouse: 'Computer Mouse',
  remote: 'Remote Control',
  keyboard: 'Keyboard',
  'hair drier': 'Hair Dryer',
  'cell phone': 'Phone/Charger',
  bottle: 'Bottle',
  chair: 'Chair',
  couch: 'Couch',
  bed: 'Bed',
  'dining table': 'Dining Table',
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
