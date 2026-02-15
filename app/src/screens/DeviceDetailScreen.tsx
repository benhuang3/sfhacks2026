/**
 * DeviceDetailScreen — Full-page device power summary + edit/delete.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Device, RoomModel, getDevice, updateDevice, deleteDevice, researchDevice, ResearchResult, ResearchAlternative, toggleDevice, getDevicePower, LivePower, demoProduct } from '../services/apiClient';
import { useTheme } from '../context/ThemeContext';
import { showAlert, showConfirm } from '../utils/alert';
import { Appliance3DModel } from '../components/Appliance3DModel';
import { DemoCaptureModal } from '../components/DemoCaptureModal';
import { log } from '../utils/logger';

interface DeviceDetailScreenProps {
  device: Device;
  rooms: RoomModel[];
  onBack: () => void;
  onDeviceUpdated: () => void;
}

export function DeviceDetailScreen({ device: initialDevice, rooms, onBack, onDeviceUpdated }: DeviceDetailScreenProps) {
  const { colors, isDark } = useTheme();
  const isFocused = useIsFocused();

  // Live device state — starts from prop, updated by refresh
  const [device, setDevice] = useState<Device>(initialDevice);
  const [refreshing, setRefreshing] = useState(false);
  const power = device.power;

  // Log screen open
  useEffect(() => {
    log.nav('DeviceDetail opened', {
      deviceId: initialDevice.id, label: initialDevice.label, category: initialDevice.category,
      is_smart: initialDevice.is_smart, is_on: initialDevice.is_on, roomId: initialDevice.roomId,
    });
  }, []);

  async function handleRefresh() {
    log.action('Refresh device pressed', { deviceId: device.id, label: device.label });
    try {
      setRefreshing(true);
      const latest = await getDevice(device.id);
      setDevice(latest);
      // Sync edit fields with refreshed data
      setEditLabel(latest.label || '');
      setEditBrand(latest.brand || '');
      setEditModel(latest.model || '');
      setEditRoomId(latest.roomId || '');
      setEditHours(String(latest.active_hours_per_day ?? 4));
      setEditSmart(latest.is_smart ?? false);
      setEditScheduleOn(latest.schedule_on ?? '');
      setEditScheduleOff(latest.schedule_off ?? '');
      setEditIdleTimeout(latest.idle_timeout_minutes != null ? String(latest.idle_timeout_minutes) : '');
      setIsOn(latest.is_on !== false);
      log.action('Device refreshed', { deviceId: device.id, label: latest.label });
    } catch (err) {
      log.error('action', `Refresh failed for ${device.label}`, err);
      showAlert('Error', err instanceof Error ? err.message : 'Failed to refresh device');
    } finally {
      setRefreshing(false);
    }
  }

  const [editLabel, setEditLabel] = useState(device.label || '');
  const [editBrand, setEditBrand] = useState(device.brand || '');
  const [editModel, setEditModel] = useState(device.model || '');
  const [editRoomId, setEditRoomId] = useState(device.roomId || '');
  const [editHours, setEditHours] = useState(String(device.active_hours_per_day ?? 4));
  const [saving, setSaving] = useState(false);
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [researching, setResearching] = useState(false);

  // Smart monitoring state
  const [isOn, setIsOn] = useState(device.is_on !== false);
  const [livePower, setLivePower] = useState<LivePower | null>(null);
  const [editSmart, setEditSmart] = useState(device.is_smart ?? false);
  const [editScheduleOn, setEditScheduleOn] = useState(device.schedule_on ?? '');
  const [editScheduleOff, setEditScheduleOff] = useState(device.schedule_off ?? '');
  const [editIdleTimeout, setEditIdleTimeout] = useState(device.idle_timeout_minutes != null ? String(device.idle_timeout_minutes) : '');
  const [toggling, setToggling] = useState(false);
  const [selectedAlt, setSelectedAlt] = useState<ResearchAlternative | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoImage, setDemoImage] = useState<string | null>(null);
  const [demoModalVisible, setDemoModalVisible] = useState(false);
  const [demoCameraVisible, setDemoCameraVisible] = useState(false);
  const pendingDemoAltRef = React.useRef<ResearchAlternative | null>(null);

  function handleDemoStart(alt: ResearchAlternative) {
    pendingDemoAltRef.current = alt;
    setSelectedAlt(null);          // close product modal first to avoid stacking
    setDemoCameraVisible(true);
  }

  async function handleDemoCapture(photoUri: string, bbox: [number, number, number, number]) {
    setDemoCameraVisible(false);
    const alt = pendingDemoAltRef.current;
    if (!alt) return;
    pendingDemoAltRef.current = null;

    setDemoLoading(true);
    try {
      let scanB64: string;
      if (Platform.OS === 'web') {
        const resp = await fetch(photoUri);
        const blob = await resp.blob();
        scanB64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] || result);
          };
          reader.onerror = () => reject(new Error('Failed to read image'));
          reader.readAsDataURL(blob);
        });
      } else {
        const FileSystem = await import('expo-file-system/legacy');
        scanB64 = await FileSystem.readAsStringAsync(photoUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      const result = await demoProduct({
        scan_image_base64: scanB64,
        bbox,
        alt_brand: alt.brand,
        alt_model: alt.model,
        alt_category: alt.category || device.category,
      });
      setDemoImage(result.demo_image_base64);
      setDemoModalVisible(true);
    } catch (e) {
      log.error('action', 'Demo product failed', e);
      showAlert('Demo Failed', e instanceof Error ? e.message : 'Could not generate demo image.');
    } finally {
      setDemoLoading(false);
    }
  }

  // Live power polling for smart devices (only when screen is focused)
  useEffect(() => {
    if (!device.is_smart || !isFocused) return;
    log.home('Live power polling started', { deviceId: device.id, label: device.label, intervalMs: 3000 });
    let cancelled = false;
    let pollCount = 0;
    const poll = () => {
      getDevicePower(device.id)
        .then(data => {
          if (!cancelled) {
            setLivePower(data);
            setIsOn(data.is_on);
            pollCount++;
            // Log every 10th poll to avoid spam
            if (pollCount % 10 === 1) {
              log.home('Live power reading', { deviceId: device.id, watts: data.current_watts, is_on: data.is_on, pollCount });
            }
          }
        })
        .catch((err) => { log.error('home', `Live power poll failed for ${device.label}`, err); });
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      log.home('Live power polling stopped', { deviceId: device.id, totalPolls: pollCount });
    };
  }, [device.id, device.is_smart, isFocused]);

  const roomName = rooms.find(r => r.roomId === device.roomId)?.name ?? device.roomId ?? 'Unknown room';

  // Auto-fetch research data if brand/model are known (only when screen is focused)
  useEffect(() => {
    if (!isFocused) return;
    const brand = device.brand && device.brand !== 'Unknown' ? device.brand : '';
    const model = device.model && device.model !== 'Unknown' ? device.model : '';
    if (!brand && !model) return;

    let cancelled = false;
    setResearching(true);
    log.api('Research auto-fetch started', { brand: brand || 'Unknown', model: model || 'Unknown', category: device.category });
    researchDevice(brand || 'Unknown', model || 'Unknown', device.category)
      .then(result => {
        if (!cancelled) {
          setResearch(result);
          log.api('Research auto-fetch completed', {
            hasProfile: !!result.power_profile,
            source: result.power_profile?.source,
            alternativesCount: result.alternatives.length,
          });
        }
      })
      .catch(err => { if (!cancelled) log.error('api', 'Research auto-fetch failed', err); })
      .finally(() => { if (!cancelled) setResearching(false); });
    return () => { cancelled = true; };
  }, [device.brand, device.model, device.category, isFocused]);

  function handleResearch() {
    const brand = editBrand || device.brand || 'Unknown';
    const model = editModel || device.model || 'Unknown';
    if (brand === 'Unknown' && model === 'Unknown') return;
    log.action('Research button pressed', { brand, model, category: device.category });
    setResearching(true);
    researchDevice(brand, model, device.category)
      .then(result => {
        setResearch(result);
        log.action('Research completed', {
          hasProfile: !!result.power_profile,
          source: result.power_profile?.source,
          alternativesCount: result.alternatives.length,
        });
      })
      .catch(err => { log.error('action', 'Research button failed', err); })
      .finally(() => setResearching(false));
  }

  async function handleToggle() {
    log.action('Toggle device pressed', { deviceId: device.id, label: device.label, currentState: isOn ? 'on' : 'off' });
    try {
      setToggling(true);
      const updated = await toggleDevice(device.id);
      setIsOn(updated.is_on);
      log.action('Toggle device success', { deviceId: device.id, label: device.label, newState: updated.is_on ? 'on' : 'off' });
    } catch (err) {
      log.error('action', `Toggle failed for ${device.label}`, err);
      showAlert('Error', err instanceof Error ? err.message : 'Failed to toggle device');
    } finally {
      setToggling(false);
    }
  }

  async function handleSave() {
    log.action('Save device pressed', { deviceId: device.id, label: device.label });
    try {
      setSaving(true);
      const updates: Record<string, unknown> = {};
      if (editLabel !== (device.label || '')) updates.label = editLabel;
      if (editBrand !== (device.brand || '')) updates.brand = editBrand;
      if (editModel !== (device.model || '')) updates.model = editModel;
      if (editRoomId !== (device.roomId || '')) updates.roomId = editRoomId;
      const hours = parseFloat(editHours);
      if (!isNaN(hours) && hours !== device.active_hours_per_day) {
        updates.active_hours_per_day = hours;
      }
      // Smart monitoring fields
      if (editSmart !== (device.is_smart ?? false)) updates.is_smart = editSmart;
      const schedOn = editScheduleOn.trim() || null;
      if (schedOn !== (device.schedule_on ?? null)) updates.schedule_on = schedOn;
      const schedOff = editScheduleOff.trim() || null;
      if (schedOff !== (device.schedule_off ?? null)) updates.schedule_off = schedOff;
      const idle = editIdleTimeout.trim() ? parseInt(editIdleTimeout, 10) : null;
      if (idle !== (device.idle_timeout_minutes ?? null)) updates.idle_timeout_minutes = idle;

      const fieldCount = Object.keys(updates).length;
      if (fieldCount > 0) {
        log.action('Saving device updates', { deviceId: device.id, fields: Object.keys(updates), fieldCount });
        await updateDevice(device.id, updates as Partial<Device>);
        log.action('Device saved', { deviceId: device.id, label: editLabel });
      } else {
        log.action('No changes to save', { deviceId: device.id });
      }
      onDeviceUpdated();
      onBack();
    } catch (err) {
      log.error('action', `Save device failed for ${device.label}`, err);
      showAlert('Error', err instanceof Error ? err.message : 'Failed to update device');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    log.action('Delete device pressed', { deviceId: device.id, label: device.label, category: device.category });
    showConfirm(
      'Delete Device',
      `Remove "${device.label || device.category}" from your home?`,
      async () => {
        try {
          setSaving(true);
          log.action('Delete device confirmed', { deviceId: device.id });
          await deleteDevice(device.id);
          log.action('Device deleted', { deviceId: device.id, label: device.label });
          onDeviceUpdated();
          onBack();
        } catch (err) {
          log.error('action', `Delete device failed for ${device.label}`, err);
          showAlert('Error', err instanceof Error ? err.message : 'Failed to delete device');
        } finally {
          setSaving(false);
        }
      },
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#0a0a12' : '#f5f5f5' }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#e0e0e0' }]}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Device Details</Text>
        <TouchableOpacity
          onPress={handleRefresh}
          disabled={refreshing}
          style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#e0e0e0' }]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="refresh" size={20} color={colors.accent} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Device identity */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1a1a2e' : '#fff' }]}>
          <View style={styles.identityRow}>
            <Appliance3DModel category={device.category} size={72} showLabel={false} />
            <View style={styles.identityText}>
              <Text style={[styles.deviceName, { color: colors.text }]}>{device.label || device.category}</Text>
              {(device.brand && device.brand !== 'Unknown') || (device.model && device.model !== 'Unknown') ? (
                <Text style={[styles.deviceSub, { color: colors.textSecondary }]}>
                  {[device.brand !== 'Unknown' && device.brand, device.model !== 'Unknown' && device.model].filter(Boolean).join(' ')}
                </Text>
              ) : null}
              <Text style={[styles.deviceSub, { color: colors.textSecondary }]}>{roomName}</Text>
            </View>
          </View>
        </View>

        {/* Power stats */}
        {power && (
          <View style={[styles.card, { backgroundColor: isDark ? '#1a1a2e' : '#fff' }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Power Usage</Text>
            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: isDark ? 'rgba(76,175,80,0.12)' : '#E8F5E9' }]}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{power.active_watts_typical}W</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Active</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: isDark ? 'rgba(255,152,0,0.12)' : '#FFF3E0' }]}>
                <Text style={[styles.statValue, { color: '#FF9800' }]}>{power.standby_watts_typical}W</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Standby</Text>
              </View>
            </View>
          </View>
        )}

        {/* Smart Device Controls */}
        {device.is_smart && (
          <View style={[styles.card, { backgroundColor: isDark ? '#1a1a2e' : '#fff' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Ionicons name="wifi" size={16} color="#2196F3" />
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0, marginLeft: 8 }]}>
                Smart Controls
              </Text>
              <View style={{ flex: 1 }} />
            </View>

            {/* On/Off Toggle */}
            <TouchableOpacity
              onPress={handleToggle}
              disabled={toggling}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: isOn
                  ? (isDark ? 'rgba(76,175,80,0.15)' : '#E8F5E9')
                  : (isDark ? 'rgba(136,136,136,0.15)' : '#f5f5f5'),
                borderRadius: 14, padding: 16, marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: isOn ? '#4CAF50' : '#888',
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  <Ionicons name="power" size={24} color="#fff" />
                </View>
                <View>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
                    {isOn ? 'On' : 'Off'}
                  </Text>
                  {device.last_toggled_at && (
                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                      Last toggled: {new Date(device.last_toggled_at).toLocaleTimeString()}
                    </Text>
                  )}
                </View>
              </View>
              {toggling ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={{ color: isOn ? '#4CAF50' : '#888', fontSize: 13, fontWeight: '600' }}>
                  Tap to {isOn ? 'turn off' : 'turn on'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Live Power Reading */}
            {livePower && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fafafa',
                borderRadius: 12, padding: 14, marginBottom: 12, gap: 8,
              }}>
                <Ionicons name="flash" size={18} color={isOn ? '#FFB300' : '#666'} />
                <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>
                  {livePower.current_watts}W
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>live</Text>
              </View>
            )}

            {/* Schedule */}
            <View style={{ marginBottom: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>Schedule</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>Auto On</Text>
                  <TextInput
                    style={[styles.input, {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0',
                      color: colors.text, marginBottom: 0,
                    }]}
                    value={editScheduleOn}
                    onChangeText={setEditScheduleOn}
                    placeholder="07:00"
                    placeholderTextColor={isDark ? '#555' : '#aaa'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>Auto Off</Text>
                  <TextInput
                    style={[styles.input, {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0',
                      color: colors.text, marginBottom: 0,
                    }]}
                    value={editScheduleOff}
                    onChangeText={setEditScheduleOff}
                    placeholder="23:00"
                    placeholderTextColor={isDark ? '#555' : '#aaa'}
                  />
                </View>
              </View>
            </View>

            {/* Idle Timeout */}
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                Idle Auto-Off
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={[styles.input, {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0',
                    color: colors.text, flex: 1, marginBottom: 0,
                  }]}
                  value={editIdleTimeout}
                  onChangeText={setEditIdleTimeout}
                  placeholder="Off"
                  placeholderTextColor={isDark ? '#555' : '#aaa'}
                  keyboardType="numeric"
                />
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>minutes</Text>
              </View>
            </View>
          </View>
        )}

        {/* Cost breakdown */}
        {power && (
          <View style={[styles.card, { backgroundColor: isDark ? '#1a1a2e' : '#fff' }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Cost Breakdown</Text>
            <View style={styles.costRow}>
              <Text style={[styles.costLabel, { color: colors.textSecondary }]}>Monthly cost</Text>
              <Text style={[styles.costValue, { color: colors.text }]}>
                ${((power.active_watts_typical * (device.active_hours_per_day ?? 4) + power.standby_watts_typical * (24 - (device.active_hours_per_day ?? 4))) * 30 * 0.30 / 1000).toFixed(2)}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: isDark ? '#333' : '#eee' }]} />
            <View style={styles.costRow}>
              <Text style={[styles.costLabel, { color: colors.textSecondary }]}>Annual cost</Text>
              <Text style={[styles.costValue, { color: colors.text }]}>
                ${((power.active_watts_typical * (device.active_hours_per_day ?? 4) + power.standby_watts_typical * (24 - (device.active_hours_per_day ?? 4))) * 365 * 0.30 / 1000).toFixed(2)}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: isDark ? '#333' : '#eee' }]} />
            <View style={styles.costRow}>
              <Text style={[styles.costLabel, { color: colors.textSecondary }]}>Standby waste/yr</Text>
              <Text style={[styles.costValue, { color: '#FF9800' }]}>
                ${(power.standby_watts_typical * 24 * 365 * 0.30 / 1000).toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {/* Research & Alternatives */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1a1a2e' : '#fff' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
              Energy Alternatives
            </Text>
            <TouchableOpacity
              onPress={handleResearch}
              disabled={researching}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: isDark ? 'rgba(76,175,80,0.15)' : '#E8F5E9',
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
                opacity: researching ? 0.6 : 1,
              }}
            >
              {researching ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="search-outline" size={14} color={colors.accent} />
              )}
              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>
                {researching ? 'Searching...' : 'Research'}
              </Text>
            </TouchableOpacity>
          </View>

          {research && research.alternatives.length > 0 ? (
            research.alternatives.map((alt, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.7}
                onPress={() => setSelectedAlt(alt)}
                style={{
                  paddingVertical: 12,
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: isDark ? '#333' : '#eee',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {/* Product image thumbnail */}
                  {alt.image_base64 ? (
                    <Image
                      source={{ uri: `data:image/png;base64,${alt.image_base64}` }}
                      style={styles.altThumb}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.altThumb, { justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? '#222' : '#f0f0f0' }]}>
                      <Appliance3DModel category={alt.category || device.category} size={32} showLabel={false} />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
                      {alt.brand} {alt.model}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {alt.active_watts_typical}W active
                      {power ? ` vs your ${power.active_watts_typical}W` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: '#4CAF50', fontSize: 15, fontWeight: '800' }}>
                      -${alt.annual_savings_dollars}/yr
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                      {alt.annual_savings_kwh} kWh saved
                    </Text>
                    {alt.energy_star_certified && (
                      <View style={{
                        backgroundColor: '#2196F3', paddingHorizontal: 6, paddingVertical: 1,
                        borderRadius: 6, marginTop: 3,
                      }}>
                        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>ENERGY STAR</Text>
                      </View>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} style={{ marginLeft: 6 }} />
                </View>
              </TouchableOpacity>
            ))
          ) : research && research.alternatives.length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
              No more efficient alternatives found for this device.
            </Text>
          ) : !researching ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
              {device.brand === 'Unknown' && device.model === 'Unknown'
                ? 'Add brand/model info above, then tap Research.'
                : 'Tap Research to find energy-efficient alternatives.'}
            </Text>
          ) : null}

          {research?.power_profile && (
            <View style={{
              marginTop: 12, paddingTop: 12,
              borderTopWidth: 1, borderTopColor: isDark ? '#333' : '#eee',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{
                  backgroundColor: research.power_profile.source === 'energystar_api' ? '#4CAF50' : '#FF9800',
                  paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
                }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                    {research.power_profile.source === 'energystar_api' ? 'ENERGY STAR' : 'AI Research'}
                  </Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                  Researched: {research.power_profile.active_watts_typical}W active, {research.power_profile.standby_watts_typical}W standby
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Edit section */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1a1a2e' : '#fff' }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Edit Device</Text>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Device Name</Text>
          <TextInput
            style={[styles.input, {
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0',
              color: colors.text,
            }]}
            value={editLabel}
            onChangeText={setEditLabel}
            placeholder="e.g. Living Room TV"
            placeholderTextColor={isDark ? '#555' : '#aaa'}
          />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Brand</Text>
          <TextInput
            style={[styles.input, {
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0',
              color: colors.text,
            }]}
            value={editBrand}
            onChangeText={setEditBrand}
            placeholder="e.g. Samsung"
            placeholderTextColor={isDark ? '#555' : '#aaa'}
          />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Model</Text>
          <TextInput
            style={[styles.input, {
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0',
              color: colors.text,
            }]}
            value={editModel}
            onChangeText={setEditModel}
            placeholder="e.g. QN55Q80B"
            placeholderTextColor={isDark ? '#555' : '#aaa'}
          />

          {rooms.length > 0 && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Room</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roomPicker}>
                {rooms.map(room => (
                  <TouchableOpacity
                    key={room.roomId}
                    onPress={() => setEditRoomId(room.roomId)}
                    style={[styles.roomChip, {
                      backgroundColor: editRoomId === room.roomId
                        ? colors.accent
                        : isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0',
                    }]}
                  >
                    <Text style={{
                      color: editRoomId === room.roomId ? '#fff' : colors.textSecondary,
                      fontSize: 13,
                      fontWeight: editRoomId === room.roomId ? '700' : '500',
                    }}>{room.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Active hours/day</Text>
          <TextInput
            style={[styles.input, {
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0',
              color: colors.text,
            }]}
            value={editHours}
            onChangeText={setEditHours}
            placeholder="4"
            placeholderTextColor={isDark ? '#555' : '#aaa'}
            keyboardType="numeric"
          />

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}
            onPress={() => setEditSmart(s => !s)}
          >
            <Ionicons
              name={editSmart ? 'checkbox' : 'square-outline'}
              size={20}
              color={editSmart ? '#2196F3' : colors.textSecondary}
            />
            <Ionicons name="wifi" size={14} color={editSmart ? '#2196F3' : colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              Smart device (remote monitoring)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.deleteBtn, { opacity: saving ? 0.5 : 1 }]}
            disabled={saving}
            onPress={handleDelete}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.accent, opacity: saving ? 0.5 : 1 }]}
            disabled={saving}
            onPress={handleSave}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Product detail modal */}
      <Modal
        visible={selectedAlt !== null || demoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (demoModalVisible) {
            setDemoModalVisible(false);
            setDemoImage(null);
          } else {
            setSelectedAlt(null);
          }
        }}
      >
        <View style={styles.altModalOverlay}>
          <View style={[styles.altModalContent, { backgroundColor: isDark ? '#1a1a2e' : '#fff' }]}>
            {/* Demo result view */}
            {demoModalVisible && demoImage ? (
              <>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>
                  Demo Preview
                </Text>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${demoImage}` }}
                  style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 12, marginBottom: 12 }}
                  resizeMode="contain"
                />
                <TouchableOpacity
                  style={{ backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 40, borderRadius: 10 }}
                  onPress={() => {
                    setDemoModalVisible(false);
                    setDemoImage(null);
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Close</Text>
                </TouchableOpacity>
              </>
            ) : selectedAlt ? (
              <>
                {/* Large product image */}
                {selectedAlt.image_base64 ? (
                  <Image
                    source={{ uri: `data:image/png;base64,${selectedAlt.image_base64}` }}
                    style={styles.altModalImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={[styles.altModalImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? '#222' : '#f0f0f0', borderRadius: 12 }]}>
                    <Appliance3DModel category={selectedAlt.category || device.category} size={100} showLabel={false} />
                  </View>
                )}

                {/* Product name */}
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 12, textAlign: 'center' }}>
                  {selectedAlt.brand} {selectedAlt.model}
                </Text>

                {/* Stats row */}
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 14, marginBottom: 12 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '800' }}>
                      {selectedAlt.active_watts_typical}W
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Active</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: '#4CAF50', fontSize: 22, fontWeight: '800' }}>
                      ${selectedAlt.annual_savings_dollars}/yr
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Savings</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: '#FF9800', fontSize: 22, fontWeight: '800' }}>
                      {selectedAlt.annual_savings_kwh}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>kWh saved</Text>
                  </View>
                </View>

                {selectedAlt.energy_star_certified && (
                  <View style={{ backgroundColor: '#2196F3', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, marginBottom: 12 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>ENERGY STAR Certified</Text>
                  </View>
                )}

                {power && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 12, textAlign: 'center' }}>
                    Your current device uses {power.active_watts_typical}W active
                  </Text>
                )}

                {/* Demo button */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isDark ? '#1a3a1a' : '#e0f2e0',
                    width: '100%', paddingVertical: 12, marginBottom: 8, borderRadius: 10,
                  }}
                  onPress={() => handleDemoStart(selectedAlt)}
                  disabled={demoLoading}
                >
                  {demoLoading ? (
                    <ActivityIndicator size="small" color="#4CAF50" />
                  ) : (
                    <Ionicons name="eye-outline" size={16} color="#4CAF50" />
                  )}
                  <Text style={{ color: '#4CAF50', fontSize: 14, fontWeight: '700', marginLeft: 6 }}>
                    {demoLoading ? 'Generating demo...' : 'Demo in my space'}
                  </Text>
                </TouchableOpacity>

                {/* Close */}
                <TouchableOpacity
                  style={{ backgroundColor: isDark ? '#333' : '#e0e0e0', paddingVertical: 12, paddingHorizontal: 40, borderRadius: 10, marginTop: 4 }}
                  onPress={() => setSelectedAlt(null)}
                >
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Close</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Demo capture camera modal */}
      <DemoCaptureModal
        visible={demoCameraVisible}
        onClose={() => {
          setDemoCameraVisible(false);
          pendingDemoAltRef.current = null;
        }}
        onCapture={handleDemoCapture}
        title="Capture your space"
      />

      {/* Demo loading overlay */}
      <Modal visible={demoLoading} transparent animationType="fade">
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
          justifyContent: 'center', alignItems: 'center',
        }}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 16 }}>
            Generating demo image...
          </Text>
          <Text style={{ color: '#aaa', fontSize: 13, marginTop: 8 }}>
            This may take a moment
          </Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  identityText: {
    marginLeft: 16,
    flex: 1,
  },
  deviceName: {
    fontSize: 22,
    fontWeight: '800',
  },
  deviceSub: {
    fontSize: 14,
    marginTop: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  costLabel: {
    fontSize: 14,
  },
  costValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  divider: {
    height: 1,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    marginBottom: 14,
  },
  roomPicker: {
    marginBottom: 14,
  },
  roomChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    marginRight: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    paddingBottom: Platform.OS === 'ios' ? 16 : 24,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#e53935',
  },
  deleteBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  altThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
  },
  altModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  altModalContent: {
    width: '100%',
    maxHeight: '92%',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  altModalImage: {
    width: '100%',
    height: 250,
    borderRadius: 12,
  },
});
