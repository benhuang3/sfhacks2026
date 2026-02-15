/**
 * House3DViewer — Interactive roofless 3D house with built-in furniture
 *
 * Features:
 *  - No roof → you look down into rooms
 *  - Built-in 3D furniture per room type (living room sofa/TV, kitchen counter,
 *    bedroom bed/dresser, bathroom tub/toilet, office desk/chair)
 *  - 360° drag rotation + pinch zoom + mouse wheel
 *  - Auto-rotate when idle
 *  - Device markers with pulsing glow
 *  - Tap room → tooltip with device list
 *  - Runs inside WebView (Expo Go compatible)
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

interface DeviceInfo {
  label: string;
  category: string;
  roomId: string;
}

interface RoomInfo {
  roomId: string;
  name: string;
}

interface House3DViewerProps {
  rooms?: RoomInfo[];
  devices?: DeviceInfo[];
  isDark?: boolean;
  height?: number;
}

export function House3DViewer({
  rooms = [
    { roomId: 'living-room', name: 'Living Room' },
    { roomId: 'bedroom', name: 'Bedroom' },
    { roomId: 'office', name: 'Office' },
    { roomId: 'dining-room', name: 'Dining Room' },
    { roomId: 'kitchen', name: 'Kitchen' },
  ],
  devices = [],
  isDark = true,
  height = 400,
}: House3DViewerProps) {

  const htmlContent = useMemo(() => {
    const roomsJson = JSON.stringify(rooms);
    const devicesJson = JSON.stringify(devices);
    const bg = isDark ? '#0d0d1a' : '#f0f0f5';
    const textColor = isDark ? '#ffffff' : '#1a1a2e';

    return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: ${bg}; overflow: hidden; touch-action: none; font-family: -apple-system, system-ui, sans-serif; }
  canvas { display: block; width: 100%; height: 100%; }
  #info {
    position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
    color: ${textColor}; font-size: 10px; opacity: 0.5; pointer-events: none;
    text-align: center; white-space: nowrap;
  }
  #tooltip {
    position: absolute; display: none; padding: 10px 16px; border-radius: 12px;
    background: ${isDark ? 'rgba(10,10,30,0.95)' : 'rgba(255,255,255,0.97)'};
    color: ${textColor}; font-size: 12px; pointer-events: none;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4); backdrop-filter: blur(8px);
    border: 1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'};
    max-width: 220px; z-index: 10;
  }
  #tooltip .tt-room { font-weight: 700; font-size: 14px; color: #4CAF50; margin-bottom: 6px; }
  #tooltip .tt-devices { font-size: 11px; opacity: 0.85; line-height: 1.5; }
  #tooltip .tt-device { padding: 2px 0; }
</style>
</head>
<body>
<div id="tooltip"></div>
<div id="info">Drag to rotate · Pinch to zoom · Tap room for details</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
<script>
(function() {
  const ROOMS = ${roomsJson};
  const DEVICES = ${devicesJson};
  const IS_DARK = ${isDark};

  // ================================================================
  // Scene Setup
  // ================================================================
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('${bg}');
  scene.fog = new THREE.FogExp2('${bg}', 0.008);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(16, 14, 16);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  document.body.appendChild(renderer.domElement);

  // ================================================================
  // Lighting
  // ================================================================
  scene.add(new THREE.AmbientLight(0xffffff, IS_DARK ? 0.35 : 0.55));

  const sun = new THREE.DirectionalLight(0xffeedd, IS_DARK ? 0.9 : 1.1);
  sun.position.set(10, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(IS_DARK ? 0x4466aa : 0x88aaff, 0.25);
  fill.position.set(-8, 5, -6);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.15);
  rim.position.set(0, 8, -12);
  scene.add(rim);

  // ================================================================
  // Materials
  // ================================================================
  const M = {
    wall:      new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x3a3a50 : 0xf0ece0, roughness: 0.7, side: THREE.DoubleSide }),
    wallInner: new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x44445a : 0xe8e4d8, roughness: 0.65 }),
    floor:     new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x2a2a3e : 0xddd8cc, roughness: 0.85 }),
    ground:    new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x151520 : 0xb8c8b0, roughness: 1.0 }),
    window:    new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x66aaff : 0x88ccff, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.3 }),
    door:      new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x5a3a20 : 0x8B4513, roughness: 0.5 }),
    wood:      new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.6 }),
    darkWood:  new THREE.MeshStandardMaterial({ color: 0x5C3317, roughness: 0.55 }),
    metal:     new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 }),
    fabric:    new THREE.MeshStandardMaterial({ color: 0x4466AA, roughness: 0.9 }),
    leather:   new THREE.MeshStandardMaterial({ color: 0x3A3A3A, roughness: 0.7 }),
    white:     new THREE.MeshStandardMaterial({ color: 0xEEEEEE, roughness: 0.5 }),
    ceramic:   new THREE.MeshStandardMaterial({ color: 0xF5F5F0, roughness: 0.3, metalness: 0.05 }),
    counter:   new THREE.MeshStandardMaterial({ color: 0x888080, roughness: 0.25, metalness: 0.1 }),
    mattress:  new THREE.MeshStandardMaterial({ color: 0xEEE8DD, roughness: 0.95 }),
    pillow:    new THREE.MeshStandardMaterial({ color: 0xF8F4EE, roughness: 0.9 }),
    cushion:   new THREE.MeshStandardMaterial({ color: 0x5577BB, roughness: 0.85 }),
    screen:    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.5 }),
    screenOn:  new THREE.MeshStandardMaterial({ color: 0x3388FF, roughness: 0.05, emissive: 0x1144AA, emissiveIntensity: 0.3 }),
    tile:      new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x445566 : 0xc8d8e8, roughness: 0.3 }),
    rug:       new THREE.MeshStandardMaterial({ color: 0x884422, roughness: 1.0 }),
    plant:     new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.8 }),
    pot:       new THREE.MeshStandardMaterial({ color: 0x8D6E63, roughness: 0.7 }),
    stove:     new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.6 }),
    fridge:    new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.2, metalness: 0.4 }),
  };

  const ROOM_COLORS = [0x4CAF50, 0xFF9800, 0x2196F3, 0x9C27B0, 0xF44336, 0x00BCD4, 0xE91E63, 0xFFEB3B];

  // ================================================================
  // Helper — box with shadow
  // ================================================================
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent || scene).add(m);
    return m;
  }
  function cyl(rT, rB, h, seg, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent || scene).add(m);
    return m;
  }

  // ================================================================
  // Ground
  // ================================================================
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), M.ground);
  gnd.rotation.x = -Math.PI / 2;
  gnd.position.y = -0.02;
  gnd.receiveShadow = true;
  scene.add(gnd);

  // ================================================================
  // House Group
  // ================================================================
  const house = new THREE.Group();
  scene.add(house);

  const WALL_H = 3.0;
  const WALL_T = 0.15;

  // 5-room floor plan (matches architectural layout image):
  //  ┌──────────┬──────────────┬──────────┐
  //  │ Bedroom  │   Kitchen    │ Bathroom │  top row (depth 4.5)
  //  │ (4×4.5)  │   (5×4.5)    │ (3×4.5)  │
  //  ├──────────┼──────────────┴──────────┤
  //  │  Living  │      Dining Room       │  bottom row (depth 5)
  //  │  (4×5)   │        (8×5)           │
  //  └──────────┴────────────────────────┘
  //  Total: 12 wide × 9.5 deep
  const BR_W = 4, BR_D = 4.5;    // bedroom (top-left)
  const KI_W = 5, KI_D = 4.5;    // kitchen (top-center)
  const BA_W = 3, BA_D = 4.5;    // bathroom (top-right)
  const LR_W = 4, LR_D = 5;     // living room (bottom-left)
  const DN_W = 8, DN_D = 5;     // dining room (bottom-right)
  const TOTAL_W = BR_W + KI_W + BA_W;  // 12
  const TOTAL_D = BR_D + LR_D;         // 9.5

  var HW = TOTAL_W / 2;  // 6
  var HD = TOTAL_D / 2;  // 4.75
  const GRID = [
    // Top row (depth 4.5)
    { col: 0, row: 0, x: -HW + BR_W/2, z: -HD + BR_D/2, w: BR_W, d: BR_D },                       // bedroom
    { col: 1, row: 0, x: -HW + BR_W + KI_W/2, z: -HD + KI_D/2, w: KI_W, d: KI_D },                // kitchen
    { col: 2, row: 0, x: -HW + BR_W + KI_W + BA_W/2, z: -HD + BA_D/2, w: BA_W, d: BA_D },          // bathroom
    // Bottom row (depth 5)
    { col: 0, row: 1, x: -HW + LR_W/2, z: -HD + BR_D + LR_D/2, w: LR_W, d: LR_D },                // living room
    { col: 1, row: 1, x: -HW + LR_W + DN_W/2, z: -HD + BR_D + DN_D/2, w: DN_W, d: DN_D },          // dining room
  ];

  function roomType(id) {
    const l = id.toLowerCase();
    if (l.includes('living')) return 'living';
    if (l.includes('kitchen')) return 'kitchen';
    if (l.includes('bed'))    return 'bedroom';
    if (l.includes('bath'))   return 'bathroom';
    if (l.includes('dining')) return 'dining';
    if (l.includes('office') || l.includes('study')) return 'office';
    if (l.includes('garage')) return 'garage';
    if (l.includes('laundry')) return 'laundry';
    return 'living';
  }

  // ================================================================
  // Furniture builders — coordinates stay within each room's bounds
  // Bedroom (4×4.5 → ±1.8x, ±2.05z), Kitchen (5×4.5 → ±2.3x, ±2.05z)
  // Bathroom (3×4.5 → ±1.3x, ±2.05z), Living (4×5 → ±1.8x, ±2.3z)
  // Dining (8×5 → ±3.8x, ±2.3z)
  // NO electronics — only furniture and decorations
  // ================================================================

  function buildBedroom(g) {
    // === NEW BED MODEL (detailed wooden frame with headboard carving) ===
    // Bed frame base with carved legs
    box(1.5, 0.12, 1.9, M.darkWood, -0.4, 0.06, -1.0, g);
    // Four decorative corner posts
    box(0.08, 0.35, 0.08, M.darkWood, -1.1, 0.24, -1.9, g);
    box(0.08, 0.35, 0.08, M.darkWood, 0.3, 0.24, -1.9, g);
    box(0.06, 0.25, 0.06, M.darkWood, -1.1, 0.18, -0.08, g);
    box(0.06, 0.25, 0.06, M.darkWood, 0.3, 0.18, -0.08, g);
    // Headboard with panels
    box(1.5, 0.7, 0.06, M.darkWood, -0.4, 0.48, -1.93, g);
    box(0.55, 0.45, 0.02, new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.6 }), -0.7, 0.52, -1.91, g);
    box(0.55, 0.45, 0.02, new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.6 }), -0.1, 0.52, -1.91, g);
    // Footboard
    box(1.5, 0.28, 0.06, M.darkWood, -0.4, 0.26, -0.05, g);
    // Mattress with quilted texture
    box(1.35, 0.2, 1.75, M.mattress, -0.4, 0.23, -0.98, g);
    // Pillows (rounded)
    var pillow1 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), M.pillow);
    pillow1.position.set(-0.7, 0.42, -1.6); pillow1.scale.set(1.1, 0.5, 0.7); g.add(pillow1);
    var pillow2 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), M.pillow);
    pillow2.position.set(-0.1, 0.42, -1.6); pillow2.scale.set(1.1, 0.5, 0.7); g.add(pillow2);
    // Blanket folded
    box(1.25, 0.06, 0.9, new THREE.MeshStandardMaterial({ color: 0x4A6FA5, roughness: 0.9 }), -0.4, 0.38, -0.5, g);

    // === NEW STUDY TABLE MODEL (L-shaped desk with drawers) ===
    // Main desktop
    box(0.55, 0.03, 1.0, new THREE.MeshStandardMaterial({ color: 0xD4A574, roughness: 0.4 }), -1.52, 0.74, 0.5, g);
    // Drawer unit under desk
    box(0.35, 0.35, 0.45, M.wood, -1.62, 0.4, 0.2, g);
    // Drawer fronts
    box(0.32, 0.1, 0.02, new THREE.MeshStandardMaterial({ color: 0xC19A6B, roughness: 0.5 }), -1.62, 0.52, -0.03, g);
    box(0.32, 0.1, 0.02, new THREE.MeshStandardMaterial({ color: 0xC19A6B, roughness: 0.5 }), -1.62, 0.38, -0.03, g);
    box(0.32, 0.1, 0.02, new THREE.MeshStandardMaterial({ color: 0xC19A6B, roughness: 0.5 }), -1.62, 0.24, -0.03, g);
    // Drawer handles
    cyl(0.015, 0.015, 0.06, 6, M.metal, -1.62, 0.52, -0.06, g);
    cyl(0.015, 0.015, 0.06, 6, M.metal, -1.62, 0.38, -0.06, g);
    cyl(0.015, 0.015, 0.06, 6, M.metal, -1.62, 0.24, -0.06, g);
    // Table legs (tapered)
    box(0.04, 0.56, 0.04, M.wood, -1.75, 0.28, 0.95, g);
    box(0.04, 0.56, 0.04, M.wood, -1.3, 0.28, 0.95, g);
    // Desktop items (lamp, books)
    cyl(0.06, 0.08, 0.02, 12, M.metal, -1.68, 0.77, 0.8, g);
    cyl(0.02, 0.02, 0.18, 8, M.metal, -1.68, 0.87, 0.8, g);
    cyl(0.08, 0.04, 0.08, 8, new THREE.MeshStandardMaterial({ color: 0xFFEB3B, roughness: 0.7 }), -1.68, 1.0, 0.8, g);

    // === NEW CHAIR MODEL (ergonomic office chair) ===
    // Seat cushion (curved)
    var seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.06, 16), M.leather);
    seat.position.set(-1.05, 0.48, 0.5); seat.scale.set(1, 1, 1.1); g.add(seat);
    // Backrest (curved)
    box(0.38, 0.35, 0.04, M.leather, -1.05, 0.72, 0.72, g);
    // Armrests
    box(0.04, 0.04, 0.2, M.darkWood, -1.22, 0.56, 0.55, g);
    box(0.04, 0.04, 0.2, M.darkWood, -0.88, 0.56, 0.55, g);
    // Central column
    cyl(0.03, 0.03, 0.3, 8, M.metal, -1.05, 0.3, 0.5, g);
    // 5-star base
    for (var angle = 0; angle < 5; angle++) {
      var ax = -1.05 + Math.cos(angle * 1.257) * 0.15;
      var az = 0.5 + Math.sin(angle * 1.257) * 0.15;
      box(0.03, 0.02, 0.18, M.metal, ax, 0.1, az, g);
      cyl(0.02, 0.02, 0.04, 8, new THREE.MeshStandardMaterial({ color: 0x333333 }), ax + (ax + 1.05) * 0.3, 0.03, az + (az - 0.5) * 0.3, g);
    }

    // === NEW FURNITURE/DRESSER MODEL (modern chest with mirror cabinet) ===
    // Main chest body
    box(0.9, 0.85, 0.42, M.wood, 0.5, 0.43, 0.5, g);
    // Four drawers with decorative fronts
    for (var dy = 0; dy < 4; dy++) {
      var drawY = 0.15 + dy * 0.2;
      box(0.8, 0.15, 0.02, new THREE.MeshStandardMaterial({ color: 0xBDA17C, roughness: 0.5 }), 0.5, drawY, 0.72, g);
      // Two handles per drawer
      cyl(0.012, 0.012, 0.04, 6, M.metal, 0.35, drawY, 0.75, g);
      cyl(0.012, 0.012, 0.04, 6, M.metal, 0.65, drawY, 0.75, g);
    }
    // Decorative top trim
    box(0.95, 0.03, 0.45, M.darkWood, 0.5, 0.88, 0.5, g);
  }

  function buildKitchen(g) {
    // === NEW SINK COUNTER MODEL (modern farmhouse style with double sink) ===
    // Counter cabinet base with panel doors
    box(3.9, 0.8, 0.58, new THREE.MeshStandardMaterial({ color: 0xFAF0E6, roughness: 0.6 }), 0, 0.4, -1.72, g);
    // Cabinet door panels
    for (var dx = -1.5; dx <= 1.5; dx += 0.75) {
      box(0.6, 0.6, 0.02, new THREE.MeshStandardMaterial({ color: 0xF5F5DC, roughness: 0.5 }), dx, 0.4, -1.42, g);
      cyl(0.015, 0.015, 0.04, 6, M.metal, dx + 0.22, 0.4, -1.4, g);
    }
    // Granite countertop with lip
    box(4.0, 0.06, 0.65, new THREE.MeshStandardMaterial({ color: 0x2F4F4F, roughness: 0.3, metalness: 0.1 }), 0, 0.83, -1.7, g);
    box(4.0, 0.04, 0.03, new THREE.MeshStandardMaterial({ color: 0x2F4F4F, roughness: 0.3 }), 0, 0.81, -1.38, g);
    // Double farmhouse sink (apron front)
    box(0.65, 0.2, 0.45, M.ceramic, 1.0, 0.76, -1.68, g);
    box(0.28, 0.15, 0.38, new THREE.MeshStandardMaterial({ color: 0xDDDDDD, roughness: 0.2 }), 0.85, 0.71, -1.68, g);
    box(0.28, 0.15, 0.38, new THREE.MeshStandardMaterial({ color: 0xDDDDDD, roughness: 0.2 }), 1.15, 0.71, -1.68, g);
    // Modern gooseneck faucet
    cyl(0.02, 0.02, 0.25, 8, M.metal, 1.0, 0.98, -1.92, g);
    var faucetArch = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 8, 12, Math.PI), M.metal);
    faucetArch.position.set(1.0, 1.1, -1.84); faucetArch.rotation.x = Math.PI / 2; g.add(faucetArch);
    cyl(0.012, 0.012, 0.08, 6, M.metal, 1.0, 1.06, -1.76, g);
    // Faucet handles
    cyl(0.025, 0.02, 0.04, 8, M.metal, 0.85, 0.9, -1.92, g);
    cyl(0.025, 0.02, 0.04, 8, M.metal, 1.15, 0.9, -1.92, g);

    // === NEW COOKING COUNTER MODEL (professional range with hood) ===
    // Lower cabinet in contrasting color
    box(3.9, 0.8, 0.58, new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.5 }), 0, 0.4, -0.72, g);
    // Dark countertop
    box(4.0, 0.06, 0.65, new THREE.MeshStandardMaterial({ color: 0x1C1C1C, roughness: 0.25, metalness: 0.2 }), 0, 0.83, -0.7, g);
    // Professional gas range
    box(0.8, 0.12, 0.55, new THREE.MeshStandardMaterial({ color: 0x303030, roughness: 0.4, metalness: 0.3 }), -0.5, 0.92, -0.72, g);
    // Control panel
    box(0.75, 0.08, 0.03, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 }), -0.5, 0.88, -0.47, g);
    // Control knobs
    for (var kx = -0.72; kx <= -0.28; kx += 0.22) {
      cyl(0.025, 0.025, 0.02, 12, M.metal, kx, 0.88, -0.44, g);
    }
    // Six burner grates with flames
    for (var brow = 0; brow < 2; brow++) {
      for (var bcol = 0; bcol < 3; bcol++) {
        var gbx = -0.72 + bcol * 0.22;
        var gbz = -0.85 + brow * 0.25;
        // Grate
        box(0.16, 0.02, 0.16, new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.8 }), gbx, 1.0, gbz, g);
        // Burner ring
        cyl(0.06, 0.06, 0.015, 16, new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5 }), gbx, 0.98, gbz, g);
      }
    }
    // Oven door with window
    box(0.7, 0.5, 0.02, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }), -0.5, 0.35, -0.43, g);
    box(0.5, 0.25, 0.01, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.3 }), -0.5, 0.38, -0.42, g);
    box(0.55, 0.03, 0.03, M.metal, -0.5, 0.55, -0.42, g);
  }

  function buildBathroom(g) {
    // Tile floor pattern (checkerboard)
    for (var tx = -1; tx <= 1; tx += 0.4) {
      for (var tz = -1.5; tz <= 1.5; tz += 0.4) {
        var tileColor = ((Math.floor(tx * 2.5) + Math.floor(tz * 2.5)) % 2 === 0) ? 0xEEEEEE : 0xCCCCCC;
        box(0.38, 0.015, 0.38, new THREE.MeshStandardMaterial({ color: tileColor, roughness: 0.3 }), tx, 0.008, tz, g);
      }
    }

    // === NEW BATHTUB MODEL (freestanding clawfoot tub) ===
    // Tub body (curved elliptical)
    var tubOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.5, 20), M.ceramic);
    tubOuter.position.set(0.5, 0.35, -1.2); tubOuter.scale.set(0.9, 1, 1.9); g.add(tubOuter);
    // Inner basin
    var tubInner = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.45, 20), new THREE.MeshStandardMaterial({ color: 0xF8F8FF, roughness: 0.1 }));
    tubInner.position.set(0.5, 0.38, -1.2); tubInner.scale.set(0.85, 1, 1.85); g.add(tubInner);
    // Decorative rim
    var tubRim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 8, 24), M.ceramic);
    tubRim.position.set(0.5, 0.58, -1.2); tubRim.rotation.x = Math.PI / 2; tubRim.scale.set(0.9, 1.9, 1); g.add(tubRim);
    // Clawfoot legs (4 decorative)
    for (var lx of [0.25, 0.75]) {
      for (var lz of [-1.65, -0.75]) {
        cyl(0.04, 0.06, 0.12, 8, new THREE.MeshStandardMaterial({ color: 0xC0C0C0, metalness: 0.7 }), lx, 0.06, lz, g);
        var claw = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M.metal);
        claw.position.set(lx, 0.02, lz); claw.scale.y = 0.6; g.add(claw);
      }
    }
    // Classic faucet with handles
    cyl(0.025, 0.025, 0.22, 8, M.metal, 0.5, 0.7, -1.78, g);
    box(0.12, 0.03, 0.03, M.metal, 0.5, 0.8, -1.78, g);
    cyl(0.02, 0.02, 0.08, 8, M.metal, 0.5, 0.76, -1.68, g);
    // Handles
    cyl(0.03, 0.025, 0.03, 8, new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.2 }), 0.38, 0.82, -1.78, g);
    cyl(0.03, 0.025, 0.03, 8, new THREE.MeshStandardMaterial({ color: 0xFF4444, roughness: 0.2 }), 0.62, 0.82, -1.78, g);
    // Water
    var water = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.23, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0x88CCEE, transparent: true, opacity: 0.4, roughness: 0.05 }));
    water.position.set(0.5, 0.52, -1.2); water.scale.set(0.85, 1, 1.8); g.add(water);

    // === NEW TOILET MODEL (modern one-piece) ===
    // Base
    var toiletBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.25, 16), M.ceramic);
    toiletBase.position.set(-0.5, 0.13, 0.2); toiletBase.scale.set(0.9, 1, 1.2); g.add(toiletBase);
    // Bowl (elongated oval)
    var bowl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), M.ceramic);
    bowl.position.set(-0.5, 0.28, 0.12); bowl.scale.set(1, 0.5, 1.4); g.add(bowl);
    // Seat
    var seatRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 20), M.white);
    seatRing.position.set(-0.5, 0.32, 0.1); seatRing.rotation.x = Math.PI / 2; seatRing.scale.set(1, 1.3, 1); g.add(seatRing);
    // Lid
    var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 20), M.white);
    lid.position.set(-0.5, 0.34, 0.1); lid.scale.set(1, 1, 1.3); g.add(lid);
    // Tank
    box(0.28, 0.32, 0.14, M.ceramic, -0.5, 0.42, 0.38, g);
    box(0.26, 0.28, 0.02, new THREE.MeshStandardMaterial({ color: 0xF5F5F5, roughness: 0.15 }), -0.5, 0.44, 0.3, g);
    // Tank lid
    box(0.3, 0.03, 0.16, M.ceramic, -0.5, 0.6, 0.38, g);
    // Flush button
    cyl(0.03, 0.03, 0.02, 12, M.metal, -0.5, 0.63, 0.38, g);

    // === NEW SINK MODEL (pedestal basin) ===
    // Pedestal column
    cyl(0.08, 0.12, 0.55, 12, M.ceramic, 0.6, 0.28, 1.4, g);
    // Basin (rounded rectangular)
    box(0.48, 0.12, 0.38, M.ceramic, 0.6, 0.58, 1.4, g);
    // Basin hollow
    var basinHollow = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xF5F5F5, roughness: 0.1 }));
    basinHollow.position.set(0.6, 0.56, 1.38); basinHollow.scale.set(1.4, 1, 1.1); g.add(basinHollow);
    // Rim decoration
    box(0.52, 0.02, 0.42, new THREE.MeshStandardMaterial({ color: 0xFFFAF0, roughness: 0.2 }), 0.6, 0.65, 1.4, g);
    // Modern waterfall faucet
    box(0.08, 0.16, 0.04, M.metal, 0.6, 0.76, 1.58, g);
    box(0.06, 0.02, 0.1, M.metal, 0.6, 0.83, 1.52, g);
    // Single lever handle
    box(0.04, 0.04, 0.08, M.metal, 0.6, 0.88, 1.56, g);

    // === NEW MIRROR MODEL (LED backlit medicine cabinet) ===
    // Cabinet frame
    box(0.55, 0.7, 0.1, new THREE.MeshStandardMaterial({ color: 0x4A4A4A, roughness: 0.4 }), 0.6, 1.25, 1.74, g);
    // Mirror surface
    box(0.5, 0.65, 0.02, new THREE.MeshStandardMaterial({ color: 0xE8E8E8, metalness: 0.95, roughness: 0.02 }), 0.6, 1.25, 1.68, g);
    // LED strips (glowing)
    box(0.02, 0.62, 0.02, new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xCCCCCC, emissiveIntensity: 0.5 }), 0.34, 1.25, 1.68, g);
    box(0.02, 0.62, 0.02, new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xCCCCCC, emissiveIntensity: 0.5 }), 0.86, 1.25, 1.68, g);
    box(0.48, 0.02, 0.02, new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xCCCCCC, emissiveIntensity: 0.5 }), 0.6, 0.92, 1.68, g);
    box(0.48, 0.02, 0.02, new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xCCCCCC, emissiveIntensity: 0.5 }), 0.6, 1.58, 1.68, g);

    // Towel rack (decorative ladder style)
    for (var ry = 0.6; ry <= 1.4; ry += 0.2) {
      box(0.03, 0.03, 0.35, M.metal, 1.1, ry, 0.0, g);
    }
    box(0.03, 0.9, 0.03, M.metal, 1.1, 1.0, -0.16, g);
    box(0.03, 0.9, 0.03, M.metal, 1.1, 1.0, 0.16, g);
    // Towel hanging
    box(0.02, 0.25, 0.3, new THREE.MeshStandardMaterial({ color: 0x87CEEB, roughness: 0.9 }), 1.12, 1.08, 0.0, g);
  }

  function buildLivingRoom(g) {
    // === NEW TV DESK MODEL (modern entertainment center) ===
    // Main cabinet body
    box(1.1, 0.35, 0.38, new THREE.MeshStandardMaterial({ color: 0x3C3C3C, roughness: 0.5 }), -0.8, 0.18, -2.0, g);
    // Open shelf compartments
    box(0.32, 0.28, 0.02, new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.4 }), -1.1, 0.18, -1.8, g);
    box(0.32, 0.28, 0.02, new THREE.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.4 }), -0.5, 0.18, -1.8, g);
    // Cabinet doors with push-open
    box(0.5, 0.3, 0.02, new THREE.MeshStandardMaterial({ color: 0x4A4A4A, roughness: 0.3 }), -0.8, 0.18, -1.8, g);
    // Legs
    box(0.04, 0.08, 0.04, M.metal, -1.3, 0.04, -2.15, g);
    box(0.04, 0.08, 0.04, M.metal, -0.3, 0.04, -2.15, g);
    box(0.04, 0.08, 0.04, M.metal, -1.3, 0.04, -1.85, g);
    box(0.04, 0.08, 0.04, M.metal, -0.3, 0.04, -1.85, g);
    // Decorative LED strip
    box(1.05, 0.015, 0.015, new THREE.MeshStandardMaterial({ color: 0x00FFFF, emissive: 0x00AAAA, emissiveIntensity: 0.6 }), -0.8, 0.36, -1.82, g);

    // === NEW LAMP TABLE MODEL (mid-century modern) ===
    // Round top
    var lampTop = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0xDEB887, roughness: 0.4 }));
    lampTop.position.set(-1.4, 0.45, 0.3); g.add(lampTop);
    // Tripod legs
    for (var la = 0; la < 3; la++) {
      var lax = -1.4 + Math.cos(la * 2.094) * 0.12;
      var laz = 0.3 + Math.sin(la * 2.094) * 0.12;
      box(0.025, 0.43, 0.025, new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.5 }), lax, 0.22, laz, g);
    }
    // Designer lamp
    cyl(0.02, 0.02, 0.25, 8, M.metal, -1.4, 0.6, 0.3, g);
    // Drum shade
    cyl(0.12, 0.12, 0.15, 16, new THREE.MeshStandardMaterial({ color: 0xFFF8DC, roughness: 0.8, transparent: true, opacity: 0.9 }), -1.4, 0.82, 0.3, g);
    // Light glow inside
    var glow = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshStandardMaterial({ color: 0xFFFFCC, emissive: 0xFFFF88, emissiveIntensity: 0.8 }));
    glow.position.set(-1.4, 0.78, 0.3); g.add(glow);

    // === NEW MAIN TABLE MODEL (glass coffee table) ===
    // Tempered glass top
    var glassTop = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.02, 24), new THREE.MeshStandardMaterial({ color: 0xE0FFFF, transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.1 }));
    glassTop.position.set(0, 0.42, 0.4); glassTop.scale.set(1.3, 1, 0.9); g.add(glassTop);
    // Chrome X-base
    box(0.8, 0.02, 0.02, M.metal, 0, 0.2, 0.4, g);
    box(0.02, 0.02, 0.55, M.metal, 0, 0.2, 0.4, g);
    // Center column
    cyl(0.04, 0.04, 0.22, 8, M.metal, 0, 0.32, 0.4, g);
    // Decorative base ring
    var baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.02, 8, 24), M.metal);
    baseRing.position.set(0, 0.02, 0.4); baseRing.rotation.x = Math.PI / 2; baseRing.scale.set(1.5, 1, 1); g.add(baseRing);

    // === NEW SOFA MODEL (L-shaped sectional) ===
    // Main seat
    box(1.6, 0.28, 0.7, new THREE.MeshStandardMaterial({ color: 0x4A4A4A, roughness: 0.85 }), 0, 0.14, 2.0, g);
    // Back cushions (tufted)
    box(1.6, 0.38, 0.15, new THREE.MeshStandardMaterial({ color: 0x3A3A3A, roughness: 0.9 }), 0, 0.42, 2.28, g);
    // Tufting buttons
    for (var bx = -0.6; bx <= 0.6; bx += 0.3) {
      for (var by = 0.32; by <= 0.52; by += 0.15) {
        cyl(0.015, 0.015, 0.02, 8, new THREE.MeshStandardMaterial({ color: 0x2A2A2A }), bx, by, 2.2, g);
      }
    }
    // Arms (rounded)
    var armL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 12), new THREE.MeshStandardMaterial({ color: 0x4A4A4A, roughness: 0.85 }));
    armL.position.set(-0.85, 0.35, 2.0); armL.rotation.x = Math.PI / 2; g.add(armL);
    var armR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 12), new THREE.MeshStandardMaterial({ color: 0x4A4A4A, roughness: 0.85 }));
    armR.position.set(0.85, 0.35, 2.0); armR.rotation.x = Math.PI / 2; g.add(armR);
    // Seat cushions
    box(0.7, 0.1, 0.55, M.cushion, -0.4, 0.33, 1.95, g);
    box(0.7, 0.1, 0.55, M.cushion, 0.4, 0.33, 1.95, g);
    // Throw pillows
    var pill1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: 0xB8860B, roughness: 0.9 }));
    pill1.position.set(-0.55, 0.45, 2.15); pill1.scale.set(1, 0.7, 0.7); g.add(pill1);
    var pill2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: 0x708090, roughness: 0.9 }));
    pill2.position.set(0.55, 0.45, 2.15); pill2.scale.set(1, 0.7, 0.7); g.add(pill2);

    // === NEW PLANT MODEL (fiddle leaf fig in decorative pot) ===
    // Ceramic pot with pattern
    cyl(0.1, 0.14, 0.22, 12, new THREE.MeshStandardMaterial({ color: 0xE07020, roughness: 0.7 }), -1.4, 0.11, 2.0, g);
    // Pot rim
    cyl(0.15, 0.14, 0.03, 12, new THREE.MeshStandardMaterial({ color: 0xD06010, roughness: 0.6 }), -1.4, 0.23, 2.0, g);
    // Soil
    cyl(0.12, 0.12, 0.02, 12, new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 1 }), -1.4, 0.21, 2.0, g);
    // Trunk
    cyl(0.025, 0.02, 0.35, 6, new THREE.MeshStandardMaterial({ color: 0x4E3629, roughness: 0.8 }), -1.4, 0.4, 2.0, g);
    // Leaves (multiple spheres arranged)
    for (var li = 0; li < 5; li++) {
      var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.plant);
      var langle = li * 1.257;
      leaf.position.set(-1.4 + Math.cos(langle) * 0.12, 0.55 + li * 0.04, 2.0 + Math.sin(langle) * 0.12);
      leaf.scale.set(0.8, 0.6, 0.8);
      g.add(leaf);
    }
    var topLeaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), M.plant);
    topLeaf.position.set(-1.4, 0.75, 2.0); topLeaf.scale.y = 0.7; g.add(topLeaf);
  }

  function buildDiningRoom(g) {
    // === NEW DINING TABLE MODEL (rustic farmhouse with pedestal base) ===
    // Thick wooden tabletop with live edge effect
    var dtop = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.75, 0.06, 28), new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.6 }));
    dtop.position.set(0, 0.78, 0); dtop.scale.set(1.8, 1, 1.15); g.add(dtop);
    // Table edge banding
    var edgeRing = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.025, 8, 32), new THREE.MeshStandardMaterial({ color: 0x6B3810, roughness: 0.5 }));
    edgeRing.position.set(0, 0.78, 0); edgeRing.rotation.x = Math.PI / 2; edgeRing.scale.set(1.75, 1.12, 1); g.add(edgeRing);
    // Dual pedestal base
    // Left pedestal
    box(0.12, 0.65, 0.35, M.darkWood, -0.6, 0.33, 0, g);
    box(0.35, 0.08, 0.45, M.darkWood, -0.6, 0.04, 0, g);
    // Decorative scroll feet
    cyl(0.05, 0.03, 0.08, 8, M.darkWood, -0.45, 0.04, -0.18, g);
    cyl(0.05, 0.03, 0.08, 8, M.darkWood, -0.75, 0.04, -0.18, g);
    cyl(0.05, 0.03, 0.08, 8, M.darkWood, -0.45, 0.04, 0.18, g);
    cyl(0.05, 0.03, 0.08, 8, M.darkWood, -0.75, 0.04, 0.18, g);
    // Right pedestal
    box(0.12, 0.65, 0.35, M.darkWood, 0.6, 0.33, 0, g);
    box(0.35, 0.08, 0.45, M.darkWood, 0.6, 0.04, 0, g);
    cyl(0.05, 0.03, 0.08, 8, M.darkWood, 0.45, 0.04, -0.18, g);
    cyl(0.05, 0.03, 0.08, 8, M.darkWood, 0.75, 0.04, -0.18, g);
    cyl(0.05, 0.03, 0.08, 8, M.darkWood, 0.45, 0.04, 0.18, g);
    cyl(0.05, 0.03, 0.08, 8, M.darkWood, 0.75, 0.04, 0.18, g);
    // Stretcher bar
    box(1.0, 0.06, 0.06, M.darkWood, 0, 0.25, 0, g);

    // === NEW CHAIR MODEL (ladder back dining chairs) ===
    function diningChair(cx, cz, rotY) {
      // Seat (cushioned trapezoid)
      box(0.38, 0.05, 0.36, new THREE.MeshStandardMaterial({ color: 0xD4A574, roughness: 0.5 }), cx, 0.48, cz, g);
      box(0.34, 0.03, 0.32, new THREE.MeshStandardMaterial({ color: 0x8B0000, roughness: 0.8 }), cx, 0.52, cz, g);
      // Front legs (turned)
      cyl(0.025, 0.03, 0.46, 8, M.wood, cx - 0.14, 0.23, cz - 0.12 * Math.cos(rotY), g);
      cyl(0.025, 0.03, 0.46, 8, M.wood, cx + 0.14, 0.23, cz - 0.12 * Math.cos(rotY), g);
      // Back legs (angled)
      cyl(0.025, 0.025, 0.9, 8, M.wood, cx - 0.14, 0.45, cz + 0.14 * Math.cos(rotY), g);
      cyl(0.025, 0.025, 0.9, 8, M.wood, cx + 0.14, 0.45, cz + 0.14 * Math.cos(rotY), g);
      // Ladder back slats
      for (var sl = 0; sl < 3; sl++) {
        box(0.28, 0.04, 0.015, M.wood, cx, 0.65 + sl * 0.12, cz + 0.16 * Math.cos(rotY), g);
      }
      // Top rail curved
      box(0.32, 0.05, 0.02, M.wood, cx, 0.92, cz + 0.16 * Math.cos(rotY), g);
      // Side stretchers
      box(0.02, 0.02, 0.24, M.wood, cx - 0.14, 0.15, cz, g);
      box(0.02, 0.02, 0.24, M.wood, cx + 0.14, 0.15, cz, g);
    }
    // North chair
    diningChair(0, -1.3, 0);
    // South chair
    diningChair(0, 1.3, Math.PI);
    // West chair
    diningChair(-1.95, 0, Math.PI / 2);
    // East chair
    diningChair(1.95, 0, -Math.PI / 2);

    // === NEW CUPBOARD MODEL (china cabinet with glass doors) ===
    function chinaCabinet(cx) {
      // Lower cabinet (solid doors)
      box(0.9, 0.7, 0.4, M.darkWood, cx, 0.35, 1.93, g);
      // Door panels
      box(0.38, 0.55, 0.02, new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.5 }), cx - 0.22, 0.35, 1.72, g);
      box(0.38, 0.55, 0.02, new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.5 }), cx + 0.22, 0.35, 1.72, g);
      // Door handles
      cyl(0.015, 0.015, 0.04, 6, M.metal, cx - 0.05, 0.35, 1.7, g);
      cyl(0.015, 0.015, 0.04, 6, M.metal, cx + 0.05, 0.35, 1.7, g);
      // Counter top
      box(0.95, 0.04, 0.45, new THREE.MeshStandardMaterial({ color: 0x2F2F2F, roughness: 0.3 }), cx, 0.72, 1.93, g);
      // Upper cabinet (glass doors)
      box(0.9, 0.85, 0.35, M.darkWood, cx, 1.17, 1.95, g);
      // Glass door frames
      box(0.4, 0.75, 0.02, M.darkWood, cx - 0.22, 1.17, 1.76, g);
      box(0.4, 0.75, 0.02, M.darkWood, cx + 0.22, 1.17, 1.76, g);
      // Glass panels
      box(0.32, 0.65, 0.01, new THREE.MeshStandardMaterial({ color: 0xE8F4F8, transparent: true, opacity: 0.4, roughness: 0.1 }), cx - 0.22, 1.17, 1.75, g);
      box(0.32, 0.65, 0.01, new THREE.MeshStandardMaterial({ color: 0xE8F4F8, transparent: true, opacity: 0.4, roughness: 0.1 }), cx + 0.22, 1.17, 1.75, g);
      // Shelves inside (visible through glass)
      box(0.82, 0.02, 0.3, M.wood, cx, 1.0, 1.92, g);
      box(0.82, 0.02, 0.3, M.wood, cx, 1.35, 1.92, g);
      // Decorative crown molding
      box(0.98, 0.06, 0.38, M.darkWood, cx, 1.62, 1.95, g);
      // Handles
      cyl(0.012, 0.012, 0.035, 6, M.metal, cx - 0.05, 1.17, 1.74, g);
      cyl(0.012, 0.012, 0.035, 6, M.metal, cx + 0.05, 1.17, 1.74, g);
      // Display items on shelves
      cyl(0.04, 0.03, 0.08, 8, new THREE.MeshStandardMaterial({ color: 0x1E90FF, roughness: 0.3 }), cx - 0.25, 1.08, 1.9, g);
      cyl(0.035, 0.025, 0.1, 8, new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.2, metalness: 0.3 }), cx + 0.25, 1.08, 1.9, g);
    }
    chinaCabinet(-2.5);
    chinaCabinet(2.5);
  }

  function buildGenericRoom(g) {
    box(1.2, 0.06, 1.2, M.wood, 0, 0.75, 0, g);
    cyl(0.04, 0.04, 0.72, 8, M.metal, -0.5, 0.37, -0.5, g);
    cyl(0.04, 0.04, 0.72, 8, M.metal, 0.5, 0.37, -0.5, g);
    cyl(0.04, 0.04, 0.72, 8, M.metal, -0.5, 0.37, 0.5, g);
    cyl(0.04, 0.04, 0.72, 8, M.metal, 0.5, 0.37, 0.5, g);
    for (var cx of [-0.6, 0.6]) {
      box(0.35, 0.04, 0.35, M.leather, cx, 0.45, -1.0, g);
      box(0.35, 0.35, 0.04, M.leather, cx, 0.65, -1.17, g);
    }
  }

  var furnitureBuilders = {
    living: buildLivingRoom,
    kitchen: buildKitchen,
    bedroom: buildBedroom,
    bathroom: buildBathroom,
    dining: buildDiningRoom,
    office: buildGenericRoom,
  };

  // ================================================================
  // 3D Appliance Model Builders — recognizable shapes per category
  // ================================================================
  function buildDevice3D(cat, g, dc, glowMat, bodyMat) {
    var c = (cat || '').toLowerCase();

    // ---- TV / Television ----
    if (c.includes('tv') || c.includes('television')) {
      // Flat screen
      box(0.9, 0.55, 0.04, M.screen, 0, 0.7, 0, g);
      // Screen glow
      box(0.85, 0.5, 0.01, new THREE.MeshStandardMaterial({ color: 0x2288FF, emissive: 0x2288FF, emissiveIntensity: 0.6, roughness: 0.05 }), 0, 0.71, 0.03, g);
      // Stand neck
      box(0.06, 0.2, 0.06, M.metal, 0, 0.33, 0, g);
      // Stand base
      box(0.4, 0.03, 0.25, M.metal, 0, 0.22, 0, g);
      return;
    }

    // ---- Refrigerator / Fridge ----
    if (c.includes('fridge') || c.includes('refrigerator')) {
      // Main body
      box(0.6, 1.4, 0.5, M.fridge, 0, 0.7, 0, g);
      // Freezer door line
      box(0.58, 0.01, 0.02, M.metal, 0, 1.05, 0.26, g);
      // Handles
      box(0.03, 0.25, 0.04, new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8 }), 0.22, 1.2, 0.27, g);
      box(0.03, 0.25, 0.04, new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8 }), 0.22, 0.6, 0.27, g);
      // Ice dispenser glow
      box(0.15, 0.1, 0.02, new THREE.MeshStandardMaterial({ color: 0x44CCFF, emissive: 0x44CCFF, emissiveIntensity: 0.5 }), -0.05, 1.25, 0.26, g);
      return;
    }

    // ---- Microwave ----
    if (c.includes('microwave')) {
      box(0.5, 0.3, 0.35, bodyMat, 0, 0.35, 0, g);
      // Window
      box(0.25, 0.2, 0.01, new THREE.MeshStandardMaterial({ color: 0x222222, transparent: true, opacity: 0.7 }), -0.05, 0.37, 0.18, g);
      // Control panel
      box(0.1, 0.22, 0.01, new THREE.MeshStandardMaterial({ color: 0x333333 }), 0.17, 0.37, 0.18, g);
      // Light inside
      box(0.23, 0.18, 0.01, new THREE.MeshStandardMaterial({ color: 0xFFCC00, emissive: 0xFFCC00, emissiveIntensity: 0.3 }), -0.05, 0.37, 0.17, g);
      // Handle
      box(0.03, 0.15, 0.03, M.metal, -0.28, 0.37, 0.18, g);
      return;
    }

    // ---- Laptop ----
    if (c.includes('laptop')) {
      // Base (keyboard)
      box(0.5, 0.03, 0.35, new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.5 }), 0, 0.25, 0.05, g);
      // Keyboard keys
      box(0.4, 0.005, 0.2, new THREE.MeshStandardMaterial({ color: 0x333333 }), 0, 0.267, 0.0, g);
      // Trackpad
      box(0.12, 0.005, 0.08, new THREE.MeshStandardMaterial({ color: 0x555555 }), 0, 0.267, 0.12, g);
      // Screen (tilted)
      var scrn = box(0.48, 0.35, 0.02, new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3 }), 0, 0.42, -0.14, g);
      scrn.rotation.x = -0.25;
      // Screen glow
      var sg = box(0.44, 0.3, 0.01, new THREE.MeshStandardMaterial({ color: 0x4488FF, emissive: 0x2266DD, emissiveIntensity: 0.5 }), 0, 0.42, -0.13, g);
      sg.rotation.x = -0.25;
      return;
    }

    // ---- Monitor ----
    if (c.includes('monitor') || c.includes('display')) {
      box(0.7, 0.45, 0.03, M.screen, 0, 0.65, 0, g);
      box(0.65, 0.4, 0.01, new THREE.MeshStandardMaterial({ color: 0x3388FF, emissive: 0x2266CC, emissiveIntensity: 0.5 }), 0, 0.66, 0.02, g);
      box(0.08, 0.2, 0.08, M.metal, 0, 0.33, 0, g);
      box(0.3, 0.02, 0.2, M.metal, 0, 0.22, 0, g);
      return;
    }

    // ---- Oven ----
    if (c.includes('oven') || c.includes('stove') || c.includes('range')) {
      box(0.65, 0.8, 0.55, M.stove, 0, 0.4, 0, g);
      // Oven window
      box(0.5, 0.3, 0.01, new THREE.MeshStandardMaterial({ color: 0x332200, transparent: true, opacity: 0.6 }), 0, 0.3, 0.28, g);
      // Oven interior glow
      box(0.48, 0.28, 0.01, new THREE.MeshStandardMaterial({ color: 0xFF6600, emissive: 0xFF4400, emissiveIntensity: 0.4 }), 0, 0.3, 0.27, g);
      // Burners
      cyl(0.08, 0.08, 0.02, 16, new THREE.MeshStandardMaterial({ color: 0xFF3300, emissive: 0xFF2200, emissiveIntensity: 0.3 }), -0.15, 0.82, -0.1, g);
      cyl(0.08, 0.08, 0.02, 16, new THREE.MeshStandardMaterial({ color: 0xFF3300, emissive: 0xFF2200, emissiveIntensity: 0.3 }), 0.15, 0.82, -0.1, g);
      // Knobs
      for (var ki = -2; ki <= 2; ki++) cyl(0.025, 0.025, 0.03, 8, M.metal, ki * 0.1, 0.6, 0.29, g);
      // Handle
      box(0.35, 0.03, 0.04, M.metal, 0, 0.55, 0.3, g);
      return;
    }

    // ---- Washing Machine ----
    if (c.includes('washing') || c.includes('washer')) {
      box(0.6, 0.7, 0.55, M.white, 0, 0.35, 0, g);
      // Drum window (round)
      cyl(0.18, 0.18, 0.02, 20, new THREE.MeshStandardMaterial({ color: 0x88BBFF, transparent: true, opacity: 0.5, emissive: 0x4488FF, emissiveIntensity: 0.2 }), 0, 0.4, 0.28, g);
      // Door ring
      var torus = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 8, 20), M.metal);
      torus.position.set(0, 0.4, 0.28);
      g.add(torus);
      // Control panel
      box(0.5, 0.08, 0.01, new THREE.MeshStandardMaterial({ color: 0x444444 }), 0, 0.68, 0.28, g);
      // Knob
      cyl(0.04, 0.04, 0.03, 12, M.metal, -0.15, 0.68, 0.3, g);
      // LED display
      box(0.12, 0.04, 0.01, new THREE.MeshStandardMaterial({ color: 0x00FF88, emissive: 0x00FF88, emissiveIntensity: 0.6 }), 0.1, 0.68, 0.3, g);
      return;
    }

    // ---- Dryer ----
    if (c.includes('dryer') && !c.includes('hair')) {
      box(0.6, 0.7, 0.55, M.white, 0, 0.35, 0, g);
      cyl(0.18, 0.18, 0.02, 20, new THREE.MeshStandardMaterial({ color: 0xDDDDDD, transparent: true, opacity: 0.4 }), 0, 0.4, 0.28, g);
      var torus2 = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 8, 20), M.metal);
      torus2.position.set(0, 0.4, 0.28); g.add(torus2);
      box(0.5, 0.08, 0.01, new THREE.MeshStandardMaterial({ color: 0x444444 }), 0, 0.68, 0.28, g);
      cyl(0.04, 0.04, 0.03, 12, M.metal, -0.15, 0.68, 0.3, g);
      return;
    }

    // ---- Hair Dryer ----
    if (c.includes('hair dryer') || c.includes('hair')) {
      // Body cylinder (nozzle)
      cyl(0.06, 0.08, 0.35, 12, bodyMat, 0, 0.4, 0.05, g);
      // Handle
      box(0.06, 0.2, 0.06, bodyMat, 0, 0.22, 0.1, g);
      // Air vent glow
      cyl(0.05, 0.05, 0.01, 12, new THREE.MeshStandardMaterial({ color: 0xFF6622, emissive: 0xFF4400, emissiveIntensity: 0.5 }), 0, 0.4, -0.13, g);
      return;
    }

    // ---- Toaster ----
    if (c.includes('toaster')) {
      box(0.35, 0.2, 0.2, bodyMat, 0, 0.3, 0, g);
      // Slots
      box(0.25, 0.01, 0.03, new THREE.MeshStandardMaterial({ color: 0x222222 }), 0, 0.41, -0.03, g);
      box(0.25, 0.01, 0.03, new THREE.MeshStandardMaterial({ color: 0x222222 }), 0, 0.41, 0.03, g);
      // Lever
      box(0.04, 0.08, 0.02, M.metal, 0.15, 0.38, 0.12, g);
      // Glow from slots (heat)
      box(0.24, 0.005, 0.02, new THREE.MeshStandardMaterial({ color: 0xFF4400, emissive: 0xFF3300, emissiveIntensity: 0.5 }), 0, 0.405, 0, g);
      return;
    }

    // ---- Air Conditioner ----
    if (c.includes('air conditioner') || c.includes('ac unit') || c.includes('hvac')) {
      box(0.8, 0.25, 0.2, M.white, 0, 1.8, 0, g);
      // Vent slats
      for (var vi = -3; vi <= 3; vi++) box(0.7, 0.005, 0.015, M.metal, 0, 1.72 + vi * 0.02, 0.1, g);
      // LED
      box(0.05, 0.02, 0.01, new THREE.MeshStandardMaterial({ color: 0x00FF44, emissive: 0x00FF44, emissiveIntensity: 0.8 }), 0.3, 1.85, 0.11, g);
      // Cold air glow
      box(0.6, 0.15, 0.01, new THREE.MeshStandardMaterial({ color: 0x44CCFF, emissive: 0x22AAFF, emissiveIntensity: 0.3, transparent: true, opacity: 0.4 }), 0, 1.65, 0.11, g);
      return;
    }

    // ---- Space Heater ----
    if (c.includes('heater') || c.includes('space heater')) {
      box(0.35, 0.5, 0.15, bodyMat, 0, 0.35, 0, g);
      // Heating elements glow
      for (var hi = 0; hi < 3; hi++) {
        box(0.25, 0.03, 0.01, new THREE.MeshStandardMaterial({ color: 0xFF4400, emissive: 0xFF2200, emissiveIntensity: 0.6 }), 0, 0.25 + hi * 0.12, 0.08, g);
      }
      // Base
      box(0.3, 0.04, 0.2, M.metal, 0, 0.08, 0, g);
      return;
    }

    // ---- Light Bulb / Lamp ----
    if (c.includes('light') || c.includes('lamp') || c.includes('bulb')) {
      // Lamp base
      cyl(0.12, 0.15, 0.04, 12, M.metal, 0, 0.02, 0, g);
      // Pole
      cyl(0.02, 0.02, 0.8, 8, M.metal, 0, 0.42, 0, g);
      // Shade
      cyl(0.2, 0.12, 0.2, 12, new THREE.MeshStandardMaterial({ color: 0xFFE8B0, transparent: true, opacity: 0.7 }), 0, 0.88, 0, g);
      // Bulb glow
      var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshStandardMaterial({ color: 0xFFDD44, emissive: 0xFFCC00, emissiveIntensity: 0.9 }));
      bulb.position.set(0, 0.82, 0); g.add(bulb);
      // Warm light
      var warmLight = new THREE.PointLight(0xFFCC00, 0.8, 2.5);
      warmLight.position.set(0, 0.85, 0); g.add(warmLight);
      return;
    }

    // ---- Fan ----
    if (c.includes('fan')) {
      // Base
      cyl(0.15, 0.18, 0.04, 12, M.metal, 0, 0.02, 0, g);
      // Pole
      cyl(0.03, 0.03, 0.5, 8, M.metal, 0, 0.27, 0, g);
      // Motor housing
      cyl(0.08, 0.08, 0.08, 12, bodyMat, 0, 0.56, 0, g);
      // Fan blades (3 blades)
      for (var fi = 0; fi < 3; fi++) {
        var blade = box(0.04, 0.25, 0.01, new THREE.MeshStandardMaterial({ color: 0xCCCCCC, transparent: true, opacity: 0.6 }), 0, 0.56, 0.05, g);
        blade.rotation.z = fi * (Math.PI * 2 / 3);
      }
      // Guard ring
      var guard = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.01, 6, 20), M.metal);
      guard.position.set(0, 0.56, 0.05); g.add(guard);
      return;
    }

    // ---- Router / WiFi ----
    if (c.includes('router') || c.includes('wifi') || c.includes('modem')) {
      box(0.4, 0.05, 0.25, bodyMat, 0, 0.25, 0, g);
      // Antennas
      cyl(0.012, 0.012, 0.35, 6, M.metal, -0.12, 0.45, -0.08, g);
      cyl(0.012, 0.012, 0.35, 6, M.metal, 0.12, 0.45, -0.08, g);
      // Status LEDs
      for (var li = -2; li <= 2; li++) {
        var ledColors = [0x00FF00, 0x00FF00, 0xFFAA00, 0x00FF00, 0x2288FF];
        var lc2 = ledColors[li + 2];
        box(0.02, 0.015, 0.01, new THREE.MeshStandardMaterial({ color: lc2, emissive: lc2, emissiveIntensity: 0.8 }), li * 0.06, 0.285, 0.13, g);
      }
      return;
    }

    // ---- Gaming Console ----
    if (c.includes('gaming') || c.includes('console') || c.includes('xbox') || c.includes('playstation') || c.includes('nintendo')) {
      box(0.35, 0.08, 0.25, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.2, metalness: 0.4 }), 0, 0.26, 0, g);
      // Glowing strip
      box(0.33, 0.01, 0.01, new THREE.MeshStandardMaterial({ color: 0x00CCFF, emissive: 0x00AAFF, emissiveIntensity: 0.7 }), 0, 0.305, 0.12, g);
      // Disc slot
      box(0.15, 0.003, 0.01, new THREE.MeshStandardMaterial({ color: 0x444444 }), 0, 0.28, 0.13, g);
      return;
    }

    // ---- Coffee Maker ----
    if (c.includes('coffee')) {
      // Body
      box(0.25, 0.4, 0.25, bodyMat, 0, 0.4, 0, g);
      // Carafe
      cyl(0.08, 0.07, 0.2, 10, new THREE.MeshStandardMaterial({ color: 0x222222, transparent: true, opacity: 0.5 }), 0, 0.2, 0.15, g);
      // Handle
      box(0.02, 0.12, 0.04, bodyMat, 0.1, 0.22, 0.15, g);
      // Hot plate glow
      cyl(0.09, 0.09, 0.01, 12, new THREE.MeshStandardMaterial({ color: 0xFF4400, emissive: 0xFF2200, emissiveIntensity: 0.4 }), 0, 0.195, 0.15, g);
      return;
    }

    // ---- Dishwasher ----
    if (c.includes('dishwasher')) {
      box(0.6, 0.7, 0.55, M.white, 0, 0.35, 0, g);
      // Handle
      box(0.4, 0.03, 0.04, M.metal, 0, 0.62, 0.3, g);
      // Control panel
      box(0.5, 0.06, 0.01, new THREE.MeshStandardMaterial({ color: 0x555555 }), 0, 0.68, 0.28, g);
      // LED
      box(0.08, 0.03, 0.01, new THREE.MeshStandardMaterial({ color: 0x00FF44, emissive: 0x00FF44, emissiveIntensity: 0.6 }), 0.15, 0.68, 0.29, g);
      return;
    }

    // ---- Blender ----
    if (c.includes('blender')) {
      // Base
      cyl(0.1, 0.12, 0.1, 12, bodyMat, 0, 0.25, 0, g);
      // Jar
      cyl(0.06, 0.1, 0.3, 10, new THREE.MeshStandardMaterial({ color: 0xCCCCCC, transparent: true, opacity: 0.4 }), 0, 0.45, 0, g);
      // Lid
      cyl(0.06, 0.05, 0.03, 10, bodyMat, 0, 0.61, 0, g);
      // Button
      cyl(0.03, 0.03, 0.02, 8, new THREE.MeshStandardMaterial({ color: 0xFF0000, emissive: 0xFF0000, emissiveIntensity: 0.3 }), 0, 0.22, 0.12, g);
      return;
    }

    // ---- Phone Charger / Charger ----
    if (c.includes('charger') || c.includes('phone')) {
      box(0.08, 0.08, 0.03, M.white, 0, 0.24, 0, g);
      // Cable
      cyl(0.008, 0.008, 0.3, 6, M.metal, 0, 0.24, 0.15, g);
      // Phone on charger
      box(0.12, 0.22, 0.015, new THREE.MeshStandardMaterial({ color: 0x222222 }), 0, 0.35, 0.08, g);
      box(0.1, 0.18, 0.005, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2244AA, emissiveIntensity: 0.3 }), 0, 0.36, 0.09, g);
      return;
    }

    // ---- DEFAULT: generic electronic device ----
    // Sleek box with glowing LED strip
    box(0.35, 0.25, 0.25, bodyMat, 0, 0.33, 0, g);
    box(0.33, 0.02, 0.01, new THREE.MeshStandardMaterial({ color: dc, emissive: dc, emissiveIntensity: 0.6 }), 0, 0.47, 0.13, g);
    // Top vent
    for (var di2 = -2; di2 <= 2; di2++) box(0.25, 0.003, 0.015, M.metal, 0, 0.46, di2 * 0.04, g);
  }

  // ================================================================
  // Smart placement: returns {x, z, key} based on room type + device
  // Devices go to logical positions (TV on TV stand, fridge in corner, etc.)
  // ================================================================
  function getSmartSpot(rType, cat, idx, used) {
    var c = (cat || '').toLowerCase();

    // --- LIVING ROOM spots ---
    var livingSpots = {
      'tv': { x: 0, z: -1.9, key: 'tv-stand' },
      'television': { x: 0, z: -1.9, key: 'tv-stand' },
      'gaming': { x: 0.5, z: -1.9, key: 'console' },
      'console': { x: 0.5, z: -1.9, key: 'console' },
      'lamp': { x: -1.4, z: 0, key: 'lamp-table' },
      'light': { x: -1.4, z: 0, key: 'lamp-spot' },
      'router': { x: 1.3, z: -1.5, key: 'shelf' },
      'fan': { x: 1.4, z: 0.5, key: 'corner-fan' },
      'air conditioner': { x: 0, z: -2.2, key: 'wall-ac' },
      'space heater': { x: -1.4, z: 1.0, key: 'heater' },
      'speaker': { x: -0.5, z: -1.9, key: 'speaker' },
    };

    // --- KITCHEN spots ---
    var kitchenSpots = {
      'refrigerator': { x: -1.8, z: 1.6, key: 'fridge-corner' },
      'fridge': { x: -1.8, z: 1.6, key: 'fridge-corner' },
      'oven': { x: -0.8, z: -1.95, key: 'counter-oven' },    // on counter
      'stove': { x: -0.8, z: -1.95, key: 'counter-stove' },
      'microwave': { x: 0.8, z: -1.7, key: 'counter-mw' },   // on counter
      'toaster': { x: 1.5, z: -1.7, key: 'counter-toast' },
      'coffee': { x: -0.3, z: -1.7, key: 'counter-coffee' },
      'blender': { x: 0.2, z: -1.7, key: 'counter-blend' },
      'dishwasher': { x: 1.8, z: -1.5, key: 'dw-spot' },
      'light': { x: 0, z: 0, key: 'ceiling-light' },
    };

    // --- BEDROOM spots ---
    var bedroomSpots = {
      'tv': { x: 0, z: 1.8, key: 'wall-tv' },
      'television': { x: 0, z: 1.8, key: 'wall-tv' },
      'laptop': { x: -1.5, z: 0.4, key: 'desk-laptop' },
      'monitor': { x: -1.5, z: 0.4, key: 'desk-mon' },
      'lamp': { x: 1.05, z: -1.55, key: 'nightstand-lamp' },
      'light': { x: 1.05, z: -1.55, key: 'nightstand-light' },
      'fan': { x: 1.5, z: 1.5, key: 'corner-fan' },
      'air conditioner': { x: 0, z: -1.9, key: 'wall-ac' },
      'space heater': { x: 1.5, z: 0, key: 'heater' },
      'charger': { x: 1.05, z: -1.55, key: 'nightstand-charge' },
      'phone': { x: 1.05, z: -1.55, key: 'nightstand-phone' },
      'router': { x: 1.2, z: 1.5, key: 'dresser-router' },
    };

    // --- BATHROOM spots ---
    var bathroomSpots = {
      'hair dryer': { x: 1.5, z: 1.7, key: 'vanity-dryer' },
      'hair': { x: 1.5, z: 1.7, key: 'vanity-dryer' },
      'light': { x: 0, z: 0, key: 'ceiling-light' },
      'space heater': { x: -1.8, z: 0, key: 'heater' },
      'fan': { x: 1.8, z: -0.5, key: 'exhaust-fan' },
      'washing': { x: -1.8, z: 1.5, key: 'washer' },
      'washer': { x: -1.8, z: 1.5, key: 'washer' },
      'dryer': { x: -1.2, z: 1.5, key: 'dryer' },
    };

    // --- OFFICE spots ---
    var officeSpots = {
      'monitor': { x: 0, z: -1.75, key: 'desk-monitor' },
      'laptop': { x: 0, z: -1.4, key: 'desk-laptop' },
      'tv': { x: 1.5, z: 0, key: 'wall-tv' },
      'television': { x: 1.5, z: 0, key: 'wall-tv' },
      'router': { x: -1.4, z: 1.4, key: 'shelf-router' },
      'lamp': { x: 0.8, z: -1.75, key: 'desk-lamp' },
      'light': { x: 0.8, z: -1.75, key: 'desk-lamp' },
      'fan': { x: 1.5, z: 1.5, key: 'corner-fan' },
      'space heater': { x: -0.8, z: 0.5, key: 'heater' },
      'charger': { x: -0.5, z: -1.4, key: 'desk-charger' },
      'phone': { x: -0.5, z: -1.4, key: 'desk-phone' },
      'air conditioner': { x: 0, z: -2.2, key: 'wall-ac' },
      'gaming': { x: 0.5, z: -1.75, key: 'desk-console' },
    };

    // --- DINING ROOM spots ---
    var diningSpots = {
      'light': { x: 0, z: 0, key: 'chandelier' },
      'lamp': { x: 2.5, z: -1.5, key: 'corner-lamp' },
      'fan': { x: 0, z: 0, key: 'ceiling-fan' },
      'speaker': { x: -2.5, z: 1.5, key: 'cupboard-speaker' },
      'air conditioner': { x: 0, z: -2.2, key: 'wall-ac' },
      'space heater': { x: 2.5, z: 1.5, key: 'heater' },
      'tv': { x: 0, z: -2.0, key: 'wall-tv' },
      'television': { x: 0, z: -2.0, key: 'wall-tv' },
    };

    var spotMaps = { living: livingSpots, kitchen: kitchenSpots, bedroom: bedroomSpots, bathroom: bathroomSpots, office: officeSpots, dining: diningSpots };
    var spots = spotMaps[rType] || livingSpots;

    // Try to find a matching spot for this device category
    for (var key in spots) {
      if (c.includes(key) && !used[spots[key].key]) {
        return spots[key];
      }
    }

    // Fallback: place in available open positions around the room
    var fallbackSpots = [
      { x: 1.5, z: 1.0, key: 'fb0' },
      { x: -1.5, z: 1.0, key: 'fb1' },
      { x: 1.5, z: -0.5, key: 'fb2' },
      { x: -1.5, z: -0.5, key: 'fb3' },
      { x: 0, z: 1.0, key: 'fb4' },
      { x: 0, z: -1.0, key: 'fb5' },
      { x: 1.0, z: 0, key: 'fb6' },
      { x: -1.0, z: 0, key: 'fb7' },
    ];
    for (var fi = 0; fi < fallbackSpots.length; fi++) {
      if (!used[fallbackSpots[fi].key]) return fallbackSpots[fi];
    }
    // Last resort: offset based on index
    return { x: (idx % 3 - 1) * 1.2, z: Math.floor(idx / 3) * 1.2 - 0.5, key: 'last' + idx };
  }

  // ================================================================
  // Build Rooms
  // ================================================================
  var roomGroups = [];
  var clickableFloors = [];

  ROOMS.forEach(function(room, i) {
    var pos = GRID[i % GRID.length];
    var rg = new THREE.Group();
    rg.position.set(pos.x, 0, pos.z);
    rg.userData = { roomId: room.roomId, name: room.name, index: i };

    // Room floor (colored tint)
    var col = new THREE.Color(ROOM_COLORS[i % ROOM_COLORS.length]);
    var floorMat = new THREE.MeshStandardMaterial({
      color: col, roughness: 0.8, transparent: true, opacity: IS_DARK ? 0.18 : 0.12,
    });
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(pos.w - 0.2, pos.d - 0.2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.03;
    floor.receiveShadow = true;
    floor.userData = { type: 'floor', roomId: room.roomId, name: room.name };
    rg.add(floor);
    clickableFloors.push(floor);

    // Room label (floating sprite)
    var lc = document.createElement('canvas');
    lc.width = 512; lc.height = 96;
    var lctx = lc.getContext('2d');
    lctx.font = 'bold 36px -apple-system, sans-serif';
    lctx.fillStyle = '#' + col.getHexString();
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.fillText(room.name, 256, 48);
    var labelTex = new THREE.CanvasTexture(lc);
    var labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, opacity: 0.85 }));
    labelSprite.scale.set(3.5, 0.7, 1);
    labelSprite.position.set(0, WALL_H + 0.6, 0);
    rg.add(labelSprite);

    // Build furniture
    var type = roomType(room.roomId);
    var builder = furnitureBuilders[type] || buildGenericRoom;
    builder(rg);

    // ============================================================
    // Place scanned devices as recognizable 3D appliance models
    // at smart positions based on room type & device category
    // ============================================================
    var devs = DEVICES.filter(function(d) { return d.roomId === room.roomId; });
    var usedSpots = {};

    devs.forEach(function(dev, di) {
      var dc = getDevColor(dev.category);
      var glowMat = new THREE.MeshStandardMaterial({ color: dc, roughness: 0.2, metalness: 0.3, emissive: dc, emissiveIntensity: 0.4 });
      var bodyMat = new THREE.MeshStandardMaterial({ color: dc, roughness: 0.3, metalness: 0.2, emissive: dc, emissiveIntensity: 0.15 });

      // Get smart placement position
      var spot = getSmartSpot(type, dev.category, di, usedSpots);
      usedSpots[spot.key] = true;

      var devG = new THREE.Group();
      devG.position.set(spot.x, 0, spot.z);

      // Build the specific 3D appliance model
      buildDevice3D(dev.category, devG, dc, glowMat, bodyMat);

      // ---- Glow ring on floor (pulsing) ----
      var ringGeo = new THREE.RingGeometry(0.35, 0.45, 32);
      var ringMat = new THREE.MeshBasicMaterial({ color: dc, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
      var ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.005;
      ring.userData = { isGlow: true };
      devG.add(ring);

      // ---- Outer glow halo (larger, softer) ----
      var haloGeo = new THREE.RingGeometry(0.45, 0.7, 32);
      var haloMat = new THREE.MeshBasicMaterial({ color: dc, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
      var halo = new THREE.Mesh(haloGeo, haloMat);
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.003;
      halo.userData = { isGlow: true };
      devG.add(halo);

      // ---- Point light for local glow ----
      var devLight = new THREE.PointLight(dc, 0.6, 3);
      devLight.position.set(0, 0.5, 0);
      devG.add(devLight);

      // ---- Device label sprite ----
      var dc2 = document.createElement('canvas');
      dc2.width = 512; dc2.height = 64;
      var dctx = dc2.getContext('2d');
      dctx.font = 'bold 24px -apple-system, sans-serif';
      dctx.fillStyle = IS_DARK ? '#ffffff' : '#222222';
      dctx.textAlign = 'center';
      dctx.textBaseline = 'middle';
      var name = dev.label || dev.category;
      dctx.fillText(name.length > 22 ? name.slice(0, 20) + '...' : name, 256, 32);
      var dtex = new THREE.CanvasTexture(dc2);
      var dlbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: dtex, transparent: true, opacity: 0.95 }));
      dlbl.scale.set(2.8, 0.4, 1);
      dlbl.position.y = 1.5;
      devG.add(dlbl);

      // ---- Category icon badge (emoji sprite above label) ----
      var emojiMap = { 'Television': '📺', 'TV': '📺', 'Refrigerator': '🧊', 'Fridge': '🧊', 'Microwave': '📡', 'Laptop': '💻', 'Oven': '🔥', 'Toaster': '🍞', 'Washing Machine': '🫧', 'Dryer': '🌀', 'Hair Dryer': '💇', 'Air Conditioner': '❄️', 'Space Heater': '🔥', 'Monitor': '🖥️', 'Light Bulb': '💡', 'Lamp': '💡', 'Light': '💡', 'Fan': '🌀', 'Router': '📶', 'Gaming Console': '🎮', 'Coffee Maker': '☕', 'Blender': '🫙', 'Dishwasher': '🍽️' };
      var emoji = emojiMap[dev.category] || '⚡';
      var ec = document.createElement('canvas');
      ec.width = 128; ec.height = 128;
      var ectx = ec.getContext('2d');
      ectx.font = '80px sans-serif';
      ectx.textAlign = 'center';
      ectx.textBaseline = 'middle';
      ectx.fillText(emoji, 64, 64);
      var etex = new THREE.CanvasTexture(ec);
      var esprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: etex, transparent: true }));
      esprite.scale.set(0.6, 0.6, 1);
      esprite.position.y = 1.85;
      devG.add(esprite);

      rg.add(devG);
    });

    house.add(rg);
    roomGroups.push(rg);
  });

  // ================================================================
  // Outer Walls (NO ROOF!) — 5-room layout
  //  ┌──────────┬──────────────┬──────────┐
  //  │ Bedroom  │   Kitchen    │ Bathroom │
  //  ├──────────┼──────────────┴──────────┤
  //  │  Living  │      Dining Room       │
  //  └──────────┴────────────────────────┘
  // ================================================================

  var HW = TOTAL_W / 2;  // 6
  var HD = TOTAL_D / 2;  // 4.75

  // ---- Outer walls ----
  box(TOTAL_W + WALL_T, WALL_H, WALL_T, M.wall, 0, WALL_H / 2, -HD, house);        // Back wall
  // Front wall (with door gap in living room)
  var doorGapX = -HW + LR_W / 2;
  var dHalf = 0.5;
  box(LR_W / 2 - dHalf, WALL_H, WALL_T, M.wall, -HW + (LR_W / 2 - dHalf) / 2, WALL_H / 2, HD, house);
  var rwStart = -HW + LR_W / 2 + dHalf;
  var rwLen = TOTAL_W - (LR_W / 2 + dHalf);
  box(rwLen, WALL_H, WALL_T, M.wall, rwStart + rwLen / 2, WALL_H / 2, HD, house);
  box(1.0, WALL_H - 2.2, WALL_T, M.wall, doorGapX, WALL_H - 0.4, HD, house);       // Transom
  box(WALL_T, WALL_H, TOTAL_D, M.wall, -HW, WALL_H / 2, 0, house);                 // Left wall
  box(WALL_T, WALL_H, TOTAL_D, M.wall, HW, WALL_H / 2, 0, house);                  // Right wall

  // ---- Interior walls ----
  var IW = WALL_T * 0.7;
  var rowSplitZ = -HD + BR_D;  // horizontal split at z = -0.25

  // Horizontal wall (top row ↔ bottom row) with doorway gaps
  // Left column (Bedroom↔Living)
  box(BR_W / 2 - 0.5, WALL_H, IW, M.wallInner, -HW + (BR_W / 2 - 0.5) / 2, WALL_H / 2, rowSplitZ, house);
  box(BR_W / 2 - 0.5, WALL_H, IW, M.wallInner, -HW + BR_W / 2 + 0.5 + (BR_W / 2 - 0.5) / 2, WALL_H / 2, rowSplitZ, house);
  // Right section (Kitchen+Bathroom ↔ Dining)
  var kitDinStart = -HW + BR_W;
  box(KI_W / 2 - 0.5, WALL_H, IW, M.wallInner, kitDinStart + (KI_W / 2 - 0.5) / 2, WALL_H / 2, rowSplitZ, house);
  box(KI_W / 2 + BA_W - 0.5, WALL_H, IW, M.wallInner, kitDinStart + KI_W / 2 + 0.5 + (KI_W / 2 + BA_W - 0.5) / 2, WALL_H / 2, rowSplitZ, house);

  // Vertical wall: Bedroom | Kitchen (top row, with door gap)
  var topVert1X = -HW + BR_W;
  box(IW, WALL_H, BR_D / 2 - 0.5, M.wallInner, topVert1X, WALL_H / 2, -HD + BR_D / 4 - 0.25, house);
  box(IW, WALL_H, BR_D / 2 - 0.5, M.wallInner, topVert1X, WALL_H / 2, -HD + BR_D * 3 / 4 + 0.25, house);

  // Vertical wall: Kitchen | Bathroom (top row, with door gap)
  var topVert2X = -HW + BR_W + KI_W;
  box(IW, WALL_H, BA_D / 2 - 0.5, M.wallInner, topVert2X, WALL_H / 2, -HD + BA_D / 4 - 0.25, house);
  box(IW, WALL_H, BA_D / 2 - 0.5, M.wallInner, topVert2X, WALL_H / 2, -HD + BA_D * 3 / 4 + 0.25, house);

  // Vertical wall: Living | Dining (bottom row, with door gap)
  var botVertX = -HW + LR_W;
  box(IW, WALL_H, LR_D / 2 - 0.5, M.wallInner, botVertX, WALL_H / 2, rowSplitZ + LR_D / 4 - 0.25, house);
  box(IW, WALL_H, LR_D / 2 - 0.5, M.wallInner, botVertX, WALL_H / 2, rowSplitZ + LR_D * 3 / 4 + 0.25, house);

  // ---- Windows ----
  var winPositions = [
    // Back wall — bedroom, kitchen, bathroom
    { x: -HW + BR_W / 2, y: 1.8, z: -HD + 0.01, ry: 0 },
    { x: -HW + BR_W + KI_W / 2, y: 1.8, z: -HD + 0.01, ry: 0 },
    { x: HW - BA_W / 2, y: 1.8, z: -HD + 0.01, ry: 0 },
    // Front wall — dining room
    { x: -HW + LR_W + DN_W / 2, y: 1.8, z: HD - 0.01, ry: 0 },
    // Left wall — bedroom, living room
    { x: -HW + 0.01, y: 1.8, z: -HD + BR_D / 2, ry: Math.PI / 2 },
    { x: -HW + 0.01, y: 1.8, z: rowSplitZ + LR_D / 2, ry: Math.PI / 2 },
    // Right wall — bathroom, dining room
    { x: HW - 0.01, y: 1.8, z: -HD + BA_D / 2, ry: Math.PI / 2 },
    { x: HW - 0.01, y: 1.8, z: rowSplitZ + DN_D / 2, ry: Math.PI / 2 },
  ];
  winPositions.forEach(function(wp) {
    var win = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.0), M.window);
    win.position.set(wp.x, wp.y, wp.z);
    win.rotation.y = wp.ry;
    house.add(win);
    var frameMat = new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.4 });
    var fh = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.04, 0.03), frameMat);
    fh.position.set(wp.x, wp.y, wp.z + (wp.ry === 0 ? 0.02 : 0));
    fh.rotation.y = wp.ry;
    house.add(fh);
    var fv = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.05, 0.03), frameMat);
    fv.position.set(wp.x, wp.y, wp.z + (wp.ry === 0 ? 0.02 : 0));
    fv.rotation.y = wp.ry;
    house.add(fv);
  });

  // ---- Front door ----
  var door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.15, 0.1), M.door);
  door.position.set(doorGapX, 1.075, HD + 0.01);
  house.add(door);
  var dh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshStandardMaterial({ color: 0xCCCC00, metalness: 0.8, roughness: 0.2 }));
  dh.position.set(doorGapX + 0.28, 1.1, HD + 0.08);
  house.add(dh);

  // ---- Wall top trim (no roof — just a thin cap) ----
  box(TOTAL_W + 0.3, 0.08, 0.3, M.wall, 0, WALL_H + 0.04, -HD, house);
  box(TOTAL_W + 0.3, 0.08, 0.3, M.wall, 0, WALL_H + 0.04, HD, house);
  box(0.3, 0.08, TOTAL_D, M.wall, -HW, WALL_H + 0.04, 0, house);
  box(0.3, 0.08, TOTAL_D, M.wall, HW, WALL_H + 0.04, 0, house);

  // ================================================================
  // Touch Controls — full 360 rotation
  // ================================================================
  var isDragging = false;
  var prevX = 0, prevY = 0;
  var rotY = 0.6, rotX = 0.55;
  var zoom = 20;
  var pinchDist = 0;
  var lastInteraction = Date.now();

  renderer.domElement.addEventListener('pointerdown', function(e) {
    isDragging = true;
    prevX = e.clientX; prevY = e.clientY;
    lastInteraction = Date.now();
  });
  renderer.domElement.addEventListener('pointermove', function(e) {
    if (!isDragging) return;
    rotY += (e.clientX - prevX) * 0.008;
    rotX += (e.clientY - prevY) * 0.005;
    rotX = Math.max(0.05, Math.min(1.4, rotX));
    prevX = e.clientX; prevY = e.clientY;
    lastInteraction = Date.now();
  });
  renderer.domElement.addEventListener('pointerup', function() { isDragging = false; });
  renderer.domElement.addEventListener('pointercancel', function() { isDragging = false; });

  renderer.domElement.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
      var tdx = e.touches[0].clientX - e.touches[1].clientX;
      var tdy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDist = Math.sqrt(tdx * tdx + tdy * tdy);
    }
  }, { passive: true });
  renderer.domElement.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2) {
      var tdx = e.touches[0].clientX - e.touches[1].clientX;
      var tdy = e.touches[0].clientY - e.touches[1].clientY;
      var dist = Math.sqrt(tdx * tdx + tdy * tdy);
      zoom *= pinchDist / dist;
      zoom = Math.max(8, Math.min(30, zoom));
      pinchDist = dist;
    }
  }, { passive: true });

  renderer.domElement.addEventListener('wheel', function(e) {
    zoom += e.deltaY * 0.015;
    zoom = Math.max(8, Math.min(30, zoom));
    lastInteraction = Date.now();
  }, { passive: true });

  // ================================================================
  // Raycaster — tap room for tooltip
  // ================================================================
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var tooltip = document.getElementById('tooltip');

  renderer.domElement.addEventListener('click', function(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObjects(clickableFloors);
    if (hits.length > 0) {
      var ud = hits[0].object.userData;
      var rm = ud.name || ud.roomId;
      var devs = DEVICES.filter(function(d) { return d.roomId === ud.roomId; });
      var html = '<div class="tt-room">' + rm + '</div><div class="tt-devices">';
      if (devs.length === 0) html += 'No devices';
      else devs.forEach(function(d) { html += '<div class="tt-device">• ' + (d.label || d.category) + '</div>'; });
      html += '</div>';
      tooltip.innerHTML = html;
      tooltip.style.display = 'block';
      tooltip.style.left = Math.min(e.clientX + 10, window.innerWidth - 230) + 'px';
      tooltip.style.top = Math.max(e.clientY - 60, 10) + 'px';
      setTimeout(function() { tooltip.style.display = 'none'; }, 3000);
    } else {
      tooltip.style.display = 'none';
    }
  });

  // ================================================================
  // Animation loop
  // ================================================================
  var glowRings = [];
  house.traverse(function(c) {
    if (c.userData && c.userData.isGlow) glowRings.push(c);
  });

  function animate() {
    requestAnimationFrame(animate);
    var now = Date.now();

    // Auto-rotate when idle
    if (!isDragging && (now - lastInteraction > 2500)) {
      rotY += 0.0015;
    }

    // Orbit camera
    camera.position.x = Math.sin(rotY) * Math.cos(rotX) * zoom;
    camera.position.y = Math.sin(rotX) * zoom;
    camera.position.z = Math.cos(rotY) * Math.cos(rotX) * zoom;
    camera.lookAt(0, 1.0, 0);

    // Pulse glow rings + device point lights
    var pulse = 0.3 + Math.sin(now * 0.004) * 0.3;
    var pulse2 = 0.15 + Math.sin(now * 0.003 + 1) * 0.15;
    glowRings.forEach(function(ring) {
      ring.material.opacity = pulse;
      ring.rotation.z = now * 0.001;
    });
    // Pulse device point lights
    house.traverse(function(obj) {
      if (obj.isPointLight && obj.parent && obj.parent !== house) {
        obj.intensity = 0.4 + Math.sin(now * 0.003) * 0.3;
      }
    });

    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function getDevColor(cat) {
    var m = {
      'Television': 0x2196F3, 'TV': 0x2196F3, 'Refrigerator': 0x00BCD4,
      'Fridge': 0x00BCD4, 'Microwave': 0xFF9800, 'Laptop': 0x9C27B0,
      'Oven': 0xF44336, 'Toaster': 0xFF5722, 'Hair Dryer': 0xE91E63,
      'Washing Machine': 0x3F51B5, 'Dryer': 0xE91E63,
      'Air Conditioner': 0x00ACC1, 'Space Heater': 0xFF5722,
      'Monitor': 0x7C4DFF, 'Light Bulb': 0xFFC107, 'Lamp': 0xFFC107,
      'Light': 0xFFC107, 'Dishwasher': 0x795548, 'Fan': 0x009688,
      'Router': 0x607D8B, 'Gaming Console': 0x673AB7,
      'Coffee Maker': 0x8D6E63, 'Blender': 0xFF7043,
    };
    return m[cat] || 0x4CAF50;
  }
})();
<\/script>
</body>
</html>`;
  }, [rooms, devices, isDark]);

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html: htmlContent }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="always"
        allowsInlineMediaPlayback={true}
        overScrollMode="never"
        nestedScrollEnabled={false}
        {...(Platform.OS === 'android' ? { hardwareAccelerationDisabledInWebView: false } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
