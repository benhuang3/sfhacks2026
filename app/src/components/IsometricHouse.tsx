/**
 * IsometricHouse — Beautiful isometric 3D house visualization
 *
 * Pure SVG — works in Expo Go, no WebGL needed.
 * Shows a house with rooms and placed appliance icons.
 */

import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
} from 'react-native';
import Svg, {
  Rect, Path, G, Defs, LinearGradient, Stop,
  Polygon, Circle, Line, Text as SvgText,
} from 'react-native-svg';
import { Appliance3DModel } from './Appliance3DModel';

const { width: SCREEN_W } = Dimensions.get('window');

interface Device {
  id: string;
  category: string;
  label: string;
  roomId?: string;
  power?: { active_watts_typical?: number; standby_watts_typical?: number };
}

interface Room {
  roomId: string;
  name: string;
}

interface Props {
  devices: Device[];
  rooms: Room[];
  selectedRoom?: string;
  onSelectRoom?: (roomId: string) => void;
  onDevicePress?: (device: Device) => void;
  height?: number;
  isDark?: boolean;
}

// Room colors for isometric rendering
const ROOM_PALETTE: Record<string, { floor: string; wallL: string; wallR: string }> = {
  'living-room': { floor: '#1a3a2a', wallL: '#1e4432', wallR: '#16302a' },
  'bedroom':     { floor: '#2a1a3a', wallL: '#342044', wallR: '#221630' },
  'kitchen':     { floor: '#3a2a1a', wallL: '#443420', wallR: '#302216' },
  'bathroom':    { floor: '#1a2a3a', wallL: '#203444', wallR: '#162230' },
  'office':      { floor: '#1a2040', wallL: '#202a4a', wallR: '#161a36' },
  'garage':      { floor: '#2a2a1a', wallL: '#343420', wallR: '#2a2a16' },
  'laundry':     { floor: '#3a1a2a', wallL: '#442034', wallR: '#301622' },
};

const DEVICE_ICONS: Record<string, string> = {
  'Television': '📺', 'TV': '📺', 'Laptop': '💻', 'Monitor': '🖥️',
  'Microwave': '🍿', 'Oven': '🍳', 'Toaster': '🍞',
  'Refrigerator': '🧊', 'Fridge': '🧊', 'Hair Dryer': '💨',
  'Phone Charger': '🔌', 'Washing Machine': '🫧', 'Dryer': '👕',
  'Air Conditioner': '❄️', 'Space Heater': '🔥',
  'Light Bulb': '💡', 'Lamp': '💡', 'Dishwasher': '🍽️',
  'Gaming Console': '🎮', 'Router': '📡', 'Fan': '🌀',
  'Water Heater': '🚿',
};

function getIcon(cat: string): string {
  return DEVICE_ICONS[cat] ?? '🔌';
}

function getRoomColors(roomId: string) {
  return ROOM_PALETTE[roomId] ?? { floor: '#1a2830', wallL: '#204038', wallR: '#16302a' };
}

/**
 * Isometric house SVG with roof, walls, and window details
 */
function HouseSVG({ width: w, height: h, isDark }: { width: number; height: number; isDark: boolean }) {
  const wallColor = isDark ? '#1a2030' : '#d0dce0';
  const wallSide = isDark ? '#141a28' : '#b0c0c8';
  const roofMain = isDark ? '#2d4a2d' : '#4CAF50';
  const roofSide = isDark ? '#1e3520' : '#388E3C';
  const roofEdge = isDark ? '#3d6a3d' : '#66BB6A';

  return (
    <Svg width={w} height={h} viewBox="0 0 400 280">
      <Defs>
        <LinearGradient id="hWall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={wallColor} />
          <Stop offset="1" stopColor={wallSide} />
        </LinearGradient>
        <LinearGradient id="hRoof" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={roofEdge} />
          <Stop offset="1" stopColor={roofMain} />
        </LinearGradient>
      </Defs>

      {/* Ground shadow */}
      <Polygon points="60,250 200,280 340,250 200,220" fill="rgba(0,0,0,0.15)" />

      {/* Front wall */}
      <Polygon points="60,110 200,150 200,250 60,210" fill="url(#hWall)" />

      {/* Right wall */}
      <Polygon points="200,150 340,110 340,210 200,250" fill={wallSide} />

      {/* Windows front */}
      <Rect x="90" y="140" width="30" height="30" rx="2" fill={isDark ? '#0d1a2e' : '#87CEEB'} opacity="0.7"
        transform="skewY(12)" />
      <Rect x="135" y="140" width="30" height="30" rx="2" fill={isDark ? '#0d1a2e' : '#87CEEB'} opacity="0.7"
        transform="skewY(12)" />

      {/* Door */}
      <Rect x="108" y="178" width="22" height="35" rx="2" fill={isDark ? '#2a1a0a' : '#8D6E63'}
        transform="skewY(12)" />
      <Circle cx="126" cy="210" r="2" fill="#FFD700" />

      {/* Windows right */}
      <Rect x="240" y="130" width="28" height="28" rx="2" fill={isDark ? '#0d1a2e' : '#87CEEB'} opacity="0.6"
        transform="skewY(-12)" />
      <Rect x="290" y="130" width="28" height="28" rx="2" fill={isDark ? '#0d1a2e' : '#87CEEB'} opacity="0.6"
        transform="skewY(-12)" />

      {/* Roof front */}
      <Polygon points="50,110 200,60 200,150 60,110" fill="url(#hRoof)" />

      {/* Roof right */}
      <Polygon points="200,60 350,110 340,110 200,150" fill={roofSide} />

      {/* Roof ridge line */}
      <Line x1="200" y1="60" x2="200" y2="150" stroke={roofEdge} strokeWidth="2" opacity="0.5" />

      {/* Chimney */}
      <Rect x="260" y="55" width="20" height="40" fill={isDark ? '#3a3a4a' : '#90A4AE'} />
      <Rect x="256" y="52" width="28" height="6" rx="2" fill={isDark ? '#4a4a5a' : '#B0BEC5'} />

      {/* Roof top accent */}
      <Line x1="50" y1="110" x2="200" y2="60" stroke={roofEdge} strokeWidth="3" />
      <Line x1="200" y1="60" x2="350" y2="110" stroke={roofSide} strokeWidth="3" />
    </Svg>
  );
}

