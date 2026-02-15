/**
 * HomeViewerScreen — Interactive 3D home viewer with agent command bar
 *
 * Features:
 *  - Perspective-rendered room with device models
 *  - Tap device → slide-up detail panel with watts, costs, actions
 *  - Agent command input box ("turn off X", "optimize energy")
 *  - Room tabs + energy summary header
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  Dimensions, ActivityIndicator, Platform, Animated,
  TextInput, KeyboardAvoidingView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../App';
import {
  listDevices, Device, getHomeSummary, HomeSummary,
  getHome, Home, sendAgentCommand, AgentCommandResult,
  ActionProposal, getScene, HomeScene, RoomModel,
} from '../services/apiClient';
import { Scene3D } from '../components/Scene3D';
import { Appliance3DModel } from '../components/Appliance3DModel';
import { House3DViewer } from '../components/House3DViewer';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  homeId: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

const DEVICE_ICONS: Record<string, string> = {
  'Television': '📺', 'TV': '📺', 'Laptop': '💻', 'Monitor': '🖥️',
  'Microwave': '🍿', 'Oven': '🍳', 'Toaster': '🍞',
  'Refrigerator': '🧊', 'Fridge': '🧊', 'Hair Dryer': '💨',
  'Phone Charger': '🔌', 'Clock': '⏰', 'Computer Peripheral': '🖱️',
  'Washing Machine': '🫧', 'Dryer': '👕', 'Air Conditioner': '❄️',
  'Space Heater': '🔥', 'Light Bulb': '💡', 'Lamp': '💡',
  'Dishwasher': '🍽️', 'Gaming Console': '🎮', 'Router': '📡',
  'Fan': '🌀', 'Water Heater': '🚿',
};

const DEVICE_COLORS: Record<string, string> = {
  'Television': '#2196F3', 'TV': '#2196F3', 'Laptop': '#4CAF50',
  'Monitor': '#00BCD4', 'Microwave': '#FF9800', 'Oven': '#F44336',
  'Toaster': '#FF5722', 'Refrigerator': '#03A9F4', 'Fridge': '#03A9F4',
  'Washing Machine': '#9C27B0', 'Dryer': '#E91E63', 'Air Conditioner': '#00BCD4',
  'Space Heater': '#FF5722', 'Light Bulb': '#FFC107', 'Lamp': '#FFC107',
  'Gaming Console': '#673AB7', 'Router': '#607D8B', 'Fan': '#009688',
};

const ROOM_LAYOUTS: Record<string, { name: string; color: string }> = {
  'living-room': { name: 'Living Room', color: '#1a472a' },
  'bedroom': { name: 'Bedroom', color: '#2a1a47' },
  'kitchen': { name: 'Kitchen', color: '#47381a' },
  'bathroom': { name: 'Bathroom', color: '#1a3847' },
  'office': { name: 'Office', color: '#1a2a47' },
  'garage': { name: 'Garage', color: '#3a3a1a' },
  'laundry': { name: 'Laundry', color: '#471a38' },
};

function getDeviceIcon(category: string): string {
  return DEVICE_ICONS[category] ?? '🔌';
}

function getDeviceColor(category: string): string {
  return DEVICE_COLORS[category] ?? '#888888';
}

// ---------------------------------------------------------------------------
// 3D-style Room View (Perspective CSS)
// ---------------------------------------------------------------------------
function Room3DView({
  devices, selectedDevice, onSelectDevice, isDark, colors, roomId,
}: {
  devices: Device[];
  selectedDevice: Device | null;
  onSelectDevice: (d: Device | null) => void;
  isDark: boolean;
  colors: any;
  roomId: string;
}) {
  const roomInfo = ROOM_LAYOUTS[roomId] || { name: roomId, color: isDark ? '#1a1a2a' : '#e0e0f0' };

  // Position devices in a grid inside the room
  const devicePositions = useMemo(() => {
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(devices.length))));
    return devices.map((d, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const spacing = 80 / (cols + 1);
      return {
        device: d,
        left: spacing * (col + 1),
        top: 20 + (row * 22),
      };
    });
  }, [devices]);

  return (
    <View style={[styles.room3d, { backgroundColor: roomInfo.color + '40' }]}>
      {/* Room perspective container */}
      <View style={[styles.roomPerspective, {
        borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
      }]}>
        {/* Floor */}
        <View style={[styles.roomFloor, {
          backgroundColor: isDark ? '#0d0d1a' : '#d0d0e0',
        }]} />

        {/* Back wall */}
        <View style={[styles.roomWallBack, {
          backgroundColor: isDark ? roomInfo.color : roomInfo.color + '60',
        }]}>
          <Text style={[styles.roomLabel, { color: 'rgba(255,255,255,0.5)' }]}>
            {roomInfo.name}
          </Text>
        </View>

        {/* Left wall */}
        <View style={[styles.roomWallLeft, {
          backgroundColor: isDark ? roomInfo.color + 'CC' : roomInfo.color + '40',
        }]} />

        {/* Right wall */}
        <View style={[styles.roomWallRight, {
          backgroundColor: isDark ? roomInfo.color + 'AA' : roomInfo.color + '30',
        }]} />

        {/* Devices positioned in the room */}
        {devicePositions.map(({ device, left, top }) => {
          const isSelected = selectedDevice?.id === device.id;
          const color = getDeviceColor(device.category);
          return (
            <TouchableOpacity
              key={device.id}
              style={[styles.device3d, {
                left: `${left}%` as any,
                top: `${top}%` as any,
                backgroundColor: color,
                borderColor: isSelected ? '#fff' : 'transparent',
                borderWidth: isSelected ? 2 : 0,
                transform: [
                  { perspective: 600 },
                  { rotateX: '-5deg' },
                  { scale: isSelected ? 1.15 : 1 },
                ] as any,
                shadowColor: color,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
                elevation: isSelected ? 12 : 6,
              }]}
              onPress={() => onSelectDevice(isSelected ? null : device)}
              activeOpacity={0.7}
            >
              <Appliance3DModel category={device.category} size={42} showLabel={false} />
              <Text style={styles.device3dLabel} numberOfLines={1}>{device.label}</Text>
              {device.power.standby_watts_typical > 1 && (
                <View style={styles.device3dGhost}>
                  <Text style={styles.device3dGhostText}>
                    👻 {device.power.standby_watts_typical}W
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {devices.length === 0 && (
          <View style={styles.emptyRoom}>
            <Text style={{ fontSize: 40 }}>🏠</Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>
              No devices in this room
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Device Detail Panel
// ---------------------------------------------------------------------------
function DeviceDetailPanel({
  device, isDark, colors, onClose, onAction,
}: {
  device: Device;
  isDark: boolean;
  colors: any;
  onClose: () => void;
  onAction: (action: string) => void;
}) {
  const annualKwh = (device.power.active_watts_typical * device.active_hours_per_day +
    device.power.standby_watts_typical * (24 - device.active_hours_per_day)) * 365 / 1000;
  const annualCost = annualKwh * 0.30;
  const annualCo2 = annualKwh * 0.25;
  const ghostCost = (device.power.standby_watts_typical * (24 - device.active_hours_per_day) * 365 / 1000) * 0.30;

  return (
    <Animated.View style={[styles.detailPanel, {
      backgroundColor: isDark ? '#111122' : '#ffffff',
      borderTopColor: colors.border,
    }]}>
      <View style={styles.detailHeader}>
        <View style={styles.detailTitleRow}>
          <Appliance3DModel category={device.category} size={48} showLabel={false} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.detailName, { color: colors.text }]}>{device.label}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {device.brand !== 'Unknown' ? `${device.brand} · ` : ''}{device.category}
              {device.is_critical ? ' · 🔒 Critical' : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={{ color: colors.textSecondary, fontSize: 20 }}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(76,175,80,0.1)' : '#e8f5e9' }]}>
          <Text style={[styles.statValue, { color: '#4CAF50' }]}>
            {device.power.active_watts_typical}W
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Active</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(255,152,0,0.1)' : '#fff3e0' }]}>
          <Text style={[styles.statValue, { color: '#FF9800' }]}>
            {device.power.standby_watts_typical}W
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Standby 👻</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(33,150,243,0.1)' : '#e3f2fd' }]}>
          <Text style={[styles.statValue, { color: '#2196F3' }]}>
            ${annualCost.toFixed(0)}/yr
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Cost</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(244,67,54,0.1)' : '#ffebee' }]}>
          <Text style={[styles.statValue, { color: '#F44336' }]}>
            ${ghostCost.toFixed(0)}/yr
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Ghost $</Text>
        </View>
      </View>

      <View style={styles.infoRow}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          📊 {annualKwh.toFixed(0)} kWh/yr · 🌿 {annualCo2.toFixed(1)} kg CO₂/yr · ⏱ {device.active_hours_per_day}h/day
        </Text>
      </View>

      <View style={styles.actionButtons}>
        {!device.is_critical && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#F44336' }]}
            onPress={() => onAction('turn_off')}
          >
            <Text style={styles.actionBtnText}>⏻ Turn Off</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#FF9800' }]}
          onPress={() => onAction('schedule')}
        >
          <Text style={styles.actionBtnText}>⏰ Schedule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#4CAF50' }]}
          onPress={() => onAction('eco_mode')}
        >
          <Text style={styles.actionBtnText}>🌿 Eco Mode</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Agent Command Bar
// ---------------------------------------------------------------------------
function AgentCommandBar({
  homeId, isDark, colors, onResult,
}: {
  homeId: string;
  isDark: boolean;
  colors: any;
  onResult: (result: AgentCommandResult) => void;
}) {
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!command.trim() || loading) return;
    setLoading(true);
    try {
      const result = await sendAgentCommand(homeId, command.trim());
      onResult(result);
      setCommand('');
    } catch (e: any) {
      onResult({
        intent: 'error',
        message: e.message || 'Agent command failed',
        proposals: [],
        executed: [],
        auto_executed: false,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.agentBar, {
      backgroundColor: isDark ? '#0d0d1a' : '#f5f5f5',
      borderTopColor: colors.border,
    }]}>
      <View style={styles.agentInputRow}>
        <TextInput
          style={[styles.agentInput, {
            backgroundColor: isDark ? '#1a1a2e' : '#fff',
            color: colors.text,
            borderColor: colors.border,
          }]}
          placeholder='💬 "turn off unused" or "optimize energy"'
          placeholderTextColor={colors.textSecondary}
          value={command}
          onChangeText={setCommand}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.agentSendBtn, {
            backgroundColor: command.trim() ? colors.accent : '#666',
          }]}
          onPress={handleSend}
          disabled={!command.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>⚡</Text>
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.quickActions}>
        {['Optimize energy', 'Turn off unused', 'Schedule night off'].map(q => (
          <TouchableOpacity
            key={q}
            style={[styles.quickChip, { backgroundColor: isDark ? '#1a1a2e' : '#e8e8e8' }]}
            onPress={() => { setCommand(q); }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{q}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Agent Result Toast
// ---------------------------------------------------------------------------
function AgentResultToast({
  result, isDark, colors, onDismiss,
}: {
  result: AgentCommandResult;
  isDark: boolean;
  colors: any;
  onDismiss: () => void;
}) {
  return (
    <View style={[styles.agentToast, {
      backgroundColor: isDark ? '#1a2a1a' : '#e8f5e9',
      borderColor: colors.accent,
    }]}>
      <View style={styles.toastHeader}>
        <Text style={[styles.toastTitle, { color: colors.text }]}>
          {result.auto_executed ? '✅ Actions Executed' : '💡 Proposals Ready'}
        </Text>
        <TouchableOpacity onPress={onDismiss}>
          <Text style={{ color: colors.textSecondary }}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>
        {result.message}
      </Text>
      {result.proposals.slice(0, 3).map((p: ActionProposal, i: number) => (
        <View key={i} style={[styles.toastAction, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
          <Text style={{ color: colors.text, fontSize: 13 }}>
            {p.action_type === 'turn_off' ? '⏻' : p.action_type === 'schedule' ? '⏰' : '🌿'}{' '}
            {p.label}: {p.rationale?.slice(0, 60)}
          </Text>
          <Text style={{ color: colors.accent, fontSize: 12, marginTop: 2 }}>
            💰 ${p.estimated_annual_dollars_saved?.toFixed(2)}/yr
          </Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function HomeViewerScreen({ homeId, onBack }: Props) {
  const { colors, isDark } = useTheme();

  const [home, setHome] = useState<Home | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [scene, setScene] = useState<HomeScene | null>(null);
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [agentResult, setAgentResult] = useState<AgentCommandResult | null>(null);
  const [viewMode, setViewMode] = useState<'3d' | 'room'>('3d');

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [h, devs, sc] = await Promise.all([
        getHome(homeId),
        listDevices(homeId),
        getScene(homeId).catch(() => null),
      ]);
      setHome(h);
      setDevices(devs);
      if (sc) setScene(sc);
      // Default to first room
      if (h.rooms?.length > 0 && !selectedRoom) {
        const firstRoom = h.rooms[0];
        setSelectedRoom(typeof firstRoom === 'string' ? firstRoom : firstRoom.roomId);
      }
      try {
        const sum = await getHomeSummary(homeId);
        setSummary(sum);
      } catch { /* summary is optional */ }
    } catch (e) {
      console.error('Failed to load home data:', e);
    } finally {
      setLoading(false);
    }
  }, [homeId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Refetch when screen gains focus (e.g., after adding device)
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Devices in selected room
  const roomDevices = useMemo(() =>
    devices.filter(d => !selectedRoom || d.roomId === selectedRoom),
    [devices, selectedRoom]
  );

  // All rooms (structured RoomModel objects)
  const rooms: RoomModel[] = useMemo(() => {
    if (home?.rooms && home.rooms.length > 0) {
      // Home has structured rooms
      return home.rooms as RoomModel[];
    }
    // Fallback: derive from device roomIds
    const fromDevices = [...new Set(devices.map(d => d.roomId))];
    return fromDevices.map(rid => ({ roomId: rid, name: rid.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }));
  }, [home, devices]);

  const handleDeviceAction = useCallback(async (action: string) => {
    if (!selectedDevice) return;
    try {
      const result = await sendAgentCommand(homeId, `${action} ${selectedDevice.label}`);
      setAgentResult(result);
      setTimeout(loadData, 500);
    } catch (e: any) {
      console.error('Action failed:', e);
    }
  }, [homeId, selectedDevice, loadData]);

  const handleAgentResult = useCallback((result: AgentCommandResult) => {
    setAgentResult(result);
    setTimeout(loadData, 500);
  }, [loadData]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Loading 3D Home...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBack}>
          <Text style={{ color: colors.accent, fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            🏠 {home?.name || 'My Home'}
          </Text>
          {summary && (
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
              {devices.length} devices · ${summary.totals.monthly_cost?.toFixed(0)}/mo · {summary.totals.annual_co2_kg?.toFixed(0)} kg CO₂/yr
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={loadData} style={styles.headerAction}>
          <Text style={{ fontSize: 18 }}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Room tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roomTabs}>
        <TouchableOpacity
          style={[styles.roomTab, {
            backgroundColor: !selectedRoom ? colors.accent : (isDark ? '#222' : '#eee'),
          }]}
          onPress={() => setSelectedRoom('')}
        >
          <Text style={{
            color: !selectedRoom ? '#fff' : colors.text,
            fontWeight: '600', fontSize: 12,
          }}>All Rooms</Text>
        </TouchableOpacity>
        {rooms.map(r => (
          <TouchableOpacity
            key={r.roomId}
            style={[styles.roomTab, {
              backgroundColor: selectedRoom === r.roomId ? colors.accent : (isDark ? '#222' : '#eee'),
            }]}
            onPress={() => setSelectedRoom(r.roomId)}
          >
            <Text style={{
              color: selectedRoom === r.roomId ? '#fff' : colors.text,
              fontWeight: '600', fontSize: 12,
            }}>
              {r.name}
              {' '}({devices.filter(d => d.roomId === r.roomId).length})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* View Mode Toggle */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
        <TouchableOpacity
          style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
            backgroundColor: viewMode === '3d' ? colors.accent : (isDark ? '#222' : '#eee') }}
          onPress={() => setViewMode('3d')}
        >
          <Text style={{ color: viewMode === '3d' ? '#fff' : colors.text, fontWeight: '600', fontSize: 12 }}>🏠 3D House</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
            backgroundColor: viewMode === 'room' ? colors.accent : (isDark ? '#222' : '#eee') }}
          onPress={() => setViewMode('room')}
        >
          <Text style={{ color: viewMode === 'room' ? '#fff' : colors.text, fontWeight: '600', fontSize: 12 }}>📐 Room View</Text>
        </TouchableOpacity>
      </View>

      {/* 3D Views */}
      <View style={{ flex: 1 }}>
        {viewMode === '3d' ? (
          <House3DViewer
            rooms={rooms}
            devices={devices.map(d => ({ label: d.label, category: d.category, roomId: d.roomId }))}
            isDark={isDark}
            height={SCREEN_H - 280}
          />
        ) : scene && scene.objects && scene.objects.length > 0 ? (
          <Scene3D
            scene={scene}
            selectedRoomId={selectedRoom}
            height={300}
            onDevicePress={(deviceId: string) => {
              const device = devices.find(d => d.id === deviceId);
              if (device) setSelectedDevice(device);
            }}
          />
        ) : (
          <Room3DView
            devices={roomDevices}
            selectedDevice={selectedDevice}
            onSelectDevice={setSelectedDevice}
            isDark={isDark}
            colors={colors}
            roomId={selectedRoom || 'living-room'}
          />
        )}
      </View>

      {/* Agent Result Toast */}
      {agentResult && (
        <AgentResultToast
          result={agentResult}
          isDark={isDark}
          colors={colors}
          onDismiss={() => setAgentResult(null)}
        />
      )}

      {/* Device Detail Panel (slide up) */}
      {selectedDevice && (
        <DeviceDetailPanel
          device={selectedDevice}
          isDark={isDark}
          colors={colors}
          onClose={() => setSelectedDevice(null)}
          onAction={handleDeviceAction}
        />
      )}

      {/* Agent Command Bar */}
      <AgentCommandBar
        homeId={homeId}
        isDark={isDark}
        colors={colors}
        onResult={handleAgentResult}
      />
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'web' ? 16 : 50,
    paddingBottom: 10, borderBottomWidth: 1,
  },
  headerBack: { width: 70 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerAction: { width: 40, alignItems: 'flex-end' },
  roomTabs: {
    flexGrow: 0, paddingHorizontal: 12, paddingVertical: 8,
  },
  roomTab: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, marginRight: 8,
  },

  // 3D Room
  room3d: {
    flex: 1, margin: 12, borderRadius: 16, overflow: 'hidden',
  },
  roomPerspective: {
    flex: 1, position: 'relative', borderWidth: 1, borderRadius: 16,
    overflow: 'hidden',
  },
  roomFloor: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%',
  },
  roomWallBack: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '45%',
    justifyContent: 'center', alignItems: 'center',
  },
  roomWallLeft: {
    position: 'absolute', top: 0, left: 0, bottom: 0, width: '8%',
  },
  roomWallRight: {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: '8%',
  },
  roomLabel: {
    fontSize: 14, fontWeight: '600', letterSpacing: 2,
    textTransform: 'uppercase',
  },
  emptyRoom: {
    position: 'absolute', top: '40%', left: 0, right: 0,
    alignItems: 'center',
  } as any,

  // 3D Devices
  device3d: {
    position: 'absolute', width: 72, height: 72,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    marginLeft: -36, marginTop: -36,
  },
  device3dIcon: { fontSize: 24 },
  device3dLabel: {
    color: '#fff', fontSize: 9, fontWeight: '600',
    marginTop: 2, textAlign: 'center', maxWidth: 65,
  },
  device3dGhost: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: 'rgba(255,152,0,0.9)', borderRadius: 8,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  device3dGhostText: { color: '#fff', fontSize: 8, fontWeight: '700' },

  // Detail Panel
  detailPanel: {
    borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, paddingBottom: 8,
    ...(Platform.OS === 'web' ? { maxHeight: 280 } : {}),
  },
  detailHeader: { marginBottom: 12 },
  detailTitleRow: { flexDirection: 'row', alignItems: 'center' },
  detailIcon: { fontSize: 32 },
  detailName: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 4 },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10,
  },
  statCard: {
    flex: 1, minWidth: 70, padding: 10, borderRadius: 10, alignItems: 'center',
  },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 10, marginTop: 2 },
  infoRow: { marginBottom: 10 },
  actionButtons: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Agent Command Bar
  agentBar: {
    padding: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 10,
    borderTopWidth: 1,
  },
  agentInputRow: { flexDirection: 'row', gap: 8 },
  agentInput: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1, fontSize: 14,
  },
  agentSendBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  quickActions: {
    flexDirection: 'row', gap: 6, marginTop: 6,
  },
  quickChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },

  // Agent Result Toast
  agentToast: {
    margin: 12, padding: 14, borderRadius: 14, borderWidth: 1,
  },
  toastHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  toastTitle: { fontSize: 15, fontWeight: '700' },
  toastAction: {
    padding: 8, borderRadius: 8, marginBottom: 4,
  },
});
