/**
 * DeviceDetailScreen — Full-page device power summary + edit/delete.
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Device, RoomModel, updateDevice, deleteDevice, researchDevice, ResearchResult } from '../services/apiClient';
import { useTheme } from '../context/ThemeContext';
import { Appliance3DModel } from '../components/Appliance3DModel';
import { log } from '../utils/logger';

interface DeviceDetailScreenProps {
  device: Device;
  rooms: RoomModel[];
  onBack: () => void;
  onDeviceUpdated: () => void;
}

export function DeviceDetailScreen({ device, rooms, onBack, onDeviceUpdated }: DeviceDetailScreenProps) {
  const { colors, isDark } = useTheme();
  const power = device.power;

  const [editLabel, setEditLabel] = useState(device.label || '');
  const [editBrand, setEditBrand] = useState(device.brand || '');
  const [editModel, setEditModel] = useState(device.model || '');
  const [editRoomId, setEditRoomId] = useState(device.roomId || '');
  const [editHours, setEditHours] = useState(String(device.active_hours_per_day ?? 4));
  const [saving, setSaving] = useState(false);
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [researching, setResearching] = useState(false);

  const roomName = rooms.find(r => r.roomId === device.roomId)?.name ?? device.roomId ?? 'Unknown room';

  // Auto-fetch research data if brand/model are known
  useEffect(() => {
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
      .catch(err => { log.error('api', 'Research auto-fetch failed', err); })
      .finally(() => { if (!cancelled) setResearching(false); });
    return () => { cancelled = true; };
  }, [device.brand, device.model, device.category]);

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

  async function handleSave() {
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
      if (Object.keys(updates).length > 0) {
        await updateDevice(device.id, updates as Partial<Device>);
      }
      onDeviceUpdated();
      onBack();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update device');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert(
      'Delete Device',
      `Remove "${device.label || device.category}" from your home?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await deleteDevice(device.id);
              onDeviceUpdated();
              onBack();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete device');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
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
        <View style={{ width: 40 }} />
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
              <View key={i} style={{
                paddingVertical: 12,
                borderTopWidth: i > 0 ? 1 : 0,
                borderTopColor: isDark ? '#333' : '#eee',
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
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
                </View>
              </View>
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
});
