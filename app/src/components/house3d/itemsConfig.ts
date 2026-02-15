/**
 * itemsConfig.ts — Furniture placement definitions per room
 *
 * Each item's position is LOCAL to the room center (0, 0, 0).
 * Valid ranges depend on room size (with ~0.25m wall margin):
 *   Bedroom 4.5×4.5: x ∈ [-2.0, 2.0], z ∈ [-2.0, 2.0]
 *   Kitchen 4.5×4.5: x ∈ [-2.0, 2.0], z ∈ [-2.0, 2.0]
 *   Bathroom 3×4.5:  x ∈ [-1.2, 1.2], z ∈ [-2.0, 2.0]
 *   Living 4.5×5:    x ∈ [-2.0, 2.0], z ∈ [-2.2, 2.2]
 *   Dining 7.5×5:    x ∈ [-3.5, 3.5], z ∈ [-2.2, 2.2]
 */

export type FurnitureType =
  | 'bed' | 'wardrobe' | 'bedsideTable' | 'studyDesk' | 'deskChair' | 'dresser'
  | 'kitchenCounter' | 'cookingCounter' | 'kitchenIsland' | 'barStool' | 'potRack'
  | 'bathtub' | 'toilet' | 'sink' | 'mirror' | 'towelRack'
  | 'sofa' | 'coffeeTable' | 'tvStand' | 'floorLamp' | 'plant'
  | 'diningTable' | 'diningChair' | 'chinaCabinet' | 'chandelier'
  | 'desk' | 'officeChair' | 'bookshelf' | 'filingCabinet';

export interface ItemDef {
  /** Unique item identifier */
  id: string;
  /** Room this item belongs to */
  roomId: string;
  /** Furniture type (maps to builder function) */
  type: FurnitureType;
  /** Position relative to room center [x, y, z] */
  position: [number, number, number];
  /** Y-axis rotation in radians */
  rotationY: number;
  /** Uniform scale multiplier */
  scale: number;
}

/**
 * Minimum required furniture per room type (from spec):
 *   bedroom:  bed + wardrobe
 *   bathroom: toilet + sink + bathtub
 *   living:   sofa + coffeeTable + tvStand
 *   dining:   table + 4 chairs
 *   kitchen:  counter + sink (integrated) + cooking area
 *   office:   desk + chair
 *
 * Current placement uses buildBedroom/buildKitchen/etc. which place
 * furniture at hardcoded local coordinates within the room group.
 * This config documents those positions for reference and future
 * config-driven placement.
 */
