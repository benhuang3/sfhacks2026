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
  'Dishwasher':       { primary: '#8D6E63', secondary: '#6D4C41', accent: '#A1887F' },
  'Hair Dryer':       { primary: '#EC407A', secondary: '#D81B60', accent: '#F48FB1' },
  'Water Heater':     { primary: '#FF7043', secondary: '#E64A19', accent: '#FF8A65' },
  'Phone Charger':    { primary: '#66BB6A', secondary: '#43A047', accent: '#81C784' },
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

// -- Map category to SVG component --
function getApplianceSVG(category: string, size: number, colors: ReturnType<typeof getColors>) {
  const cat = category.trim();
  switch (cat) {
    case 'Toaster': return <ToasterSVG size={size} colors={colors} />;
    case 'Refrigerator':
    case 'Fridge': return <RefrigeratorSVG size={size} colors={colors} />;
    case 'Television':
    case 'TV': return <TelevisionSVG size={size} colors={colors} />;
    case 'Laptop': return <LaptopSVG size={size} colors={colors} />;
    case 'Monitor': return <TelevisionSVG size={size} colors={colors} />;
    case 'Microwave': return <MicrowaveSVG size={size} colors={colors} />;
    case 'Washing Machine': return <WashingMachineSVG size={size} colors={colors} />;
    case 'Dryer': return <WashingMachineSVG size={size} colors={colors} />;
    case 'Air Conditioner': return <AirConditionerSVG size={size} colors={colors} />;
    default: return <DefaultApplianceSVG size={size} colors={colors} icon="🔌" />;
  }
}

const CATEGORY_ICONS: Record<string, string> = {
  'Television': '📺', 'TV': '📺', 'Laptop': '💻', 'Monitor': '🖥️',
  'Microwave': '🍿', 'Oven': '🍳', 'Toaster': '🍞',
  'Refrigerator': '🧊', 'Fridge': '🧊', 'Hair Dryer': '💨',
  'Phone Charger': '🔌', 'Washing Machine': '🫧', 'Dryer': '👕',
  'Air Conditioner': '❄️', 'Space Heater': '🔥',
  'Light Bulb': '💡', 'Lamp': '💡', 'Dishwasher': '🍽️',
  'Gaming Console': '🎮', 'Router': '📡', 'Fan': '🌀',
  'Water Heater': '🚿',
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
