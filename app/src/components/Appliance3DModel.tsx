/**
 * Appliance3DModel — Isometric-style 3D device illustrations
 *
 * Pure SVG-based isometric appliance renderings.
 * No WebGL needed — works in Expo Go.
 */

import React from 'react';
import Svg, {
  Rect, Path, G, Defs, LinearGradient, Stop,
  Circle, Ellipse, Text as SvgText,
} from 'react-native-svg';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  category: string;
  size?: number;
  showLabel?: boolean;
  color?: string;
}

const APPLIANCE_COLORS: Record<string, { primary: string; secondary: string; accent: string }> = {
  'Toaster':          { primary: '#FF5722', secondary: '#E64A19', accent: '#FF8A65' },
  'Refrigerator':     { primary: '#03A9F4', secondary: '#0288D1', accent: '#4FC3F7' },
  'Fridge':           { primary: '#03A9F4', secondary: '#0288D1', accent: '#4FC3F7' },
  'Television':       { primary: '#1E88E5', secondary: '#1565C0', accent: '#42A5F5' },
  'TV':               { primary: '#1E88E5', secondary: '#1565C0', accent: '#42A5F5' },
  'Laptop':           { primary: '#546E7A', secondary: '#37474F', accent: '#78909C' },
  'Microwave':        { primary: '#7E57C2', secondary: '#5E35B1', accent: '#9575CD' },
  'Oven':             { primary: '#D32F2F', secondary: '#B71C1C', accent: '#EF5350' },
  'Stove':            { primary: '#D32F2F', secondary: '#B71C1C', accent: '#EF5350' },
  'Range':            { primary: '#D32F2F', secondary: '#B71C1C', accent: '#EF5350' },
  'Washing Machine':  { primary: '#5C6BC0', secondary: '#3949AB', accent: '#7986CB' },
  'Dryer':            { primary: '#AB47BC', secondary: '#8E24AA', accent: '#CE93D8' },
  'Air Conditioner':  { primary: '#00ACC1', secondary: '#00838F', accent: '#4DD0E1' },
  'Space Heater':     { primary: '#FF7043', secondary: '#E64A19', accent: '#FF8A65' },
  'Fan':              { primary: '#26A69A', secondary: '#00897B', accent: '#4DB6AC' },
  'Light Bulb':       { primary: '#FFB300', secondary: '#FF8F00', accent: '#FFD54F' },
  'Lamp':             { primary: '#FFB300', secondary: '#FF8F00', accent: '#FFD54F' },
  'Router':           { primary: '#78909C', secondary: '#546E7A', accent: '#90A4AE' },
  'Gaming Console':   { primary: '#5C6BC0', secondary: '#3F51B5', accent: '#7986CB' },
  'Monitor':          { primary: '#42A5F5', secondary: '#1E88E5', accent: '#64B5F6' },
  'Display':          { primary: '#42A5F5', secondary: '#1E88E5', accent: '#64B5F6' },
  'Dishwasher':       { primary: '#8D6E63', secondary: '#6D4C41', accent: '#A1887F' },
  'Hair Dryer':       { primary: '#EC407A', secondary: '#D81B60', accent: '#F48FB1' },
  'Water Heater':     { primary: '#FF7043', secondary: '#E64A19', accent: '#FF8A65' },
  'Phone Charger':    { primary: '#66BB6A', secondary: '#43A047', accent: '#81C784' },
  'Charger':          { primary: '#66BB6A', secondary: '#43A047', accent: '#81C784' },
  'Coffee Maker':     { primary: '#795548', secondary: '#5D4037', accent: '#A1887F' },
  'Blender':          { primary: '#26C6DA', secondary: '#00ACC1', accent: '#4DD0E1' },
  'Vacuum':           { primary: '#F44336', secondary: '#D32F2F', accent: '#EF5350' },
  'Printer':          { primary: '#607D8B', secondary: '#455A64', accent: '#90A4AE' },
  'Speaker':          { primary: '#9C27B0', secondary: '#7B1FA2', accent: '#CE93D8' },
  'Smart Speaker':    { primary: '#9C27B0', secondary: '#7B1FA2', accent: '#CE93D8' },
  'Tablet':           { primary: '#455A64', secondary: '#37474F', accent: '#78909C' },
  'Iron':             { primary: '#FF8F00', secondary: '#F57F17', accent: '#FFB74D' },
  'Electric Kettle':  { primary: '#00BCD4', secondary: '#0097A7', accent: '#4DD0E1' },
  'Kettle':           { primary: '#00BCD4', secondary: '#0097A7', accent: '#4DD0E1' },
};

function getColors(category: string) {
  return APPLIANCE_COLORS[category] ?? { primary: '#607D8B', secondary: '#455A64', accent: '#90A4AE' };
}

// -- Individual appliance SVG renderers --

function ToasterSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="tBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} />
          <Stop offset="1" stopColor={colors.primary} />
        </LinearGradient>
        <LinearGradient id="tSide" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={colors.secondary} />
          <Stop offset="1" stopColor={colors.primary} />
        </LinearGradient>
      </Defs>
      {/* Shadow */}
      <Ellipse cx="50" cy="88" rx="30" ry="6" fill="rgba(0,0,0,0.2)" />
      {/* Body */}
      <Rect x="18" y="38" width="52" height="40" rx="8" fill="url(#tBody)" />
      {/* Side face */}
      <Path d="M70 38 L82 30 L82 70 L70 78 Z" fill="url(#tSide)" />
      {/* Top face */}
      <Path d="M18 38 L30 30 L82 30 L70 38 Z" fill={colors.accent} opacity="0.8" />
      {/* Slots */}
      <Rect x="28" y="28" width="14" height="3" rx="1.5" fill="#333" opacity="0.6" />
      <Rect x="48" y="28" width="14" height="3" rx="1.5" fill="#333" opacity="0.6" />
      {/* Bread */}
      <Path d="M30 28 Q35 18 42 28" fill="#D4A574" />
      <Path d="M50 28 Q55 18 62 28" fill="#D4A574" />
      {/* Lever */}
      <Rect x="72" y="50" width="8" height="4" rx="2" fill="#666" />
      {/* Feet */}
      <Rect x="24" y="78" width="6" height="4" rx="1" fill="#444" />
      <Rect x="58" y="78" width="6" height="4" rx="1" fill="#444" />
    </Svg>
  );
}

function RefrigeratorSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="rBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} />
          <Stop offset="1" stopColor={colors.primary} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="48" cy="94" rx="28" ry="4" fill="rgba(0,0,0,0.2)" />
      {/* Main body */}
      <Rect x="16" y="8" width="48" height="84" rx="4" fill="url(#rBody)" />
      {/* Side face */}
      <Path d="M64 8 L80 4 L80 88 L64 92 Z" fill={colors.secondary} />
      {/* Top face */}
      <Path d="M16 8 L32 4 L80 4 L64 8 Z" fill={colors.accent} opacity="0.7" />
      {/* Divider line */}
      <Rect x="16" y="38" width="48" height="2" fill={colors.secondary} opacity="0.5" />
      {/* Handle top */}
      <Rect x="56" y="20" width="3" height="14" rx="1.5" fill="#fff" opacity="0.7" />
      {/* Handle bottom */}
      <Rect x="56" y="50" width="3" height="14" rx="1.5" fill="#fff" opacity="0.7" />
      {/* Ice indicator */}
      <Circle cx="30" cy="24" r="4" fill="rgba(255,255,255,0.3)" />
      <SvgText x="30" y="27" textAnchor="middle" fill="#fff" fontSize="6">❄</SvgText>
    </Svg>
  );
}

function TelevisionSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="tvScreen" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1a237e" />
          <Stop offset="1" stopColor="#0d47a1" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="50" cy="90" rx="32" ry="5" fill="rgba(0,0,0,0.2)" />
      {/* Bezel */}
      <Rect x="10" y="20" width="64" height="46" rx="3" fill={colors.primary} />
      {/* Side */}
      <Path d="M74 20 L86 14 L86 60 L74 66 Z" fill={colors.secondary} />
      {/* Top */}
      <Path d="M10 20 L22 14 L86 14 L74 20 Z" fill={colors.accent} opacity="0.7" />
      {/* Screen */}
      <Rect x="14" y="24" width="56" height="38" rx="2" fill="url(#tvScreen)" />
      {/* Screen glare */}
      <Path d="M16 26 L40 26 L16 48 Z" fill="rgba(255,255,255,0.05)" />
      {/* Stand */}
      <Path d="M34 66 L34 78 L28 84 L56 84 L50 78 L50 66 Z" fill="#333" />
      {/* Power LED */}
      <Circle cx="68" cy="64" r="2" fill="#4CAF50" />
    </Svg>
  );
}

function LaptopSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="86" rx="34" ry="5" fill="rgba(0,0,0,0.15)" />
      {/* Screen */}
      <Rect x="20" y="16" width="50" height="38" rx="3" fill={colors.primary} />
      <Rect x="24" y="20" width="42" height="30" rx="2" fill="#1a237e" />
      {/* Side of screen */}
      <Path d="M70 16 L78 12 L78 50 L70 54 Z" fill={colors.secondary} />
      {/* Keyboard base */}
      <Path d="M12 62 L20 54 L70 54 L78 50 L88 58 L80 62 Z" fill={colors.secondary} />
      {/* Keyboard top */}
      <Path d="M12 62 L20 54 L70 54 L62 62 Z" fill={colors.accent} opacity="0.8" />
      {/* Keys grid */}
      {[0, 1, 2, 3].map(row =>
        [0, 1, 2, 3, 4, 5, 6].map(col => (
          <Rect key={`k${row}${col}`} x={24 + col * 5} y={56 + row * 1.6} width="3.5" height="1" rx="0.3" fill="rgba(0,0,0,0.3)" />
        ))
      )}
      {/* Camera dot */}
      <Circle cx="45" cy="18" r="1.5" fill="#333" />
    </Svg>
  );
}

function MicrowaveSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="mwBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} />
          <Stop offset="1" stopColor={colors.primary} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="50" cy="86" rx="30" ry="5" fill="rgba(0,0,0,0.2)" />
      <Rect x="14" y="28" width="58" height="50" rx="4" fill="url(#mwBody)" />
      <Path d="M72 28 L84 22 L84 72 L72 78 Z" fill={colors.secondary} />
      <Path d="M14 28 L26 22 L84 22 L72 28 Z" fill={colors.accent} opacity="0.7" />
      {/* Window */}
      <Rect x="20" y="34" width="36" height="32" rx="2" fill="#111" />
      <Rect x="22" y="36" width="32" height="28" rx="1" fill="#1a1a2e" opacity="0.8" />
      {/* Control panel */}
      <Circle cx="66" cy="42" r="4" fill="#333" stroke="#555" strokeWidth="1" />
      <Rect x="62" y="52" width="8" height="4" rx="2" fill="#4CAF50" />
      <Rect x="62" y="60" width="8" height="4" rx="2" fill="#FF5722" />
      {/* Handle */}
      <Rect x="56" y="40" width="2" height="20" rx="1" fill="#888" />
    </Svg>
  );
}

function WashingMachineSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="wmBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} />
          <Stop offset="1" stopColor={colors.primary} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="48" cy="92" rx="28" ry="4" fill="rgba(0,0,0,0.2)" />
      <Rect x="16" y="10" width="52" height="78" rx="6" fill="url(#wmBody)" />
      <Path d="M68 10 L80 6 L80 84 L68 88 Z" fill={colors.secondary} />
      <Path d="M16 10 L28 6 L80 6 L68 10 Z" fill={colors.accent} opacity="0.7" />
      {/* Door circle */}
      <Circle cx="42" cy="56" r="20" fill="#111" />
      <Circle cx="42" cy="56" r="17" fill="#1a1a3a" />
      <Circle cx="42" cy="56" r="14" fill="#0d1a2e" />
      {/* Water effect */}
      <Path d="M30 62 Q36 58 42 62 Q48 66 54 62" fill="none" stroke="#4FC3F7" strokeWidth="2" opacity="0.5" />
      {/* Control panel */}
      <Circle cx="30" cy="20" r="5" fill="#333" stroke="#555" strokeWidth="1" />
      <Circle cx="54" cy="20" r="3" fill="#4CAF50" />
      <Circle cx="46" cy="20" r="3" fill="#FF9800" />
    </Svg>
  );
}

function AirConditionerSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="80" rx="32" ry="5" fill="rgba(0,0,0,0.15)" />
      <Rect x="10" y="24" width="66" height="36" rx="6" fill={colors.primary} />
      <Path d="M76 24 L88 18 L88 54 L76 60 Z" fill={colors.secondary} />
      <Path d="M10 24 L22 18 L88 18 L76 24 Z" fill={colors.accent} opacity="0.7" />
      {/* Vents */}
      {[0, 1, 2, 3, 4].map(i => (
        <Rect key={i} x="16" y={32 + i * 5} width="54" height="2" rx="1" fill={colors.secondary} opacity="0.4" />
      ))}
      {/* Air flow lines */}
      <Path d="M25 64 Q30 72 25 80" fill="none" stroke={colors.accent} strokeWidth="1.5" opacity="0.4" />
      <Path d="M43 64 Q48 74 43 84" fill="none" stroke={colors.accent} strokeWidth="1.5" opacity="0.3" />
      <Path d="M61 64 Q66 72 61 80" fill="none" stroke={colors.accent} strokeWidth="1.5" opacity="0.4" />
      {/* LED */}
      <Circle cx="70" cy="30" r="2" fill="#4CAF50" />
    </Svg>
  );
}

function DefaultApplianceSVG({ size, colors, icon }: { size: number; colors: ReturnType<typeof getColors>; icon: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="defBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} />
          <Stop offset="1" stopColor={colors.primary} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="50" cy="86" rx="26" ry="5" fill="rgba(0,0,0,0.2)" />
      <Rect x="20" y="22" width="48" height="58" rx="8" fill="url(#defBody)" />
      <Path d="M68 22 L80 16 L80 74 L68 80 Z" fill={colors.secondary} />
      <Path d="M20 22 L32 16 L80 16 L68 22 Z" fill={colors.accent} opacity="0.7" />
      {/* Icon placeholder */}
      <Circle cx="44" cy="50" r="14" fill="rgba(0,0,0,0.15)" />
    </Svg>
  );
}

function OvenSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="ovBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} />
          <Stop offset="1" stopColor={colors.primary} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="48" cy="94" rx="28" ry="4" fill="rgba(0,0,0,0.2)" />
      <Rect x="16" y="10" width="52" height="82" rx="4" fill="url(#ovBody)" />
      <Path d="M68 10 L80 6 L80 88 L68 92 Z" fill={colors.secondary} />
      <Path d="M16 10 L28 6 L80 6 L68 10 Z" fill={colors.accent} opacity="0.7" />
      {/* Oven window */}
      <Rect x="22" y="44" width="40" height="30" rx="2" fill="#1a0d00" opacity="0.8" />
      {/* Glow inside */}
      <Rect x="24" y="46" width="36" height="26" rx="1" fill="#FF6600" opacity="0.15" />
      {/* Handle */}
      <Rect x="26" y="40" width="32" height="3" rx="1.5" fill="#888" />
      {/* Burners */}
      <Circle cx="28" cy="22" r="6" fill="none" stroke="#FF3300" strokeWidth="2" opacity="0.5" />
      <Circle cx="48" cy="22" r="6" fill="none" stroke="#FF3300" strokeWidth="2" opacity="0.5" />
      {/* Knobs */}
      {[28, 36, 44, 52].map(x => <Circle key={x} cx={x} cy="34" r="3" fill="#555" stroke="#666" strokeWidth="0.5" />)}
    </Svg>
  );
}

function FanSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="90" rx="20" ry="4" fill="rgba(0,0,0,0.15)" />
      {/* Base */}
      <Ellipse cx="50" cy="86" rx="16" ry="5" fill={colors.secondary} />
      {/* Pole */}
      <Rect x="47" y="50" width="6" height="36" fill={colors.primary} />
      {/* Guard ring */}
      <Circle cx="50" cy="34" r="22" fill="none" stroke={colors.primary} strokeWidth="3" />
      {/* Hub */}
      <Circle cx="50" cy="34" r="6" fill={colors.secondary} />
      {/* Blades */}
      <Path d="M50 28 Q38 18 44 10 Q50 14 50 28" fill={colors.accent} opacity="0.7" />
      <Path d="M56 34 Q66 22 72 28 Q66 34 56 34" fill={colors.accent} opacity="0.7" />
      <Path d="M50 40 Q62 50 56 58 Q50 54 50 40" fill={colors.accent} opacity="0.7" />
      <Path d="M44 34 Q34 46 28 40 Q34 34 44 34" fill={colors.accent} opacity="0.7" />
      {/* Speed buttons */}
      <Rect x="40" y="80" width="6" height="3" rx="1" fill="#4CAF50" opacity="0.7" />
      <Rect x="48" y="80" width="6" height="3" rx="1" fill="#FF9800" opacity="0.7" />
    </Svg>
  );
}

function LampSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Glow effect */}
      <Circle cx="50" cy="30" r="28" fill={colors.accent} opacity="0.08" />
      <Circle cx="50" cy="30" r="18" fill={colors.accent} opacity="0.12" />
      <Ellipse cx="50" cy="90" rx="14" ry="3" fill="rgba(0,0,0,0.15)" />
      {/* Base */}
      <Ellipse cx="50" cy="86" rx="12" ry="4" fill={colors.secondary} />
      {/* Pole */}
      <Rect x="48" y="44" width="4" height="42" fill="#888" />
      {/* Shade */}
      <Path d="M30 22 L70 22 L64 44 L36 44 Z" fill={colors.primary} opacity="0.7" />
      <Path d="M32 22 L68 22 L62 40 L38 40 Z" fill={colors.accent} opacity="0.5" />
      {/* Bulb */}
      <Circle cx="50" cy="38" r="5" fill="#FFE082" />
      <Circle cx="50" cy="38" r="3" fill="#FFD54F" opacity="0.9" />
      {/* Light rays */}
      {[0, 1, 2, 3, 4].map(i => (
        <Path key={i} d={`M${38 + i * 6} 44 L${35 + i * 6} 52`} stroke={colors.accent} strokeWidth="1" opacity="0.2" />
      ))}
    </Svg>
  );
}

function RouterSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="80" rx="28" ry="4" fill="rgba(0,0,0,0.15)" />
      {/* Body */}
      <Rect x="18" y="56" width="52" height="18" rx="4" fill={colors.primary} />
      <Path d="M70 56 L82 50 L82 68 L70 74 Z" fill={colors.secondary} />
      <Path d="M18 56 L30 50 L82 50 L70 56 Z" fill={colors.accent} opacity="0.7" />
      {/* Antennas */}
      <Rect x="28" y="20" width="3" height="36" rx="1.5" fill="#666" />
      <Rect x="58" y="24" width="3" height="32" rx="1.5" fill="#666" />
      <Circle cx="29.5" cy="18" r="3" fill="#666" />
      <Circle cx="59.5" cy="22" r="3" fill="#666" />
      {/* Signal waves */}
      <Path d="M35 30 Q44 20 53 30" fill="none" stroke={colors.accent} strokeWidth="1.5" opacity="0.3" />
      <Path d="M32 24 Q44 12 56 24" fill="none" stroke={colors.accent} strokeWidth="1.5" opacity="0.2" />
      {/* LEDs */}
      <Circle cx="28" cy="65" r="2" fill="#4CAF50" />
      <Circle cx="36" cy="65" r="2" fill="#4CAF50" />
      <Circle cx="44" cy="65" r="2" fill="#FF9800" />
      <Circle cx="52" cy="65" r="2" fill="#4CAF50" />
      <Circle cx="60" cy="65" r="2" fill="#2196F3" />
    </Svg>
  );
}

function GamingConsoleSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="80" rx="30" ry="4" fill="rgba(0,0,0,0.15)" />
      {/* Body */}
      <Rect x="16" y="46" width="56" height="28" rx="6" fill={colors.primary} />
      <Path d="M72 46 L84 40 L84 68 L72 74 Z" fill={colors.secondary} />
      <Path d="M16 46 L28 40 L84 40 L72 46 Z" fill={colors.accent} opacity="0.7" />
      {/* Glowing strip */}
      <Rect x="18" y="44" width="52" height="2" rx="1" fill="#00CCFF" opacity="0.6" />
      {/* Disc slot */}
      <Rect x="30" y="56" width="28" height="2" rx="1" fill="#333" opacity="0.5" />
      {/* USB ports */}
      <Rect x="22" y="66" width="6" height="3" rx="1" fill="#333" />
      <Rect x="32" y="66" width="6" height="3" rx="1" fill="#333" />
      {/* Power button */}
      <Circle cx="62" cy="54" r="4" fill="#333" />
      <Circle cx="62" cy="54" r="2.5" fill={colors.accent} opacity="0.4" />
      {/* Controller */}
      <Path d="M24 28 Q30 20 36 28 L38 34 L22 34 Z" fill="#444" />
      <Circle cx="30" cy="28" r="2" fill="#666" />
      <Circle cx="27" cy="26" r="1" fill="#4CAF50" opacity="0.6" />
      <Circle cx="33" cy="26" r="1" fill="#F44336" opacity="0.6" />
    </Svg>
  );
}

function HairDryerSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="88" rx="20" ry="3" fill="rgba(0,0,0,0.15)" />
      {/* Nozzle */}
      <Path d="M20 30 Q20 20 30 20 L62 20 Q72 20 72 30 L72 42 Q72 52 62 52 L30 52 Q20 52 20 42 Z" fill={colors.primary} />
      <Rect x="14" y="28" width="8" height="16" rx="4" fill={colors.secondary} />
      {/* Air vent */}
      {[0, 1, 2, 3].map(i => (
        <Rect key={i} x="16" y={30 + i * 3} width="4" height="1.5" rx="0.5" fill="#333" opacity="0.4" />
      ))}
      {/* Handle */}
      <Path d="M52 52 L56 82 Q56 86 52 86 L44 86 Q40 86 40 82 L44 52" fill={colors.secondary} />
      <Rect x="42" y="62" width="12" height="4" rx="2" fill={colors.accent} opacity="0.5" />
      {/* Button */}
      <Circle cx="48" cy="72" r="3" fill="#4CAF50" />
      {/* Hot air */}
      <Path d="M8 32 Q4 36 8 40" fill="none" stroke="#FF6B35" strokeWidth="1.5" opacity="0.4" />
      <Path d="M4 34 Q0 38 4 42" fill="none" stroke="#FF6B35" strokeWidth="1" opacity="0.3" />
    </Svg>
  );
}

function DishwasherSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="dwBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} />
          <Stop offset="1" stopColor={colors.primary} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="48" cy="94" rx="28" ry="4" fill="rgba(0,0,0,0.2)" />
      <Rect x="16" y="10" width="52" height="82" rx="4" fill="url(#dwBody)" />
      <Path d="M68 10 L80 6 L80 88 L68 92 Z" fill={colors.secondary} />
      <Path d="M16 10 L28 6 L80 6 L68 10 Z" fill={colors.accent} opacity="0.7" />
      {/* Handle */}
      <Rect x="26" y="30" width="32" height="3" rx="1.5" fill="#999" />
      {/* Control panel */}
      <Rect x="22" y="16" width="40" height="10" rx="2" fill="#444" opacity="0.5" />
      {/* Buttons */}
      <Circle cx="30" cy="21" r="3" fill="#4CAF50" opacity="0.6" />
      <Circle cx="40" cy="21" r="3" fill="#2196F3" opacity="0.6" />
      <Rect x="48" y="19" width="8" height="4" rx="1" fill="#333" />
      {/* Door panel lines */}
      <Rect x="22" y="48" width="40" height="1" fill={colors.secondary} opacity="0.3" />
      <Rect x="22" y="64" width="40" height="1" fill={colors.secondary} opacity="0.3" />
    </Svg>
  );
}

function SpaceHeaterSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="88" rx="22" ry="4" fill="rgba(0,0,0,0.15)" />
      {/* Body */}
      <Rect x="24" y="24" width="40" height="58" rx="6" fill={colors.primary} />
      <Path d="M64 24 L76 18 L76 76 L64 82 Z" fill={colors.secondary} />
      <Path d="M24 24 L36 18 L76 18 L64 24 Z" fill={colors.accent} opacity="0.7" />
      {/* Heating elements */}
      {[0, 1, 2, 3].map(i => (
        <Rect key={i} x="30" y={34 + i * 10} width="28" height="4" rx="2" fill="#FF4400" opacity={0.7 - i * 0.1} />
      ))}
      {/* Heat waves */}
      <Path d="M34 22 Q36 16 38 22" fill="none" stroke="#FF6B35" strokeWidth="1.5" opacity="0.3" />
      <Path d="M46 20 Q48 14 50 20" fill="none" stroke="#FF6B35" strokeWidth="1.5" opacity="0.3" />
      <Path d="M58 22 Q60 16 62 22" fill="none" stroke="#FF6B35" strokeWidth="1.5" opacity="0.3" />
      {/* Base */}
      <Rect x="28" y="82" width="32" height="4" rx="2" fill="#555" />
      {/* Control knob */}
      <Circle cx="44" cy="72" r="4" fill="#555" stroke="#666" strokeWidth="1" />
    </Svg>
  );
}

function WaterHeaterSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="48" cy="92" rx="20" ry="4" fill="rgba(0,0,0,0.15)" />
      {/* Tank */}
      <Rect x="26" y="12" width="36" height="74" rx="8" fill={colors.primary} />
      <Path d="M62 12 L72 8 L72 82 L62 86 Z" fill={colors.secondary} />
      {/* Top */}
      <Ellipse cx="44" cy="14" rx="18" ry="4" fill={colors.accent} opacity="0.7" />
      {/* Pipes */}
      <Rect x="32" y="4" width="4" height="10" fill="#888" />
      <Rect x="48" y="4" width="4" height="10" fill="#888" />
      {/* Temperature gauge */}
      <Circle cx="44" cy="40" r="8" fill="#fff" opacity="0.2" />
      <Circle cx="44" cy="40" r="6" fill="#111" opacity="0.4" />
      <Path d="M44 36 L44 40 L47 42" stroke="#FF6B35" strokeWidth="1.5" fill="none" />
      {/* Thermostat */}
      <Circle cx="44" cy="60" r="5" fill="#555" stroke="#666" strokeWidth="0.8" />
      {/* Heat indicator */}
      <Rect x="34" y="74" width="20" height="3" rx="1.5" fill="#FF4400" opacity="0.4" />
    </Svg>
  );
}

function PhoneChargerSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="88" rx="18" ry="3" fill="rgba(0,0,0,0.1)" />
      {/* Charger plug */}
      <Rect x="38" y="60" width="16" height="22" rx="4" fill={colors.primary} />
      <Rect x="42" y="82" width="3" height="6" fill="#888" />
      <Rect x="49" y="82" width="3" height="6" fill="#888" />
      {/* Cable */}
      <Path d="M46 60 Q46 48 42 40 Q38 32 42 24" fill="none" stroke="#555" strokeWidth="2.5" />
      {/* Phone */}
      <Rect x="32" y="8" width="24" height="40" rx="4" fill="#222" />
      <Rect x="34" y="12" width="20" height="32" rx="2" fill="#111" />
      {/* Screen glow */}
      <Rect x="35" y="13" width="18" height="30" rx="1" fill="#1a237e" opacity="0.4" />
      {/* Battery icon on screen */}
      <Rect x="40" y="22" width="10" height="6" rx="1" fill="none" stroke="#4CAF50" strokeWidth="1" />
      <Rect x="50" y="24" width="2" height="2" fill="#4CAF50" />
      <Rect x="41" y="23" width="6" height="4" fill="#4CAF50" opacity="0.6" />
      {/* Charging lightning */}
      <Path d="M46 18 L44 24 L48 24 L46 30" fill="none" stroke="#FFD600" strokeWidth="1.5" />
    </Svg>
  );
}

function CoffeeMakerSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="48" cy="90" rx="24" ry="4" fill="rgba(0,0,0,0.15)" />
      {/* Body */}
      <Rect x="28" y="20" width="34" height="60" rx="4" fill={colors.primary} />
      <Path d="M62 20 L72 16 L72 76 L62 80 Z" fill={colors.secondary} />
      <Path d="M28 20 L38 16 L72 16 L62 20 Z" fill={colors.accent} opacity="0.7" />
      {/* Carafe */}
      <Path d="M30 56 L30 80 Q30 84 34 84 L54 84 Q58 84 58 80 L58 56" fill="#333" opacity="0.5" />
      <Path d="M32 58 L32 78 Q32 80 34 80 L52 80 Q54 80 54 78 L54 58" fill="#1a0d00" opacity="0.4" />
      {/* Coffee inside */}
      <Rect x="33" y="66" width="20" height="12" rx="1" fill="#4E342E" opacity="0.7" />
      {/* Handle */}
      <Path d="M58 60 Q64 60 64 66 Q64 72 58 72" fill="none" stroke="#555" strokeWidth="3" />
      {/* Hot plate */}
      <Ellipse cx="44" cy="86" rx="14" ry="3" fill="#FF4400" opacity="0.2" />
      {/* Steam */}
      <Path d="M38 16 Q40 10 42 16" fill="none" stroke="#ccc" strokeWidth="1" opacity="0.3" />
      <Path d="M48 14 Q50 8 52 14" fill="none" stroke="#ccc" strokeWidth="1" opacity="0.3" />
    </Svg>
  );
}

function BlenderSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="48" cy="90" rx="18" ry="3" fill="rgba(0,0,0,0.15)" />
      {/* Base */}
      <Rect x="30" y="72" width="30" height="16" rx="4" fill={colors.secondary} />
      {/* Button */}
      <Circle cx="45" cy="80" r="4" fill="#4CAF50" />
      <Circle cx="55" cy="80" r="3" fill="#F44336" />
      {/* Jar */}
      <Path d="M34 26 L30 72 L60 72 L56 26 Z" fill={colors.accent} opacity="0.3" />
      <Path d="M35 28 L32 70 L58 70 L55 28 Z" fill="#4FC3F7" opacity="0.15" />
      {/* Lid */}
      <Rect x="33" y="22" width="24" height="6" rx="3" fill={colors.primary} />
      <Rect x="42" y="16" width="6" height="8" rx="3" fill={colors.secondary} />
      {/* Blades */}
      <Path d="M40 60 L50 56 M50 56 L44 64 M44 64 L54 60" stroke="#888" strokeWidth="1.5" fill="none" />
      {/* Measurement lines */}
      {[0, 1, 2, 3].map(i => (
        <Rect key={i} x="54" y={36 + i * 8} width="4" height="0.8" fill={colors.primary} opacity="0.3" />
      ))}
    </Svg>
  );
}

function MonitorSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="monScr" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#0d47a1" />
          <Stop offset="1" stopColor="#1565c0" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="50" cy="90" rx="28" ry="4" fill="rgba(0,0,0,0.15)" />
      {/* Bezel */}
      <Rect x="8" y="16" width="68" height="48" rx="4" fill={colors.primary} />
      <Path d="M76 16 L88 10 L88 58 L76 64 Z" fill={colors.secondary} />
      <Path d="M8 16 L20 10 L88 10 L76 16 Z" fill={colors.accent} opacity="0.7" />
      {/* Screen */}
      <Rect x="12" y="20" width="60" height="40" rx="2" fill="url(#monScr)" />
      {/* Screen content lines */}
      <Rect x="18" y="28" width="30" height="2" rx="1" fill="rgba(255,255,255,0.1)" />
      <Rect x="18" y="34" width="24" height="2" rx="1" fill="rgba(255,255,255,0.08)" />
      <Rect x="18" y="40" width="36" height="2" rx="1" fill="rgba(255,255,255,0.06)" />
      {/* Stand neck */}
      <Rect x="38" y="64" width="12" height="10" fill="#555" />
      {/* Stand base */}
      <Ellipse cx="44" cy="80" rx="18" ry="5" fill="#555" />
      <Ellipse cx="44" cy="78" rx="16" ry="4" fill="#666" />
    </Svg>
  );
}

function DryerSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="drBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} />
          <Stop offset="1" stopColor={colors.primary} />
        </LinearGradient>
      </Defs>
      <Ellipse cx="48" cy="92" rx="28" ry="4" fill="rgba(0,0,0,0.2)" />
      <Rect x="16" y="10" width="52" height="78" rx="6" fill="url(#drBody)" />
      <Path d="M68 10 L80 6 L80 84 L68 88 Z" fill={colors.secondary} />
      <Path d="M16 10 L28 6 L80 6 L68 10 Z" fill={colors.accent} opacity="0.7" />
      {/* Door circle */}
      <Circle cx="42" cy="56" r="20" fill="#333" />
      <Circle cx="42" cy="56" r="17" fill="#444" />
      <Circle cx="42" cy="56" r="14" fill="#555" opacity="0.6" />
      {/* Tumbling lines */}
      <Path d="M34 50 Q42 44 50 50" fill="none" stroke="#999" strokeWidth="1.5" opacity="0.4" />
      <Path d="M34 58 Q42 64 50 58" fill="none" stroke="#999" strokeWidth="1.5" opacity="0.4" />
      {/* Control panel */}
      <Circle cx="30" cy="20" r="5" fill="#333" stroke="#555" strokeWidth="1" />
      <Rect x="44" y="17" width="14" height="6" rx="2" fill="#333" />
      {/* LED display */}
      <Rect x="46" y="18" width="10" height="4" rx="1" fill="#00E676" opacity="0.5" />
    </Svg>
  );
}

function VacuumSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="88" rx="16" ry="3" fill="rgba(0,0,0,0.15)" />
      {/* Body */}
      <Rect x="36" y="30" width="22" height="50" rx="6" fill={colors.primary} />
      {/* Handle */}
      <Rect x="44" y="10" width="6" height="24" rx="3" fill="#666" />
      <Path d="M40 10 L54 10" stroke="#666" strokeWidth="4" strokeLinecap="round" />
      {/* Nozzle */}
      <Rect x="30" y="78" width="34" height="8" rx="3" fill={colors.secondary} />
      <Rect x="34" y="84" width="26" height="3" rx="1" fill="#555" />
      {/* Canister window */}
      <Rect x="40" y="40" width="14" height="18" rx="3" fill="#333" opacity="0.5" />
      <Rect x="42" y="42" width="10" height="14" rx="2" fill={colors.accent} opacity="0.2" />
      {/* Button */}
      <Circle cx="47" cy="66" r="4" fill="#F44336" />
      {/* Wheels */}
      <Circle cx="38" cy="80" r="3" fill="#444" />
      <Circle cx="56" cy="80" r="3" fill="#444" />
    </Svg>
  );
}

function PrinterSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="86" rx="28" ry="4" fill="rgba(0,0,0,0.15)" />
      {/* Body */}
      <Rect x="14" y="38" width="58" height="34" rx="4" fill={colors.primary} />
      <Path d="M72 38 L84 32 L84 66 L72 72 Z" fill={colors.secondary} />
      <Path d="M14 38 L26 32 L84 32 L72 38 Z" fill={colors.accent} opacity="0.7" />
      {/* Paper tray top */}
      <Rect x="24" y="18" width="40" height="20" rx="2" fill="#fff" opacity="0.7" />
      <Rect x="26" y="20" width="36" height="16" fill="#f5f5f5" />
      {/* Paper output */}
      <Rect x="24" y="68" width="40" height="14" rx="2" fill="#fff" opacity="0.8" />
      {/* Text on paper */}
      <Rect x="30" y="72" width="20" height="1.5" rx="0.5" fill="#999" />
      <Rect x="30" y="76" width="14" height="1.5" rx="0.5" fill="#999" />
      {/* Control panel */}
      <Rect x="56" y="44" width="10" height="18" rx="2" fill="#333" />
      <Circle cx="61" cy="50" r="2.5" fill="#4CAF50" />
      <Rect x="58" y="56" width="6" height="3" rx="1" fill="#666" />
    </Svg>
  );
}

function SpeakerSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="90" rx="14" ry="3" fill="rgba(0,0,0,0.15)" />
      {/* Body */}
      <Rect x="32" y="14" width="28" height="72" rx="8" fill={colors.primary} />
      <Path d="M60 14 L68 10 L68 82 L60 86 Z" fill={colors.secondary} />
      {/* Top face */}
      <Ellipse cx="46" cy="14" rx="14" ry="4" fill={colors.accent} opacity="0.7" />
      {/* Speaker cone top */}
      <Circle cx="46" cy="34" r="10" fill="#222" />
      <Circle cx="46" cy="34" r="7" fill="#333" />
      <Circle cx="46" cy="34" r="3" fill="#444" />
      {/* Speaker cone bottom */}
      <Circle cx="46" cy="60" r="6" fill="#222" />
      <Circle cx="46" cy="60" r="4" fill="#333" />
      <Circle cx="46" cy="60" r="2" fill="#444" />
      {/* Sound waves */}
      <Path d="M66 30 Q72 38 66 46" fill="none" stroke={colors.accent} strokeWidth="1.5" opacity="0.3" />
      <Path d="M70 26 Q78 38 70 50" fill="none" stroke={colors.accent} strokeWidth="1.5" opacity="0.2" />
      {/* LED */}
      <Circle cx="46" cy="76" r="2" fill="#4CAF50" />
    </Svg>
  );
}

function TabletSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="88" rx="24" ry="4" fill="rgba(0,0,0,0.1)" />
      {/* Body */}
      <Rect x="18" y="12" width="52" height="72" rx="6" fill={colors.primary} />
      <Path d="M70 12 L78 8 L78 80 L70 84 Z" fill={colors.secondary} />
      {/* Screen */}
      <Rect x="22" y="18" width="44" height="60" rx="3" fill="#0d1b2a" />
      <Rect x="24" y="20" width="40" height="56" rx="2" fill="#1a237e" opacity="0.5" />
      {/* Screen content */}
      <Rect x="28" y="28" width="24" height="3" rx="1" fill="rgba(255,255,255,0.1)" />
      <Rect x="28" y="36" width="32" height="3" rx="1" fill="rgba(255,255,255,0.08)" />
      <Rect x="28" y="44" width="18" height="3" rx="1" fill="rgba(255,255,255,0.06)" />
      {/* Home button */}
      <Circle cx="44" cy="80" r="3" fill="#333" />
      {/* Camera */}
      <Circle cx="44" cy="15" r="1.5" fill="#333" />
    </Svg>
  );
}

function IronSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="50" cy="82" rx="30" ry="5" fill="rgba(0,0,0,0.15)" />
      {/* Soleplate */}
      <Path d="M20 70 L80 70 L60 78 L20 78 Z" fill="#999" />
      {/* Body */}
      <Path d="M20 40 L80 40 L80 70 L20 70 Z" fill={colors.primary} />
      <Path d="M80 40 L86 36 L86 66 L80 70 Z" fill={colors.secondary} />
      {/* Handle */}
      <Path d="M28 26 Q32 18 60 18 Q68 18 72 26 L72 40 L28 40 Z" fill={colors.secondary} />
      <Rect x="36" y="22" width="24" height="6" rx="3" fill="#666" />
      {/* Steam vents */}
      {[0, 1, 2, 3, 4].map(i => (
        <Circle key={i} cx={30 + i * 10} cy="74" r="1.5" fill="#666" opacity="0.4" />
      ))}
      {/* Temperature dial */}
      <Circle cx="50" cy="50" r="6" fill="#555" stroke="#666" strokeWidth="0.8" />
      <Path d="M50 46 L50 50" stroke="#FF6B35" strokeWidth="1.5" />
      {/* Steam */}
      <Path d="M30 14 Q32 8 34 14" fill="none" stroke="#ccc" strokeWidth="1" opacity="0.3" />
      <Path d="M46 12 Q48 6 50 12" fill="none" stroke="#ccc" strokeWidth="1" opacity="0.3" />
    </Svg>
  );
}

function ElectricKettleSVG({ size, colors }: { size: number; colors: ReturnType<typeof getColors> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx="48" cy="90" rx="18" ry="3" fill="rgba(0,0,0,0.15)" />
      {/* Base */}
      <Ellipse cx="46" cy="84" rx="18" ry="5" fill={colors.secondary} />
      {/* Body */}
      <Path d="M28 30 Q28 84 28 80 L64 80 Q64 84 64 30" fill={colors.primary} />
      <Rect x="28" y="30" width="36" height="50" rx="2" fill={colors.primary} />
      {/* Water window */}
      <Rect x="56" y="40" width="4" height="30" rx="2" fill="#4FC3F7" opacity="0.3" />
      <Rect x="56" y="55" width="4" height="15" rx="2" fill="#4FC3F7" opacity="0.5" />
      {/* Handle */}
      <Path d="M64 34 Q74 34 74 48 Q74 62 64 62" fill="none" stroke={colors.secondary} strokeWidth="5" />
      {/* Lid */}
      <Ellipse cx="46" cy="30" rx="18" ry="5" fill={colors.accent} opacity="0.7" />
      <Rect x="42" y="24" width="8" height="6" rx="4" fill={colors.secondary} />
      {/* Spout */}
      <Path d="M28 36 L22 32 L22 36 L28 40" fill={colors.secondary} />
      {/* Steam */}
      <Path d="M38 20 Q40 14 42 20" fill="none" stroke="#ccc" strokeWidth="1" opacity="0.3" />
      <Path d="M48 18 Q50 12 52 18" fill="none" stroke="#ccc" strokeWidth="1" opacity="0.3" />
      {/* Button */}
      <Rect x="40" y="72" width="12" height="4" rx="2" fill="#4CAF50" opacity="0.6" />
    </Svg>
  );
}

