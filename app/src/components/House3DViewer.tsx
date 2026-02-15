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

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { View, StyleSheet, Platform, Text, ActivityIndicator } from 'react-native';

// WebView is native-only; on web we render an <iframe> instead
let WebView: any = null;
if (Platform.OS !== 'web') {
  try { WebView = require('react-native-webview').WebView; } catch {}
}

interface DeviceInfo {
  label: string;
  category: string;
  roomId: string;
  watts?: number;
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
  onDevicePress?: (device: { label: string; category: string; roomId: string; roomName?: string }) => void;
}

export function House3DViewer({
  rooms = [
    { roomId: 'bedroom', name: 'Bedroom' },
    { roomId: 'kitchen', name: 'Kitchen' },
    { roomId: 'bathroom', name: 'Bathroom' },
    { roomId: 'living-room', name: 'Living Room' },
    { roomId: 'dining-room', name: 'Dining Room' },
  ],
  devices = [],
  isDark = true,
  height = 400,
  onDevicePress,
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
    position: absolute; display: none; padding: 12px 18px; border-radius: 14px;
    background: ${isDark ? 'rgba(10,10,30,0.95)' : 'rgba(255,255,255,0.97)'};
    color: ${textColor}; font-size: 12px; pointer-events: none;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 40px rgba(76,175,80,0.1);
    backdrop-filter: blur(12px);
    border: 1px solid ${isDark ? 'rgba(76,175,80,0.3)' : 'rgba(0,0,0,0.1)'};
    max-width: 240px; z-index: 10;
    animation: tooltipIn 0.2s ease-out;
  }
  @keyframes tooltipIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  #tooltip .tt-room { font-weight: 700; font-size: 14px; color: #4CAF50; margin-bottom: 6px; letter-spacing: 0.3px; }
  #tooltip .tt-devices { font-size: 11px; opacity: 0.85; line-height: 1.6; }
  #tooltip .tt-device { padding: 2px 0; }
  #roofToggle {
    position: absolute; top: 14px; right: 14px;
    width: 48px; height: 48px; border-radius: 50%;
    background: ${isDark ? 'rgba(20,20,40,0.85)' : 'rgba(255,255,255,0.92)'};
    border: 2px solid ${isDark ? 'rgba(76,175,80,0.5)' : 'rgba(0,0,0,0.12)'};
    color: ${textColor}; font-size: 22px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    z-index: 20; transition: all 0.2s;
    -webkit-tap-highlight-color: transparent;
  }
  #roofToggle:active { transform: scale(0.9); }
  #roofToggle .label {
    position: absolute; top: 52px; right: 0;
    font-size: 9px; white-space: nowrap; opacity: 0.7;
    color: ${textColor}; pointer-events: none;
  }
