/**
 * modelRegistry.ts — Maps furniture/device types to GLB/GLTF model paths
 *
 * When a model URL is provided, House3DViewer will attempt to load the GLB
 * using Three.js GLTFLoader, falling back to procedural geometry on failure.
 *
 * To add a model:
 * 1. Place the .glb file in app/assets/models/
 * 2. Host it on a CDN or serve via your backend
 * 3. Add the URL to the appropriate type key below
 *
 * Model requirements:
 * - Format: .glb preferred (binary glTF, smaller downloads)
 * - Poly count: < 5000 for furniture, < 2000 for devices
 * - Scale: 1 unit = 1 meter
 * - Origin: centered at base of object
 * - Up axis: Y-up
 */

export interface ModelEntry {
  /** URL to the GLB file */
  url: string;
  /** Scale multiplier to apply after loading */
  scale: number;
  /** Y-axis rotation offset in radians */
  rotationY: number;
}

/**
 * TYPE → GLB model mapping.
 * Uncomment and fill in URLs as models become available.
 * Empty object = all types use procedural fallback.
 */
export const MODEL_REGISTRY: Record<string, ModelEntry> = {
  // ---- Furniture ----
  // 'bed':            { url: 'https://cdn.example.com/models/bed.glb', scale: 1.0, rotationY: 0 },
  // 'wardrobe':       { url: 'https://cdn.example.com/models/wardrobe.glb', scale: 1.0, rotationY: 0 },
  // 'sofa':           { url: 'https://cdn.example.com/models/sofa.glb', scale: 1.0, rotationY: 0 },
  // 'coffeeTable':    { url: 'https://cdn.example.com/models/coffee_table.glb', scale: 1.0, rotationY: 0 },
  // 'tvStand':        { url: 'https://cdn.example.com/models/tv_stand.glb', scale: 1.0, rotationY: 0 },
  // 'diningTable':    { url: 'https://cdn.example.com/models/dining_table.glb', scale: 1.0, rotationY: 0 },
  // 'diningChair':    { url: 'https://cdn.example.com/models/dining_chair.glb', scale: 1.0, rotationY: 0 },
  // 'bathtub':        { url: 'https://cdn.example.com/models/bathtub.glb', scale: 1.0, rotationY: 0 },
  // 'toilet':         { url: 'https://cdn.example.com/models/toilet.glb', scale: 1.0, rotationY: 0 },
  // 'sink':           { url: 'https://cdn.example.com/models/sink.glb', scale: 1.0, rotationY: 0 },
  // 'kitchenCounter': { url: 'https://cdn.example.com/models/kitchen_counter.glb', scale: 1.0, rotationY: 0 },
  // 'desk':           { url: 'https://cdn.example.com/models/desk.glb', scale: 1.0, rotationY: 0 },
  // 'officeChair':    { url: 'https://cdn.example.com/models/office_chair.glb', scale: 1.0, rotationY: 0 },

  // ---- Devices (override per device category) ----
  // 'Television':     { url: 'https://cdn.example.com/models/tv.glb', scale: 0.5, rotationY: 0 },
  // 'Refrigerator':   { url: 'https://cdn.example.com/models/fridge.glb', scale: 0.5, rotationY: 0 },
  // 'Microwave':      { url: 'https://cdn.example.com/models/microwave.glb', scale: 0.5, rotationY: 0 },
  // 'Laptop':         { url: 'https://cdn.example.com/models/laptop.glb', scale: 0.5, rotationY: 0 },
};

/**
 * Get model entry for a given furniture type or device category.
 * Returns undefined if no model is registered → use procedural fallback.
 */
export function getModel(type: string): ModelEntry | undefined {
  return MODEL_REGISTRY[type];
}

/**
 * Check if a GLB model is available for a given type.
 */
export function hasModel(type: string): boolean {
  return type in MODEL_REGISTRY;
}

/**
 * Inject model URLs into the WebView HTML template.
 * Returns a JSON-safe string for embedding in the script.
 */
export function getModelUrlsJson(): string {
  const urls: Record<string, string> = {};
  for (const [key, entry] of Object.entries(MODEL_REGISTRY)) {
    urls[key] = entry.url;
  }
  return JSON.stringify(urls);
}