// -- Map category to SVG component --
function getApplianceSVG(category: string, size: number, colors: ReturnType<typeof getColors>) {
  const cat = category.trim();
  const cl = cat.toLowerCase();
  // Use includes for fuzzy matching
  if (cl.includes('toaster')) return <ToasterSVG size={size} colors={colors} />;
  if (cl.includes('refrigerator') || cl.includes('fridge')) return <RefrigeratorSVG size={size} colors={colors} />;
  if (cl.includes('television') || cl === 'tv') return <TelevisionSVG size={size} colors={colors} />;
  if (cl.includes('laptop')) return <LaptopSVG size={size} colors={colors} />;
  if (cl.includes('monitor') || cl.includes('display')) return <MonitorSVG size={size} colors={colors} />;
  if (cl.includes('microwave')) return <MicrowaveSVG size={size} colors={colors} />;
  if (cl.includes('oven') || cl.includes('stove') || cl.includes('range')) return <OvenSVG size={size} colors={colors} />;
  if (cl.includes('washing') || cl.includes('washer')) return <WashingMachineSVG size={size} colors={colors} />;
  if (cl.includes('dryer') && !cl.includes('hair')) return <DryerSVG size={size} colors={colors} />;
  if (cl.includes('hair dryer') || cl.includes('hair')) return <HairDryerSVG size={size} colors={colors} />;
  if (cl.includes('air conditioner') || cl.includes('hvac') || cl.includes('ac unit')) return <AirConditionerSVG size={size} colors={colors} />;
  if (cl.includes('heater') && cl.includes('water')) return <WaterHeaterSVG size={size} colors={colors} />;
  if (cl.includes('heater') || cl.includes('space heater')) return <SpaceHeaterSVG size={size} colors={colors} />;
  if (cl.includes('fan')) return <FanSVG size={size} colors={colors} />;
  if (cl.includes('light') || cl.includes('lamp') || cl.includes('bulb')) return <LampSVG size={size} colors={colors} />;
  if (cl.includes('router') || cl.includes('wifi') || cl.includes('modem')) return <RouterSVG size={size} colors={colors} />;
  if (cl.includes('gaming') || cl.includes('console') || cl.includes('xbox') || cl.includes('playstation')) return <GamingConsoleSVG size={size} colors={colors} />;
  if (cl.includes('dishwasher')) return <DishwasherSVG size={size} colors={colors} />;
  if (cl.includes('coffee')) return <CoffeeMakerSVG size={size} colors={colors} />;
  if (cl.includes('blender')) return <BlenderSVG size={size} colors={colors} />;
  if (cl.includes('charger') || cl.includes('phone')) return <PhoneChargerSVG size={size} colors={colors} />;
  if (cl.includes('vacuum')) return <VacuumSVG size={size} colors={colors} />;
  if (cl.includes('printer')) return <PrinterSVG size={size} colors={colors} />;
  if (cl.includes('speaker')) return <SpeakerSVG size={size} colors={colors} />;
  if (cl.includes('tablet') || cl.includes('ipad')) return <TabletSVG size={size} colors={colors} />;
  if (cl.includes('iron')) return <IronSVG size={size} colors={colors} />;
  if (cl.includes('kettle')) return <ElectricKettleSVG size={size} colors={colors} />;
  return <DefaultApplianceSVG size={size} colors={colors} icon="🔌" />;
}

const CATEGORY_ICONS: Record<string, string> = {
  'Television': '📺', 'TV': '📺', 'Laptop': '💻', 'Monitor': '🖥️', 'Display': '🖥️',
  'Microwave': '🍿', 'Oven': '🍳', 'Stove': '🍳', 'Range': '🍳', 'Toaster': '🍞',
  'Refrigerator': '🧊', 'Fridge': '🧊', 'Hair Dryer': '💨',
  'Phone Charger': '🔌', 'Charger': '🔌', 'Washing Machine': '🫧', 'Dryer': '👕',
  'Air Conditioner': '❄️', 'Space Heater': '🔥', 'Heater': '🔥',
  'Light Bulb': '💡', 'Lamp': '💡', 'Dishwasher': '🍽️',
  'Gaming Console': '🎮', 'Router': '📡', 'Fan': '🌀',
  'Water Heater': '🚿', 'Coffee Maker': '☕', 'Blender': '🥤',
  'Vacuum': '🧹', 'Printer': '🖨️', 'Speaker': '🔊', 'Smart Speaker': '🔊',
  'Tablet': '📱', 'Iron': '👔', 'Electric Kettle': '🫖', 'Kettle': '🫖',
};

export function Appliance3DModel({ category, size = 100, showLabel = true, color }: Props) {
  const colors = color
    ? { primary: color, secondary: color, accent: color }
    : getColors(category);

  return (
    <View style={styles.wrapper}>
      {getApplianceSVG(category, size, colors)}
      {showLabel && (
        <Text style={[styles.label, { fontSize: size * 0.11 }]} numberOfLines={1}>
          {category}
        </Text>
      )}
    </View>
  );
}

// Export for use in other components
export { getColors as getApplianceColors, CATEGORY_ICONS as APPLIANCE_ICONS };

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
});