</style>
</head>
<body>
<div id="tooltip"></div>
<div id="roofToggle" title="Toggle Roof">🏠<span class="label">Roof On</span></div>
<div id="info">Drag to rotate · Pinch to zoom · Tap device for details</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/DRACOLoader.js"><\/script>
<script>
(function() {
  const ROOMS = ${roomsJson};
  const DEVICES = ${devicesJson};
  const IS_DARK = ${isDark};

  // Helper: send message to host (WebView on native, parent window on web)
  function sendToHost(data) {
    var msg = JSON.stringify(data);
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(msg);
    } else if (window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  }

  // ================================================================
  // glTF Model Loading Infrastructure
  // Maps category → glTF model URL. Falls back to primitive if load fails.
  // Add model URLs here as they become available.
  // ================================================================
  var MODEL_URLS = {
    // Add GLB model URLs here when available. Example:
    // 'sofa': 'https://cdn.example.com/models/sofa_lowpoly.glb',
    // 'bed': 'https://cdn.example.com/models/bed_lowpoly.glb',
  };

  // ================================================================
  // HOUSE_LAYOUT — Single source of truth for per-room furniture
  // NOTHING renders in a room unless it is defined here.
  // Each room has UNIQUE furniture — no duplicates across rooms.
  // Positions are LOCAL to room center (0,0,0). y=0 is floor level.
  // ================================================================
  var HOUSE_LAYOUT = {
    bedroom: {
      name: 'Bedroom', bounds: { w: 4.5, d: 4.5 },
      furniture: [
        { id: 'bed1', type: 'bed', pos: {x:-0.4, z:-1.0}, size: {w:1.6, d:2.0, h:0.6} },
        { id: 'nightstand1', type: 'nightstand', pos: {x:0.6, z:-1.5}, size: {w:0.3, d:0.3, h:0.4} },
        { id: 'desk1', type: 'study_desk', pos: {x:-1.52, z:0.5}, size: {w:0.55, d:1.0, h:0.75} },
        { id: 'chair1', type: 'desk_chair', pos: {x:-1.05, z:0.5}, size: {w:0.4, d:0.4, h:0.5} },
        { id: 'dresser1', type: 'dresser', pos: {x:0.5, z:0.5}, size: {w:0.9, d:0.42, h:0.88} },
        { id: 'wardrobe1', type: 'wardrobe', pos: {x:1.6, z:0.1}, size: {w:0.4, d:0.8, h:2.2} },
      ]
    },
    kitchen: {
      name: 'Kitchen', bounds: { w: 4.5, d: 4.5 },
      furniture: [
        { id: 'counter1', type: 'sink_counter', pos: {x:0, z:-1.72}, size: {w:3.9, d:0.58, h:0.86} },
        { id: 'counter2', type: 'cooking_counter', pos: {x:0, z:-0.72}, size: {w:3.9, d:0.58, h:0.86} },
        { id: 'island1', type: 'kitchen_island', pos: {x:0.5, z:0.8}, size: {w:1.25, d:0.65, h:0.86} },
        { id: 'stool1', type: 'bar_stool', pos: {x:0.2, z:1.35}, size: {w:0.3, d:0.3, h:0.65} },
        { id: 'stool2', type: 'bar_stool', pos: {x:0.8, z:1.35}, size: {w:0.3, d:0.3, h:0.65} },
      ]
    },
    bathroom: {
      name: 'Bathroom', bounds: { w: 3.0, d: 4.5 },
      furniture: [
        { id: 'tub1', type: 'bathtub', pos: {x:0.5, z:-1.2}, size: {w:0.7, d:1.5, h:0.6} },
        { id: 'toilet1', type: 'toilet', pos: {x:-0.5, z:0.2}, size: {w:0.4, d:0.5, h:0.6} },
        { id: 'sink1', type: 'pedestal_sink', pos: {x:0.6, z:1.4}, size: {w:0.52, d:0.42, h:0.65} },
        { id: 'mirror1', type: 'bath_mirror', pos: {x:0.6, z:1.74}, size: {w:0.55, d:0.1, h:0.7} },
        { id: 'towelrack1', type: 'towel_rack', pos: {x:1.1, z:0.0}, size: {w:0.06, d:0.35, h:0.9} },
      ]
    },
    living: {
      name: 'Living Room', bounds: { w: 4.5, d: 5.0 },
      furniture: [
        { id: 'tvstand1', type: 'tv_stand', pos: {x:-0.8, z:-2.0}, size: {w:1.1, d:0.38, h:0.35} },
        { id: 'sofa1', type: 'sofa', pos: {x:0, z:2.0}, size: {w:1.8, d:0.8, h:0.65} },
        { id: 'coffee1', type: 'coffee_table', pos: {x:0, z:0.4}, size: {w:1.0, d:0.6, h:0.42} },
        { id: 'lamptable1', type: 'lamp_table', pos: {x:-1.4, z:0.3}, size: {w:0.4, d:0.4, h:0.45} },
        { id: 'plant1', type: 'fiddle_leaf', pos: {x:-1.4, z:2.0}, size: {w:0.3, d:0.3, h:0.8} },
        { id: 'arclamp1', type: 'arc_lamp', pos: {x:1.5, z:-1.5}, size: {w:0.3, d:0.3, h:1.65} },
      ]
    },
    dining: {
      name: 'Dining Room', bounds: { w: 7.5, d: 5.0 },
      furniture: [
        { id: 'table1', type: 'dining_table', pos: {x:0, z:0}, size: {w:1.8, d:1.2, h:0.78} },
        { id: 'chair_n', type: 'dining_chair', pos: {x:0, z:-1.3}, size: {w:0.38, d:0.36, h:0.92} },
        { id: 'chair_s', type: 'dining_chair', pos: {x:0, z:1.3}, size: {w:0.38, d:0.36, h:0.92} },
        { id: 'chair_w', type: 'dining_chair', pos: {x:-1.95, z:0}, size: {w:0.38, d:0.36, h:0.92} },
        { id: 'chair_e', type: 'dining_chair', pos: {x:1.95, z:0}, size: {w:0.38, d:0.36, h:0.92} },
        { id: 'cabinet_l', type: 'china_cabinet', pos: {x:-2.5, z:1.93}, size: {w:0.95, d:0.45, h:1.65} },
        { id: 'cabinet_r', type: 'china_cabinet', pos: {x:2.5, z:1.93}, size: {w:0.95, d:0.45, h:1.65} },
      ]
    },
    office: {
      name: 'Office', bounds: { w: 4.0, d: 4.5 },
      furniture: [
        { id: 'desk1', type: 'office_desk', pos: {x:0, z:-1.6}, size: {w:1.8, d:0.7, h:0.75} },
        { id: 'chair1', type: 'office_chair', pos: {x:0.1, z:-0.7}, size: {w:0.42, d:0.4, h:0.98} },
        { id: 'bookshelf1', type: 'bookshelf', pos: {x:-1.7, z:0.3}, size: {w:0.35, d:0.8, h:1.6} },
        { id: 'filing1', type: 'filing_cabinet', pos: {x:1.6, z:-0.3}, size: {w:0.4, d:0.45, h:0.9} },
      ]
    },
    laundry: {
      name: 'Laundry', bounds: { w: 4.0, d: 4.5 },
      furniture: [
        { id: 'table1', type: 'folding_table', pos: {x:0, z:-1.4}, size: {w:1.4, d:0.6, h:0.78} },
        { id: 'basket1', type: 'laundry_basket', pos: {x:1.2, z:0.5}, size: {w:0.4, d:0.35, h:0.5} },
        { id: 'rack1', type: 'drying_rack', pos: {x:-0.9, z:0.8}, size: {w:0.85, d:0.1, h:1.2} },
      ]
    },
    garage: {
      name: 'Garage', bounds: { w: 4.0, d: 5.0 },
      furniture: [
        { id: 'bench1', type: 'workbench', pos: {x:0, z:-1.5}, size: {w:2.0, d:0.7, h:0.85} },
        { id: 'shelf1', type: 'storage_shelf', pos: {x:-1.5, z:0.5}, size: {w:0.4, d:0.8, h:1.5} },
      ]
    },
  };

  // ================================================================
  // MODEL_REGISTRY — Maps furniture types to GLB paths + real-world sizes
  // Set glb to a URL to load a low-poly .glb model.
  // When glb is null, the engine uses existing procedural builders.
  // ================================================================
  var MODEL_REGISTRY = {
    bed:             { glb: null, target: {w:1.6, d:2.0, h:0.6} },
    nightstand:      { glb: null, target: {w:0.3, d:0.3, h:0.4} },
    study_desk:      { glb: null, target: {w:0.55, d:1.0, h:0.75} },
    desk_chair:      { glb: null, target: {w:0.4, d:0.4, h:0.5} },
    dresser:         { glb: null, target: {w:0.9, d:0.42, h:0.88} },
    wardrobe:        { glb: null, target: {w:0.4, d:0.8, h:2.2} },
    sink_counter:    { glb: null, target: {w:3.9, d:0.58, h:0.86} },
    cooking_counter: { glb: null, target: {w:3.9, d:0.58, h:0.86} },
    kitchen_island:  { glb: null, target: {w:1.25, d:0.65, h:0.86} },
    bar_stool:       { glb: null, target: {w:0.3, d:0.3, h:0.65} },
    bathtub:         { glb: null, target: {w:0.7, d:1.5, h:0.6} },
    toilet:          { glb: null, target: {w:0.4, d:0.5, h:0.6} },
    pedestal_sink:   { glb: null, target: {w:0.52, d:0.42, h:0.65} },
    bath_mirror:     { glb: null, target: {w:0.55, d:0.1, h:0.7} },
    towel_rack:      { glb: null, target: {w:0.06, d:0.35, h:0.9} },
    sofa:            { glb: null, target: {w:1.8, d:0.8, h:0.65} },
    coffee_table:    { glb: null, target: {w:1.0, d:0.6, h:0.42} },
    tv_stand:        { glb: null, target: {w:1.1, d:0.38, h:0.35} },
    lamp_table:      { glb: null, target: {w:0.4, d:0.4, h:0.45} },
    fiddle_leaf:     { glb: null, target: {w:0.3, d:0.3, h:0.8} },
    arc_lamp:        { glb: null, target: {w:0.3, d:0.3, h:1.65} },
    dining_table:    { glb: null, target: {w:1.8, d:1.2, h:0.78} },
    dining_chair:    { glb: null, target: {w:0.38, d:0.36, h:0.92} },
    china_cabinet:   { glb: null, target: {w:0.95, d:0.45, h:1.65} },
    office_desk:     { glb: null, target: {w:1.8, d:0.7, h:0.75} },
    office_chair:    { glb: null, target: {w:0.42, d:0.4, h:0.98} },
    bookshelf:       { glb: null, target: {w:0.35, d:0.8, h:1.6} },
    filing_cabinet:  { glb: null, target: {w:0.4, d:0.45, h:0.9} },
    folding_table:   { glb: null, target: {w:1.4, d:0.6, h:0.78} },
    laundry_basket:  { glb: null, target: {w:0.4, d:0.35, h:0.5} },
    drying_rack:     { glb: null, target: {w:0.85, d:0.1, h:1.2} },
    workbench:       { glb: null, target: {w:2.0, d:0.7, h:0.85} },
    storage_shelf:   { glb: null, target: {w:0.4, d:0.8, h:1.5} },
  };

  // Placement validation: checks if item can fit without leaving room
  // or overlapping already-placed items (Box3 collision test)
  function validatePlacement(itemPos, itemSize, roomW, roomD, occupiedBoxes) {
    var margin = 0.15;
    var halfW = roomW / 2 - margin;
    var halfD = roomD / 2 - margin;
    var iw = itemSize.w / 2;
    var id2 = itemSize.d / 2;
    if (itemPos.x - iw < -halfW || itemPos.x + iw > halfW) return false;
    if (itemPos.z - id2 < -halfD || itemPos.z + id2 > halfD) return false;
    var newBox = new THREE.Box3(
      new THREE.Vector3(itemPos.x - iw, 0, itemPos.z - id2),
      new THREE.Vector3(itemPos.x + iw, itemSize.h, itemPos.z + id2)
    );
    for (var oi = 0; oi < occupiedBoxes.length; oi++) {
      if (newBox.intersectsBox(occupiedBoxes[oi])) return false;
    }
    return true;
  }

  var modelCache = {};
  var GLTFLoaderInstance = null;
  try {
    GLTFLoaderInstance = new THREE.GLTFLoader();
    // Set up DRACO decoder for compressed models
    try {
      var dracoLoader = new THREE.DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      dracoLoader.setDecoderConfig({ type: 'js' });
      GLTFLoaderInstance.setDRACOLoader(dracoLoader);
    } catch(de) { /* DRACO optional */ }
  } catch(e) { /* GLTFLoader not available — using procedural fallback */ }

  // Target sizes for normalization (meters): ensures models are real-world scale
  var MODEL_TARGET_SIZES = {
    'bed': { w: 1.6, h: 0.6, d: 2.0 },
    'sofa': { w: 2.0, h: 0.8, d: 0.8 },
    'dining_table': { w: 1.8, h: 0.78, d: 1.2 },
    'chair': { w: 0.45, h: 0.9, d: 0.45 },
    'Television': { w: 0.9, h: 0.55, d: 0.1 },
    'Refrigerator': { w: 0.7, h: 1.7, d: 0.7 },
    'toilet': { w: 0.4, h: 0.45, d: 0.6 },
    'bathtub': { w: 0.7, h: 0.5, d: 1.5 },
    'desk': { w: 1.4, h: 0.75, d: 0.7 },
  };

  function loadGLTFModel(category, callback) {
    var url = MODEL_URLS[category];
    if (!url || !GLTFLoaderInstance) { callback(null); return; }
    if (modelCache[category]) { callback(modelCache[category].clone()); return; }
    GLTFLoaderInstance.load(url, function(gltf) {
      var model = gltf.scene;
      // Normalize model scale to target real-world dimensions
      var _box = new THREE.Box3().setFromObject(model);
      var _size = _box.getSize(new THREE.Vector3());
      var _center = _box.getCenter(new THREE.Vector3());
      var target = MODEL_TARGET_SIZES[category];
      if (target) {
        var sx = target.w / Math.max(_size.x, 0.01);
        var sy = target.h / Math.max(_size.y, 0.01);
        var sz = target.d / Math.max(_size.z, 0.01);
        var s = Math.min(sx, sy, sz);
        model.scale.multiplyScalar(s);
      }
      // Center on XZ, sit on floor (y=0)
      _box.setFromObject(model);
      _center = _box.getCenter(new THREE.Vector3());
      var _min = _box.min;
      model.position.set(-_center.x, -_min.y, -_center.z);
      model.traverse(function(child) {
        if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      modelCache[category] = model;
      callback(model.clone());
    }, undefined, function() { callback(null); });
  }

  // ================================================================
  // Scene Setup
  // ================================================================
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('${bg}');
  scene.fog = new THREE.FogExp2('${bg}', 0.008);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(14, 18, 14);
  camera.lookAt(0, 0.5, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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
  sun.shadow.mapSize.set(1024, 1024);
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
  // Ground — lush grass with subtle variation
  // ================================================================
  var gndGeo = new THREE.PlaneGeometry(60, 60, 40, 40);
  // vertex-colour noise for natural look
  var gndColors = [];
  var posArr = gndGeo.attributes.position.array;
  for (var gi = 0; gi < posArr.length / 3; gi++) {
    var r = 0.38 + Math.random() * 0.12;
    var g2 = 0.55 + Math.random() * 0.15;
    var b2 = 0.25 + Math.random() * 0.08;
    gndColors.push(r, g2, b2);
  }
  gndGeo.setAttribute('color', new THREE.Float32BufferAttribute(gndColors, 3));
  var grassMat = new THREE.MeshStandardMaterial({
    color: IS_DARK ? 0x1a2a1a : 0x5a8a4a,
    roughness: 0.95,
    vertexColors: true,
  });
  var gnd = new THREE.Mesh(gndGeo, grassMat);
  gnd.rotation.x = -Math.PI / 2;
  gnd.position.y = -0.02;
  gnd.receiveShadow = true;
  scene.add(gnd);

  // Concrete walkway / patio in front of house (HW=6, HD=4.75)
  var pathMat = new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x3a3a44 : 0xc8c0b0, roughness: 0.7 });
  box(2.0, 0.04, 5.0, pathMat, -3.75, 0.0, 7.25, null);
  scene.add(scene.children[scene.children.length - 1]);
  // Stepping stones along path
  for (var si = 0; si < 4; si++) {
    cyl(0.35, 0.35, 0.04, 8, pathMat, -3.75 + (Math.random()-0.5)*0.6, 0.01, 10.25 + si * 1.5, null);
    scene.add(scene.children[scene.children.length - 1]);
  }

  // ================================================================
  // Sky dome (hemisphere gradient)
  // ================================================================
  var skyGeo = new THREE.SphereGeometry(80, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  var skyColors = [];
  var skyPos = skyGeo.attributes.position.array;
  for (var ski = 0; ski < skyPos.length / 3; ski++) {
    var sy = skyPos[ski * 3 + 1];
    var t = Math.max(0, Math.min(1, sy / 80));
    if (IS_DARK) {
      skyColors.push(0.04 + t * 0.02, 0.04 + t * 0.06, 0.12 + t * 0.15);
    } else {
      skyColors.push(0.55 + t * 0.35, 0.72 + t * 0.2, 0.92 + t * 0.08);
    }
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  var skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  var skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);

  // ================================================================
  // Low-poly Trees & Bushes
  // ================================================================
  function makeTree(tx, tz, scale) {
    var tg = new THREE.Group();
    var s = scale || 1;
    var trunkH = 1.8 * s;
    cyl(0.12 * s, 0.08 * s, trunkH, 6, new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.8 }), 0, trunkH / 2, 0, tg);
    var crownMat = new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x1a5a2a : 0x2E7D32, roughness: 0.85 });
    var crownMat2 = new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x226a36 : 0x388E3C, roughness: 0.85 });
    var cone1 = new THREE.Mesh(new THREE.ConeGeometry(1.0 * s, 1.6 * s, 7), crownMat);
    cone1.position.set(0, trunkH + 0.3 * s, 0); cone1.castShadow = true; tg.add(cone1);
    var cone2 = new THREE.Mesh(new THREE.ConeGeometry(0.8 * s, 1.3 * s, 7), crownMat2);
    cone2.position.set(0, trunkH + 1.1 * s, 0); cone2.castShadow = true; tg.add(cone2);
    var cone3 = new THREE.Mesh(new THREE.ConeGeometry(0.55 * s, 0.9 * s, 7), crownMat);
    cone3.position.set(0, trunkH + 1.8 * s, 0); cone3.castShadow = true; tg.add(cone3);
    tg.position.set(tx, 0, tz);
    scene.add(tg);
  }

  function makeBush(bx, bz, s) {
    var s2 = s || 0.5;
    var bushMat = new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x1a5a2a : 0x3E8E4E, roughness: 0.9 });
    var b1 = new THREE.Mesh(new THREE.SphereGeometry(0.45 * s2, 8, 6), bushMat);
    b1.position.set(bx, 0.35 * s2, bz); b1.scale.y = 0.7; b1.castShadow = true; scene.add(b1);
    var b3 = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s2, 8, 6), bushMat);
    b3.position.set(bx + 0.3 * s2, 0.25 * s2, bz + 0.15 * s2); b3.scale.y = 0.7; scene.add(b3);
  }

  // Trees around the yard (hardcoded positions — house center at origin)
  makeTree(-10, -8, 1.2);
  makeTree(-12, 2, 1.0);
  makeTree(10, -7, 1.1);
  makeTree(12, 3, 0.9);
  makeTree(-8, 10, 1.3);
  makeTree(9, 10, 1.0);
  makeTree(14, -3, 0.8);
  makeTree(-14, -4, 1.0);
  // Smaller trees closer to house (HW=6, HD=4.75)
  makeTree(-8.5, -3.75, 0.7);
  makeTree(8.5, -3.75, 0.6);
  makeTree(8.5, 3.75, 0.7);

  // Bushes along the house perimeter
  makeBush(-7.2, -4.25, 0.6);
  makeBush(-7.2, -2.75, 0.5);
  makeBush(-7.2, -1.25, 0.6);
  makeBush(7.2, -4.25, 0.5);
  makeBush(7.2, -2.75, 0.6);
  makeBush(7.2, 3.25, 0.5);
  // Front garden bushes
  makeBush(-5.0, 5.75, 0.7);
  makeBush(-2.5, 5.95, 0.6);
  makeBush(4.5, 5.75, 0.5);

  // Flower beds (small colored spheres near bushes)
  var flowerColors = [0xFF6699, 0xFFCC33, 0xFF5533, 0xCC66FF, 0xFF9966];
  for (var fi2 = 0; fi2 < 12; fi2++) {
    var fc = flowerColors[fi2 % flowerColors.length];
    var fx = -5.0 + (fi2 % 6) * 1.8 + (Math.random() - 0.5) * 0.4;
    var fz = 5.5 + Math.random() * 0.8;
    var flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.08 + Math.random() * 0.05, 6, 4),
      new THREE.MeshStandardMaterial({ color: fc, roughness: 0.8 })
    );
    flower.position.set(fx, 0.12, fz);
    scene.add(flower);
  }

  // ================================================================
  // Garden fence (picket fence around the yard)
  // ================================================================
  var fenceMat = new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x505050 : 0xDDCCBB, roughness: 0.6 });
  var fenceR = 15;
  function fenceSegment(x1, z1, x2, z2) {
    var dx = x2 - x1, dz = z2 - z1;
    var len = Math.sqrt(dx * dx + dz * dz);
    var ang = Math.atan2(dx, dz);
    var rail = box(0.04, 0.04, len, fenceMat, (x1+x2)/2, 0.45, (z1+z2)/2, null);
    rail.rotation.y = ang; scene.add(rail);
    var rail2 = box(0.04, 0.04, len, fenceMat, (x1+x2)/2, 0.15, (z1+z2)/2, null);
    rail2.rotation.y = ang; scene.add(rail2);
    var pickets = Math.floor(len / 0.6);
    for (var pi = 0; pi <= pickets; pi++) {
      var t2 = pi / Math.max(pickets, 1);
      var px = x1 + dx * t2, pz = z1 + dz * t2;
      box(0.04, 0.55, 0.04, fenceMat, px, 0.28, pz, null);
      scene.add(scene.children[scene.children.length - 1]);
    }
  }
  fenceSegment(-fenceR, -fenceR, fenceR, -fenceR);
  fenceSegment(-fenceR, -fenceR, -fenceR, fenceR);
  fenceSegment(fenceR, -fenceR, fenceR, fenceR);
  fenceSegment(-fenceR, fenceR, -4, fenceR);
  fenceSegment(4, fenceR, fenceR, fenceR);

  // ================================================================
  // House Group
  // ================================================================
  const house = new THREE.Group();
  scene.add(house);

  const WALL_H = 3.0;
  const WALL_T = 0.15;

  // 5-room floor plan — matches provided 2D blueprint exactly:
  //  Bedroom (top-left): Bed (top-center), Study Table (left), Furniture/dresser (bottom)
  //  Kitchen (top-center): cooking (left), sink (right), open to hallway
  //  Bathroom (top-right): Bath-tub (top), Toilet (center), Sink (right)
  //  Living (bottom-left): TV Desk (top), main table (center), Sofa (bottom), lamp table (bottom-left)
  //  Dining (bottom-right): table (center), chairs around, cupboards (bottom)
  //  ┌───────────┬──────────────┬──────────┐
  //  │  Bedroom  │   Kitchen    │ Bathroom │  top row (depth 4.5)
  //  │ (4.5×4.5) │  (4.5×4.5)   │ (3×4.5)  │
  //  ├───────────┼──────────────┴──────────┤
  //  │  Living   │      Dining Room       │  bottom row (depth 5)
  //  │ (4.5×5)   │        (7.5×5)          │
  //  └───────────┴────────────────────────┘
  //  Total: 12 wide × 9.5 deep. All furniture and devices rendered inside room bounds.
  const BR_W = 4.5, BR_D = 4.5;  // bedroom (top-left)
  const KI_W = 4.5, KI_D = 4.5;  // kitchen (top-center)
  const BA_W = 3, BA_D = 4.5;    // bathroom (top-right)
  const LR_W = 4.5, LR_D = 5;   // living room (bottom-left)
  const DN_W = 7.5, DN_D = 5;   // dining room (bottom-right)
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

  function roomType(id, name) {
    const l = ((id || '') + ' ' + (name || '')).toLowerCase();
    if (l.includes('living')) return 'living';
    if (l.includes('kitchen')) return 'kitchen';
    if (l.includes('bed'))    return 'bedroom';
    if (l.includes('bath'))   return 'bathroom';
    if (l.includes('dining')) return 'dining';
    if (l.includes('office') || l.includes('study')) return 'office';
    if (l.includes('laundry')) return 'laundry';
    if (l.includes('garage')) return 'garage';
    return 'generic';
  }

  // ================================================================
  // Furniture builders — coordinates stay within each room's bounds
  // Bedroom (4.5×4.5 → ±2.05x, ±2.05z), Kitchen (4.5×4.5 → ±2.05x, ±2.05z)
  // Bathroom (3×4.5 → ±1.3x, ±2.05z), Living (4.5×5 → ±2.05x, ±2.3z)
  // Dining (7.5×5 → ±3.55x, ±2.3z)
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

    // === BEDROOM DECORATIONS ===
    // Nightstand with alarm clock
    box(0.3, 0.4, 0.3, M.wood, 0.6, 0.2, -1.5, g);
    box(0.12, 0.15, 0.08, new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3 }), 0.6, 0.48, -1.5, g);
    // Bedside rug (soft purple)
    box(0.8, 0.015, 0.5, new THREE.MeshStandardMaterial({ color: 0x6A0572, roughness: 0.95 }), -0.4, 0.02, 0.3, g);
    // Ceiling fan (unique to bedroom)
    cyl(0.04, 0.04, 0.15, 8, M.metal, 0, 2.88, -0.3, g);
    for (var fa = 0; fa < 4; fa++) {
      var fAngle = fa * Math.PI / 2;
      box(0.6, 0.015, 0.12, new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.6 }), Math.cos(fAngle) * 0.4, 2.82, -0.3 + Math.sin(fAngle) * 0.4, g);
    }
    // Wardrobe (right wall)
    box(0.4, 2.2, 0.8, new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.6 }), 1.6, 1.1, 0.1, g);
    box(0.02, 2.0, 0.01, M.metal, 1.38, 1.1, 0.1, g);
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

    // === KITCHEN DECORATIONS ===
    // Kitchen island (center of room)
    box(1.2, 0.8, 0.6, new THREE.MeshStandardMaterial({ color: 0xFAF0E6, roughness: 0.6 }), 0.5, 0.4, 0.8, g);
    box(1.25, 0.06, 0.65, new THREE.MeshStandardMaterial({ color: 0x2F4F4F, roughness: 0.3, metalness: 0.1 }), 0.5, 0.83, 0.8, g);
    // Bar stools around island
    for (var bs = 0; bs < 2; bs++) {
      cyl(0.12, 0.14, 0.04, 12, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }), 0.2 + bs * 0.6, 0.65, 1.35, g);
      cyl(0.03, 0.03, 0.6, 8, M.metal, 0.2 + bs * 0.6, 0.32, 1.35, g);
      // Footrest ring
      cyl(0.1, 0.1, 0.02, 12, M.metal, 0.2 + bs * 0.6, 0.2, 1.35, g);
    }
    // Hanging pot rack with copper pots
    box(0.8, 0.02, 0.3, M.metal, -0.5, 2.5, -0.72, g);
    cyl(0.06, 0.04, 0.12, 8, new THREE.MeshStandardMaterial({ color: 0xB87333, metalness: 0.6, roughness: 0.3 }), -0.7, 2.35, -0.72, g);
    cyl(0.05, 0.035, 0.1, 8, new THREE.MeshStandardMaterial({ color: 0xB87333, metalness: 0.6, roughness: 0.3 }), -0.3, 2.38, -0.72, g);
    // Kitchen window plant (herb garden)
    box(0.5, 0.08, 0.12, new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 }), 1.5, 1.4, -1.78, g);
    cyl(0.04, 0.03, 0.1, 6, M.plant, 1.35, 1.5, -1.78, g);
    cyl(0.04, 0.03, 0.12, 6, M.plant, 1.5, 1.52, -1.78, g);
    cyl(0.035, 0.025, 0.09, 6, M.plant, 1.65, 1.49, -1.78, g);
    // Tile backsplash (subtle)
    box(3.9, 0.5, 0.02, new THREE.MeshStandardMaterial({ color: 0xE0D9C8, roughness: 0.3 }), 0, 1.12, -1.96, g);
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

    // === BATHROOM DECORATIONS ===
    // Bath mat (soft blue)
    box(0.5, 0.015, 0.35, new THREE.MeshStandardMaterial({ color: 0x4FC3F7, roughness: 0.95 }), -0.5, 0.02, -0.3, g);
    // Toilet paper holder
    cyl(0.015, 0.015, 0.12, 8, M.metal, -0.85, 0.6, 0.2, g);
    cyl(0.035, 0.035, 0.08, 8, new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.9 }), -0.85, 0.6, 0.28, g);
    // Small shelf with toiletries
    box(0.35, 0.03, 0.1, M.metal, 0.6, 1.75, 1.7, g);
    cyl(0.02, 0.02, 0.08, 8, new THREE.MeshStandardMaterial({ color: 0x66BB6A, roughness: 0.4 }), 0.5, 1.82, 1.7, g);
    cyl(0.018, 0.018, 0.1, 8, new THREE.MeshStandardMaterial({ color: 0x42A5F5, roughness: 0.3 }), 0.7, 1.84, 1.7, g);
    // Shower curtain rod + curtain (decorative)
    cyl(0.015, 0.015, 1.2, 8, M.metal, 0.5, 2.2, -0.5, g);
    box(0.02, 1.2, 0.8, new THREE.MeshStandardMaterial({ color: 0xE8E8E8, transparent: true, opacity: 0.6, roughness: 0.9 }), 0.5, 1.55, -0.5, g);
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

    // === LIVING ROOM DECORATIONS ===
    // Large area rug (warm terracotta pattern)
    box(2.2, 0.015, 1.8, new THREE.MeshStandardMaterial({ color: 0xCC6633, roughness: 0.92 }), 0, 0.02, 0.5, g);
    box(2.0, 0.016, 1.6, new THREE.MeshStandardMaterial({ color: 0xBB7744, roughness: 0.9 }), 0, 0.022, 0.5, g);
    // Floor lamp (tall arc lamp, modern)
    cyl(0.15, 0.15, 0.02, 16, M.metal, 1.5, 0.01, -1.5, g);
    cyl(0.02, 0.02, 1.6, 8, M.metal, 1.5, 0.82, -1.5, g);
    // Arc arm
    box(0.015, 0.015, 0.5, M.metal, 1.5, 1.62, -1.25, g);
    cyl(0.12, 0.08, 0.12, 12, new THREE.MeshStandardMaterial({ color: 0xFFF8DC, roughness: 0.8, transparent: true, opacity: 0.85 }), 1.5, 1.56, -1.0, g);
    // Remote control on coffee table
    box(0.06, 0.015, 0.15, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }), 0.15, 0.44, 0.35, g);
    // Magazines on coffee table
    box(0.18, 0.02, 0.24, new THREE.MeshStandardMaterial({ color: 0xE91E63, roughness: 0.8 }), -0.2, 0.44, 0.5, g);
    box(0.18, 0.02, 0.24, new THREE.MeshStandardMaterial({ color: 0x3F51B5, roughness: 0.8 }), -0.18, 0.46, 0.48, g);
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

    // === DINING ROOM DECORATIONS ===
    // Chandelier (candelabra style over table)
    cyl(0.02, 0.02, 0.3, 8, M.metal, 0, 2.7, 0, g);
    // Candle arms
    for (var ca = 0; ca < 6; ca++) {
      var cAngle = ca * Math.PI / 3;
      var cax = Math.cos(cAngle) * 0.25;
      var caz = Math.sin(cAngle) * 0.25;
      box(0.015, 0.015, 0.01, M.metal, cax, 2.55, caz, g);
      // Candle
      cyl(0.015, 0.015, 0.06, 6, new THREE.MeshStandardMaterial({ color: 0xFFF8DC, roughness: 0.8 }), cax, 2.52, caz, g);
      // Flame glow
      var flame = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshStandardMaterial({ color: 0xFFAA00, emissive: 0xFF8800, emissiveIntensity: 1.0 }));
      flame.position.set(cax, 2.56, caz); g.add(flame);
    }
    // Ring
    var chandRing = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.01, 6, 20), M.metal);
    chandRing.position.set(0, 2.55, 0); chandRing.rotation.x = Math.PI / 2; g.add(chandRing);
    // Table centerpiece (vase with flowers)
    cyl(0.05, 0.07, 0.15, 10, new THREE.MeshStandardMaterial({ color: 0x1565C0, roughness: 0.3 }), 0, 0.87, 0, g);
    // Flower stems
    cyl(0.005, 0.005, 0.15, 4, M.plant, -0.02, 1.0, 0, g);
    cyl(0.005, 0.005, 0.18, 4, M.plant, 0.02, 1.02, 0.02, g);
    var flw1 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshStandardMaterial({ color: 0xFF1744, roughness: 0.7 }));
    flw1.position.set(-0.02, 1.1, 0); g.add(flw1);
    var flw2 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshStandardMaterial({ color: 0xFFEB3B, roughness: 0.7 }));
    flw2.position.set(0.02, 1.13, 0.02); g.add(flw2);
    // Sideboard with wine rack (alternative to cabinet)
    box(1.0, 0.7, 0.35, M.darkWood, 0, 0.35, 1.95, g);
    // Wine bottles in rack
    for (var wi = 0; wi < 3; wi++) {
      cyl(0.025, 0.025, 0.18, 6, new THREE.MeshStandardMaterial({ color: 0x1B5E20, roughness: 0.3 }), -0.2 + wi * 0.2, 0.58, 1.88, g);
    }
  }

  function buildOffice(g) {
    // === L-shaped desk (against back wall) ===
    // Main desk surface
    box(1.8, 0.06, 0.7, M.darkWood, 0, 0.72, -1.6, g);
    // Desk legs
    box(0.06, 0.7, 0.06, M.metal, -0.85, 0.36, -1.9, g);
    box(0.06, 0.7, 0.06, M.metal, 0.85, 0.36, -1.9, g);
    box(0.06, 0.7, 0.06, M.metal, -0.85, 0.36, -1.3, g);
    box(0.06, 0.7, 0.06, M.metal, 0.85, 0.36, -1.3, g);
    // L extension (right side)
    box(0.7, 0.06, 0.5, M.darkWood, 1.15, 0.72, -1.1, g);
    box(0.06, 0.7, 0.06, M.metal, 1.45, 0.36, -0.88, g);
    // Under-desk drawer unit
    box(0.4, 0.45, 0.5, M.wood, -0.5, 0.25, -1.6, g);
    // Drawer fronts
    box(0.38, 0.12, 0.02, new THREE.MeshStandardMaterial({ color: 0x6B5B40, roughness: 0.5 }), -0.5, 0.38, -1.34, g);
    box(0.38, 0.12, 0.02, new THREE.MeshStandardMaterial({ color: 0x6B5B40, roughness: 0.5 }), -0.5, 0.22, -1.34, g);
    // Drawer handles
    box(0.08, 0.02, 0.02, M.metal, -0.5, 0.38, -1.33, g);
    box(0.08, 0.02, 0.02, M.metal, -0.5, 0.22, -1.33, g);

    // === Monitor stand + keyboard area on desk ===
    box(0.3, 0.04, 0.2, M.metal, 0.1, 0.78, -1.65, g);   // monitor riser
    box(0.45, 0.02, 0.15, new THREE.MeshStandardMaterial({ color: 0x333333 }), 0.1, 0.76, -1.35, g); // keyboard
    box(0.1, 0.02, 0.08, new THREE.MeshStandardMaterial({ color: 0x333333 }), 0.6, 0.76, -1.4, g);  // mouse

    // === Ergonomic office chair ===
    // Chair base (5-star)
    cyl(0.03, 0.03, 0.38, 8, M.metal, 0.1, 0.21, -0.7, g);  // stem
    for (var ci = 0; ci < 5; ci++) {
      var angle = ci * Math.PI * 2 / 5;
      var cx = 0.1 + Math.cos(angle) * 0.25;
      var cz = -0.7 + Math.sin(angle) * 0.25;
      box(0.25, 0.03, 0.04, M.metal, cx, 0.04, cz, g);
      cyl(0.025, 0.025, 0.04, 6, new THREE.MeshStandardMaterial({ color: 0x222222 }), cx + Math.cos(angle) * 0.12, 0.02, cz + Math.sin(angle) * 0.12, g);
    }
    // Seat
    box(0.42, 0.06, 0.4, M.leather, 0.1, 0.43, -0.7, g);
    // Backrest (curved)
    box(0.42, 0.5, 0.04, M.leather, 0.1, 0.72, -0.48, g);
    // Armrests
    box(0.04, 0.04, 0.22, M.metal, -0.18, 0.52, -0.65, g);
    box(0.04, 0.04, 0.22, M.metal, 0.38, 0.52, -0.65, g);
    box(0.1, 0.025, 0.2, new THREE.MeshStandardMaterial({ color: 0x444444 }), -0.18, 0.56, -0.65, g);
    box(0.1, 0.025, 0.2, new THREE.MeshStandardMaterial({ color: 0x444444 }), 0.38, 0.56, -0.65, g);

    // === Bookshelf (left wall) ===
    box(0.35, 1.6, 0.8, M.wood, -1.7, 0.8, 0.3, g);       // frame
    // Shelves
    box(0.3, 0.025, 0.7, M.wood, -1.7, 0.35, 0.3, g);
    box(0.3, 0.025, 0.7, M.wood, -1.7, 0.7, 0.3, g);
    box(0.3, 0.025, 0.7, M.wood, -1.7, 1.05, 0.3, g);
    box(0.3, 0.025, 0.7, M.wood, -1.7, 1.4, 0.3, g);
    // Books (colorful spines on shelves)
    var bookColors = [0xCC3333, 0x3366CC, 0x339933, 0xCC9933, 0x9933CC, 0x336666, 0xCC6633];
    for (var si = 0; si < 4; si++) {
      var sy = [0.18, 0.53, 0.88, 1.23][si];
      for (var bi = 0; bi < 5; bi++) {
        var bh = 0.12 + Math.random() * 0.06;
        box(0.04, bh, 0.15 + Math.random() * 0.05, new THREE.MeshStandardMaterial({ color: bookColors[(si * 5 + bi) % bookColors.length], roughness: 0.8 }),
          -1.7, sy + bh / 2, 0.0 + bi * 0.14, g);
      }
    }

    // === Filing cabinet (right of desk) ===
    box(0.4, 0.9, 0.45, M.metal, 1.6, 0.45, -0.3, g);
    // Drawer fronts
    for (var fi = 0; fi < 3; fi++) {
      box(0.38, 0.22, 0.02, new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.4, roughness: 0.3 }),
        1.6, 0.2 + fi * 0.28, -0.07, g);
      box(0.12, 0.02, 0.03, M.metal, 1.6, 0.2 + fi * 0.28, -0.05, g);    // handles
    }

    // === Area rug ===
    box(2.0, 0.02, 1.5, M.rug, 0, 0.01, -0.5, g);

    // === Small plant on desk ===
    cyl(0.06, 0.05, 0.08, 8, M.pot, 0.7, 0.79, -1.7, g);
    // Leafy top
    var plantMat = new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.7 });
    cyl(0.08, 0.04, 0.1, 6, plantMat, 0.7, 0.88, -1.7, g);

    // === Wall clock (back wall) ===
    cyl(0.18, 0.18, 0.03, 20, M.white, -1.0, 2.0, -1.95, g);
    cyl(0.16, 0.16, 0.01, 20, new THREE.MeshStandardMaterial({ color: 0xFFFFF0, roughness: 0.2 }), -1.0, 2.0, -1.93, g);
    // Clock hands
    box(0.01, 0.1, 0.01, new THREE.MeshStandardMaterial({ color: 0x111111 }), -1.0, 2.05, -1.92, g);
    box(0.01, 0.06, 0.01, new THREE.MeshStandardMaterial({ color: 0x111111 }), -0.97, 2.0, -1.92, g);
  }

  function buildLaundryRoom(g) {
    // Folding table
    box(1.4, 0.06, 0.6, M.wood, 0, 0.78, -1.4, g);
    box(0.05, 0.76, 0.05, M.metal, -0.65, 0.39, -1.65, g);
    box(0.05, 0.76, 0.05, M.metal, 0.65, 0.39, -1.65, g);
    box(0.05, 0.76, 0.05, M.metal, -0.65, 0.39, -1.15, g);
    box(0.05, 0.76, 0.05, M.metal, 0.65, 0.39, -1.15, g);
    // Laundry basket
    box(0.4, 0.5, 0.35, new THREE.MeshStandardMaterial({ color: 0x8D6E63, roughness: 0.9 }), 1.2, 0.25, 0.5, g);
    // Drying rack
    box(0.05, 1.2, 0.05, M.metal, -1.3, 0.6, 0.8, g);
    box(0.05, 1.2, 0.05, M.metal, -0.5, 0.6, 0.8, g);
    box(0.85, 0.03, 0.03, M.metal, -0.9, 1.2, 0.8, g);
    box(0.85, 0.03, 0.03, M.metal, -0.9, 0.9, 0.8, g);
    box(0.85, 0.03, 0.03, M.metal, -0.9, 0.6, 0.8, g);
    // Detergent bottles on shelf
    box(1.0, 0.04, 0.3, M.wood, 0, 1.4, -1.85, g);
    cyl(0.05, 0.05, 0.18, 8, new THREE.MeshStandardMaterial({ color: 0x2196F3 }), -0.2, 1.53, -1.85, g);
    cyl(0.05, 0.05, 0.18, 8, new THREE.MeshStandardMaterial({ color: 0xFF9800 }), 0.15, 1.53, -1.85, g);
  }

  function buildGarage(g) {
    // Workbench
    box(2.0, 0.08, 0.7, M.darkWood, 0, 0.85, -1.5, g);
    box(0.08, 0.84, 0.08, M.metal, -0.9, 0.42, -1.8, g);
    box(0.08, 0.84, 0.08, M.metal, 0.9, 0.42, -1.8, g);
    box(0.08, 0.84, 0.08, M.metal, -0.9, 0.42, -1.2, g);
    box(0.08, 0.84, 0.08, M.metal, 0.9, 0.42, -1.2, g);
    // Tool pegboard
    box(2.0, 1.0, 0.05, new THREE.MeshStandardMaterial({ color: 0x8D6E63, roughness: 0.8 }), 0, 1.8, -1.9, g);
    // Tool outlines
    for (var ti = 0; ti < 5; ti++) {
      box(0.12, 0.3, 0.02, M.metal, -0.7 + ti * 0.35, 1.75, -1.86, g);
    }
    // Storage shelves
    box(0.4, 1.5, 0.8, M.metal, -1.5, 0.75, 0.5, g);
    box(0.38, 0.02, 0.75, M.metal, -1.5, 0.4, 0.5, g);
    box(0.38, 0.02, 0.75, M.metal, -1.5, 0.8, 0.5, g);
    box(0.38, 0.02, 0.75, M.metal, -1.5, 1.2, 0.5, g);
    // Storage boxes on shelves
    box(0.25, 0.2, 0.3, new THREE.MeshStandardMaterial({ color: 0x4CAF50 }), -1.5, 0.52, 0.3, g);
    box(0.25, 0.2, 0.3, new THREE.MeshStandardMaterial({ color: 0x2196F3 }), -1.5, 0.92, 0.5, g);
  }

  function buildGenericRoom(g) {
    // Simple furnished room for unknown types
    // Center table
    box(1.2, 0.06, 0.8, M.wood, 0, 0.55, 0, g);
    box(0.05, 0.53, 0.05, M.metal, -0.5, 0.27, -0.3, g);
    box(0.05, 0.53, 0.05, M.metal, 0.5, 0.27, -0.3, g);
    box(0.05, 0.53, 0.05, M.metal, -0.5, 0.27, 0.3, g);
    box(0.05, 0.53, 0.05, M.metal, 0.5, 0.27, 0.3, g);
    // Two chairs
    for (var cx of [-0.6, 0.6]) {
      box(0.35, 0.04, 0.35, M.leather, cx, 0.45, -1.0, g);
      box(0.35, 0.35, 0.04, M.leather, cx, 0.65, -1.17, g);
      box(0.04, 0.43, 0.04, M.metal, cx - 0.15, 0.22, -1.15, g);
      box(0.04, 0.43, 0.04, M.metal, cx + 0.15, 0.22, -1.15, g);
      box(0.04, 0.43, 0.04, M.metal, cx - 0.15, 0.22, -0.85, g);
      box(0.04, 0.43, 0.04, M.metal, cx + 0.15, 0.22, -0.85, g);
    }
    // Side shelf
    box(0.5, 0.8, 0.3, M.wood, -1.4, 0.4, 1.2, g);
    box(0.45, 0.02, 0.25, M.wood, -1.4, 0.55, 1.2, g);
    // Rug
    box(1.6, 0.015, 1.2, M.rug, 0, 0.01, 0, g);
  }

  var furnitureBuilders = {
    living: buildLivingRoom,
    kitchen: buildKitchen,
    bedroom: buildBedroom,
    bathroom: buildBathroom,
    dining: buildDiningRoom,
    office: buildOffice,
    laundry: buildLaundryRoom,
    garage: buildGarage,
  };

  // ================================================================
  // 3D Appliance Model Builders — recognizable shapes per category
  // ================================================================
  function buildDevice3D(cat, g, dc, glowMat, bodyMat) {
    // === COMPACT DEVICE INDICATOR ONLY ===
    // Full-size 3D appliance models are DISABLED to prevent overlap
    // with room furniture. Devices render as small floor markers
    // with glow ring + label sprite + emoji badge.
    var indicator = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 0.06, 12),
      glowMat
    );
    indicator.position.y = 0.03;
    indicator.castShadow = true;
    g.add(indicator);
    return;
    // --- Below is disabled: full-size device models ---
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

    // ---- Vacuum Cleaner ----
    if (c.includes('vacuum')) {
      // Main body
      cyl(0.12, 0.12, 0.4, 12, bodyMat, 0, 0.4, 0, g);
      // Handle
      cyl(0.02, 0.02, 0.5, 6, M.metal, 0, 0.7, 0, g);
      // Handle grip
      box(0.08, 0.06, 0.04, new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 }), 0, 0.96, 0, g);
      // Nozzle head
      box(0.3, 0.06, 0.15, new THREE.MeshStandardMaterial({ color: 0x444444 }), 0, 0.18, 0.15, g);
      // Dust canister (transparent)
      cyl(0.09, 0.09, 0.15, 10, new THREE.MeshStandardMaterial({ color: 0xCCCCCC, transparent: true, opacity: 0.4 }), 0, 0.38, 0, g);
      // Wheels
      cyl(0.04, 0.04, 0.03, 8, new THREE.MeshStandardMaterial({ color: 0x333333 }), -0.1, 0.2, -0.05, g);
      cyl(0.04, 0.04, 0.03, 8, new THREE.MeshStandardMaterial({ color: 0x333333 }), 0.1, 0.2, -0.05, g);
      // Power button
      cyl(0.025, 0.025, 0.01, 8, new THREE.MeshStandardMaterial({ color: 0xFF0000, emissive: 0xFF0000, emissiveIntensity: 0.4 }), 0, 0.55, 0.12, g);
      return;
    }

    // ---- Printer ----
    if (c.includes('printer')) {
      // Main body
      box(0.6, 0.2, 0.4, bodyMat, 0, 0.3, 0, g);
      // Paper tray top
      box(0.45, 0.01, 0.25, M.white, 0, 0.41, -0.05, g);
      // Paper output tray
      box(0.45, 0.01, 0.18, M.white, 0, 0.2, 0.2, g);
      // Paper in tray
      box(0.4, 0.005, 0.15, new THREE.MeshStandardMaterial({ color: 0xFFFFF0 }), 0, 0.21, 0.2, g);
      // Control panel
      box(0.15, 0.06, 0.01, new THREE.MeshStandardMaterial({ color: 0x333333 }), 0.18, 0.38, 0.2, g);
      // LED
      box(0.04, 0.03, 0.01, new THREE.MeshStandardMaterial({ color: 0x00FF44, emissive: 0x00FF44, emissiveIntensity: 0.6 }), 0.22, 0.38, 0.21, g);
      // Status LED
      cyl(0.015, 0.015, 0.01, 6, new THREE.MeshStandardMaterial({ color: 0x00FF00, emissive: 0x00FF00, emissiveIntensity: 0.8 }), 0.12, 0.38, 0.21, g);
      return;
    }

    // ---- Speaker / Smart Speaker ----
    if (c.includes('speaker')) {
      // Body (cylinder)
      cyl(0.1, 0.1, 0.35, 16, bodyMat, 0, 0.38, 0, g);
      // Top dome
      var dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3 })
      );
      dome.position.set(0, 0.56, 0);
      g.add(dome);
      // Speaker grille texture (rings)
      cyl(0.105, 0.105, 0.02, 16, new THREE.MeshStandardMaterial({ color: 0x555555, wireframe: true }), 0, 0.35, 0, g);
      cyl(0.105, 0.105, 0.02, 16, new THREE.MeshStandardMaterial({ color: 0x555555, wireframe: true }), 0, 0.45, 0, g);
      // LED ring
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.012, 6, 20),
        new THREE.MeshStandardMaterial({ color: 0x00CCFF, emissive: 0x00AAFF, emissiveIntensity: 0.6 })
      );
      ring.position.set(0, 0.56, 0);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      // Base
      cyl(0.12, 0.12, 0.02, 16, new THREE.MeshStandardMaterial({ color: 0x333333 }), 0, 0.2, 0, g);
      return;
    }

    // ---- Tablet ----
    if (c.includes('tablet') || c.includes('ipad')) {
      // Body
      box(0.35, 0.5, 0.015, new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.3 }), 0, 0.47, 0, g);
      // Screen
      box(0.31, 0.44, 0.005, new THREE.MeshStandardMaterial({ color: 0x111122, emissive: 0x1a237e, emissiveIntensity: 0.3 }), 0, 0.48, 0.01, g);
      // Home button
      cyl(0.02, 0.02, 0.005, 12, new THREE.MeshStandardMaterial({ color: 0x444444 }), 0, 0.22, 0.01, g);
      // Camera
      cyl(0.01, 0.01, 0.005, 8, new THREE.MeshStandardMaterial({ color: 0x222222 }), 0, 0.72, 0.01, g);
      // Screen content glow
      box(0.2, 0.06, 0.001, new THREE.MeshStandardMaterial({ color: 0x4488FF, emissive: 0x2266DD, emissiveIntensity: 0.4 }), 0, 0.55, 0.016, g);
      return;
    }

    // ---- Iron ----
    if (c.includes('iron')) {
      // Soleplate
      box(0.35, 0.03, 0.18, new THREE.MeshStandardMaterial({ color: 0xBBBBBB, metalness: 0.7 }), 0, 0.22, 0, g);
      // Body
      box(0.3, 0.12, 0.16, bodyMat, 0, 0.3, -0.01, g);
      // Handle
      box(0.2, 0.04, 0.06, new THREE.MeshStandardMaterial({ color: 0x444444 }), 0, 0.4, 0, g);
      // Water tank (transparent)
      box(0.1, 0.08, 0.08, new THREE.MeshStandardMaterial({ color: 0x44CCFF, transparent: true, opacity: 0.3 }), 0, 0.3, -0.06, g);
      // Temperature dial
      cyl(0.03, 0.03, 0.015, 10, new THREE.MeshStandardMaterial({ color: 0x666666 }), 0.1, 0.37, 0.08, g);
      // Steam vents
      for (var ivi = -2; ivi <= 2; ivi++) {
        cyl(0.008, 0.008, 0.005, 6, M.metal, ivi * 0.06, 0.205, 0, g);
      }
      return;
    }

    // ---- Electric Kettle ----
    if (c.includes('kettle')) {
      // Base
      cyl(0.15, 0.15, 0.03, 16, new THREE.MeshStandardMaterial({ color: 0x333333 }), 0, 0.22, 0, g);
      // Body
      cyl(0.12, 0.1, 0.4, 16, bodyMat, 0, 0.43, 0, g);
      // Water inside (transparent)
      cyl(0.1, 0.08, 0.25, 12, new THREE.MeshStandardMaterial({ color: 0x44CCFF, transparent: true, opacity: 0.2 }), 0, 0.38, 0, g);
      // Lid
      cyl(0.1, 0.08, 0.04, 12, new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 }), 0, 0.64, 0, g);
      // Lid handle
      box(0.06, 0.03, 0.03, M.metal, 0, 0.68, 0, g);
      // Handle
      box(0.04, 0.25, 0.04, bodyMat, 0.16, 0.43, 0, g);
      // Spout
      box(0.04, 0.06, 0.08, bodyMat, -0.14, 0.55, 0, g);
      // Heating indicator LED
      cyl(0.015, 0.015, 0.01, 6, new THREE.MeshStandardMaterial({ color: 0x00FF44, emissive: 0x00FF44, emissiveIntensity: 0.6 }), 0.08, 0.24, 0.14, g);
      return;
    }

    // ---- Dehumidifier / Air Purifier ----
    if (c.includes('dehumidifier') || c.includes('air purifier') || c.includes('purifier')) {
      box(0.3, 0.55, 0.2, M.white, 0, 0.48, 0, g);
      // Vent grille
      for (var dhi = 0; dhi < 6; dhi++) {
        box(0.25, 0.005, 0.015, M.metal, 0, 0.35 + dhi * 0.04, 0.1, g);
      }
      // Control panel
      box(0.2, 0.06, 0.01, new THREE.MeshStandardMaterial({ color: 0x333333 }), 0, 0.72, 0.1, g);
      // LED display
      box(0.1, 0.03, 0.01, new THREE.MeshStandardMaterial({ color: 0x00CCFF, emissive: 0x00AAFF, emissiveIntensity: 0.5 }), 0, 0.73, 0.11, g);
      // Water tank
      box(0.25, 0.15, 0.05, new THREE.MeshStandardMaterial({ color: 0x44CCFF, transparent: true, opacity: 0.3 }), 0, 0.28, -0.08, g);
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
  // Clamp device position to room bounds (avoid undefined roomW/roomD)
  // ================================================================
  function clampSpot(x, z, roomW, roomD) {
    var w = (roomW != null && roomW > 0) ? roomW : 4;
    var d = (roomD != null && roomD > 0) ? roomD : 4;
    var margin = 0.35;
    var hw = w / 2 - margin;
    var hd = d / 2 - margin;
    return {
      x: Math.max(-hw, Math.min(hw, Number(x) || 0)),
      z: Math.max(-hd, Math.min(hd, Number(z) || 0)),
    };
  }

  // ================================================================
  // Smart placement: returns {x, z, key} based on room type + device
  // Devices go to logical positions (TV on TV stand, fridge in corner, etc.)
  // ================================================================
  function getSmartSpot(rType, cat, idx, used, roomW, roomD) {
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
        var s = spots[key];
        var clamped = clampSpot(s.x, s.z, roomW, roomD);
        return { x: clamped.x, z: clamped.z, key: s.key };
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
      if (!used[fallbackSpots[fi].key]) {
        var fb = fallbackSpots[fi];
        var fbc = clampSpot(fb.x, fb.z, roomW, roomD);
        return { x: fbc.x, z: fbc.z, key: fb.key };
      }
    }
    // Last resort: offset based on index
    var lr = { x: (idx % 3 - 1) * 1.0, z: Math.floor(idx / 3) * 1.0 - 0.5 };
    var lrc = clampSpot(lr.x, lr.z, roomW, roomD);
    return { x: lrc.x, z: lrc.z, key: 'last' + idx };
  }

  // ================================================================
  // Deterministic room-type → GRID slot mapping
  // Maps each room to the correct physical position based on type,
  // matching the 2D floorplan exactly.
  // ================================================================
  var ROOM_SLOT = {
    bedroom: 0,   // top-left
    kitchen: 1,   // top-center
    bathroom: 2,  // top-right
    living: 3,    // bottom-left
    dining: 4,    // bottom-right
  };

  // Extension wing positions for extra rooms (office, laundry, garage, etc.)
  var EXT_IDX = 0;
  var EXTENSIONS = [
    { x: HW + 2.5, z: -HD + 2.25, w: 4, d: 4.5 },   // right wing top
    { x: HW + 2.5, z: HD - 2.5, w: 4, d: 5 },        // right wing bottom
    { x: -HW - 2.5, z: -HD + 2.25, w: 4, d: 4.5 },   // left wing top
    { x: -HW - 2.5, z: HD - 2.5, w: 4, d: 5 },       // left wing bottom
  ];

  // ================================================================
  // Build Rooms
  // ================================================================
  var roomGroups = [];
  var clickableFloors = [];
  var selectedFloor = null;
  var usedSlots = {};

  ROOMS.forEach(function(room, i) {
    var type = roomType(room.roomId, room.name);
    var slotIdx = ROOM_SLOT[type];
    var pos;

    // Use deterministic slot if available and not already taken
    if (slotIdx !== undefined && !usedSlots[slotIdx]) {
      pos = GRID[slotIdx];
      usedSlots[slotIdx] = true;
    } else {
      // Place in first available GRID slot to keep room INSIDE the house
      var placed = false;
      for (var si = 0; si < GRID.length; si++) {
        if (!usedSlots[si]) {
          pos = GRID[si];
          usedSlots[si] = true;
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Only use extensions if ALL 5 grid slots are taken
        pos = EXTENSIONS[EXT_IDX % EXTENSIONS.length];
        EXT_IDX++;
      }
    }

    var rg = new THREE.Group();
    rg.position.set(pos.x, 0, pos.z);
    rg.userData = { roomId: room.roomId, name: room.name, index: i };

    // Room floor — unique material per room type (wood, tile, carpet, etc.)
    var roomFloorColors = {
      bedroom: { color: IS_DARK ? 0x3a3040 : 0xC4A882, roughness: 0.7 },   // warm carpet
      kitchen: { color: IS_DARK ? 0x333844 : 0xB8B0A0, roughness: 0.3 },   // tile
      bathroom: { color: IS_DARK ? 0x2a3040 : 0xC8D8E8, roughness: 0.2 },  // ceramic tile
      living: { color: IS_DARK ? 0x3a3028 : 0xBFA76A, roughness: 0.6 },    // hardwood
      dining: { color: IS_DARK ? 0x362818 : 0xA08050, roughness: 0.55 },   // dark wood
      office: { color: IS_DARK ? 0x2a2a3a : 0x888888, roughness: 0.4 },    // industrial
      laundry: { color: IS_DARK ? 0x303038 : 0xC0C0C0, roughness: 0.3 },   // linoleum
      garage: { color: IS_DARK ? 0x282828 : 0x999999, roughness: 0.5 },    // concrete
    };
    var floorStyle = roomFloorColors[type] || { color: IS_DARK ? 0x2a2a3e : 0xddd8cc, roughness: 0.8 };
    var floorMat = new THREE.MeshStandardMaterial({
      color: floorStyle.color, roughness: floorStyle.roughness,
    });
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(pos.w - 0.2, pos.d - 0.2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.03;
    floor.receiveShadow = true;
    floor.userData = { type: 'floor', roomId: room.roomId, name: room.name };
    rg.add(floor);
    clickableFloors.push(floor);

    // ---- Baseboards (wooden trim along floor-wall junction) ----
    var bbMat = new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x3a3028 : 0x8B6914, roughness: 0.5 });
    var bbH = 0.08, bbT = 0.04;
    var rHW = pos.w / 2 - 0.12, rHD = pos.d / 2 - 0.12;
    box(pos.w - 0.24, bbH, bbT, bbMat, 0, bbH / 2, -rHD, rg);
    box(pos.w - 0.24, bbH, bbT, bbMat, 0, bbH / 2, rHD, rg);
    box(bbT, bbH, pos.d - 0.24, bbMat, -rHW, bbH / 2, 0, rg);
    box(bbT, bbH, pos.d - 0.24, bbMat, rHW, bbH / 2, 0, rg);

    // ---- Floor pattern lines (wood planks / tile grid) ----
    var patternMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: IS_DARK ? 0.12 : 0.06 });
    if (type === 'bedroom' || type === 'living' || type === 'dining' || type === 'office') {
      // Wood plank lines
      for (var plk = -pos.w / 2 + 0.4; plk < pos.w / 2 - 0.1; plk += 0.45) {
        box(0.005, 0.001, pos.d - 0.4, patternMat, plk, 0.035, 0, rg);
      }
    } else if (type === 'kitchen' || type === 'bathroom' || type === 'laundry') {
      // Tile grid lines
      for (var tlx = -pos.w / 2 + 0.4; tlx < pos.w / 2 - 0.1; tlx += 0.5) {
        box(0.005, 0.001, pos.d - 0.4, patternMat, tlx, 0.035, 0, rg);
      }
      for (var tlz = -pos.d / 2 + 0.4; tlz < pos.d / 2 - 0.1; tlz += 0.5) {
        box(pos.w - 0.4, 0.001, 0.005, patternMat, 0, 0.035, tlz, rg);
      }
    }

    // ---- Ceiling light fixture (visible from above when roof off) ----
    var ceilLight = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16),
      new THREE.MeshStandardMaterial({ color: 0xFFFFF0, emissive: 0xFFFFCC, emissiveIntensity: IS_DARK ? 0.4 : 0.15, roughness: 0.2 })
    );
    ceilLight.position.set(0, WALL_H - 0.02, 0);
    ceilLight.receiveShadow = false;
    rg.add(ceilLight);
    // Warm point light per room
    var roomLight = new THREE.PointLight(0xFFF5E0, IS_DARK ? 0.3 : 0.15, Math.max(pos.w, pos.d) * 1.1);
    roomLight.position.set(0, WALL_H - 0.15, 0);
    rg.add(roomLight);

    // ---- Room edge glow line (colored border at floor level) ----
    var edgeColor = ROOM_COLORS[i % ROOM_COLORS.length];
    var edgeMat = new THREE.MeshBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.35 });
    var eT = 0.03;
    box(pos.w - 0.2, 0.015, eT, edgeMat, 0, 0.04, -(pos.d / 2 - 0.12), rg);
    box(pos.w - 0.2, 0.015, eT, edgeMat, 0, 0.04, (pos.d / 2 - 0.12), rg);
    box(eT, 0.015, pos.d - 0.2, edgeMat, -(pos.w / 2 - 0.12), 0.04, 0, rg);
    box(eT, 0.015, pos.d - 0.2, edgeMat, (pos.w / 2 - 0.12), 0.04, 0, rg);

    // Room label (floating sprite with room type color)
    var roomLabelColors = { bedroom: '#9C27B0', kitchen: '#FF9800', bathroom: '#2196F3', living: '#4CAF50', dining: '#F44336', office: '#607D8B', laundry: '#00BCD4', garage: '#795548' };
    var labelColor = roomLabelColors[type] || '#4CAF50';
    var lc = document.createElement('canvas');
    lc.width = 512; lc.height = 96;
    var lctx = lc.getContext('2d');
    // Background pill for readability
    lctx.fillStyle = IS_DARK ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)';
    var textW = lctx.measureText(room.name).width || 200;
    lctx.beginPath();
    lctx.roundRect(256 - textW / 2 - 30, 8, textW + 60, 80, 20);
    lctx.fill();
    lctx.font = 'bold 36px -apple-system, sans-serif';
    lctx.fillStyle = labelColor;
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.fillText(room.name, 256, 48);
    var labelTex = new THREE.CanvasTexture(lc);
    var labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, opacity: 0.9 }));
    labelSprite.scale.set(3.5, 0.7, 1);
    labelSprite.position.set(0, WALL_H + 0.6, 0);
    rg.add(labelSprite);

    // Build furniture
    var builder = furnitureBuilders[type] || buildGenericRoom;
    builder(rg);

    // ==== Furniture bounds validation ====
    // Check all furniture meshes are within room bounds, clamp if needed
    var furnMargin = 0.1;
    var furnHW = pos.w / 2 - furnMargin;
    var furnHD = pos.d / 2 - furnMargin;
    rg.children.forEach(function(child) {
      if (child.isMesh && !child.userData.type) {
        // Skip floor, labels, baseboards etc — only check furniture positioned by builder
        if (Math.abs(child.position.x) > furnHW || Math.abs(child.position.z) > furnHD) {
          child.position.x = Math.max(-furnHW, Math.min(furnHW, child.position.x));
          child.position.z = Math.max(-furnHD, Math.min(furnHD, child.position.z));
        }
      }
    });

    // ==== Compute furniture occupied boxes for device collision avoidance ====
    var furnitureBoxes = [];
    rg.children.forEach(function(child) {
      if (child.isMesh && child.position.y > 0.05 && child.position.y < 2.0) {
        var fb = new THREE.Box3().setFromObject(child);
        // Grow slightly for breathing room
        fb.expandByScalar(0.05);
        furnitureBoxes.push(fb);
      }
    });

    // ============================================================
    // Place scanned devices with collision-aware placement
    // Uses Box3 collision checks against furniture bounding boxes
    // ============================================================
    var devs = DEVICES.filter(function(d) { return d.roomId === room.roomId; });
    var usedSpots = {};
    var deviceBoxes = [];

    devs.forEach(function(dev, di) {
      var dc = getDevColor(dev.category);
      var glowMat = new THREE.MeshStandardMaterial({ color: dc, roughness: 0.2, metalness: 0.3, emissive: dc, emissiveIntensity: 0.4 });
      var bodyMat = new THREE.MeshStandardMaterial({ color: dc, roughness: 0.3, metalness: 0.2, emissive: dc, emissiveIntensity: 0.15 });

      // Get smart placement position with collision avoidance
      var spot = getSmartSpot(type, dev.category, di, usedSpots, pos.w, pos.d);
      usedSpots[spot.key] = true;

      // Collision check: ensure device doesn't overlap furniture
      var devFootprint = new THREE.Box3(
        new THREE.Vector3(pos.x + spot.x - 0.3, 0, pos.z + spot.z - 0.3),
        new THREE.Vector3(pos.x + spot.x + 0.3, 1.5, pos.z + spot.z + 0.3)
      );
      var hasCollision = false;
      for (var ci = 0; ci < furnitureBoxes.length; ci++) {
        if (devFootprint.intersectsBox(furnitureBoxes[ci])) { hasCollision = true; break; }
      }
      for (var di2 = 0; di2 < deviceBoxes.length; di2++) {
        if (devFootprint.intersectsBox(deviceBoxes[di2])) { hasCollision = true; break; }
      }
      if (hasCollision) {
        // Try shifting to nearby clear positions
        var offsets = [{x:0.6,z:0},{x:-0.6,z:0},{x:0,z:0.6},{x:0,z:-0.6},{x:0.6,z:0.6},{x:-0.6,z:-0.6}];
        for (var oi = 0; oi < offsets.length; oi++) {
          var nx = spot.x + offsets[oi].x;
          var nz = spot.z + offsets[oi].z;
          var clamped = clampSpot(nx, nz, pos.w, pos.d);
          var altBox = new THREE.Box3(
            new THREE.Vector3(pos.x + clamped.x - 0.3, 0, pos.z + clamped.z - 0.3),
            new THREE.Vector3(pos.x + clamped.x + 0.3, 1.5, pos.z + clamped.z + 0.3)
          );
          var altOk = true;
          for (var ci2 = 0; ci2 < furnitureBoxes.length; ci2++) {
            if (altBox.intersectsBox(furnitureBoxes[ci2])) { altOk = false; break; }
          }
          for (var di3 = 0; di3 < deviceBoxes.length; di3++) {
            if (altBox.intersectsBox(deviceBoxes[di3])) { altOk = false; break; }
          }
          if (altOk) {
            spot.x = clamped.x;
            spot.z = clamped.z;
            devFootprint = altBox;
            hasCollision = false;
            break;
          }
        }
      }
      deviceBoxes.push(devFootprint);

      var devG = new THREE.Group();
      devG.position.set(spot.x, 0, spot.z);
      devG.userData = { isDevice: true, deviceLabel: dev.label, deviceCategory: dev.category, roomId: room.roomId, roomName: room.name };

      // Build the specific 3D appliance model
      // Try glTF model first, fallback to primitive
      buildDevice3D(dev.category, devG, dc, glowMat, bodyMat);
      loadGLTFModel(dev.category, function(gltfScene) {
        if (gltfScene) {
          // Remove primitive children (keep glow rings, labels, lights)
          var toRemove = [];
          devG.children.forEach(function(child) {
            if (child.isMesh && !child.userData.isGlow && !child.isLight && !child.isSprite) toRemove.push(child);
          });
          toRemove.forEach(function(child) { devG.remove(child); });
          // Model is already normalized by loadGLTFModel — centered, floor-aligned
          devG.add(gltfScene);
        }
      });

      // Tag all meshes in this device group as clickable
      devG.traverse(function(child) {
        if (child.isMesh) {
          child.userData.isDeviceMesh = true;
          child.userData.deviceLabel = dev.label;
          child.userData.deviceCategory = dev.category;
          child.userData.roomId = room.roomId;
          child.userData.roomName = room.name;
        }
      });

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

  // ---- Interior Door Frames, Panels & Transoms ----
  var doorH = 2.4;
  var frameW = 0.06;
  var frameDepth = IW + 0.06;
  var frameMat = new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x4a3428 : 0x6B4226, roughness: 0.45 });
  var intDoorMat = new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x5a3a22 : 0x8B6340, roughness: 0.5, side: THREE.DoubleSide });
  var doorKnobMat = new THREE.MeshStandardMaterial({ color: 0xBBBB00, metalness: 0.8, roughness: 0.2 });
  var aboveDoorH = WALL_H - doorH;

  // Door in horizontal wall (constant z, runs along x)
  function addHDoor(gapX, gapZ, gapW) {
    if (aboveDoorH > 0.02) box(gapW, aboveDoorH, IW, M.wallInner, gapX, doorH + aboveDoorH / 2, gapZ, house);
    box(frameW, doorH, frameDepth, frameMat, gapX - gapW / 2 + frameW / 2, doorH / 2, gapZ, house);
    box(frameW, doorH, frameDepth, frameMat, gapX + gapW / 2 - frameW / 2, doorH / 2, gapZ, house);
    box(gapW, frameW, frameDepth, frameMat, gapX, doorH + frameW / 2, gapZ, house);
    box(gapW - 0.12, doorH - 0.08, 0.05, intDoorMat, gapX, doorH / 2 - 0.02, gapZ + 0.05, house);
    cyl(0.025, 0.025, 0.04, 8, doorKnobMat, gapX + gapW / 2 - 0.18, doorH * 0.42, gapZ + 0.09, house);
  }

  // Door in vertical wall (constant x, runs along z)
  function addVDoor(gapX, gapZ, gapW) {
    if (aboveDoorH > 0.02) box(IW, aboveDoorH, gapW, M.wallInner, gapX, doorH + aboveDoorH / 2, gapZ, house);
    box(frameDepth, doorH, frameW, frameMat, gapX, doorH / 2, gapZ - gapW / 2 + frameW / 2, house);
    box(frameDepth, doorH, frameW, frameMat, gapX, doorH / 2, gapZ + gapW / 2 - frameW / 2, house);
    box(frameDepth, frameW, gapW, frameMat, gapX, doorH + frameW / 2, gapZ, house);
    box(0.05, doorH - 0.08, gapW - 0.12, intDoorMat, gapX + 0.05, doorH / 2 - 0.02, gapZ, house);
    cyl(0.025, 0.025, 0.04, 8, doorKnobMat, gapX + 0.09, doorH * 0.42, gapZ + gapW / 2 - 0.18, house);
  }

  // Horizontal wall doors (z = rowSplitZ = -0.25)
  addHDoor(-3.75, rowSplitZ, 1.0);   // Bedroom ↔ Living
  addHDoor(0.75, rowSplitZ, 1.0);    // Kitchen ↔ Dining

  // Vertical wall doors - top row
  addVDoor(topVert1X, -HD + BR_D / 2, 1.0);   // Bedroom ↔ Kitchen
  addVDoor(topVert2X, -HD + BA_D / 2, 1.0);   // Kitchen ↔ Bathroom

  // Vertical wall doors - bottom row
  addVDoor(botVertX, rowSplitZ + LR_D / 2, 1.0);  // Living ↔ Dining

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

  // Front door frame
  box(frameW, 2.5, 0.12, frameMat, doorGapX - 0.48, 1.25, HD, house);
  box(frameW, 2.5, 0.12, frameMat, doorGapX + 0.48, 1.25, HD, house);
  box(1.0, frameW, 0.12, frameMat, doorGapX, 2.5 + frameW / 2, HD, house);

  // ---- Pitched Roof (toggleable) ----
  var roofGroup = new THREE.Group();
  roofGroup.userData = { isRoof: true };
  var roofMat = new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x4a3028 : 0x8B4513, roughness: 0.7 });
  var roofEdgeMat = new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x3a2018 : 0x6B3310, roughness: 0.6 });
  var roofH = 2.0;
  var roofHalfW = TOTAL_W / 2 + 0.5;
  var roofHalfD = TOTAL_D / 2 + 0.5;
  var rTop = WALL_H + roofH;
  var rBase = WALL_H + 0.04;
  var fVerts = new Float32Array([
    -roofHalfW, rBase, roofHalfD,    roofHalfW, rBase, roofHalfD,    0, rTop, 0,
    roofHalfW, rBase, roofHalfD,     roofHalfW, rBase, -roofHalfD,   0, rTop, 0,
    roofHalfW, rBase, -roofHalfD,    -roofHalfW, rBase, -roofHalfD,  0, rTop, 0,
    -roofHalfW, rBase, -roofHalfD,   -roofHalfW, rBase, roofHalfD,   0, rTop, 0,
  ]);
  var roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.BufferAttribute(fVerts, 3));
  roofGeo.computeVertexNormals();
  var roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  roofGroup.add(roofMesh);
  box(TOTAL_W + 1.0, 0.1, 0.15, roofEdgeMat, 0, rBase, roofHalfD, roofGroup);
  box(TOTAL_W + 1.0, 0.1, 0.15, roofEdgeMat, 0, rBase, -roofHalfD, roofGroup);
  box(0.15, 0.1, TOTAL_D + 1.0, roofEdgeMat, -roofHalfW, rBase, 0, roofGroup);
  box(0.15, 0.1, TOTAL_D + 1.0, roofEdgeMat, roofHalfW, rBase, 0, roofGroup);

  // Chimney (part of roof group)
  var chimMat = new THREE.MeshStandardMaterial({ color: IS_DARK ? 0x5a3a2a : 0x8B6355, roughness: 0.7 });
  box(0.6, 2.5, 0.6, chimMat, HW - 2.5, rTop - 0.3, -HD + 1.5, roofGroup);
  box(0.8, 0.1, 0.8, new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 }), HW - 2.5, rTop + 0.95, -HD + 1.5, roofGroup);
  for (var smi = 0; smi < 3; smi++) {
    var smoke = new THREE.Mesh(
      new THREE.SphereGeometry(0.15 + smi * 0.08, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xCCCCCC, transparent: true, opacity: 0.15 - smi * 0.04 })
    );
    smoke.position.set(HW - 2.5 + (Math.random()-0.5)*0.3, rTop + 1.2 + smi * 0.5, -HD + 1.5);
    smoke.userData = { isSmoke: true, baseY: rTop + 1.2 + smi * 0.5 };
    roofGroup.add(smoke);
  }
  house.add(roofGroup);

  // ---- Roof toggle button logic ----
  var roofVisible = true;
  var roofBtn = document.getElementById('roofToggle');
  roofBtn.addEventListener('click', function(ev) {
    ev.stopPropagation();
    roofVisible = !roofVisible;
    roofGroup.visible = roofVisible;
    roofBtn.innerHTML = roofVisible
      ? '🏠<span class="label">Roof On</span>'
      : '👁<span class="label">Roof Off</span>';
    roofBtn.style.borderColor = roofVisible
      ? (IS_DARK ? 'rgba(76,175,80,0.5)' : 'rgba(0,0,0,0.12)')
      : '#4CAF50';
    lastInteraction = Date.now();
  });
  // Start with roof OFF so user can see inside
  roofVisible = false;
  roofGroup.visible = false;
  roofBtn.innerHTML = '👁<span class="label">Roof Off</span>';
  roofBtn.style.borderColor = '#4CAF50';

  // ================================================================
  // Touch Controls — full 360 rotation
  // ================================================================
  var isDragging = false;
  var prevX = 0, prevY = 0;
  var rotY = 0.75, rotX = 0.72;
  var zoom = 22;
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
  // Raycaster — tap room for tooltip, tap device for postMessage
  // ================================================================
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var tooltip = document.getElementById('tooltip');
  var dragDistance = 0;
  var pointerDownPos = { x: 0, y: 0 };

  renderer.domElement.addEventListener('pointerdown', function(e) {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  renderer.domElement.addEventListener('click', function(e) {
    // Ignore drags (only handle taps/clicks)
    var dx = e.clientX - pointerDownPos.x;
    var dy = e.clientY - pointerDownPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > 8) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Check ALL meshes in the house, not just floors
    var allMeshes = [];
    house.traverse(function(obj) { if (obj.isMesh) allMeshes.push(obj); });
    var hits = raycaster.intersectObjects(allMeshes);

    if (hits.length > 0) {
      var hit = hits[0].object;

      // Check if a device was clicked (walk up to find device group)
      var deviceData = null;
      var current = hit;
      while (current) {
        if (current.userData && current.userData.isDevice) {
          deviceData = current.userData;
          break;
        }
        if (current.userData && current.userData.isDeviceMesh) {
          deviceData = current.userData;
          break;
        }
        current = current.parent;
      }

      if (deviceData) {
        // Send device tap to host (React Native WebView or iframe parent)
        try {
          sendToHost({
            type: 'deviceTap',
            label: deviceData.deviceLabel,
            category: deviceData.deviceCategory,
            roomId: deviceData.roomId,
            roomName: deviceData.roomName,
          });
        } catch(err) {}

        // Visual pulse feedback — expand glow ring briefly
        var devGroup = hit;
        while (devGroup && devGroup.parent !== house && devGroup.parent) {
          devGroup = devGroup.parent;
        }
        if (devGroup) {
          // Create expanding ring effect
          var tapRing = new THREE.Mesh(
            new THREE.RingGeometry(0.5, 0.8, 32),
            new THREE.MeshBasicMaterial({ color: 0x4CAF50, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
          );
          tapRing.rotation.x = -Math.PI / 2;
          tapRing.position.copy(devGroup.position);
          tapRing.position.y = 0.01;
          house.add(tapRing);
          // Animate the ring expanding and fading
          var tapStart = Date.now();
          function animateTapRing() {
            var elapsed = Date.now() - tapStart;
            var t = elapsed / 600;
            if (t < 1) {
              tapRing.scale.set(1 + t * 2, 1 + t * 2, 1);
              tapRing.material.opacity = 0.8 * (1 - t);
              requestAnimationFrame(animateTapRing);
            } else {
              house.remove(tapRing);
            }
          }
          animateTapRing();
        }

        // Enhanced tooltip for device with power info
        var devInfo = DEVICES.find(function(d2) { return d2.label === deviceData.deviceLabel && d2.roomId === deviceData.roomId; });
        var wattInfo = devInfo && devInfo.watts ? devInfo.watts + 'W' : '';
        var html = '<div class="tt-room">' + (deviceData.deviceLabel || deviceData.deviceCategory) + '</div>';
        html += '<div class="tt-devices">';
        html += '<div class="tt-device"><span style="color:#4CAF50">●</span> ' + deviceData.deviceCategory + '</div>';
        html += '<div class="tt-device"><span style="color:#2196F3">●</span> Room: ' + (deviceData.roomName || deviceData.roomId) + '</div>';
        if (wattInfo) html += '<div class="tt-device"><span style="color:#FF9800">●</span> Power: ' + wattInfo + '</div>';
        html += '<div class="tt-device" style="color:#4CAF50;margin-top:6px;font-weight:600">↗ Tap for details</div>';
        html += '</div>';
        tooltip.innerHTML = html;
        tooltip.style.display = 'block';
        tooltip.style.left = Math.min(e.clientX + 10, window.innerWidth - 230) + 'px';
        tooltip.style.top = Math.max(e.clientY - 60, 10) + 'px';
        setTimeout(function() { tooltip.style.display = 'none'; }, 3000);
        return;
      }

      // Check if floor was clicked (room tooltip with electricity info)
      var ud = hit.userData;
      if (ud && ud.type === 'floor') {
        // Room selection highlighting (toggle on/off)
        if (selectedFloor === hit) {
          selectedFloor.material.emissive.setHex(0x000000);
          selectedFloor.material.emissiveIntensity = 0;
          selectedFloor = null;
        } else {
          if (selectedFloor) {
            selectedFloor.material.emissive.setHex(0x000000);
            selectedFloor.material.emissiveIntensity = 0;
          }
          selectedFloor = hit;
          selectedFloor.material.emissive.setHex(0x4CAF50);
          selectedFloor.material.emissiveIntensity = 0.15;
        }

        var rm = ud.name || ud.roomId;
        var devs = DEVICES.filter(function(d) { return d.roomId === ud.roomId; });
        var totalWatts = 0;
        devs.forEach(function(d) { totalWatts += (d.watts || 0); });
        var dailyKwh = (totalWatts * 8 / 1000).toFixed(2);
        var monthlyCost = (totalWatts * 8 * 30 / 1000 * 0.15).toFixed(2);
        var html = '<div class="tt-room">' + rm + '</div>';
        html += '<div style="display:flex;gap:12px;margin:6px 0 8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1)">';
        html += '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:#FF9800">' + totalWatts + 'W</div><div style="font-size:9px;opacity:0.5">Total Power</div></div>';
        html += '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:#2196F3">' + dailyKwh + '</div><div style="font-size:9px;opacity:0.5">kWh/day</div></div>';
        html += '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:#4CAF50">$' + monthlyCost + '</div><div style="font-size:9px;opacity:0.5">/month</div></div>';
        html += '</div>';
        html += '<div class="tt-devices">';
        if (devs.length === 0) {
          html += '<div style="opacity:0.5;padding:4px 0">No devices scanned yet</div>';
        } else {
          devs.forEach(function(d) {
            var w = d.watts || 0;
            var wColor = w > 500 ? '#F44336' : w > 100 ? '#FF9800' : '#4CAF50';
            html += '<div class="tt-device" style="display:flex;justify-content:space-between;align-items:center">';
            html += '<span><span style="color:' + (getDevColor(d.category) ? '#' + getDevColor(d.category).toString(16).padStart(6, '0') : '#4CAF50') + '">●</span> ' + (d.label || d.category) + '</span>';
            html += '<span style="color:' + wColor + ';font-weight:600;margin-left:8px">' + w + 'W</span>';
            html += '</div>';
          });
        }
        html += '</div>';
        html += '<div style="font-size:9px;opacity:0.4;margin-top:6px;text-align:center">Tap a device for details</div>';
        tooltip.innerHTML = html;
        tooltip.style.display = 'block';
        tooltip.style.left = Math.min(e.clientX + 10, window.innerWidth - 280) + 'px';
        tooltip.style.top = Math.max(e.clientY - 80, 10) + 'px';
        // Also send room tap event to host
        try {
          sendToHost({
            type: 'roomTap',
            roomId: ud.roomId,
            roomName: rm,
            deviceCount: devs.length,
            totalWatts: totalWatts,
          });
        } catch(err) {}
        setTimeout(function() { tooltip.style.display = 'none'; }, 5000);
      } else {
        tooltip.style.display = 'none';
      }
    } else {
      tooltip.style.display = 'none';
    }
  });

  // ================================================================
  // Animation loop
  // ================================================================
  var glowRings = [];
  var smokeObjs = [];
  house.traverse(function(c) {
    if (c.userData && c.userData.isGlow) glowRings.push(c);
    if (c.userData && c.userData.isSmoke) smokeObjs.push(c);
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
    camera.lookAt(0, 0.5, 0);

    // Pulse glow rings + device point lights
    var pulse = 0.3 + Math.sin(now * 0.004) * 0.3;
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

    // Animate chimney smoke
    smokeObjs.forEach(function(s) {
      s.position.y = s.userData.baseY + Math.sin(now * 0.001 + s.userData.baseY) * 0.3;
      s.position.x += Math.sin(now * 0.0005) * 0.001;
    });

    // Pulse selected room floor highlight
    if (selectedFloor) {
      selectedFloor.material.emissiveIntensity = 0.08 + Math.sin(now * 0.003) * 0.08;
    }

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

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'deviceTap' && onDevicePress) {
        onDevicePress({
          label: data.label,
          category: data.category,
          roomId: data.roomId,
          roomName: data.roomName,
        });
      }
    } catch {}
  }, [onDevicePress]);

  const [showWebView, setShowWebView] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowWebView(true), 400);
    return () => clearTimeout(t);
  }, [rooms.length, devices.length]);

  // Web: listen for postMessage from iframe (ignore messages from other sources)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: MessageEvent) => {
      // Only accept string messages that look like our JSON payloads
      if (typeof e.data === 'string' && e.data.startsWith('{')) {
        handleMessage({ nativeEvent: { data: e.data } } as any);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [handleMessage]);

  const containerHeight = Math.max(height, 280);
  return (
    <View style={[styles.container, { height: containerHeight }]}>
      {!showWebView ? (
        <View style={[styles.loadingWrap, { height: containerHeight }]}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading 3D house…</Text>
        </View>
      ) : null}
      {Platform.OS === 'web' ? (
        <iframe
          key={`house3d-${rooms.length}-${devices.length}`}
          srcDoc={htmlContent}
          style={{
            width: '100%',
            height: containerHeight,
            border: 'none',
            borderRadius: 16,
            opacity: showWebView ? 1 : 0,
          } as any}
        />
      ) : WebView ? (
        <WebView
          key={`house3d-${rooms.length}-${devices.length}`}
          source={{ html: htmlContent }}
          style={[styles.webview, { minHeight: 280, opacity: showWebView ? 1 : 0 }]}
          scrollEnabled={false}
          bounces={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          originWhitelist={['*']}
          mixedContentMode="always"
          allowsInlineMediaPlayback={true}
          overScrollMode="never"
          nestedScrollEnabled={false}
          onMessage={handleMessage}
          {...(Platform.OS === 'android' ? { hardwareAccelerationDisabledInWebView: false } : {})}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
  },
  loadingWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d0d1a',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 12,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