export const ITEMS: ItemDef[] = [
  // ==== Bedroom (4.5 × 4.5, center at origin) ====
  { id: 'br-bed',        roomId: 'bedroom', type: 'bed',          position: [-0.4, 0, -1.0],  rotationY: 0, scale: 1 },
  { id: 'br-desk',       roomId: 'bedroom', type: 'studyDesk',    position: [-1.52, 0, 0.5],  rotationY: 0, scale: 1 },
  { id: 'br-chair',      roomId: 'bedroom', type: 'deskChair',    position: [-1.05, 0, 0.5],  rotationY: 0, scale: 1 },
  { id: 'br-dresser',    roomId: 'bedroom', type: 'dresser',      position: [0.5, 0, 0.5],    rotationY: 0, scale: 1 },
  { id: 'br-nightstand', roomId: 'bedroom', type: 'bedsideTable', position: [0.6, 0, -1.5],   rotationY: 0, scale: 1 },
  { id: 'br-wardrobe',   roomId: 'bedroom', type: 'wardrobe',     position: [1.6, 0, 0.1],    rotationY: 0, scale: 1 },

  // ==== Kitchen (4.5 × 4.5) ====
  { id: 'ki-sinkCounter',   roomId: 'kitchen', type: 'kitchenCounter',  position: [0, 0, -1.72],  rotationY: 0, scale: 1 },
  { id: 'ki-cookingCounter', roomId: 'kitchen', type: 'cookingCounter', position: [0, 0, -0.72],  rotationY: 0, scale: 1 },
  { id: 'ki-island',        roomId: 'kitchen', type: 'kitchenIsland',  position: [0.5, 0, 0.8],  rotationY: 0, scale: 1 },

  // ==== Bathroom (3 × 4.5) ====
  { id: 'ba-tub',    roomId: 'bathroom', type: 'bathtub',   position: [0.5, 0, -1.2],  rotationY: 0, scale: 1 },
  { id: 'ba-toilet', roomId: 'bathroom', type: 'toilet',    position: [-0.5, 0, 0.2],  rotationY: 0, scale: 1 },
  { id: 'ba-sink',   roomId: 'bathroom', type: 'sink',      position: [0.6, 0, 1.4],   rotationY: 0, scale: 1 },
  { id: 'ba-mirror', roomId: 'bathroom', type: 'mirror',    position: [0.6, 0, 1.74],  rotationY: 0, scale: 1 },
  { id: 'ba-towels', roomId: 'bathroom', type: 'towelRack', position: [1.1, 0, 0.0],   rotationY: 0, scale: 1 },

  // ==== Living Room (4.5 × 5) ====
  { id: 'lr-tvstand', roomId: 'living-room', type: 'tvStand',     position: [-0.8, 0, -2.0],  rotationY: 0, scale: 1 },
  { id: 'lr-table',   roomId: 'living-room', type: 'coffeeTable', position: [0, 0, 0.4],      rotationY: 0, scale: 1 },
  { id: 'lr-sofa',    roomId: 'living-room', type: 'sofa',        position: [0, 0, 2.0],      rotationY: 0, scale: 1 },
  { id: 'lr-lamp',    roomId: 'living-room', type: 'floorLamp',   position: [-1.4, 0, 0.3],   rotationY: 0, scale: 1 },
  { id: 'lr-plant',   roomId: 'living-room', type: 'plant',       position: [-1.4, 0, 2.0],   rotationY: 0, scale: 1 },

  // ==== Dining Room (7.5 × 5) ====
  { id: 'dn-table',   roomId: 'dining-room', type: 'diningTable', position: [0, 0, 0],        rotationY: 0, scale: 1 },
  { id: 'dn-ch-n',    roomId: 'dining-room', type: 'diningChair', position: [0, 0, -1.3],     rotationY: 0, scale: 1 },
  { id: 'dn-ch-s',    roomId: 'dining-room', type: 'diningChair', position: [0, 0, 1.3],      rotationY: Math.PI, scale: 1 },
  { id: 'dn-ch-w',    roomId: 'dining-room', type: 'diningChair', position: [-1.95, 0, 0],    rotationY: Math.PI / 2, scale: 1 },
  { id: 'dn-ch-e',    roomId: 'dining-room', type: 'diningChair', position: [1.95, 0, 0],     rotationY: -Math.PI / 2, scale: 1 },
  { id: 'dn-cab-l',   roomId: 'dining-room', type: 'chinaCabinet', position: [-2.5, 0, 1.93], rotationY: 0, scale: 1 },
  { id: 'dn-cab-r',   roomId: 'dining-room', type: 'chinaCabinet', position: [2.5, 0, 1.93],  rotationY: 0, scale: 1 },
];

/**
 * Validate that all items are within their room's bounds.
 * Returns an array of violation messages.
 */
export function validateItemBounds(
  items: ItemDef[],
  roomSizes: Record<string, [number, number, number]>,
  margin = 0.25,
): string[] {
  const violations: string[] = [];
  for (const item of items) {
    const size = roomSizes[item.roomId];
    if (!size) continue;
    const [w, , d] = size;
    const [x, , z] = item.position;
    const hw = w / 2 - margin;
    const hd = d / 2 - margin;
    if (Math.abs(x) > hw || Math.abs(z) > hd) {
      violations.push(
        `${item.id} (${item.type}) at [${x},${z}] exceeds ${item.roomId} bounds [±${hw.toFixed(1)}, ±${hd.toFixed(1)}]`,
      );
    }
  }
  return violations;
}
