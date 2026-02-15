/**
 * roomsConfig.ts — Room layout & wall definitions for the 3D house
 *
 * Coordinate system:
 *   x = left-right, y = up, z = forward-backward (depth)
 *   House centered at origin (0, 0, 0)
 *
 * Layout (top-down view):
 * ┌─────────┬─────────┬───────┐
 * │ Bedroom │ Kitchen │ Bath  │
 * │ 4.5×4.5 │ 4.5×4.5 │ 3×4.5 │
 * ├─────────┼─────────┴───────┤
 * │ Living  │   Dining Room   │
 * │ 4.5×5   │     7.5×5       │
 * └─────────┴─────────────────┘
 * Total: 12 wide × 9.5 deep
 */

// ---- Type definitions ----

export type WallSide = 'north' | 'south' | 'east' | 'west';

export interface DoorDef {
  /** Which wall the door is on */
  wall: WallSide;
  /** Offset from wall center (positive = right/forward) */
  offset: number;
  /** Door width in meters */
  width: number;
  /** Door height in meters */
  height: number;
  /** Connected room ID (or 'exterior') */
  connectsTo: string;
}

export interface RoomDef {
  id: string;
  name: string;
  /** World position of room center [x, y, z] */
  position: [number, number, number];
  /** Room dimensions [width, wallHeight, depth] */
  size: [number, number, number];
  /** Doors on this room's walls */
  doors: DoorDef[];
  /** Floor material color (hex) */
  floorColor: number;
  /** Floor material roughness 0-1 */
  floorRoughness: number;
}

export interface WallDoorDef {
  /** Absolute x (horizontal wall) or z (vertical wall) coordinate of door center */
  at: number;
  /** Door width */
  width: number;
  /** Door height */
  height: number;
}

export interface WallDef {
  /** Start point [x, z] */
  from: [number, number];
  /** End point [x, z] */
  to: [number, number];
  /** Door openings along this wall */
  doors: WallDoorDef[];
  /** Is this an exterior wall? */
  exterior: boolean;
}

// ---- Constants ----

export const WALL_HEIGHT = 3.0;
export const WALL_THICKNESS = 0.15;
export const INNER_WALL_THICKNESS = WALL_THICKNESS * 0.7; // 0.105
export const DOOR_HEIGHT = 2.4;
export const DOOR_WIDTH = 1.0;

// ---- Room dimensions ----

export const BR_W = 4.5, BR_D = 4.5;  // Bedroom
export const KI_W = 4.5, KI_D = 4.5;  // Kitchen
export const BA_W = 3.0, BA_D = 4.5;  // Bathroom
export const LR_W = 4.5, LR_D = 5.0;  // Living Room
export const DN_W = 7.5, DN_D = 5.0;  // Dining Room

export const HOUSE_W = BR_W + KI_W + BA_W; // 12
export const HOUSE_D = BR_D + LR_D;        // 9.5
export const HW = HOUSE_W / 2;             // 6.0
export const HD = HOUSE_D / 2;             // 4.75

/** Horizontal divider z = -HD + BR_D = -0.25 */
export const ROW_SPLIT_Z = -HD + BR_D;

// ---- Room definitions ----