export function IsometricHouse({
  devices,
  rooms,
  selectedRoom,
  onSelectRoom,
  onDevicePress,
  height = 360,
  isDark = true,
}: Props) {
  const displayDevices = useMemo(() => {
    if (selectedRoom) {
      return devices.filter(d => d.roomId === selectedRoom);
    }
    return devices.slice(0, 6); // Show first 6 on overview
  }, [devices, selectedRoom]);

  const selectedRoomName = useMemo(() => {
    if (!selectedRoom) return 'All Rooms';
    const room = rooms.find(r => r.roomId === selectedRoom);
    return room?.name ?? selectedRoom;
  }, [rooms, selectedRoom]);

  // Dynamic colors based on theme
  const tc = {
    containerBg: isDark ? '#0d0d1a' : '#ffffff',
    containerBorder: isDark ? 'rgba(255,255,255,0.08)' : '#e0e0e0',
    chipBg: isDark ? 'rgba(255,255,255,0.06)' : '#f0f0f0',
    chipBorder: isDark ? 'rgba(255,255,255,0.08)' : '#ddd',
    chipText: isDark ? 'rgba(255,255,255,0.5)' : '#666',
    cardBg: isDark ? 'rgba(255,255,255,0.04)' : '#f5f5f5',
    cardBorder: isDark ? 'rgba(255,255,255,0.06)' : '#e0e0e0',
    deviceName: isDark ? 'rgba(255,255,255,0.7)' : '#333',
    emptyText: isDark ? 'rgba(255,255,255,0.4)' : '#999',
    emptyHint: isDark ? 'rgba(255,255,255,0.25)' : '#bbb',
  };

  return (
    <View style={[styles.container, { height, backgroundColor: tc.containerBg, borderColor: tc.containerBorder }]}>
      {/* House visualization */}
      <View style={styles.houseWrapper}>
        <HouseSVG
          width={SCREEN_W - 48}
          height={180}
          isDark={isDark}
        />
      </View>

      {/* Room selector */}
      {rooms.length > 0 && (
        <View style={styles.roomSelector}>
          <TouchableOpacity
            style={[
              styles.roomChip,
              { backgroundColor: tc.chipBg, borderColor: tc.chipBorder },
              !selectedRoom && styles.roomChipActive,
            ]}
            onPress={() => onSelectRoom?.('')}
          >
            <Text style={[styles.roomChipText, { color: tc.chipText }, !selectedRoom && styles.roomChipTextActive]}>
              🏠 All
            </Text>
          </TouchableOpacity>
          {rooms.map(r => (
            <TouchableOpacity
              key={r.roomId}
              style={[
                styles.roomChip,
                { backgroundColor: tc.chipBg, borderColor: tc.chipBorder },
                selectedRoom === r.roomId && styles.roomChipActive,
              ]}
              onPress={() => onSelectRoom?.(r.roomId)}
            >
              <Text style={[
                styles.roomChipText,
                { color: tc.chipText },
                selectedRoom === r.roomId && styles.roomChipTextActive,
              ]}>
                {r.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Devices in room */}
      {displayDevices.length > 0 ? (
        <View style={styles.devicesRow}>
          {displayDevices.map(device => (
            <TouchableOpacity
              key={device.id}
              style={[styles.deviceCard, { backgroundColor: tc.cardBg, borderColor: tc.cardBorder }]}
              onPress={() => onDevicePress?.(device)}
              activeOpacity={0.7}
            >
              <Appliance3DModel
                category={device.category}
                size={56}
                showLabel={false}
              />
              <Text style={[styles.deviceName, { color: tc.deviceName }]} numberOfLines={1}>
                {device.label || device.category}
              </Text>
              {device.power?.active_watts_typical != null && (
                <Text style={styles.deviceWatts}>
                  {device.power.active_watts_typical}W
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.emptyDevices}>
          <Text style={[styles.emptyText, { color: tc.emptyText }]}>No devices yet</Text>
          <Text style={[styles.emptyHint, { color: tc.emptyHint }]}>Scan appliances to populate your home</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0d0d1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  houseWrapper: {
    alignItems: 'center',
    paddingTop: 12,
  },
  roomSelector: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    flexWrap: 'wrap',
  },
  roomChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  roomChipActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  roomChipText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
  },
  roomChipTextActive: {
    color: '#fff',
  },
  devicesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
    justifyContent: 'center',
  },
  deviceCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 10,
    minWidth: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  deviceName: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 76,
  },
  deviceWatts: {
    color: '#4CAF50',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  emptyDevices: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    marginTop: 4,
  },
});
