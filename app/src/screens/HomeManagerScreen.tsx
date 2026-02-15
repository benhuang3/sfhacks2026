/**
 * HomeManagerScreen — Create/manage homes and add devices
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { showAlert, showConfirm } from '../utils/alert';
import {
  createHome,
  listHomes,
  deleteHome,
  addDevice,
  listDevices,
  deleteDevice,
  type Home,
  type Device,
} from '../services/apiClient';
import { Appliance3DModel } from '../components/Appliance3DModel';
import { useTheme } from '../../App';
import { log } from '../utils/logger';

interface HomeManagerScreenProps {
  onBack: () => void;
  onViewSummary: (homeId: string) => void;
  onViewActions: (homeId: string) => void;
  userId?: string;
}

export function HomeManagerScreen({
  onBack,
  onViewSummary,
  onViewActions,
  userId = 'default_user',
}: HomeManagerScreenProps) {
  const { colors, isDark } = useTheme();
  const [homes, setHomes] = useState<Home[]>([]);
  const [devices, setDevices] = useState<Record<string, Device[]>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newHomeName, setNewHomeName] = useState('');
  const [newHomeRooms, setNewHomeRooms] = useState('living-room, kitchen');
  const [showAddDevice, setShowAddDevice] = useState<string | null>(null);
  const [deviceForm, setDeviceForm] = useState({
    label: '',
    category: '',
    brand: '',
    model: '',
    roomId: 'living-room',
    is_critical: false,
  });
  const [addingDevice, setAddingDevice] = useState(false);

  const loadHomes = useCallback(async () => {
    log.home('Loading homes', { userId });
    try {
      setLoading(true);
      const h = await listHomes(userId);
      setHomes(h);
      log.home(`Loaded ${h.length} home(s)`);
      // Load devices for each home
      const devMap: Record<string, Device[]> = {};
      for (const home of h) {
        try {
          devMap[home.id] = await listDevices(home.id);
        } catch { devMap[home.id] = []; }
      }
      setDevices(devMap);
    } catch (err) {
      log.error('home', 'Failed to load homes', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadHomes(); }, [loadHomes]);

  // Refetch when screen gains focus (e.g., after adding device from scan)
  useFocusEffect(
    useCallback(() => {
      loadHomes();
    }, [loadHomes])
  );

  const handleCreateHome = async () => {
    if (!newHomeName.trim()) return;
    log.home('Create home pressed', { name: newHomeName });
    try {
      setCreating(true);
      const roomStrings = newHomeRooms.split(',').map(r => r.trim()).filter(Boolean);
      // Convert string array to RoomModel array
      const roomModels = (roomStrings.length ? roomStrings : ['living-room']).map(r => ({
        roomId: r.toLowerCase().replace(/\s+/g, '-'),
        name: r.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      }));
      await createHome(userId, newHomeName.trim(), roomModels);
      log.home('Home created', { name: newHomeName });
      setNewHomeName('');
      setNewHomeRooms('living-room, kitchen');
      await loadHomes();
    } catch (err: unknown) {
      log.error('home', 'Create home failed', err);
      showAlert('Error', err instanceof Error ? err.message : 'Failed to create home');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteHome = async (homeId: string) => {
    log.home('Delete home pressed', { homeId });
    showConfirm('Delete Home', 'This will delete the home and all its devices. Continue?', async () => {
      try {
        await deleteHome(homeId);
        log.home('Home deleted', { homeId });
        await loadHomes();
      } catch (err: any) {
        log.error('home', 'Delete home failed', err);
        showAlert('Error', err.message);
      }
    });
  };

  const handleAddDevice = async (homeId: string) => {
    if (!deviceForm.label.trim() || !deviceForm.category.trim()) {
      showAlert('Required', 'Label and category are required.');
      return;
    }
    log.home('Add device pressed', { homeId, label: deviceForm.label, category: deviceForm.category });
    try {
      setAddingDevice(true);
      await addDevice(homeId, {
        roomId: deviceForm.roomId || 'living-room',
        label: deviceForm.label.trim(),
        category: deviceForm.category.trim(),
        brand: deviceForm.brand.trim() || 'Unknown',
        model: deviceForm.model.trim() || 'Unknown',
        is_critical: deviceForm.is_critical,
      });
      log.home('Device added', { homeId, label: deviceForm.label });
      setDeviceForm({ label: '', category: '', brand: '', model: '', roomId: 'living-room', is_critical: false });
      setShowAddDevice(null);
      await loadHomes();
    } catch (err: unknown) {
      log.error('home', 'Add device failed', err);
      showAlert('Error', err instanceof Error ? err.message : 'Failed to add device');
    } finally {
      setAddingDevice(false);
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    log.home('Delete device pressed', { deviceId });
    try {
      await deleteDevice(deviceId);
      log.home('Device deleted', { deviceId });
      await loadHomes();
    } catch (err: unknown) {
      log.error('home', 'Delete device failed', err);
      showAlert('Error', err instanceof Error ? err.message : 'Failed to delete device');
    }
  };

  const getCategoryIcon = (cat: string): string => {
    const icons: Record<string, string> = {
      TV: 'tv-outline', Television: 'tv-outline', Refrigerator: 'snow-outline', Microwave: 'restaurant-outline',
      Laptop: 'laptop-outline', Oven: 'flame-outline', Toaster: 'cafe-outline', 'Hair Dryer': 'cut-outline',
      'Washing Machine': 'water-outline', Dryer: 'water-outline', 'Air Conditioner': 'snow-outline',
      'Space Heater': 'flame-outline', Monitor: 'desktop-outline', 'Light Bulb': 'bulb-outline', Light: 'bulb-outline',
    };
    return icons[cat] || 'power-outline';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { color: colors.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Homes</Text>
        <TouchableOpacity onPress={loadHomes} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { color: colors.accent }]}>↻</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Create Home */}
        <View style={[styles.createSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}><Ionicons name="add-circle-outline" size={16} color={colors.accent} /> Create Home</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0', color: colors.text, borderColor: colors.border }]}
            placeholder="Home name (e.g., My Apartment)"
            placeholderTextColor={colors.textSecondary}
            value={newHomeName}
            onChangeText={setNewHomeName}
          />
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0', color: colors.text, borderColor: colors.border }]}
            placeholder="Rooms (comma-separated)"
            placeholderTextColor={colors.textSecondary}
            value={newHomeRooms}
            onChangeText={setNewHomeRooms}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, (!newHomeName.trim() || creating) && styles.disabledBtn]}
            onPress={handleCreateHome}
            disabled={!newHomeName.trim() || creating}
          >
            {creating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Create Home</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading homes...</Text>
          </View>
        )}

        {/* Homes list */}
        {!loading && homes.length === 0 && (
          <View style={styles.emptyState}>
            <Image source={require('../../assets/home.png')} style={{ width: 48, height: 48, marginBottom: 12 }} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Homes Yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Create your first home above to start tracking energy.</Text>
          </View>
        )}

        {homes.map((home) => {
          const homeDevices = devices[home.id] || [];
          return (
            <View key={home.id} style={[styles.homeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.homeHeader}>
              <View style={{ flex: 1 }}>
                  <Text style={[styles.homeName, { color: colors.text }]}><Ionicons name="home-outline" size={16} color={colors.accent} /> {home.name}</Text>
                  <Text style={[styles.homeRooms, { color: colors.textSecondary }]}>{home.rooms.join(' • ')}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteHome(home.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={20} color="#F44336" />
                </TouchableOpacity>
              </View>

              {/* Devices */}
              <Text style={[styles.deviceCount, { color: colors.accent }]}>
                {homeDevices.length} device{homeDevices.length !== 1 ? 's' : ''}
              </Text>

              {homeDevices.map((d) => (
                <View key={d.id} style={[styles.deviceRow, { borderTopColor: colors.border }]}>
                  <View style={{ marginRight: 8 }}>
                    <Appliance3DModel category={d.category} size={32} showLabel={false} />
                  </View>
                  <View style={styles.deviceInfo}>
                    <Text style={[styles.deviceLabel, { color: colors.text }]}>{d.label}</Text>
                    <Text style={[styles.deviceMeta, { color: colors.textSecondary }]}>
                      {d.category} • {d.power.active_watts_typical}W active • {d.power.standby_watts_typical}W standby
                    </Text>
                  </View>
                  {d.is_critical && <Ionicons name="lock-closed" size={16} color="#ff9800" style={styles.criticalBadge} />}
                  <TouchableOpacity onPress={() => handleDeleteDevice(d.id)}>
                    <Ionicons name="close" size={18} color="#ff6b6b" />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add device toggle */}
              {showAddDevice === home.id ? (
                <View style={[styles.addDeviceForm, { borderTopColor: colors.border }]}>
                  <Text style={[styles.formTitle, { color: colors.accent }]}>Add Device</Text>
                  <TextInput style={[styles.input, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0', color: colors.text, borderColor: colors.border }]} placeholder="Label (e.g., Living Room TV)" placeholderTextColor={colors.textSecondary} value={deviceForm.label} onChangeText={(t) => setDeviceForm(f => ({ ...f, label: t }))} />
                  <TextInput style={[styles.input, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0', color: colors.text, borderColor: colors.border }]} placeholder="Category (e.g., TV, Refrigerator)" placeholderTextColor={colors.textSecondary} value={deviceForm.category} onChangeText={(t) => setDeviceForm(f => ({ ...f, category: t }))} />
                  <TextInput style={[styles.input, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0', color: colors.text, borderColor: colors.border }]} placeholder="Brand (optional)" placeholderTextColor={colors.textSecondary} value={deviceForm.brand} onChangeText={(t) => setDeviceForm(f => ({ ...f, brand: t }))} />
                  <TextInput style={[styles.input, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0', color: colors.text, borderColor: colors.border }]} placeholder="Model (optional)" placeholderTextColor={colors.textSecondary} value={deviceForm.model} onChangeText={(t) => setDeviceForm(f => ({ ...f, model: t }))} />
                  <TextInput style={[styles.input, { backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0', color: colors.text, borderColor: colors.border }]} placeholder="Room (e.g., living-room)" placeholderTextColor={colors.textSecondary} value={deviceForm.roomId} onChangeText={(t) => setDeviceForm(f => ({ ...f, roomId: t }))} />
                  <TouchableOpacity
                    style={styles.criticalToggle}
                    onPress={() => setDeviceForm(f => ({ ...f, is_critical: !f.is_critical }))}
                  >
                    <Text style={[styles.criticalToggleText, { color: colors.textSecondary }]}>
                      {deviceForm.is_critical ? <Ionicons name="checkbox" size={18} color={colors.accent} /> : <Ionicons name="square-outline" size={18} color={colors.textSecondary} />} Critical device (don't auto-turn-off)
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.formActions}>
                    <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: isDark ? '#2a2a3e' : '#e0e0e0' }]} onPress={() => setShowAddDevice(null)}>
                      <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, styles.smallBtn, addingDevice && styles.disabledBtn]}
                      onPress={() => handleAddDevice(home.id)}
                      disabled={addingDevice}
                    >
                      {addingDevice ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Add</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={[styles.addDeviceBtn, { borderColor: colors.accent }]} onPress={() => setShowAddDevice(home.id)}>
                  <Text style={[styles.addDeviceBtnText, { color: colors.accent }]}>+ Add Device</Text>
                </TouchableOpacity>
              )}

              {/* Action buttons */}
              <View style={styles.homeActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: isDark ? '#1f1f2e' : '#e8e8e8' }]}
                  onPress={() => onViewSummary(home.id)}
                >
                  <Text style={[styles.actionBtnText, { color: colors.text }]}><Ionicons name="bar-chart-outline" size={14} color={colors.text} /> Summary</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.optimizeBtn]}
                  onPress={() => onViewActions(home.id)}
                >
                  <Text style={[styles.actionBtnText, { color: colors.text }]}><Image source={require('../../assets/gemini.png')} style={{ width: 14, height: 14 }} /> Optimize</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a12' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#12121a',
    borderBottomWidth: 1, borderBottomColor: '#1f1f2e',
  },
  headerBtn: { padding: 8 },
  headerBtnText: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, maxWidth: 600, alignSelf: 'center', width: '100%' },

  createSection: {
    backgroundColor: '#12121a', borderRadius: 16, padding: 20,
    marginBottom: 20, borderWidth: 1, borderColor: '#1f1f2e',
  },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  input: {
    backgroundColor: '#1a1a2e', borderRadius: 10, padding: 14, color: '#fff',
    fontSize: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a3e',
  },
  primaryBtn: {
    backgroundColor: '#4CAF50', paddingVertical: 14, borderRadius: 12, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabledBtn: { opacity: 0.5 },
  smallBtn: { flex: 1 },

  loadingBox: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { color: '#888', fontSize: 14, marginTop: 12 },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: '#666', fontSize: 14, textAlign: 'center' },

  homeCard: {
    backgroundColor: '#12121a', borderRadius: 16, padding: 20,
    marginBottom: 16, borderWidth: 1, borderColor: '#1f1f2e',
  },
  homeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  homeName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  homeRooms: { color: '#888', fontSize: 12, marginTop: 4 },
  deleteBtn: { padding: 8 },

  deviceCount: { color: '#4CAF50', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  deviceRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#1f1f2e', gap: 10,
  },
  deviceIcon: { fontSize: 22 },
  deviceInfo: { flex: 1 },
  deviceLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  deviceMeta: { color: '#888', fontSize: 11, marginTop: 2 },
  criticalBadge: { fontSize: 16 },
  removeDeviceBtn: { color: '#f44336', fontSize: 16, padding: 4 },

  addDeviceForm: {
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1f1f2e',
  },
  formTitle: { color: '#4CAF50', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  criticalToggle: { paddingVertical: 8, marginBottom: 10 },
  criticalToggleText: { color: '#ccc', fontSize: 13 },
  formActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, backgroundColor: '#2a2a3e', paddingVertical: 14, borderRadius: 12, alignItems: 'center',
  },
  cancelBtnText: { color: '#aaa', fontSize: 14, fontWeight: '600' },

  addDeviceBtn: {
    marginTop: 12, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#4CAF50', borderStyle: 'dashed', alignItems: 'center',
  },
  addDeviceBtnText: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },

  homeActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionBtn: {
    flex: 1, backgroundColor: '#1f1f2e', paddingVertical: 12, borderRadius: 10, alignItems: 'center',
  },
  optimizeBtn: { backgroundColor: 'rgba(76, 175, 80, 0.15)' },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