export const ROOMS: RoomDef[] = [
  {
    id: 'bedroom',
    name: 'Bedroom',
    position: [-3.75, 0, -2.5],
    size: [BR_W, WALL_HEIGHT, BR_D],
    doors: [
      { wall: 'south', offset: 0, width: 1.0, height: 2.4, connectsTo: 'living-room' },
      { wall: 'east', offset: 0, width: 1.0, height: 2.4, connectsTo: 'kitchen' },
    ],
    floorColor: 0xC4A882,
    floorRoughness: 0.7,
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    position: [0.75, 0, -2.5],
    size: [KI_W, WALL_HEIGHT, KI_D],
    doors: [
      { wall: 'west', offset: 0, width: 1.0, height: 2.4, connectsTo: 'bedroom' },
      { wall: 'south', offset: 0, width: 1.0, height: 2.4, connectsTo: 'dining-room' },
      { wall: 'east', offset: 0, width: 1.0, height: 2.4, connectsTo: 'bathroom' },
    ],
    floorColor: 0xB8B0A0,
    floorRoughness: 0.3,
  },
  {
    id: 'bathroom',
    name: 'Bathroom',
    position: [4.5, 0, -2.5],
    size: [BA_W, WALL_HEIGHT, BA_D],
    doors: [
      { wall: 'west', offset: 0, width: 1.0, height: 2.4, connectsTo: 'kitchen' },
    ],
    floorColor: 0xC8D8E8,
    floorRoughness: 0.2,
  },
  {
    id: 'living-room',
    name: 'Living Room',
    position: [-3.75, 0, 2.25],
    size: [LR_W, WALL_HEIGHT, LR_D],
    doors: [
      { wall: 'north', offset: 0, width: 1.0, height: 2.4, connectsTo: 'bedroom' },
      { wall: 'east', offset: 0, width: 1.0, height: 2.4, connectsTo: 'dining-room' },
      { wall: 'south', offset: 0, width: 1.2, height: 2.5, connectsTo: 'exterior' },
    ],
    floorColor: 0xBFA76A,
    floorRoughness: 0.6,
  },
  {
    id: 'dining-room',
    name: 'Dining Room',
    position: [2.25, 0, 2.25],
    size: [DN_W, WALL_HEIGHT, DN_D],
    doors: [
      { wall: 'north', offset: -1.5, width: 1.0, height: 2.4, connectsTo: 'kitchen' },
      { wall: 'west', offset: 0, width: 1.0, height: 2.4, connectsTo: 'living-room' },
    ],
    floorColor: 0xA08050,
    floorRoughness: 0.55,
  },
];

// ---- Wall definitions ----

/**
 * All wall segments for the house. Each wall runs from `from` to `to` in the xz plane.
 * Doors are specified by their absolute coordinate along the wall axis.
 *
 * For horizontal walls (constant z): door.at = x coordinate
 * For vertical walls (constant x): door.at = z coordinate
 */
export const WALLS: WallDef[] = [
  // Exterior walls
  { from: [-6, -4.75], to: [6, -4.75], doors: [], exterior: true },
  { from: [-6, 4.75], to: [6, 4.75], doors: [{ at: -3.75, width: 1.2, height: 2.5 }], exterior: true },
  { from: [-6, -4.75], to: [-6, 4.75], doors: [], exterior: true },
  { from: [6, -4.75], to: [6, 4.75], doors: [], exterior: true },

  // Interior horizontal (z = -0.25): top row ↔ bottom row
  {
    from: [-6, -0.25], to: [6, -0.25],
    doors: [
      { at: -3.75, width: 1.0, height: 2.4 }, // Bedroom ↔ Living
      { at: 0.75, width: 1.0, height: 2.4 },  // Kitchen ↔ Dining
    ],
    exterior: false,
  },

  // Interior vertical – top row
  {
    from: [-1.5, -4.75], to: [-1.5, -0.25],
    doors: [{ at: -2.5, width: 1.0, height: 2.4 }], // Bedroom ↔ Kitchen
    exterior: false,
  },
  {
    from: [3.0, -4.75], to: [3.0, -0.25],
    doors: [{ at: -2.5, width: 1.0, height: 2.4 }], // Kitchen ↔ Bathroom
    exterior: false,
  },

  // Interior vertical – bottom row
  {
    from: [-1.5, -0.25], to: [-1.5, 4.75],
    doors: [{ at: 2.25, width: 1.0, height: 2.4 }], // Living ↔ Dining
    exterior: false,
  },
];

// ---- Room type detection ----

export type RoomType = 'bedroom' | 'kitchen' | 'bathroom' | 'living' | 'dining' | 'office' | 'laundry' | 'garage';

export const ROOM_SLOT: Record<string, number> = {
  bedroom: 0,
  kitchen: 1,
  bathroom: 2,
  living: 3,
  dining: 4,
};
