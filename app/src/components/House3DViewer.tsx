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
    { roomId: 'kitchen', name: 'Kitchen' },
    { roomId: 'bedroom', name: 'Bedroom' },
    { roomId: 'bathroom', name: 'Bathroom' },
    { roomId: 'office', name: 'Office' },
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

  // 5-room floor plan:
  //  ┌─────────────┬──────────┐
  //  │ Living Room │ Kitchen  │
  //  │  (6x5)      │  (5x5)   │
  //  ├───────┬─────┼──────────┤
  //  │ Bed   │Bath │  Office  │
  //  │(4x4.5)│(3x4.5) (4x4.5)│
  //  └───────┴─────┴──────────┘
  const LR_W = 6, LR_D = 5;     // living room
  const KI_W = 5, KI_D = 5;     // kitchen
  const BR_W = 4, BR_D = 4.5;   // bedroom
  const BA_W = 3, BA_D = 4.5;   // bathroom
  const OF_W = 4, OF_D = 4.5;   // office
  const TOTAL_W = LR_W + KI_W;  // 11
  const TOTAL_D = LR_D + BR_D;  // 9.5

  // Grid: each room has its center position + actual size
  const GRID = [
    { col: 0, row: 0, x: -TOTAL_W/2 + LR_W/2, z: -TOTAL_D/2 + LR_D/2, w: LR_W, d: LR_D },    // living room
    { col: 1, row: 0, x: -TOTAL_W/2 + LR_W + KI_W/2, z: -TOTAL_D/2 + KI_D/2, w: KI_W, d: KI_D }, // kitchen
    { col: 0, row: 1, x: -TOTAL_W/2 + BR_W/2, z: -TOTAL_D/2 + LR_D + BR_D/2, w: BR_W, d: BR_D }, // bedroom
    { col: 1, row: 1, x: -TOTAL_W/2 + BR_W + BA_W/2, z: -TOTAL_D/2 + LR_D + BR_D/2, w: BA_W, d: BA_D }, // bathroom
    { col: 2, row: 1, x: -TOTAL_W/2 + BR_W + BA_W + OF_W/2, z: -TOTAL_D/2 + LR_D + BR_D/2, w: OF_W, d: OF_D }, // office
  ];

  // Determine room type from roomId
  function roomType(id) {
    const l = id.toLowerCase();
    if (l.includes('living')) return 'living';
    if (l.includes('kitchen')) return 'kitchen';
    if (l.includes('bed'))    return 'bedroom';
    if (l.includes('bath'))   return 'bathroom';
    if (l.includes('office') || l.includes('study')) return 'office';
    if (l.includes('garage')) return 'garage';
    if (l.includes('laundry')) return 'laundry';
    if (l.includes('dining')) return 'dining';
    return 'living';
  }

  // ================================================================
  // Furniture builders — coordinates stay within each room's bounds
  // Living (6×5 → ±2.8x, ±2.3z), Kitchen (5×5 → ±2.3x, ±2.3z)
  // Bedroom (4×4.5 → ±1.8x, ±2.0z), Bathroom (3×4.5 → ±1.3x, ±2.0z)
  // Office (4×4.5 → ±1.8x, ±2.0z)
  // NO electronics — only furniture and decorations
  // ================================================================

  function buildLivingRoom(g) {
    // ---- L-shaped sofa along back wall ----
    box(2.6, 0.35, 0.85, M.leather, -0.2, 0.18, -1.7, g);   // seat
    box(2.6, 0.45, 0.12, M.leather, -0.2, 0.52, -2.08, g);   // backrest
    box(0.12, 0.38, 0.85, M.leather, -1.48, 0.36, -1.7, g);  // left arm
    // L-extension right
    box(0.85, 0.35, 0.85, M.leather, 1.6, 0.18, -1.0, g);
    box(0.12, 0.45, 0.85, M.leather, 2.0, 0.52, -1.0, g);
    // Cushions
    box(0.75, 0.1, 0.65, M.cushion, -0.85, 0.4, -1.65, g);
    box(0.75, 0.1, 0.65, M.cushion, 0.0, 0.4, -1.65, g);
    box(0.65, 0.1, 0.65, M.cushion, 1.6, 0.4, -1.0, g);
    // Throw pillows
    box(0.25, 0.2, 0.08, new THREE.MeshStandardMaterial({ color: 0xCC6644, roughness: 0.85 }), -1.2, 0.48, -1.95, g);
    box(0.25, 0.2, 0.08, M.cushion, 1.85, 0.48, -0.6, g);

    // ---- Coffee table ----
    box(1.2, 0.04, 0.6, new THREE.MeshStandardMaterial({ color: 0x88BBDD, transparent: true, opacity: 0.3, roughness: 0.05 }), 0, 0.42, -0.3, g);
    box(1.1, 0.04, 0.5, M.wood, 0, 0.38, -0.3, g);
    cyl(0.04, 0.04, 0.36, 8, M.metal, -0.45, 0.19, -0.5, g);
    cyl(0.04, 0.04, 0.36, 8, M.metal, 0.45, 0.19, -0.5, g);
    cyl(0.04, 0.04, 0.36, 8, M.metal, -0.45, 0.19, -0.1, g);
    cyl(0.04, 0.04, 0.36, 8, M.metal, 0.45, 0.19, -0.1, g);
    // Magazine
    box(0.18, 0.01, 0.24, new THREE.MeshStandardMaterial({ color: 0xDD5533, roughness: 0.8 }), 0.25, 0.44, -0.25, g);

    // ---- TV stand (empty — TV goes here when added) ----
    box(1.4, 0.42, 0.35, M.darkWood, 0, 0.21, 2.0, g);
    box(0.6, 0.02, 0.28, M.wood, -0.3, 0.16, 2.0, g);
    box(0.6, 0.02, 0.28, M.wood, 0.3, 0.16, 2.0, g);
    box(0.1, 0.02, 0.02, M.metal, -0.3, 0.35, 2.18, g);
    box(0.1, 0.02, 0.02, M.metal, 0.3, 0.35, 2.18, g);

    // ---- Area rug ----
    box(2.4, 0.015, 1.8, M.rug, 0, 0.008, -0.4, g);
    box(2.0, 0.016, 0.06, new THREE.MeshStandardMaterial({ color: 0xAA6633, roughness: 1.0 }), 0, 0.017, -0.7, g);

    // ---- Side table ----
    box(0.4, 0.5, 0.35, M.darkWood, -2.1, 0.25, -1.7, g);
    // Vase
    cyl(0.05, 0.04, 0.16, 8, new THREE.MeshStandardMaterial({ color: 0x3366AA, roughness: 0.3 }), -2.1, 0.58, -1.7, g);

    // ---- Bookshelf ----
    box(0.8, 1.6, 0.28, M.darkWood, -2.4, 0.8, 0.3, g);
    box(0.7, 0.03, 0.22, M.wood, -2.4, 0.35, 0.3, g);
    box(0.7, 0.03, 0.22, M.wood, -2.4, 0.75, 0.3, g);
    box(0.7, 0.03, 0.22, M.wood, -2.4, 1.15, 0.3, g);
    var bookC = [0xE74C3C, 0x3498DB, 0x2ECC71, 0xF39C12, 0x9B59B6];
    for (var bi = 0; bi < 5; bi++) box(0.06, 0.28, 0.16, new THREE.MeshStandardMaterial({ color: bookC[bi], roughness: 0.7 }), -2.65 + bi * 0.13, 0.52, 0.3, g);
    for (var bi2 = 0; bi2 < 4; bi2++) box(0.06, 0.22, 0.16, new THREE.MeshStandardMaterial({ color: bookC[bi2], roughness: 0.7 }), -2.6 + bi2 * 0.13, 0.9, 0.3, g);

    // ---- Plant (corner) ----
    cyl(0.18, 0.13, 0.3, 8, M.pot, 2.2, 0.15, 1.7, g);
    cyl(0.16, 0.16, 0.02, 8, new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 1.0 }), 2.2, 0.31, 1.7, g);
    var lf1 = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), M.plant); lf1.position.set(2.2, 0.6, 1.7); lf1.scale.y = 1.3; g.add(lf1);
    var lf2 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), M.plant); lf2.position.set(2.05, 0.75, 1.55); g.add(lf2);

    // ---- Wall art ----
    box(0.9, 0.6, 0.03, M.darkWood, 0, 2.0, -2.25, g);
    box(0.8, 0.5, 0.02, new THREE.MeshStandardMaterial({ color: 0x5588AA, roughness: 0.6 }), 0, 2.0, -2.23, g);
  }

  function buildKitchen(g) {
    // ---- Counter along back wall ----
    box(3.8, 0.85, 0.55, M.darkWood, 0, 0.43, -1.9, g);
    box(3.8, 0.05, 0.6, M.counter, 0, 0.88, -1.9, g);
    // Upper cabinets
    box(1.1, 0.65, 0.3, M.darkWood, -1.2, 2.0, -2.05, g);
    box(1.1, 0.65, 0.3, M.darkWood, 0.3, 2.0, -2.05, g);
    box(0.9, 0.65, 0.3, M.darkWood, 1.5, 2.0, -2.05, g);
    // Cabinet handles
    for (var ch of [-1.2, 0.3, 1.5]) box(0.08, 0.02, 0.02, M.metal, ch, 1.78, -1.89, g);
    for (var ch2 of [-1.4, -0.4, 0.4, 1.4]) box(0.08, 0.02, 0.02, M.metal, ch2, 0.43, -1.6, g);

    // ---- Right wall counter ----
    box(0.55, 0.85, 2.2, M.darkWood, 1.85, 0.43, 0.3, g);
    box(0.6, 0.05, 2.2, M.counter, 1.85, 0.88, 0.3, g);

    // ---- Sink ----
    box(0.5, 0.04, 0.4, M.metal, 0.4, 0.91, -1.85, g);
    box(0.4, 0.12, 0.3, new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6 }), 0.4, 0.84, -1.85, g);
    cyl(0.018, 0.018, 0.28, 8, M.metal, 0.4, 1.08, -2.08, g);
    box(0.018, 0.018, 0.12, M.metal, 0.4, 1.2, -2.0, g);

    // ---- Island ----
    box(1.8, 0.82, 0.75, M.wood, -0.2, 0.41, 0.6, g);
    box(1.8, 0.05, 0.8, M.counter, -0.2, 0.86, 0.6, g);

    // ---- 2 Stools ----
    for (var sx of [-0.6, 0.2]) {
      cyl(0.14, 0.14, 0.04, 12, M.leather, sx, 0.62, 1.25, g);
      cyl(0.03, 0.03, 0.58, 8, M.metal, sx, 0.32, 1.25, g);
      cyl(0.12, 0.14, 0.02, 12, M.metal, sx, 0.02, 1.25, g);
    }

    // ---- Fruit bowl ----
    cyl(0.12, 0.09, 0.06, 12, M.ceramic, -0.2, 0.92, 0.6, g);
    var ap = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0xCC2222, roughness: 0.5 }));
    ap.position.set(-0.22, 0.97, 0.58); g.add(ap);
    var or2 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0xFF8800, roughness: 0.5 }));
    or2.position.set(-0.16, 0.97, 0.62); g.add(or2);

    // ---- Cutting board on counter ----
    box(0.3, 0.02, 0.18, new THREE.MeshStandardMaterial({ color: 0xD2B48C, roughness: 0.7 }), -1.1, 0.92, -1.85, g);

    // ---- Backsplash tiles ----
    for (var tx = -1.6; tx <= 1.6; tx += 0.3) {
      for (var ty = 1.05; ty <= 1.55; ty += 0.25) {
        box(0.22, 0.18, 0.01, M.tile, tx, ty, -2.15, g);
      }
    }

    // ---- Hanging pot rack ----
    box(1.0, 0.03, 0.03, M.metal, 0, 2.5, 0, g);
    cyl(0.01, 0.01, 0.2, 6, M.metal, -0.3, 2.4, 0, g);
    cyl(0.01, 0.01, 0.2, 6, M.metal, 0.3, 2.4, 0, g);
    cyl(0.08, 0.06, 0.05, 10, new THREE.MeshStandardMaterial({ color: 0x8B4513, metalness: 0.3 }), -0.15, 2.28, 0, g);
    cyl(0.07, 0.05, 0.04, 10, M.metal, 0.15, 2.26, 0, g);
  }

  function buildBedroom(g) {
    // Room is 4×4.5 → safe ±1.8x, ±2.0z

    // ---- Bed (centered, against back wall) ----
    box(1.6, 0.22, 2.0, M.darkWood, 0, 0.11, 0.0, g);
    // Headboard
    box(1.7, 0.9, 0.08, M.darkWood, 0, 0.7, 0.96, g);
    box(0.7, 0.6, 0.03, new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.5 }), -0.4, 0.6, 1.01, g);
    box(0.7, 0.6, 0.03, new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.5 }), 0.4, 0.6, 1.01, g);
    // Footboard
    box(1.6, 0.25, 0.06, M.darkWood, 0, 0.35, -0.98, g);
    // Mattress
    box(1.5, 0.18, 1.85, M.mattress, 0, 0.32, 0.0, g);
    // Pillows
    box(0.45, 0.1, 0.3, M.pillow, -0.35, 0.48, 0.6, g);
    box(0.45, 0.1, 0.3, M.pillow, 0.35, 0.48, 0.6, g);
    // Duvet
    box(1.4, 0.05, 1.2, new THREE.MeshStandardMaterial({ color: 0x6688BB, roughness: 0.9 }), 0, 0.44, -0.2, g);
    // Folded blanket
    box(1.2, 0.06, 0.35, new THREE.MeshStandardMaterial({ color: 0x8899AA, roughness: 0.85 }), 0, 0.47, -0.7, g);

    // ---- Nightstands ----
    box(0.4, 0.48, 0.35, M.darkWood, -1.2, 0.24, 0.5, g);
    box(0.4, 0.48, 0.35, M.darkWood, 1.2, 0.24, 0.5, g);
    box(0.06, 0.02, 0.02, M.metal, -1.2, 0.32, 0.69, g);
    box(0.06, 0.02, 0.02, M.metal, 1.2, 0.32, 0.69, g);
    // Alarm clock
    box(0.08, 0.06, 0.04, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }), -1.2, 0.52, 0.5, g);

    // ---- Dresser (smaller, fits in room) ----
    box(0.9, 0.75, 0.4, M.wood, 1.4, 0.38, -1.6, g);
    for (var dy of [0.2, 0.42, 0.62]) box(0.08, 0.02, 0.02, M.metal, 1.4, dy, -1.38, g);
    // Mirror above
    box(0.6, 0.8, 0.03, new THREE.MeshStandardMaterial({ color: 0xAABBCC, metalness: 0.8, roughness: 0.05 }), 1.4, 1.4, -1.88, g);
    box(0.65, 0.85, 0.02, M.darkWood, 1.4, 1.4, -1.9, g);

    // ---- Wardrobe (trimmed to fit) ----
    box(1.0, 2.0, 0.5, M.darkWood, -1.3, 1.0, -1.6, g);
    box(0.01, 1.7, 0.02, M.metal, -1.3, 1.0, -1.33, g);
    box(0.03, 0.12, 0.03, M.metal, -1.05, 1.05, -1.33, g);
    box(0.03, 0.12, 0.03, M.metal, -1.55, 1.05, -1.33, g);

    // ---- Area rug ----
    box(1.0, 0.015, 0.7, M.rug, 0, 0.008, -1.5, g);

    // ---- Small desk (for laptop when added) ----
    box(0.75, 0.04, 0.4, M.wood, -1.3, 0.7, 1.65, g);
    box(0.04, 0.68, 0.35, M.wood, -1.65, 0.35, 1.65, g);
    box(0.04, 0.68, 0.35, M.wood, -0.95, 0.35, 1.65, g);
    // Small chair
    box(0.35, 0.04, 0.32, M.leather, -1.3, 0.42, 1.25, g);
    cyl(0.025, 0.025, 0.4, 8, M.metal, -1.3, 0.22, 1.25, g);
    cyl(0.12, 0.12, 0.02, 10, M.metal, -1.3, 0.01, 1.25, g);
  }

  function buildBathroom(g) {
    // Room is 3×4.5 → safe ±1.3x, ±2.0z. Compact layout.

    // ---- Tile floor ----
    box(2.4, 0.02, 4.0, M.tile, 0, 0.01, 0, g);

    // ---- Bathtub (along left wall) ----
    box(0.65, 0.5, 1.5, M.ceramic, -0.8, 0.25, -1.0, g);
    box(0.5, 0.4, 1.3, new THREE.MeshStandardMaterial({ color: 0xEEEEEE, roughness: 0.15 }), -0.8, 0.28, -1.0, g);
    box(0.45, 0.02, 1.25, new THREE.MeshStandardMaterial({ color: 0x4488CC, transparent: true, opacity: 0.35, roughness: 0.05 }), -0.8, 0.45, -1.0, g);
    // Faucet
    cyl(0.02, 0.02, 0.25, 8, M.metal, -0.8, 0.62, -1.7, g);
    box(0.015, 0.015, 0.08, M.metal, -0.8, 0.73, -1.65, g);

    // ---- Shower (back-left corner) ----
    box(0.8, 0.06, 0.8, M.tile, -0.7, 0.03, 1.4, g);
    var glassMat = new THREE.MeshStandardMaterial({ color: 0xAADDFF, transparent: true, opacity: 0.15, roughness: 0.05, metalness: 0.1 });
    box(0.8, 2.1, 0.02, glassMat, -0.7, 1.1, 1.02, g);
    box(0.02, 2.1, 0.8, glassMat, -0.28, 1.1, 1.4, g);
    // Shower head + pipe
    cyl(0.06, 0.08, 0.02, 10, M.metal, -0.7, 2.2, 1.75, g);
    cyl(0.012, 0.012, 0.4, 8, M.metal, -0.7, 2.0, 1.8, g);

    // ---- Toilet (right side) ----
    box(0.35, 0.28, 0.45, M.ceramic, 0.7, 0.14, -0.8, g);
    cyl(0.17, 0.15, 0.1, 12, M.ceramic, 0.7, 0.3, -0.9, g);
    box(0.3, 0.38, 0.15, M.ceramic, 0.7, 0.47, -0.55, g);
    box(0.28, 0.03, 0.25, M.ceramic, 0.7, 0.3, -0.85, g);
    cyl(0.012, 0.012, 0.06, 6, M.metal, 0.83, 0.64, -0.55, g);

    // ---- Sink vanity (right, near front wall) ----
    box(0.7, 0.7, 0.4, M.white, 0.6, 0.35, 1.6, g);
    box(0.7, 0.04, 0.42, M.counter, 0.6, 0.72, 1.6, g);
    cyl(0.14, 0.12, 0.06, 14, M.ceramic, 0.6, 0.72, 1.55, g);
    cyl(0.012, 0.012, 0.18, 8, M.metal, 0.6, 0.86, 1.75, g);
    box(0.012, 0.012, 0.08, M.metal, 0.6, 0.96, 1.7, g);
    // Mirror
    box(0.5, 0.7, 0.03, new THREE.MeshStandardMaterial({ color: 0xBBCCDD, metalness: 0.85, roughness: 0.03 }), 0.6, 1.5, 1.88, g);
    box(0.55, 0.75, 0.02, M.metal, 0.6, 1.5, 1.89, g);

    // ---- Towel rack (left wall) ----
    box(0.45, 0.02, 0.04, M.metal, -1.1, 1.15, 0.2, g);
    box(0.45, 0.02, 0.04, M.metal, -1.1, 0.95, 0.2, g);
    // Towels
    box(0.38, 0.16, 0.03, new THREE.MeshStandardMaterial({ color: 0x4488FF, roughness: 0.9 }), -1.1, 1.0, 0.22, g);
    box(0.35, 0.14, 0.03, new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.9 }), -1.1, 1.15, 0.22, g);

    // ---- Bath mat ----
    box(0.5, 0.015, 0.35, new THREE.MeshStandardMaterial({ color: 0x66BB66, roughness: 1.0 }), -0.4, 0.02, -0.2, g);

    // ---- Toilet paper holder ----
    box(0.08, 0.02, 0.04, M.metal, 0.95, 0.5, -1.0, g);
    cyl(0.03, 0.03, 0.08, 8, M.white, 0.95, 0.5, -1.06, g);

    // ---- Soap dispenser ----
    cyl(0.02, 0.025, 0.07, 8, M.white, 0.4, 0.79, 1.55, g);
    cyl(0.007, 0.007, 0.03, 6, M.metal, 0.4, 0.83, 1.55, g);
  }

  function buildOffice(g) {
    // Room is 4×4.5 → safe ±1.8x, ±2.0z

    // ---- Desk (against back wall) ----
    box(1.8, 0.05, 0.7, M.wood, 0, 0.73, -1.5, g);
    box(0.05, 0.7, 0.05, M.metal, -0.85, 0.37, -1.8, g);
    box(0.05, 0.7, 0.05, M.metal, 0.85, 0.37, -1.8, g);
    box(0.05, 0.7, 0.05, M.metal, -0.85, 0.37, -1.15, g);
    box(0.05, 0.7, 0.05, M.metal, 0.85, 0.37, -1.15, g);
    // Cable tray
    box(1.2, 0.03, 0.12, M.metal, 0, 0.62, -1.55, g);
    // Drawer unit
    box(0.4, 0.5, 0.45, M.darkWood, 1.35, 0.25, -1.5, g);
    box(0.06, 0.02, 0.02, M.metal, 1.35, 0.18, -1.26, g);
    box(0.06, 0.02, 0.02, M.metal, 1.35, 0.35, -1.26, g);

    // ---- Office chair ----
    cyl(0.2, 0.2, 0.05, 14, M.leather, 0, 0.48, -0.5, g);
    box(0.38, 0.5, 0.05, M.leather, 0, 0.8, -0.72, g);
    cyl(0.19, 0.19, 0.05, 14, M.leather, 0, 1.06, -0.72, g);
    cyl(0.03, 0.03, 0.25, 8, M.metal, 0, 0.33, -0.5, g);
    for (var a = 0; a < 5; a++) {
      var an = (a / 5) * Math.PI * 2;
      var cx2 = Math.cos(an) * 0.22;
      var cz2 = Math.sin(an) * 0.22 - 0.5;
      box(0.03, 0.03, 0.22, M.metal, cx2, 0.03, cz2, g);
    }
    // Armrests
    box(0.05, 0.03, 0.2, M.metal, -0.22, 0.62, -0.6, g);
    box(0.05, 0.03, 0.2, M.metal, 0.22, 0.62, -0.6, g);

    // ---- Bookshelf ----
    box(0.8, 2.0, 0.3, M.darkWood, -1.4, 1.0, 1.4, g);
    for (var sy of [0.35, 0.75, 1.15, 1.55]) box(0.7, 0.03, 0.25, M.wood, -1.4, sy, 1.4, g);
    var obc = [0xE74C3C, 0x2980B9, 0x27AE60, 0xF1C40F, 0x8E44AD];
    for (var obi = 0; obi < 4; obi++) box(0.06, 0.22, 0.18, new THREE.MeshStandardMaterial({ color: obc[obi], roughness: 0.7 }), -1.6 + obi * 0.12, 0.5, 1.4, g);
    for (var obi2 = 0; obi2 < 3; obi2++) box(0.06, 0.2, 0.18, new THREE.MeshStandardMaterial({ color: obc[obi2 + 1], roughness: 0.7 }), -1.55 + obi2 * 0.12, 0.9, 1.4, g);
    // Globe on shelf
    var globe = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0x4488AA, roughness: 0.4 }));
    globe.position.set(-1.2, 1.22, 1.4); g.add(globe);

    // ---- Plant ----
    cyl(0.12, 0.09, 0.2, 8, M.pot, 1.4, 0.1, 1.5, g);
    var opl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), M.plant); opl.position.set(1.4, 0.38, 1.5); opl.scale.y = 1.3; g.add(opl);

    // ---- Area rug ----
    box(2.0, 0.015, 1.4, M.rug, 0, 0.008, -0.7, g);

    // ---- Wall clock ----
    cyl(0.15, 0.15, 0.02, 16, M.white, 0, 2.1, -1.92, g);
    cyl(0.13, 0.13, 0.01, 16, new THREE.MeshStandardMaterial({ color: 0xFFFFF0, roughness: 0.3 }), 0, 2.1, -1.91, g);
    box(0.01, 0.08, 0.004, new THREE.MeshStandardMaterial({ color: 0x111111 }), 0, 2.14, -1.9, g);
    box(0.01, 0.055, 0.004, new THREE.MeshStandardMaterial({ color: 0x111111 }), 0.03, 2.12, -1.9, g);

    // ---- Whiteboard ----
    box(1.0, 0.7, 0.03, M.white, -1.4, 1.8, -1.92, g);
    box(1.05, 0.75, 0.02, M.metal, -1.4, 1.8, -1.93, g);
    box(0.6, 0.03, 0.05, M.metal, -1.4, 1.4, -1.88, g);
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
    office: buildOffice,
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
      'tv': { x: 0, z: 1.9, key: 'tv-stand' },          // on the TV stand
      'television': { x: 0, z: 1.9, key: 'tv-stand' },
      'gaming': { x: 0.5, z: 1.9, key: 'console' },      // next to TV
      'console': { x: 0.5, z: 1.9, key: 'console' },
      'lamp': { x: 2.0, z: -1.8, key: 'side-table' },    // on side table
      'light': { x: 2.0, z: -1.8, key: 'lamp-spot' },
      'router': { x: -2.0, z: -0.5, key: 'shelf' },      // on bookshelf
      'fan': { x: 1.8, z: 0.5, key: 'corner-fan' },
      'air conditioner': { x: 0, z: -2.2, key: 'wall-ac' },
      'space heater': { x: -1.8, z: 0.5, key: 'heater' },
      'speaker': { x: -0.5, z: 1.9, key: 'speaker' },
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
      'tv': { x: 0, z: -1.8, key: 'wall-tv' },           // wall-mounted
      'television': { x: 0, z: -1.8, key: 'wall-tv' },
      'laptop': { x: 1.8, z: 1.5, key: 'desk-laptop' },  // on desk
      'monitor': { x: 1.8, z: 1.5, key: 'desk-mon' },
      'lamp': { x: -1.5, z: 0.4, key: 'nightstand-lamp' },
      'light': { x: 1.5, z: 0.4, key: 'nightstand-light' },
      'fan': { x: -1.8, z: 1.5, key: 'corner-fan' },
      'air conditioner': { x: 0, z: -2.2, key: 'wall-ac' },
      'space heater': { x: 1.8, z: 0, key: 'heater' },
      'charger': { x: -1.5, z: 0.4, key: 'nightstand-charge' },
      'phone': { x: 1.5, z: 0.4, key: 'nightstand-phone' },
      'router': { x: 1.8, z: -1.6, key: 'dresser-router' },
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
      'monitor': { x: 0, z: -1.75, key: 'desk-monitor' },    // on desk
      'laptop': { x: 0, z: -1.4, key: 'desk-laptop' },
      'tv': { x: 1.8, z: 0, key: 'wall-tv' },
      'television': { x: 1.8, z: 0, key: 'wall-tv' },
      'router': { x: -1.8, z: 1.5, key: 'shelf-router' },    // on bookshelf
      'lamp': { x: 0.8, z: -1.75, key: 'desk-lamp' },
      'light': { x: 0.8, z: -1.75, key: 'desk-lamp' },
      'fan': { x: 1.8, z: 1.5, key: 'corner-fan' },
      'space heater': { x: -0.8, z: 0.5, key: 'heater' },
      'charger': { x: -0.5, z: -1.4, key: 'desk-charger' },
      'phone': { x: -0.5, z: -1.4, key: 'desk-phone' },
      'air conditioner': { x: 0, z: -2.2, key: 'wall-ac' },
      'gaming': { x: 0.5, z: -1.75, key: 'desk-console' },
    };

    var spotMaps = { living: livingSpots, kitchen: kitchenSpots, bedroom: bedroomSpots, bathroom: bathroomSpots, office: officeSpots };
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
  // Outer Walls (NO ROOF!) — 5-room asymmetric layout
  // Layout:
  //  ┌──────────┬─────────┐
  //  │ Living   │ Kitchen │      top row: LR_D = 5 high
  //  │ (6 wide) │ (5 wide)│
  //  ├────┬─────┼─────────┤
  //  │Bed │Bath │ Office  │      bottom row: BR_D = 4.5 high
  //  │(4) │(3)  │  (4)    │
  //  └────┴─────┴─────────┘
  //  Total: 11 wide x 9.5 deep
  // ================================================================

  var HW = TOTAL_W / 2;  // 5.5
  var HD = TOTAL_D / 2;  // 4.75

  // ---- Outer walls ----
  // Back wall (top)
  box(TOTAL_W + WALL_T, WALL_H, WALL_T, M.wall, 0, WALL_H / 2, -HD, house);
  // Front wall (bottom, with door gap in bedroom area)
  var doorGapX = -HW + BR_W / 2;
  box(BR_W / 2 - 0.6, WALL_H, WALL_T, M.wall, -HW + (BR_W / 2 - 0.6) / 2, WALL_H / 2, HD, house);
  box(TOTAL_W - BR_W / 2 - 0.6, WALL_H, WALL_T, M.wall, -HW + BR_W / 2 + 0.6 + (TOTAL_W - BR_W / 2 - 0.6) / 2, WALL_H / 2, HD, house);
  box(1.2, WALL_H - 2.2, WALL_T, M.wall, doorGapX, WALL_H - 0.4, HD, house);
  // Left wall
  box(WALL_T, WALL_H, TOTAL_D, M.wall, -HW, WALL_H / 2, 0, house);
  // Right wall
  box(WALL_T, WALL_H, TOTAL_D, M.wall, HW, WALL_H / 2, 0, house);

  // ---- Interior walls ----
  var IW = WALL_T * 0.7;  // thinner interior walls
  var rowSplitZ = -HD + LR_D;  // horizontal split between top and bottom rows

  // Horizontal wall (separating top row from bottom row, with doorway gaps)
  // Living→Bedroom gap
  box(BR_W - 1.2, WALL_H, IW, M.wallInner, -HW + BR_W / 2, WALL_H / 2, rowSplitZ, house);
  // Bathroom section (no gap, solid)
  box(BA_W, WALL_H, IW, M.wallInner, -HW + BR_W + BA_W / 2, WALL_H / 2, rowSplitZ, house);
  // Kitchen→Office gap
  box(OF_W - 1.2, WALL_H, IW, M.wallInner, -HW + BR_W + BA_W + OF_W / 2, WALL_H / 2, rowSplitZ, house);

  // Vertical wall: Living room | Kitchen (top row)
  var topVertX = -HW + LR_W;
  box(IW, WALL_H, LR_D / 2 - 0.6, M.wallInner, topVertX, WALL_H / 2, -HD + LR_D / 4 - 0.3, house);
  box(IW, WALL_H, LR_D / 2 - 0.6, M.wallInner, topVertX, WALL_H / 2, -HD + LR_D * 3 / 4 + 0.3, house);

  // Vertical wall: Bedroom | Bathroom (bottom row left)
  var botVert1X = -HW + BR_W;
  box(IW, WALL_H, BR_D / 2 - 0.5, M.wallInner, botVert1X, WALL_H / 2, rowSplitZ + BR_D / 4 - 0.25, house);
  box(IW, WALL_H, BR_D / 2 - 0.5, M.wallInner, botVert1X, WALL_H / 2, rowSplitZ + BR_D * 3 / 4 + 0.25, house);

  // Vertical wall: Bathroom | Office (bottom row right)
  var botVert2X = -HW + BR_W + BA_W;
  box(IW, WALL_H, BR_D / 2 - 0.5, M.wallInner, botVert2X, WALL_H / 2, rowSplitZ + BR_D / 4 - 0.25, house);
  box(IW, WALL_H, BR_D / 2 - 0.5, M.wallInner, botVert2X, WALL_H / 2, rowSplitZ + BR_D * 3 / 4 + 0.25, house);

  // ---- Windows ----
  var winPositions = [
    // Back wall windows (living + kitchen)
    { x: -HW + LR_W / 2, y: 1.8, z: -HD + 0.01, ry: 0 },
    { x: -HW + LR_W + KI_W / 2, y: 1.8, z: -HD + 0.01, ry: 0 },
    // Front wall windows (bedroom + office)
    { x: -HW + BR_W / 2 + 1.2, y: 1.8, z: HD - 0.01, ry: 0 },
    { x: HW - OF_W / 2, y: 1.8, z: HD - 0.01, ry: 0 },
    // Left wall windows
    { x: -HW + 0.01, y: 1.8, z: -HD + LR_D / 2, ry: Math.PI / 2 },
    { x: -HW + 0.01, y: 1.8, z: rowSplitZ + BR_D / 2, ry: Math.PI / 2 },
    // Right wall windows
    { x: HW - 0.01, y: 1.8, z: -HD + KI_D / 2, ry: Math.PI / 2 },
    { x: HW - 0.01, y: 1.8, z: rowSplitZ + OF_D / 2, ry: Math.PI / 2 },
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
  var door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.15, 0.1), M.door);
  door.position.set(doorGapX, 1.075, HD + 0.01);
  house.add(door);
  var dh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshStandardMaterial({ color: 0xCCCC00, metalness: 0.8, roughness: 0.2 }));
  dh.position.set(doorGapX + 0.3, 1.1, HD + 0.08);
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
